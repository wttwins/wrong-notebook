/**
 * 纯客户端请求构造 helper（无 React/UI 依赖）。
 *
 * 连接测试与模型列表是“草稿字段优先”的：调用方传入的 apiKey/baseUrl/model
 * 就是用户当前未保存的输入；服务端已保存的密钥/地址只能作为组 C 服务端
 * 做可信比对的参考，绝不能替换用户正在测试的地址或把旧密钥发过去。
 */

export interface AITestSavedContext {
    apiKey?: string;
    baseUrl?: string;
    instanceId?: string;
}

export interface BuildAITestRequestOptions {
    provider: 'openai' | 'gemini' | 'azure';
    apiKey: string;
    baseUrl?: string;
    model?: string;
    language: 'zh' | 'en';
    instanceId?: string;
    useConfigured?: boolean;
    disableThinking?: boolean;
    saved?: AITestSavedContext;
}

export interface BuildModelListParamsOptions {
    provider: 'openai' | 'gemini';
    apiKey: string;
    baseUrl?: string;
    instanceId?: string;
    useConfigured?: boolean;
    saved?: AITestSavedContext;
}

export function buildAITestRequest(options: BuildAITestRequestOptions) {
    const { provider, apiKey, baseUrl, model, language, instanceId, useConfigured, disableThinking, saved } = options;
    const selectedInstanceId = instanceId ?? saved?.instanceId;
    const request: Record<string, unknown> = {
        provider,
        apiKey,
        ...(baseUrl !== undefined && { baseUrl }),
        ...(model !== undefined && { model }),
        language,
    };
    if (selectedInstanceId !== undefined) request.instanceId = selectedInstanceId;
    if (useConfigured !== undefined) request.useConfigured = Boolean(useConfigured);

    if (disableThinking !== undefined) request.disableThinking = disableThinking;
    return request;
}

export function buildModelListParams(options: BuildModelListParamsOptions) {
    const { provider, apiKey, baseUrl, instanceId, useConfigured, saved } = options;
    const params = new URLSearchParams({ provider, apiKey });
    // 显式清空表示测试默认公网地址；不能省略后误用旧保存的私网地址。
    if (baseUrl !== undefined) params.set('baseUrl', baseUrl);
    const selectedInstanceId = instanceId ?? saved?.instanceId;
    if (selectedInstanceId !== undefined) params.set('instanceId', selectedInstanceId);
    if (useConfigured !== undefined) params.set('useConfigured', String(useConfigured));
    return params;
}
