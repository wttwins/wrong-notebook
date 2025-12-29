# 屏幕截图功能配置指南

屏幕截图功能依赖浏览器的 `getDisplayMedia()` API，该 API 要求**安全上下文（HTTPS 或 localhost）**才能使用。

本文档介绍如何在不同部署环境下启用屏幕截图功能。

## 📋 方案速查

| 场景 | 推荐方案 | 复杂度 |
|------|---------|--------|
| **局域网 + 1-2 台设备** | [浏览器安全例外](#方案零浏览器安全例外) | ⭐ 最简单 |
| **局域网 + 多设备** | [内置 HTTPS（自动证书）](#方案一内置-https推荐) | ⭐⭐ 推荐 |
| **公网 + 域名** | [内置 HTTPS + certbot](#公网部署) | ⭐⭐ |

---

## 方案零：浏览器安全例外

**适用场景**：局域网 + 只有 1-2 台设备访问

**原理**：在浏览器设置中将局域网地址标记为"安全源"，无需服务器配置。

### Chrome / Edge

1. 地址栏输入：
   ```
   chrome://flags/#unsafely-treat-insecure-origin-as-secure
   ```

2. 在文本框中输入（包含端口）：
   ```
   http://192.168.1.100:3000
   ```

3. 下拉选择 **Enabled** → 点击 **Relaunch**

4. 刷新页面，屏幕截图按钮应该出现了 ✅

### Firefox

1. 地址栏输入 `about:config`
2. 搜索 `media.devices.insecure.enabled`
3. 设置为 `true`

### 限制

- ❌ 每台设备都需要单独配置
- ❌ iOS Safari 不支持此方法

---

## 方案一：内置 HTTPS（推荐）

**适用场景**：局域网多设备访问，或需要 iOS 支持

应用内置 HTTPS 代理，**容器启动时自动生成自签名证书**，无需手动操作。

### 快速开始

1. **修改配置文件**

```yaml
# docker-compose.https.yml
services:
  wrong-notebook:
    ports:
      - "443:443"           # HTTPS 端口
    environment:
      - HTTPS_ENABLED=true
      - CERT_DOMAIN=YOUR_IP_OR_DOMAIN  # 替换为你的 IP 或域名
      - NEXTAUTH_URL=https://YOUR_IP_OR_DOMAIN
      - NEXTAUTH_SECRET=your_secret_key
      - AUTH_TRUST_HOST=true
    volumes:
      - ./certs:/app/certs  # 证书持久化
```

2. **启动**

```bash
docker-compose -f docker-compose.https.yml up -d
```

3. **验证**

```bash
# 查看证书是否生成
docker logs wrong-notebook | grep -i cert
# 输出: [Entrypoint] 自签名证书生成成功: CN=YOUR_IP_OR_DOMAIN
```

4. **访问**

打开 `https://YOUR_IP_OR_DOMAIN`，首次访问点击"高级 → 继续"即可。

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `HTTPS_ENABLED` | 是 | - | 设为 `true` 启用 HTTPS |
| `CERT_DOMAIN` | 否 | `localhost` | 证书的 CN（你的 IP 或域名） |
| `NEXTAUTH_URL` | 是 | - | 完整访问地址 |
| `AUTH_TRUST_HOST` | 是 | - | 设为 `true` |
| `HTTPS_PORT` | 否 | `443` | HTTPS 监听端口 |

### 使用自定义证书

如果有自己的证书（如 Let's Encrypt），放入 `./certs` 目录：

```
certs/
├── cert.pem    # 证书
└── key.pem     # 私钥
```

容器启动时会自动检测并使用已有证书，不会重新生成。

### 公网部署

公网部署建议使用 Let's Encrypt 证书：

```bash
# 1. 安装 certbot 并获取证书
sudo apt install certbot
sudo certbot certonly --standalone -d your-domain.com

# 2. 复制证书到项目目录
mkdir -p certs
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem certs/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem certs/key.pem
sudo chown $USER:$USER certs/*

# 3. 修改 NEXTAUTH_URL 和 CERT_DOMAIN 为你的域名
# 4. 启动
docker-compose -f docker-compose.https.yml up -d
```

> 注意：Let's Encrypt 证书需要定期续期，可配置 cron 任务自动更新。

---

## 常见问题

### Q: 证书过期了怎么办？

**自签名证书**：删除 `./certs` 目录后重启容器，会自动生成新证书。

```bash
rm -rf ./certs
docker-compose -f docker-compose.https.yml restart
```

**Let's Encrypt**：运行 `certbot renew` 后复制新证书并重启容器。

### Q: 浏览器显示"不安全"警告？

自签名证书会显示警告，这是正常的。点击"高级 → 继续"即可。

如需永久信任，可将证书导入系统：
- **Windows**: 双击 `cert.pem` → 安装 → "受信任的根证书颁发机构"
- **macOS**: 双击 `cert.pem` → 添加到钥匙串 → 设为"始终信任"
- **iOS**: 通过 AirDrop 发送 → 设置 → 通用 → VPN与设备管理 → 安装 → 证书信任设置 → 启用

### Q: 群晖 NAS 如何配置？

可使用群晖内置的反向代理：

1. DSM 控制面板 → 登录门户 → 高级 → 反向代理服务器
2. 新建：来源 HTTPS + 自定义端口 → 目的地 `http://localhost:3000`
3. 群晖会自动使用其 SSL 证书

---

## 文件结构

```
wrong-notebook/
├── docker-compose.yml           # 标准配置（无 HTTPS）
├── docker-compose.https.yml     # 内置 HTTPS 配置
├── https-server.js              # HTTPS 代理脚本
└── certs/                       # 证书目录（自动生成或手动放入）
    ├── cert.pem
    └── key.pem
```

---
