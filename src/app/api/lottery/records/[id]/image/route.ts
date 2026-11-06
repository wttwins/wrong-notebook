import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { requireAdmin } from '@/lib/auth-utils';
import { unauthorized, internalError } from '@/lib/api-errors';
import { createLogger } from '@/lib/logger';
import { prizeImageResponse } from '@/lib/prize-image-response';

const logger = createLogger('api:lottery:record-image');

// GET /api/lottery/records/[id]/image —— 只读取已鉴权记录的图片快照，不接收文件路径。
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    // An undefined userId must never be omitted by Prisma and accidentally match all records.
    if (!session?.user || typeof session.user.id !== 'string' || !session.user.id) {
        return unauthorized();
    }
    const { id } = await params;
    try {
        const record = await prisma.drawRecord.findFirst({
            where: { id, ...(requireAdmin(session) ? {} : { userId: session.user.id }) },
            select: { prizeImagePath: true },
        });
        // Missing and foreign records have the same 404 response.
        return await prizeImageResponse(record?.prizeImagePath);
    } catch (error) {
        logger.error({ error }, 'Error serving record image');
        return internalError('Failed to serve image');
    }
}
