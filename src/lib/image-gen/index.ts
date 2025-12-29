/**
 * 图片生成服务工厂函数
 */

import { getActiveImageGenConfig } from '../config';
import { createLogger } from '../logger';
import type { ImageGenerationService, ImageGenConfig } from './types';
import { ZhipuImageProvider } from './zhipu-provider';
import { OpenAIImageProvider } from './openai-provider';

const logger = createLogger('image-gen');

// 导出类型
export type { ImageGenerationService, ImageGenConfig, ImageGenOptions, ImageGenResult } from './types';

/**
 * 获取图片生成服务实例
 * 根据配置返回对应的Provider
 */
export function getImageGenService(): ImageGenerationService | null {
    const instanceConfig = getActiveImageGenConfig();

    if (!instanceConfig) {
        logger.debug('Image generation is not configured or disabled');
        return null;
    }

    const config: ImageGenConfig = {
        apiKey: instanceConfig.apiKey,
        baseUrl: instanceConfig.baseUrl,
        model: instanceConfig.model,
        provider: instanceConfig.provider,
    };

    logger.info({ provider: instanceConfig.provider, model: instanceConfig.model }, 'Creating image generation service');

    switch (instanceConfig.provider) {
        case 'zhipu':
            return new ZhipuImageProvider(config);
        case 'openai':
            return new OpenAIImageProvider(config);
        case 'other':
            // 默认使用OpenAI兼容接口
            return new OpenAIImageProvider(config);
        default:
            logger.warn({ provider: instanceConfig.provider }, 'Unknown image generation provider, using OpenAI compatible');
            return new OpenAIImageProvider(config);
    }
}

/**
 * 检查图片生成服务是否可用
 */
export function isImageGenEnabled(): boolean {
    const config = getActiveImageGenConfig();
    return config !== undefined;
}
