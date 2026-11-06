// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSqliteFixture, LOTTERY_MIGRATION } from './sqlite-fixture';

describe('lottery migration upgrade on an existing SQLite database', () => {
    it('runs old migrate deploy, keeps existing fixtures, then deploys the lottery migration with its seed and indexes', async () => {
        const fixture = await createSqliteFixture(false);
        try {
            const db = fixture.client;
            expect(fixture.deployOutput).toContain('All migrations have been successfully applied');
            expect(await db.$queryRaw<Array<{ name: string }>>`
                SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('Prize', 'DrawRecord')
            `).toEqual([]);
            const oldApplied = await db.$queryRaw<Array<{ migration_name: string }>>`
                SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name
            `;
            expect(oldApplied.map((row) => row.migration_name)).toEqual(fixture.migrationNames);

            await db.user.create({ data: {
                id: 'legacy-user', email: 'legacy@lottery.test', password: 'unused-test-only', name: '旧用户',
                role: 'user', educationStage: 'junior_high', enrollmentYear: 2025,
            } });
            await db.subject.create({ data: { id: 'legacy-subject', name: '数学', userId: 'legacy-user' } });
            await db.knowledgeTag.create({ data: { id: 'legacy-tag', name: '方程', subject: 'math', userId: 'legacy-user' } });
            await db.errorItem.create({ data: {
                id: 'legacy-error', userId: 'legacy-user', subjectId: 'legacy-subject', originalImageUrl: 'fixture-inline-image',
                questionText: 'x + 1 = 2', wrongAnswerText: 'x = 2', mistakeAnalysis: '移项错误', mistakeStatus: 'wrong_attempt',
                geogebraCommands: '["x=1"]', tags: { connect: { id: 'legacy-tag' } }, masteryLevel: 1,
            } });
            await db.reviewSchedule.create({ data: { id: 'legacy-review', errorItemId: 'legacy-error', scheduledFor: new Date('2026-01-01T00:00:00.000Z') } });
            await db.practiceRecord.create({ data: { id: 'legacy-practice', userId: 'legacy-user', subject: 'math', isCorrect: false } });
            const userSelect = { id: true, email: true, name: true, role: true, educationStage: true, enrollmentYear: true, createdAt: true, updatedAt: true } as const;
            const before = {
                user: await db.user.findUniqueOrThrow({ where: { id: 'legacy-user' }, select: userSelect }),
                subject: await db.subject.findUniqueOrThrow({ where: { id: 'legacy-subject' } }),
                error: await db.errorItem.findUniqueOrThrow({ where: { id: 'legacy-error' }, include: { tags: true, reviewSchedules: true } }),
                practice: await db.practiceRecord.findUniqueOrThrow({ where: { id: 'legacy-practice' } }),
            };
            await fixture.addLotteryMigration();
            const upgradeOutput = fixture.deploy();
            expect(upgradeOutput).toContain(LOTTERY_MIGRATION);
            expect(upgradeOutput).toContain('All migrations have been successfully applied');
            expect(fixture.status()).toContain('Database schema is up to date');
            expect({
                user: await db.user.findUniqueOrThrow({ where: { id: 'legacy-user' }, select: userSelect }),
                subject: await db.subject.findUniqueOrThrow({ where: { id: 'legacy-subject' } }),
                error: await db.errorItem.findUniqueOrThrow({ where: { id: 'legacy-error' }, include: { tags: true, reviewSchedules: true } }),
                practice: await db.practiceRecord.findUniqueOrThrow({ where: { id: 'legacy-practice' } }),
            }).toEqual(before);
            expect(await db.prize.findUnique({ where: { id: 'seed-thanks' } })).toMatchObject({ name: '谢谢参与', isBlank: true, stock: null });
            expect(await db.drawRecord.count()).toBe(0);
            const indexes = await db.$queryRaw<Array<{ name: string }>>`
                SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (
                    'Prize_enabled_sortOrder_idx', 'DrawRecord_userId_createdAt_idx', 'DrawRecord_createdAt_idx'
                ) ORDER BY name
            `;
            expect(indexes.map((row) => row.name)).toEqual([
                'DrawRecord_createdAt_idx', 'DrawRecord_userId_createdAt_idx', 'Prize_enabled_sortOrder_idx',
            ]);
            expect((await db.$queryRaw<Array<{ migration_name: string }>>`
                SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name
            `).map((row) => row.migration_name)).toEqual([...fixture.migrationNames, LOTTERY_MIGRATION].sort());
            expect(fixture.deploy()).toContain('No pending migrations to apply');
            expect(await db.prize.count({ where: { id: 'seed-thanks' } })).toBe(1);
            expect(await db.$queryRaw<Array<{ table: string }>>`PRAGMA foreign_key_check`).toEqual([]);
        } finally {
            await fixture.cleanup();
        }
    }, 60_000);
});
