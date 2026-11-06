// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../../', import.meta.url);
const readProjectFile = (name: string) => readFileSync(fileURLToPath(new URL(name, root)), 'utf8');

const copyLines = () => readProjectFile('Dockerfile').split('\n');
const lineNumber = (lines: string[], pattern: RegExp) => lines.findIndex((line) => pattern.test(line));

describe('Docker production authentication dependencies', () => {
    it('copies the complete bcryptjs package after standalone tracing, including the CommonJS entry', () => {
        const lines = copyLines();
        const standalone = lineNumber(lines, /^COPY\s.*\/app\/\.next\/standalone\s/);
        const bcrypt = lineNumber(lines, /^COPY\s.*\/app\/node_modules\/bcryptjs\s+\.\/node_modules\/bcryptjs\s*$/);

        expect(standalone).toBeGreaterThanOrEqual(0);
        expect(bcrypt).toBeGreaterThan(standalone);
        expect(lines[bcrypt]).toContain('--chown=nextjs:nodejs');
    });

    it('ships the persistent authentication-secret helper at its runtime entrypoint path', () => {
        const lines = copyLines();
        const helper = lines.find((line) => /^COPY\s.*\/app\/scripts\/ensure-auth-secret\.js\s+\.\/dist-scripts\/scripts\/ensure-auth-secret\.js\s*$/.test(line));

        expect(helper).toBeDefined();
        expect(helper).toContain('--chown=nextjs:nodejs');
    });

    it('does not override the secure generated secret with a shared Compose placeholder', () => {
        const compose = readProjectFile('docker-compose.yml');
        expect(compose).toContain('NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-}');
        expect(compose).not.toContain('NEXTAUTH_SECRET=your_secret_key');
        const httpsCompose = readProjectFile('docker-compose.https.yml');
        expect(httpsCompose).toContain('NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-}');
        expect(httpsCompose).not.toContain('NEXTAUTH_SECRET=your_secret_key_here');
    });

    it('excludes persistent data and generated authentication keys from Docker build context', () => {
        const patterns = readProjectFile('.dockerignore').split('\n').map((line) => line.trim());
        expect(patterns).toContain('data');
        expect(patterns).toContain('**/.nextauth_secret');
    });
});
