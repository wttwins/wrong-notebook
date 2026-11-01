import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { drawOnce, DrawError, getLotteryStatus } from "@/lib/lottery";

const logger = createLogger('api:lottery:draw');

// POST /api/lottery/draw —— 抽一次奖
export async function POST() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    // @ts-ignore
    const userId = session.user.id as string;

    try {
        const result = await drawOnce(userId);
        const status = await getLotteryStatus(userId);

        return NextResponse.json({
            prize: {
                id: result.prizeId,
                name: result.prizeName,
                description: result.prizeDescription,
                imagePath: result.prizeImagePath,
                isBlank: result.isBlank,
                stockLeft: result.stockLeft,
            },
            recordId: result.recordId,
            drawsLeft: status.drawsLeft,
            drawsUsedToday: status.drawsUsedToday,
        });
    } catch (error) {
        if (error instanceof DrawError) {
            const statusMap: Record<string, number> = {
                lottery_disabled: 403,
                daily_limit_reached: 429,
                no_prizes: 409,
                no_stock: 409,
            };
            const httpStatus = statusMap[error.code] ?? 400;
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: httpStatus }
            );
        }

        logger.error({ error }, 'Error drawing prize');
        return internalError("Failed to draw");
    }
}
