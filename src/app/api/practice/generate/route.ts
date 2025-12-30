import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { getAIService } from "@/lib/ai";
import { getImageGenService, isImageGenEnabled } from "@/lib/image-gen";
import { notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:practice:generate');

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    try {
        const { errorItemId, language, difficulty } = await req.json();

        const errorItemWithSubject = await prisma.errorItem.findUnique({
            where: { id: errorItemId },
            include: { subject: true }
        });

        if (!errorItemWithSubject) {
            return notFound("Item not found");
        }

        let tags: string[] = [];
        try {
            tags = JSON.parse(errorItemWithSubject.knowledgePoints || "[]");
        } catch (e) {
            tags = [];
        }

        const aiService = getAIService();
        const similarQuestion = await aiService.generateSimilarQuestion(
            errorItemWithSubject.questionText || "",
            tags,
            language,
            difficulty || 'medium'
        );

        // Inject the subject from the database with type safety
        const validSubjects = ["数学", "物理", "化学", "生物", "英语", "语文", "历史", "地理", "政治", "其他"] as const;
        const subjectName = errorItemWithSubject.subject?.name || "其他";
        similarQuestion.subject = validSubjects.includes(subjectName as any) ? subjectName as typeof validSubjects[number] : "其他";

        // 如果启用了图片生成服务，且AI判断需要配图，则生成图片
        if (isImageGenEnabled()) {
            const imageService = getImageGenService();
            if (imageService) {
                // 生成题目配图
                if (similarQuestion.questionImageRequired && similarQuestion.questionImagePrompt) {
                    logger.info({ prompt: similarQuestion.questionImagePrompt.substring(0, 100) }, 'Generating question image');
                    try {
                        const result = await imageService.generateImage(similarQuestion.questionImagePrompt);
                        if (result.success) {
                            similarQuestion.questionImageUrl = result.imageUrl || result.imageBase64;
                            logger.info('Question image generated successfully');
                        } else {
                            logger.warn({ error: result.error }, 'Failed to generate question image');
                        }
                    } catch (error) {
                        logger.error({ error }, 'Error generating question image');
                    }
                }

                // 生成答案配图
                if (similarQuestion.answerImageRequired && similarQuestion.answerImagePrompt) {
                    logger.info({ prompt: similarQuestion.answerImagePrompt.substring(0, 100) }, 'Generating answer image');
                    try {
                        const result = await imageService.generateImage(similarQuestion.answerImagePrompt);
                        if (result.success) {
                            similarQuestion.answerImageUrl = result.imageUrl || result.imageBase64;
                            logger.info('Answer image generated successfully');
                        } else {
                            logger.warn({ error: result.error }, 'Failed to generate answer image');
                        }
                    } catch (error) {
                        logger.error({ error }, 'Error generating answer image');
                    }
                }
            }
        }

        return NextResponse.json(similarQuestion);
    } catch (error) {
        logger.error({ error }, 'Error generating practice');
        const errorMessage = error instanceof Error ? error.message : "Failed to generate practice question";
        return internalError(errorMessage);
    }
}
