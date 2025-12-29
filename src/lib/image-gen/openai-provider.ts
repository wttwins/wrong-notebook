/**
 * OpenAI DALL-E 图片生成服务
 * 也支持兼容OpenAI API的第三方服务
 */

import { createLogger } from '../logger';
import type { ImageGenerationService, ImageGenConfig, ImageGenOptions, ImageGenResult } from './types';

const logger = createLogger('image-gen:openai');

// OpenAI API响应结构
interface OpenAIImageResponse {
    created: number;
    data: Array<{
        url?: string;
        b64_json?: string;
        revised_prompt?: string;
    }>;
}

interface OpenAIErrorResponse {
    error?: {
        code: string;
        message: string;
        type: string;
    };
}

export class OpenAIImageProvider implements ImageGenerationService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(config: ImageGenConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        this.model = config.model || 'dall-e-3';
    }

    async generateImage(prompt: string, options?: ImageGenOptions): Promise<ImageGenResult> {
        // DALL-E 3 支持的尺寸: 1024x1024, 1792x1024, 1024x1792
        // DALL-E 2 支持的尺寸: 256x256, 512x512, 1024x1024
        const size = this.mapSize(options?.size);
        const responseFormat = options?.responseFormat || 'url';
        const style = options?.style || 'natural';

        logger.info({ prompt: prompt.substring(0, 100), size, model: this.model }, 'Generating image with OpenAI DALL-E');

        try {
            const requestBody: Record<string, unknown> = {
                model: this.model,
                prompt: prompt,
                n: 1,
                size: size,
                response_format: responseFormat,
            };

            // DALL-E 3 支持 style 参数
            if (this.model.includes('dall-e-3')) {
                requestBody.style = style;
            }

            const response = await fetch(`${this.baseUrl}/images/generations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json() as OpenAIErrorResponse;
                const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
                logger.error({ status: response.status, error: errorMessage }, 'OpenAI API error');
                return {
                    success: false,
                    error: `OpenAI API错误: ${errorMessage}`,
                };
            }

            const data = await response.json() as OpenAIImageResponse;

            if (data.data && data.data.length > 0) {
                const imageData = data.data[0];
                if (imageData.url) {
                    logger.info({ url: imageData.url.substring(0, 50) + '...' }, 'Image generated successfully');
                    return {
                        success: true,
                        imageUrl: imageData.url,
                    };
                } else if (imageData.b64_json) {
                    logger.info('Image generated successfully (base64)');
                    return {
                        success: true,
                        imageBase64: `data:image/png;base64,${imageData.b64_json}`,
                    };
                }
            }

            return {
                success: false,
                error: 'OpenAI API返回数据格式异常',
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage }, 'Failed to generate image with OpenAI');
            return {
                success: false,
                error: `图片生成失败: ${errorMessage}`,
            };
        }
    }

    /**
     * 将通用尺寸映射到DALL-E支持的尺寸
     */
    private mapSize(size?: string): string {
        if (!size) return '1024x1024';

        // DALL-E 3 支持的尺寸
        const dalle3Sizes = ['1024x1024', '1792x1024', '1024x1792'];
        // DALL-E 2 支持的尺寸
        const dalle2Sizes = ['256x256', '512x512', '1024x1024'];

        if (this.model.includes('dall-e-3')) {
            if (dalle3Sizes.includes(size)) return size;
            // 智谱的竖版尺寸映射到DALL-E 3的竖版
            if (size === '768x1344' || size === '864x1152') return '1024x1792';
            // 智谱的横版尺寸映射到DALL-E 3的横版
            if (size === '1344x768' || size === '1152x864') return '1792x1024';
            return '1024x1024';
        } else {
            // DALL-E 2
            if (dalle2Sizes.includes(size)) return size;
            return '1024x1024';
        }
    }
}
