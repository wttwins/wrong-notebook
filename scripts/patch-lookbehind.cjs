#!/usr/bin/env node
/**
 * 移除 mdast-util-gfm-autolink-literal 中的后行断言（lookbehind）。
 *
 * 问题：
 *   lib/index.js 里的邮箱自动链接正则使用了后行断言
 *     /(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu
 *   后行断言需要 Safari 16.4+。在 Safari 16.3 及更早版本上，
 *   该正则会在**解析阶段**抛 SyntaxError：
 *     "Invalid regular expression: invalid group specifier name"
 *   由于它在一个 345KB 的共享 chunk 里，整个 chunk 解析失败、
 *   其中的代码全部不执行 —— 应用表现为白屏或点击无反应。
 *
 *   实际现象（iPadOS Safari 16.3 实测）：
 *     登录页能显示（服务端渲染），但点登录无任何反应；
 *     表单退化成原生 GET 提交，密码被写进 URL。
 *
 * 为什么可以安全删除：
 *   findEmail 函数内部已经调用了 previous(match, true)，
 *   其判断条件（字符串开头 || unicodeWhitespace || unicodePunctuation）
 *   与 lookbehind 完全等价，并且额外排除了斜杠。
 *   删掉 lookbehind 后，捕获组编号不变（1=本地部分, 2=域名部分），
 *   非法前导字符仍会被 previous() 拒绝。
 *
 * 幂等：可重复执行。
 */

const fs = require('fs');
const path = require('path');

const LOOKBEHIND = '/(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu';
const REPLACEMENT = '/([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu';

const candidates = [
  'mdast-util-gfm-autolink-literal/lib/index.js',
  'mdast-util-gfm-autolink-literal/lib/index.cjs',
  'mdast-util-gfm-autolink-literal/index.js',
];

let patched = 0;
let checked = 0;

for (const rel of candidates) {
  const file = path.join(process.cwd(), 'node_modules', rel);
  if (!fs.existsSync(file)) continue;
  checked++;

  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('(?<=')) {
    console.log(`[patch-lookbehind] 已修复或无需修复: ${rel}`);
    continue;
  }
  if (!src.includes(LOOKBEHIND)) {
    console.warn(`[patch-lookbehind] 警告: ${rel} 含 lookbehind 但格式不匹配，跳过`);
    continue;
  }

  const out = src.split(LOOKBEHIND).join(REPLACEMENT);
  fs.writeFileSync(file, out, 'utf8');
  patched++;
  console.log(`[patch-lookbehind] 已修复: ${rel}`);
}

if (checked === 0) {
  console.log('[patch-lookbehind] 未找到 mdast-util-gfm-autolink-literal（可能未安装），跳过');
} else if (patched === 0) {
  console.log('[patch-lookbehind] 无需修改');
}

// 说明：这里不再做 node_modules 全量扫描 —— 目录很大（数百 MB），
// 逐个读文件会导致构建时这一步耗时数分钟，收益却很低。
// 需要校验时请直接检查目标文件是否仍包含 '(?<=^|\s|\p{P}|\p{S})'。
if (patched > 0) {
  console.log('[patch-lookbehind] 完成');
}
