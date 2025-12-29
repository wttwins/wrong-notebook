# CLAUDE.md

请始终使用简体中文与我对话，并在回答时保持专业、简洁。

文件编码格式使用UTF-8

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wrong Notebook (智能错题本) is an intelligent error question management system that uses AI to help students organize, analyze, and review incorrect exam questions. It's a full-stack Next.js application with multi-user support and AI-powered analysis.

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Shadcn UI
- **Backend**: Next.js API Routes, Prisma ORM, SQLite (Better SQLite3)
- **Auth**: NextAuth.js v4 (JWT-based)
- **AI**: Google Gemini (default) and OpenAI APIs with dynamic provider switching
- **Testing**: Vitest

## Common Commands

```bash
# Development
npm run dev              # Start dev server on 0.0.0.0:3000

# Build & Production
npm run build            # Build application
npm run start            # Start production server

# Linting & Testing
npm run lint             # Run ESLint
npm test                 # Run Vitest tests

# Database
npx prisma migrate dev   # Run migrations
npx prisma db seed       # Seed initial data (admin@localhost:123456)
npx prisma generate      # Generate Prisma client

# Utility Scripts
node scripts/reset-password.js <email> <password>  # Reset user password
node scripts/check-api-models.js                   # Check AI model availability
```

## Architecture

### Core Data Flow
```
User Upload Image → Image Processing → AI Analysis → Save to Database → Display Results
```

### Key Layers

1. **AI Service Layer** (`src/lib/ai/`)
   - Abstract `AIService` interface for provider interchangeability
   - `GeminiProvider` and `OpenAIProvider` implementations
   - Uses XML-based prompts (not JSON) to avoid LaTeX escaping issues
   - Zod schema validation for AI responses

2. **Configuration System** (`src/lib/config.ts`)
   - Dual-layer: Environment variables + runtime JSON config
   - Config file: `config/app-config.json` (overrides env vars)
   - Hot-reload capable without server restart

3. **Authentication** (`src/lib/auth.ts`)
   - JWT-based sessions with NextAuth.js
   - User roles (admin/user) and account status checking
   - Middleware route protection in `src/middleware.ts`

4. **Database Layer** (`src/lib/prisma.ts`)
   - Key models: User, Subject (notebooks), ErrorItem, ReviewSchedule, PracticeRecord
   - Schema defined in `prisma/schema.prisma`

### API Routes (`src/app/api/`)

| Route | Purpose |
|-------|---------|
| `/api/analyze` | AI image analysis |
| `/api/error-items` | CRUD for error questions |
| `/api/error-items/[id]/mastery` | Update mastery level |
| `/api/reanswer` | Re-answer questions with AI |
| `/api/admin/users` | Admin user management |
| `/api/settings` | App configuration |

### Frontend Structure (`src/app/`)

- `/` - Main dashboard (upload, review)
- `/notebooks` - Notebook management
- `/practice` - Practice questions
- `/stats` - Analytics & progress
- `/print-preview` - Export/print

## Key Patterns

- **Server Components by default** - Client Components marked with `"use client"`
- **Image Processing Pipeline**: Upload → Browser compression (max 1MB, 1920px) → Optional cropping → Base64 → API
- **Knowledge Tags** (`src/lib/knowledge-tags.ts`): Grade-based (7-12) tag database for subjects
- **API Client** (`src/lib/api-client.ts`): Type-safe HTTP client with generic support

## Environment Variables

```bash
# Core
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-secret"        # Required for production
AUTH_TRUST_HOST=true                 # Auto-infer URL from Host header

# AI (Gemini default)
AI_PROVIDER="gemini"                 # or "openai"
GOOGLE_API_KEY="your-key"
GEMINI_MODEL="gemini-2.5-flash"

# OpenAI (optional)
OPENAI_API_KEY="your-key"
OPENAI_BASE_URL="custom-endpoint"    # Optional for compatible services
OPENAI_MODEL="gpt-4o"
```

## Docker Deployment

```bash
docker build -t wrong-notebook .
docker run -d -p 3000:3000 \
  -v ./data:/app/data \
  -v ./config:/app/config \
  -e NEXTAUTH_SECRET="your-secret" \
  wrong-notebook
```

Volumes: `/app/data` (database), `/app/config` (settings)


  关键文件/目录保护

  1. 数据库文件

  prisma/dev.db          # SQLite 数据库文件
  prisma/dev.db-journal  # 数据库日志文件（如果存在）
  绝对不能覆盖，否则会丢失所有用户数据和错题记录。

  2. 配置文件

  config/app-config.json  # 运行时配置（AI 密钥、模型设置等）
  这个文件包含服务器特定的配置，覆盖后需要重新配置。

  3. 上传的图片

  检查是否有用户上传的图片存储在本地（如 public/uploads/ 或类似目录）。

  推荐发版流程

  # 1. 备份关键数据
  cp prisma/dev.db prisma/dev.db.backup
  cp config/app-config.json config/app-config.json.backup

  # 2. 拉取/部署新代码（排除数据文件）
  # 如果用 git:
  git pull origin main

  # 3. 安装依赖
  npm install

  # 4. 运行数据库迁移（如果有 schema 变更）
  npx prisma migrate deploy

  # 5. 重新生成 Prisma Client
  npx prisma generate

  # 6. 构建
  npm run build

  # 7. 重启服务
  pm2 restart wrong-notebook  # 或你使用的进程管理器

  Docker 部署场景

  如果使用 Docker，确保数据卷正确挂载：
  -v ./data:/app/data      # 数据库
  -v ./config:/app/config  # 配置文件
  这样容器更新不会影响宿主机上的数据。

  建议

  1. 发版前先备份 prisma/dev.db 和 config/app-config.json
  2. 使用 prisma migrate deploy 而不是 migrate dev（生产环境）
  3. 检查 .env 文件是否需要更新新的环境变量