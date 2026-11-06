// @vitest-environment node
/** Real migrated SQLite; only app config is stubbed, not Prisma or transactions. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { createSqliteFixture, seedLotteryUsers, type SqliteFixture } from './sqlite-fixture';

const config = vi.hoisted(() => ({ lottery: { enabled: true, drawsPerDay: 1 } }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => config }));

let fixture: SqliteFixture;
let lotteryA: typeof import('@/lib/lottery');
let lotteryB: typeof import('@/lib/lottery');

beforeAll(async () => {
    fixture = await createSqliteFixture();
    expect(Prisma.prismaVersion.client).toBe('5.22.0');
    expect(fixture.deployOutput).toContain('All migrations have been successfully applied');
    await seedLotteryUsers(fixture.client);

    // Import the real drawOnce against two real engines sharing the isolated DB.
    vi.doMock('@/lib/prisma', () => ({ prisma: fixture.client }));
    vi.resetModules();
    lotteryA = await import('@/lib/lottery');
    const secondClient = fixture.newClient();
    await secondClient.$connect();
    vi.doMock('@/lib/prisma', () => ({ prisma: secondClient }));
    vi.resetModules();
    lotteryB = await import('@/lib/lottery');
}, 60_000);

afterAll(async () => { await fixture?.cleanup(); });
beforeEach(async () => {
    config.lottery = { enabled: true, drawsPerDay: 1 };
    await fixture.client.drawRecord.deleteMany();
    await fixture.client.prize.deleteMany();
    vi.spyOn(Math, 'random').mockReturnValue(0);
});

describe('drawOnce real SQLite transaction regression', () => {
    it('handles a five-call burst for the same user without transaction expiration', async () => {
        const prize = await fixture.client.prize.create({ data: { name: '并发限额奖品', stock: 10 } });
        const results = await Promise.allSettled(
            Array.from({ length: 5 }, () => lotteryA.drawOnce('owner')),
        );
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const failures = results.filter((result) => result.status === 'rejected');
        expect(failures).toHaveLength(4);
        for (const failure of failures) {
            expect(failure.reason).toMatchObject({ code: 'daily_limit_reached' });
        }
        expect(await fixture.client.drawRecord.count({ where: { userId: 'owner' } })).toBe(1);
        expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: prize.id } })).stock).toBe(9);
    }, 30_000);

    it('handles a five-call burst competing for the final item without transaction expiration', async () => {
        config.lottery.drawsPerDay = 0;
        const prize = await fixture.client.prize.create({ data: { name: '并发最后一件', stock: 1 } });
        const results = await Promise.allSettled(
            ['owner', 'other', 'admin', 'owner', 'other'].map((userId) => lotteryA.drawOnce(userId)),
        );
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const failures = results.filter((result) => result.status === 'rejected');
        expect(failures).toHaveLength(4);
        for (const failure of failures) {
            expect(['no_prizes', 'no_stock']).toContain(failure.reason.code);
        }
        expect(await fixture.client.drawRecord.count({ where: { prizeId: prize.id } })).toBe(1);
        expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: prize.id } })).stock).toBe(0);
    }, 30_000);

    it('enforces the daily limit under concurrent calls for the same user across engines', async () => {
        const prize = await fixture.client.prize.create({ data: { name: '限额奖品', stock: 10 } });
        const results = await Promise.allSettled([
            lotteryA.drawOnce('owner'), lotteryB.drawOnce('owner'),
        ]);
        const successes = results.filter((result) => result.status === 'fulfilled');
        const failures = results.filter((result) => result.status === 'rejected');
        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
        expect(failures[0].reason).toMatchObject({ code: 'daily_limit_reached' });
        expect(await fixture.client.drawRecord.count({ where: { userId: 'owner' } })).toBe(1);
        expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: prize.id } })).stock).toBe(9);
    });

    it('issues the final finite item only once to competing users across engines', async () => {
        config.lottery.drawsPerDay = 0;
        const prize = await fixture.client.prize.create({ data: { name: '最后一件', stock: 1 } });
        const results = await Promise.allSettled([
            lotteryA.drawOnce('owner'), lotteryB.drawOnce('other'),
        ]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const failures = results.filter((result) => result.status === 'rejected');
        expect(failures).toHaveLength(1);
        expect(['no_prizes', 'no_stock']).toContain(failures[0].reason.code);
        expect(await fixture.client.drawRecord.count({ where: { prizeId: prize.id } })).toBe(1);
        expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: prize.id } })).stock).toBe(0);
    });

    it('rolls back stock and daily usage when SQLite rejects the record write', async () => {
        const prize = await fixture.client.prize.create({ data: { name: '回滚奖品', stock: 1 } });
        await fixture.client.$executeRawUnsafe(`
            CREATE TRIGGER lottery_test_fail_record BEFORE INSERT ON "DrawRecord"
            BEGIN SELECT RAISE(ABORT, 'lottery fixture record failure'); END
        `);
        try {
            await expect(lotteryA.drawOnce('owner')).rejects.toBeInstanceOf(Error);
            expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: prize.id } })).stock).toBe(1);
            expect(await fixture.client.drawRecord.count()).toBe(0);
            expect(await lotteryA.getTodayDrawCount('owner')).toBe(0);
        } finally {
            await fixture.client.$executeRawUnsafe('DROP TRIGGER lottery_test_fail_record');
        }
        await expect(lotteryA.drawOnce('owner')).resolves.toMatchObject({ prizeId: prize.id, stockLeft: 0 });
        expect(await fixture.client.drawRecord.count()).toBe(1);
    });

    it('does not consume stock or records when the lottery is disabled', async () => {
        const prize = await fixture.client.prize.create({ data: { name: '关闭时奖品', stock: 1 } });
        config.lottery.enabled = false;
        await expect(lotteryA.drawOnce('owner')).rejects.toMatchObject({ code: 'lottery_disabled' });
        expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: prize.id } })).stock).toBe(1);
        expect(await fixture.client.drawRecord.count()).toBe(0);
    });

    it('excludes disabled and exhausted prizes, and reports no pool without writing', async () => {
        await fixture.client.prize.createMany({ data: [
            { id: 'disabled', name: '停用', stock: 1, enabled: false },
            { id: 'empty', name: '售罄', stock: 0, enabled: true },
        ] });
        await expect(lotteryA.drawOnce('owner')).rejects.toMatchObject({ code: 'no_prizes' });
        expect(await fixture.client.drawRecord.count()).toBe(0);
        expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: 'disabled' } })).stock).toBe(1);
        expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: 'empty' } })).stock).toBe(0);
        const available = await fixture.client.prize.create({ data: { name: '可抽', stock: null } });
        await expect(lotteryA.drawOnce('owner')).resolves.toMatchObject({ prizeId: available.id, stockLeft: null });
    });

    it('records a blank outcome and counts it towards the daily limit without changing unlimited stock', async () => {
        const prize = await fixture.client.prize.create({ data: { name: '谢谢参与', isBlank: true, stock: null } });
        await expect(lotteryA.drawOnce('owner')).resolves.toMatchObject({ prizeId: prize.id, isBlank: true, stockLeft: null });
        await expect(lotteryB.drawOnce('owner')).rejects.toMatchObject({ code: 'daily_limit_reached' });
        expect(await fixture.client.drawRecord.count()).toBe(1);
        expect((await fixture.client.prize.findUniqueOrThrow({ where: { id: prize.id } })).stock).toBeNull();
    });
});
