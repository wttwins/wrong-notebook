import { describe, expect, it } from 'vitest';
import { buildReanswerRequestBody } from '@/lib/reanswer-request';

describe('reanswer request body', () => {
    it('重新解答只要有原图就应该带上原图，供错因分析使用', () => {
        const requestBody = buildReanswerRequestBody({
            questionText: '校正后的题目',
            language: 'zh',
            subject: '数学',
            imagePreview: 'data:image/jpeg;base64,abc',
        });

        expect(requestBody.imageBase64).toBe('data:image/jpeg;base64,abc');
    });

    it('没有原图时不传 imageBase64', () => {
        const requestBody = buildReanswerRequestBody({
            questionText: '校正后的题目',
            language: 'zh',
            subject: '数学',
        });

        expect(requestBody).not.toHaveProperty('imageBase64');
    });
});
