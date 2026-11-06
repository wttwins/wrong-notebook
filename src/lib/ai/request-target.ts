import { z } from 'zod';
import { getAppConfig } from '@/lib/config';
import { checkOutboundUrl } from '@/lib/ssrf-guard';

const DEFAULT_OPENAI_URL = 'https://api.openai.com/v1';
const DEFAULT_GEMINI_URL = 'https://generativelanguage.googleapis.com';

// Do not coerce booleans: in particular, the string "false" is not a flag.
const aiRequestSchema = z.object({
    provider: z.enum(['openai', 'gemini', 'azure']),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    instanceId: z.string().min(1).optional(),
    useConfigured: z.boolean().optional(),
    disableThinking: z.boolean().optional(),
    model: z.string().optional(),
    endpoint: z.string().optional(),
    deploymentName: z.string().optional(),
    apiVersion: z.string().optional(),
    language: z.enum(['zh', 'en']).optional(),
}).superRefine((request, ctx) => {
    if (request.provider === 'azure' && request.baseUrl !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: 'Azure 仅支持 endpoint，不接受 baseUrl' });
    }
    if (request.provider !== 'azure' && request.endpoint !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['endpoint'], message: 'endpoint 仅适用于 Azure' });
    }
    if (request.provider !== 'openai' && request.instanceId !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['instanceId'], message: 'instanceId 仅适用于 OpenAI' });
    }
});

export type AIRequest = z.infer<typeof aiRequestSchema>;

export interface AIRequestTarget extends Omit<AIRequest, 'apiKey' | 'language'> {
    apiKey: string;
    language: 'zh' | 'en';
    trusted: boolean;
}

export type AIRequestTargetResult =
    | { ok: true; target: AIRequestTarget }
    | { ok: false; status: 400 | 403; error: string };

/** Decode only exact boolean query literals; duplicate fields are invalid. */
export function parseModelsRequest(searchParams: URLSearchParams) {
    const request: Record<string, unknown> = { provider: 'openai' };
    const fields = ['provider', 'apiKey', 'baseUrl', 'instanceId', 'useConfigured', 'disableThinking',
        'model', 'endpoint', 'deploymentName', 'apiVersion', 'language'];
    for (const field of fields) {
        const values = searchParams.getAll(field);
        if (values.length === 0) continue;
        if (values.length > 1) {
            request[field] = values; // schema rejects duplicate selection/credential fields
        } else if (field === 'useConfigured' || field === 'disableThinking') {
            request[field] = values[0] === 'true' ? true : values[0] === 'false' ? false : values[0];
        } else {
            request[field] = values[0];
        }
    }
    return aiRequestSchema.safeParse(request);
}

function invalid(error: string): AIRequestTargetResult {
    return { ok: false, status: 400, error };
}

interface SavedTarget {
    apiKey?: string;
    address?: string;
    model?: string;
    disableThinking?: boolean;
    deploymentName?: string;
    apiVersion?: string;
}

/**
 * Resolve one address/credential pair. Only an admin's exact saved target may
 * bypass the private-address guard. An ID is a lookup hint, not authorization.
 * If current address/key edits do not match, use only the caller's credential
 * through the original outbound guard; never lend a saved key to a new URL.
 */
export function resolveAIRequestTarget(raw: unknown, isAdmin: boolean): AIRequestTargetResult {
    const parsed = aiRequestSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error.issues[0].message);
    const request = parsed.data;
    const { provider } = request;

    const wantsSaved = provider === 'openai' ? request.instanceId !== undefined : request.useConfigured === true;
    // 空地址沿用 provider 默认公网；引用保存配置仍须管理员，不能借此绕过权限。
    const hasCustomTarget = Boolean(request.baseUrl || request.endpoint);
    if (!isAdmin && (hasCustomTarget || wantsSaved || request.useConfigured === true)) {
        return { ok: false, status: 403, error: '仅管理员可指定自定义接口地址或使用已保存的接口配置' };
    }

    let saved: SavedTarget | undefined;
    if (wantsSaved) {
        const config = getAppConfig();
        if (provider === 'openai') {
            const instance = config.openai?.instances?.find((item) => item.id === request.instanceId);
            if (instance) saved = { ...instance, address: instance.baseUrl };
        } else if (provider === 'gemini' && config.gemini) {
            saved = { ...config.gemini, address: config.gemini.baseUrl };
        } else if (provider === 'azure' && config.azure) {
            saved = { ...config.azure, address: config.azure.endpoint };
        }
    }

    const defaultAddress = provider === 'openai' ? DEFAULT_OPENAI_URL : provider === 'gemini' ? DEFAULT_GEMINI_URL : '';
    const savedAddress = saved ? saved.address || defaultAddress : undefined;
    const callerAddress = provider === 'azure' ? request.endpoint : request.baseUrl;
    // An explicit empty address means the provider default, not the old address.
    const effectiveAddress = callerAddress !== undefined ? callerAddress || defaultAddress : savedAddress ?? defaultAddress;
    // Missing key may use the saved credential; an explicitly cleared key is a current edit.
    const trusted = Boolean(saved?.apiKey && effectiveAddress === savedAddress &&
        (request.apiKey === undefined || request.apiKey === saved.apiKey));
    const apiKey = trusted ? saved!.apiKey! : request.apiKey;

    if (!apiKey) {
        return invalid(wantsSaved
            ? 'API key is required；接口地址或凭据已变更，请先保存设置或提供当前接口的 API key'
            : 'API key is required');
    }
    if (!effectiveAddress) return invalid('Azure 需要 endpoint 和 deploymentName');

    // Trust exempts private hosts only, not malformed addresses/non-HTTP schemes.
    try {
        const url = new URL(effectiveAddress);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return invalid('接口地址协议不被允许');
    } catch {
        return invalid('接口地址格式非法');
    }
    if (!trusted) {
        const check = checkOutboundUrl(effectiveAddress);
        if (!check.ok) {
            return invalid(`接口地址不被允许：${check.reason}；私网接口请先保存设置，再使用已保存的配置测试`);
        }
    }

    const deploymentName = request.deploymentName ?? (trusted ? saved?.deploymentName : undefined);
    if (provider === 'azure' && !deploymentName) return invalid('Azure 需要 endpoint 和 deploymentName');

    return {
        ok: true,
        target: {
            provider,
            apiKey,
            baseUrl: provider === 'azure' ? undefined : effectiveAddress,
            endpoint: provider === 'azure' ? effectiveAddress : undefined,
            deploymentName,
            apiVersion: request.apiVersion ?? (trusted ? saved?.apiVersion : undefined),
            model: request.model ?? (trusted ? saved?.model : undefined),
            language: request.language ?? 'zh',
            disableThinking: request.disableThinking ?? (trusted ? saved?.disableThinking : undefined),
            trusted,
        },
    };
}
