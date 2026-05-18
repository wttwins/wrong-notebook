import { describe, expect, it } from 'vitest';
import {
    getPrintPreviewCountLabel,
    getPrintPreviewEmptyState,
    getSelectedPrintItems,
    shouldReserveAnswerSpace,
} from '@/lib/print-preview';

describe('print preview helpers', () => {
    const items = [
        { id: 'item-1', questionText: '题目 1' },
        { id: 'item-2', questionText: '题目 2' },
        { id: 'item-3', questionText: '题目 3' },
    ];

    it('只返回当前选中的题目，并保持原顺序', () => {
        const selected = getSelectedPrintItems(items, new Set(['item-3', 'item-1']));

        expect(selected.map((item) => item.id)).toEqual(['item-1', 'item-3']);
    });

    it('只有在答案和解析都不显示时才预留作答空间', () => {
        expect(shouldReserveAnswerSpace(false, false)).toBe(true);
        expect(shouldReserveAnswerSpace(true, false)).toBe(false);
        expect(shouldReserveAnswerSpace(false, true)).toBe(false);
        expect(shouldReserveAnswerSpace(true, true)).toBe(false);
    });

    it('局部选择时显示已选数量和总数量', () => {
        expect(getPrintPreviewCountLabel(88, 88)).toBe('88');
        expect(getPrintPreviewCountLabel(88, 2)).toBe('2/88');
    });

    it('区分无匹配题目和有题但未选择', () => {
        expect(getPrintPreviewEmptyState(0, 0)).toBe('noItems');
        expect(getPrintPreviewEmptyState(88, 0)).toBe('noSelection');
        expect(getPrintPreviewEmptyState(88, 2)).toBeNull();
    });
});
