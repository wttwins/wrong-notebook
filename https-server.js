/**
 * HTTPS wrapper for Next.js standalone server
 * 
 * 使用方法:
 * 1. 生成证书放到 /app/certs/ 目录
 * 2. 设置环境变量 HTTPS_ENABLED=true
 * 3. 容器会自动使用 HTTPS
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CERT_DIR = process.env.CERT_DIR || '/app/certs';
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE = path.join(CERT_DIR, 'key.pem');

// 超时配置（毫秒）- 与 AI 分析超时保持一致
const PROXY_TIMEOUT = 300000; // 5 分钟，足够 AI 分析 + 重试

// 检查证书是否存在
if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) {
    console.error('[HTTPS] 证书文件不存在:', CERT_DIR);
    console.error('[HTTPS] 请确保 cert.pem 和 key.pem 存在于该目录');
    process.exit(1);
}

// 读取证书
const options = {
    key: fs.readFileSync(KEY_FILE),
    cert: fs.readFileSync(CERT_FILE),
};

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`[HTTPS] 启动 HTTPS 代理，端口 443 -> HTTP ${port}`);
console.log(`[HTTPS] 代理超时设置: ${PROXY_TIMEOUT / 1000} 秒`);

const httpsServer = https.createServer(options, (req, res) => {
    const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: req.url,
        method: req.method,
        headers: {
            ...req.headers,
            // 确保 Host 头正确
            host: req.headers.host || `127.0.0.1:${port}`,
        },
        // 设置代理请求超时
        timeout: PROXY_TIMEOUT,
    }, (proxyRes) => {
        // 复制响应头
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        // 流式传输响应体
        proxyRes.pipe(res);
    });

    // 设置客户端连接超时
    req.setTimeout(PROXY_TIMEOUT);
    res.setTimeout(PROXY_TIMEOUT);

    // 代理请求超时处理
    proxyReq.on('timeout', () => {
        console.error('[HTTPS] 代理请求超时');
        proxyReq.destroy();
        if (!res.headersSent) {
            res.writeHead(504);
            res.end('Gateway Timeout');
        }
    });

    // 代理错误处理
    proxyReq.on('error', (err) => {
        console.error('[HTTPS] 代理错误:', err.message);
        if (!res.headersSent) {
            res.writeHead(502);
            res.end('Bad Gateway');
        }
    });

    // 客户端断开连接时，终止代理请求
    req.on('close', () => {
        proxyReq.destroy();
    });

    // 将请求体转发到代理
    req.pipe(proxyReq);
});

// 服务器级别超时配置
httpsServer.timeout = PROXY_TIMEOUT;
httpsServer.keepAliveTimeout = 65000; // 65 秒 Keep-Alive
httpsServer.headersTimeout = 66000;   // 略大于 keepAliveTimeout

const httpsPort = parseInt(process.env.HTTPS_PORT || '443', 10);

httpsServer.listen(httpsPort, '0.0.0.0', () => {
    console.log(`[HTTPS] HTTPS 服务器已启动，监听端口 ${httpsPort}`);
});
