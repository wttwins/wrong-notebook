import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth-utils"
import { forbidden, internalError, badRequest, validationError } from "@/lib/api-errors"
import { createLogger } from "@/lib/logger"
import { hash } from "bcryptjs"
import { z } from "zod"

const logger = createLogger('api:admin:users');

const createUserSchema = z.object({
    email: z.string().min(1, "Email is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().optional(),
    role: z.enum(["user", "admin"]).optional().default("user"),
});

export async function GET() {
    const session = await getServerSession(authOptions)

    if (!requireAdmin(session)) {
        return forbidden("Admin access required")
    }

    try {
        const users = await prisma.user.findMany({
            orderBy: {
                createdAt: 'desc'
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true,
                _count: {
                    select: {
                        errorItems: true,
                        practiceRecords: true
                    }
                }
            }
        })

        return NextResponse.json(users)
    } catch (error) {
        logger.error({ error }, 'Error fetching users');
        return internalError("Failed to fetch users")
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    if (!requireAdmin(session)) {
        return forbidden("Admin access required")
    }

    try {
        const body = await req.json()
        const { email, password, name, role } = createUserSchema.parse(body)

        // 验证邮箱格式
        const emailRegex = /^[^\s@]+@[^\s@]+$/
        if (!emailRegex.test(email.trim())) {
            return badRequest("Invalid email format")
        }

        // 检查邮箱是否已存在
        const existingUser = await prisma.user.findUnique({
            where: { email: email.trim() }
        })

        if (existingUser) {
            return badRequest("Email already exists")
        }

        // 创建用户
        const hashedPassword = await hash(password, 10)
        const user = await prisma.user.create({
            data: {
                email: email.trim(),
                password: hashedPassword,
                name: name?.trim() || null,
                role: role,
                isActive: true,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true,
            }
        })

        logger.info({ userId: user.id, email: user.email }, 'User created by admin')

        return NextResponse.json(user, { status: 201 })
    } catch (error) {
        logger.error({ error }, 'Error creating user')
        if (error instanceof z.ZodError) {
            return validationError("Invalid input", error.issues)
        }
        return internalError("Failed to create user")
    }
}
