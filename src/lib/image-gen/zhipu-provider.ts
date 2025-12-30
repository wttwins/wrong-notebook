/**
 * 智谱AI CogView 图片生成服务
 * 文档: https://open.bigmodel.cn/dev/api/image/cogview
 */

import { createLogger } from '../logger';
import type { ImageGenerationService, ImageGenConfig, ImageGenOptions, ImageGenResult } from './types';

const logger = createLogger('image-gen:zhipu');

// 智谱API响应结构
interface ZhipuImageResponse {
    created: number;
    data: Array<{
        url: string;
    }>;
}

interface ZhipuErrorResponse {
    error?: {
        code: string;
        message: string;
    };
}

export class ZhipuImageProvider implements ImageGenerationService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(config: ImageGenConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
        this.model = config.model || 'cogview-4';
    }

    async generateImage(prompt: string, options?: ImageGenOptions): Promise<ImageGenResult> {
        const size = options?.size || '1024x1024';

        logger.info({ prompt: prompt.substring(0, 100), size, model: this.model }, 'Generating image with Zhipu CogView');

        try {
            const response = await fetch(`${this.baseUrl}/images/generations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    size: size,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json() as ZhipuErrorResponse;
                const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
                logger.error({ status: response.status, error: errorMessage }, 'Zhipu API error');
                return {
                    success: false,
                    error: `智谱API错误: ${errorMessage}`,
                };
            }

            const data = await response.json() as ZhipuImageResponse;

            if (data.data && data.data.length > 0 && data.data[0].url) {
                logger.info({ url: data.data[0].url.substring(0, 50) + '...' }, 'Image generated successfully');
                return {
                    success: true,
                    imageUrl: data.data[0].url,
                };
            }

            return {
                success: false,
                error: '智谱API返回数据格式异常',
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage }, 'Failed to generate image with Zhipu');
            return {
                success: false,
                error: `图片生成失败: ${errorMessage}`,
            };
        }
    }
}
