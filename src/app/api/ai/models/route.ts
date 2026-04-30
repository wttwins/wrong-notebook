import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

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

// 判断是否为支持视觉/图片输入的模型
function isVisionModel(modelId: string): boolean {
    const id = modelId.toLowerCase();
    return (
        id.includes('gemini') || // Gemini 全系列支持视觉
        id.includes('vision') ||
        id.includes('gpt-4o') ||
        id.includes('gpt-4-turbo') ||
        id.includes('claude-3') ||
        id.includes('claude-4') ||
        id.includes('glm-4v')
    );
}

async function fetchGeminiModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
    const url = `${baseUrl}/v1beta/models?key=${apiKey}`;

    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, errorText }, 'Gemini models API error');
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const models = (data.models || [])
        .map((m: any) => {
            const id = extractModelName(m.name);
            return {
                id,
                name: id,
                owned_by: 'Google',
            };
        })
        .filter((m: ModelInfo) => isVisionModel(m.id));

    return models;
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
        .filter((model: any) => isVisionModel(model.id))
        .map((model: any) => ({
            id: model.id,
            name: model.id,
            owned_by: model.owned_by,
        }));
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const provider = searchParams.get('provider');
        const apiKey = searchParams.get('apiKey');
        const baseUrl = searchParams.get('baseUrl');

        if (!apiKey) {
            return NextResponse.json(
                { error: 'API key is required' },
                { status: 400 }
            );
        }

        let models: ModelInfo[] = [];

        if (provider === 'gemini') {
            const effectiveBaseUrl = baseUrl || 'https://generativelanguage.googleapis.com';
            models = await fetchGeminiModels(apiKey, effectiveBaseUrl);
        } else {
            // OpenAI-compatible
            const effectiveBaseUrl = baseUrl || 'https://api.openai.com/v1';
            models = await fetchOpenAIModels(apiKey, effectiveBaseUrl);
        }

        return NextResponse.json({ models });

    } catch (error: any) {
        logger.error({ error }, 'Error fetching models');
        return NextResponse.json(
            { error: error.message || 'Internal server error', models: [] },
            { status: 200 } // Return 200 with empty models to allow manual input
        );
    }
}
