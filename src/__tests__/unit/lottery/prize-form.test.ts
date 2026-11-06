// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildPrizePayload, EMPTY_PRIZE_FORM, PrizeFormError, type PrizeForm } from '@/lib/prize-form';

const initial: PrizeForm = { ...EMPTY_PRIZE_FORM, id: 'prize', name: '奖品', stock: '1', hasImage: true };

describe('pure prize form delta helper', () => {
    it('returns only the changed canonical scalar values', () => {
        expect(buildPrizePayload({ ...initial, name: ' 新名称 ', description: ' 说明 ' }, initial)).toEqual({ name: '新名称', description: '说明' });
        expect(buildPrizePayload({ ...initial, name: ' 奖品 ', stock: '01' }, initial)).toEqual({});
    });
    it('does not mark stock as changed when the user changes it and then restores it', () => {
        expect(buildPrizePayload({ ...initial, stock: '1' }, initial)).toEqual({});
    });
    it('sends the original finite or null expected stock for actual edits', () => {
        expect(buildPrizePayload({ ...initial, stock: '' }, initial)).toEqual({ stock: null, expectedStock: 1 });
        const unlimited = { ...initial, stock: '' };
        expect(buildPrizePayload({ ...unlimited, stock: '0' }, unlimited)).toEqual({ stock: 0, expectedStock: null });
    });
    it('only sends deliberate image actions, never an existing path or unchanged flags', () => {
        expect(buildPrizePayload({ ...initial, imageDataUrl: null, removeImage: false }, initial)).toEqual({});
        expect(buildPrizePayload({ ...initial, removeImage: true }, initial)).toEqual({ removeImage: true });
        const noImage = { ...initial, hasImage: false };
        expect(buildPrizePayload({ ...noImage, removeImage: true }, noImage)).toEqual({});
        expect(buildPrizePayload({ ...initial, imageDataUrl: 'data:image/png;base64,fixture', removeImage: false }, initial)).toEqual({ imageDataUrl: 'data:image/png;base64,fixture' });
    });
    it('creates with the full scalar payload and no expectedStock', () => {
        expect(buildPrizePayload({ ...EMPTY_PRIZE_FORM, name: ' 新奖品 ' })).toEqual({
            name: '新奖品', description: '', weight: 10, stock: null, enabled: true, isBlank: false, sortOrder: 0,
        });
    });
    it.each(['-1', '1.5', '2147483648', 'invalid', 'Infinity'])('rejects invalid stock text %s', (stock) => {
        expect(() => buildPrizePayload({ ...initial, stock }, initial)).toThrow(PrizeFormError);
    });
    it('refuses an edit without its original snapshot rather than falling back to a full PATCH', () => {
        expect(() => buildPrizePayload(initial)).toThrow(PrizeFormError);
    });
});
