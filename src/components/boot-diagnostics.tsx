"use client";

import { useEffect } from "react";

/**
 * 启动诊断上报。
 *
 * 背景：iPad Safari 上出现「页面能显示、但点击毫无反应」——表单退化成原生 GET 提交
 * （密码被写进 URL 查询串），说明 React 从未完成 hydration。而服务端日志里连
 * /api/auth/callback/credentials 的请求都没有，肉眼无法判断 JS 究竟停在哪一步。
 *
 * 这段代码做两件事：
 *   1) 在模块执行的最早时机向 /api/logs/frontend 发一条 "JS alive" 心跳
 *      —— 日志里若看不到它，说明 JS 根本没执行；
 *   2) 捕获 window error / unhandledrejection / 资源加载失败，上报真实报错。
 *
 * 仅在页面加载时打一次，开销可忽略；上线后可作为长期观测手段保留。
 */
export function BootDiagnostics() {
    useEffect(() => {
        // 供 layout 里的原生钩子在 window.load 时判断 hydration 是否完成
        (window as unknown as { __reactHydrated?: boolean }).__reactHydrated = true;

        const ua = navigator.userAgent;
        const report = (level: "info" | "error", message: string, context: Record<string, unknown> = {}) => {
            try {
                fetch("/api/logs/frontend", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    keepalive: true,
                    body: JSON.stringify({
                        level,
                        prefix: "[boot]",
                        message,
                        context: { ua, ...context },
                        timestamp: new Date().toISOString(),
                        url: location.href,
                    }),
                }).catch(() => { });
            } catch {
                /* 上报失败不能影响主流程 */
            }
        };

        // 心跳：能走到这里说明 React 已挂载（hydration 完成）
        report("info", "JS alive: React hydrated", {
            secureContext: window.isSecureContext,
            hasCryptoSubtle: !!(window.crypto && window.crypto.subtle),
            readyState: document.readyState,
        });

        // 把 layout 里「早于任何 chunk」的钩子捕获到的错误一并上报
        try {
            const early = (window as unknown as { __bootErrors?: unknown[] }).__bootErrors;
            if (Array.isArray(early) && early.length > 0) {
                report("error", "early-hook captured " + early.length + " event(s)", {
                    events: early.slice(0, 10),
                });
            }
        } catch {
            /* 忽略 */
        }

        const onError = (e: ErrorEvent) => {
            const target = e.target as HTMLElement | null;
            const src = target && (target as HTMLScriptElement).src;
            report("error", "window.onerror: " + (e.message || "(no message)"), {
                src: src || "",
                filename: e.filename || "",
                lineno: e.lineno,
                colno: e.colno,
                stack: (e.error && e.error.stack ? String(e.error.stack) : "").slice(0, 600),
            });
        };

        const onRejection = (e: PromiseRejectionEvent) => {
            const r = e.reason;
            report("error", "unhandledrejection: " + (r && r.message ? r.message : String(r)).slice(0, 300), {
                stack: (r && r.stack ? String(r.stack) : "").slice(0, 600),
            });
        };

        // capture=true 才能捕获 <script> 资源加载失败（不会冒泡）
        window.addEventListener("error", onError, true);
        window.addEventListener("unhandledrejection", onRejection);

        return () => {
            window.removeEventListener("error", onError, true);
            window.removeEventListener("unhandledrejection", onRejection);
        };
    }, []);

    return null;
}
