import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: class MockGoogleGenAI {
            models = {
                generateContent: vi.fn(),
            };
        },
    };
});

vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        box: vi.fn(),
    })),
}));

vi.mock('@/lib/config', () => ({
    getAppConfig: vi.fn(() => ({
        prompts: {},
    })),
}));

vi.mock('@/lib/ai/schema', () => ({
    safeParseParsedQuestion: vi.fn((data) => ({ success: true, data })),
}));

// Mock tag service to avoid DB calls
vi.mock('@/lib/ai/tag-service', () => ({
    getMathTagsFromDB: vi.fn().mockResolvedValue([]),
    getTagsFromDB: vi.fn().mockResolvedValue([]),
}));

import { GeminiProvider } from '@/lib/ai/gemini-provider';

describe('GeminiProvider Retry Logic', () => {
    let provider: GeminiProvider;
    let mockGenerateContent: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        // Use fake timers with auto-advance to avoid manual timer management issues
        vi.useFakeTimers({ shouldAdvanceTime: true });
        provider = new GeminiProvider({ apiKey: 'test-key' });
        // @ts-expect-error - accessing private property for testing
        mockGenerateContent = provider.ai.models.generateContent;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should retry on network error and eventually succeed', async () => {
        mockGenerateContent
            .mockRejectedValueOnce(new Error('fetch failed'))
            .mockRejectedValueOnce(new Error('network timeout'))
            .mockResolvedValueOnce({
                text: '<question_text>Q</question_text><answer_text>A</answer_text><analysis>An</analysis><subject>数学</subject>',
                usageMetadata: {}
            });

        // With shouldAdvanceTime: true, fake timers will auto-advance
        const result = await provider.analyzeImage('base64data');

        expect(result).toBeDefined();
        expect(result.questionText).toBe('Q');
        // Initial call + 2 retries = 3 calls
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('should throw immediately on non-retryable error', async () => {
        mockGenerateContent.mockRejectedValue(new Error('AI_AUTH_ERROR: Invalid API Key'));

        // Should fail immediately without retrying
        await expect(provider.analyzeImage('base64data'))
            .rejects
            .toThrow('AI_AUTH_ERROR');

        // Only 1 call, no retries for auth errors
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should give up after max retries', async () => {
        mockGenerateContent.mockRejectedValue(new Error('fetch failed'));

        // With shouldAdvanceTime: true, fake timers will auto-advance through all retries
        await expect(provider.analyzeImage('base64data'))
            .rejects
            .toThrow('AI_CONNECTION_FAILED');

        // 3 attempts total (1 initial + 2 retries)
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('should retry on 503 service unavailable', async () => {
        mockGenerateContent
            .mockRejectedValueOnce(new Error('503 Service Unavailable'))
            .mockResolvedValueOnce({
                text: '<question_text>Q</question_text><answer_text>A</answer_text><analysis>An</analysis><subject>数学</subject>',
                usageMetadata: {}
            });

        const result = await provider.analyzeImage('base64data');

        expect(result).toBeDefined();
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('should retry on connection reset', async () => {
        mockGenerateContent
            .mockRejectedValueOnce(new Error('ECONNRESET'))
            .mockResolvedValueOnce({
                text: '<question_text>Q</question_text><answer_text>A</answer_text><analysis>An</analysis><subject>数学</subject>',
                usageMetadata: {}
            });

        const result = await provider.analyzeImage('base64data');

        expect(result).toBeDefined();
        expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
});
