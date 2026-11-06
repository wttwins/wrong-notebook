/** Rendering tests with mocked transport, not a database/transaction substitute. */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/api-client')>();
    return { ...actual, apiClient: { get: mocks.get, post: mocks.post } };
});
vi.mock('@/components/lottery/wheel', () => ({ Wheel: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/ui/back-button', () => ({ BackButton: () => <span>back</span> }));

import LotteryPage from '@/app/lottery/page';
import { LanguageProvider } from '@/contexts/LanguageContext';

let root: Root;
let container: HTMLDivElement;
beforeAll(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterAll(() => { vi.unstubAllGlobals(); });
beforeEach(() => {
    mocks.get.mockImplementation(async (url: string) => {
        if (url === '/api/lottery/wheel') return { wheel: [{ id: 'layout-only', name: '展示扇区', weight: 1, isBlank: false }] };
        if (url === '/api/lottery/prizes') return { prizes: [{ id: 'prize-1', name: '当前奖品', hasImage: true, stock: 1, soldOut: false }] };
        if (url === '/api/lottery/records') return { records: [{ id: 'record-1', prizeId: 'prize-1', prizeName: '历史奖品', imagePath: 'uploads/prizes/old.png', createdAt: '2026-01-01T00:00:00.000Z' }] };
        return { enabled: true, drawsPerDay: 0, drawsUsedToday: 0, drawsLeft: -1, canDraw: true, prizeCount: 1 };
    });
    mocks.post.mockResolvedValue({
        prize: { id: 'prize-1', name: '新抽中快照', description: null, imagePath: 'uploads/prizes/snapshot.png', isBlank: false, stockLeft: 0 },
        recordId: 'new-draw-record', drawsLeft: -1, drawsUsedToday: 1,
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
});
async function mount() {
    await act(async () => { root.render(<LanguageProvider><LotteryPage /></LanguageProvider>); });
}

describe('lottery UI snapshot image URLs', () => {
    it('uses record IDs for history while the prize wall keeps current-prize URLs', async () => {
        await mount();
        expect(document.querySelector<HTMLImageElement>('img[alt="历史奖品"]')!.getAttribute('src')).toBe('/api/lottery/records/record-1/image');
        expect(document.querySelector<HTMLImageElement>('img[alt="当前奖品"]')!.getAttribute('src')).toBe('/api/lottery/prizes/prize-1/image');
    });

    it('uses the top-level draw response recordId for the result image too', async () => {
        await mount();
        const drawButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('抽一次'));
        expect(drawButton).toBeDefined();
        await act(async () => { drawButton!.click(); });
        expect(mocks.post).toHaveBeenCalledWith('/api/lottery/draw', {});
        expect(document.querySelector<HTMLImageElement>('img[alt="新抽中快照"]')!.getAttribute('src')).toBe('/api/lottery/records/new-draw-record/image');
    });
});
