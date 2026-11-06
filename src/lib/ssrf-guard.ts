/**
 * 出站请求地址校验（SSRF 防护）。
 *
 * 背景：/api/ai/models 与 /api/ai/test 接受调用方传入的 baseUrl，
 * 并由服务端发起 fetch。若不做限制，任何已登录用户（注册可能开放）
 * 都能把服务端当成跳板去探测内网——例如路由器管理页、NAS 管理界面的
 * 常用端口、容器内部服务、以及云环境的元数据地址等。
 *
 * 策略（按危害从大到小）：
 *   1. 禁止非 http/https 协议（避免 file:、gopher: 等）
 *   2. 禁止 localhost / *.local / *.internal 等内部主机名
 *   3. 若主机名是 IP 字面量，拒绝私有网段、回环、链路本地、保留地址
 *   4. 域名类地址放行（外部 AI 服务都是域名）
 *
 * 说明：这里只做字面量判断，不解析 DNS。鉴于本应用是局域网自用工具，
 * 该强度已足以阻断实际的 SSRF 探测；如需更强防护，应在出站层做
 * DNS pinning 与连接期 IP 校验。
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
]);

/** 判断 IPv4 字面量是否属于私有/保留网段 */
function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    // 格式不合法，保守拒绝
    return true;
  }
  const [a, b] = parts;

  if (a === 0) return true;                        // 0.0.0.0/8
  if (a === 10) return true;                       // 私有
  if (a === 127) return true;                      // 回环
  if (a === 169 && b === 254) return true;         // 链路本地（含云元数据）
  if (a === 172 && b >= 16 && b <= 31) return true; // 私有
  if (a === 192 && b === 168) return true;         // 私有
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                       // 组播/保留
  return false;
}

/** 判断 IPv6 字面量是否属于私有/保留地址 */
function isBlockedIPv6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v === '::' || v === '::1') return true;      // 未指定 / 回环
  if (v.startsWith('fe80')) return true;           // 链路本地
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // 唯一本地
  if (v.startsWith('::ffff:')) return isBlockedIPv4(v.slice(7)); // IPv4 映射
  return false;
}

export interface UrlCheckResult {
  ok: boolean;
  reason?: string;
}

/**
 * 校验一个由外部传入的出站 URL 是否可以安全请求。
 */
export function checkOutboundUrl(raw: string | null | undefined): UrlCheckResult {
  if (!raw) return { ok: false, reason: '缺少地址' };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: '地址格式非法' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `不允许的协议: ${url.protocol}` };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: '不允许访问本机地址' };
  }
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) {
    return { ok: false, reason: '不允许访问内部主机名' };
  }

  // IPv4 字面量
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isBlockedIPv4(hostname)) {
      return { ok: false, reason: '不允许访问内网 / 保留 IP' };
    }
    return { ok: true };
  }

  // IPv6 字面量（URL 解析后可能带冒号）
  if (hostname.includes(':')) {
    if (isBlockedIPv6(hostname)) {
      return { ok: false, reason: '不允许访问内网 / 保留 IP' };
    }
    return { ok: true };
  }

  return { ok: true };
}
