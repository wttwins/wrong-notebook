import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);

    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get("subjectId");
    const query = searchParams.get("query");

    try {
        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
        }

        if (!user) {
            console.log("[API] No session or user found, attempting fallback to first user.");
            user = await prisma.user.findFirst();
        }

        if (!user) {
            return NextResponse.json({ message: "Unauthorized - No user found in DB" }, { status: 401 });
        }

        const whereClause: any = {
            userId: user.id,
        };

        if (subjectId) {
            whereClause.subjectId = subjectId;
        }

        if (query) {
            whereClause.OR = [
                { questionText: { contains: query } },
                { analysis: { contains: query } },
                { knowledgePoints: { contains: query } },
            ];
        }

        const errorItems = await prisma.errorItem.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            include: {
                subject: true,
            },
        });

        return NextResponse.json(errorItems);
    } catch (error) {
        console.error("Error fetching items:", error);
        return NextResponse.json(
            { message: "Failed to fetch error items" },
            { status: 500 }
        );
    }
}
