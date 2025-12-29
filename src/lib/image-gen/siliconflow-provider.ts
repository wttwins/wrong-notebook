/**
 * 硅基流动图片生成服务
 * 文档: https://docs.siliconflow.cn/api-reference/images/images-generations
 */

import { createLogger } from '../logger';
import type { ImageGenerationService, ImageGenConfig, ImageGenOptions, ImageGenResult } from './types';

const logger = createLogger('image-gen:siliconflow');

// 硅基流动 API 响应结构
interface SiliconFlowImageResponse {
    images: Array<{
        url: string;
    }>;
    timings?: {
        inference: number;
    };
    seed?: number;
}

interface SiliconFlowErrorResponse {
    error?: {
        code?: string;
        message: string;
    };
    message?: string;
}

export class SiliconFlowImageProvider implements ImageGenerationService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(config: ImageGenConfig) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.siliconflow.cn/v1';
        this.model = config.model || 'Qwen/Qwen-Image-Edit-2509';
    }

    async generateImage(prompt: string, options?: ImageGenOptions): Promise<ImageGenResult> {
        const size = options?.size || '1024x1024';

        logger.info({ prompt: prompt.substring(0, 100), size, model: this.model }, 'Generating image with SiliconFlow');

        try {
            const requestBody: Record<string, unknown> = {
                model: this.model,
                prompt: prompt,
                image_size: size,
                batch_size: 1,
            };

            const response = await fetch(`${this.baseUrl}/images/generations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}`;
                try {
                    // 先读取 text，再尝试解析 JSON，避免 body 被重复读取
                    const text = await response.text();
                    try {
                        const errorData = JSON.parse(text) as SiliconFlowErrorResponse;
                        errorMessage = errorData.error?.message || errorData.message || errorMessage;
                    } catch {
                        // 响应不是 JSON，直接使用文本内容
                        errorMessage = text || errorMessage;
                    }
                } catch {
                    // 无法读取响应体，使用 HTTP 状态码
                }
                logger.error({ status: response.status, error: errorMessage }, 'SiliconFlow API error');
                return {
                    success: false,
                    error: `硅基流动API错误: ${errorMessage}`,
                };
            }

            const data = await response.json() as SiliconFlowImageResponse;

            if (data.images && data.images.length > 0 && data.images[0].url) {
                logger.info({ url: data.images[0].url.substring(0, 50) + '...' }, 'Image generated successfully');
                return {
                    success: true,
                    imageUrl: data.images[0].url,
                };
            }

            return {
                success: false,
                error: '硅基流动API返回数据格式异常',
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage }, 'Failed to generate image with SiliconFlow');
            return {
                success: false,
                error: `图片生成失败: ${errorMessage}`,
            };
        }
    }
}
