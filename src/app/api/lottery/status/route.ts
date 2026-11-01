import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { getLotteryStatus } from "@/lib/lottery";

const logger = createLogger('api:lottery:status');

// GET /api/lottery/status —— 当前用户的抽奖状态（次数、可抽性）
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    try {
        // @ts-ignore
        const userId = session.user.id as string;
        const status = await getLotteryStatus(userId);
        return NextResponse.json(status);
    } catch (error) {
        logger.error({ error }, 'Error reading lottery status');
        return internalError("Failed to read lottery status");
    }
}
