/** Pure target-resolution unit tests with a mocked config reader; no real secrets/upstream. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    fixtureConfig: {
        aiProvider: 'openai' as const,
        openai: { instances: [{ id: 'saved', name: 'Fixture', apiKey: 'fixture-credential',
            baseUrl: 'http://fixture.internal/v1', model: 'saved-model', disableThinking: false }] },
        gemini: { apiKey: 'fixture-gemini-credential', baseUrl: 'http://gemini.internal', model: 'saved-gemini' },
    },
    getAppConfig: vi.fn(),
}));
vi.mock('@/lib/config', () => ({ getAppConfig: mocks.getAppConfig }));
import { parseModelsRequest, resolveAIRequestTarget } from '@/lib/ai/request-target';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppConfig.mockReturnValue(mocks.fixtureConfig);
});

describe('AI request target boundary', () => {
    it('selects only the identified saved instance and keeps an explicit false saved default', () => {
        const result = resolveAIRequestTarget({ provider: 'openai', instanceId: 'saved' }, true);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.target.trusted).toBe(true);
        expect(result.target.baseUrl).toBe('http://fixture.internal/v1');
        expect(result.target.disableThinking).toBe(false);
        expect(result.target.apiKey === mocks.fixtureConfig.openai.instances[0].apiKey).toBe(true);
    });
    it('does not infer the active instance or read server credentials on a raw own-key request', () => {
        const result = resolveAIRequestTarget({ provider: 'openai', apiKey: 'fixture-caller-credential' }, false);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.target.trusted).toBe(false);
        expect(result.target.baseUrl).toBe('https://api.openai.com/v1');
        expect(mocks.getAppConfig).not.toHaveBeenCalled();
    });
    it.each(['openai', 'gemini'] as const)('keeps an ordinary %s empty-address request on the default public target', (provider) => {
        const result = resolveAIRequestTarget({ provider, apiKey: 'fixture-public-caller', baseUrl: '', useConfigured: false }, false);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.target.trusted).toBe(false);
        expect(result.target.baseUrl).toBe(provider === 'openai'
            ? 'https://api.openai.com/v1' : 'https://generativelanguage.googleapis.com');
        expect(mocks.getAppConfig).not.toHaveBeenCalled();
    });
    it.each([
        { provider: 'openai', instanceId: 'saved' },
        { provider: 'gemini', useConfigured: true },
        { provider: 'openai', baseUrl: 'https://edited.example/v1' },
        { provider: 'gemini', baseUrl: 'https://edited.example' },
    ])('still denies ordinary configured or nonempty custom target %o', (fields) => {
        const result = resolveAIRequestTarget({ apiKey: 'fixture-public-caller', baseUrl: '', ...fields }, false);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(403);
        expect(mocks.getAppConfig).not.toHaveBeenCalled();
    });
    it('treats useConfigured=false as raw, not truthy configured mode', () => {
        const result = resolveAIRequestTarget({ provider: 'gemini', useConfigured: false,
            apiKey: 'fixture-caller-credential', baseUrl: 'http://gemini.internal' }, true);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.status).toBe(400);
        expect(mocks.getAppConfig).not.toHaveBeenCalled();
    });
    it('cannot authenticate a non-exact private URL by normalizing it', () => {
        const result = resolveAIRequestTarget({ provider: 'openai', instanceId: 'saved',
            apiKey: mocks.fixtureConfig.openai.instances[0].apiKey, baseUrl: 'http://fixture.internal/v1/' }, true);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(400);
    });
    it('never includes a saved credential in an error for a mismatched caller address', () => {
        const result = resolveAIRequestTarget({ provider: 'openai', instanceId: 'saved', baseUrl: 'https://edited.example/v1' }, true);
        expect(result.ok).toBe(false);
        expect(JSON.stringify(result).includes(mocks.fixtureConfig.openai.instances[0].apiKey)).toBe(false);
    });
    it('distinguishes an omitted credential from an explicitly cleared credential', () => {
        const result = resolveAIRequestTarget({ provider: 'openai', instanceId: 'saved', apiKey: '' }, true);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(400);
    });
    it('does not inherit old model/flag defaults on a temporary current public edit', () => {
        const result = resolveAIRequestTarget({ provider: 'openai', instanceId: 'saved',
            apiKey: 'fixture-caller-credential', baseUrl: 'https://edited.example/v1' }, true);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.target.trusted).toBe(false);
        expect(result.target.model).toBeUndefined();
        expect(result.target.disableThinking).toBeUndefined();
    });
    it('rejects non-http protocols even if present in a saved instance', () => {
        mocks.getAppConfig.mockReturnValue({ aiProvider: 'openai', openai: { instances: [{
            ...mocks.fixtureConfig.openai.instances[0], baseUrl: 'file:///fixture',
        }] } });
        const result = resolveAIRequestTarget({ provider: 'openai', instanceId: 'saved' }, true);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(400);
    });
});

describe('model query decoding', () => {
    it('decodes exact true/false literals without coercing false to true', () => {
        const result = parseModelsRequest(new URLSearchParams('provider=openai&useConfigured=false&disableThinking=false'));
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.useConfigured).toBe(false);
        expect(result.data.disableThinking).toBe(false);
    });
    it('preserves the legacy omitted-provider default', () => {
        const result = parseModelsRequest(new URLSearchParams('apiKey=fixture-caller-credential'));
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.provider).toBe('openai');
    });
    it.each(['1', 'yes', 'FALSE'])('rejects a non-boolean query literal %s', (value) => {
        const result = parseModelsRequest(new URLSearchParams({ provider: 'openai', useConfigured: value }));
        expect(result.success).toBe(false);
    });
    it('rejects duplicate target-selection query fields', () => {
        const result = parseModelsRequest(new URLSearchParams('provider=openai&instanceId=saved&instanceId=forged'));
        expect(result.success).toBe(false);
    });
});
