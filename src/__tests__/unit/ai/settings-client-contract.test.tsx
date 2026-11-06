/**
 * ModelSelector 纯客户端查询契约测试（mock transport）。
 *
 * 真实组件使用 buildModelListParams 构造 URLSearchParams；本测试不访问
 * 真实 HTTP、配置服务或上游 AI，只验证 instanceId/useConfigured 透传。
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }));
vi.mock('@/contexts/LanguageContext', () => ({
    useLanguage: () => ({ t: { modelSelector: {} } }),
    LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ModelSelector } from '@/components/ui/model-selector';
import { LanguageProvider } from '@/contexts/LanguageContext';

let root: Root;
let container: HTMLDivElement;

async function mount(overrides: { provider?: 'openai' | 'gemini'; apiKey?: string; baseUrl?: string;
    instanceId?: string; useConfigured?: boolean } = {}) {
    await act(async () => {
        root.render(<LanguageProvider><ModelSelector
            provider="openai"
            apiKey="draft-fixture-key"
            baseUrl="https://draft.example.com/v1"
            currentModel="fixture-model"
            instanceId="saved-instance"
            useConfigured={false}
            onModelChange={vi.fn()}
            {...overrides}
        /></LanguageProvider>);
    });
}

async function click(element: Element | null) {
    expect(element).not.toBeNull();
    await act(async () => { (element as HTMLElement).click(); });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.get.mockResolvedValue({ models: [] });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
});

describe('ModelSelector 配置上下文（mock transport）', () => {
    it.each(['openai', 'gemini'] as const)('%s 草稿清空地址仍发送显式空参数', async (provider) => {
        await mount({
            provider, baseUrl: '', useConfigured: provider === 'gemini',
            instanceId: provider === 'openai' ? 'saved-instance' : undefined,
        });
        await click(Array.from(container.querySelectorAll('button')).find((el) => el.querySelector('svg.lucide-refresh-cw')) ?? null);
        const params = new URL(mocks.get.mock.calls.at(-1)?.[0] as string, 'http://localhost').searchParams;
        expect(params.get('provider')).toBe(provider);
        expect(params.get('instanceId')).toBe(provider === 'openai' ? 'saved-instance' : null);
        expect(params.get('useConfigured')).toBe(provider === 'gemini' ? 'true' : 'false');
        expect(params.has('baseUrl')).toBe(true);
        expect(params.get('baseUrl')).toBe('');
    });
    it('实例切换后刷新使用新 ID 和当前草稿空地址，不使用旧闭包', async () => {
        await mount();
        await click(Array.from(container.querySelectorAll('button')).find((el) => el.querySelector('svg.lucide-refresh-cw')) ?? null);
        await mount({ instanceId: 'next-saved-instance', baseUrl: '' });
        await click(Array.from(container.querySelectorAll('button')).find((el) => el.querySelector('svg.lucide-refresh-cw')) ?? null);
        const params = new URL(mocks.get.mock.calls.at(-1)?.[0] as string, 'http://localhost').searchParams;
        expect(params.get('instanceId')).toBe('next-saved-instance');
        expect(params.has('baseUrl')).toBe(true);
        expect(params.get('baseUrl')).toBe('');
    });
    it('显式清空 key 后禁用刷新，不向保存实例借 key', async () => {
        await mount({ apiKey: '' });
        const refresh = Array.from(container.querySelectorAll('button')).find((el) => el.querySelector('svg.lucide-refresh-cw'));
        expect(refresh?.disabled).toBe(true);
        await click(refresh ?? null);
        expect(mocks.get).not.toHaveBeenCalled();
    });
    it('模型列表查询携带 instanceId，且保留显式 useConfigured=false', async () => {
        await mount();
        await click(Array.from(container.querySelectorAll('button')).find((el) => el.querySelector('svg.lucide-refresh-cw')) ?? null);

        expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('/api/ai/models?'));
        const url = mocks.get.mock.calls.at(-1)?.[0] as string;
        const params = new URL(url, 'http://localhost').searchParams;
        expect(params.get('provider')).toBe('openai');
        expect(params.get('apiKey')).toBe('draft-fixture-key');
        expect(params.get('baseUrl')).toBe('https://draft.example.com/v1');
        expect(params.get('instanceId')).toBe('saved-instance');
        expect(params.get('useConfigured')).toBe('false');
    });
});
