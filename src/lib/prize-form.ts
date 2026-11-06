/** Pure form normalization/diffing, shared with stock validation on the server. */
export const MAX_PRISMA_INT = 2_147_483_647;
export const MIN_PRISMA_INT = -2_147_483_648;

export function isPrismaInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value)
        && value >= MIN_PRISMA_INT && value <= MAX_PRISMA_INT;
}

export function isPrizeStock(value: unknown): value is number | null {
    return value === null || (isPrismaInteger(value) && value >= 0);
}

export interface PrizeForm {
    id?: string;
    name: string;
    description: string;
    weight: number;
    stock: string; // 空字符串 = 不限量
    enabled: boolean;
    isBlank: boolean;
    sortOrder: number;
    hasImage?: boolean;
    imageDataUrl?: string | null;
    removeImage?: boolean;
}

export const EMPTY_PRIZE_FORM: PrizeForm = {
    name: '', description: '', weight: 10, stock: '', enabled: true, isBlank: false, sortOrder: 0,
};

export class PrizeFormError extends Error {}

function scalarValues(form: PrizeForm) {
    const text = form.stock.trim();
    const stock = text === '' ? null : Number(text);
    if (!isPrizeStock(stock)) {
        throw new PrizeFormError(`库存需为 0 - ${MAX_PRISMA_INT} 的整数，留空表示不限量`);
    }
    return {
        name: form.name.trim(),
        description: form.description.trim(),
        weight: Number(form.weight) || 1,
        stock,
        enabled: form.enabled,
        isBlank: form.isBlank,
        sortOrder: Number(form.sortOrder) || 0,
    };
}

/** Never refresh the original snapshot from a concurrently reloaded prize list. */
export function buildPrizePayload(form: PrizeForm, original: PrizeForm | null = null): Record<string, unknown> {
    if (form.id && (!original || original.id !== form.id)) {
        throw new PrizeFormError('请重新打开奖品编辑表单后重试');
    }
    const current = scalarValues(form);
    const payload: Record<string, unknown> = {};
    if (form.id && original) {
        const previous = scalarValues(original);
        for (const key of Object.keys(current) as Array<keyof typeof current>) {
            if (current[key] !== previous[key]) payload[key] = current[key];
        }
        if (Object.hasOwn(payload, 'stock')) payload.expectedStock = previous.stock;
    } else {
        Object.assign(payload, current); // Creation still sends all scalar fields.
    }
    if (form.imageDataUrl) payload.imageDataUrl = form.imageDataUrl;
    else if (form.removeImage && original?.hasImage) payload.removeImage = true;
    return payload;
}
