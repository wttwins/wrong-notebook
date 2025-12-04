import { NextResponse } from "next/server";
import { getAIService } from "@/lib/ai";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { normalizeTags, normalizeTagsByGradeAndSubject, calculateGrade, inferSubjectFromName } from "@/lib/knowledge-tags";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    console.log("[API] /api/analyze called");
    console.log("[API] Env Vars:", Object.keys(process.env).filter(k => k.includes("GOOGLE") || k.includes("NEXT")));

    const session = await getServerSession(authOptions);

    // 注释掉认证检查以便测试,生产环境应启用
    // if (!session) {
    //     console.log("[API] Unauthorized access attempt");
    //     return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    // }

    try {
        const body = await req.json();
        let { imageBase64, mimeType, language, subjectId } = body;

        console.log(`[API] Request received. Image length: ${imageBase64?.length}, MimeType: ${mimeType}, Language: ${language}, SubjectId: ${subjectId}`);

        if (!imageBase64) {
            console.log("[API] Missing image data");
            return NextResponse.json({ message: "Missing image data" }, { status: 400 });
        }

        // Parse Data URL if present
        if (imageBase64.startsWith('data:')) {
            const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                mimeType = matches[1];
                imageBase64 = matches[2];
                console.log(`[API] Parsed Data URL. New MimeType: ${mimeType}, Base64 length: ${imageBase64.length}`);
            }
        }

        console.log("[API] Calling AI service analyzeImage...");
        const aiService = getAIService();
        const analysisResult = await aiService.analyzeImage(imageBase64, mimeType, language);

        console.log("[API] AI returned knowledgePoints:", analysisResult.knowledgePoints);
        console.log("[API] knowledgePoints type:", typeof analysisResult.knowledgePoints);
        console.log("[API] knowledgePoints isArray:", Array.isArray(analysisResult.knowledgePoints));

        // 获取用户信息和错题本信息以进行智能标签匹配
        let userGrade: 7 | 8 | 9 | null = null;
        let subjectName: 'math' | 'physics' | 'chemistry' | 'english' | null = null;

        if (session?.user?.email) {
            try {
                // 获取用户信息
                const user = await prisma.user.findUnique({
                    where: { email: session.user.email },
                    select: { educationStage: true, enrollmentYear: true }
                });

                if (user) {
                    userGrade = calculateGrade(user.educationStage, user.enrollmentYear);
                    console.log("[API] Calculated user grade:", userGrade);
                }

                // 获取错题本信息以推断学科
                if (subjectId) {
                    const subject = await prisma.subject.findUnique({
                        where: { id: subjectId },
                        select: { name: true }
                    });

                    if (subject) {
                        subjectName = inferSubjectFromName(subject.name);
                        console.log("[API] Inferred subject:", subjectName, "from:", subject.name);
                    }
                }
            } catch (error) {
                console.error("[API] Error fetching user/subject info:", error);
                // 继续执行,使用默认的标签匹配
            }
        }

        // 标准化知识点标签
        if (analysisResult.knowledgePoints && analysisResult.knowledgePoints.length > 0) {
            const originalTags = [...analysisResult.knowledgePoints];

            // 如果有年级或学科信息,使用智能匹配
            if (userGrade || subjectName) {
                analysisResult.knowledgePoints = normalizeTagsByGradeAndSubject(
                    analysisResult.knowledgePoints,
                    userGrade,
                    subjectName
                );
                console.log("[API] Used grade/subject-based normalization");
                console.log("[API] Grade:", userGrade, "Subject:", subjectName);
            } else {
                // 否则使用默认匹配
                analysisResult.knowledgePoints = normalizeTags(analysisResult.knowledgePoints);
                console.log("[API] Used default normalization");
            }

            console.log("[API] Original tags:", originalTags);
            console.log("[API] Normalized tags:", analysisResult.knowledgePoints);
        } else {
            console.log("[API] ⚠️ WARNING: knowledgePoints is empty or null!");
        }

        console.log("[API] AI analysis successful");

        return NextResponse.json(analysisResult);
    } catch (error: any) {
        console.error("[API] Analysis error details:", error);
        console.error("[API] Error message:", error.message);
        console.error("[API] Error stack:", error.stack);

        // 返回具体的错误类型，便于前端显示详细提示
        let errorMessage = error.message || "Failed to analyze image";
        let statusCode = 500;

        // 识别特定错误类型
        if (error.message && (
            error.message === 'AI_CONNECTION_FAILED' ||
            error.message === 'AI_RESPONSE_ERROR' ||
            error.message === 'AI_AUTH_ERROR' ||
            error.message === 'AI_UNKNOWN_ERROR'
        )) {
            // 直接传递 AI Provider 定义的错误类型
            errorMessage = error.message;
        } else if (error.message?.includes('Zod') || error.message?.includes('validate')) {
            // Zod 验证错误
            errorMessage = 'AI_RESPONSE_ERROR';
        }

        return NextResponse.json(
            { message: errorMessage, error: error.message },
            { status: statusCode }
        );
    }
}
