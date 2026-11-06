import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { requireAdmin } from "@/lib/auth-utils";
import { forbidden, unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:admin:lottery:records');

const MAX_LIMIT = 200;

// GET /api/admin/lottery/records?limit=50&includeBlank=1&userId=xxx
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }
    if (!requireAdmin(session)) {
        return forbidden("Admin access required");
    }

    try {
        const url = new URL(req.url);
        const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10);
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isNaN(rawLimit) ? 50 : rawLimit));
        const includeBlank = url.searchParams.get('includeBlank') === '1';
        const userId = url.searchParams.get('userId') || undefined;

        const where: Record<string, unknown> = {};
        if (userId) where.userId = userId;
        if (!includeBlank) where.prize = { isBlank: false };

        const [records, total] = await Promise.all([
            prisma.drawRecord.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                select: {
                    id: true,
                    prizeName: true,
                    prizeImagePath: true,
                    createdAt: true,
                    user: { select: { id: true, email: true, name: true } },
                },
            }),
            prisma.drawRecord.count({ where }),
        ]);

        return NextResponse.json({
            total,
            records: records.map((r) => ({
                id: r.id,
                prizeName: r.prizeName,
                imagePath: r.prizeImagePath,
                createdAt: r.createdAt,
                userEmail: r.user.email,
                userName: r.user.name,
            })),
        });
    } catch (error) {
        logger.error({ error }, 'Error listing all draw records');
        return internalError("Failed to list draw records");
    }
}
