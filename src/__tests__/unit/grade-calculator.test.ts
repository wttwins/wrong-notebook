/**
 * 年级计算器单元测试
 * 测试 calculateGrade 函数在各种场景下的正确性
 */
import { describe, it, expect } from 'vitest';
import { calculateGrade } from '@/lib/grade-calculator';

describe('calculateGrade', () => {
    describe('初中阶段 (junior_high)', () => {
        it('应该正确计算初一上期（9月入学当年9月）', () => {
            // 2025年9月入学，2025年9月查询
            const result = calculateGrade('junior_high', 2025, new Date('2025-09-15'), 'zh');
            expect(result).toBe('初一上');
        });

        it('应该正确计算初一上期（英文）', () => {
            const result = calculateGrade('junior_high', 2025, new Date('2025-09-15'), 'en');
            expect(result).toBe('Junior High Grade 1, 1st Semester');
        });

        it('应该正确计算初一下期（次年2月）', () => {
            // 2025年9月入学，2026年3月查询
            const result = calculateGrade('junior_high', 2025, new Date('2026-03-15'), 'zh');
            expect(result).toBe('初一下');
        });

        it('应该正确计算初二上期', () => {
            // 2024年9月入学，2025年10月查询
            const result = calculateGrade('junior_high', 2024, new Date('2025-10-15'), 'zh');
            expect(result).toBe('初二上');
        });

        it('应该正确计算初三下期', () => {
            // 2022年9月入学，2025年5月查询
            const result = calculateGrade('junior_high', 2022, new Date('2025-05-15'), 'zh');
            expect(result).toBe('初三下');
        });

        it('应该正确处理已毕业情况', () => {
            // 2020年9月入学，2024年查询（已超过3年）
            const result = calculateGrade('junior_high', 2020, new Date('2024-09-15'), 'zh');
            expect(result).toBe('已毕业上');
        });

        it('应该正确处理已毕业情况（英文）', () => {
            const result = calculateGrade('junior_high', 2020, new Date('2024-09-15'), 'en');
            expect(result).toBe('Graduated, 1st Semester');
        });
    });

    describe('高中阶段 (senior_high)', () => {
        it('应该正确计算高一上期', () => {
            const result = calculateGrade('senior_high', 2024, new Date('2024-10-15'), 'zh');
            expect(result).toBe('高一上');
        });

        it('应该正确计算高二下期', () => {
            const result = calculateGrade('senior_high', 2023, new Date('2025-04-15'), 'zh');
            expect(result).toBe('高二下');
        });

        it('应该正确计算高三上期（英文）', () => {
            const result = calculateGrade('senior_high', 2022, new Date('2024-11-15'), 'en');
            expect(result).toBe('Senior High Grade 3, 1st Semester');
        });
    });

    describe('小学阶段 (primary)', () => {
        it('应该正确计算一年级', () => {
            const result = calculateGrade('primary', 2024, new Date('2024-10-15'), 'zh');
            expect(result).toBe('一年级上');
        });

        it('应该正确计算六年级', () => {
            const result = calculateGrade('primary', 2019, new Date('2025-04-15'), 'zh');
            expect(result).toBe('六年级下');
        });

        it('应该正确计算六年级（英文）', () => {
            const result = calculateGrade('primary', 2019, new Date('2025-04-15'), 'en');
            expect(result).toBe('Grade 6, 2nd Semester');
        });
    });

    describe('大学阶段 (university)', () => {
        it('应该正确计算大一', () => {
            const result = calculateGrade('university', 2024, new Date('2024-10-15'), 'zh');
            expect(result).toBe('大一上');
        });

        it('应该正确计算大四（英文）', () => {
            const result = calculateGrade('university', 2021, new Date('2024-10-15'), 'en');
            expect(result).toBe('Senior, 1st Semester');
        });
    });

    describe('学期判断逻辑', () => {
        it('9月份应该是上期', () => {
            const result = calculateGrade('junior_high', 2024, new Date('2024-09-01'), 'zh');
            expect(result).toContain('上');
        });

        it('12月份应该是上期', () => {
            const result = calculateGrade('junior_high', 2024, new Date('2024-12-15'), 'zh');
            expect(result).toContain('上');
        });

        it('1月份应该是上期（寒假前）', () => {
            const result = calculateGrade('junior_high', 2024, new Date('2025-01-15'), 'zh');
            expect(result).toContain('上');
        });

        it('2月份应该是下期', () => {
            const result = calculateGrade('junior_high', 2024, new Date('2025-02-15'), 'zh');
            expect(result).toContain('下');
        });

        it('6月份应该是下期', () => {
            const result = calculateGrade('junior_high', 2024, new Date('2025-06-15'), 'zh');
            expect(result).toContain('下');
        });

        it('8月份应该是下期（暑假）', () => {
            const result = calculateGrade('junior_high', 2024, new Date('2025-08-15'), 'zh');
            expect(result).toContain('下');
        });
    });

    describe('边界情况', () => {
        it('未入学情况应返回学前', () => {
            // 2026年9月入学，2025年查询
            const result = calculateGrade('junior_high', 2026, new Date('2025-05-15'), 'zh');
            expect(result).toContain('学前');
        });

        it('未入学情况应返回 Pre-school（英文）', () => {
            const result = calculateGrade('junior_high', 2026, new Date('2025-05-15'), 'en');
            expect(result).toContain('Pre-school');
        });

        it('未知教育阶段应返回已毕业（因为空数组）', () => {
            const result = calculateGrade('unknown_stage', 2024, new Date('2025-01-15'), 'zh');
            // stageMap[unknown_stage] 返回 undefined/空数组，所以 gradeLevel > grades.length
            expect(result).toContain('已毕业');
        });

        it('默认使用英文语言', () => {
            const result = calculateGrade('junior_high', 2024, new Date('2024-10-15'));
            expect(result).toBe('Junior High Grade 1, 1st Semester');
        });

        it('默认使用当前日期', () => {
            // 这个测试检查函数是否能在不传日期时正常工作
            const result = calculateGrade('junior_high', 2024);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });
    });
});
