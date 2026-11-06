import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { requireAdmin } from "@/lib/auth-utils";
import { forbidden, unauthorized, badRequest, notFound, internalError, conflict } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { savePrizeImageFromDataUrl, deletePrizeImageIfUnreferenced, PrizeImageError } from "@/lib/prize-image";
import { isPrizeStock, isPrismaInteger, MAX_PRISMA_INT } from "@/lib/prize-form";

const logger = createLogger('api:admin:prizes:id');
const MAX_NAME = 60;
const MAX_DESC = 300;
const MAX_WEIGHT = 1000;

class PrizeMutationError extends Error {
    constructor(public status: 404 | 409, message: string) { super(message); }
}

async function cleanupUnusedImage(imagePath?: string | null) {
    if (!imagePath) return;
    try {
        await deletePrizeImageIfUnreferenced(imagePath, prisma);
    } catch (error) {
        // A committed edit must not look like a failed write just because cleanup failed.
        logger.warn({ error }, 'Could not clean up unreferenced prize image');
    }
}

// PATCH /api/admin/prizes/[id] —— 差量编辑；显式库存编辑必须带原值 expectedStock。
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorized();
    if (!requireAdmin(session)) return forbidden("Admin access required");
    const { id } = await params;
    let newImagePath: string | null = null;

    try {
        let rawBody: unknown;
        try { rawBody = await req.json(); }
        catch { return badRequest('请求需为有效 JSON 对象'); }
        if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
            return badRequest('请求需为有效 JSON 对象');
        }
        const body = rawBody as Record<string, unknown>;
        const data: Prisma.PrizeUpdateManyMutationInput = {};

        if (Object.hasOwn(body, 'name')) {
            if (typeof body.name !== 'string') return badRequest('奖品名称需为文字');
            const cleanName = body.name.trim();
            if (!cleanName) return badRequest('奖品名称不能为空');
            if (cleanName.length > MAX_NAME) return badRequest(`奖品名称不能超过 ${MAX_NAME} 字`);
            data.name = cleanName;
        }
        if (Object.hasOwn(body, 'description')) {
            if (body.description !== null && typeof body.description !== 'string') return badRequest('奖品说明需为文字');
            const cleanDesc = typeof body.description === 'string' ? body.description.trim() : '';
            if (cleanDesc.length > MAX_DESC) return badRequest(`奖品说明不能超过 ${MAX_DESC} 字`);
            data.description = cleanDesc || null;
        }
        if (Object.hasOwn(body, 'weight')) {
            if (!isPrismaInteger(body.weight) || body.weight < 1 || body.weight > MAX_WEIGHT) {
                return badRequest(`权重需为 1 - ${MAX_WEIGHT} 的整数`);
            }
            data.weight = body.weight;
        }

        const editsStock = Object.hasOwn(body, 'stock');
        if (editsStock) {
            if (!isPrizeStock(body.stock)) return badRequest(`库存需为 0 - ${MAX_PRISMA_INT} 的整数，null 表示不限量`);
            if (!Object.hasOwn(body, 'expectedStock') || !isPrizeStock(body.expectedStock)) {
                return badRequest('修改库存必须提供有效 expectedStock（原库存整数或 null）');
            }
            data.stock = body.stock;
        } else if (Object.hasOwn(body, 'expectedStock') && !isPrizeStock(body.expectedStock)) {
            return badRequest('expectedStock 需为原库存整数或 null');
        }
        const expectedStock = body.expectedStock as number | null;

        if (Object.hasOwn(body, 'enabled')) {
            if (typeof body.enabled !== 'boolean') return badRequest('enabled 需为布尔值');
            data.enabled = body.enabled;
        }
        if (Object.hasOwn(body, 'isBlank')) {
            if (typeof body.isBlank !== 'boolean') return badRequest('isBlank 需为布尔值');
            data.isBlank = body.isBlank;
        }
        if (Object.hasOwn(body, 'sortOrder')) {
            if (!isPrismaInteger(body.sortOrder)) return badRequest('排序需为 Prisma Int 范围内的整数');
            data.sortOrder = body.sortOrder;
        }

        if (typeof body.imageDataUrl === 'string' && body.imageDataUrl.trim()) {
            newImagePath = await savePrizeImageFromDataUrl(body.imageDataUrl);
            data.imagePath = newImagePath;
        } else if (body.removeImage === true) {
            data.imagePath = null;
        }

        const updated = await prisma.$transaction(async (tx) => {
            const existing = await tx.prize.findUnique({
                where: { id }, select: { id: true, imagePath: true, stock: true, isBlank: true },
            });
            if (!existing) throw new PrizeMutationError(404, 'Prize not found');
            if (editsStock && existing.stock !== expectedStock) {
                throw new PrizeMutationError(409, '库存已变化，请刷新奖品后重新编辑');
            }
            // Existing records filter through Prize.isBlank, so its type must stay stable.
            if (typeof data.isBlank === 'boolean' && data.isBlank !== existing.isBlank) {
                const hasDraw = await tx.drawRecord.findFirst({ where: { prizeId: id }, select: { id: true } });
                if (hasDraw) throw new PrizeMutationError(409, '该奖品已有抽奖记录，不能改变「谢谢参与」类型');
            }
            if (Object.keys(data).length > 0) {
                const where: Prisma.PrizeWhereInput = { id };
                if (editsStock) where.stock = expectedStock; // Atomic CAS, including null.
                const result = await tx.prize.updateMany({ where, data });
                if (result.count !== 1) throw new PrizeMutationError(409, '库存已变化，请刷新奖品后重新编辑');
            }
            return existing;
        });

        if (Object.hasOwn(data, 'imagePath')) await cleanupUnusedImage(updated.imagePath);
        logger.info({ prizeId: id }, 'Prize updated');
        return NextResponse.json({ prize: { id: updated.id } });
    } catch (error) {
        // A failed transaction may have already saved a new file. Preserve it if referenced.
        await cleanupUnusedImage(newImagePath);
        if (error instanceof PrizeMutationError) {
            return error.status === 404 ? notFound(error.message) : conflict(error.message);
        }
        if (error instanceof PrizeImageError) return badRequest(error.message);
        logger.error({ error }, 'Error updating prize');
        return internalError("Failed to update prize");
    }
}

// DELETE /api/admin/prizes/[id] —— 任意抽奖记录均禁止物理删除。
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorized();
    if (!requireAdmin(session)) return forbidden("Admin access required");
    const { id } = await params;

    try {
        const existing = await prisma.$transaction(async (tx) => {
            const prize = await tx.prize.findUnique({
                where: { id }, include: { _count: { select: { draws: true } } },
            });
            if (!prize) throw new PrizeMutationError(404, 'Prize not found');
            if (prize._count.draws > 0) {
                throw new PrizeMutationError(409, `该奖品已有 ${prize._count.draws} 条抽奖记录，不能删除。可改为「停用」。`);
            }
            await tx.prize.delete({ where: { id } });
            return prize;
        });
        await cleanupUnusedImage(existing.imagePath);
        logger.info({ prizeId: id, name: existing.name }, 'Prize deleted');
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (error instanceof PrizeMutationError) {
            return error.status === 404 ? notFound(error.message) : conflict(error.message);
        }
        logger.error({ error }, 'Error deleting prize');
        return internalError("Failed to delete prize");
    }
}
