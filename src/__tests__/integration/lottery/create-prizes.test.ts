// @vitest-environment node
/** Real Prisma/SQLite/files; auth and logger are the only boundary stubs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSqliteFixture, type SqliteFixture } from './sqlite-fixture';
import { PNG_BYTES, PNG_DATA_URL } from '../../unit/lottery/image-fixtures';
import { savePrizeImageFromDataUrl } from '@/lib/prize-image';

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({
    user: { id: 'admin', role: 'admin' }, expires: '2099-01-01T00:00:00.000Z',
})) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

let fixture: SqliteFixture;
let api: typeof import('@/app/api/admin/prizes/route');
beforeAll(async () => {
    fixture = await createSqliteFixture();
    vi.doMock('@/lib/prisma', () => ({ prisma: fixture.client }));
    api = await import('@/app/api/admin/prizes/route');
}, 60_000);
afterAll(async () => { await fixture?.cleanup(); });
beforeEach(async () => {
    await fixture.client.drawRecord.deleteMany();
    await fixture.client.prize.deleteMany();
    await fixture.client.prize.create({ data: { id: 'existing', name: '原奖品', stock: 1 } });
    await fs.rm(path.join(fixture.root, 'data'), { recursive: true, force: true });
    vi.spyOn(process, 'cwd').mockReturnValue(fixture.root);
});
function create(body: Record<string, unknown>) {
    return api.POST(new Request('http://localhost/api/admin/prizes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
}
async function existingImage() {
    const relPath = await savePrizeImageFromDataUrl(PNG_DATA_URL);
    await fixture.client.prize.update({ where: { id: 'existing' }, data: { imagePath: relPath } });
    return relPath;
}
async function storedFiles() {
    return fs.readdir(path.join(fixture.root, 'data', 'uploads', 'prizes'));
}
const invalidStocks: Array<[string, unknown]> = [
    ['negative', -1], ['fractional', 1.5], ['overflow', 2_147_483_648], ['unsafe integer', Number.MAX_SAFE_INTEGER],
    ['numeric string', '1'], ['empty string', ''], ['boolean', true], ['object', {}], ['array', []],
];

describe('admin prize POST stock and failure image cleanup', () => {
    it.each(invalidStocks)('rejects invalid create stock: %s', async (_label, stock) => {
        expect((await create({ name: '新奖品', stock })).status).toBe(400);
        expect(await fixture.client.prize.count()).toBe(1);
    });

    it('accepts null/default unlimited stock, zero and the maximum Prisma integer without expectedStock', async () => {
        for (const stock of [undefined, null, 0, 2_147_483_647]) {
            const response = await create({ name: '有效库存奖品', stock });
            expect(response.status).toBe(201);
            const body = await response.json();
            expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: body.prize.id } })).stock).toBe(stock ?? null);
        }
    });

    it('rejects invalid create stock before saving a supplied image', async () => {
        const old = await existingImage();
        expect((await create({ name: '非法库存', stock: 1.5, imageDataUrl: PNG_DATA_URL })).status).toBe(400);
        expect(await storedFiles()).toEqual([path.basename(old)]);
        expect(await fixture.client.prize.count()).toBe(1);
    });

    it('cleans the unreferenced new image when real SQLite rejects prize creation', async () => {
        const old = await existingImage();
        await fixture.client.$executeRawUnsafe(`
            CREATE TRIGGER lottery_test_fail_create BEFORE INSERT ON "Prize"
            BEGIN SELECT RAISE(ABORT, 'lottery fixture prize create failure'); END
        `);
        try {
            expect((await create({ name: '创建应失败', stock: 1, imageDataUrl: PNG_DATA_URL })).status).toBe(500);
            expect(await fixture.client.prize.count()).toBe(1);
            expect(await storedFiles()).toEqual([path.basename(old)]);
        } finally {
            await fixture.client.$executeRawUnsafe('DROP TRIGGER lottery_test_fail_create');
        }
    });

    it('preserves the image after a successful real prize creation', async () => {
        const response = await create({ name: '成功创建', stock: 1, imageDataUrl: PNG_DATA_URL });
        expect(response.status).toBe(201);
        const body = await response.json();
        const prize = await fixture.client.prize.findUniqueOrThrow({ where: { id: body.prize.id } });
        expect(prize.imagePath).toBeTruthy();
        await expect(fs.readFile(path.join(fixture.root, 'data', prize.imagePath!))).resolves.toEqual(PNG_BYTES);
    });
});
