import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError, notFound } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:error-items:notes');

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    try {
        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
        }

        if (!user) {
            return unauthorized("Authentication required");
        }

        const { userNotes } = await req.json();

        // 越权（IDOR）防护：先确认这条错题属于当前用户。
        // 原实现直接按 id 更新，任何已登录用户都能改别人的备注。
        const owned = await prisma.errorItem.findFirst({
            where: { id, userId: user.id },
            select: { id: true },
        });

        if (!owned) {
            // 统一用 404，避免通过「存在/不存在」的差异探测他人数据
            return notFound("Error item not found");
        }

        const errorItem = await prisma.errorItem.update({
            where: {
                id: id,
            },
            data: {
                userNotes: userNotes,
            },
        });

        return NextResponse.json(errorItem);
    } catch (error) {
        logger.error({ error }, 'Error updating notes');
        return internalError("Failed to update notes");
    }
}
