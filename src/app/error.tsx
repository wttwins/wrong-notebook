"use client";

import { useEffect } from "react";

/**
 * 全局错误边界。
 *
 * 为什么需要：
 * 之前完全没有 error.tsx。当客户端 chunk 加载失败（例如服务重新构建后
 * 旧的 /_next/static/chunks/* 已被删除并返回 404）时，React 的 Suspense
 * fallback（首页那句 "Loading..."）会永久停留，页面既不报错也无法恢复，
 * 用户只能看到永远转不完的加载态 —— 极难排查。
 *
 * 这个边界把错误显性化，并提供一个带缓存击穿参数的重载按钮，
 * 让用户（和我）一眼看出发生了什么。
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[AppErrorBoundary]", error);
    }, [error]);

    const isChunkError =
        /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
            error?.message || ""
        );

    const hardReload = () => {
        // 加时间戳强制绕过缓存，避免再次拿到指向已删除 chunk 的旧 HTML
        const url = new URL(window.location.href);
        url.searchParams.set("_r", String(Date.now()));
        window.location.replace(url.toString());
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md space-y-4 rounded-lg border bg-white p-6 text-center shadow-sm">
                <h1 className="text-lg font-semibold text-gray-900">
                    {isChunkError ? "页面资源已更新" : "页面出错了"}
                </h1>
                <p className="text-sm text-gray-600">
                    {isChunkError
                        ? "应用刚更新过，浏览器还持有旧版本文件。点下面的按钮重新加载即可。"
                        : "发生了意外错误。"}
                </p>
                {error?.message && (
                    <pre className="max-h-32 overflow-auto rounded bg-gray-100 p-2 text-left text-xs text-gray-700">
                        {error.message}
                    </pre>
                )}
                <div className="flex flex-col gap-2">
                    <button
                        onClick={hardReload}
                        className="h-11 w-full rounded-md bg-gray-900 px-4 text-sm font-medium text-white"
                    >
                        重新加载
                    </button>
                    <button
                        onClick={reset}
                        className="h-11 w-full rounded-md border bg-white px-4 text-sm font-medium text-gray-900"
                    >
                        重试
                    </button>
                </div>
            </div>
        </div>
    );
}
