import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import fs from "fs/promises";
import path from "path";

const logger = createLogger('api:lottery:prize-image');

const MIME_BY_EXT: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};

// GET /api/lottery/prizes/[id]/image —— 读取奖品图片
// 图片存在数据卷 data/uploads/prizes/ 下，不塞进数据库（避免列表页反复读大字段）
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    const { id } = await params;

    try {
        const prize = await prisma.prize.findUnique({
            where: { id },
            select: { imagePath: true },
        });

        if (!prize?.imagePath) {
            return notFound("Image not found");
        }

        // 防目录穿越：只允许 uploads/prizes/<文件名>.<允许的扩展名>
        const baseName = path.basename(prize.imagePath);
        if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(baseName)) {
            logger.warn({ imagePath: prize.imagePath }, 'Rejected suspicious image path');
            return notFound("Image not found");
        }

        const ext = path.extname(baseName).toLowerCase();
        const mime = MIME_BY_EXT[ext];
        if (!mime) {
            return notFound("Image not found");
        }

        const absPath = path.join(process.cwd(), 'data', 'uploads', 'prizes', baseName);
        let data: Buffer;
        try {
            data = await fs.readFile(absPath);
        } catch {
            return notFound("Image not found");
        }

        return new NextResponse(new Uint8Array(data), {
            status: 200,
            headers: {
                'Content-Type': mime,
                'Content-Length': String(data.length),
                // 文件名含随机 cuid，内容不会变，可长期缓存
                'Cache-Control': 'private, max-age=86400, immutable',
            },
        });
    } catch (error) {
        logger.error({ error }, 'Error serving prize image');
        return internalError("Failed to serve image");
    }
}
