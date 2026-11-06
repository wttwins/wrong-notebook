/** Dev-only hostname inference; no auth requests or external service access. */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('next.config allowedDevOrigins', () => {
    it.each([
        ['https://tunnel.example:8443', 'tunnel.example'],
        ['http://192.168.50.12:3000', '192.168.50.12'],
        ['https://tunnel.example', 'tunnel.example'],
    ])('uses URL.hostname for %s', async (url, hostname) => {
        vi.resetModules();
        vi.stubEnv('NEXTAUTH_URL', url);
        const { default: config } = await import('../../../next.config');
        expect(config.allowedDevOrigins).toEqual([hostname]);
        expect(config.allowedDevOrigins?.includes(new URL(url).hostname)).toBe(true);
    });
    it.each(['', 'not-a-url'])('omits allowlist for absent or invalid URL %#', async (url) => {
        vi.resetModules();
        vi.stubEnv('NEXTAUTH_URL', url);
        const { default: config } = await import('../../../next.config');
        expect(config.allowedDevOrigins).toBeUndefined();
    });
});
