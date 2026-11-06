import type { NextConfig } from "next";

/**
 * 从 URL 提取主机名（不含端口）。
 * 用于自动放行隧道/反向代理域名，避免每次换隧道地址都要改这里。
 */
function hostnameOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Next.js 16 的 dev 服务器默认只信任 localhost。
 * 经 Cloudflare 隧道（或任何反向代理）访问时，浏览器发往 /_next/* 的请求
 * 会被判定为「跨源」，导致前端资源加载失败 —— 表现为页面能开但点登录没反应。
 * 日志中的告警：
 *   ⚠ Cross origin request detected from <host> to /_next/* resource.
 *
 * 这里从 NEXTAUTH_URL 自动推导出隧道域名，无需手工维护。
 * （NEXTAUTH_URL 是登录功能本身就必需的，所以它一定填写正确。）
 */
const devOrigins = [hostnameOf(process.env.NEXTAUTH_URL)].filter(
  (h): h is string => Boolean(h)
);

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  // 允许经隧道域名访问 dev 资源；留空时行为与原先一致（仅 localhost）
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),

  /**
   * 缓存策略：HTML 文档不缓存，哈希化静态资源长缓存。
   *
   * 背景（实测踩过的坑）：
   * Next.js 对静态页面默认下发 `Cache-Control: s-maxage=31536000`
   * （一年）。而每次重新构建，/_next/static/chunks/* 的文件名哈希都会变、
   * 旧文件被删除。
   *
   * 于是浏览器若缓存了旧 HTML，它引用的旧 chunk 全部 404，
   * 页面 JS 完全无法执行 —— 表现为「页面能打开，但点登录毫无反应、
   * 连错误提示都没有」。iPad Safari 缓存 HTML 尤为激进，该问题在
   * iPhone/iPad 上最明显，桌面浏览器往往因为强刷而掩盖了它。
   *
   * 正确做法：文档类响应不缓存（必须每次拿最新 HTML，才能拿到新的
   * chunk 地址）；/_next/static/* 属于内容哈希文件名，可安全长缓存。
   */
  async headers() {
    return [
      {
        // 排除 API（鉴权响应有自己的缓存语义）与静态资源
        source: '/:path((?!api|_next/static|_next/image|favicon.ico).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
