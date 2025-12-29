/**
 * 图片生成服务类型定义
 */

export interface ImageGenerationService {
    /**
     * 根据文本描述生成图片
     * @param prompt 图片描述（英文）
     * @param options 可选配置
     */
    generateImage(prompt: string, options?: ImageGenOptions): Promise<ImageGenResult>;
}

export interface ImageGenOptions {
    /** 图片尺寸 */
    size?: '256x256' | '512x512' | '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864';
    /** 图片风格 */
    style?: 'natural' | 'vivid';
    /** 返回格式：URL或Base64 */
    responseFormat?: 'url' | 'b64_json';
}

export interface ImageGenResult {
    /** 是否成功 */
    success: boolean;
    /** 生成的图片URL（外部可访问） */
    imageUrl?: string;
    /** 生成的图片Base64数据 */
    imageBase64?: string;
    /** 错误信息 */
    error?: string;
}

export interface ImageGenConfig {
    apiKey: string;
    baseUrl?: string;
    model?: string;
    provider: 'zhipu' | 'openai' | 'other';
}
