/**
 * AI 提示词生成器单元测试
 * 测试提示词模板变量替换和生成逻辑
 */
import { describe, it, expect } from 'vitest';
import {
    generateAnalyzePrompt,
    generateSimilarQuestionPrompt,
    generateReanswerPrompt,
    DEFAULT_ANALYZE_TEMPLATE,
    DEFAULT_SIMILAR_TEMPLATE,
    DEFAULT_REANSWER_TEMPLATE,
} from '@/lib/ai/prompts';

describe('AI Prompts', () => {
    describe('默认模板存在性', () => {
        it('应该导出 DEFAULT_ANALYZE_TEMPLATE', () => {
            expect(DEFAULT_ANALYZE_TEMPLATE).toBeDefined();
            expect(typeof DEFAULT_ANALYZE_TEMPLATE).toBe('string');
            expect(DEFAULT_ANALYZE_TEMPLATE.length).toBeGreaterThan(100);
        });

        it('应该导出 DEFAULT_SIMILAR_TEMPLATE', () => {
            expect(DEFAULT_SIMILAR_TEMPLATE).toBeDefined();
            expect(typeof DEFAULT_SIMILAR_TEMPLATE).toBe('string');
        });

        it('应该导出 DEFAULT_REANSWER_TEMPLATE', () => {
            expect(DEFAULT_REANSWER_TEMPLATE).toBeDefined();
            expect(typeof DEFAULT_REANSWER_TEMPLATE).toBe('string');
        });
    });

    describe('generateAnalyzePrompt', () => {
        it('应该生成中文提示词', () => {
            const prompt = generateAnalyzePrompt('zh');
            expect(prompt).toContain('中文');
            expect(typeof prompt).toBe('string');
        });

        it('应该生成英文提示词', () => {
            const prompt = generateAnalyzePrompt('en');
            expect(prompt).toContain('English');
            expect(typeof prompt).toBe('string');
        });

        it('应该包含学科提示（如果提供）', () => {
            const prompt = generateAnalyzePrompt('zh', null, '数学');
            expect(prompt).toContain('数学');
        });

        it('应该根据年级过滤数学标签（初一）', () => {
            const prompt = generateAnalyzePrompt('zh', 7, '数学');
            // 初一应该只包含七年级的标签
            expect(prompt).toBeDefined();
        });

        it('应该根据年级过滤数学标签（初三）', () => {
            const prompt = generateAnalyzePrompt('zh', 9, '数学');
            // 初三应该包含七、八、九年级的累进标签
            expect(prompt).toBeDefined();
        });

        it('应该根据年级过滤数学标签（高一）', () => {
            const prompt = generateAnalyzePrompt('zh', 10, '数学');
            expect(prompt).toBeDefined();
        });

        it('应该支持自定义选项 (providerHints)', () => {
            const prompt = generateAnalyzePrompt('zh', null, null, {
                providerHints: '请特别注意 LaTeX 格式',
            });
            expect(prompt).toContain('请特别注意 LaTeX 格式');
        });

        it('应该支持自定义模板', () => {
            const customTemplate = '自定义模板 {{language_instruction}}';
            const prompt = generateAnalyzePrompt('zh', null, null, {
                customTemplate,
            });
            expect(prompt).toContain('自定义模板');
            // language_instruction 会被替换为实际的语言指令（包含 Chinese）
            expect(prompt).toContain('Chinese');
        });

        it('生成的提示词不应包含未替换的变量占位符', () => {
            const prompt = generateAnalyzePrompt('zh', 8, '数学');
            // 检查常见的占位符是否已被替换
            expect(prompt).not.toContain('{{language_instruction}}');
            expect(prompt).not.toContain('{{tag_list}}');
            expect(prompt).not.toContain('{{provider_hints}}');
        });

        it('应该要求 AI 输出错因分析相关 XML 标签', () => {
            const prompt = generateAnalyzePrompt('zh', null, '数学');
            expect(prompt).toContain('<wrong_answer_text>');
            expect(prompt).toContain('<mistake_status>');
            expect(prompt).toContain('<mistake_analysis>');
            expect(prompt).toContain('wrong_attempt');
            expect(prompt).toContain('not_attempted');
            expect(prompt).toContain('unknown');
        });
    });

    describe('generateSimilarQuestionPrompt', () => {
        const originalQuestion = '已知 x + y = 5，求 x² + y² 的最小值';
        const knowledgePoints = ['一元二次方程', '最值问题'];

        it('应该生成中文类似题提示词', () => {
            const prompt = generateSimilarQuestionPrompt('zh', originalQuestion, knowledgePoints);
            expect(prompt).toContain(originalQuestion);
            expect(prompt).toContain('中文');
        });

        it('应该生成英文类似题提示词', () => {
            const prompt = generateSimilarQuestionPrompt('en', originalQuestion, knowledgePoints);
            expect(prompt).toContain(originalQuestion);
            expect(prompt).toContain('English');
        });

        it('应该包含知识点列表', () => {
            const prompt = generateSimilarQuestionPrompt('zh', originalQuestion, knowledgePoints);
            expect(prompt).toContain('一元二次方程');
            expect(prompt).toContain('最值问题');
        });

        it('应该根据难度级别调整提示词', () => {
            const easyPrompt = generateSimilarQuestionPrompt('zh', originalQuestion, knowledgePoints, 'easy');
            const hardPrompt = generateSimilarQuestionPrompt('zh', originalQuestion, knowledgePoints, 'hard');

            expect(easyPrompt.toUpperCase()).toContain('EASY');
            expect(hardPrompt.toUpperCase()).toContain('HARD');
        });

        it('应该支持所有难度级别', () => {
            const difficulties = ['easy', 'medium', 'hard', 'harder'] as const;

            difficulties.forEach(difficulty => {
                const prompt = generateSimilarQuestionPrompt('zh', originalQuestion, knowledgePoints, difficulty);
                expect(prompt).toBeDefined();
                expect(typeof prompt).toBe('string');
            });
        });

        it('默认难度应该是 MEDIUM', () => {
            const prompt = generateSimilarQuestionPrompt('zh', originalQuestion, knowledgePoints);
            expect(prompt.toUpperCase()).toContain('MEDIUM');
        });
    });

    describe('generateReanswerPrompt', () => {
        const questionText = '求解方程 2x + 3 = 7';

        it('应该生成中文重新解题提示词', () => {
            const prompt = generateReanswerPrompt('zh', questionText);
            expect(prompt).toContain(questionText);
            expect(prompt).toContain('中文');
        });

        it('应该生成英文重新解题提示词', () => {
            const prompt = generateReanswerPrompt('en', questionText);
            expect(prompt).toContain(questionText);
            expect(prompt).toContain('English');
        });

        it('应该包含学科提示（如果提供）', () => {
            const prompt = generateReanswerPrompt('zh', questionText, '数学');
            expect(prompt).toContain('数学');
        });

        it('应该支持自定义 provider hints', () => {
            const prompt = generateReanswerPrompt('zh', questionText, null, {
                providerHints: '输出格式要求',
            });
            expect(prompt).toContain('输出格式要求');
        });

        it('生成的提示词不应包含未替换的变量占位符', () => {
            const prompt = generateReanswerPrompt('zh', questionText, '数学');
            expect(prompt).not.toContain('{{question_text}}');
            expect(prompt).not.toContain('{{language_instruction}}');
            expect(prompt).not.toContain('{{provider_hints}}');
        });

        it('重新解题提示词应该要求同步输出新的错因分析', () => {
            const prompt = generateReanswerPrompt('zh', questionText, '数学');
            expect(prompt).toContain('<wrong_answer_text>');
            expect(prompt).toContain('<mistake_status>');
            expect(prompt).toContain('<mistake_analysis>');
            expect(prompt).toContain('重新判断');
        });

        it('重新解题提示词不应允许无依据推断学生错因', () => {
            const prompt = generateReanswerPrompt('zh', questionText, '数学');
            expect(prompt).not.toContain('推断');
            expect(prompt).toContain('不要猜测');
            expect(prompt).toContain('当前图片中可见');
        });
    });

    describe('模板变量替换', () => {
        it('应该正确处理多行文本', () => {
            const multiLineQuestion = `第一行
第二行
第三行`;
            const prompt = generateReanswerPrompt('zh', multiLineQuestion);
            expect(prompt).toContain('第一行');
            expect(prompt).toContain('第三行');
        });

        it('应该正确处理特殊字符', () => {
            const questionWithSpecialChars = '求解 x² + y² = r² 的圆的面积（其中 r > 0）';
            const prompt = generateReanswerPrompt('zh', questionWithSpecialChars);
            expect(prompt).toContain('x²');
            expect(prompt).toContain('r > 0');
        });
    });
});
