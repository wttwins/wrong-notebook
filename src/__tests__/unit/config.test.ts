/**
 * 应用配置模块单元测试
 * 测试 getAppConfig 和 updateAppConfig 函数
 * 注意：这些测试 mock 了文件系统操作
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock fs module
vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
}));

// Store original env
const originalEnv = { ...process.env };

describe('config module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset environment variables
        process.env = { ...originalEnv };
        // Clear module cache to re-import with fresh state
        vi.resetModules();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('getAppConfig', () => {
        it('应该返回默认配置（文件不存在时）', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const { getAppConfig } = await import('@/lib/config');
            const config = getAppConfig();

            expect(config.aiProvider).toBe('gemini'); // 默认值
            expect(config.allowRegistration).toBe(true);
        });

        it('应该从环境变量读取 AI Provider', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            process.env.AI_PROVIDER = 'openai';

            const { getAppConfig } = await import('@/lib/config');
            const config = getAppConfig();

            expect(config.aiProvider).toBe('openai');
        });

        it('应该从环境变量读取 API Keys', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            process.env.OPENAI_API_KEY = 'sk-env-key';
            process.env.GOOGLE_API_KEY = 'AIza-env-key';

            const { getAppConfig } = await import('@/lib/config');
            const config = getAppConfig();

            // OpenAI 现在使用多实例格式
            expect(config.openai?.instances?.[0]?.apiKey).toBe('sk-env-key');
            expect(config.gemini?.apiKey).toBe('AIza-env-key');
        });

        it('应该从配置文件读取并与默认值合并', async () => {
            // 新格式的配置文件
            const fileConfig = {
                aiProvider: 'openai',
                openai: {
                    instances: [{
                        id: 'test-instance',
                        name: 'Test',
                        apiKey: 'sk-file-key',
                        baseUrl: 'https://api.openai.com/v1',
                        model: 'gpt-4o',
                    }],
                    activeInstanceId: 'test-instance',
                },
            };
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

            const { getAppConfig } = await import('@/lib/config');
            const config = getAppConfig();

            expect(config.aiProvider).toBe('openai');
            expect(config.openai?.instances?.[0]?.apiKey).toBe('sk-file-key');
            // 其他默认值应该保留
            expect(config.allowRegistration).toBe(true);
            expect(config.gemini).toBeDefined();
        });

        it('应该在配置文件解析失败时返回默认值', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue('invalid json{');

            const { getAppConfig } = await import('@/lib/config');
            const config = getAppConfig();

            // 应该回退到默认配置
            expect(config.aiProvider).toBeDefined();
        });

        it('应该使用环境变量的模型名称', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            process.env.OPENAI_API_KEY = 'sk-test';
            process.env.OPENAI_MODEL = 'gpt-4-turbo';
            process.env.GEMINI_MODEL = 'gemini-3.0';

            const { getAppConfig } = await import('@/lib/config');
            const config = getAppConfig();

            expect(config.openai?.instances?.[0]?.model).toBe('gpt-4-turbo');
            expect(config.gemini?.model).toBe('gemini-3.0');
        });

        it('应该使用默认模型名称（无环境变量时）', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            process.env.OPENAI_API_KEY = 'sk-test';
            delete process.env.OPENAI_MODEL;
            delete process.env.GEMINI_MODEL;

            const { getAppConfig } = await import('@/lib/config');
            const config = getAppConfig();

            expect(config.openai?.instances?.[0]?.model).toBe('gpt-4o');
            expect(config.gemini?.model).toBe('gemini-2.5-flash');
        });
    });

    describe('updateAppConfig', () => {
        it('应该成功写入配置文件', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            vi.mocked(fs.writeFileSync).mockImplementation(() => { });

            const { updateAppConfig } = await import('@/lib/config');
            const result = updateAppConfig({ aiProvider: 'openai' });

            expect(fs.writeFileSync).toHaveBeenCalled();
            expect(result.aiProvider).toBe('openai');
        });

        it('应该合并嵌套配置', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            vi.mocked(fs.writeFileSync).mockImplementation(() => { });

            const { updateAppConfig } = await import('@/lib/config');
            const result = updateAppConfig({
                openai: {
                    instances: [{
                        id: 'new-instance',
                        name: 'New',
                        apiKey: 'new-key',
                        baseUrl: 'https://api.openai.com/v1',
                        model: 'gpt-4o',
                    }],
                    activeInstanceId: 'new-instance',
                },
            });

            expect(result.openai?.instances?.[0]?.apiKey).toBe('new-key');
            // 实例应该存在
            expect(result.openai?.instances?.length).toBeGreaterThan(0);
        });

        it('应该在写入失败时抛出错误', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            vi.mocked(fs.writeFileSync).mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const { updateAppConfig } = await import('@/lib/config');

            expect(() => updateAppConfig({ aiProvider: 'openai' })).toThrow();
        });

        it('应该更新提示词配置', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            vi.mocked(fs.writeFileSync).mockImplementation(() => { });

            const { updateAppConfig } = await import('@/lib/config');
            const result = updateAppConfig({
                prompts: { analyze: '自定义提示词' },
            });

            expect(result.prompts?.analyze).toBe('自定义提示词');
        });

        it('应该更新注册开关', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            vi.mocked(fs.writeFileSync).mockImplementation(() => { });

            const { updateAppConfig } = await import('@/lib/config');
            const result = updateAppConfig({ allowRegistration: false });

            expect(result.allowRegistration).toBe(false);
        });
    });
});
