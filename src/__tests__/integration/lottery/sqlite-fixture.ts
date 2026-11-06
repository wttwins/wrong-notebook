import { Prisma, PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PRISMA_SOURCE = path.join(REPO_ROOT, 'prisma');
export const LOTTERY_MIGRATION = '20261027020000_add_lottery';

/** Real Prisma 5.22 + migrated SQLite. Never reads a repository .env or DB. */
export async function createSqliteFixture(includeLottery = true) {
    if (Prisma.prismaVersion.client !== '5.22.0') {
        throw new Error('Lottery transaction regression requires Prisma Client 5.22.0');
    }
    // CI can omit TMPDIR; still use a private home cache, never the system /tmp.
    const scratch = process.env.TMPDIR ?? path.join(os.homedir(), '.cache', 'wrong-notebook-test-scratch');
    await fs.mkdir(scratch, { recursive: true });
    const root = await fs.mkdtemp(path.join(scratch, 'lottery-sqlite-'));
    const schemaPath = path.join(root, 'prisma', 'schema.prisma');
    const migrationsPath = path.join(root, 'prisma', 'migrations');
    const databaseUrl = `file:${path.join(root, 'lottery.db')}`;
    const clients: PrismaClient[] = [];

    // Explicit allowlist: no inherited service credentials, cookies or production URL.
    const cliEnv: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG,
        TMPDIR: scratch,
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
        CHECKPOINT_DISABLE: '1',
    };
    function runMigrationCommand(command: 'deploy' | 'status') {
        return execFileSync(process.execPath, [
            path.join(REPO_ROOT, 'node_modules', 'prisma', 'build', 'index.js'),
            'migrate', command, '--schema', schemaPath,
        ], { cwd: root, env: cliEnv, encoding: 'utf8', timeout: 60_000, stdio: 'pipe' });
    }
    function newClient() {
        const client = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
        clients.push(client);
        return client;
    }
    async function cleanup() {
        try {
            await Promise.all(clients.map((client) => client.$disconnect()));
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    }

    try {
        await fs.mkdir(migrationsPath, { recursive: true });
        await fs.copyFile(path.join(PRISMA_SOURCE, 'schema.prisma'), schemaPath);
        await fs.copyFile(path.join(PRISMA_SOURCE, 'migrations', 'migration_lock.toml'), path.join(migrationsPath, 'migration_lock.toml'));
        const migrationNames = (await fs.readdir(path.join(PRISMA_SOURCE, 'migrations'), { withFileTypes: true }))
            .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
            .map((entry) => entry.name)
            .filter((name) => includeLottery || name !== LOTTERY_MIGRATION)
            .sort();
        for (const name of migrationNames) {
            await fs.cp(path.join(PRISMA_SOURCE, 'migrations', name), path.join(migrationsPath, name), { recursive: true });
        }
        const deployOutput = runMigrationCommand('deploy');
        const client = newClient();
        await client.$connect();

        return {
            root, databaseUrl, schemaPath, migrationNames, deployOutput, client, newClient, cleanup,
            deploy: () => runMigrationCommand('deploy'),
            status: () => runMigrationCommand('status'),
            async addLotteryMigration() {
                await fs.cp(path.join(PRISMA_SOURCE, 'migrations', LOTTERY_MIGRATION), path.join(migrationsPath, LOTTERY_MIGRATION), { recursive: true });
            },
        };
    } catch (error) {
        await cleanup();
        throw error;
    }
}

export type SqliteFixture = Awaited<ReturnType<typeof createSqliteFixture>>;

export async function seedLotteryUsers(client: PrismaClient) {
    await client.user.createMany({
        data: [
            { id: 'owner', email: 'owner@lottery.test', password: 'unused-test-only' },
            { id: 'other', email: 'other@lottery.test', password: 'unused-test-only' },
            { id: 'admin', email: 'admin@lottery.test', password: 'unused-test-only', role: 'admin' },
        ],
    });
}
