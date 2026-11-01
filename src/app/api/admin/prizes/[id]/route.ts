import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { requireAdmin } from "@/lib/auth-utils";
import { forbidden, unauthorized, badRequest, notFound, internalError, conflict } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { savePrizeImageFromDataUrl, deletePrizeImage, PrizeImageError } from "@/lib/prize-image";

const logger = createLogger('api:admin:prizes:id');

const MAX_NAME = 60;
const MAX_DESC = 300;
const MAX_WEIGHT = 1000;

// PATCH /api/admin/prizes/[id] —— 编辑奖品
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }
    if (!requireAdmin(session)) {
        return forbidden("Admin access required");
    }

    const { id } = await params;

    try {
        const existing = await prisma.prize.findUnique({ where: { id } });
        if (!existing) {
            return notFound("Prize not found");
        }

        const body = await req.json();
        const data: Record<string, unknown> = {};

        if (typeof body?.name === 'string') {
            const cleanName = body.name.trim();
            if (!cleanName) return badRequest('奖品名称不能为空');
            if (cleanName.length > MAX_NAME) return badRequest(`奖品名称不能超过 ${MAX_NAME} 字`);
            data.name = cleanName;
        }

        if (typeof body?.description === 'string') {
            const cleanDesc = body.description.trim();
            if (cleanDesc.length > MAX_DESC) return badRequest(`奖品说明不能超过 ${MAX_DESC} 字`);
            data.description = cleanDesc || null;
        }

        if (body?.weight !== undefined) {
            const w = Math.floor(Number(body.weight));
            if (!Number.isFinite(w) || w < 1 || w > MAX_WEIGHT) {
                return badRequest(`权重需在 1 - ${MAX_WEIGHT} 之间`);
            }
            data.weight = w;
        }

        if (body?.stock !== undefined) {
            if (body.stock === null || body.stock === '') {
                data.stock = null; // 不限量
            } else {
                const n = Math.floor(Number(body.stock));
                if (!Number.isFinite(n) || n < 0) {
                    return badRequest('库存需为不小于 0 的整数，留空表示不限量');
                }
                data.stock = n;
            }
        }

        if (typeof body?.enabled === 'boolean') data.enabled = body.enabled;
        if (typeof body?.isBlank === 'boolean') data.isBlank = body.isBlank;
        if (body?.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
            data.sortOrder = Math.floor(Number(body.sortOrder));
        }

        // 换图：新图落盘成功后再删旧图，避免中间态丢图
        let newImagePath: string | null = null;
        if (typeof body?.imageDataUrl === 'string' && body.imageDataUrl.trim()) {
            newImagePath = await savePrizeImageFromDataUrl(body.imageDataUrl);
            data.imagePath = newImagePath;
        } else if (body?.removeImage === true) {
            data.imagePath = null;
        }

        const updated = await prisma.prize.update({ where: { id }, data });

        if ((newImagePath || body?.removeImage === true) && existing.imagePath) {
            await deletePrizeImage(existing.imagePath);
        }

        logger.info({ prizeId: id }, 'Prize updated');
        return NextResponse.json({ prize: { id: updated.id } });
    } catch (error) {
        if (error instanceof PrizeImageError) {
            return badRequest(error.message);
        }
        logger.error({ error }, 'Error updating prize');
        return internalError("Failed to update prize");
    }
}

// DELETE /api/admin/prizes/[id] —— 删除奖品（有中奖记录时禁止删除）
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }
    if (!requireAdmin(session)) {
        return forbidden("Admin access required");
    }

    const { id } = await params;

    try {
        const existing = await prisma.prize.findUnique({
            where: { id },
            include: { _count: { select: { draws: true } } },
        });

        if (!existing) {
            return notFound("Prize not found");
        }

        // 已有中奖记录时不允许物理删除：历史记录要能追溯
        // （数据库侧同样用了 onDelete: Restrict 兜底）
        if (existing._count.draws > 0) {
            return conflict(
                `该奖品已有 ${existing._count.draws} 条中奖记录，不能删除。可改为「停用」。`
            );
        }

        await prisma.prize.delete({ where: { id } });
        await deletePrizeImage(existing.imagePath);

        logger.info({ prizeId: id, name: existing.name }, 'Prize deleted');
        return NextResponse.json({ ok: true });
    } catch (error) {
        logger.error({ error }, 'Error deleting prize');
        return internalError("Failed to delete prize");
    }
}
