/**
 * Tool: Web (CDT / Playwright / Search)
 * Implements 31 tools for browser automation and intelligence.
 */

/**
 * Common fetch bridge for all browser-related operations.
 * Proxies to the worker's browser runner via internal dashboard API.
 */
async function invokeBrowserOp(env, toolName, params) {
    const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
    try {
        const res = await fetch(`${origin}/api/browser/invoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: toolName, params }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Browser Operation Failed');
        return data;
    } catch (e) {
        return { error: `Browser Error [${toolName}]: ${e.message}` };
    }
}

export const handlers = {
    // ── Search & Audit ───────────────────────────────────────────────────
    async search_web(params, env) {
        const apiKey = env.TAVILY_API_KEY || env.SEARCH_API_KEY;
        if (!apiKey) return { error: 'Search API key missing' };
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
        // Security Approval Check is handled at the dispatcher layer
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
    async cdt_performance_start_trace(params, env) { return await invokeBrowserOp(env, 'cdt_performance_start_trace', params); },
    async cdt_performance_stop_trace(params, env) { return await invokeBrowserOp(env, 'cdt_performance_stop_trace', params); },
    async cdt_performance_analyze_insight(params, env) { return await invokeBrowserOp(env, 'cdt_performance_analyze_insight', params); },

    // ── Playwright & Legacy ──────────────────────────────────────────────
    async playwright_screenshot(params, env) { return await invokeBrowserOp(env, 'playwright_screenshot', params); },
    async browser_navigate(params, env) { return await invokeBrowserOp(env, 'browser_navigate', params); },
    async browser_screenshot(params, env) { return await invokeBrowserOp(env, 'browser_screenshot', params); },
    async browser_content(params, env) { return await invokeBrowserOp(env, 'browser_content', params); },
};
