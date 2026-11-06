/**
 * AI 目标/连接契约回归：全部使用 fixtureConfig、mock fetch/Provider。
 * 不访问真实上游、生产配置或数据库；credential 断言只比较布尔值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
    const fixtureConfig = {
        aiProvider: 'openai',
        openai: {
            instances: [{
                id: 'saved-openai', name: 'Fixture private AI',
                apiKey: 'fixture-openai-credential',
                baseUrl: 'http://192.168.50.10:8080/v1', model: 'saved-model',
                disableThinking: true,
            }],
            activeInstanceId: 'saved-openai',
        },
        gemini: {
            apiKey: 'fixture-gemini-credential',
            baseUrl: 'http://gemini.internal', model: 'saved-gemini',
        },
        azure: {
            apiKey: 'fixture-azure-credential', endpoint: 'http://azure.internal',
            deploymentName: 'saved-deployment', apiVersion: '2024-02-15-preview', model: 'saved-azure',
        },
    };
    const analyzeImage = vi.fn();
    const generateSimilarQuestion = vi.fn();
    return {
        fixtureConfig,
        session: { user: { id: 'fixture-user', role: 'admin' }, expires: '2099-01-01' } as
            { user: { id: string; role: string }; expires: string } | null,
        getAppConfig: vi.fn(() => fixtureConfig),
        fetch: vi.fn(), analyzeImage, generateSimilarQuestion,
        openai: vi.fn(function (config: Record<string, unknown>) { return { config, analyzeImage, generateSimilarQuestion }; }),
        gemini: vi.fn(function (config: Record<string, unknown>) { return { config, analyzeImage, generateSimilarQuestion }; }),
        azure: vi.fn(function (config: Record<string, unknown>) { return { config, analyzeImage, generateSimilarQuestion }; }),
    };
});

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppConfig: mocks.getAppConfig }));
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/lib/ai/openai-provider', () => ({ OpenAIProvider: mocks.openai }));
vi.mock('@/lib/ai/gemini-provider', () => ({ GeminiProvider: mocks.gemini }));
vi.mock('@/lib/ai/azure-provider', () => ({ AzureOpenAIProvider: mocks.azure }));

import { GET } from '@/app/api/ai/models/route';
import { POST } from '@/app/api/ai/test/route';
import { buildModelListParams } from '@/lib/ai/client-request';

type Body = Record<string, unknown>;
const saved = mocks.fixtureConfig.openai.instances[0];
const callerCredential = 'fixture-caller-credential';

function modelsRequest(body: Body) {
    const url = new URL('http://localhost/api/ai/models');
    Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, String(value));
    });
    return GET(new NextRequest(url));
}
function testRequest(body: unknown) {
    return POST(new NextRequest('http://localhost/api/ai/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
}
function noUpstream() {
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.openai).not.toHaveBeenCalled();
    expect(mocks.gemini).not.toHaveBeenCalled();
    expect(mocks.azure).not.toHaveBeenCalled();
}
function usedOpenAI(body: Body, endpoint: 'models' | 'test') {
    if (endpoint === 'models') {
        expect(mocks.fetch.mock.calls[0]?.[0]).toBe(`${body.baseUrl}/models`);
        const headers = mocks.fetch.mock.calls[0]?.[1]?.headers;
        expect(headers?.Authorization === `Bearer ${body.apiKey}`).toBe(true);
    } else {
        const config = mocks.openai.mock.calls[0]?.[0] as Body | undefined;
        expect(config?.baseUrl).toBe(body.baseUrl);
        expect(config?.apiKey === body.apiKey).toBe(true);
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: 'fixture-user', role: 'admin' }, expires: '2099-01-01' };
    mocks.getAppConfig.mockReturnValue(mocks.fixtureConfig);
    mocks.analyzeImage.mockReset().mockResolvedValue({ questionText: 'fixture question' });
    mocks.generateSimilarQuestion.mockReset().mockResolvedValue({ questionText: 'fixture text question' });
    mocks.fetch.mockReset().mockResolvedValue({
        ok: true, json: async () => ({ data: [{ id: 'fixture-model' }], models: [{ name: 'models/fixture-gemini' }] }),
    });
    vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

for (const endpoint of ['models', 'test'] as const) {
    const request = endpoint === 'models' ? modelsRequest : testRequest;
    describe(`/api/ai/${endpoint}: trusted versus temporary targets`, () => {
        it.each([false, true])('uses saved private OpenAI target with raw fields present=%s', async (withRaw) => {
            const res = await request({ provider: 'openai', instanceId: saved.id,
                ...(withRaw ? { apiKey: saved.apiKey, baseUrl: saved.baseUrl } : {}) });
            expect(res.status).toBe(200);
            usedOpenAI(saved, endpoint);
        });
        it('requires login before config access or outbound requests', async () => {
            mocks.session = null;
            const res = await request({ provider: 'openai', instanceId: saved.id });
            expect(res.status).toBe(401);
            expect(mocks.getAppConfig).not.toHaveBeenCalled();
            noUpstream();
        });
        it('does not expose a trusted target to an ordinary user', async () => {
            mocks.session!.user.role = 'user';
            const res = await request({ provider: 'openai', instanceId: saved.id, apiKey: saved.apiKey });
            expect(res.status).toBe(403);
            expect(mocks.getAppConfig).not.toHaveBeenCalled();
            noUpstream();
        });
        it('keeps raw custom public targets admin-only', async () => {
            mocks.session!.user.role = 'user';
            const res = await request({ provider: 'openai', apiKey: callerCredential, baseUrl: 'https://new-ai.example/v1' });
            expect(res.status).toBe(403);
            noUpstream();
        });
        it('keeps default-public own-key requests available to ordinary users', async () => {
            mocks.session!.user.role = 'user';
            const res = await request({ provider: 'openai', apiKey: callerCredential });
            expect(res.status).toBe(200);
            expect(mocks.getAppConfig).not.toHaveBeenCalled();
        });
        it.each(['openai', 'gemini'] as const)('keeps an ordinary %s explicitly empty address on its default public target', async (provider) => {
            mocks.session!.user.role = 'user';
            const res = await request({ provider, apiKey: callerCredential, baseUrl: '', useConfigured: false });
            expect(res.status).toBe(200);
            expect(mocks.getAppConfig).not.toHaveBeenCalled();
            const expected = provider === 'openai'
                ? 'https://api.openai.com/v1' : 'https://generativelanguage.googleapis.com';
            if (endpoint === 'models') {
                expect(new URL(mocks.fetch.mock.calls[0][0]).origin).toBe(new URL(expected).origin);
            } else {
                const constructor = provider === 'openai' ? mocks.openai : mocks.gemini;
                const used = constructor.mock.calls[0]?.[0] as Body;
                expect(used.baseUrl).toBe(expected);
                expect(used.apiKey === callerCredential).toBe(true);
            }
        });
        it.each([
            ['changed credential', { instanceId: saved.id, apiKey: callerCredential, baseUrl: saved.baseUrl }],
            ['changed private address', { instanceId: saved.id, apiKey: saved.apiKey, baseUrl: 'http://192.168.50.11/v1' }],
            ['non-exact address', { instanceId: saved.id, apiKey: saved.apiKey, baseUrl: `${saved.baseUrl}/` }],
            ['forged instance ID', { instanceId: 'unknown-instance', apiKey: callerCredential, baseUrl: saved.baseUrl }],
            ['raw private target', { apiKey: callerCredential, baseUrl: saved.baseUrl }],
        ])('rejects %s and explains that private changes must be saved', async (_name, fields) => {
            const res = await request({ provider: 'openai', ...fields });
            expect(res.status).toBe(400);
            expect((await res.json()).error).toMatch(/先保存/);
            noUpstream();
        });
        it('never borrows a saved credential for an overridden public target', async () => {
            const res = await request({ provider: 'openai', instanceId: saved.id, baseUrl: 'https://new-ai.example/v1' });
            expect(res.status).toBe(400);
            noUpstream();
        });
        it.each([
            ['OpenAI', { provider: 'openai', instanceId: saved.id, baseUrl: saved.baseUrl }],
            ['Gemini', { provider: 'gemini', useConfigured: true, baseUrl: mocks.fixtureConfig.gemini.baseUrl }],
        ])('does not silently restore an explicitly cleared %s credential', async (_name, fields) => {
            const res = await request({ ...fields, apiKey: '' });
            expect(res.status).toBe(400);
            noUpstream();
        });
        it('tests current public edits with the caller credential rather than the old config', async () => {
            const fields = { apiKey: callerCredential, baseUrl: 'https://new-ai.example/v1' };
            const res = await request({ provider: 'openai', instanceId: saved.id, ...fields, model: 'current-model' });
            expect(res.status).toBe(200);
            usedOpenAI(fields, endpoint);
        });
        it('allows a new public instance with its own credential', async () => {
            const fields = { apiKey: callerCredential, baseUrl: 'https://new-ai.example/v1' };
            const res = await request({ provider: 'openai', instanceId: 'unsaved-new-instance', ...fields });
            expect(res.status).toBe(200);
            usedOpenAI(fields, endpoint);
        });
        it('does not silently replace an explicitly cleared address with the old private address', async () => {
            const res = await request({ provider: 'openai', instanceId: saved.id, baseUrl: '', apiKey: callerCredential });
            expect(res.status).toBe(200);
            usedOpenAI({ apiKey: callerCredential, baseUrl: 'https://api.openai.com/v1' }, endpoint);
        });
        it('rejects an invalid provider instead of falling through to OpenAI', async () => {
            const res = await request({ provider: 'invalid', apiKey: callerCredential });
            expect(res.status).toBe(400);
            noUpstream();
        });
        it.each([false, true])('uses configured private Gemini target with raw fields present=%s', async (withRaw) => {
            const config = mocks.fixtureConfig.gemini;
            const res = await request({ provider: 'gemini', useConfigured: true,
                ...(withRaw ? { apiKey: config.apiKey, baseUrl: config.baseUrl } : {}) });
            expect(res.status).toBe(200);
            if (endpoint === 'models') {
                const url = new URL(mocks.fetch.mock.calls[0][0]);
                expect(url.origin).toBe(config.baseUrl);
                expect(url.searchParams.get('key') === config.apiKey).toBe(true);
            } else {
                const used = mocks.gemini.mock.calls[0]?.[0] as Body;
                expect(used.baseUrl).toBe(config.baseUrl);
                expect(used.apiKey === config.apiKey).toBe(true);
            }
        });
        it('requires admin for configured Gemini even without a raw address', async () => {
            mocks.session!.user.role = 'user';
            const res = await request({ provider: 'gemini', useConfigured: true, apiKey: mocks.fixtureConfig.gemini.apiKey });
            expect(res.status).toBe(403);
            noUpstream();
        });
        it('does not trust a changed Gemini credential at a private address', async () => {
            const res = await request({ provider: 'gemini', useConfigured: true,
                apiKey: callerCredential, baseUrl: mocks.fixtureConfig.gemini.baseUrl });
            expect(res.status).toBe(400);
            noUpstream();
        });
        it('does not borrow the configured Gemini key for an edited public address', async () => {
            const res = await request({ provider: 'gemini', useConfigured: true, baseUrl: 'https://new-gemini.example' });
            expect(res.status).toBe(400);
            noUpstream();
        });
    });
}

describe('actual client model helper to server route boundary', () => {
    it.each(['openai', 'gemini'] as const)('does not reuse the saved private %s address when the draft clears it', async (provider) => {
        const configured = provider === 'openai' ? saved : mocks.fixtureConfig.gemini;
        const params = buildModelListParams({ provider, apiKey: configured.apiKey, baseUrl: '',
            ...(provider === 'openai' ? { instanceId: saved.id, useConfigured: false } : { useConfigured: true }) });
        const res = await GET(new NextRequest(`http://localhost/api/ai/models?${params}`));
        expect(res.status).toBe(200);
        const url = new URL(mocks.fetch.mock.calls[0][0]);
        expect(url.origin).toBe(provider === 'openai'
            ? 'https://api.openai.com' : 'https://generativelanguage.googleapis.com');
        expect(url.origin).not.toBe(new URL(configured.baseUrl).origin);
        expect(params.has('baseUrl')).toBe(true);
        expect(params.get('baseUrl')).toBe('');
    });
});

describe('/api/ai/test: Azure actual endpoint and OpenAI thinking flag', () => {
    it.each([false, true])('uses the saved private Azure endpoint with raw fields present=%s', async (withRaw) => {
        const config = mocks.fixtureConfig.azure;
        const res = await testRequest({ provider: 'azure', useConfigured: true,
            ...(withRaw ? { apiKey: config.apiKey, endpoint: config.endpoint } : {}),
            deploymentName: 'current-deployment', apiVersion: 'current-version', model: 'current-model', language: 'en',
        });
        expect(res.status).toBe(200);
        const used = mocks.azure.mock.calls[0]?.[0] as Body;
        expect(used.endpoint).toBe(config.endpoint);
        expect(used.apiKey === config.apiKey).toBe(true);
        expect(used.deploymentName).toBe('current-deployment');
        expect(used.apiVersion).toBe('current-version');
        expect(used.model).toBe('current-model');
        expect(mocks.analyzeImage.mock.calls[0]?.[2]).toBe('en');
    });
    it('keeps configured Azure admin-only', async () => {
        mocks.session!.user.role = 'user';
        const res = await testRequest({ provider: 'azure', useConfigured: true, apiKey: mocks.fixtureConfig.azure.apiKey });
        expect(res.status).toBe(403);
        noUpstream();
    });
    it.each(['http://127.0.0.1:8080', 'https://new-azure.example'])('rejects irrelevant Azure baseUrl rather than checking a decoy', async (endpoint) => {
        const res = await testRequest({ provider: 'azure', apiKey: callerCredential,
            baseUrl: 'https://public-decoy.example', endpoint, deploymentName: 'fixture-deployment' });
        expect(res.status).toBe(400);
        noUpstream();
    });
    it('checks the actual Azure endpoint when no decoy is present', async () => {
        const res = await testRequest({ provider: 'azure', apiKey: callerCredential,
            endpoint: 'http://127.0.0.1:8080', deploymentName: 'fixture-deployment' });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/先保存/);
        noUpstream();
    });
    it('rejects mismatched Azure credentials at the saved private endpoint', async () => {
        const res = await testRequest({ provider: 'azure', useConfigured: true, apiKey: callerCredential,
            endpoint: mocks.fixtureConfig.azure.endpoint, deploymentName: 'current-deployment' });
        expect(res.status).toBe(400);
        noUpstream();
    });
    it('never borrows Azure credentials for a public endpoint edit', async () => {
        const res = await testRequest({ provider: 'azure', useConfigured: true,
            endpoint: 'https://new-azure.example', deploymentName: 'current-deployment' });
        expect(res.status).toBe(400);
        noUpstream();
    });
    it('does not silently restore an explicitly cleared Azure credential', async () => {
        const res = await testRequest({ provider: 'azure', useConfigured: true, apiKey: '',
            endpoint: mocks.fixtureConfig.azure.endpoint, deploymentName: 'current-deployment' });
        expect(res.status).toBe(400);
        noUpstream();
    });
    it('allows a temporary public Azure endpoint with the current caller fields', async () => {
        const res = await testRequest({ provider: 'azure', useConfigured: true, apiKey: callerCredential,
            endpoint: 'https://new-azure.example', deploymentName: 'current-deployment', apiVersion: 'current-version' });
        expect(res.status).toBe(200);
        const used = mocks.azure.mock.calls[0]?.[0] as Body;
        expect(used.endpoint).toBe('https://new-azure.example');
        expect(used.apiKey === callerCredential).toBe(true);
        expect(used.deploymentName).toBe('current-deployment');
        expect(used.apiVersion).toBe('current-version');
    });
    it.each([true, false, undefined])('passes raw disableThinking=%s into both OpenAI constructors', async (disableThinking) => {
        mocks.analyzeImage.mockRejectedValueOnce(new Error('VISION_NOT_SUPPORTED'));
        const res = await testRequest({ provider: 'openai', apiKey: callerCredential,
            model: 'current-model', language: 'en', ...(disableThinking === undefined ? {} : { disableThinking }) });
        expect(res.status).toBe(200);
        expect(mocks.openai).toHaveBeenCalledTimes(2);
        expect(mocks.openai.mock.calls.every(([config]) => (config as Body).disableThinking === disableThinking)).toBe(true);
        expect(mocks.generateSimilarQuestion.mock.calls[0]?.[2]).toBe('en');
    });
    it.each([true, false, undefined])('uses saved thinking default and preserves caller override=%s in both constructors', async (disableThinking) => {
        mocks.analyzeImage.mockRejectedValueOnce(new Error('VISION_NOT_SUPPORTED'));
        const res = await testRequest({ provider: 'openai', instanceId: saved.id, model: 'current-model',
            ...(disableThinking === undefined ? {} : { disableThinking }) });
        expect(res.status).toBe(200);
        expect(mocks.openai).toHaveBeenCalledTimes(2);
        expect(mocks.openai.mock.calls.every(([config]) => (config as Body).disableThinking === (disableThinking ?? true))).toBe(true);
        expect((mocks.openai.mock.calls[0]?.[0] as Body).model).toBe('current-model');
    });
    it.each([
        ['instanceId', { instanceId: 123 }], ['useConfigured', { useConfigured: 'true' }],
        ['disableThinking', { disableThinking: 'false' }], ['apiKey', { apiKey: 123 }],
        ['baseUrl', { baseUrl: {} }], ['model', { model: [] }], ['language', { language: 'invalid' }],
    ])('strictly validates %s without upstream requests', async (_field, fields) => {
        const res = await testRequest({ provider: 'openai', apiKey: callerCredential, ...fields });
        expect(res.status).toBe(400);
        noUpstream();
    });
    it.each([null, [], 'invalid'])('rejects a non-object body %#', async (body) => {
        const res = await testRequest(body);
        expect(res.status).toBe(400);
        noUpstream();
    });
});

describe('/api/ai/models: query validation', () => {
    it.each(['useConfigured', 'disableThinking'])('does not coerce arbitrary query %s to boolean', async (field) => {
        const res = await modelsRequest({ provider: 'openai', apiKey: callerCredential, [field]: '1' });
        expect(res.status).toBe(400);
        noUpstream();
    });
    it('rejects Azure model listing instead of using an unrelated OpenAI default endpoint', async () => {
        const res = await modelsRequest({ provider: 'azure', apiKey: callerCredential });
        expect(res.status).toBe(400);
        noUpstream();
    });
});
