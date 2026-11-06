import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { requireAdmin } from "@/lib/auth-utils";
import { forbidden, unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { savePrizeImageFromDataUrl, deletePrizeImageIfUnreferenced, PrizeImageError } from "@/lib/prize-image";
import { isPrizeStock, MAX_PRISMA_INT } from "@/lib/prize-form";

const logger = createLogger('api:admin:prizes');

const MAX_NAME = 60;
const MAX_DESC = 300;
const MAX_WEIGHT = 1000;

// GET /api/admin/prizes —— 全部奖品（含「谢谢参与」）
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }
    if (!requireAdmin(session)) {
        return forbidden("Admin access required");
    }

    try {
        const prizes = await prisma.prize.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: {
                _count: { select: { draws: true } },
            },
        });

        const totalWeight = prizes
            .filter((p) => p.enabled && (p.stock === null || p.stock > 0))
            .reduce((sum, p) => sum + Math.max(1, p.weight), 0);

        return NextResponse.json({
            prizes: prizes.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                imagePath: p.imagePath,
                hasImage: !!p.imagePath,
                weight: p.weight,
                // 换算成百分比，避免管理员误以为 1:1:1 代表不同概率
                probability: totalWeight > 0 && p.enabled && (p.stock === null || p.stock > 0)
                    ? Math.round((Math.max(1, p.weight) / totalWeight) * 1000) / 10
                    : 0,
                stock: p.stock,
                enabled: p.enabled,
                isBlank: p.isBlank,
                sortOrder: p.sortOrder,
                drawCount: p._count.draws,
            })),
        });
    } catch (error) {
        logger.error({ error }, 'Error listing prizes (admin)');
        return internalError("Failed to list prizes");
    }
}

// POST /api/admin/prizes —— 新建奖品（可带 base64 图片）
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }
    if (!requireAdmin(session)) {
        return forbidden("Admin access required");
    }

    let imagePath: string | null = null;

    try {
        const body = await req.json();
        const { name, description, weight, stock, enabled, isBlank, sortOrder, imageDataUrl } = body ?? {};

        const cleanName = typeof name === 'string' ? name.trim() : '';
        if (!cleanName) {
            return badRequest('奖品名称不能为空');
        }
        if (cleanName.length > MAX_NAME) {
            return badRequest(`奖品名称不能超过 ${MAX_NAME} 字`);
        }

        const cleanDesc = typeof description === 'string' ? description.trim() : '';
        if (cleanDesc.length > MAX_DESC) {
            return badRequest(`奖品说明不能超过 ${MAX_DESC} 字`);
        }

        const cleanWeight = Number.isFinite(weight) ? Math.floor(Number(weight)) : 1;
        if (cleanWeight < 1 || cleanWeight > MAX_WEIGHT) {
            return badRequest(`权重需在 1 - ${MAX_WEIGHT} 之间`);
        }

        const cleanStock = stock === undefined ? null : stock;
        if (!isPrizeStock(cleanStock)) {
            return badRequest(`库存需为 0 - ${MAX_PRISMA_INT} 的整数，null 表示不限量`);
        }

        if (typeof imageDataUrl === 'string' && imageDataUrl.trim()) {
            imagePath = await savePrizeImageFromDataUrl(imageDataUrl);
        }

        const created = await prisma.prize.create({
            data: {
                name: cleanName,
                description: cleanDesc || null,
                imagePath,
                weight: cleanWeight,
                stock: cleanStock,
                enabled: enabled !== false,
                isBlank: isBlank === true,
                sortOrder: Number.isFinite(sortOrder) ? Math.floor(Number(sortOrder)) : 0,
            },
        });

        logger.info({ prizeId: created.id, name: created.name }, 'Prize created');
        return NextResponse.json({ prize: { id: created.id } }, { status: 201 });
    } catch (error) {
        if (imagePath) {
            try {
                await deletePrizeImageIfUnreferenced(imagePath, prisma);
            } catch (cleanupError) {
                logger.warn({ error: cleanupError }, 'Could not clean up unreferenced new prize image');
            }
        }
        if (error instanceof PrizeImageError) {
            return badRequest(error.message);
        }
        logger.error({ error }, 'Error creating prize');
        return internalError("Failed to create prize");
    }
}
