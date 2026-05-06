/**
 * Tool: Agent (Cursor Cloud Agents)
 * Implements 3 tools for managing asynchronous coding tasks.
 */

async function invokeAgentOp(env, endpoint, method = 'POST', body = null) {
    const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
    try {
        const res = await fetch(`${origin}${endpoint}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : null,
        });
        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        const text = await res.text();
        const looksJson =
            ct.includes('application/json') || ct.includes('+json') || /^\s*[\[{]/.test(text);
        const data = looksJson ? JSON.parse(text) : null;
        if (!res.ok) {
            const preview = text ? text.slice(0, 800) : '';
            const msg =
                (data && typeof data === 'object' && (data.error || data.message)) ||
                `Upstream ${res.status} ${res.statusText}` +
                    (preview ? ` — ${preview}` : '');
            return {
                error: 'Agent Sam Error: upstream_request_failed',
                status: res.status,
                statusText: res.statusText,
                upstream: { endpoint, method },
                message: String(msg),
            };
        }
        return data ?? { ok: true, text };
    } catch (e) {
        return { error: `Agent Sam Error: ${e instanceof Error ? e.message : String(e)}` };
    }
}

export const handlers = {
    async agentsam_run_agent(params, env) { return await invokeAgentOp(env, '/api/agent/run', 'POST', params); },
    async agentsam_list_agents(params, env) { return await invokeAgentOp(env, '/api/agent/list', 'GET'); },
    async agentsam_get_agent(params, env) { return await invokeAgentOp(env, `/api/agent/status?id=${params.id}`, 'GET'); },
};
