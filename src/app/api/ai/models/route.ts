import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';
import { createLogger } from '@/lib/logger';
import { parseModelsRequest, resolveAIRequestTarget } from '@/lib/ai/request-target';

const logger = createLogger('api:ai:models');

interface ModelInfo {
    id: string;
    name: string;
    owned_by?: string;
}

// 从模型 ID 中提取短名称
function extractModelName(modelId: string): string {
    // models/gemini-2.0-flash -> gemini-2.0-flash
    return modelId.replace(/^models\//, '');
}

async function fetchGeminiModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
    const url = `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, errorText }, 'Gemini models API error');
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return (data.models || [])
        .map((m: any) => {
            const id = extractModelName(m.name);
            return {
                id,
                name: id,
                owned_by: 'Google',
            };
        });
}

async function fetchOpenAIModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
    const url = `${baseUrl}/models`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        logger.error({ statusText: response.statusText }, 'OpenAI models API error');
        throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    return (data.data || [])
        .map((model: any) => ({
            id: model.id,
            name: model.id,
            owned_by: model.owned_by,
        }));
}

export async function GET(req: NextRequest) {
    // 该接口会用服务端身份去请求调用方指定的 baseUrl，
    // 未鉴权时可被用作 SSRF 跳板探测内网，故要求登录。
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return unauthorized("Authentication required");
    }

    // 自定义/已保存的目标仅管理员可用；可信私网与临时目标由同一边界解析。
    const isAdmin = (session.user as { role?: string }).role === 'admin';

    try {
        const { searchParams } = new URL(req.url);
        const parsed = parseModelsRequest(searchParams);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message, models: [] }, { status: 400 });
        }
        if (parsed.data.provider === 'azure') {
            return NextResponse.json({ error: 'Azure 不支持模型列表，请填写部署名称', models: [] }, { status: 400 });
        }
        const resolved = resolveAIRequestTarget(parsed.data, isAdmin);
        if (!resolved.ok) {
            return NextResponse.json({ error: resolved.error, models: [] }, { status: resolved.status });
        }
        const { provider, apiKey, baseUrl } = resolved.target;

        let models: ModelInfo[] = [];

        if (provider === 'gemini') {
            models = await fetchGeminiModels(apiKey, baseUrl!);
        } else {
            // OpenAI-compatible
            models = await fetchOpenAIModels(apiKey, baseUrl!);
        }

        return NextResponse.json({ models });

    } catch (error: any) {
        logger.error({ error }, 'Error fetching models');
        // 不回传原始 error.message，避免泄露内部实现细节
        return NextResponse.json(
            { error: 'Failed to fetch models', models: [] },
            { status: 200 } // Return 200 with empty models to allow manual input
        );
    }
}
