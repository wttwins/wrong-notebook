import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const logger = createLogger('frontend-logs');

export const runtime = 'nodejs';

interface FrontendLogEntry {
  level: 'info' | 'warn' | 'error';
  prefix: string;
  message: string;
  context?: Record<string, any>;
  timestamp: string;
  url?: string;
  userAgent?: string;
}

interface BatchLogRequest {
  logs: FrontendLogEntry[];
}

/**
 * POST /api/logs/frontend
 *
 * Receives frontend logs and writes them to backend logger
 * Supports both single log and batch log formats.
 *
 * 安全约束（该接口未鉴权——登录页在会话建立前也要能上报）：
 *   - 限制请求体大小，避免超大 JSON 造成内存/CPU 消耗
 *   - 限制单次提交条数
 *   - 截断各字段长度，避免任意超长内容写入日志
 * 足以挡住日志洪水式刷量，又不影响正常诊断用途。
 */

const MAX_BODY_BYTES = 32 * 1024;   // 32KB
const MAX_ENTRIES = 20;             // 单次最多 20 条
const MAX_STRING_LEN = 500;         // 单字段最大长度

function truncate(value: unknown, max = MAX_STRING_LEN): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.length > max ? value.slice(0, max) + '…' : value;
}

export async function POST(request: NextRequest) {
  try {
    // 先按 Content-Length 拒绝超大请求，避免把整个 body 读进内存
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'Payload too large' }, { status: 413 });
    }

    const body = await request.json();

    // 支持批量日志格式 { logs: [...] } 和单条日志格式
    const logs: FrontendLogEntry[] = Array.isArray(body.logs) ? body.logs : [body];

    if (logs.length > MAX_ENTRIES) {
      return NextResponse.json(
        { success: false, error: `Too many entries (max ${MAX_ENTRIES})` },
        { status: 413 }
      );
    }

    for (const entry of logs) {
      const raw = (entry || {}) as Partial<FrontendLogEntry>;
      const { context = {}, timestamp, url, userAgent, prefix, message } = raw;

      const safeLevel: FrontendLogEntry['level'] =
        raw.level === 'error' || raw.level === 'warn' || raw.level === 'info' ? raw.level : 'info';

      // Build log context
      const logContext = {
        source: 'frontend',
        prefix: truncate(prefix, 80),
        url: truncate(url) || truncate(request.headers.get('referer') || ''),
        userAgent: truncate(userAgent, 300) || truncate(request.headers.get('user-agent') || '', 300),
        clientTime: truncate(timestamp, 40),
        ...(context && typeof context === 'object' ? context : {}),
      };

      const safeMessage = truncate(message) || '(no message)';

      // Log to backend using appropriate level
      switch (safeLevel) {
        case 'error':
          logger.error(logContext, safeMessage);
          break;
        case 'warn':
          logger.warn(logContext, safeMessage);
          break;
        case 'info':
        default:
          logger.info(logContext, message);
          break;
      }
    }

    return NextResponse.json({ success: true, count: logs.length });
  } catch (error) {
    logger.error({ error }, 'Failed to process frontend log');
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
