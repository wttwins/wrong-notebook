import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { BootDiagnostics } from "@/components/boot-diagnostics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/**
 * 早期诊断钩子（自包含，不依赖 React / Next 运行时）。
 *
 * 背景：iPad Safari 上「点击登录毫无反应」，表单退化为原生 GET 提交，
 * 说明 React 从未 hydration；但静态检查已排除语法与 API 兼容问题。
 * 必须拿到浏览器内的真实报错。
 *
 * 教训：不要用 next/script 的 beforeInteractive 做这件事 —— 它只是把脚本
 * push 进 self.__next_s 队列，要等 Next 运行时加载后才执行；运行时一挂，
 * 诊断代码也就跟着不跑，等于什么都没测。
 * 这里用原生 <script> 内联执行，自行 postMessage 到 /api/logs/frontend。
 */
const EARLY_ERROR_HOOK = `
(function(){
  var LOGURL = '/api/logs/frontend';
  window.__bootErrors = [];
  function send(level, message, ctx){
    try{
      var payload = JSON.stringify({
        level: level, prefix: '[boot]', message: message,
        context: ctx || {}, timestamp: new Date().toISOString(), url: location.href
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(LOGURL, new Blob([payload], {type:'application/json'}));
      } else {
        fetch(LOGURL, { method:'POST', headers:{'Content-Type':'application/json'}, body: payload, keepalive:true }).catch(function(){});
      }
    }catch(e){}
  }
  function push(o){ try{ if(window.__bootErrors.length<20) window.__bootErrors.push(o); }catch(e){} }

  // 第一条：证明 JS 在 HTML 解析阶段就已执行
  send('info', 'inline-hook executed (parser stage)', {
    ua: navigator.userAgent.slice(0,160),
    readyState: document.readyState
  });

  window.addEventListener('error', function(e){
    var t = e.target;
    var info = {
      t:'error',
      msg: e && e.message ? String(e.message) : '',
      src: t && t.src ? String(t.src) : '',
      tag: t && t.tagName ? String(t.tagName) : '',
      line: e && e.lineno ? e.lineno : 0,
      stack: e && e.error && e.error.stack ? String(e.error.stack).slice(0,700) : ''
    };
    push(info);
    send('error', 'window error: ' + (info.msg || info.src || info.tag), info);
  }, true);

  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    var info = { t:'rejection', msg: r && r.message ? String(r.message) : String(r), stack: r && r.stack ? String(r.stack).slice(0,700) : '' };
    push(info);
    send('error', 'unhandledrejection: ' + info.msg.slice(0,200), info);
  });

  // 页面 load 后回报 hydration 是否完成
  window.addEventListener('load', function(){
    setTimeout(function(){
      send(window.__reactHydrated ? 'info' : 'warn',
        window.__reactHydrated ? 'hydration OK' : 'hydration NOT completed',
        { hydrated: !!window.__reactHydrated, errors: window.__bootErrors.slice(0,5) });
    }, 2500);
  });
})();
`;

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "AI智能错题本",
  description: "基于AI的智能错题管理系统，帮助学生高效整理、分析和复习错题",
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '智能错题本',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/icons/icon.png',
    apple: '/icons/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        {/*
          必须用「原生内联 script」而不是 next/script 的 beforeInteractive。
          原因（实测踩坑）：beforeInteractive 并不会在 HTML 解析时立即执行，
          它只是把内容 push 进 self.__next_s 队列，等 Next.js 运行时 chunk
          加载后才创建 <script> 执行。一旦运行时本身加载/执行失败，
          诊断代码同样不会跑 —— 日志里一条都没有，无法自证。

          原生 <script> 由 HTML 解析器直接执行，不依赖运行时。
        */}
        <script dangerouslySetInnerHTML={{ __html: EARLY_ERROR_HOOK }} />
        <BootDiagnostics />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
