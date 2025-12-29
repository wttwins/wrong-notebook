# Smart Wrong Notebook (智能错题本)

一个基于 AI 的智能错题管理系统，帮助学生高效整理、分析和复习错题。

## ✨ 主要功能

- **🤖 AI 智能分析**：自动识别题目内容，生成解析、知识点标签和同类练习题。
- **⚙️ 灵活的 AI 配置**：支持 **Google Gemini**、**OpenAI** (及兼容接口) 和 **Azure OpenAI** 三种 AI 提供商，可直接在网页设置中动态切换和配置。
- **🖼️ AI 图片生成**：举一反三功能支持自动生成题目配图（如几何图形、示意图），支持智谱 CogView、OpenAI DALL-E 等多种图片生成服务。
- **📚 多错题本管理**：支持按科目（如数学、物理、英语）创建和管理多个错题本。
- **🏷️ 智能标签系统**：自动提取知识点标签，支持自定义标签管理。
- **🔍 多维度筛选**：支持按掌握状态、时间范围、知识点标签、年级学期、试卷等级等多种条件筛选错题。
- **🖨️ 灵活导出打印**：一键导出筛选后的错题，支持自定义打印内容（答案/解析/知识点）和图片缩放比例，可直接打印或保存为 PDF。
- **📝 智能练习**：基于错题生成相似的练习题，巩固薄弱环节。
- **📊 数据统计**：可视化展示错题掌握情况和学习进度。
- **🔐 用户管理**：支持多用户注册、登录，数据安全隔离。
- **🛡️ 管理员后台**：提供用户管理功能，可禁用/启用用户、删除违规用户。


## 📸 屏幕截图功能 (HTTPS 设置)

本应用的屏幕截图功能依赖浏览器的安全上下文 (HTTPS)。在 Docker 或局域网环境中使用时，请参考 **[HTTPS 配置指南](doc/HTTPS_SETUP.md)** 启用内置 HTTPS 支持。

## 📱 PWA 支持 (添加到主屏幕)

本项目支持 PWA (Progressive Web App)，您可以将应用添加到手机主屏幕，获得原生应用般的使用体验。

**功能特性**：
- 🚀 **快速启动**：点击主屏幕图标直接打开，无需输入网址。
- 📱 **沉浸体验**：全屏运行，无浏览器地址栏干扰。
- 🎨 **原色适配**：应用图标和启动画面适配系统主题。

**使用方法**：

- **iPhone / iPad (Safari)**: 点击底部 **分享** 按钮 -> 选择 **"添加到主屏幕"**。
- **Android (Chrome)**: 点击右上角 **菜单** -> 选择 **"添加到主屏幕"** 或 **"安装应用"**。

## 🛠️ 技术栈

- **框架**: [Next.js 16](https://nextjs.org/) (App Router)
- **UI 库**: [React 19](https://react.dev/)
- **数据库**: [SQLite](https://www.sqlite.org/) (via [Prisma](https://www.prisma.io/))
- **样式**: [Tailwind CSS v4](https://tailwindcss.com/) + [Shadcn UI](https://ui.shadcn.com/)
- **AI**: Google Gemini API / OpenAI API / Azure OpenAI
- **认证**: [NextAuth.js](https://next-auth.js.org/)

## 🚀 快速开始

### 方式一：使用 Docker 部署

#### 1. 启动服务

您可以选择 **直接使用命令** (适合快速测试) 或 **Docker Compose** (适合长期运行)。

**选项 A：直接使用 Docker 命令**

```bash
docker run -d --name wrong-notebook \
  -e NEXTAUTH_SECRET="your_secret_key" \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/config:/app/config \
  ghcr.io/wttwins/wrong-notebook
```

**选项 B：使用 Docker Compose (推荐)**

使用 `docker-compose.yml` 文件进行管理。

1.  **下载配置文件**：
    ```bash
    curl -o docker-compose.yml https://raw.githubusercontent.com/wttwins/wrong-notebook/refs/heads/main/docker-compose.yml
    ```
2.  **启动服务**：
    ```bash
    docker-compose up -d
    ```
3.  **查看日志**：
    ```bash
    docker-compose logs -f
    ```
4.  **停止服务**：
    ```bash
    docker-compose down
    ```

### 方式二：本地源码运行

#### 1. 克隆仓库

```bash
git clone https://github.com/wttwins/wrong-notebook.git
cd wrong-notebook
```

#### 2. 环境准备

确保已安装 Node.js (v18+) 和 npm。

#### 3. 安装依赖

```bash
npm install
```

#### 4. 配置环境变量

复制 `.env.example` 为 `.env` 并填入必要的配置：

```bash
cp .env.example .env
```

**基础配置**

| 环境变量 | 描述 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | 数据库连接地址 | `file:./dev.db` | SQLite 数据库路径 |
| `NEXTAUTH_SECRET` | Auth 密钥 | 无 | 用于加密 Session，生产环境建议设置,可以使用 openssl rand -base64 32 生成一个随机字符串作为密钥 |
| `NEXTAUTH_URL` | 访问地址 | `http://your-domain-name:3000` | 部署后的访问地址 |
| `AUTH_TRUST_HOST` | 信任主机头 | `true` | 设置为 `true` 时自动推断 URL，适合 Docker/PaaS |
| `LOG_LEVEL` | 日志级别 | `debug` (开发) / `info` (生产) | 可选值：`trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `HTTP_PROXY` | HTTP 代理 | 无 | 设置 HTTP 代理 |
| `HTTPS_PROXY` | HTTPS 代理 | 无 | 设置 HTTPS 代理 |

**AI 配置**

| 环境变量 | 描述 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `AI_PROVIDER` | AI 提供商 | `gemini` | 可选 `gemini`, `openai` 或 `azure` |
| `GOOGLE_API_KEY` | Gemini API Key | 无 | 使用 Gemini 时必填 |
| `GEMINI_BASE_URL` | Gemini API 地址 | 无 | 可选，用于自定义 API 地址 |
| `GEMINI_MODEL` | Gemini 模型 | `gemini-2.5-flash` | 可选，如 `gemini-3.0-flash` |
| `OPENAI_API_KEY` | OpenAI API Key | 无 | 使用 OpenAI 时必填 |
| `OPENAI_BASE_URL` | OpenAI API 地址 | 无 | 可选，用于兼容的 API 服务 |
| `OPENAI_MODEL` | OpenAI 模型 | `gpt-4o` | 可选，如 `gpt-4o` |
| `AZURE_OPENAI_API_KEY` | Azure API Key | 无 | 使用 Azure OpenAI 时必填 |
| `AZURE_OPENAI_ENDPOINT` | Azure Endpoint | 无 | Azure 资源端点，如 `https://xxx.openai.azure.com` |
| `AZURE_OPENAI_DEPLOYMENT` | 部署名称 | 无 | Azure 模型部署名称 |
| `AZURE_OPENAI_API_VERSION` | API 版本 | `2024-02-15-preview` | 可选，Azure API 版本 |
| `AZURE_OPENAI_MODEL` | Azure 模型 | `gpt-4o` | 可选，显示的模名称 |

#### 5. 初始化数据库

```bash
npx prisma migrate dev
npx prisma db seed
```

#### 6. 管理员账户

默认管理员账户：
- **邮箱**: `admin@localhost`
- **密码**: `123456`

> 管理员登录后，可在“设置” -> “用户管理”中管理系统用户。

#### 7. 启动开发服务器

```bash
npm run dev
```

访问 [http://your-domain-name:3000](http://your-domain-name:3000) 开始使用。

## ⚙️ AI 模型配置

本项目支持动态配置 AI 模型，无需重启服务器。

1.  **进入设置**：点击首页右上角的设置图标。
2.  **选择提供商**：支持 Google Gemini, OpenAI (或兼容 API) 和 **Azure OpenAI**。
3.  **填写参数**：
    *   **通用参数**: API Key, Base URL (或 Endpoint), Model Name (或 Deployment Name)。
    *   **Azure 特有**: Deployment Name (部署名称), API Version (API 版本)。
4.  **保存生效**：点击保存后即刻生效。

> **注意**：网页配置会保存到 `config/app-config.json` 文件中，该文件的优先级高于 `.env` 环境变量。

### 🖼️ 图片生成服务配置

举一反三功能支持为生成的题目自动配图（如几何图形、函数图像、示意图等）。

1. **进入设置** -> **AI Provider** 标签页，滚动到 **图片生成服务** 区域。
2. **开启功能**：打开图片生成开关。
3. **添加服务实例**：点击"Add"添加图片生成服务。
4. **配置参数**：
   - **服务商**：智谱 CogView / OpenAI DALL-E / 其他兼容服务
   - **API Key**：对应服务商的 API 密钥
   - **Base URL**：可选，用于自定义 API 端点
   - **模型**：如 `cogview-4`、`dall-e-3`
5. **保存生效**：保存后，举一反三功能会自动判断题目是否需要配图并生成。

> **支持的服务商**：
> - **智谱 CogView**：推荐使用 `cogview-4` 模型
> - **OpenAI DALL-E**：支持 `dall-e-3`、`dall-e-2`
> - **其他**：兼容 OpenAI 图片生成 API 的第三方服务

## 🛠️ 实用脚本

在 `scripts/` 目录下提供了一些实用脚本，用于维护和调试：

- **重置密码**:
  ```bash
  node scripts/reset-password.js <邮箱> <新密码>
  ```
  示例:  
  ```bash
  node scripts/reset-password.js user@example.com 123456 
  ```

## 📄 许可证

MIT License

## 📝 更新日志

### v1.6.0 (开发中)

**新功能**
- ✨ **举一反三图片生成**：AI 自动判断题目是否需要配图（如几何图形、示意图），并调用图片生成服务自动生成
- 🖼️ **多图片服务支持**：支持配置智谱 CogView、OpenAI DALL-E 及其他兼容服务
- ⚙️ **图片服务多实例管理**：支持添加多个图片生成服务实例，灵活切换

**技术改进**
- 扩展 AI Prompt 支持图片生成标记判断
- 新增图片生成服务抽象层 (`src/lib/image-gen/`)
- 扩展 `ParsedQuestion` Schema 支持图片字段

### v1.5.3

- 新增 Azure OpenAI 支持
- 优化 AI 配置界面

### v1.5.0

- 新增多 OpenAI 实例配置支持
- 优化标签系统

*更多历史版本请查看 [GitHub Releases](https://github.com/wttwins/wrong-notebook/releases)*
