/**
 * OpenAI 兼容请求的纯单元测试。
 *
 * 全部依赖（OpenAI SDK、logger、数据库标签、提示词）均 mock；
 * 重点检查真正传给 SDK/fetch 的参数，不访问任何上游服务。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    completionCreate: vi.fn(),
    logger: {
        debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), box: vi.fn(), divider: vi.fn(),
    },
    appConfig: { prompts: {} as { analyze?: string; similar?: string } },
    analyzePrompt: vi.fn(() => '<system>analyze</system>'),
    similarPrompt: vi.fn(() => '<system>similar</system>'),
    geogebraPrompt: vi.fn(() => '<system>geogebra</system>'),
    reanswerPrompt: vi.fn(() => '<system>reanswer</system>'),
}));

vi.mock('openai', () => ({
    default: class MockOpenAI {
        chat = { completions: { create: mocks.completionCreate } };
    },
}));
vi.mock('@/lib/logger', () => ({ createLogger: vi.fn(() => mocks.logger) }));
vi.mock('@/lib/config', () => ({ getAppConfig: vi.fn(() => mocks.appConfig) }));
vi.mock('@/lib/ai/tag-service', () => ({
    getMathTagsFromDB: vi.fn(() => Promise.resolve([])),
    getTagsFromDB: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/lib/ai/prompts', () => ({
    generateAnalyzePrompt: mocks.analyzePrompt,
    generateSimilarQuestionPrompt: mocks.similarPrompt,
    generateGeogebraPrompt: mocks.geogebraPrompt,
    generateReanswerPrompt: mocks.reanswerPrompt,
}));


const BASE_CONFIG = { apiKey: 'test-fixture-key', model: 'fixture-model', baseUrl: 'https://api.openai.com/v1' };
const ANALYZE_RESPONSE = '<question_text>题</question_text><answer_text>答</answer_text><analysis>析</analysis>';
const SIMILAR_RESPONSE = '<question_text>相似题</question_text><answer_text>相似答</answer_text><analysis>相似析</analysis>';
const REANSWER_RESPONSE = '<answer_text>新答</answer_text><analysis>新析</analysis>';
const GEOGEBRA_RESPONSE = '{"suitable":true,"commands":["Cmd"],"description":"说明"}';

function capturedParams() {
    const call = mocks.completionCreate.mock.calls.at(-1)?.[0];
    if (!call) throw new Error('SDK was not called');
    return call;
}

describe('OpenAIProvider 思考参数语义（mock SDK，验证实际参数）', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        vi.stubEnv('THINKING_CAPABLE_HOSTS', '');
        vi.clearAllMocks();
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it.each([
        [{ disableThinking: true }, { type: 'disabled' }],
        [{ disableThinking: false }, { type: 'enabled' }],
    ])('显式 %o 优先于未识别端点', async (config, expected) => {
        const { OpenAIProvider } = await import('@/lib/ai/openai-provider');
        const provider = new OpenAIProvider({ ...BASE_CONFIG, ...config });
        mocks.completionCreate
            .mockResolvedValueOnce({ choices: [{ message: { content: ANALYZE_RESPONSE } }] })
            .mockResolvedValueOnce({ choices: [{ message: { content: SIMILAR_RESPONSE } }] })
            .mockResolvedValueOnce({ choices: [{ message: { content: REANSWER_RESPONSE } }] })
            .mockResolvedValueOnce({ choices: [{ message: { content: GEOGEBRA_RESPONSE } }] });
        await provider.analyzeImage('RklY1RSRUlORA==', 'image/png', 'zh', 9, '数学');
        expect(capturedParams().thinking).toEqual(expected);
        expect(capturedParams().max_tokens).toBe(32768);
        await provider.generateSimilarQuestion('题', ['点'], 'zh', 'medium');
        expect(capturedParams().thinking).toEqual(expected);
        expect(capturedParams().max_tokens).toBe(32768);
        await provider.reanswerQuestion('题', 'zh', '数学');
        expect(capturedParams().thinking).toEqual(expected);
        expect(capturedParams().max_tokens).toBe(32768);
        await provider.analyzeForGeogebra('题', '答', '析');
        expect(capturedParams().thinking).toEqual(expected);
        expect(capturedParams().max_tokens).toBe(8192);
    });

    it('端点未识别且无显式值时保留普通操作旧默认 disabled', async () => {
        const { OpenAIProvider } = await import('@/lib/ai/openai-provider');
        const provider = new OpenAIProvider(BASE_CONFIG);
        mocks.completionCreate.mockResolvedValueOnce({ choices: [{ message: { content: SIMILAR_RESPONSE } }] });
        await provider.generateSimilarQuestion('题', ['点'], 'zh', 'medium');
        expect(capturedParams().thinking).toEqual({ type: 'disabled' });
    });

    it('识别思考端点且无显式值时默认 disabled', async () => {
        vi.stubEnv('THINKING_CAPABLE_HOSTS', 'reasoner.example.com');
        const { OpenAIProvider } = await import('@/lib/ai/openai-provider');
        const provider = new OpenAIProvider({ ...BASE_CONFIG, baseUrl: 'https://reasoner.example.com/v1' });
        mocks.completionCreate.mockResolvedValueOnce({ choices: [{ message: { content: SIMILAR_RESPONSE } }] });
        await provider.generateSimilarQuestion('题', ['点'], 'zh', 'medium');
        expect(capturedParams().thinking).toEqual({ type: 'disabled' });
    });

    it.each([
        [{ disableThinking: true }, { type: 'disabled' }],
        [{ disableThinking: false }, { type: 'enabled' }],
    ])('识别端点时显式 %o 覆盖自动识别', async (config, expected) => {
        vi.stubEnv('THINKING_CAPABLE_HOSTS', 'reasoner.example.com');
        const { OpenAIProvider } = await import('@/lib/ai/openai-provider');
        const provider = new OpenAIProvider({ ...BASE_CONFIG, baseUrl: 'https://reasoner.example.com/v1', ...config });
        mocks.completionCreate.mockResolvedValueOnce({ choices: [{ message: { content: SIMILAR_RESPONSE } }] });
        await provider.generateSimilarQuestion('题', ['点'], 'zh', 'medium');
        expect(capturedParams().thinking).toEqual(expected);
    });

    it('普通 SDK 三操作保留 32768 + disabled，GeoGebra 未知端点保留无字段', async () => {
        const { OpenAIProvider } = await import('@/lib/ai/openai-provider');
        const provider = new OpenAIProvider(BASE_CONFIG);
        mocks.completionCreate
            .mockResolvedValueOnce({ choices: [{ message: { content: ANALYZE_RESPONSE } }] })
            .mockResolvedValueOnce({ choices: [{ message: { content: SIMILAR_RESPONSE } }] })
            .mockResolvedValueOnce({ choices: [{ message: { content: REANSWER_RESPONSE } }] })
            .mockResolvedValueOnce({ choices: [{ message: { content: GEOGEBRA_RESPONSE } }] });

        await provider.analyzeImage('RklY1RSRUlORA==', 'image/png', 'zh', 9, '数学');
        expect(capturedParams().max_tokens).toBe(32768);
        expect(capturedParams().thinking).toEqual({ type: 'disabled' });

        await provider.generateSimilarQuestion('题', ['点'], 'zh', 'medium');
        expect(capturedParams().max_tokens).toBe(32768);
        expect(capturedParams().thinking).toEqual({ type: 'disabled' });

        await provider.reanswerQuestion('题', 'zh', '数学');
        expect(capturedParams().max_tokens).toBe(32768);
        expect(capturedParams().thinking).toEqual({ type: 'disabled' });

        await provider.analyzeForGeogebra('题', '答', '析');
        expect(capturedParams().max_tokens).toBe(8192);
        // 未知端点的旧兼容：无显式值时不发送 thinking 字段。
        expect(capturedParams().thinking).toBeUndefined();
    });

    it.each([
        { disableThinking: undefined, expected: 'disabled' },
        { disableThinking: true, expected: 'disabled' },
        { disableThinking: false, expected: 'enabled' },
    ])('LongCat 镜像分支保留旧默认并接受显式 $disableThinking', async ({ disableThinking, expected }) => {
        vi.stubEnv('THINKING_CAPABLE_HOSTS', '');
        const { OpenAIProvider } = await import('@/lib/ai/openai-provider');
        const longCat = new OpenAIProvider({ ...BASE_CONFIG, baseUrl: 'https://api.longcat.chat/openai', disableThinking });
        const response = { json: vi.fn(async () => ({ choices: [{ message: { content: ANALYZE_RESPONSE } }] })), ok: true };
        vi.stubGlobal('fetch', vi.fn(async () => response));
        await longCat.analyzeImage('RklY1RSRUlORA==', 'image/png', 'zh', 9, '数学');
        const lastFetch = vi.mocked(fetch).mock.calls.at(-1);
        expect(lastFetch).toBeDefined();
        const body = JSON.parse(lastFetch![1]!.body as string);
        expect(body.max_tokens).toBe(32768);
        expect(body.thinking).toEqual({ type: expected });
    });
});

describe('连接测试与模型列表客户端配置契约（mock fetch，仅检查请求）', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ models: [] }) })));
    });

    afterEach(() => vi.unstubAllGlobals());

    it('连接测试携带 instanceId 与显式 false，且不发送服务器旧密钥/地址', async () => {
        const { buildAITestRequest } = await import('@/lib/ai/client-request');
        const request = buildAITestRequest({
            provider: 'openai',
            apiKey: 'draft-fixture-key',
            baseUrl: 'https://draft.example.com/v1',
            model: 'draft-model',
            language: 'zh',
            instanceId: 'draft-instance',
            useConfigured: false,
            disableThinking: false,
            saved: { apiKey: 'server-secret', baseUrl: 'https://server.example.com/v1' },
        });
        expect(request).toEqual({
            provider: 'openai',
            apiKey: 'draft-fixture-key',
            baseUrl: 'https://draft.example.com/v1',
            model: 'draft-model',
            language: 'zh',
            instanceId: 'draft-instance',
            useConfigured: false,
            disableThinking: false,
        });
        expect(JSON.stringify(request)).not.toContain('server-secret');
        expect(JSON.stringify(request)).not.toContain('server.example.com');
    });

    it('模型列表查询携带 instanceId，省略服务器配置密钥/地址', async () => {
        const { buildModelListParams } = await import('@/lib/ai/client-request');
        const params = buildModelListParams({
            provider: 'openai',
            apiKey: 'draft-fixture-key',
            baseUrl: 'https://draft.example.com/v1',
            instanceId: 'draft-instance',
            saved: { apiKey: 'server-secret', baseUrl: 'https://server.example.com/v1' },
        });
        expect(Object.fromEntries(params)).toEqual({
            provider: 'openai',
            apiKey: 'draft-fixture-key',
            baseUrl: 'https://draft.example.com/v1',
            instanceId: 'draft-instance',
        });
    });
});
