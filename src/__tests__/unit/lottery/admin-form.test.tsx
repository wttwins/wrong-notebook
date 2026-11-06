/** UI tests with mocked HTTP transport; no ORM/transaction claims. */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    push: vi.fn(),
    prize: {
        id: 'prize-1', name: '原奖品', description: null, imagePath: null,
        hasImage: false, weight: 10, probability: 100, stock: 1 as number | null,
        enabled: true, isBlank: false, sortOrder: 0, drawCount: 0,
    },
}));

vi.mock('next-auth/react', () => ({
    useSession: () => ({
        data: { user: { id: 'admin', role: 'admin' } }, status: 'authenticated',
    }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/api-client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/api-client')>();
    return { ...actual, apiClient: { get: mocks.get, patch: mocks.patch, post: mocks.post, delete: vi.fn() } };
});

import AdminLotteryPage from '@/app/admin/lottery/page';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ApiError } from '@/lib/api-client';

let root: Root;
let container: HTMLDivElement;

async function mountPage() {
    await act(async () => {
        root.render(<LanguageProvider><AdminLotteryPage /></LanguageProvider>);
    });
}

async function click(element: Element | null) {
    expect(element).not.toBeNull();
    await act(async () => { (element as HTMLElement).click(); });
}

async function fill(selector: string, value: string) {
    const input = document.querySelector<HTMLInputElement>(selector);
    expect(input).not.toBeNull();
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, value);
        input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function button(text: string) {
    return Array.from(document.querySelectorAll('button')).find((el) => el.textContent?.trim() === text) ?? null;
}

async function editPrize() {
    await click(document.querySelector('svg.lucide-pencil')?.closest('button') ?? null);
}

beforeAll(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => {
    mocks.prize.stock = 1;
    mocks.prize.name = '原奖品';
    mocks.get.mockImplementation(async (url: string) => {
        if (url === '/api/admin/prizes') return { prizes: [{ ...mocks.prize }] };
        if (url === '/api/admin/lottery/records') return { records: [] };
        return { enabled: true, drawsPerDay: 1 };
    });
    // Only a mocked transport fixture. The SQLite suites verify the real persisted state.
    mocks.patch.mockImplementation(async (_url: string, payload: Record<string, unknown>) => {
        if (Object.hasOwn(payload, 'stock')) mocks.prize.stock = payload.stock as number | null;
        return { prize: { id: mocks.prize.id } };
    });
    mocks.post.mockResolvedValue({ prize: { id: 'created-prize' } });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
});

describe('admin prize form payload', () => {
    it('does not restore stock=1 when a draw exhausts it while only the name is edited', async () => {
        await mountPage();
        await editPrize();
        expect(document.querySelector<HTMLInputElement>('#prize-stock')!.value).toBe('1');
        mocks.prize.stock = 0; // A draw occurs after the original form was opened.
        await fill('#prize-name', '改名后的奖品');
        await click(button('保存'));
        expect(mocks.patch).toHaveBeenCalledWith('/api/admin/prizes/prize-1', { name: '改名后的奖品' });
        expect(mocks.prize.stock).toBe(0);
    });

    it('sends the original expectedStock only for an actual stock edit', async () => {
        await mountPage();
        await editPrize();
        await fill('#prize-stock', '3');
        await click(button('保存'));
        expect(mocks.patch).toHaveBeenCalledWith('/api/admin/prizes/prize-1', { stock: 3, expectedStock: 1 });
    });

    it('preserves null as the expected unlimited stock', async () => {
        mocks.prize.stock = null;
        await mountPage();
        await editPrize();
        await fill('#prize-stock', '2');
        await click(button('保存'));
        expect(mocks.patch).toHaveBeenCalledWith('/api/admin/prizes/prize-1', { stock: 2, expectedStock: null });
    });

    it('still submits all scalar fields when creating a prize', async () => {
        await mountPage();
        await click(button('新增奖品'));
        await fill('#prize-name', '新奖品');
        await click(button('保存'));
        expect(mocks.post).toHaveBeenCalledWith('/api/admin/prizes', {
            name: '新奖品', description: '', weight: 10, stock: null,
            enabled: true, isBlank: false, sortOrder: 0,
        });
        expect(mocks.patch).not.toHaveBeenCalled();
    });

    it('displays the server CAS conflict instead of silently overwriting the original form', async () => {
        mocks.patch.mockRejectedValueOnce(new ApiError(409, 'Conflict', { message: '库存已变化，请刷新后重试' }));
        await mountPage();
        await editPrize();
        await fill('#prize-stock', '3');
        await click(button('保存'));
        expect(document.body.textContent).toContain('库存已变化，请刷新后重试');
        expect(document.querySelector<HTMLInputElement>('#prize-stock')!.value).toBe('3');
    });
});
