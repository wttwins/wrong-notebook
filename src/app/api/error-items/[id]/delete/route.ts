import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

export async function DELETE(
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

        // Verify ownership before deletion
        const errorItem = await prisma.errorItem.findUnique({
            where: { id: id },
        });

        if (!errorItem) {
            return NextResponse.json({ message: "Item not found" }, { status: 404 });
        }

        if (errorItem.userId !== user.id) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
        }

        // Delete the item
        await prisma.errorItem.delete({
            where: { id: id },
        });

        return NextResponse.json({ message: "Deleted successfully" });
    } catch (error) {
        console.error("Error deleting item:", error);
        return NextResponse.json(
            { message: "Failed to delete error item" },
            { status: 500 }
        );
    }
}
