/**
 * /api/tags API 集成测试
 * 测试标签统计和标签建议接口
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are initialized before module imports
const mocks = vi.hoisted(() => ({
    mockPrismaErrorItem: {
        findMany: vi.fn(),
    },
    mockPrismaKnowledgeTag: {
        findMany: vi.fn(),
    },
    mockPrismaUser: {
        findUnique: vi.fn(),
    },
    mockGetServerSession: vi.fn(),
}));

// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
    prisma: {
        errorItem: mocks.mockPrismaErrorItem,
        knowledgeTag: mocks.mockPrismaKnowledgeTag,
        user: mocks.mockPrismaUser,
    },
}));

// Mock next-auth
vi.mock('next-auth', () => ({
    getServerSession: mocks.mockGetServerSession,
}));

// Mock auth options
vi.mock('@/lib/auth', () => ({
    authOptions: {},
}));

// Import after mocks
import { GET as GET_STATS } from '@/app/api/tags/stats/route';
import { GET as GET_SUGGESTIONS } from '@/app/api/tags/suggestions/route';

describe('/api/tags', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: no session
        mocks.mockGetServerSession.mockResolvedValue(null);
    });

    describe('GET /api/tags/stats (标签统计)', () => {
        // 该接口现已要求登录，且只统计当前用户的数据
        // （原实现无需登录且无用户过滤，会泄露全站标签）。
        beforeEach(() => {
            mocks.mockGetServerSession.mockResolvedValue({
                user: { email: 'user@example.com', name: 'Test User' },
            });
            mocks.mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-123' });
        });

        it('应该拒绝未登录用户的请求', async () => {
            mocks.mockGetServerSession.mockResolvedValue(null);

            const response = await GET_STATS(new Request('http://localhost/api/tags/stats'));

            expect(response.status).toBe(401);
            expect(mocks.mockPrismaErrorItem.findMany).not.toHaveBeenCalled();
        });

        it('应该只统计当前用户的错题（按 userId 过滤）', async () => {
            mocks.mockPrismaErrorItem.findMany.mockResolvedValue([]);

            await GET_STATS(new Request('http://localhost/api/tags/stats'));

            expect(mocks.mockPrismaErrorItem.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: 'user-123' },
                })
            );
        });

        it('应该返回标签使用频率统计', async () => {
            const errorItems = [
                { knowledgePoints: '["一元一次方程", "移项"]' },
                { knowledgePoints: '["一元一次方程", "函数"]' },
                { knowledgePoints: '["函数", "图像"]' },
            ];
            mocks.mockPrismaErrorItem.findMany.mockResolvedValue(errorItems);

            const request = new Request('http://localhost/api/tags/stats');
            const response = await GET_STATS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.stats).toBeDefined();
            expect(data.total).toBe(3);
            expect(data.uniqueTags).toBeGreaterThan(0);

            // 验证排序（按使用次数降序）
            const stats = data.stats;
            for (let i = 1; i < stats.length; i++) {
                expect(stats[i - 1].count).toBeGreaterThanOrEqual(stats[i].count);
            }
        });

        it('应该正确统计每个标签的使用次数', async () => {
            const errorItems = [
                { knowledgePoints: '["一元一次方程"]' },
                { knowledgePoints: '["一元一次方程"]' },
                { knowledgePoints: '["一元一次方程"]' },
                { knowledgePoints: '["函数"]' },
            ];
            mocks.mockPrismaErrorItem.findMany.mockResolvedValue(errorItems);

            const request = new Request('http://localhost/api/tags/stats');
            const response = await GET_STATS(request);
            const data = await response.json();

            expect(response.status).toBe(200);

            const equationStat = data.stats.find((s: any) => s.tag === '一元一次方程');
            expect(equationStat).toBeDefined();
            expect(equationStat.count).toBe(3);

            const functionStat = data.stats.find((s: any) => s.tag === '函数');
            expect(functionStat).toBeDefined();
            expect(functionStat.count).toBe(1);
        });

        it('应该处理空的错题列表', async () => {
            mocks.mockPrismaErrorItem.findMany.mockResolvedValue([]);

            const request = new Request('http://localhost/api/tags/stats');
            const response = await GET_STATS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.stats).toEqual([]);
            expect(data.total).toBe(0);
            expect(data.uniqueTags).toBe(0);
        });

        it('应该处理无效的 JSON 知识点', async () => {
            const errorItems = [
                { knowledgePoints: 'invalid json{' },
                { knowledgePoints: '["有效标签"]' },
            ];
            mocks.mockPrismaErrorItem.findMany.mockResolvedValue(errorItems);

            const request = new Request('http://localhost/api/tags/stats');
            const response = await GET_STATS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            // 应该只统计有效的标签
            expect(data.stats.length).toBe(1);
            expect(data.stats[0].tag).toBe('有效标签');
        });

        it('应该处理空的知识点字段', async () => {
            const errorItems = [
                { knowledgePoints: null },
                { knowledgePoints: '' },
                { knowledgePoints: '["有效标签"]' },
            ];
            mocks.mockPrismaErrorItem.findMany.mockResolvedValue(errorItems);

            const request = new Request('http://localhost/api/tags/stats');
            const response = await GET_STATS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.total).toBe(3);
            expect(data.uniqueTags).toBe(1);
        });

        it('应该忽略非字符串的标签', async () => {
            const errorItems = [
                { knowledgePoints: '[123, null, "有效标签", true]' },
            ];
            mocks.mockPrismaErrorItem.findMany.mockResolvedValue(errorItems);

            const request = new Request('http://localhost/api/tags/stats');
            const response = await GET_STATS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.stats.length).toBe(1);
            expect(data.stats[0].tag).toBe('有效标签');
        });

        it('应该处理数据库错误', async () => {
            mocks.mockPrismaErrorItem.findMany.mockRejectedValue(
                new Error('Database connection failed')
            );

            const request = new Request('http://localhost/api/tags/stats');
            const response = await GET_STATS(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('Failed to get tag statistics');
        });
    });

    describe('GET /api/tags/suggestions (标签建议)', () => {
        // Helper to create mock tag data (simulates KnowledgeTag from DB)
        const createMockTag = (name: string, subject = 'math', isSystem = true, hasChildren = false) => ({
            id: `tag-${name}`,
            name,
            parentId: null,
            userId: null,
            isSystem,
            children: hasChildren ? [{ id: 'child' }] : [],
        });

        beforeEach(() => {
            // Default: return empty tags
            mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue([]);
        });

        it('应该返回所有叶子标签建议（无搜索词）', async () => {
            const mockTags = [
                createMockTag('一元一次方程'),
                createMockTag('二元一次方程'),
                createMockTag('父节点', 'math', true, true), // 有子节点，不应返回
            ];
            mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue(mockTags);

            const request = new Request('http://localhost/api/tags/suggestions');
            const response = await GET_SUGGESTIONS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.suggestions).toBeDefined();
            expect(Array.isArray(data.suggestions)).toBe(true);
            expect(data.suggestions).toContain('一元一次方程');
            expect(data.suggestions).toContain('二元一次方程');
            expect(data.suggestions).not.toContain('父节点');
        });

        it('应该根据搜索词过滤标签', async () => {
            const mockTags = [
                createMockTag('一元一次方程'),
                createMockTag('二元一次方程'),
                createMockTag('函数'),
            ];
            mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue(mockTags);

            const request = new Request('http://localhost/api/tags/suggestions?q=方程');
            const response = await GET_SUGGESTIONS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.suggestions).toContain('一元一次方程');
            expect(data.suggestions).toContain('二元一次方程');
            expect(data.suggestions).not.toContain('函数');
        });

        it('应该支持大小写不敏感搜索', async () => {
            const mockTags = [
                createMockTag('Function'),
                createMockTag('Array'),
            ];
            mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue(mockTags);

            const request = new Request('http://localhost/api/tags/suggestions?q=function');
            const response = await GET_SUGGESTIONS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.suggestions).toContain('Function');
        });

        it('应该返回系统标签和用户自定义标签', async () => {
            mocks.mockGetServerSession.mockResolvedValue({
                user: { email: 'test@example.com' }
            });
            mocks.mockPrismaUser.findUnique.mockResolvedValue({ id: 'user-1' });

            const mockTags = [
                createMockTag('系统标签', 'math', true),
                { ...createMockTag('自定义标签', 'math', false), userId: 'user-1' },
            ];
            mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue(mockTags);

            const request = new Request('http://localhost/api/tags/suggestions');
            const response = await GET_SUGGESTIONS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.suggestions).toContain('系统标签');
            expect(data.suggestions).toContain('自定义标签');
        });

        it('应该限制返回结果数量（最多 30 个）', async () => {
            // 创建超过 30 个标签
            const manyTags = Array.from({ length: 50 }, (_, i) =>
                createMockTag(`标签${i + 1}`)
            );
            mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue(manyTags);

            const request = new Request('http://localhost/api/tags/suggestions');
            const response = await GET_SUGGESTIONS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.suggestions.length).toBeLessThanOrEqual(30);
        });

        it('应该处理空搜索词', async () => {
            const mockTags = [createMockTag('测试标签')];
            mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue(mockTags);

            const request = new Request('http://localhost/api/tags/suggestions?q=');
            const response = await GET_SUGGESTIONS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.suggestions.length).toBeGreaterThan(0);
        });

        it('应该处理无匹配结果', async () => {
            const mockTags = [createMockTag('一元一次方程')];
            mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue(mockTags);

            const request = new Request('http://localhost/api/tags/suggestions?q=不存在的标签xyz');
            const response = await GET_SUGGESTIONS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.suggestions).toEqual([]);
            expect(data.total).toBe(0);
        });

        it('应该处理数据库错误', async () => {
            mocks.mockPrismaKnowledgeTag.findMany.mockRejectedValue(
                new Error('Database connection failed')
            );

            const request = new Request('http://localhost/api/tags/suggestions');
            const response = await GET_SUGGESTIONS(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('Failed to get tag suggestions');
        });

        it('应该支持部分匹配', async () => {
            const mockTags = [
                createMockTag('一元一次方程'),
                createMockTag('二元一次方程'),
                createMockTag('一元二次方程'),
                createMockTag('函数'),
            ];
            mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue(mockTags);

            const request = new Request('http://localhost/api/tags/suggestions?q=一次');
            const response = await GET_SUGGESTIONS(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.suggestions).toContain('一元一次方程');
            expect(data.suggestions).toContain('二元一次方程');
            expect(data.suggestions).not.toContain('函数');
        });
    });
});
