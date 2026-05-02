// src/tools/time.js
/**
 * Agent Sam: Time & Temporal Dispatcher
 * Orchestrates time-aware logic and timezone conversions.
 */
import { jsonResponse } from '../core/auth.js';

/**
 * Main dispatcher for Time-related tasks.
 * Route: /api/agentsam/time/*
 */
export async function handleTimeDispatch(request, env, ctx, authUser) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    try {
        const body = method !== 'GET' ? await request.json() : {};
        const tz = body.timezone || url.searchParams.get('timezone') || 'UTC';

        // 1. NOW: Get current time
        if (path.endsWith('/now')) {
            const now = new Date();
            const localTime = now.toLocaleString('en-US', { timeZone: tz });
            return jsonResponse({
                iso: now.toISOString(),
                timestamp: Math.floor(now.getTime() / 1000),
                local: localTime,
                timezone: tz
            });
        }

        // 2. CONVERT: Timezone conversion logic
        if (path.endsWith('/convert')) {
            const timeStr = body.time || url.searchParams.get('time');
            const targetTz = body.target_timezone || url.searchParams.get('target_timezone') || 'UTC';
            
            if (!timeStr) return jsonResponse({ error: 'Missing time parameter' }, 400);

            const date = new Date(timeStr);
            const converted = date.toLocaleString('en-US', { timeZone: targetTz });
            
            return jsonResponse({
                original: date.toISOString(),
                converted,
                target_timezone: targetTz
            });
        }

        return jsonResponse({ error: 'Time action not found' }, 404);

    } catch (e) {
        console.error('[Time Dispatch Error]', e.message);
        return jsonResponse({ error: 'Time dispatcher failed', detail: e.message }, 500);
    }
}
