// @vitest-environment node
/** Real API handlers + real Prisma/SQLite/files. Only auth/config/logger are stubbed. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Session } from 'next-auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSqliteFixture, seedLotteryUsers, type SqliteFixture } from './sqlite-fixture';
import { PNG_BYTES, PNG_DATA_URL } from '../../unit/lottery/image-fixtures';
import { savePrizeImageFromDataUrl } from '@/lib/prize-image';
import { buildPrizePayload, type PrizeForm } from '@/lib/prize-form';

const state = vi.hoisted(() => ({
    session: { user: { id: 'admin', role: 'admin' }, expires: '2099-01-01T00:00:00.000Z' } as Session | null,
    config: { lottery: { enabled: true, drawsPerDay: 0 } },
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => state.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => state.config }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

let fixture: SqliteFixture;
let api: typeof import('@/app/api/admin/prizes/[id]/route');
let imageApi: typeof import('@/app/api/lottery/prizes/[id]/image/route');
let lottery: typeof import('@/lib/lottery');

beforeAll(async () => {
    fixture = await createSqliteFixture();
    await seedLotteryUsers(fixture.client);
    vi.doMock('@/lib/prisma', () => ({ prisma: fixture.client }));
    api = await import('@/app/api/admin/prizes/[id]/route');
    imageApi = await import('@/app/api/lottery/prizes/[id]/image/route');
    lottery = await import('@/lib/lottery');
}, 60_000);
afterAll(async () => { await fixture?.cleanup(); });
beforeEach(async () => {
    state.session = { user: { id: 'admin', role: 'admin' }, expires: '2099-01-01T00:00:00.000Z' };
    await fixture.client.drawRecord.deleteMany();
    await fixture.client.prize.deleteMany();
    await fixture.client.prize.create({ data: { id: 'target', name: '原奖品', stock: 1 } });
    await fs.rm(path.join(fixture.root, 'data'), { recursive: true, force: true });
    vi.spyOn(process, 'cwd').mockReturnValue(fixture.root);
    vi.spyOn(Math, 'random').mockReturnValue(0);
});

function patch(body: Record<string, unknown>, id = 'target') {
    return api.PATCH(new Request(`http://localhost/api/admin/prizes/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id }) });
}
function remove(id = 'target') {
    return api.DELETE(new Request(`http://localhost/api/admin/prizes/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });
}
function currentImage(id = 'target') {
    return imageApi.GET(new Request(`http://localhost/api/lottery/prizes/${id}/image`), { params: Promise.resolve({ id }) });
}
async function target() {
    return fixture.client.prize.findUniqueOrThrow({ where: { id: 'target' } });
}
async function attachImage() {
    const relPath = await savePrizeImageFromDataUrl(PNG_DATA_URL);
    await fixture.client.prize.update({ where: { id: 'target' }, data: { imagePath: relPath } });
    return relPath;
}
function imagePath(relPath: string) {
    return path.join(fixture.root, 'data', relPath);
}

const invalidStocks: Array<[string, unknown]> = [
    ['negative', -1], ['fractional', 1.5], ['overflow', 2_147_483_648], ['unsafe integer', Number.MAX_SAFE_INTEGER],
    ['numeric string', '1'], ['empty string', ''], ['boolean', true], ['object', {}], ['array', []],
];

describe('admin prize stock CAS against real SQLite', () => {
    it('preserves exhausted stock when a name-only PATCH follows a draw from stock=1', async () => {
        const prize = await target();
        const original: PrizeForm = {
            id: prize.id, name: prize.name, description: prize.description ?? '', weight: prize.weight,
            stock: prize.stock === null ? '' : String(prize.stock), enabled: prize.enabled, isBlank: prize.isBlank,
            sortOrder: prize.sortOrder, hasImage: !!prize.imagePath,
        };
        await expect(lottery.drawOnce('owner')).resolves.toMatchObject({ stockLeft: 0 });
        const payload = buildPrizePayload({ ...original, name: '仅改名称' }, original);
        expect(payload).toEqual({ name: '仅改名称' });
        expect((await patch(payload)).status).toBe(200);
        expect(await target()).toMatchObject({ name: '仅改名称', stock: 0 });
    });

    it('rejects a stale expectedStock after a draw, atomically preserving all fields', async () => {
        await lottery.drawOnce('owner');
        const response = await patch({ name: '不应保存', stock: 3, expectedStock: 1 });
        expect(response.status).toBe(409);
        expect(await target()).toMatchObject({ name: '原奖品', stock: 0 });
    });

    it('requires expectedStock for an explicit stock PATCH', async () => {
        expect((await patch({ stock: 2 })).status).toBe(400);
        expect((await target()).stock).toBe(1);
    });

    it.each(invalidStocks)('rejects invalid stock: %s', async (_label, stock) => {
        expect((await patch({ name: '不应保存', stock, expectedStock: 1 })).status).toBe(400);
        expect(await target()).toMatchObject({ name: '原奖品', stock: 1 });
    });

    it.each(invalidStocks)('rejects invalid expectedStock: %s', async (_label, expectedStock) => {
        expect((await patch({ name: '不应保存', stock: 2, expectedStock })).status).toBe(400);
        expect(await target()).toMatchObject({ name: '原奖品', stock: 1 });
    });

    it('rejects non-finite JSON numbers instead of turning them into unlimited stock', async () => {
        for (const body of ['{"stock":1e309,"expectedStock":1}', '{"stock":2,"expectedStock":1e309}']) {
            const response = await api.PATCH(new Request('http://localhost/api/admin/prizes/target', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
            }), { params: Promise.resolve({ id: 'target' }) });
            expect(response.status).toBe(400);
        }
        expect((await target()).stock).toBe(1);
    });

    it('accepts null expectedStock only when current stock is unlimited', async () => {
        expect((await patch({ stock: 2, expectedStock: null })).status).toBe(409);
        await fixture.client.prize.update({ where: { id: 'target' }, data: { stock: null } });
        expect((await patch({ stock: 2, expectedStock: null })).status).toBe(200);
        expect((await target()).stock).toBe(2);
    });

    it('accepts null as the new stock and both ends of the valid nonnegative Prisma range', async () => {
        expect((await patch({ stock: null, expectedStock: 1 })).status).toBe(200);
        expect((await target()).stock).toBeNull();
        expect((await patch({ stock: 2_147_483_647, expectedStock: null })).status).toBe(200);
        expect((await target()).stock).toBe(2_147_483_647);
        expect((await patch({ stock: 0, expectedStock: 2_147_483_647 })).status).toBe(200);
        expect((await target()).stock).toBe(0);
    });

    it('allows only one of two concurrent stock CAS edits from the same snapshot', async () => {
        const results = await Promise.all([
            patch({ stock: 5, expectedStock: 1 }), patch({ stock: 7, expectedStock: 1 }),
        ]);
        expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
        expect([5, 7]).toContain((await target()).stock);
    });

    it.each([
        ['sortOrder overflow', { sortOrder: 2_147_483_648 }],
        ['sortOrder underflow', { sortOrder: -2_147_483_649 }],
        ['sortOrder fractional', { sortOrder: 1.2 }],
        ['weight fractional', { weight: 1.2 }],
    ])('returns 400 for invalid Prisma integer field: %s', async (_label, body) => {
        expect((await patch(body)).status).toBe(400);
    });

    it('returns 400 for invalid JSON/object bodies, and leaves the prize unchanged', async () => {
        for (const body of ['{', 'null', '[]']) {
            const response = await api.PATCH(new Request('http://localhost/api/admin/prizes/target', { method: 'PATCH', body }), { params: Promise.resolve({ id: 'target' }) });
            expect(response.status).toBe(400);
        }
        expect((await target()).stock).toBe(1);
    });
});

describe('recorded prize type stability in real SQLite', () => {
    it.each([false, true])('rejects changing isBlank=%s once any draw exists', async (isBlank) => {
        await fixture.client.prize.update({ where: { id: 'target' }, data: { isBlank } });
        await lottery.drawOnce('owner');
        const response = await patch({ name: '不应保存', isBlank: !isBlank });
        expect(response.status).toBe(409);
        expect(await target()).toMatchObject({ name: '原奖品', isBlank });
    });

    it('allows changing type when no draw records exist', async () => {
        expect((await patch({ isBlank: true })).status).toBe(200);
        expect((await target()).isBlank).toBe(true);
        expect((await patch({ isBlank: false })).status).toBe(200);
        expect((await target()).isBlank).toBe(false);
    });

    it('allows an unchanged type and name edit after a record without altering its snapshot', async () => {
        const result = await lottery.drawOnce('owner');
        expect((await patch({ isBlank: false, name: '改名' })).status).toBe(200);
        expect(await fixture.client.drawRecord.findUnique({ where: { id: result.recordId! } })).toMatchObject({ prizeName: '原奖品' });
        expect((await target()).stock).toBe(0);
    });
});

describe('prize image reference lifetime with real files and records', () => {
    it.each(['replace', 'remove'] as const)('keeps a recorded snapshot file on image %s', async (action) => {
        const old = await attachImage();
        const draw = await lottery.drawOnce('owner');
        expect((await patch(action === 'replace' ? { imageDataUrl: PNG_DATA_URL } : { removeImage: true })).status).toBe(200);
        await expect(fs.readFile(imagePath(old))).resolves.toEqual(PNG_BYTES);
        expect(await fixture.client.drawRecord.findUnique({ where: { id: draw.recordId! } })).toMatchObject({ prizeImagePath: old });
    });

    it.each(['replace', 'remove', 'delete'] as const)('keeps an image shared by another Prize on %s', async (action) => {
        const old = await attachImage();
        await fixture.client.prize.create({ data: { name: '共用图奖品', imagePath: old, stock: 0 } });
        const response = action === 'delete' ? await remove() : await patch(action === 'replace' ? { imageDataUrl: PNG_DATA_URL } : { removeImage: true });
        expect(response.status).toBe(200);
        await expect(fs.readFile(imagePath(old))).resolves.toEqual(PNG_BYTES);
    });

    it('also keeps a snapshot referenced by a record belonging to a different Prize', async () => {
        const old = await attachImage();
        const otherPrize = await fixture.client.prize.create({ data: { name: '另一奖品', stock: 0 } });
        await fixture.client.drawRecord.create({ data: { userId: 'owner', prizeId: otherPrize.id, prizeName: '旧快照', prizeImagePath: old } });
        expect((await remove()).status).toBe(200);
        await expect(fs.readFile(imagePath(old))).resolves.toEqual(PNG_BYTES);
    });

    it.each(['replace', 'remove', 'delete'] as const)('cleans an unreferenced old image on %s', async (action) => {
        const old = await attachImage();
        const response = action === 'delete' ? await remove() : await patch(action === 'replace' ? { imageDataUrl: PNG_DATA_URL } : { removeImage: true });
        expect(response.status).toBe(200);
        await expect(fs.access(imagePath(old))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('cleans a newly saved unreferenced image after a real SQLite update failure', async () => {
        const old = await attachImage();
        await fixture.client.$executeRawUnsafe(`
            CREATE TRIGGER lottery_test_fail_prize BEFORE UPDATE ON "Prize"
            BEGIN SELECT RAISE(ABORT, 'lottery fixture prize update failure'); END
        `);
        try {
            expect((await patch({ imageDataUrl: PNG_DATA_URL })).status).toBe(500);
            expect((await target()).imagePath).toBe(old);
            expect(await fs.readdir(path.join(fixture.root, 'data', 'uploads', 'prizes'))).toEqual([path.basename(old)]);
        } finally {
            await fixture.client.$executeRawUnsafe('DROP TRIGGER lottery_test_fail_prize');
        }
    });

    it('cannot delete a Prize that has a blank or winning record', async () => {
        await lottery.drawOnce('owner');
        expect((await remove()).status).toBe(409);
        expect(await fixture.client.prize.count({ where: { id: 'target' } })).toBe(1);
    });
});

describe('mutable current-prize image URL and strict serving', () => {
    it('serves supported bytes with a revalidating private cache, not immutable', async () => {
        await attachImage();
        const response = await currentImage();
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(response.headers.get('cache-control')).toBe('private, no-cache');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES);
    });

    it.each(['../uploads/prizes/', 'elsewhere/', '/uploads/prizes/'])('rejects a stored path with wrong prefix %s instead of serving its basename', async (prefix) => {
        const old = await attachImage();
        await fixture.client.prize.update({ where: { id: 'target' }, data: { imagePath: prefix + path.basename(old) } });
        expect((await currentImage()).status).toBe(404);
    });

    it('rejects content whose magic bytes disagree with the extension/MIME', async () => {
        await attachImage();
        const relPath = 'uploads/prizes/wrong-type.jpg';
        await fs.writeFile(imagePath(relPath), PNG_BYTES);
        await fixture.client.prize.update({ where: { id: 'target' }, data: { imagePath: relPath } });
        expect((await currentImage()).status).toBe(404);
    });

    it('rejects non-images even when the stored filename ends in png', async () => {
        const relPath = await attachImage();
        await fs.writeFile(imagePath(relPath), 'not an image');
        expect((await currentImage()).status).toBe(404);
    });

    it('rejects a symlink rather than reading a file outside prize storage', async () => {
        const relPath = await attachImage();
        const outside = path.join(fixture.root, 'not-in-prize-storage.png');
        await fs.writeFile(outside, PNG_BYTES);
        await fs.unlink(imagePath(relPath));
        await fs.symlink(outside, imagePath(relPath));
        expect((await currentImage()).status).toBe(404);
    });

    it('requires a session for current images', async () => {
        await attachImage();
        state.session = null;
        expect((await currentImage()).status).toBe(401);
    });
});

describe('admin API access boundaries', () => {
    it('returns 401 without a session, 403 to a regular user, and 404 for a missing Prize', async () => {
        state.session = null;
        expect((await patch({ name: '不应保存' })).status).toBe(401);
        state.session = { user: { id: 'owner', role: 'user' }, expires: '2099-01-01T00:00:00.000Z' };
        expect((await patch({ name: '不应保存' })).status).toBe(403);
        state.session = { user: { id: 'admin', role: 'admin' }, expires: '2099-01-01T00:00:00.000Z' };
        expect((await patch({ name: '缺失奖品' }, 'missing')).status).toBe(404);
        expect((await target()).name).toBe('原奖品');
    });
});
