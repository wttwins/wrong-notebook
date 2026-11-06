/**
 * /api/ai/models API 集成测试
 *
 * 安全背景：该接口会用服务端身份去请求调用方通过 baseUrl 指定的任意地址，
 * 未鉴权时可被当作 SSRF 跳板探测内网（实测可访问 http://127.0.0.1:3000）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    mockSession: {
        user: { id: 'user-id', email: 'user@localhost', role: 'user' },
        expires: '2025-12-31',
    } as any,
}));

vi.mock('next-auth', () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock('@/lib/auth', () => ({
    authOptions: {},
}));

// These are mocked route tests, not live-upstream or production-config checks.
vi.mock('@/lib/config', () => ({
    getAppConfig: vi.fn(() => ({ aiProvider: 'openai', openai: { instances: [] } })),
}));

// Import after mocks
import { GET } from '@/app/api/ai/models/route';
import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';

function makeRequest(query: string): NextRequest {
    return new NextRequest(`http://localhost/api/ai/models?${query}`);
}

describe('/api/ai/models', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockSession = {
            user: { id: 'user-id', email: 'user@localhost', role: 'user' },
            expires: '2025-12-31',
        };
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // ── 鉴权回归测试 ──────────────────────────────────────────────
    describe('鉴权', () => {
        it('未登录时应返回 401', async () => {
            vi.mocked(getServerSession).mockResolvedValue(null);

            const response = await GET(makeRequest('provider=openai&apiKey=sk-x&baseUrl=https://api.openai.com/v1'));

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.code).toBe('UNAUTHORIZED');
        });

        it('未登录时不应发起任何出站请求（防 SSRF）', async () => {
            vi.mocked(getServerSession).mockResolvedValue(null);
            const fetchSpy = vi.fn();
            vi.stubGlobal('fetch', fetchSpy);

            const response = await GET(makeRequest('provider=openai&apiKey=sk-x&baseUrl=http://127.0.0.1:3000'));

            expect(response.status).toBe(401);
            // 关键断言：未通过鉴权时绝不能向外发起请求
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });

    describe('功能', () => {
        it('已登录时应返回模型列表', async () => {
            // 自定义 baseUrl 现在仅管理员可用
            vi.mocked(getServerSession).mockResolvedValue({
                user: { id: 'admin-id', email: 'admin@localhost', role: 'admin' },
                expires: '2025-12-31',
            } as any);

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    object: 'list',
                    data: [
                        { id: 'model-a', owned_by: 'provider-a' },
                        { id: 'model-b', owned_by: 'provider-a' },
                    ],
                }),
            }));

            const response = await GET(makeRequest('provider=openai&apiKey=sk-x&baseUrl=https://api.example.com/v1'));
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.models).toHaveLength(2);
            expect(data.models[0].id).toBe('model-a');
        });

        it('缺少 apiKey 时应返回 400', async () => {
            const response = await GET(makeRequest('provider=openai'));

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBe('API key is required');
        });

        it('上游失败时应返回 200 且 models 为空（允许手动输入）', async () => {
            vi.mocked(getServerSession).mockResolvedValue({
                user: { id: 'admin-id', email: 'admin@localhost', role: 'admin' },
                expires: '2025-12-31',
            } as any);

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: async () => 'nope',
            }));

            const response = await GET(makeRequest('provider=openai&apiKey=sk-bad&baseUrl=https://api.example.com/v1'));
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.models).toEqual([]);
        });

        // ── SSRF 防护：自定义 baseUrl 的权限与地址过滤 ────────────────
        it('非管理员指定自定义 baseUrl 时应返回 403 且不发起请求', async () => {
            const fetchSpy = vi.fn();
            vi.stubGlobal('fetch', fetchSpy);

            const response = await GET(
                makeRequest('provider=openai&apiKey=sk-x&baseUrl=https://api.example.com/v1')
            );

            expect(response.status).toBe(403);
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('管理员指定内网地址时应被拒绝（防 SSRF 探测）', async () => {
            vi.mocked(getServerSession).mockResolvedValue({
                user: { id: 'admin-id', email: 'admin@localhost', role: 'admin' },
                expires: '2025-12-31',
            } as any);

            const fetchSpy = vi.fn();
            vi.stubGlobal('fetch', fetchSpy);

            const response = await GET(
                makeRequest('provider=openai&apiKey=sk-x&baseUrl=http://127.0.0.1:3000')
            );

            expect(response.status).toBe(400);
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });
});
