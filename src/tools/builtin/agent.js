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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Agent Operation Failed');
        return data;
    } catch (e) {
        return { error: `Agent Sam Error: ${e.message}` };
    }
}

export const handlers = {
    async agentsam_run_agent(params, env) { return await invokeAgentOp(env, '/api/agent/run', 'POST', params); },
    async agentsam_list_agents(params, env) { return await invokeAgentOp(env, '/api/agent/list', 'GET'); },
    async agentsam_get_agent(params, env) { return await invokeAgentOp(env, `/api/agent/status?id=${params.id}`, 'GET'); },
};
