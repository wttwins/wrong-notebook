/**
 * /api/reanswer API 集成测试
 * 测试重新回答问题接口
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are initialized before module imports
const mocks = vi.hoisted(() => ({
    mockAIService: {
        reanswerQuestion: vi.fn(),
    },
    mockSession: {
        user: {
            email: 'user@example.com',
            name: 'Test User',
        },
        expires: '2025-12-31',
    },
}));

// Mock AI service
vi.mock('@/lib/ai', () => ({
    getAIService: vi.fn(() => mocks.mockAIService),
}));

// Mock next-auth
vi.mock('next-auth', () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock('@/lib/auth', () => ({
    authOptions: {},
}));

// Import after mocks
import { POST } from '@/app/api/reanswer/route';

describe('/api/reanswer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/reanswer (重新回答问题)', () => {
        it('应该成功重新回答问题', async () => {
            const aiResult = {
                answerText: 'x = 3',
                analysis: '移项得 x = 5 - 2 = 3',
                knowledgePoints: ['一元一次方程', '移项'],
            };
            mocks.mockAIService.reanswerQuestion.mockResolvedValue(aiResult);

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: '求解 x + 2 = 5',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.answerText).toBe('x = 3');
            expect(data.analysis).toContain('移项');
        });

        it('应该支持指定学科', async () => {
            const aiResult = {
                answerText: 'The answer is B',
                analysis: 'Grammar analysis...',
                knowledgePoints: ['Grammar', 'Tenses'],
            };
            mocks.mockAIService.reanswerQuestion.mockResolvedValue(aiResult);

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: 'Choose the correct answer: He ___ to school yesterday.',
                    language: 'zh',
                    subject: '英语',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mocks.mockAIService.reanswerQuestion).toHaveBeenCalledWith(
                expect.any(String),
                'zh',
                '英语',
                undefined,
                undefined
            );
        });

        it('应该支持附带图片', async () => {
            const aiResult = {
                answerText: '∠A = 60°',
                analysis: '根据三角形内角和定理...',
                knowledgePoints: ['三角形', '内角和'],
            };
            mocks.mockAIService.reanswerQuestion.mockResolvedValue(aiResult);

            const imageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA...';

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: '求图中 ∠A 的度数',
                    language: 'zh',
                    subject: '数学',
                    imageBase64,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mocks.mockAIService.reanswerQuestion).toHaveBeenCalledWith(
                expect.any(String),
                'zh',
                '数学',
                imageBase64,
                undefined
            );
        });

        it('应该支持英文语言', async () => {
            const aiResult = {
                answerText: 'x = 3',
                analysis: 'By transposition, x = 5 - 2 = 3',
                knowledgePoints: ['Linear Equations'],
            };
            mocks.mockAIService.reanswerQuestion.mockResolvedValue(aiResult);

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: 'Solve: x + 2 = 5',
                    language: 'en',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mocks.mockAIService.reanswerQuestion).toHaveBeenCalledWith(
                expect.any(String),
                'en',
                undefined,
                undefined,
                undefined
            );
        });

        it('应该默认使用中文语言', async () => {
            mocks.mockAIService.reanswerQuestion.mockResolvedValue({
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: '求解方程',
                    // 不指定 language
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            expect(mocks.mockAIService.reanswerQuestion).toHaveBeenCalledWith(
                expect.any(String),
                'zh', // 默认中文
                undefined,
                undefined,
                undefined
            );
        });

        it('应该拒绝空的题目文本', async () => {
            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: '',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe('Missing question text');
        });

        it('应该拒绝只有空格的题目文本', async () => {
            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: '   ',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe('Missing question text');
        });

        it('应该拒绝缺少题目文本的请求', async () => {
            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe('Missing question text');
        });
    });

    describe('错误处理', () => {
        it('应该处理 AI 认证错误', async () => {
            mocks.mockAIService.reanswerQuestion.mockRejectedValue(
                new Error('AI_AUTH_ERROR: Invalid API key')
            );

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: '求解方程',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('AI_AUTH_ERROR');
        });

        it('应该处理 AI 连接错误', async () => {
            mocks.mockAIService.reanswerQuestion.mockRejectedValue(
                new Error('AI_CONNECTION_FAILED')
            );

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: '求解方程',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('AI_CONNECTION_FAILED');
        });

        it('应该处理 AI 响应错误', async () => {
            mocks.mockAIService.reanswerQuestion.mockRejectedValue(
                new Error('AI_RESPONSE_ERROR')
            );

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: '求解方程',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('AI_RESPONSE_ERROR');
        });

        it('应该处理其他未知错误', async () => {
            mocks.mockAIService.reanswerQuestion.mockRejectedValue(
                new Error('Unknown error occurred')
            );

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: '求解方程',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('Unknown error occurred');
        });

        it('应该处理没有错误消息的异常', async () => {
            mocks.mockAIService.reanswerQuestion.mockRejectedValue(new Error());

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: '求解方程',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('Failed to reanswer question');
        });
    });

    describe('复杂场景', () => {
        it('应该正确处理长文本题目', async () => {
            const longQuestionText = '已知函数 f(x) = ax² + bx + c，其中 a > 0。' +
                '若 f(x) 在 x = 1 处取得最小值 -1，且 f(0) = 0。' +
                '(1) 求函数 f(x) 的解析式；' +
                '(2) 求函数 f(x) 在区间 [-1, 2] 上的最大值和最小值；' +
                '(3) 若不等式 f(x) > m 在 x ∈ [0, 2] 上恒成立，求 m 的取值范围。';

            const aiResult = {
                answerText: '(1) f(x) = x² - 2x; (2) 最大值 0, 最小值 -1; (3) m < -1',
                analysis: '详细解析...',
                knowledgePoints: ['二次函数', '最值', '不等式'],
            };
            mocks.mockAIService.reanswerQuestion.mockResolvedValue(aiResult);

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: longQuestionText,
                    language: 'zh',
                    subject: '数学',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.answerText).toBeDefined();
            expect(mocks.mockAIService.reanswerQuestion).toHaveBeenCalledWith(
                longQuestionText,
                'zh',
                '数学',
                undefined,
                undefined
            );
        });

        it('应该正确处理包含特殊字符的题目', async () => {
            const questionWithSpecialChars = '求解 √(x² + 1) = x + 1 的解集';

            const aiResult = {
                answerText: 'x = 0',
                analysis: '平方两边...',
                knowledgePoints: ['根式方程'],
            };
            mocks.mockAIService.reanswerQuestion.mockResolvedValue(aiResult);

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: questionWithSpecialChars,
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
        });

        it('应该正确处理包含 LaTeX 的题目', async () => {
            const questionWithLatex = '求 $\\int_0^1 x^2 dx$ 的值';

            const aiResult = {
                answerText: '$\\frac{1}{3}$',
                analysis: '使用积分公式...',
                knowledgePoints: ['定积分'],
            };
            mocks.mockAIService.reanswerQuestion.mockResolvedValue(aiResult);

            const request = new Request('http://localhost/api/reanswer', {
                method: 'POST',
                body: JSON.stringify({
                    questionText: questionWithLatex,
                    language: 'zh',
                    subject: '数学',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.answerText).toContain('frac');
        });
    });
});
