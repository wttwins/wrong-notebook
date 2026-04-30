export type MistakeStatus = 'not_attempted' | 'wrong_attempt' | 'unknown';

export function normalizeMistakeStatus(status?: unknown): MistakeStatus {
    if (status === 'not_attempted' || status === 'wrong_attempt' || status === 'unknown') {
        return status;
    }
    return 'unknown';
}

export function normalizeMistakeStatusForSave(
    status?: unknown,
    wrongAnswerText?: string | null
): MistakeStatus {
    if ((wrongAnswerText || '').trim()) {
        return 'wrong_attempt';
    }
    return normalizeMistakeStatus(status);
}

export function getMistakeStatusLabel(status?: string | null, language: 'zh' | 'en' = 'zh') {
    const normalized = normalizeMistakeStatus(status);

    const labels = language === 'en'
        ? {
            not_attempted: 'Not attempted',
            wrong_attempt: 'Wrong attempt',
            unknown: 'Unknown',
        }
        : {
            not_attempted: '不会做',
            wrong_attempt: '做错了',
            unknown: '未判断',
        };

    return labels[normalized];
}
