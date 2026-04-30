/**
 * Models Route 单元测试
 *
 * 测试 /api/ai/models 端点的 Gemini 和 OpenAI 模型列表功能
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock logger
vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        box: vi.fn(),
        divider: vi.fn(),
    })),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GET } from '@/app/api/ai/models/route';

function makeRequest(params: Record<string, string>): NextRequest {
    const url = new URL('http://localhost/api/ai/models');
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    return new NextRequest(url);
}

describe('GET /api/ai/models - Gemini provider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('应该正确获取并返回 Gemini 视觉模型列表', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                models: [
                    { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
                    { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
                    { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
                ],
            }),
        });

        const req = makeRequest({ provider: 'gemini', apiKey: 'test-key' });
        const res = await GET(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.models).toHaveLength(3);
        expect(body.models[0]).toEqual({
            id: 'gemini-2.0-flash',
            name: 'gemini-2.0-flash',
            owned_by: 'Google',
        });
        expect(body.models[1].id).toBe('gemini-1.5-pro');
        expect(body.models[2].id).toBe('gemini-2.5-flash');
    });

    it('应该使用自定义 baseUrl', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ models: [] }),
        });

        const req = makeRequest({
            provider: 'gemini',
            apiKey: 'my-key',
            baseUrl: 'https://custom.google.com',
        });
        await GET(req);

        expect(mockFetch).toHaveBeenCalledWith(
            'https://custom.google.com/v1beta/models?key=my-key',
            expect.any(Object)
        );
    });

    it('应该过滤掉非视觉模型（如 embedding 和 tts 模型）', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                models: [
                    { name: 'models/gemini-2.0-flash' },
                    { name: 'models/text-embedding-004' },
                    { name: 'models/gemini-1.5-pro' },
                    { name: 'models/text-to-speech-01' },
                ],
            }),
        });

        const req = makeRequest({ provider: 'gemini', apiKey: 'test-key' });
        const res = await GET(req);
        const body = await res.json();

        expect(body.models).toHaveLength(2);
        expect(body.models.map((m: any) => m.id)).toEqual([
            'gemini-2.0-flash',
            'gemini-1.5-pro',
        ]);
    });

    it('API 返回空 models 数组时应返回空列表', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ models: [] }),
        });

        const req = makeRequest({ provider: 'gemini', apiKey: 'test-key' });
        const res = await GET(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.models).toEqual([]);
    });

    it('API 返回无 models 字段时应返回空列表', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });

        const req = makeRequest({ provider: 'gemini', apiKey: 'test-key' });
        const res = await GET(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.models).toEqual([]);
    });

    it('Gemini API 返回错误时应返回 200 和空模型列表', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            text: async () => 'Forbidden',
        });

        const req = makeRequest({ provider: 'gemini', apiKey: 'bad-key' });
        const res = await GET(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.models).toEqual([]);
        expect(body.error).toContain('Gemini API error');
    });

    it('缺少 apiKey 时应返回 400', async () => {
        const req = makeRequest({ provider: 'gemini' });
        const res = await GET(req);
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toBe('API key is required');
    });
});

describe('GET /api/ai/models - OpenAI provider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('应该正确获取并返回 OpenAI 视觉模型列表', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [
                    { id: 'gpt-4o', owned_by: 'openai' },
                    { id: 'gpt-4-turbo', owned_by: 'openai' },
                    { id: 'text-embedding-3-small', owned_by: 'openai' },
                ],
            }),
        });

        const req = makeRequest({ apiKey: 'test-key' });
        const res = await GET(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.models).toHaveLength(2);
        expect(body.models[0].id).toBe('gpt-4o');
        expect(body.models[1].id).toBe('gpt-4-turbo');
    });

    it('OpenAI API 返回错误时应返回 200 和空模型列表', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            statusText: 'Unauthorized',
            status: 401,
        });

        const req = makeRequest({ apiKey: 'bad-key' });
        const res = await GET(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.models).toEqual([]);
        expect(body.error).toContain('API error');
    });
});
