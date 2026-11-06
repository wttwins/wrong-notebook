/**
 * 安全回归验证脚本
 *
 * 用法：
 *   TEST_BASE=http://127.0.0.1:3600 \
 *   ADMIN_EMAIL=admin@localhost ADMIN_PW=*** \
 *   USER_EMAIL=user@localhost  USER_PW=*** \
 *   node scripts/security-check.js
 *
 * 说明：需要一个管理员账号与一个普通用户账号（用于验证越权与权限隔离）。
 * 全部用例只读取数据；唯一的写操作是「本人改自己的笔记」，会写回原值。
 */
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3600';

// 极简 cookie jar
class Jar {
  constructor() { this.cookies = new Map(); }
  update(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
}

async function req(jar, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (jar) {
    const ch = jar.header();
    if (ch) headers['Cookie'] = ch;
  }
  const res = await fetch(BASE + path, { ...opts, headers, redirect: 'manual' });
  if (jar) jar.update(res);
  return res;
}

async function login(email, password) {
  const jar = new Jar();
  const csrfRes = await req(jar, '/api/auth/csrf');
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({ email, password, csrfToken, callbackUrl: BASE + '/', json: 'true' });
  const res = await req(jar, '/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const sess = await (await req(jar, '/api/auth/session')).json();
  return { jar, ok: !!sess?.user, status: res.status, user: sess?.user };
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? '  —— ' + detail : ''}`);
}

(async () => {
  console.log('=== 目标: ' + BASE + ' ===\n');

  // ---------- 1. 未授权访问 ----------
  console.log('【1】未鉴权接口应被拒绝');
  for (const [path, expect] of [
    ['/api/tags/stats', 401],
    ['/api/ai/models?provider=openai&apiKey=x', 401],
    ['/api/settings', 401],
    ['/api/error-items/list', 401],
    ['/api/user', 401],
  ]) {
    const r = await req(null, path);
    check(`${path} -> ${r.status}`, r.status === expect, `期望 ${expect}`);
  }

  // ---------- 2. 日志接口限制 ----------
  console.log('\n【2】日志接口体积限制（期望 413）');
  const big = JSON.stringify({ message: 'A'.repeat(40000) });
  const rBig = await req(null, '/api/logs/frontend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: big,
  });
  check(`超大请求体 -> ${rBig.status}`, rBig.status === 413, '期望 413');

  const many = JSON.stringify({ logs: Array.from({ length: 50 }, () => ({ level: 'info', message: 'x' })) });
  const rMany = await req(null, '/api/logs/frontend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: many,
  });
  check(`超条数 -> ${rMany.status}`, rMany.status === 413, '期望 413');

  const normalLog = JSON.stringify({ level: 'info', prefix: '[selftest]', message: 'normal', timestamp: new Date().toISOString(), url: BASE });
  const rNormal = await req(null, '/api/logs/frontend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: normalLog,
  });
  const rnJson = await rNormal.json().catch(() => ({}));
  check(`正常请求 -> ${rNormal.status} ${JSON.stringify(rnJson)}`, rNormal.status === 200 && rnJson.success === true, '期望 200 + success');

  // ---------- 3. 登录 ----------
  console.log('\n【3】登录与角色');
  const admin = await login(process.env.ADMIN_EMAIL || 'admin@localhost', process.env.ADMIN_PW || '123456');
  check(`admin 登录 (role=${admin.user?.role || '?'})`, admin.ok, `HTTP ${admin.status}`);

  const normal = await login(process.env.USER_EMAIL || 'user@localhost', process.env.USER_PW || '123456');
  check(`普通用户登录 (role=${normal.user?.role || '?'})`, normal.ok, `HTTP ${normal.status}`);

  if (!admin.ok || !normal.ok) {
    console.log('\n登录失败，后续用例无法执行。请检查账号密码。');
    return;
  }

  // ---------- 4. SSRF ----------
  console.log('\n【4】SSRF：自定义 baseUrl 权限与地址过滤');

  // 测试用的外网地址与内网地址均可通过环境变量覆盖，
  // 默认值仅为示例，不含任何真实环境信息。
  const PUBLIC_TARGET  = process.env.PUBLIC_TARGET  || 'https://api.example.com/v1';
  const PRIVATE_TARGET = process.env.PRIVATE_TARGET || 'https://192.168.1.100:3000';

  const rUserCustom = await req(normal.jar, '/api/ai/models?provider=openai&apiKey=x&baseUrl=' + encodeURIComponent(PUBLIC_TARGET));
  check(`普通用户指定 baseUrl -> ${rUserCustom.status}`, rUserCustom.status === 403, '期望 403');

  const rAdminLoopback = await req(admin.jar, '/api/ai/models?provider=openai&apiKey=x&baseUrl=http://127.0.0.1:3000');
  const loopBody = await rAdminLoopback.json().catch(() => ({}));
  check(`管理员指定 127.0.0.1 -> ${rAdminLoopback.status} ${loopBody.error || ''}`, rAdminLoopback.status === 400, '期望 400');

  const rAdminPrivate = await req(admin.jar, '/api/ai/models?provider=openai&apiKey=x&baseUrl=' + encodeURIComponent(PRIVATE_TARGET));
  check(`管理员指定私有网段 -> ${rAdminPrivate.status}`, rAdminPrivate.status === 400, '期望 400');

  const rAdminPublic = await req(admin.jar, '/api/ai/models?provider=openai&apiKey=x&baseUrl=' + encodeURIComponent(PUBLIC_TARGET));
  check(`管理员指定公网域名 -> ${rAdminPublic.status}`, rAdminPublic.status === 200, '期望 200（放行）');

  // ---------- 5. IDOR ----------
  console.log('\n【5】越权（IDOR）：跨用户访问错题');
  const listRes = await req(admin.jar, '/api/error-items/list?limit=1');
  const listJson = await listRes.json().catch(() => ({}));
  const adminItem = (listJson.items || listJson.errorItems || listJson.data || [])[0];
  console.log(`  admin 的错题样本: ${adminItem ? adminItem.id : '(无数据，跳过该组)'}`);

  if (adminItem) {
    const rNotes = await req(normal.jar, `/api/error-items/${adminItem.id}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userNotes: 'HACKED-BY-OTHER-USER' }),
    });
    check(`普通用户改 admin 的笔记 -> ${rNotes.status}`, rNotes.status === 404, '期望 404');

    const rPractice = await req(normal.jar, '/api/practice/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorItemId: adminItem.id, language: 'zh' }),
    });
    check(`普通用户用 admin 错题生成同类题 -> ${rPractice.status}`, rPractice.status === 404, '期望 404');

    // 本人操作应正常
    const rOwn = await req(admin.jar, `/api/error-items/${adminItem.id}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userNotes: adminItem.userNotes ?? '' }),
    });
    check(`本人改自己的笔记 -> ${rOwn.status}`, rOwn.status === 200, '期望 200');
  }

  // ---------- 6. 数据隔离 ----------
  console.log('\n【6】标签统计只返回本人数据');
  const rStatsA = await req(admin.jar, '/api/tags/stats');
  const statsA = await rStatsA.json().catch(() => ({}));
  const rStatsB = await req(normal.jar, '/api/tags/stats');
  const statsB = await rStatsB.json().catch(() => ({}));
  check(`admin 统计 -> ${rStatsA.status}, total=${statsA.total}`, rStatsA.status === 200);
  check(`普通用户统计 -> ${rStatsB.status}, total=${statsB.total}`, rStatsB.status === 200);
  check(`两者数据不同（隔离生效）`, statsA.total !== statsB.total, `admin=${statsA.total} user=${statsB.total}`);

  // ---------- 7. 正常功能 ----------
  console.log('\n【7】正常功能未被破坏');
  const rList = await req(admin.jar, '/api/error-items/list');
  const listOk = rList.status === 200;
  check(`错题列表 -> ${rList.status}`, listOk);
  const rNotebooks = await req(admin.jar, '/api/notebooks');
  check(`错题本列表 -> ${rNotebooks.status}`, rNotebooks.status === 200);
  const rUser = await req(admin.jar, '/api/user');
  const userJson = await rUser.json().catch(() => ({}));
  check(`当前用户信息 -> ${rUser.status}`, rUser.status === 200 && !!userJson.email);
  check(`用户信息不含密码字段`, !('password' in userJson), JSON.stringify(Object.keys(userJson)));
  const rSettings = await req(admin.jar, '/api/settings');
  check(`管理员读配置 -> ${rSettings.status}`, rSettings.status === 200);
  const rSettingsForbidden = await req(normal.jar, '/api/settings');
  check(`普通用户读配置 -> ${rSettingsForbidden.status}`, rSettingsForbidden.status === 403, '期望 403');

  // ---------- 汇总 ----------
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log('\n============================================');
  console.log(`  总计 ${results.length} 项：通过 ${passed}，失败 ${failed}`);
  console.log('============================================');
  if (failed > 0) {
    console.log('\n失败项：');
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.name}  ${r.detail || ''}`));
    process.exitCode = 1;
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });
