/**
 * Real SettingsDialog/ModelSelector + Radix interaction regressions in jsdom.
 * Only session, unrelated panels and HTTP/logging boundaries are mocked.
 * All credentials are fixed fake fixtures; no settings file, DB or AI upstream.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig, OpenAIInstance } from '@/types/api';

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    push: vi.fn(),
    logError: vi.fn(),
    alert: vi.fn(),
    role: 'admin' as 'admin' | 'user',
}));

vi.mock('next-auth/react', () => ({
    useSession: () => ({
        data: { user: { id: 'fixture-user', role: mocks.role } },
        status: 'authenticated',
    }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/api-client', () => ({
    apiClient: {
        get: mocks.get, post: mocks.post, put: mocks.put,
        patch: mocks.patch, delete: mocks.delete,
    },
}));
vi.mock('@/lib/frontend-logger', () => ({ frontendLogger: { error: mocks.logError } }));
vi.mock('@/components/admin/user-management', () => ({ UserManagement: () => null }));
vi.mock('@/components/settings/prompt-settings', () => ({ PromptSettings: () => null }));

import { SettingsDialog } from '@/components/settings-dialog';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { translations } from '@/lib/translations';

const text = translations.en.settings;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let root: Root;
let container: HTMLDivElement;
let settingsFixture: AppConfig;
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');

function instance(overrides: Partial<OpenAIInstance> = {}): OpenAIInstance {
    return {
        id: 'fixture-saved-instance',
        name: 'Saved fixture',
        apiKey: 'fixture-saved-openai-key',
        baseUrl: 'https://saved.example.invalid/v1',
        model: 'saved-fixture-model',
        ...overrides,
    };
}

function configureInstance(overrides: Partial<OpenAIInstance> = {}) {
    const saved = instance(overrides);
    settingsFixture = {
        aiProvider: 'openai',
        openai: { instances: [saved], activeInstanceId: saved.id },
    };
}

function button(label: string): HTMLButtonElement | null {
    return Array.from(document.querySelectorAll('button'))
        .find((el) => el.textContent?.trim() === label) ?? null;
}

function activePanel(): HTMLElement {
    const panel = document.querySelector<HTMLElement>('[role="tabpanel"][data-state="active"]');
    expect(panel).not.toBeNull();
    return panel!;
}

function input(selector: string): HTMLInputElement {
    const element = activePanel().querySelector<HTMLInputElement>(selector);
    expect(element, `Missing actual SettingsDialog input: ${selector}`).not.toBeNull();
    return element!;
}

function thinkingSwitch(): HTMLButtonElement {
    const element = activePanel().querySelector<HTMLButtonElement>('#disable-thinking[role="switch"]');
    expect(element).not.toBeNull();
    return element!;
}

async function click(element: HTMLElement | null) {
    expect(element).not.toBeNull();
    await act(async () => { element!.click(); });
}

async function selectTab(label: string) {
    const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        .find((el) => el.textContent?.trim() === label);
    expect(tab).toBeDefined();
    // Real Radix Tabs activates on left mousedown, not a synthetic click alone.
    await act(async () => {
        tab!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: false }));
        tab!.click();
    });
    expect(tab!.getAttribute('aria-selected')).toBe('true');
}

async function fill(selector: string, value: string) {
    const element = input(selector);
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(element.value).toBe(value);
}

async function openSettings(ai = true) {
    await act(async () => {
        root.render(<LanguageProvider><SettingsDialog /></LanguageProvider>);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click(button(text.title));
    expect(document.querySelector('[role="dialog"][data-state="open"]')).not.toBeNull();
    expect(mocks.get).toHaveBeenCalledWith('/api/settings');
    expect(mocks.get).toHaveBeenCalledWith('/api/user');
    if (ai) await selectTab(text.tabs.ai);
}

function settingsWrites() {
    return mocks.post.mock.calls.filter(([url]) => url === '/api/settings');
}

function savedConfig(): AppConfig {
    const writes = settingsWrites();
    expect(writes).toHaveLength(1);
    expect(mocks.alert).toHaveBeenCalledWith(text.messages.saved);
    return writes[0][1] as AppConfig;
}

function expectNoAutomaticSave() {
    expect(settingsWrites()).toHaveLength(0);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
}

beforeAll(() => {
    // jsdom has no scrolling implementation; retain the real dialog/ref/save path.
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true, writable: true, value: vi.fn(),
    });
});
afterAll(() => {
    if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});
beforeEach(() => {
    mocks.role = 'admin';
    mocks.get.mockReset();
    mocks.post.mockReset();
    settingsFixture = { aiProvider: 'openai', openai: { instances: [] } };
    localStorage.setItem('app-language', 'en');
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('alert', mocks.alert);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url !== '/api/version') throw new Error('Unexpected fetch outside fixture transport');
        return { ok: true, json: async () => ({ version: 'fixture-version' }) };
    }));
    mocks.get.mockImplementation(async (url: string) => {
        if (url === '/api/settings') {
            if (mocks.role !== 'admin') {
                throw Object.assign(new Error('Admin privileges required'), { status: 403 });
            }
            return JSON.parse(JSON.stringify(settingsFixture));
        }
        if (url === '/api/user') return {
            id: 'fixture-user', name: 'Fixture user', email: 'fixture@example.invalid',
            role: mocks.role, isActive: true, educationStage: 'university', enrollmentYear: 2024,
        };
        if (url.startsWith('/api/ai/models?')) return { models: [] };
        throw new Error('Unexpected GET outside fixture transport');
    });
    mocks.post.mockImplementation(async (url: string) => {
        if (url === '/api/settings') {
            if (mocks.role !== 'admin') {
                throw Object.assign(new Error('Admin privileges required'), { status: 403 });
            }
            return { success: true };
        }
        if (url === '/api/ai/test') return {
            success: true, textSupport: true, visionSupport: true, modelInfo: 'fixture-model-info',
        };
        throw new Error('Unexpected POST outside fixture transport');
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    try {
        await act(async () => { root.unmount(); });
        container.remove();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        if (mocks.role === 'user') {
            expect(mocks.logError).toHaveBeenCalledExactlyOnceWith(
                '[SettingsDialog]', 'Failed to fetch settings', { error: 'Admin privileges required' },
            );
        } else {
            expect(mocks.logError).not.toHaveBeenCalled();
        }
    } finally {
        vi.unstubAllGlobals();
    }
});

describe('SettingsDialog thinking defaults and draft requests (mock transport)', () => {
    it('adds a real OpenAI instance with thinking disabled and explicitly saves true', async () => {
        await openSettings();
        await click(button(text.ai.addInstance));
        expect(input('#instance-name').value).toBe('Instance 1');
        expect(input('#api-key').type).toBe('password');
        expect(thinkingSwitch().getAttribute('aria-checked')).toBe('true');
        await fill('#api-key', 'fixture-new-openai-key');
        expectNoAutomaticSave();
        await click(button(text.ai.save));

        const saved = savedConfig();
        expect(saved.openai?.instances).toHaveLength(1);
        expect(saved.openai?.instances?.[0]).toEqual({
            id: expect.stringMatching(uuidPattern), name: 'Instance 1',
            apiKey: 'fixture-new-openai-key', baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o', disableThinking: true,
        });
        expect(saved.openai?.activeInstanceId).toBe(saved.openai?.instances?.[0].id);
        // Real Radix's cold dialog mount can exceed Vitest's 5s default on a busy host.
        // Keep a bounded startup budget without weakening any UI/save assertions.
    }, 15_000);

    it.each(['https://api.openai.com/v1', 'https://arbitrary-thinking-host.example.invalid/v1'])(
        'defaults a legacy omitted preference to checked without URL guessing (%s)', async (baseUrl) => {
            configureInstance({ baseUrl });
            await openSettings();
            expect(thinkingSwitch().getAttribute('aria-checked')).toBe('true');
            await click(button(text.ai.save));
            // Display fallback must not overwrite an omitted persisted preference.
            expect(savedConfig().openai?.instances?.[0].disableThinking).toBeUndefined();
        },
    );

    it('keeps an existing explicit false on opening and saving without touching the switch', async () => {
        configureInstance({ disableThinking: false });
        await openSettings();
        expect(thinkingSwitch().getAttribute('aria-checked')).toBe('false');
        expect(input('#api-key').type).toBe('password');
        await fill('#instance-name', 'Renamed fixture');
        await click(button(text.ai.save));
        expect(savedConfig().openai?.instances?.[0]).toEqual(instance({
            name: 'Renamed fixture', disableThinking: false,
        }));
    });

    it('tests the selected new unsaved draft with its current fields and explicit false, without auto-saving', async () => {
        configureInstance({ disableThinking: true });
        await openSettings();
        await click(button(text.ai.addInstance));
        expect(activePanel().textContent).toContain('Instance 2');
        await fill('#instance-name', 'Draft fixture');
        await fill('#api-key', 'fixture-draft-openai-key');
        await fill('#base-url', 'https://draft.example.invalid/v1');
        await fill('input[placeholder="gpt-4o"]', 'draft-fixture-model');
        // Exercise the actual switch event and deliberately set explicit false.
        if (thinkingSwitch().getAttribute('aria-checked') !== 'true') await click(thinkingSwitch());
        await click(thinkingSwitch());
        expect(thinkingSwitch().getAttribute('aria-checked')).toBe('false');

        await click(activePanel().querySelector('svg.lucide-refresh-cw')?.closest('button') ?? null);
        const modelCall = mocks.get.mock.calls.find(([url]) => url.startsWith('/api/ai/models?'));
        expect(modelCall).toBeDefined();
        const params = new URL(modelCall![0], 'http://fixture.invalid').searchParams;
        expect(params.get('provider')).toBe('openai');
        expect(params.get('apiKey')).toBe('fixture-draft-openai-key');
        expect(params.get('baseUrl')).toBe('https://draft.example.invalid/v1');
        expect(params.get('instanceId')).toMatch(uuidPattern);
        expect(params.get('instanceId')).not.toBe('fixture-saved-instance');
        expect(params.get('useConfigured')).toBe('false');

        await click(button(text.ai.testConnection));
        expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/api/ai/test', {
            provider: 'openai', apiKey: 'fixture-draft-openai-key',
            baseUrl: 'https://draft.example.invalid/v1', model: 'draft-fixture-model',
            language: 'en', instanceId: params.get('instanceId'),
            useConfigured: false, disableThinking: false,
        });
        expect(activePanel().textContent).toContain(text.ai.testSuccess);
        expectNoAutomaticSave();
        // Only the user's explicit Save persists the new instance and selection.
        await click(button(text.ai.save));
        const saved = savedConfig();
        expect(saved.openai?.activeInstanceId).toBe(params.get('instanceId'));
        expect(saved.openai?.instances?.[0]).toEqual(instance({ disableThinking: true }));
        expect(saved.openai?.instances?.[1]).toEqual({
            id: params.get('instanceId'), name: 'Draft fixture',
            apiKey: 'fixture-draft-openai-key', baseUrl: 'https://draft.example.invalid/v1',
            model: 'draft-fixture-model', disableThinking: false,
        });
    });

    it.each([
        {
            provider: 'gemini' as const,
            config: {
                aiProvider: 'gemini' as const,
                gemini: { apiKey: 'fixture-saved-gemini-key', baseUrl: 'https://saved-gemini.example.invalid', model: 'saved-gemini-model' },
            },
            fields: [
                ['#api-key', 'fixture-draft-gemini-key'],
                ['#base-url', 'https://draft-gemini.example.invalid'],
                ['input[placeholder="gemini-1.5-flash"]', 'draft-gemini-model'],
            ],
            expected: {
                provider: 'gemini', apiKey: 'fixture-draft-gemini-key',
                baseUrl: 'https://draft-gemini.example.invalid', model: 'draft-gemini-model',
                language: 'en', useConfigured: true,
            },
        },
        {
            provider: 'azure' as const,
            config: {
                aiProvider: 'azure' as const,
                azure: {
                    apiKey: 'fixture-saved-azure-key', endpoint: 'https://saved-azure.example.invalid',
                    deploymentName: 'saved-deployment', apiVersion: 'saved-api-version', model: 'saved-azure-model',
                },
            },
            fields: [
                ['input[type="password"]', 'fixture-draft-azure-key'],
                [`input[placeholder="${text.ai.azureEndpointPlaceholder}"]`, 'https://draft-azure.example.invalid'],
                [`input[placeholder="${text.ai.azureDeploymentPlaceholder}"]`, 'draft-deployment'],
                [`input[placeholder="${text.ai.azureApiVersionPlaceholder}"]`, 'draft-api-version'],
                ['input[placeholder="gpt-4o"]', 'draft-azure-model'],
            ],
            expected: {
                provider: 'azure', apiKey: 'fixture-draft-azure-key',
                endpoint: 'https://draft-azure.example.invalid', deploymentName: 'draft-deployment',
                apiVersion: 'draft-api-version', model: 'draft-azure-model', language: 'en', useConfigured: true,
            },
        },
    ])('tests current $provider form fields with useConfigured=true, without a settings write', async ({ config, fields, expected }) => {
        settingsFixture = config;
        await openSettings();
        for (const [selector, value] of fields) await fill(selector, value);
        await click(button(text.ai.testConnection));
        expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/api/ai/test', expected);
        expect(activePanel().textContent).toContain(text.ai.testSuccess);
        expectNoAutomaticSave();
    });

    it('keeps ordinary-user profile access and hides privileged controls when global settings are forbidden', async () => {
        mocks.role = 'user';
        await openSettings(false);
        expect(mocks.logError).toHaveBeenCalledExactlyOnceWith(
            '[SettingsDialog]', 'Failed to fetch settings', { error: 'Admin privileges required' },
        );
        const tabNames = Array.from(document.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent?.trim());
        expect(tabNames).not.toContain(text.tabs.ai);
        expect(tabNames).not.toContain(text.tabs.prompts);
        expect(tabNames).not.toContain(text.tabs.admin);
        expect(document.querySelector('#api-key')).toBeNull();
        expect(document.querySelector('#disable-thinking')).toBeNull();
        expect(button(text.ai.save)).toBeNull();
        expect(mocks.get).toHaveBeenCalledWith('/api/user');
        // Global settings GET/POST are admin-only in the actual server routes.
        // Do not claim an ordinary user's mock successful global settings save.
        expectNoAutomaticSave();
        expect(mocks.alert).not.toHaveBeenCalled();
    });
});
