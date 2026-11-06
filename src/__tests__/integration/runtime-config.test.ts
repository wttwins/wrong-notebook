/** Runtime allowlist contract; fixture config only, no config-file/DB/upstream access. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const fixtureConfig = {
        aiProvider: 'openai', allowRegistration: true,
        openai: { instances: [{ id: 'fixture-id', name: 'Fixture', apiKey: 'fixture-credential', baseUrl: 'http://fixture.internal', model: 'fixture-model' }] },
        gemini: { apiKey: 'fixture-gemini-credential', baseUrl: 'http://gemini.internal' },
        azure: { apiKey: 'fixture-azure-credential', endpoint: 'http://azure.internal' },
        prompts: { analyze: 'fixture-private-prompt', similar: 'fixture-similar-prompt' },
        timeouts: { analyze: 900000, extra: 'fixture-sensitive-unknown', apiKey: 'fixture-nested-credential' },
        futureSecret: 'fixture-future-credential',
    };
    return {
        fixtureConfig,
        session: { user: { id: 'fixture-user', role: 'user' }, expires: '2099-01-01' } as
            { user: { id: string; role: string }; expires: string } | null,
        getAppConfig: vi.fn<() => unknown>(() => fixtureConfig),
        updateAppConfig: vi.fn(),
    };
});
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppConfig: mocks.getAppConfig, updateAppConfig: mocks.updateAppConfig }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));
import { GET as settingsGET } from '@/app/api/settings/route';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: 'fixture-user', role: 'user' }, expires: '2099-01-01' };
    mocks.getAppConfig.mockReturnValue(mocks.fixtureConfig);
});

async function runtimeGET() {
    const { GET } = await import('@/app/api/runtime-config/route');
    return GET();
}

describe('/api/runtime-config', () => {
    it('requires login and does not read config for anonymous users', async () => {
        mocks.session = null;
        const res = await runtimeGET();
        expect(res.status).toBe(401);
        expect(mocks.getAppConfig).not.toHaveBeenCalled();
        expect((await res.json()).code).toBe('UNAUTHORIZED');
    });
    it.each(['user', 'admin'])('returns exactly the non-secret timeout allowlist to %s', async (role) => {
        mocks.session!.user.role = role;
        const res = await runtimeGET();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ timeouts: { analyze: 900000 } });
        expect(res.headers.get('Cache-Control')).toContain('no-store');
    });
    it.each([undefined, 0, -1, NaN, Infinity, '900000'])('uses a finite positive default for malformed timeout %#', async (analyze) => {
        mocks.getAppConfig.mockReturnValue({ timeouts: { analyze } });
        const res = await runtimeGET();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ timeouts: { analyze: 180000 } });
    });
    it('does not broaden /api/settings access for ordinary users', async () => {
        const res = await settingsGET();
        expect(res.status).toBe(403);
        expect(mocks.getAppConfig).not.toHaveBeenCalled();
    });
    it('keeps full settings available only to admins', async () => {
        mocks.session!.user.role = 'admin';
        const res = await settingsGET();
        expect(res.status).toBe(200);
        const config = await res.json();
        expect(config.openai.instances[0].apiKey === mocks.fixtureConfig.openai.instances[0].apiKey).toBe(true);
    });
});
