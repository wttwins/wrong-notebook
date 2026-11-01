import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:lottery:records');
const MAX_LIMIT = 100;

// GET /api/lottery/records?limit=20 —— 我的中奖记录（只返回中奖，不含「谢谢参与」）
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    try {
        // @ts-ignore
        const userId = session.user.id as string;

        const url = new URL(req.url);
        const rawLimit = parseInt(url.searchParams.get('limit') || '20', 10);
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isNaN(rawLimit) ? 20 : rawLimit));

        const records = await prisma.drawRecord.findMany({
            where: { userId, prize: { isBlank: false } },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                prizeName: true,
                prizeImagePath: true,
                createdAt: true,
                prizeId: true,
            },
        });

        return NextResponse.json({
            records: records.map((r) => ({
                id: r.id,
                prizeId: r.prizeId,
                prizeName: r.prizeName,
                imagePath: r.prizeImagePath,
                createdAt: r.createdAt,
            })),
        });
    } catch (error) {
        logger.error({ error }, 'Error listing draw records');
        return internalError("Failed to list draw records");
    }
}
