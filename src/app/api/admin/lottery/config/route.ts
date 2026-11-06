import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { requireAdmin } from "@/lib/auth-utils";
import { forbidden, unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { getAppConfig, updateAppConfig } from "@/lib/config";

const logger = createLogger('api:admin:lottery:config');

const MAX_DRAWS_PER_DAY = 100;

function readLotteryConfig() {
    const cfg = getAppConfig();
    return {
        enabled: cfg.lottery?.enabled !== false,
        drawsPerDay: typeof cfg.lottery?.drawsPerDay === 'number' ? cfg.lottery.drawsPerDay : 1,
    };
}

// GET /api/admin/lottery/config
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }
    if (!requireAdmin(session)) {
        return forbidden("Admin access required");
    }

    return NextResponse.json(readLotteryConfig());
}

// PATCH /api/admin/lottery/config —— 修改总开关与每日次数
export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }
    if (!requireAdmin(session)) {
        return forbidden("Admin access required");
    }

    try {
        const body = await req.json();

        const patch: { enabled?: boolean; drawsPerDay?: number } = {};

        if (typeof body?.enabled === 'boolean') {
            patch.enabled = body.enabled;
        }

        if (body?.drawsPerDay !== undefined) {
            const n = Math.floor(Number(body.drawsPerDay));
            if (!Number.isFinite(n) || n < 0 || n > MAX_DRAWS_PER_DAY) {
                return badRequest(`每日次数需在 0 - ${MAX_DRAWS_PER_DAY} 之间（0 表示不限）`);
            }
            patch.drawsPerDay = n;
        }

        if (Object.keys(patch).length === 0) {
            return badRequest('没有需要修改的字段');
        }

        updateAppConfig({ lottery: patch });
        logger.info({ patch }, 'Lottery config updated');

        return NextResponse.json(readLotteryConfig());
    } catch (error) {
        logger.error({ error }, 'Error updating lottery config');
        return internalError("Failed to update lottery config");
    }
}
