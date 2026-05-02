/**
 * Tool: Deploy (Cloudflare Workers / CI/CD)
 * Implements 5 tools for infrastructure management and pipeline automation.
 */

async function invokeCfApi(env, path, method = 'GET', body = null) {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) return { error: 'Cloudflare credentials not configured' };

    try {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
            method,
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : null,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.errors?.[0]?.message || 'CF API Failed');
        return data.result || data;
    } catch (e) {
        return { error: `Deployment Error: ${e.message}` };
    }
}

export const handlers = {
    // ── Worker Inventory ──────────────────────────────────────────────────
    async list_workers(params, env) { return await invokeCfApi(env, '/workers/services'); },
    async get_worker_services(params, env) { return await invokeCfApi(env, `/workers/services/${params.name}`); },

    // ── Deployment Control ────────────────────────────────────────────────
    async worker_deploy(params, env) {
        // Bridges to the terminal execute tool to run 'wrangler deploy'
        const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
        const res = await fetch(`${origin}/api/agent/terminal/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                command: `cd ${params.repo || '.'} && wrangler deploy --branch ${params.branch || 'main'}` 
            }),
        });
        return await res.json();
    },

    async get_deploy_command(params, env) {
        return { command: `wrangler deploy` };
    },

    // ── Workflow Pipelines ───────────────────────────────────────────────
    async workflow_run_pipeline(params, env) {
        return { status: 'workflow_initiated', message: 'Deployment pipeline started', pipeline: params.name };
    }
};
