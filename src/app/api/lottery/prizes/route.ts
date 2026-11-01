import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:lottery:prizes');

// GET /api/lottery/prizes —— 奖品墙（不含「谢谢参与」占位项）
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    try {
        const prizes = await prisma.prize.findMany({
            where: { enabled: true, isBlank: false },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: {
                id: true,
                name: true,
                description: true,
                imagePath: true,
                stock: true,
            },
        });

        // 不暴露 weight（避免用户推算概率）
        return NextResponse.json({
            prizes: prizes.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                imagePath: p.imagePath,
                hasImage: !!p.imagePath,
                stock: p.stock,               // null = 不限量
                soldOut: p.stock !== null && p.stock <= 0,
            })),
        });
    } catch (error) {
        logger.error({ error }, 'Error listing prizes');
        return internalError("Failed to list prizes");
    }
}
