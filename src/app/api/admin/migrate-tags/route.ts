import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { internalError, unauthorized, forbidden } from "@/lib/api-errors";
import {
    MATH_CURRICULUM, MATH_GRADE_ORDER,
    PHYSICS_CURRICULUM, PHYSICS_GRADE_ORDER,
    ENGLISH_CURRICULUM, ENGLISH_GRADE_ORDER,
    CHEMISTRY_CURRICULUM, CHEMISTRY_GRADE_ORDER,
    BIOLOGY_CURRICULUM, BIOLOGY_GRADE_ORDER,
    CHINESE_CURRICULUM, CHINESE_GRADE_ORDER,
    HISTORY_CURRICULUM, HISTORY_GRADE_ORDER,
    GEOGRAPHY_CURRICULUM, GEOGRAPHY_GRADE_ORDER,
    POLITICS_CURRICULUM, POLITICS_GRADE_ORDER
} from "@/lib/tag-data";
import { createLogger } from "@/lib/logger";
import { findParentTagIdForGrade } from "@/lib/tag-recognition";

const logger = createLogger('api:admin:migrate-tags');

// 定义关联备份类型
interface TagAssociation {
    errorItemId: string;
    tagName: string;
    subject: string;
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    if ((session.user as any).role !== 'admin') {
        return forbidden("Admin access required for tag migration");
    }

    try {
        logger.info({ email: session.user.email }, 'Tag migration initiated');
        let totalCreated = 0;
        let associationsRestored = 0;
        let customTagsCreated = 0;

        await prisma.$transaction(async (tx) => {
            // ========== STEP 1: 备份现有关联关系 ==========
            logger.info('Step 1: Backing up tag associations...');
            const associations: TagAssociation[] = [];

            // 查询所有带有系统标签的错题
            const errorItemsWithSystemTags = await tx.errorItem.findMany({
                select: {
                    id: true,
                    tags: {
                        where: { isSystem: true },
                        select: { name: true, subject: true }
                    }
                }
            });

            // 构建关联备份
            for (const item of errorItemsWithSystemTags) {
                for (const tag of item.tags) {
                    associations.push({
                        errorItemId: item.id,
                        tagName: tag.name,
                        subject: tag.subject,
                    });
                }
            }
            logger.info({ associationCount: associations.length, itemCount: errorItemsWithSystemTags.length }, 'Backup complete');

            // ========== STEP 2: 删除旧标签并重建 ==========
            logger.info('Step 2: Rebuilding system tags...');

            // Math
            await tx.knowledgeTag.deleteMany({ where: { isSystem: true, subject: 'math' } });
            totalCreated += await seedMath(tx, MATH_CURRICULUM, MATH_GRADE_ORDER);

            // Physics
            await tx.knowledgeTag.deleteMany({ where: { isSystem: true, subject: 'physics' } });
            totalCreated += await seedStandardSubject(tx, 'physics', PHYSICS_CURRICULUM, PHYSICS_GRADE_ORDER);

            // English
            await tx.knowledgeTag.deleteMany({ where: { isSystem: true, subject: 'english' } });
            totalCreated += await seedStandardSubject(tx, 'english', ENGLISH_CURRICULUM, ENGLISH_GRADE_ORDER);

            // Chemistry
            await tx.knowledgeTag.deleteMany({ where: { isSystem: true, subject: 'chemistry' } });
            totalCreated += await seedStandardSubject(tx, 'chemistry', CHEMISTRY_CURRICULUM, CHEMISTRY_GRADE_ORDER);

            // Biology
            await tx.knowledgeTag.deleteMany({ where: { isSystem: true, subject: 'biology' } });
            totalCreated += await seedStandardSubject(tx, 'biology', BIOLOGY_CURRICULUM, BIOLOGY_GRADE_ORDER);

            // Chinese
            await tx.knowledgeTag.deleteMany({ where: { isSystem: true, subject: 'chinese' } });
            totalCreated += await seedStandardSubject(tx, 'chinese', CHINESE_CURRICULUM, CHINESE_GRADE_ORDER);

            // History
            await tx.knowledgeTag.deleteMany({ where: { isSystem: true, subject: 'history' } });
            totalCreated += await seedStandardSubject(tx, 'history', HISTORY_CURRICULUM, HISTORY_GRADE_ORDER);

            // Geography
            await tx.knowledgeTag.deleteMany({ where: { isSystem: true, subject: 'geography' } });
            totalCreated += await seedStandardSubject(tx, 'geography', GEOGRAPHY_CURRICULUM, GEOGRAPHY_GRADE_ORDER);

            // Politics
            await tx.knowledgeTag.deleteMany({ where: { isSystem: true, subject: 'politics' } });
            totalCreated += await seedStandardSubject(tx, 'politics', POLITICS_CURRICULUM, POLITICS_GRADE_ORDER);

            logger.info({ totalCreated }, 'Tags created');

            // ========== STEP 3: 恢复关联关系 ==========
            logger.info('Step 3: Restoring associations...');

            // 按 errorItemId 分组
            const associationsByItem = new Map<string, TagAssociation[]>();
            for (const assoc of associations) {
                const list = associationsByItem.get(assoc.errorItemId) || [];
                list.push(assoc);
                associationsByItem.set(assoc.errorItemId, list);
            }

            // 为每个错题恢复关联
            for (const [errorItemId, itemAssociations] of associationsByItem) {
                const newTagIds: string[] = [];

                for (const assoc of itemAssociations) {
                    // 按名称+学科查找新标签
                    let newTag = await tx.knowledgeTag.findFirst({
                        where: {
                            name: assoc.tagName,
                            subject: assoc.subject,
                            isSystem: true
                        },
                        select: { id: true }
                    });

                    if (newTag) {
                        newTagIds.push(newTag.id);
                        associationsRestored++;
                    } else {
                        // 系统标签未找到，创建为自定义标签（绑定到执行迁移的管理员）
                        logger.warn({ tagName: assoc.tagName, subject: assoc.subject }, 'Tag not found, creating as custom tag');

                        // 查找执行操作的用户
                        const adminUser = await tx.user.findUnique({
                            where: { email: session.user!.email! },
                            select: { id: true }
                        });

                        if (adminUser) {
                            // 检查是否已存在同名自定义标签
                            let customTag = await tx.knowledgeTag.findFirst({
                                where: {
                                    name: assoc.tagName,
                                    subject: assoc.subject,
                                    userId: adminUser.id
                                },
                                select: { id: true }
                            });

                            if (!customTag) {
                                // Try to find grade context - this is tricky here as we only have tagName.
                                // But we know errorItemId is associated with this tag.
                                // We can fetch the error item to get the grade.
                                // However, we are inside a loop over associations.
                                // Let's simplify: If we are creating custom tags here, it's a fallback.
                                // Can we get grade from assoc? We need to update TagAssociation interface Step 1.
                                // For now, let's leave as is or fetch item?
                                // Fetching item per tag creation is ok (rare case).
                                const errorItem = await tx.errorItem.findUnique({
                                    where: { id: errorItemId },
                                    select: { gradeSemester: true }
                                });

                                const parentId = await findParentTagIdForGrade(errorItem?.gradeSemester, assoc.subject);

                                customTag = await tx.knowledgeTag.create({
                                    data: {
                                        name: assoc.tagName,
                                        subject: assoc.subject,
                                        isSystem: false,
                                        userId: adminUser.id,
                                        parentId: parentId || null
                                    },
                                    select: { id: true }
                                });
                                customTagsCreated++;
                            }

                            newTagIds.push(customTag.id);
                            associationsRestored++;
                        }
                    }
                }

                if (newTagIds.length > 0) {
                    // 更新错题的标签关联（使用 connect 而非 set，保留自定义标签）
                    await tx.errorItem.update({
                        where: { id: errorItemId },
                        data: {
                            tags: {
                                connect: newTagIds.map(id => ({ id }))
                            }
                        }
                    });
                }
            }

            logger.info({ associationsRestored, customTagsCreated }, 'Associations restored');
        }, {
            timeout: 120000 // 增加超时时间以处理关联恢复
        });

        logger.info({ totalCreated, associationsRestored, customTagsCreated }, 'Tag migration completed');
        return NextResponse.json({
            success: true,
            count: totalCreated,
            associationsRestored,
            customTagsCreated,
            message: "Tag migration complete with associations preserved"
        });

    } catch (error) {
        logger.error({ error }, 'Tag migration error');
        return internalError("Failed to migrate tags");
    }
}

async function seedMath(tx: any, curriculum: any, gradeOrder: any) {
    let count = 0;
    for (const [gradeSemester, chapters] of Object.entries(curriculum) as any) {
        const gradeNode = await tx.knowledgeTag.create({
            data: {
                name: gradeSemester,
                subject: 'math',
                parentId: null,
                isSystem: true,
                order: gradeOrder[gradeSemester] || 99,
            },
        });
        count++;

        for (let chapterIdx = 0; chapterIdx < chapters.length; chapterIdx++) {
            const chapter = chapters[chapterIdx];
            const chapterNode = await tx.knowledgeTag.create({
                data: {
                    name: chapter.chapter,
                    subject: 'math',
                    parentId: gradeNode.id,
                    isSystem: true,
                    order: chapterIdx + 1,
                },
            });
            count++;

            for (let sectionIdx = 0; sectionIdx < chapter.sections.length; sectionIdx++) {
                const section = chapter.sections[sectionIdx];
                const sectionNode = await tx.knowledgeTag.create({
                    data: {
                        name: section.section,
                        subject: 'math',
                        parentId: chapterNode.id,
                        isSystem: true,
                        order: sectionIdx + 1,
                    },
                });
                count++;

                for (let tagIdx = 0; tagIdx < section.tags.length; tagIdx++) {
                    const tagName = section.tags[tagIdx];
                    await tx.knowledgeTag.create({
                        data: {
                            name: tagName,
                            subject: 'math',
                            parentId: sectionNode.id,
                            isSystem: true,
                            order: tagIdx + 1,
                        },
                    });
                    count++;
                }
            }
        }
    }
    return count;
}

async function seedStandardSubject(tx: any, subject: string, curriculum: any, gradeOrder: any) {
    let count = 0;
    for (const [gradeSemester, chapters] of Object.entries(curriculum) as any) {
        const gradeNode = await tx.knowledgeTag.create({
            data: {
                name: gradeSemester,
                subject: subject,
                parentId: null,
                isSystem: true,
                order: gradeOrder[gradeSemester] || 99,
            },
        });
        count++;

        for (let chapterIdx = 0; chapterIdx < chapters.length; chapterIdx++) {
            const chapter = chapters[chapterIdx];
            const chapterNode = await tx.knowledgeTag.create({
                data: {
                    name: chapter.chapter,
                    subject: subject,
                    parentId: gradeNode.id,
                    isSystem: true,
                    order: chapterIdx + 1,
                },
            });
            count++;

            for (let tagIdx = 0; tagIdx < chapter.tags.length; tagIdx++) {
                const tagName = chapter.tags[tagIdx];
                await tx.knowledgeTag.create({
                    data: {
                        name: tagName,
                        subject: subject,
                        parentId: chapterNode.id,
                        isSystem: true,
                        order: tagIdx + 1,
                    },
                });
                count++;
            }
        }
    }
    return count;
}
