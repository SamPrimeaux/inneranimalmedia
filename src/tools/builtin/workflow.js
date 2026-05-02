/**
 * Tool: Workflow (summarization / planning)
 * Implements 2 tools for project management and automation.
 */

async function invokeWorkflowOp(env, endpoint, method = 'POST', body = null) {
    const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
    try {
        const res = await fetch(`${origin}${endpoint}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : null,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Workflow Operation Failed');
        return data;
    } catch (e) {
        return { error: `Workflow Error: ${e.message}` };
    }
}

export const handlers = {
    async generate_daily_summary_email(params, env) { return await invokeWorkflowOp(env, '/api/workflow/summary', 'POST', params); },
    async generate_execution_plan(params, env) { return await invokeWorkflowOp(env, '/api/workflow/plan', 'POST', params); },
};
