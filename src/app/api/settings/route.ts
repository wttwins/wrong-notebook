import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAppConfig, updateAppConfig } from "@/lib/config";
import { unauthorized, forbidden, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { OpenAIInstance } from "@/types/api";

const logger = createLogger('api:settings');

export const dynamic = 'force-dynamic';

/**
 * 鉴权：AI 配置是全局设置，且 GET 会返回完整 API Key（未脱敏），
 * 因此仅允许已登录的管理员访问。
 *
 * 注意：middleware 的 matcher 显式排除了 /api/*，
 * 所以每个 API 路由必须自行校验会话。
 */
async function requireAdmin() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return { error: unauthorized("Authentication required") };
    }
    if ((session.user as { role?: string }).role !== 'admin') {
        return { error: forbidden("Admin privileges required") };
    }
    return { session };
}

export async function GET() {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const config = getAppConfig();
    // Return full config including API keys since this is an authenticated endpoint
    return NextResponse.json(config);
}

export async function POST(req: Request) {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    try {
        const body = await req.json();
        const currentConfig = getAppConfig();

        // Don't save masked keys if they somehow get sent back (for Gemini)
        if (body.gemini?.apiKey === '********') {
            // 保留原有的 API Key
            body.gemini.apiKey = currentConfig.gemini?.apiKey;
        }

        // For OpenAI instances, preserve original keys for masked entries
        if (body.openai?.instances) {
            const currentInstances = currentConfig.openai?.instances || [];
            body.openai.instances = body.openai.instances.map((instance: OpenAIInstance) => {
                if (instance.apiKey === '********') {
                    // 查找原有实例并保留其 API Key
                    const originalInstance = currentInstances.find((i: OpenAIInstance) => i.id === instance.id);
                    return {
                        ...instance,
                        apiKey: originalInstance?.apiKey || '',
                    };
                }
                return instance;
            });
        }

        // For Azure, preserve original key if masked
        if (body.azure?.apiKey === '********') {
            body.azure.apiKey = currentConfig.azure?.apiKey;
        }

        const updatedConfig = updateAppConfig(body);
        return NextResponse.json(updatedConfig);
    } catch (error) {
        logger.error({ error }, 'Failed to update settings');
        return internalError("Failed to update settings");
    }
}


