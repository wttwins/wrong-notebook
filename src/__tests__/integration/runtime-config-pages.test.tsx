/**
 * Render the real three pages with fixture API responses and lightweight UI mocks.
 * No real HTTP, configuration file, database or AI SDK is exercised here.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    get: vi.fn<(url: string) => Promise<unknown>>(),
    post: vi.fn<(url: string, body: unknown, options?: { timeout?: number }) => Promise<unknown>>(),
    params: new URLSearchParams('notebook=fixture-notebook&id=fixture-error-item'),
    router: { push: vi.fn(), back: vi.fn() },
}));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get, post: mocks.post } }));
vi.mock('next/navigation', () => ({
    useSearchParams: () => mocks.params, useParams: () => ({ id: 'fixture-notebook' }), useRouter: () => mocks.router,
}));
vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/image-utils', () => ({ processImageFile: vi.fn(async () => 'fixture-image-base64') }));
vi.mock('@/components/upload-zone', () => ({
    UploadZone: ({ onImageSelect }: { onImageSelect: (file: File) => void }) =>
        <button data-testid="select-fixture-image" onClick={() => onImageSelect(new File(['fixture'], 'fixture.jpg'))}>Upload fixture</button>,
}));
vi.mock('@/components/image-cropper', () => ({
    ImageCropper: ({ open, onCropComplete }: { open: boolean; onCropComplete: (blob: Blob) => void }) =>
        open ? <button data-testid="crop-fixture-image" onClick={() => onCropComplete(new Blob(['fixture']))}>Crop fixture</button> : null,
}));
vi.mock('@/components/text-input-zone', () => ({
    TextInputZone: ({ onSubmit }: { onSubmit: (text: string) => void }) =>
        <button data-testid="submit-fixture-text" onClick={() => onSubmit('fixture question')}>Submit fixture</button>,
}));
vi.mock('@/components/correction-editor', () => ({
    CorrectionEditor: ({ aiTimeout }: { aiTimeout: number }) => <span data-testid="editor-timeout">{aiTimeout}</span>,
}));
vi.mock('@/components/direct-text-editor', () => ({ DirectTextEditor: () => null }));
vi.mock('@/components/user-welcome', () => ({ UserWelcome: () => null }));
vi.mock('@/components/settings-dialog', () => ({ SettingsDialog: () => null }));
vi.mock('@/components/broadcast-notification', () => ({ BroadcastNotification: () => null }));
vi.mock('@/components/markdown-renderer', () => ({ MarkdownRenderer: () => null }));
vi.mock('@/components/ui/progress-feedback', () => ({ ProgressFeedback: () => null }));

import HomePage from '@/app/page';
import AddPage from '@/app/notebooks/[id]/add/page';
import PracticePage from '@/app/practice/page';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { translations } from '@/lib/translations';

const configuredTimeout = 900000;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('URL', class extends URL {
        static createObjectURL = vi.fn(() => 'blob:fixture-image');
        static revokeObjectURL = vi.fn();
    });
    mocks.get.mockReset().mockImplementation(async (url) => {
        if (url === '/api/runtime-config') return { timeouts: { analyze: configuredTimeout } };
        if (url === '/api/settings') throw new Error('fixture ordinary-user forbidden');
        if (url === '/api/notebooks') return [{ id: 'fixture-notebook', name: 'Fixture notebook' }];
        if (url === '/api/notebooks/fixture-notebook') return { id: 'fixture-notebook', name: 'Fixture notebook' };
        throw new Error('Unexpected fixture API path');
    });
    mocks.post.mockReset().mockResolvedValue({ questionText: 'fixture', answerText: 'fixture', analysis: 'fixture', knowledgePoints: [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function render(Page: React.ComponentType) {
    await act(async () => root.render(<LanguageProvider><Page /></LanguageProvider>));
}
async function click(selector: string) {
    const button = container.querySelector<HTMLButtonElement>(selector);
    expect(button).not.toBeNull();
    await act(async () => button!.click());
}
async function clickLabel(label: string) {
    const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
    expect(button).toBeDefined();
    await act(async () => button!.click());
}
function expectRuntimeOnly() {
    expect(mocks.get.mock.calls.some(([url]) => url === '/api/runtime-config')).toBe(true);
    expect(mocks.get.mock.calls.some(([url]) => url === '/api/settings')).toBe(false);
}
function expectRequestTimeout(path: string) {
    const call = mocks.post.mock.calls.find(([url]) => url === path);
    expect(call).toBeDefined();
    expect(call?.[2]?.timeout).toBe(configuredTimeout);
}

describe('ordinary-user pages consume the safe long runtime timeout', () => {
    it.each([['home', HomePage], ['notebook add', AddPage]] as const)('%s uses runtime timeout for text and the correction editor', async (_name, Page) => {
        await render(Page);
        await clickLabel(translations.zh.app.manualInput);
        await click('[data-testid="submit-fixture-text"]');
        expectRuntimeOnly();
        expectRequestTimeout('/api/reanswer');
        expect(container.querySelector('[data-testid="editor-timeout"]')?.textContent).toBe(String(configuredTimeout));
    });
    it.each([['home', HomePage], ['notebook add', AddPage]] as const)('%s uses runtime timeout for image requests and the safety timer', async (_name, Page) => {
        const timerSpy = vi.spyOn(globalThis, 'setTimeout');
        mocks.post.mockImplementation(() => new Promise(() => {}));
        await render(Page);
        await click('[data-testid="select-fixture-image"]');
        await click('[data-testid="crop-fixture-image"]');
        expectRuntimeOnly();
        expectRequestTimeout('/api/analyze');
        expect(timerSpy.mock.calls.some(([, delay]) => delay === configuredTimeout + 10000)).toBe(true);
    });
    it('practice uses the runtime timeout instead of falling back after admin-only settings fails', async () => {
        await render(PracticePage);
        await clickLabel(translations.zh.practice.generate);
        expectRuntimeOnly();
        expectRequestTimeout('/api/practice/generate');
    });
});
