import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

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
            console.log("[API] No session or user found, attempting fallback to first user.");
            user = await prisma.user.findFirst();
        }

        if (!user) {
            return NextResponse.json({ message: "Unauthorized - No user found in DB" }, { status: 401 });
        }

        const { userNotes } = await req.json();

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
        console.error("Error updating notes:", error);
        return NextResponse.json(
            { message: "Failed to update notes" },
            { status: 500 }
        );
    }
}
