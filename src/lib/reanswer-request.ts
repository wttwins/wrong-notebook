export type ReanswerRequestBody = {
    questionText: string;
    language: 'zh' | 'en';
    subject: string;
    imageBase64?: string;
};

export function buildReanswerRequestBody({
    questionText,
    language,
    subject,
    imagePreview,
}: {
    questionText: string;
    language: 'zh' | 'en';
    subject: string;
    imagePreview?: string | null;
}): ReanswerRequestBody {
    const requestBody: ReanswerRequestBody = {
        questionText,
        language,
        subject,
    };

    if (imagePreview) {
        requestBody.imageBase64 = imagePreview;
    }

    return requestBody;
}
