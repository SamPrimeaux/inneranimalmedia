import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';

/**
 * Playwright Service Integration.
 * Handles browser rendering, screenshots, and job tracking via @cloudflare/playwright.
 */

/**
 * Handle Browser-related API requests (/api/browser/*).
 */
export async function handleBrowserRequest(request, url, env) {
    if (!env.MYBROWSER) {
        return jsonResponse({
            error: 'MYBROWSER binding not configured',
            hint: 'Add Browser rendering binding in Cloudflare dashboard and wrangler.toml'
        }, 503);
    }

    const pathLower = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();

    // ── GET /api/browser/screenshot ──────────────────────────────────────────
    if (pathLower === '/api/browser/screenshot' && method === 'GET') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) return jsonResponse({ error: 'url required' }, 400);

        try {
            const { launch } = await import('@cloudflare/playwright');
            const browser = await launch(env.MYBROWSER);
            const page = await browser.newPage();
            
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
            const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
            await browser.close();

            return new Response(buf, {
                headers: { 
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'public, max-age=3600'
                }
            });
        } catch (e) {
            return jsonResponse({ error: 'Screenshot failed', detail: e.message }, 500);
        }
    }

    return jsonResponse({ error: 'Browser route not found' }, 404);
}

/**
 * Handle Playwright Job tracking (/api/playwright/*).
 */
export async function handlePlaywrightJobApi(request, env) {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    try {
        const { results } = await env.DB.prepare(
            "SELECT id, url, status, result_url, created_at, completed_at FROM playwright_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
        ).bind(authUser.id).all();
        
        return jsonResponse({ jobs: results || [] });
    } catch (e) {
        return jsonResponse({ error: 'Failed to fetch browser jobs', detail: e.message }, 500);
    }
}
