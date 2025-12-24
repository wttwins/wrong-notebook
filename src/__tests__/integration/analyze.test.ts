/**
 * /api/analyze API 集成测试
 * 测试图像分析接口
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are initialized before module imports
const mocks = vi.hoisted(() => ({
    mockPrismaUser: {
        findUnique: vi.fn(),
    },
    mockPrismaSubject: {
        findUnique: vi.fn(),
    },
    mockAIService: {
        analyzeImage: vi.fn(),
    },
    mockSession: {
        user: {
            email: 'user@example.com',
            name: 'Test User',
        },
        expires: '2025-12-31',
    },
}));

// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        subject: mocks.mockPrismaSubject,
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

// Mock knowledge-tags
vi.mock('@/lib/knowledge-tags', () => ({
    normalizeTags: vi.fn((tags: string[]) => tags),
    normalizeTagsByGradeAndSubject: vi.fn((tags: string[]) => tags),
    calculateGradeNumber: vi.fn(() => 7),
    inferSubjectFromName: vi.fn(() => 'math'),
}));

// Import after mocks
import { POST } from '@/app/api/analyze/route';
import { getServerSession } from 'next-auth';

describe('/api/analyze', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);
    });

    describe('POST /api/analyze (图像分析)', () => {
        it('应该成功分析图像', async () => {
            const aiResult = {
                questionText: '求解 x + 2 = 5',
                answerText: 'x = 3',
                analysis: '移项得 x = 5 - 2 = 3',
                knowledgePoints: ['一元一次方程', '移项'],
            };
            mocks.mockAIService.analyzeImage.mockResolvedValue(aiResult);
            mocks.mockPrismaUser.findUnique.mockResolvedValue({
                educationStage: 'junior_high',
                enrollmentYear: 2024,
            });

            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...',
                    mimeType: 'image/png',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.questionText).toBe('求解 x + 2 = 5');
            expect(data.answerText).toBe('x = 3');
            expect(data.knowledgePoints).toHaveLength(2);
        });

        it('应该支持 Data URL 格式的图像', async () => {
            const aiResult = {
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            };
            mocks.mockAIService.analyzeImage.mockResolvedValue(aiResult);

            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    imageBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
            // 验证 AI 服务被调用
            expect(mocks.mockAIService.analyzeImage).toHaveBeenCalled();
            // 验证解析后的 mimeType 被正确传递
            const callArgs = mocks.mockAIService.analyzeImage.mock.calls[0];
            expect(callArgs[1]).toBe('image/jpeg');
        });

        it('应该拒绝缺少图像数据的请求', async () => {
            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe('Missing image data');
        });

        it('应该关联到指定的科目', async () => {
            mocks.mockPrismaUser.findUnique.mockResolvedValue({
                educationStage: 'junior_high',
                enrollmentYear: 2024,
            });
            mocks.mockPrismaSubject.findUnique.mockResolvedValue({
                name: '物理',
            });
            mocks.mockAIService.analyzeImage.mockResolvedValue({
                questionText: '物理题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: ['力学'],
            });

            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    imageBase64: 'data:image/png;base64,test...',
                    language: 'zh',
                    subjectId: 'subject-physics-id',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);

            expect(response.status).toBe(200);
        });

        it('应该支持英文语言', async () => {
            mocks.mockAIService.analyzeImage.mockResolvedValue({
                questionText: 'Solve: x + 2 = 5',
                answerText: 'x = 3',
                analysis: 'By transposition...',
                knowledgePoints: ['Linear Equations'],
            });

            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    imageBase64: 'data:image/png;base64,test...',
                    language: 'en',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.questionText).toContain('Solve');
        });

        it('应该处理 AI 认证错误', async () => {
            mocks.mockAIService.analyzeImage.mockRejectedValue(
                new Error('AI_AUTH_ERROR: Invalid API key')
            );

            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    imageBase64: 'data:image/png;base64,test...',
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
            mocks.mockAIService.analyzeImage.mockRejectedValue(
                new Error('AI_CONNECTION_FAILED')
            );

            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    imageBase64: 'data:image/png;base64,test...',
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
            mocks.mockAIService.analyzeImage.mockRejectedValue(
                new Error('AI_RESPONSE_ERROR')
            );

            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    imageBase64: 'data:image/png;base64,test...',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('AI_RESPONSE_ERROR');
        });

        it('应该处理 Zod 验证错误', async () => {
            mocks.mockAIService.analyzeImage.mockRejectedValue(
                new Error('Zod validation failed')
            );

            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    imageBase64: 'data:image/png;base64,test...',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('AI_RESPONSE_ERROR');
        });

        it('应该处理未知错误', async () => {
            mocks.mockAIService.analyzeImage.mockRejectedValue(
                new Error('Unknown error')
            );

            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    imageBase64: 'data:image/png;base64,test...',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('Unknown error');
        });

        it('应该标准化知识点标签', async () => {
            const aiResult = {
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: ['方程', '一元一次方程'],
            };
            mocks.mockAIService.analyzeImage.mockResolvedValue(aiResult);
            mocks.mockPrismaUser.findUnique.mockResolvedValue({
                educationStage: 'junior_high',
                enrollmentYear: 2024,
            });

            const request = new Request('http://localhost/api/analyze', {
                method: 'POST',
                body: JSON.stringify({
                    imageBase64: 'data:image/png;base64,test...',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.knowledgePoints).toBeDefined();
        });
    });
});
