import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { prizeImageResponse } from "@/lib/prize-image-response";

const logger = createLogger('api:lottery:prize-image');

// GET /api/lottery/prizes/[id]/image —— 当前奖品图片；换图时同一 URL 内容会改变。
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorized();
    const { id } = await params;
    try {
        const prize = await prisma.prize.findUnique({ where: { id }, select: { imagePath: true } });
        return await prizeImageResponse(prize?.imagePath);
    } catch (error) {
        logger.error({ error }, 'Error serving prize image');
        return internalError("Failed to serve image");
    }
}
