import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAppConfig } from '@/lib/config';
import { unauthorized, internalError } from '@/lib/api-errors';
import type { RuntimeConfig } from '@/types/api';

export const dynamic = 'force-dynamic';

/** Non-secret client runtime settings. Full /api/settings remains admin-only. */
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorized('Authentication required');

    try {
        const config = getAppConfig();
        const analyze = config.timeouts?.analyze;
        // Explicit allowlist at every level: never spread persisted config here.
        const runtimeConfig: RuntimeConfig = {
            timeouts: {
                analyze: typeof analyze === 'number' && Number.isFinite(analyze) && analyze > 0 ? analyze : 180000,
            },
        };
        return NextResponse.json(runtimeConfig, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return internalError('Failed to load runtime config');
    }
}
