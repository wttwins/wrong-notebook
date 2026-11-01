/**
 * 抽奖核心逻辑（独立功能，不与错题、积分挂钩）
 *
 * 设计要点：
 *  1. 加权随机：每条奖品有相对权重 weight，越大越容易抽中。
 *     必须存在至少一条「谢谢参与」（isBlank=true）作为未中奖落点，
 *     否则所有概率之和为 1，奖品一定会被抽空。
 *  2. 库存扣减用「条件更新 + 影响行数判断」：
 *        updateMany({ where: { id, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } })
 *     若 count === 0，说明被并发请求抽走了，需要重抽。
 *     不能「先查库存再扣」，那在并发下会超发。
 *  3. 中奖时把奖品名称与图片快照写入记录，之后管理员改名换图不影响历史。
 */
import { prisma } from './prisma';
import { getAppConfig } from './config';

/** 每天可抽次数：0 表示不限 */
export function getDrawsPerDay(): number {
    const cfg = getAppConfig();
    const n = cfg.lottery?.drawsPerDay;
    if (typeof n !== 'number' || Number.isNaN(n) || n < 0) return 1; // 默认每天 1 次
    return Math.floor(n);
}

export function isLotteryEnabled(): boolean {
    const cfg = getAppConfig();
    return cfg.lottery?.enabled !== false; // 默认开启
}

/** 今日已抽次数（按服务器本地时区的自然日） */
export async function getTodayDrawCount(userId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return prisma.drawRecord.count({
        where: { userId, createdAt: { gte: start } },
    });
}

export interface LotteryStatus {
    enabled: boolean;
    drawsPerDay: number;
    drawsUsedToday: number;
    drawsLeft: number;      // 剩余次数；drawsPerDay 为 0 时用 -1 表示不限
    canDraw: boolean;
    reason?: string;        // 不可抽的原因
    prizeCount: number;     // 可抽奖品数量（不含「谢谢参与」）
}

export async function getLotteryStatus(userId: string): Promise<LotteryStatus> {
    const enabled = isLotteryEnabled();
    const drawsPerDay = getDrawsPerDay();
    const drawsUsedToday = await getTodayDrawCount(userId);

    const [prizeCount, poolCount] = await Promise.all([
        prisma.prize.count({ where: { enabled: true, isBlank: false } }),
        prisma.prize.count({
            where: {
                enabled: true,
                OR: [{ stock: null }, { stock: { gt: 0 } }],
            },
        }),
    ]);

    const unlimited = drawsPerDay === 0;
    const drawsLeft = unlimited ? -1 : Math.max(0, drawsPerDay - drawsUsedToday);

    let canDraw = true;
    let reason: string | undefined;

    if (!enabled) {
        canDraw = false;
        reason = 'lottery_disabled';
    } else if (poolCount === 0) {
        canDraw = false;
        reason = 'no_prizes';
    } else if (!unlimited && drawsLeft === 0) {
        canDraw = false;
        reason = 'daily_limit_reached';
    }

    return { enabled, drawsPerDay, drawsUsedToday, drawsLeft, canDraw, reason, prizeCount };
}

export class DrawError extends Error {
    code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

export interface DrawResult {
    prizeId: string;
    prizeName: string;
    prizeDescription: string | null;
    prizeImagePath: string | null;
    isBlank: boolean;
    recordId: string | null;   // 「谢谢参与」也会落库，便于统计
    stockLeft: number | null;
}

/** 按权重挑一个候选（已按库存过滤） */
function weightedPick<T extends { weight: number }>(items: T[]): T | null {
    const total = items.reduce((sum, it) => sum + Math.max(1, it.weight), 0);
    if (total <= 0) return null;

    let r = Math.random() * total;
    for (const it of items) {
        r -= Math.max(1, it.weight);
        if (r < 0) return it;
    }
    return items[items.length - 1] ?? null;
}

/**
 * 执行一次抽奖。
 *
 * 注意：整个流程在一个事务里完成，包含
 *   ① 复查今日次数（防止并发绕过每日上限）
 *   ② 过滤可抽奖品 → 加权随机
 *   ③ 条件更新扣库存（失败则重抽，最多 MAX_RETRY 次）
 *   ④ 写中奖记录
 */
export async function drawOnce(userId: string): Promise<DrawResult> {
    const MAX_RETRY = 5;

    if (!isLotteryEnabled()) {
        throw new DrawError('lottery_disabled', '抽奖功能已关闭');
    }

    const drawsPerDay = getDrawsPerDay();

    return prisma.$transaction(async (tx) => {
        // ① 事务内复查次数（SQLite 写事务串行执行，此处足够）
        if (drawsPerDay > 0) {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const used = await tx.drawRecord.count({
                where: { userId, createdAt: { gte: start } },
            });
            if (used >= drawsPerDay) {
                throw new DrawError('daily_limit_reached', '今天的抽奖次数已用完');
            }
        }

        // ② 取候选池
        let pool = await tx.prize.findMany({
            where: {
                enabled: true,
                OR: [{ stock: null }, { stock: { gt: 0 } }],
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });

        if (pool.length === 0) {
            throw new DrawError('no_prizes', '管理员还没有配置可抽的奖品');
        }

        // ③ 加权随机 + 条件扣库存
        for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
            const picked = weightedPick(pool);
            if (!picked) break;

            // 限量奖品：条件更新，count 为 0 说明刚好被抽走
            if (picked.stock !== null) {
                const updated = await tx.prize.updateMany({
                    where: { id: picked.id, stock: { gt: 0 } },
                    data: { stock: { decrement: 1 } },
                });
                if (updated.count === 0) {
                    // 从候选池移除后重抽
                    pool = pool.filter((p) => p.id !== picked.id);
                    if (pool.length === 0) break;
                    continue;
                }
            }

            // ④ 写记录（含快照）
            const record = await tx.drawRecord.create({
                data: {
                    userId,
                    prizeId: picked.id,
                    prizeName: picked.name,
                    prizeImagePath: picked.imagePath,
                },
            });

            const stockLeft = picked.stock === null ? null : picked.stock - 1;

            return {
                prizeId: picked.id,
                prizeName: picked.name,
                prizeDescription: picked.description,
                prizeImagePath: picked.imagePath,
                isBlank: picked.isBlank,
                recordId: record.id,
                stockLeft,
            };
        }

        throw new DrawError('no_stock', '奖品刚刚被抽完了，请稍后再试');
    });
}
