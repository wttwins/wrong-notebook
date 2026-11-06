// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const helperPath = fileURLToPath(new URL('../../../../scripts/ensure-auth-secret.js', import.meta.url));
const entrypointPath = fileURLToPath(new URL('../../../../docker-entrypoint.sh', import.meta.url));
const secretName = '.nextauth_secret';
const validSecret = /^[0-9a-f]{64}$/;
type SecretEnvironment = Record<string, string | undefined>;
type EnsureAuthSecret = (options?: { dataDir?: string; env?: SecretEnvironment }) => string;
let dataDir: string;

function loadHelper(): EnsureAuthSecret {
    return require('../../../../scripts/ensure-auth-secret.js').ensureAuthSecret;
}

function storedPath(directory = dataDir) {
    return path.join(directory, secretName);
}

function writeStored(contents: string, directory = dataDir) {
    fs.writeFileSync(storedPath(directory), contents, { mode: 0o600 });
}

function runCli(directory = dataDir, extraEnv: SecretEnvironment = {}) {
    return spawnSync(process.execPath, [helperPath, directory], {
        env: { ...process.env, NEXTAUTH_SECRET: '', ...extraEnv },
        encoding: 'utf8',
        timeout: 10000,
    });
}

// Exercise only the real pre-database block and final exec, never migrations,
// seeds, HTTPS or /app. Privilege/ownership commands are recorded, not executed.
function runEntrypoint(options: { explicit?: string; failHelper?: boolean; existing?: string } = {}) {
    const runtimeDir = path.join(dataDir, 'entrypoint-data');
    const binDir = path.join(dataDir, 'bin');
    const eventsPath = path.join(dataDir, 'events');
    const markerPath = path.join(dataDir, 'service-started');
    fs.mkdirSync(runtimeDir);
    fs.mkdirSync(binDir);
    if (options.existing !== undefined) writeStored(options.existing, runtimeDir);

    const source = fs.readFileSync(entrypointPath, 'utf8');
    const databaseStart = source.indexOf('# Check if the persistent database exists');
    const mainStart = source.indexOf('# Execute the main container command as nextjs user');
    if (databaseStart < 0 || mainStart < databaseStart) throw new Error('Entrypoint boundaries changed');
    const probePath = path.join(dataDir, 'entrypoint-probe.sh');
    fs.writeFileSync(probePath, `${source.slice(0, databaseStart)}\n${source.slice(mainStart)}\n`);

    const nodeShim = `#!/bin/sh
if [ "$1" = "-p" ]; then
    printf '%s\\n' 'test-version'
    exit 0
fi
if [ "$1" = "/app/dist-scripts/scripts/ensure-auth-secret.js" ]; then
    printf '%s\\n' 'helper' >> "$AUTH_TEST_EVENTS"
    if [ "$AUTH_TEST_FORCE_FAIL" = "true" ]; then
        printf '%s\\n' '[Auth secret] Simulated persistence failure.' >&2
        exit 23
    fi
    exec "$AUTH_TEST_NODE" "$AUTH_TEST_HELPER" "$AUTH_TEST_DATA_DIR"
fi
printf '%s\\n' 'Unexpected node invocation in entrypoint probe.' >&2
exit 24
`;
    const suExecShim = `#!/bin/sh
printf '%s\\n' "su-exec:$1" >> "$AUTH_TEST_EVENTS"
shift
exec "$@"
`;
    fs.writeFileSync(path.join(binDir, 'node'), nodeShim, { mode: 0o700 });
    fs.writeFileSync(path.join(binDir, 'su-exec'), suExecShim, { mode: 0o700 });
    for (const command of ['chown', 'chmod']) {
        fs.writeFileSync(path.join(binDir, command),
            `#!/bin/sh\nprintf '%s\\n' '${command}' >> "$AUTH_TEST_EVENTS"\n`, { mode: 0o700 });
    }

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        AUTH_TEST_NODE: process.execPath,
        AUTH_TEST_HELPER: helperPath,
        AUTH_TEST_DATA_DIR: runtimeDir,
        AUTH_TEST_EVENTS: eventsPath,
        AUTH_TEST_MARKER: markerPath,
        AUTH_TEST_FORCE_FAIL: options.failHelper ? 'true' : 'false',
        AUTH_TEST_USE_EXPLICIT: options.explicit ? 'true' : 'false',
        AUTH_TEST_EXPECTED_SECRET: options.explicit ?? '',
        NEXTAUTH_SECRET: options.explicit,
    };
    if (options.explicit === undefined) delete env.NEXTAUTH_SECRET;
    const serviceProbe = `
const fs = require('node:fs');
const expected = process.env.AUTH_TEST_USE_EXPLICIT === 'true'
    ? process.env.AUTH_TEST_EXPECTED_SECRET
    : fs.readFileSync(process.env.AUTH_TEST_DATA_DIR + '/.nextauth_secret', 'utf8');
if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET !== expected) process.exit(41);
fs.writeFileSync(process.env.AUTH_TEST_MARKER, 'started', { mode: 0o600 });
`;
    const result = spawnSync('sh', [probePath, process.execPath, '-e', serviceProbe], {
        env, encoding: 'utf8', timeout: 10000,
    });
    const events = fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, 'utf8').trim().split('\n') : [];
    return { result, events, markerPath, runtimeDir };
}

beforeEach(() => {
    // os.tmpdir() honors TMPDIR; every fixture and subprocess stays in this directory.
    dataDir = fs.mkdtempSync(path.join(tmpdir(), 'wrong-notebook-auth-secret-'));
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('persistent Docker authentication secret', () => {
    it('generates 32 random bytes as 64 lowercase hex characters in a private file', () => {
        const ensureAuthSecret = loadHelper();
        const randomBytes = vi.spyOn(crypto, 'randomBytes');
        const secret = ensureAuthSecret({ dataDir, env: {} });
        // Assert booleans rather than secret strings so failure reports cannot disclose them.
        expect(validSecret.test(secret)).toBe(true);
        expect(secret.length).toBe(64);
        expect(Buffer.from(secret, 'hex').length).toBe(32);
        expect(randomBytes.mock.calls.some(([size]) => size === 32)).toBe(true);
        expect(fs.readFileSync(storedPath(), 'utf8') === secret).toBe(true);
        expect(fs.statSync(storedPath()).mode & 0o7777).toBe(0o600);
        expect(fs.readdirSync(dataDir)).toEqual([secretName]);
    });

    it('creates a missing data directory', () => {
        const ensureAuthSecret = loadHelper();
        const nestedDir = path.join(dataDir, 'missing', 'data');
        const secret = ensureAuthSecret({ dataDir: nestedDir, env: { NEXTAUTH_SECRET: '' } });
        expect(validSecret.test(secret)).toBe(true);
        expect(fs.readFileSync(storedPath(nestedDir), 'utf8') === secret).toBe(true);
        expect(fs.statSync(storedPath(nestedDir)).mode & 0o7777).toBe(0o600);
    });

    it('reuses the same file and secret across calls and separate process restarts', () => {
        const ensureAuthSecret = loadHelper();
        const secret = ensureAuthSecret({ dataDir, env: {} });
        const inode = fs.statSync(storedPath()).ino;
        expect(ensureAuthSecret({ dataDir, env: {} }) === secret).toBe(true);
        for (let restart = 0; restart < 2; restart++) {
            const result = runCli();
            expect(result.status).toBe(0);
            expect(result.stdout === secret).toBe(true);
            expect(result.stderr.length).toBe(0);
        }
        expect(fs.statSync(storedPath()).ino).toBe(inode);
        expect(fs.readdirSync(dataDir)).toEqual([secretName]);
    });

    it('preserves an explicit secret exactly without reading or changing the persisted file', () => {
        const ensureAuthSecret = loadHelper();
        const persisted = crypto.randomBytes(32).toString('hex');
        const explicit = ' \texplicit value with spaces\nand a trailing newline\n';
        writeStored(persisted);
        fs.chmodSync(storedPath(), 0o640);
        const before = fs.statSync(storedPath());
        const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
            throw new Error('An explicit secret must not read persistence');
        });
        const inspect = vi.spyOn(fs, 'lstatSync').mockImplementation(() => {
            throw new Error('An explicit secret must not inspect persistence');
        });
        let returned: string;
        try {
            returned = ensureAuthSecret({ dataDir, env: { NEXTAUTH_SECRET: explicit } });
        } finally {
            read.mockRestore();
            inspect.mockRestore();
        }
        expect(returned! === explicit).toBe(true);
        expect(fs.readFileSync(storedPath(), 'utf8') === persisted).toBe(true);
        const after = fs.statSync(storedPath());
        expect(after.mode).toBe(before.mode);
        expect(after.ino).toBe(before.ino);
        expect(after.mtimeMs).toBe(before.mtimeMs);
        expect(after.ctimeMs).toBe(before.ctimeMs);
    });

    it('does not create a data directory when an explicit secret is supplied', () => {
        const ensureAuthSecret = loadHelper();
        const missingDir = path.join(dataDir, 'not-created');
        const explicit = 'explicit secret';
        expect(ensureAuthSecret({ dataDir: missingDir, env: { NEXTAUTH_SECRET: explicit } }) === explicit).toBe(true);
        expect(fs.existsSync(missingDir)).toBe(false);
    });

    it('accepts nonempty whitespace literally and ignores even corrupt persisted data', () => {
        const ensureAuthSecret = loadHelper();
        writeStored('corrupt');
        const explicit = ' \t\n';
        expect(ensureAuthSecret({ dataDir, env: { NEXTAUTH_SECRET: explicit } }) === explicit).toBe(true);
        expect(fs.readFileSync(storedPath(), 'utf8') === 'corrupt').toBe(true);
    });

    it('defaults env to process.env and preserves an explicit value', () => {
        const ensureAuthSecret = loadHelper();
        const explicit = 'environment default';
        vi.stubEnv('NEXTAUTH_SECRET', explicit);
        expect(ensureAuthSecret({ dataDir }) === explicit).toBe(true);
        expect(ensureAuthSecret() === explicit).toBe(true);
        expect(fs.readdirSync(dataDir).length).toBe(0);
    });

    it('defaults the persistent directory to /app/data without touching it in the test', () => {
        const ensureAuthSecret = loadHelper();
        vi.stubEnv('NEXTAUTH_SECRET', '');
        const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
            throw new Error('Blocked default-directory probe');
        });
        expect(() => ensureAuthSecret()).toThrow();
        expect(mkdir.mock.calls[0]?.[0]).toBe('/app/data');
    });

    it('tightens a valid existing file to mode 0600 without rotating it', () => {
        const ensureAuthSecret = loadHelper();
        const persisted = crypto.randomBytes(32).toString('hex');
        writeStored(persisted);
        fs.chmodSync(storedPath(), 0o644);
        expect(ensureAuthSecret({ dataDir, env: {} }) === persisted).toBe(true);
        expect(fs.statSync(storedPath()).mode & 0o7777).toBe(0o600);
    });

    it('enforces exactly 0600 even under a restrictive umask', () => {
        const ensureAuthSecret = loadHelper();
        const previous = process.umask(0o777);
        try {
            expect(validSecret.test(ensureAuthSecret({ dataDir, env: {} }))).toBe(true);
        } finally {
            process.umask(previous);
        }
        expect(fs.statSync(storedPath()).mode & 0o7777).toBe(0o600);
    });

    it.each(['empty', 'nonhex', 'short', 'trailing-newline', 'oversized', 'directory', 'symlink', 'dangling-symlink', 'fifo'])
        ('fails closed without replacing an existing %s secret file', (kind) => {
            const ensureAuthSecret = loadHelper();
            const persisted = crypto.randomBytes(32).toString('hex');
            const target = path.join(dataDir, 'symlink-target');
            if (kind === 'directory') fs.mkdirSync(storedPath());
            else if (kind === 'symlink' || kind === 'dangling-symlink') {
                if (kind === 'symlink') fs.writeFileSync(target, persisted, { mode: 0o600 });
                fs.symlinkSync(target, storedPath());
            } else if (kind === 'fifo') {
                const fifo = spawnSync('mkfifo', [storedPath()], { timeout: 1000 });
                expect(fifo.status).toBe(0);
            } else {
                const contents: Record<string, string> = {
                    empty: '', nonhex: 'z'.repeat(64), short: persisted.slice(0, 63),
                    'trailing-newline': `${persisted}\n`, oversized: persisted.repeat(4),
                };
                writeStored(contents[kind]);
            }
            const before = fs.lstatSync(storedPath());
            const original = before.isFile() ? fs.readFileSync(storedPath()) : undefined;
            expect(() => ensureAuthSecret({ dataDir, env: {} })).toThrow();
            const after = fs.lstatSync(storedPath());
            expect(after.ino).toBe(before.ino);
            expect(after.mode).toBe(before.mode);
            if (original) expect(fs.readFileSync(storedPath()).equals(original)).toBe(true);
            if (kind === 'symlink') expect(fs.readFileSync(target, 'utf8') === persisted).toBe(true);
            if (kind === 'dangling-symlink') expect(fs.existsSync(target)).toBe(false);
            expect(fs.readdirSync(dataDir).some((name) => name.endsWith('.tmp'))).toBe(false);
        });

    it('does not fall back to an ephemeral secret when persistence cannot be created', () => {
        const ensureAuthSecret = loadHelper();
        const blocker = path.join(dataDir, 'not-a-directory');
        fs.writeFileSync(blocker, 'blocker');
        expect(() => ensureAuthSecret({ dataDir: path.join(blocker, 'data'), env: {} })).toThrow();
        expect(fs.readdirSync(dataDir)).toEqual(['not-a-directory']);
    });

    it('cleans its private temporary file and fails if atomic publication is denied', () => {
        const ensureAuthSecret = loadHelper();
        vi.spyOn(fs, 'linkSync').mockImplementation(() => {
            const error: NodeJS.ErrnoException = new Error('Simulated publication denial');
            error.code = 'EACCES';
            throw error;
        });
        expect(() => ensureAuthSecret({ dataDir, env: {} })).toThrow();
        expect(fs.readdirSync(dataDir).length).toBe(0);
    });

    it('does not overwrite a corrupt file that wins a race before atomic publication', () => {
        const ensureAuthSecret = loadHelper();
        const linkSync = fs.linkSync;
        const corrupt = 'concurrent corrupt value';
        vi.spyOn(fs, 'linkSync').mockImplementation((source, target) => {
            fs.writeFileSync(target, corrupt, { flag: 'wx', mode: 0o600 });
            return linkSync(source, target);
        });
        expect(() => ensureAuthSecret({ dataDir, env: {} })).toThrow();
        expect(fs.readFileSync(storedPath(), 'utf8') === corrupt).toBe(true);
        expect(fs.readdirSync(dataDir)).toEqual([secretName]);
    });

    it('returns one fully written secret across eight simultaneous exclusive publishers', async () => {
        loadHelper();
        const runtimeDir = path.join(dataDir, 'concurrent-data');
        const barrierDir = path.join(dataDir, 'barrier');
        fs.mkdirSync(runtimeDir);
        fs.mkdirSync(barrierDir);
        const gate = path.join(barrierDir, 'go');
        const childSource = `
const fs = require('node:fs');
const path = require('node:path');
const originalLink = fs.linkSync;
fs.linkSync = (source, target) => {
    fs.writeFileSync(path.join(process.env.AUTH_TEST_BARRIER, 'ready-' + process.pid), 'ready');
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(process.env.AUTH_TEST_GATE)) {
        if (Date.now() > deadline) throw new Error('Publication barrier timed out');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
    return originalLink(source, target);
};
try {
    const { ensureAuthSecret } = require(process.env.AUTH_TEST_HELPER);
    process.stdout.write(ensureAuthSecret({ dataDir: process.env.AUTH_TEST_DATA_DIR, env: {} }));
} catch {
    process.stderr.write('Auth-secret concurrent child failed.\\n');
    process.exitCode = 1;
}
`;
        const completions = Array.from({ length: 8 }, () => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
            const child = spawn(process.execPath, ['-e', childSource], {
                env: {
                    ...process.env, NEXTAUTH_SECRET: '', AUTH_TEST_HELPER: helperPath,
                    AUTH_TEST_DATA_DIR: runtimeDir, AUTH_TEST_BARRIER: barrierDir, AUTH_TEST_GATE: gate,
                },
            });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (chunk) => { stdout += chunk; });
            child.stderr.on('data', (chunk) => { stderr += chunk; });
            child.on('error', () => resolve({ code: -1, stdout: '', stderr: 'Child spawn failed' }));
            child.on('close', (code) => resolve({ code, stdout, stderr }));
        }));
        const allChildren = Promise.all(completions);
        let results: Awaited<typeof allChildren> = [];
        try {
            const deadline = Date.now() + 8000;
            while (fs.readdirSync(barrierDir).filter((name) => name.startsWith('ready-')).length < 8) {
                if (Date.now() > deadline) throw new Error('Concurrent publishers did not reach the barrier');
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
            expect(fs.existsSync(storedPath(runtimeDir))).toBe(false);
            const temporaryFiles = fs.readdirSync(runtimeDir);
            expect(temporaryFiles.length).toBe(8);
            expect(temporaryFiles.every((name) => {
                const stat = fs.statSync(path.join(runtimeDir, name));
                return name.endsWith('.tmp') && stat.isFile() && stat.size === 64 && (stat.mode & 0o7777) === 0o600;
            })).toBe(true);
        } finally {
            fs.writeFileSync(gate, 'go');
            results = await allChildren;
        }
        expect(results.every((result) => result.code === 0 && result.stderr.length === 0)).toBe(true);
        expect(results.every((result) => validSecret.test(result.stdout))).toBe(true);
        expect(new Set(results.map((result) => result.stdout)).size).toBe(1);
        expect(results.every((result) => result.stdout === fs.readFileSync(storedPath(runtimeDir), 'utf8'))).toBe(true);
        expect(fs.readdirSync(runtimeDir)).toEqual([secretName]);
    }, 20000);

    it('does not log secrets or diagnostics from the imported helper', () => {
        const ensureAuthSecret = loadHelper();
        const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const)
            .map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
        const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        let calls: number[];
        try {
            ensureAuthSecret({ dataDir, env: {} });
            ensureAuthSecret({ dataDir, env: {} });
            ensureAuthSecret({ dataDir, env: { NEXTAUTH_SECRET: 'explicit value' } });
            calls = [...consoleSpies, stdout, stderr].map((spy) => spy.mock.calls.length);
        } finally {
            for (const spy of [...consoleSpies, stdout, stderr]) spy.mockRestore();
        }
        expect(calls!.every((count) => count === 0)).toBe(true);
    });

    it('prints only the generated secret to CLI stdout, with no diagnostic leakage', () => {
        loadHelper();
        const result = runCli();
        expect(result.status).toBe(0);
        expect(validSecret.test(result.stdout)).toBe(true);
        expect(result.stdout === fs.readFileSync(storedPath(), 'utf8')).toBe(true);
        expect(result.stderr.length).toBe(0);
    });

    it('preserves an explicit CLI value exactly without creating persistence', () => {
        loadHelper();
        const explicit = ' \texplicit CLI value\n\n';
        const result = runCli(dataDir, { NEXTAUTH_SECRET: explicit });
        expect(result.status).toBe(0);
        expect(result.stdout === explicit).toBe(true);
        expect(result.stderr.length).toBe(0);
        expect(fs.readdirSync(dataDir).length).toBe(0);
    });

    it('fails the CLI with empty stdout and nonsecret diagnostics exclusively on stderr', () => {
        loadHelper();
        const secret = crypto.randomBytes(32).toString('hex');
        const corrupt = `${secret}\n`;
        writeStored(corrupt);
        const result = runCli();
        expect(result.status).not.toBe(0);
        expect(result.stdout.length).toBe(0);
        expect(result.stderr.length > 0).toBe(true);
        expect(result.stderr.includes(secret)).toBe(false);
        expect(/[0-9a-f]{64}/.test(result.stderr)).toBe(false);
        expect(fs.readFileSync(storedPath(), 'utf8') === corrupt).toBe(true);
    });
});

describe('Docker entrypoint authentication-secret integration contract', () => {
    it('initializes and exports the helper before any database operation', () => {
        const source = fs.readFileSync(entrypointPath, 'utf8');
        const beforeDatabase = source.slice(0, source.indexOf('# Check if the persistent database exists'));
        expect(beforeDatabase.includes('/app/dist-scripts/scripts/ensure-auth-secret.js')).toBe(true);
        expect(beforeDatabase.includes('export NEXTAUTH_SECRET')).toBe(true);
        expect(source.startsWith('#!/bin/sh\nset -e\n')).toBe(true);
    });

    it.each([['unset', undefined], ['empty', '']] as const)
        ('exports a persistent secret to the actual final exec when env is %s', (_label, explicit) => {
            const { result, events, markerPath, runtimeDir } = runEntrypoint({ explicit });
            expect(result.status).toBe(0);
            expect(fs.existsSync(markerPath)).toBe(true);
            expect(events.filter((event) => event === 'helper').length).toBe(1);
            // One privilege drop for private-file creation, one for the final service.
            expect(events.filter((event) => event === 'su-exec:nextjs:nodejs').length).toBe(2);
            const secret = fs.readFileSync(storedPath(runtimeDir), 'utf8');
            expect(validSecret.test(secret)).toBe(true);
            expect(fs.statSync(storedPath(runtimeDir)).mode & 0o7777).toBe(0o600);
            expect(result.stdout.includes(secret) || result.stderr.includes(secret)).toBe(false);
        });

    it('does not invoke the helper or change corrupt persistence when an explicit secret is set', () => {
        const explicit = ' \texplicit entrypoint value\nand trailing newlines\n\n';
        const existing = 'corrupt existing persistence';
        const { result, events, markerPath, runtimeDir } = runEntrypoint({ explicit, existing });
        expect(result.status).toBe(0);
        expect(fs.existsSync(markerPath)).toBe(true);
        expect(events.includes('helper')).toBe(false);
        expect(events.filter((event) => event === 'su-exec:nextjs:nodejs').length).toBe(1);
        expect(fs.readFileSync(storedPath(runtimeDir), 'utf8') === existing).toBe(true);
        expect(result.stdout.includes(explicit) || result.stderr.includes(explicit)).toBe(false);
    });

    it('propagates helper failure and never launches the service', () => {
        const { result, events, markerPath } = runEntrypoint({ failHelper: true });
        expect(result.status).toBe(23);
        expect(events.includes('helper')).toBe(true);
        expect(fs.existsSync(markerPath)).toBe(false);
        expect(result.stdout.length).toBe(0);
        expect(result.stderr.length > 0).toBe(true);
    });

    it('fails startup on corrupt persistence without rotating it or launching the service', () => {
        const existing = 'corrupt existing persistence';
        const { result, markerPath, runtimeDir } = runEntrypoint({ existing });
        expect(result.status).not.toBe(0);
        expect(fs.existsSync(markerPath)).toBe(false);
        expect(fs.readFileSync(storedPath(runtimeDir), 'utf8') === existing).toBe(true);
        expect(fs.readdirSync(runtimeDir)).toEqual([secretName]);
        expect(result.stdout.length).toBe(0);
        expect(result.stderr.includes(existing)).toBe(false);
    });
});
