/**
 * Azure OpenAI Provider 单元测试
 *
 * 测试 Azure OpenAI 服务初始化和错误处理
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Azure OpenAI SDK
vi.mock('openai', () => {
    return {
        AzureOpenAI: class MockAzureOpenAI {
            chat = {
                completions: {
                    create: vi.fn(),
                },
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
    getAppConfig: vi.fn(() => ({
        aiProvider: 'azure',
        azure: {
            apiKey: 'test-key',
            endpoint: 'https://test.openai.azure.com',
            deploymentName: 'gpt-4o',
            apiVersion: '2024-02-15-preview',
        },
    })),
}));

// Mock tag service
vi.mock('@/lib/ai/tag-service', () => ({
    getMathTagsFromDB: vi.fn(() => Promise.resolve([])),
    getTagsFromDB: vi.fn(() => Promise.resolve([])),
}));

// Mock jsonrepair
vi.mock('jsonrepair', () => ({
    jsonrepair: vi.fn((str) => str),
}));

// Delayed import to ensure mocks are applied
import { AzureOpenAIProvider } from '@/lib/ai/azure-provider';

describe('Azure OpenAI Provider 初始化', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('构造函数验证', () => {
        it('缺少 API Key 时应该抛出 AI_AUTH_ERROR', () => {
            expect(() => new AzureOpenAIProvider({
                endpoint: 'https://test.openai.azure.com',
                deploymentName: 'gpt-4o',
            })).toThrow('AI_AUTH_ERROR');
            expect(() => new AzureOpenAIProvider({
                endpoint: 'https://test.openai.azure.com',
                deploymentName: 'gpt-4o',
            })).toThrow('AZURE_OPENAI_API_KEY is required');
        });

        it('API Key 为空字符串时应该抛出 AI_AUTH_ERROR', () => {
            expect(() => new AzureOpenAIProvider({
                apiKey: '',
                endpoint: 'https://test.openai.azure.com',
                deploymentName: 'gpt-4o',
            })).toThrow('AI_AUTH_ERROR');
        });

        it('缺少 endpoint 时应该抛出 AI_AUTH_ERROR', () => {
            expect(() => new AzureOpenAIProvider({
                apiKey: 'test-key',
                deploymentName: 'gpt-4o',
            })).toThrow('AI_AUTH_ERROR');
            expect(() => new AzureOpenAIProvider({
                apiKey: 'test-key',
                deploymentName: 'gpt-4o',
            })).toThrow('AZURE_OPENAI_ENDPOINT is required');
        });

        it('endpoint 为空字符串时应该抛出 AI_AUTH_ERROR', () => {
            expect(() => new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: '',
                deploymentName: 'gpt-4o',
            })).toThrow('AI_AUTH_ERROR');
        });

        it('缺少 deploymentName 时应该抛出 AI_AUTH_ERROR', () => {
            expect(() => new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: 'https://test.openai.azure.com',
            })).toThrow('AI_AUTH_ERROR');
            expect(() => new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: 'https://test.openai.azure.com',
            })).toThrow('AZURE_OPENAI_DEPLOYMENT is required');
        });

        it('deploymentName 为空字符串时应该抛出 AI_AUTH_ERROR', () => {
            expect(() => new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: 'https://test.openai.azure.com',
                deploymentName: '',
            })).toThrow('AI_AUTH_ERROR');
        });

        it('有效配置时应该成功创建实例', () => {
            const provider = new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: 'https://test.openai.azure.com',
                deploymentName: 'gpt-4o',
            });

            expect(provider).toBeDefined();
            expect(typeof provider.analyzeImage).toBe('function');
            expect(typeof provider.generateSimilarQuestion).toBe('function');
            expect(typeof provider.reanswerQuestion).toBe('function');
        });

        it('应该使用默认 API 版本', () => {
            const provider = new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: 'https://test.openai.azure.com',
                deploymentName: 'gpt-4o',
            });

            expect(provider).toBeDefined();
        });

        it('应该支持自定义 API 版本', () => {
            const provider = new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: 'https://test.openai.azure.com',
                deploymentName: 'gpt-4o',
                apiVersion: '2024-06-01',
            });

            expect(provider).toBeDefined();
        });

        it('应该支持自定义 model 显示名称', () => {
            const provider = new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: 'https://test.openai.azure.com',
                deploymentName: 'my-gpt-4o-deployment',
                model: 'gpt-4o',
            });

            expect(provider).toBeDefined();
        });
    });

    describe('方法验证', () => {
        it('analyzeImage 方法应该存在并且是函数', () => {
            const provider = new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: 'https://test.openai.azure.com',
                deploymentName: 'gpt-4o',
            });

            expect(provider.analyzeImage).toBeDefined();
            expect(typeof provider.analyzeImage).toBe('function');
        });

        it('generateSimilarQuestion 方法应该存在并且是函数', () => {
            const provider = new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: 'https://test.openai.azure.com',
                deploymentName: 'gpt-4o',
            });

            expect(provider.generateSimilarQuestion).toBeDefined();
            expect(typeof provider.generateSimilarQuestion).toBe('function');
        });

        it('reanswerQuestion 方法应该存在并且是函数', () => {
            const provider = new AzureOpenAIProvider({
                apiKey: 'test-key',
                endpoint: 'https://test.openai.azure.com',
                deploymentName: 'gpt-4o',
            });

            expect(provider.reanswerQuestion).toBeDefined();
            expect(typeof provider.reanswerQuestion).toBe('function');
        });
    });
});

describe('Azure OpenAI Provider 响应解析', () => {
    let provider: AzureOpenAIProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new AzureOpenAIProvider({
            apiKey: 'test-key',
            endpoint: 'https://test.openai.azure.com',
            deploymentName: 'gpt-4o',
        });
    });

    describe('parseResponse', () => {
        it('应该正确解析包含所有必需标签的响应', () => {
            const mockResponse = `
<question_text>求函数 f(x) = x^2 的最小值</question_text>
<answer_text>最小值为 0</answer_text>
<analysis>这是一个二次函数,开口向上,顶点在原点,因此最小值为 0</analysis>
<subject>数学</subject>
<knowledge_points>二次函数, 函数最值</knowledge_points>
<requires_image>true</requires_image>
            `.trim();

            // Access private method via type assertion
            const result = (provider as any).parseResponse(mockResponse);

            expect(result.questionText).toBe('求函数 f(x) = x^2 的最小值');
            expect(result.answerText).toBe('最小值为 0');
            expect(result.analysis).toContain('二次函数');
            expect(result.subject).toBe('数学');
            expect(result.knowledgePoints).toContain('二次函数');
            expect(result.knowledgePoints).toContain('函数最值');
            expect(result.requiresImage).toBe(true);
        });

        it('应该正确处理 requiresImage 为 false', () => {
            const mockResponse = `
<question_text>测试题目</question_text>
<answer_text>测试答案</answer_text>
<analysis>测试解析</analysis>
<requires_image>false</requires_image>
            `.trim();

            const result = (provider as any).parseResponse(mockResponse);

            expect(result.requiresImage).toBe(false);
        });

        it('应该正确处理无效学科返回默认值"其他"', () => {
            const mockResponse = `
<question_text>测试题目</question_text>
<answer_text>测试答案</answer_text>
<analysis>测试解析</analysis>
<subject>无效学科</subject>
            `.trim();

            const result = (provider as any).parseResponse(mockResponse);

            expect(result.subject).toBe('其他');
        });

        it('应该正确分割知识点(逗号分隔)', () => {
            const mockResponse = `
<question_text>测试题目</question_text>
<answer_text>测试答案</answer_text>
<analysis>测试解析</analysis>
<knowledge_points>知识点1, 知识点2, 知识点3</knowledge_points>
            `.trim();

            const result = (provider as any).parseResponse(mockResponse);

            expect(result.knowledgePoints).toHaveLength(3);
            expect(result.knowledgePoints).toContain('知识点1');
            expect(result.knowledgePoints).toContain('知识点2');
            expect(result.knowledgePoints).toContain('知识点3');
        });

        it('应该正确分割知识点(中文逗号分隔)', () => {
            const mockResponse = `
<question_text>测试题目</question_text>
<answer_text>测试答案</answer_text>
<analysis>测试解析</analysis>
<knowledge_points>知识点1,知识点2,知识点3</knowledge_points>
            `.trim();

            const result = (provider as any).parseResponse(mockResponse);

            expect(result.knowledgePoints).toHaveLength(3);
        });

        it('缺少必需标签时应该抛出错误', () => {
            const mockResponse = `
<question_text>测试题目</question_text>
<answer_text>测试答案</answer_text>
            `.trim();

            expect(() => (provider as any).parseResponse(mockResponse)).toThrow('Missing critical XML tags');
        });
    });

    describe('extractTag', () => {
        it('应该正确提取标签内容', () => {
            const text = '<test>content</test>';
            const result = (provider as any).extractTag(text, 'test');

            expect(result).toBe('content');
        });

        it('应该去除首尾空格', () => {
            const text = '<test>  content with spaces  </test>';
            const result = (provider as any).extractTag(text, 'test');

            expect(result).toBe('content with spaces');
        });

        it('标签不存在时应该返回 null', () => {
            const text = '<other>content</other>';
            const result = (provider as any).extractTag(text, 'test');

            expect(result).toBeNull();
        });

        it('应该处理多行内容', () => {
            const text = `
<test>
line 1
line 2
line 3
</test>
            `.trim();
            const result = (provider as any).extractTag(text, 'test');

            expect(result).toContain('line 1');
            expect(result).toContain('line 2');
            expect(result).toContain('line 3');
        });
    });
});

describe('Azure OpenAI Provider 错误处理', () => {
    let provider: AzureOpenAIProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new AzureOpenAIProvider({
            apiKey: 'test-key',
            endpoint: 'https://test.openai.azure.com',
            deploymentName: 'gpt-4o',
        });
    });

    describe('handleError', () => {
        it('应该将网络错误转换为 AI_CONNECTION_FAILED', () => {
            const networkError = new Error('fetch failed');

            expect(() => (provider as any).handleError(networkError)).toThrow('AI_CONNECTION_FAILED');
        });

        it('应该将连接错误转换为 AI_CONNECTION_FAILED', () => {
            const connectionError = new Error('Failed to connect to server');

            expect(() => (provider as any).handleError(connectionError)).toThrow('AI_CONNECTION_FAILED');
        });

        it('应该将认证错误转换为 AI_AUTH_ERROR', () => {
            const authError = new Error('Unauthorized: Invalid API key');

            expect(() => (provider as any).handleError(authError)).toThrow('AI_AUTH_ERROR');
        });

        it('应该将 401 错误转换为 AI_AUTH_ERROR', () => {
            const authError = new Error('Request failed with status 401');

            expect(() => (provider as any).handleError(authError)).toThrow('AI_AUTH_ERROR');
        });

        it('应该将 JSON 解析错误转换为 AI_RESPONSE_ERROR', () => {
            const parseError = new Error('Invalid JSON format');

            expect(() => (provider as any).handleError(parseError)).toThrow('AI_RESPONSE_ERROR');
        });

        it('未知错误应该转换为 AI_UNKNOWN_ERROR', () => {
            const unknownError = new Error('Something went wrong');

            expect(() => (provider as any).handleError(unknownError)).toThrow('AI_UNKNOWN_ERROR');
        });

        it('非 Error 对象应该转换为 AI_UNKNOWN_ERROR', () => {
            const unknownError = 'string error';

            expect(() => (provider as any).handleError(unknownError)).toThrow('AI_UNKNOWN_ERROR');
        });
    });
});
