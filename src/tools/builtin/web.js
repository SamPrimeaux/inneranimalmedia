/**
 * Tool: Web (CDT / Playwright / Search)
 * Browser automation runs in-worker via MYBROWSER (src/integrations/browser-cdp.js).
 */

import { assertFetchDomainAllowed } from '../../core/auth.js';
import { assertBrowserTrustedOrigin } from '../../core/agentsam-ops-ledger.js';
import { runPlaywrightScreenshotJob } from '../../integrations/playwright.js';
import { runBrowserBuiltinTool } from '../../integrations/browser-cdp.js';

const SCREENSHOT_JOB_TOOLS = new Set(['playwright_screenshot', 'browser_screenshot']);

/**
 * MYBROWSER in-worker path (no /api/mcp/invoke — avoids MCP_AUTH_TOKEN 401).
 */
async function invokeBrowserOp(env, toolName, params) {
    const targetOriginInput =
        params.url ?? params.origin ?? params.href ?? params.target_url ?? params.page_url;
    const uid = params.user_id ?? params.session?.user_id;
    const ws =
        params.workspace_id ?? params.session?.workspace_id ?? params.session?.workspaceId;
    if (targetOriginInput && uid) {
        try {
            await assertBrowserTrustedOrigin(env, {
                userId: uid,
                workspaceId: ws,
                origin: targetOriginInput,
            });
        } catch (e) {
            return { error: e.message, blocked: true };
        }
    }

    const tool = String(toolName || '').trim();

    // Job-tracked screenshots (playwright_jobs row) for dashboard polling parity.
    if (SCREENSHOT_JOB_TOOLS.has(tool)) {
        const url = String(targetOriginInput || '').trim();
        if (!url) return { error: 'url required for screenshot' };
        if (!uid) return { error: 'user_id required for screenshot' };
        const agentRunId =
            params.agent_run_id ??
            params.agentRunId ??
            params.session?.agent_run_id ??
            null;
        return runPlaywrightScreenshotJob(env, {
            url,
            userId: String(uid),
            workspaceId: ws != null ? String(ws) : null,
            agentRunId: agentRunId != null ? String(agentRunId) : null,
            source: `agent_tool:${tool}`,
        });
    }

    return runBrowserBuiltinTool(env, tool, params);
}

export const handlers = {
    // ── Search & Audit ───────────────────────────────────────────────────
    async search_web(params, env) {
        const apiKey = env.TAVILY_API_KEY || env.SEARCH_API_KEY;
        if (!apiKey) return { error: 'Search API key missing' };
        const gate = await assertFetchDomainAllowed(
            env,
            params.user_id ?? params.session?.user_id,
            params.workspace_id ?? params.session?.workspace_id ?? params.session?.workspaceId,
            'https://api.tavily.com/search',
        );
        if (!gate.ok) return { error: gate.error };
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey, query: params.query, search_depth: 'advanced' }),
        });
        return await res.json();
    },

    async a11y_audit(params, env) {
        return await invokeBrowserOp(env, 'a11y_audit_webpage', params);
    },

    // ── CDT Core ─────────────────────────────────────────────────────────
    async cdt_navigate_page(params, env) { return await invokeBrowserOp(env, 'cdt_navigate_page', params); },
    async cdt_take_screenshot(params, env) { return await invokeBrowserOp(env, 'cdt_take_screenshot', params); },
    async cdt_click(params, env) { return await invokeBrowserOp(env, 'cdt_click', params); },
    async cdt_fill(params, env) { return await invokeBrowserOp(env, 'cdt_fill', params); },
    async cdt_fill_form(params, env) { return await invokeBrowserOp(env, 'cdt_fill_form', params); },
    async cdt_evaluate_script(params, env) {
        return await invokeBrowserOp(env, 'cdt_evaluate_script', params);
    },
    async cdt_list_pages(params, env) { return await invokeBrowserOp(env, 'cdt_list_pages', params); },
    async cdt_wait_for(params, env) { return await invokeBrowserOp(env, 'cdt_wait_for', params); },
    async cdt_take_snapshot(params, env) { return await invokeBrowserOp(env, 'cdt_take_snapshot', params); },
    async cdt_hover(params, env) { return await invokeBrowserOp(env, 'cdt_hover', params); },
    async cdt_drag(params, env) { return await invokeBrowserOp(env, 'cdt_drag', params); },
    async cdt_press_key(params, env) { return await invokeBrowserOp(env, 'cdt_press_key', params); },
    async cdt_upload_file(params, env) { return await invokeBrowserOp(env, 'cdt_upload_file', params); },

    // ── CDT Performance ──────────────────────────────────────────────────
    async cdt_performance_start_trace(params, env) {
        return await invokeBrowserOp(env, 'cdt_performance_start_trace', params);
    },
    async cdt_performance_stop_trace(params, env) {
        return await invokeBrowserOp(env, 'cdt_performance_stop_trace', params);
    },
    async cdt_performance_analyze_insight(params, env) {
        return await invokeBrowserOp(env, 'cdt_performance_analyze_insight', params);
    },

    // ── Playwright & Legacy ──────────────────────────────────────────────
    async playwright_screenshot(params, env) { return await invokeBrowserOp(env, 'playwright_screenshot', params); },
    async browser_navigate(params, env) { return await invokeBrowserOp(env, 'browser_navigate', params); },
    async browser_screenshot(params, env) { return await invokeBrowserOp(env, 'browser_screenshot', params); },
    async browser_content(params, env) { return await invokeBrowserOp(env, 'browser_content', params); },
};
