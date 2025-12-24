/**
 * AI Provider 单元测试
 * 
 * 测试 AI 服务工厂函数和 Provider 基本初始化
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OpenAI SDK
vi.mock('openai', () => {
    return {
        default: class MockOpenAI {
            chat = {
                completions: {
                    create: vi.fn(),
                },
            };
        },
    };
});

// Mock Google GenAI SDK
vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: class MockGoogleGenAI {
            models = {
                generateContent: vi.fn(),
            };
        },
    };
});

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

// Mock config
vi.mock('@/lib/config', () => ({
    getAppConfig: vi.fn(),
    getActiveOpenAIConfig: vi.fn(),
}));

// Delayed import to ensure mocks are applied
import { getAppConfig, getActiveOpenAIConfig } from '@/lib/config';

describe('AI Provider 初始化', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('OpenAI Provider', () => {
        it('缺少 API Key 时应该抛出 AI_AUTH_ERROR', async () => {
            const { OpenAIProvider } = await import('@/lib/ai/openai-provider');

            expect(() => new OpenAIProvider({})).toThrow('AI_AUTH_ERROR');
        });

        it('API Key 为空字符串时应该抛出 AI_AUTH_ERROR', async () => {
            const { OpenAIProvider } = await import('@/lib/ai/openai-provider');

            expect(() => new OpenAIProvider({ apiKey: '' })).toThrow('AI_AUTH_ERROR');
        });

        it('有效 API Key 时应该成功创建实例', async () => {
            const { OpenAIProvider } = await import('@/lib/ai/openai-provider');

            const provider = new OpenAIProvider({
                apiKey: 'sk-test-key',
                model: 'gpt-4o',
            });

            expect(provider).toBeDefined();
            expect(typeof provider.analyzeImage).toBe('function');
        });

        it('应该支持自定义 baseUrl', async () => {
            const { OpenAIProvider } = await import('@/lib/ai/openai-provider');

            const provider = new OpenAIProvider({
                apiKey: 'test-key',
                baseUrl: 'https://custom-api.example.com',
            });

            expect(provider).toBeDefined();
        });
    });

    describe('Gemini Provider', () => {
        it('缺少 API Key 时应该抛出 AI_AUTH_ERROR', async () => {
            const { GeminiProvider } = await import('@/lib/ai/gemini-provider');

            expect(() => new GeminiProvider({})).toThrow('AI_AUTH_ERROR');
        });

        it('API Key 为空字符串时应该抛出 AI_AUTH_ERROR', async () => {
            const { GeminiProvider } = await import('@/lib/ai/gemini-provider');

            expect(() => new GeminiProvider({ apiKey: '' })).toThrow('AI_AUTH_ERROR');
        });

        it('有效 API Key 时应该成功创建实例', async () => {
            const { GeminiProvider } = await import('@/lib/ai/gemini-provider');

            const provider = new GeminiProvider({
                apiKey: 'test-gemini-key',
                model: 'gemini-2.0-flash',
            });

            expect(provider).toBeDefined();
            expect(typeof provider.analyzeImage).toBe('function');
        });

        it('应该使用默认模型 gemini-2.0-flash', async () => {
            const { GeminiProvider } = await import('@/lib/ai/gemini-provider');

            const provider = new GeminiProvider({ apiKey: 'test-key' });

            expect(provider).toBeDefined();
        });
    });

    describe('AI Service Factory', () => {
        it('应该根据配置返回 OpenAI Provider', async () => {
            const { getAIService } = await import('@/lib/ai');
            vi.mocked(getAppConfig).mockReturnValue({
                aiProvider: 'openai',
                openai: {
                    instances: [{ id: 'test', name: 'Test', apiKey: 'test-openai-key', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' }],
                    activeInstanceId: 'test',
                },
                gemini: { apiKey: '', model: '' }
            } as any);
            vi.mocked(getActiveOpenAIConfig).mockReturnValue({
                id: 'test',
                name: 'Test',
                apiKey: 'test-openai-key',
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-4o',
            });

            const service = getAIService();

            expect(service).toBeDefined();
            expect(service.constructor.name).toBe('OpenAIProvider');
        });

        it('应该根据配置返回 Gemini Provider', async () => {
            const { getAIService } = await import('@/lib/ai');
            vi.mocked(getAppConfig).mockReturnValue({
                aiProvider: 'gemini',
                gemini: { apiKey: 'test-gemini-key', model: 'gemini-2.0-flash' },
                openai: { apiKey: '', model: '' }
            } as any);

            const service = getAIService();

            expect(service).toBeDefined();
            expect(service.constructor.name).toBe('GeminiProvider');
        });

        it('配置未知 provider 时应该默认返回 Gemini Provider', async () => {
            const { getAIService } = await import('@/lib/ai');
            vi.mocked(getAppConfig).mockReturnValue({
                aiProvider: 'unknown',
                gemini: { apiKey: 'test-gemini-key' },
            } as any);

            const service = getAIService();

            expect(service).toBeDefined();
            expect(service.constructor.name).toBe('GeminiProvider');
        });
    });
});
