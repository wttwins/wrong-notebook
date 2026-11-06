// @vitest-environment node
/** Auth is stubbed; records, migrations, transactions and image files are real. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Session } from 'next-auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSqliteFixture, seedLotteryUsers, type SqliteFixture } from './sqlite-fixture';
import { PNG_BYTES, PNG_DATA_URL } from '../../unit/lottery/image-fixtures';
import { savePrizeImageFromDataUrl } from '@/lib/prize-image';

const state = vi.hoisted(() => ({
    session: { user: { id: 'owner', role: 'user' }, expires: '2099-01-01T00:00:00.000Z' } as Session | null,
    config: { lottery: { enabled: true, drawsPerDay: 0 } },
}));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => state.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => state.config }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

let fixture: SqliteFixture;
let images: typeof import('@/app/api/lottery/records/[id]/image/route');
let currentImages: typeof import('@/app/api/lottery/prizes/[id]/image/route');
let recordsApi: typeof import('@/app/api/lottery/records/route');
let adminApi: typeof import('@/app/api/admin/prizes/[id]/route');
let draw: typeof import('@/lib/lottery');
let snapshotPath: string;
let recordId: string;

beforeAll(async () => {
    fixture = await createSqliteFixture();
    await seedLotteryUsers(fixture.client);
    vi.doMock('@/lib/prisma', () => ({ prisma: fixture.client }));
    images = await import('@/app/api/lottery/records/[id]/image/route');
    currentImages = await import('@/app/api/lottery/prizes/[id]/image/route');
    recordsApi = await import('@/app/api/lottery/records/route');
    adminApi = await import('@/app/api/admin/prizes/[id]/route');
    draw = await import('@/lib/lottery');
}, 60_000);
afterAll(async () => { await fixture?.cleanup(); });
beforeEach(async () => {
    state.session = { user: { id: 'owner', role: 'user' }, expires: '2099-01-01T00:00:00.000Z' };
    await fixture.client.drawRecord.deleteMany();
    await fixture.client.prize.deleteMany();
    await fs.rm(path.join(fixture.root, 'data'), { recursive: true, force: true });
    vi.spyOn(process, 'cwd').mockReturnValue(fixture.root);
    snapshotPath = await savePrizeImageFromDataUrl(PNG_DATA_URL);
    await fixture.client.prize.create({ data: { id: 'target', name: '抽中时名称', imagePath: snapshotPath, stock: 1 } });
    recordId = (await draw.drawOnce('owner')).recordId!;
});

function historicalImage(id = recordId, query = '') {
    return images.GET(new Request(`http://localhost/api/lottery/records/${encodeURIComponent(id)}/image${query}`), { params: Promise.resolve({ id }) });
}
function patch(body: Record<string, unknown>) {
    state.session = { user: { id: 'admin', role: 'admin' }, expires: '2099-01-01T00:00:00.000Z' };
    return adminApi.PATCH(new Request('http://localhost/api/admin/prizes/target', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: 'target' }) });
}

describe('authenticated record snapshot image API on real SQLite', () => {
    it('serves the owner snapshot with strict MIME and private revalidation', async () => {
        const response = await historicalImage();
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(response.headers.get('cache-control')).toBe('private, no-cache');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES);
    });

    it('returns 401 without a session or without a valid session user ID', async () => {
        state.session = null;
        expect((await historicalImage()).status).toBe(401);
        state.session = { user: { role: 'user' }, expires: '2099-01-01T00:00:00.000Z' } as Session;
        expect((await historicalImage()).status).toBe(401);
    });

    it('returns indistinguishable 404 responses to another user and for a missing record', async () => {
        state.session = { user: { id: 'other', role: 'user' }, expires: '2099-01-01T00:00:00.000Z' };
        const foreign = await historicalImage();
        const missing = await historicalImage('missing-record');
        expect(foreign.status).toBe(404);
        expect(missing.status).toBe(404);
        expect(await foreign.json()).toEqual(await missing.json());
    });

    it('allows an administrator to see another user snapshot', async () => {
        state.session = { user: { id: 'admin', role: 'admin' }, expires: '2099-01-01T00:00:00.000Z' };
        expect((await historicalImage()).status).toBe(200);
    });

    it.each(['replace', 'remove'] as const)('keeps the historical image and name after an admin image %s', async (action) => {
        const response = await patch(action === 'replace'
            ? { name: '现在的名称', imageDataUrl: PNG_DATA_URL }
            : { name: '现在的名称', removeImage: true });
        expect(response.status).toBe(200);
        state.session = { user: { id: 'owner', role: 'user' }, expires: '2099-01-01T00:00:00.000Z' };
        const historical = await historicalImage();
        expect(historical.status).toBe(200);
        expect(Buffer.from(await historical.arrayBuffer())).toEqual(PNG_BYTES);
        expect(await fixture.client.drawRecord.findUnique({ where: { id: recordId } })).toMatchObject({ prizeName: '抽中时名称', prizeImagePath: snapshotPath });
        const current = await currentImages.GET(new Request('http://localhost/api/lottery/prizes/target/image'), { params: Promise.resolve({ id: 'target' }) });
        expect(current.status).toBe(action === 'replace' ? 200 : 404);
        if (action === 'replace') expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: 'target' } })).imagePath).not.toBe(snapshotPath);
    });

    it('does not accept a file path through its ID or request query', async () => {
        expect((await historicalImage(snapshotPath)).status).toBe(404);
        const response = await historicalImage(recordId, '?path=../../private.png&imagePath=/etc/passwd');
        expect(response.status).toBe(200);
        expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES);
    });

    it.each(['../uploads/prizes/', 'elsewhere/'])('rejects malformed snapshot path prefix %s', async (prefix) => {
        await fixture.client.drawRecord.update({ where: { id: recordId }, data: { prizeImagePath: prefix + path.basename(snapshotPath) } });
        expect((await historicalImage()).status).toBe(404);
    });

    it('returns 404 for a missing file, no image or an unsupported MIME/extension', async () => {
        await fs.unlink(path.join(fixture.root, 'data', snapshotPath));
        expect((await historicalImage()).status).toBe(404);
        await fixture.client.drawRecord.update({ where: { id: recordId }, data: { prizeImagePath: null } });
        expect((await historicalImage()).status).toBe(404);
        const unsupported = 'uploads/prizes/unsupported.gif';
        await fs.writeFile(path.join(fixture.root, 'data', unsupported), Buffer.from('GIF89a fixture data'));
        await fixture.client.drawRecord.update({ where: { id: recordId }, data: { prizeImagePath: unsupported } });
        expect((await historicalImage()).status).toBe(404);
    });

    it('keeps existing records filtering stable by rejecting recorded prize type changes', async () => {
        expect((await patch({ isBlank: true })).status).toBe(409);
        state.session = { user: { id: 'owner', role: 'user' }, expires: '2099-01-01T00:00:00.000Z' };
        const beforeBlank = await recordsApi.GET(new Request('http://localhost/api/lottery/records'));
        expect((await beforeBlank.json()).records.map((record: { id: string }) => record.id)).toEqual([recordId]);
        await fixture.client.prize.create({ data: { id: 'blank', name: '谢谢参与', stock: null, isBlank: true } });
        await draw.drawOnce('owner');
        const filtered = await recordsApi.GET(new Request('http://localhost/api/lottery/records'));
        expect((await filtered.json()).records.map((record: { id: string }) => record.id)).toEqual([recordId]);
    });
});
