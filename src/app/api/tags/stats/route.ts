import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { unauthorized, internalError } from "@/lib/api-errors";

const logger = createLogger('api:tags:stats');

export const dynamic = "force-dynamic";


/**
 * GET /api/tags/stats
 * 获取标签使用频率统计（仅限当前用户的数据）
 *
 * 安全说明：
 * 该接口原先无需登录，且查询没有任何用户过滤，会把**所有用户**的
 * 知识点标签汇总返回。知识点能反映一个学生的学习内容与薄弱环节，
 * 属于隐私数据，因此这里补上登录校验与 userId 过滤。
 */
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return unauthorized("Authentication required");
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true },
        });

        if (!user) {
            return unauthorized("Authentication required");
        }

        // 只统计当前用户自己的错题
        const errorItems = await prisma.errorItem.findMany({
            where: { userId: user.id },
            select: {
                knowledgePoints: true,
            },
        });

        // 统计标签使用频率
        const tagStats: Record<string, number> = {};

        errorItems.forEach((item) => {
            if (item.knowledgePoints) {
                try {
                    const tags = JSON.parse(item.knowledgePoints);
                    if (Array.isArray(tags)) {
                        tags.forEach((tag: string) => {
                            if (tag && typeof tag === 'string') {
                                tagStats[tag] = (tagStats[tag] || 0) + 1;
                            }
                        });
                    }
                } catch (e) {
                    logger.warn({ knowledgePoints: item.knowledgePoints }, 'Failed to parse knowledgePoints for item');
                }
            }
        });

        // 转换为数组并按使用次数排序
        const sortedStats = Object.entries(tagStats)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);

        return NextResponse.json({
            stats: sortedStats,
            total: errorItems.length,
            uniqueTags: sortedStats.length,
        });
    } catch (error) {
        logger.error({ error }, 'Error getting tag stats');
        return internalError("Failed to get tag statistics");
    }
}
