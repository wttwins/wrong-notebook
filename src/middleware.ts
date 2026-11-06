import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger('middleware');

export async function middleware(req: NextRequest) {
    // Debug logging for middleware
    logger.debug({ method: req.method, path: req.nextUrl.pathname }, 'Processing request');

    try {
        const token = await getToken({
            req,
            secret: process.env.NEXTAUTH_SECRET,
            // 会话 Cookie 名固定为无前缀版本（见 src/lib/auth.ts 的 cookies 配置）。
            // 必须显式指定这两个参数：否则当 NEXTAUTH_URL 为 https 时，
            // getToken 会去找 __Secure-next-auth.session-token，
            // 与实际下发的 next-auth.session-token 不匹配 → 登录后立刻被踢回登录页。
            cookieName: "next-auth.session-token", // Explicitly look for the standardized cookie
            secureCookie: false,
        });

        const isAuth = !!token;
        const isAuthPage = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/register");
        const isAdminPage = req.nextUrl.pathname.startsWith("/admin");

        logger.debug({
            path: req.nextUrl.pathname,
            isAuth,
            isAuthPage,
            hasToken: !!token,
            cookies: req.cookies.getAll().map(c => c.name)
        }, 'Auth status');

        if (isAuthPage) {
            if (isAuth) {
                logger.debug('Redirecting authenticated user to /');
                return NextResponse.redirect(new URL("/", req.url));
            }
            return null;
        }

        if (!isAuth) {
            let from = req.nextUrl.pathname;
            if (req.nextUrl.search) {
                from += req.nextUrl.search;
            }

            logger.debug({ callbackUrl: from }, 'Redirecting unauthenticated user to login');
            return NextResponse.redirect(
                new URL(`/login?callbackUrl=${encodeURIComponent(from)}`, req.url)
            );
        }

        // Admin route protection: only allow users with admin role
        if (isAdminPage && token?.role !== "admin") {
            logger.warn({ userId: token?.id, path: req.nextUrl.pathname }, 'Non-admin user attempting to access admin area');
            return NextResponse.redirect(new URL("/", req.url));
        }
    } catch (e) {
        logger.error({ error: e }, 'Error processing token');
        return NextResponse.next();
    }
}

export const config = {
    matcher: [
        /*
         * 排除以下路径，不做登录校验：
         * - api             接口自行鉴权
         * - _next/static    构建产物
         * - _next/image     图片优化
         * - favicon.ico / icons / manifest.webmanifest / robots.txt
         *   这些是浏览器/爬虫直接取用的静态资源，之前 manifest 被拦截会导致
         *   PWA 安装信息获取失败，且每次页面加载都产生一条无意义的
         *   「Redirecting unauthenticated user to login」日志。
         */
        "/((?!api|_next/static|_next/image|favicon\\.ico|icons/|manifest\\.webmanifest|robots\\.txt).*)",
    ],
};
