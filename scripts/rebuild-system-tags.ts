/**
 * 系统标签重建脚本 - 可在 Docker entrypoint 中自动运行
 * 用于版本升级时自动重建系统标签并保留关联关系
 */
import { PrismaClient } from '@prisma/client';
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
} from '../src/lib/tag-data';

const prisma = new PrismaClient();

interface TagAssociation {
    errorItemId: string;
    tagName: string;
    subject: string;
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

async function main() {
    console.log('[RebuildTags] Starting automatic system tag rebuild...');

    let totalCreated = 0;
    let associationsRestored = 0;
    let customTagsCreated = 0;

    await prisma.$transaction(async (tx) => {
        // ========== STEP 1: 备份现有关联关系 ==========
        console.log('[RebuildTags] Step 1: Backing up tag associations...');
        const associations: TagAssociation[] = [];

        const errorItemsWithSystemTags = await tx.errorItem.findMany({
            select: {
                id: true,
                tags: {
                    where: { isSystem: true },
                    select: { name: true, subject: true }
                }
            }
        });

        for (const item of errorItemsWithSystemTags) {
            for (const tag of item.tags) {
                associations.push({
                    errorItemId: item.id,
                    tagName: tag.name,
                    subject: tag.subject,
                });
            }
        }
        console.log(`[RebuildTags] Backed up ${associations.length} associations from ${errorItemsWithSystemTags.length} items`);

        // ========== STEP 2: 删除旧标签并重建 ==========
        console.log('[RebuildTags] Step 2: Rebuilding system tags...');

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

        console.log(`[RebuildTags] Created ${totalCreated} tags`);

        // ========== STEP 3: 恢复关联关系 ==========
        console.log('[RebuildTags] Step 3: Restoring associations...');

        const associationsByItem = new Map<string, TagAssociation[]>();
        for (const assoc of associations) {
            const list = associationsByItem.get(assoc.errorItemId) || [];
            list.push(assoc);
            associationsByItem.set(assoc.errorItemId, list);
        }

        // 获取第一个 admin 用户用于创建自定义标签
        const adminUser = await tx.user.findFirst({
            where: { role: 'admin' },
            select: { id: true }
        });

        for (const [errorItemId, itemAssociations] of associationsByItem) {
            const newTagIds: string[] = [];

            for (const assoc of itemAssociations) {
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
                } else if (adminUser) {
                    // 系统标签未找到，创建为自定义标签
                    console.warn(`[RebuildTags] Tag not found: "${assoc.tagName}" (${assoc.subject}), creating as custom tag`);

                    let customTag = await tx.knowledgeTag.findFirst({
                        where: {
                            name: assoc.tagName,
                            subject: assoc.subject,
                            userId: adminUser.id
                        },
                        select: { id: true }
                    });

                    if (!customTag) {
                        customTag = await tx.knowledgeTag.create({
                            data: {
                                name: assoc.tagName,
                                subject: assoc.subject,
                                isSystem: false,
                                userId: adminUser.id,
                            },
                            select: { id: true }
                        });
                        customTagsCreated++;
                    }

                    newTagIds.push(customTag.id);
                    associationsRestored++;
                }
            }

            if (newTagIds.length > 0) {
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

        console.log(`[RebuildTags] Restored ${associationsRestored} associations, created ${customTagsCreated} custom tags`);
    }, {
        timeout: 120000
    });

    console.log(`[RebuildTags] Completed. System tags: ${totalCreated}, Associations: ${associationsRestored}, Custom tags: ${customTagsCreated}`);
}

main()
    .catch((e) => {
        console.error('[RebuildTags] Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
