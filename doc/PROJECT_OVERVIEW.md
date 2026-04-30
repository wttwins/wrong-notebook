# 智能错题本 (Smart Wrong Notebook) — 项目概览

> 基于 AI 的智能错题管理系统，帮助学生高效整理、分析和复习错题。
> 版本: 1.5.5 | 框架: Next.js 16 (App Router) | 语言: TypeScript (strict)

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + React 19 |
| 语言 | TypeScript (strict mode, ES2017) |
| 数据库 | SQLite (Prisma ORM 5.22) |
| 样式 | Tailwind CSS v4 + Shadcn UI (Radix primitives) |
| 认证 | NextAuth.js v4 (credentials provider, bcryptjs) |
| AI | Google Gemini / OpenAI / Azure OpenAI (动态切换) |
| 测试 | Vitest (单元/集成) + Playwright (E2E) |
| 部署 | Docker (standalone output) + Docker Compose |
| 包管理 | npm |

---

## 目录结构

```
wrongNotebook/
├── src/                          # 源码
│   ├── app/                      # Next.js App Router
│   │   ├── page.tsx              # 首页：上传→分析→编辑流
│   │   ├── layout.tsx            # 根布局 (Geist 字体, Providers)
│   │   ├── globals.css           # 全局样式 (Tailwind)
│   │   ├── manifest.ts           # PWA manifest
│   │   ├── middleware.ts         # 认证中间件 (登录保护)
│   │   ├── login/                # 登录页
│   │   ├── register/             # 注册页
│   │   ├── notebooks/            # 错题本列表 + 详情 [id]/
│   │   ├── error-items/[id]/     # 单道错题详情
│   │   ├── tags/page.tsx         # 知识点标签管理
│   │   ├── stats/page.tsx        # 数据统计看板
│   │   ├── practice/             # 智能练习
│   │   ├── print-preview/        # 导出打印预览
│   │   ├── latex-test/           # LaTeX 渲染测试
│   │   └── api/                  # API 路由
│   │       ├── analyze/route.ts          # POST 图片分析
│   │       ├── error-items/route.ts      # CRUD + batch-delete + clear + list
│   │       ├── notebooks/                # 错题本 CRUD
│   │       ├── ai/models/                # AI 模型列表
│   │       ├── ai/test/                  # AI 连通性测试
│   │       ├── practice/                 # 生成练习题
│   │       ├── reanswer/                 # 重新解题
│   │       ├── settings/                 # 应用配置读写
│   │       ├── stats/                    # 统计数据
│   │       ├── tags/                     # 标签管理
│   │       ├── analytics/               # 分析数据
│   │       ├── admin/                    # 管理员用户管理
│   │       ├── auth/                     # NextAuth 配置
│   │       ├── user/                     # 用户信息
│   │       ├── register/                 # 注册接口
│   │       └── logs/                     # 日志查看
│   ├── components/               # React 组件
│   │   ├── ui/                   # Shadcn UI (button, dialog, select, tabs, slider, etc.)
│   │   ├── admin/                # 管理后台组件
│   │   ├── settings/             # 设置弹窗组件
│   │   ├── providers.tsx         # 全局 Providers (SessionProvider, LanguageContext)
│   │   ├── upload-zone.tsx       # 图片上传拖拽区
│   │   ├── image-cropper.tsx     # 图片裁剪
│   │   ├── correction-editor.tsx # AI 结果编辑/确认
│   │   ├── error-list.tsx        # 错题列表
│   │   ├── notebook-card.tsx     # 错题本卡片
│   │   ├── notebook-selector.tsx # 错题本选择器
│   │   ├── markdown-renderer.tsx # Markdown/LaTeX 渲染
│   │   ├── tag-input.tsx         # 标签输入组件
│   │   ├── knowledge-filter.tsx  # 知识点筛选
│   │   ├── practice-stats.tsx    # 练习统计
│   │   ├── wrong-answer-stats.tsx# 错题统计
│   │   ├── user-welcome.tsx      # 欢迎信息
│   │   ├── broadcast-notification.tsx # 广播通知
│   │   ├── create-notebook-dialog.tsx  # 创建错题本
│   │   └── settings-dialog.tsx   # 设置入口
│   ├── lib/                      # 业务逻辑层
│   │   ├── ai/                   # AI 服务抽象层
│   │   │   ├── index.ts          # 工厂函数 (getAIService)
│   │   │   ├── types.ts          # AIService 接口定义
│   │   │   ├── schema.ts         # Zod 校验 (ParsedQuestionSchema)
│   │   │   ├── prompts.ts        # 提示词模板 (分析/相似题/重新解题)
│   │   │   ├── gemini-provider.ts # Google Gemini Provider
│   │   │   ├── openai-provider.ts # OpenAI Provider
│   │   │   ├── azure-provider.ts  # Azure OpenAI Provider
│   │   │   └── tag-service.ts    # 标签查询服务
│   │   ├── tag-data/             # 预置知识点标签数据 (按学科)
│   │   │   ├── index.ts, math.ts, physics.ts, chemistry.ts, biology.ts
│   │   │   ├── english.ts, chinese.ts, history.ts, geography.ts, politics.ts
│   │   ├── constants/            # 常量 (pagination.ts)
│   │   ├── config.ts             # 应用配置 (app-config.json 读写 + env fallback)
│   │   ├── logger.ts             # 服务端结构化日志 (自定义, 支持 pretty/JSON)
│   │   ├── frontend-logger.ts    # 前端日志
│   │   ├── api-client.ts         # 前端 API 请求封装
│   │   ├── api-errors.ts         # API 错误响应工具
│   │   ├── auth.ts               # NextAuth 配置
│   │   ├── auth-utils.ts         # 认证工具函数
│   │   ├── prisma.ts             # Prisma 客户端单例
│   │   ├── utils.ts              # 通用工具
│   │   ├── translations.ts       # 国际化翻译
│   │   ├── markdown-utils.ts     # Markdown 工具
│   │   ├── image-utils.ts        # 图片压缩/处理
│   │   ├── knowledge-tags.ts     # 年级计算 + 科目推断
│   │   ├── tag-recognition.ts    # 标签识别
│   │   ├── grade-calculator.ts   # 年级计算器
│   │   ├── scheduler.ts          # 复习计划调度
│   │   ├── global-proxy.ts       # 全局代理配置
│   │   └── instrumentation.ts    # Next.js instrumentation
│   ├── contexts/                 # React Context
│   │   └── LanguageContext.tsx    # 语言上下文 (zh/en)
│   ├── types/                    # TypeScript 类型定义
│   │   ├── api.ts                # API 响应/请求类型
│   │   └── next-auth.d.ts        # NextAuth 类型扩展
│   ├── __tests__/                # 测试
│   │   ├── unit/                 # 单元测试
│   │   ├── integration/          # 集成测试
│   │   └── setup.ts              # 测试环境配置
│   └── middleware.ts             # 认证中间件
├── prisma/                       # 数据库
│   ├── schema.prisma             # 完整数据模型
│   ├── seed.ts                   # 种子数据 (管理员 + 标签)
│   ├── migrations/               # 迁移历史
│   └── dev.db                    # 开发数据库
├── config/
│   ├── app-config.json           # 运行时配置 (AI 提供商/Key/超时等)
│   └── .gitkeep
├── doc/                          # 文档
│   ├── PROJECT_OVERVIEW.md       # 本文件
│   ├── HTTPS_SETUP.md            # HTTPS 配置
│   ├── LOGGING_GUIDE.md          # 日志指南
│   ├── MARKDOWN_GUIDE.md         # Markdown 指南
│   ├── operational_flow.md       # 运维流程
│   ├── release-guide.md          # 发布指南
│   └── setup-wsl-network.md      # WSL 网络配置
├── public/                       # 静态资源
├── scripts/                      # 工具脚本 (reset-password.js)
├── e2e/                          # Playwright E2E 测试
├── docker-compose.yml / .https.yml
├── Dockerfile / docker-entrypoint.sh
├── next.config.ts                # standalone output, serverExternalPackages
├── vitest.config.ts              # Vitest 配置
├── playwright.config.ts          # Playwright 配置
├── eslint.config.mjs             # ESLint 配置
├── postcss.config.mjs            # PostCSS 配置
├── tsconfig.json                 # TypeScript 配置
├── components.json               # Shadcn UI 配置
└── .env.example                  # 环境变量模板
```

---

## 数据库模型 (Prisma)

```
User (id, email, password, name, role, isActive, educationStage, enrollmentYear)
  ├── Subject (id, name, userId)              ← 错题本
  ├── ErrorItem (id, userId, subjectId,       ← 核心错题实体
  │     originalImageUrl, ocrText, questionText,
  │     answerText, analysis, knowledgePoints,
  │     source, errorType, userNotes, masteryLevel,
  │     gradeSemester, paperLevel)
  │     └── KnowledgeTag[] (多对多)
  │     └── ReviewSchedule[] (复习计划)
  ├── PracticeRecord (id, userId, subject, difficulty, isCorrect)
  └── KnowledgeTag (id, name, subject, parentId, order, code, isSystem, userId)
       └── 无限层级树 (邻接表) + 系统/自定义标签
```

---

## 核心业务流程

```
用户上传图片 → 图片裁剪 → 图片压缩 (base64)
  → POST /api/analyze (AI分析)
    → 获取用户年级/学科 → 注入标签列表到 prompt
    → AI Provider (Gemini/OpenAI/Azure) 分析
    → Zod 校验返回数据
    → 返回 ParsedQuestion { questionText, answerText, analysis, subject, knowledgePoints, requiresImage }
  → 用户编辑确认 → POST /api/error-items (保存)
    → 自动去重检测
    → 保存到数据库 → 跳转错题本详情
```

---

## 关键设计决策

### AI 多提供商架构
- 工厂模式: `getAIService()` 根据配置返回对应 Provider 实例
- 配置来源: `app-config.json` > 环境变量 > 默认值
- OpenAI 支持多实例管理 (可配置 10 个不同 endpoint)

### 标签系统
- 系统预置标签 (10 学科) + 用户自定义标签
- 无限层级树结构 (邻接表)
- AI 分析时按学科注入标签列表到 prompt，引导标准输出

### 提示词模板
- 使用 XML 标签格式输出 (非 JSON)，减少 AI 格式错误
- 支持自定义模板覆盖 (通过 app-config.json)
- 分学科注入标签列表 (节省 token)

### 日志系统
- 自定义实现 (替代 pino，避免 Turbopack 兼容问题)
- 开发环境: 彩色格式化输出
- 生产环境: JSON 结构化输出

### PWA 支持
- manifest.ts + 苹果 webapp meta
- 支持添加到主屏幕

---

## 配置方式

| 层级 | 优先级 | 说明 |
|------|--------|------|
| `config/app-config.json` | 最高 | 运行时动态配置 (通过网页设置保存) |
| 环境变量 (.env) | 中 | 静态配置，启动时读取 |
| `DEFAULT_CONFIG` (代码) | 最低 | 硬编码默认值 |

关键配置项: AI_PROVIDER, GOOGLE_API_KEY, OPENAI_API_KEY, NEXTAUTH_SECRET, LOG_LEVEL 等

---

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | ESLint 检查 |
| `npm run test` | Vitest 全量测试 |
| `npm run test:unit` | 单元测试 |
| `npm run test:integration` | 集成测试 |
| `npm run test:coverage` | 带覆盖率测试 |
| `npm run test:e2e` | Playwright E2E |
| `node scripts/reset-password.js <email> <password>` | 重置用户密码 |

---

## 已知优化方向

- [ ] `config.ts` 使用同步 `fs.readFileSync/writeFileSync`，可能阻塞事件循环
- [ ] 自定义 Logger 无缓冲/轮转，生产环境大规模日志有性能风险
- [ ] `app-config.json` 明文存储 API Key
- [ ] 首页 `page.tsx` (~422行) 逻辑较重，可拆分
- [ ] API 路由间错误处理模式不统一
- [ ] AI 每次分析注入全量标签列表，token 消耗较大
- [ ] 前端日志粒度过细，生产环境可降级
