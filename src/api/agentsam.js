/**
 * API Service: Agent Sam Capability Layer
 * Handles registry lookups for managed agents, skills, and invocation auditing.
 * Interfaces with agentsam_ai, agentsam_skill, and agentsam_skill_invocation.
 */
import { handlers as db } from '../tools/db.js';
import { getAuthUser, jsonResponse } from '../core/auth.js';

/**
 * HTTP entry for /api/agentsam/* (registry, prompts, etc.).
 */
export async function handleAgentSamApi(request, url, env, ctx) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  const out = await handleAgentSamRegistryRequest(request, env, ctx, authUser);
  if (out) return out;
  return jsonResponse({ error: 'API route not found' }, 404);
}

/**
 * Main switch-board for Agent Sam Registry requests.
 */
export async function handleAgentSamRegistryRequest(request, env, ctx, authUser) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    // 1. Model Registry: GET /api/agentsam/ai/:role
    if (path.startsWith('/api/agentsam/ai') && method === 'GET') {
        const parts = path.split('/');
        const role = parts[parts.length - 1]; // e.g. orchestrator, worker
        const agent = await getAgentMetadata(env, role);
        return jsonResponse(agent);
    }

    // 2. Skill Registry: GET /api/agentsam/skills
    if (path === '/api/agentsam/skills' && method === 'GET') {
        const skills = await getAgentSkills(env);
        return jsonResponse(skills);
    }

    // 3. Invocation Audit: GET /api/agentsam/invocations
    if (path === '/api/agentsam/invocations' && method === 'GET') {
        const invocations = await getInvocations(env);
        return jsonResponse(invocations);
    }

    // 4. Prompt Registry: GET /api/agentsam/prompts/:group
    if (path.startsWith('/api/agentsam/prompts') && method === 'GET') {
        const parts = path.split('/');
        const group = parts[parts.length - 1]; // e.g. coding
        
        if (group === 'prompts') {
            // General list
            const sql = "SELECT id, category, weight, is_active FROM ai_prompts_library ORDER BY category ASC";
            const res = await db.d1_query({ sql }, env);
            return jsonResponse(res.results || []);
        }

        // Specific weighted selection test
        const prompt = await getActivePromptByWeight(env, group);
        return jsonResponse(prompt);
    }

    return null;
}

/**
 * Performs a surgical lookup of a managed agent by its role or ID.
 */
export async function getAgentMetadata(env, roleOrId) {
    const sql = `
        SELECT * FROM agentsam_ai 
        WHERE (id = ? OR role_name = ?) AND status = 'active'
        LIMIT 1
    `;
    const res = await db.d1_query({ sql, params: [roleOrId, roleOrId] }, env);
    
    if (res.error) return { error: res.error };
    if (!res.results?.length) return { error: `Agent not found: ${roleOrId}` };

    const agent = res.results[0];
    
    // Parse JSON policies
    agent.model_policy = JSON.parse(agent.model_policy_json || '{}');
    agent.cost_policy = JSON.parse(agent.cost_policy_json || '{}');
    agent.memory_policy = JSON.parse(agent.memory_policy_json || '{}');
    agent.tool_permissions = JSON.parse(agent.tool_permissions_json || '{}');

    return agent;
}

/**
 * Fetches all active managed skills for Agent Sam.
 */
export async function getAgentSkills(env) {
    const sql = "SELECT * FROM agentsam_skill WHERE is_active = 1 ORDER BY sort_order ASC";
    const res = await db.d1_query({ sql }, env);
    return res.results || [];
}

/**
 * Records a skill invocation for auditing and spent-ledger calibration.
 */
export async function logSkillInvocation(env, data) {
    const sql = `
        INSERT INTO agentsam_skill_invocation 
        (skill_id, conversation_id, trigger_method, input_summary, success, error_message, duration_ms, model_used, tokens_in, tokens_out, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    return await db.d1_write({
        sql,
        params: [
            data.skillId,
            data.conversationId,
            data.triggerMethod || 'auto',
            data.inputSummary,
            data.success ? 1 : 0,
            data.errorMessage || null,
            data.durationMs || 0,
            data.modelUsed,
            data.tokensIn || 0,
            data.tokensOut || 0,
            data.costUsd || 0
        ]
    }, env);
}

/**
 * A/B Testing Engine: Selects an active prompt from a group based on weights.
 */
export async function getActivePromptByWeight(env, groupKey) {
    const sql = `
        SELECT * FROM ai_prompts_library 
        WHERE category = ? AND is_active = 1
    `;
    const res = await db.d1_query({ sql, params: [groupKey] }, env);
    const prompts = res.results || [];

    if (!prompts.length) return null;
    if (prompts.length === 1) return prompts[0];

    // Weighted Random Selection
    const totalWeight = prompts.reduce((sum, p) => sum + (p.weight || 100), 0);
    let random = Math.random() * totalWeight;
    
    for (const prompt of prompts) {
        if (random < (prompt.weight || 100)) return prompt;
        random -= (prompt.weight || 100);
    }

    return prompts[0]; // Fallback
}

/**
 * Retrieves a specific prompt by its ID with parsed metadata.
 */
export async function getPromptMetadata(env, promptId) {
    const sql = "SELECT * FROM ai_prompts_library WHERE id = ?";
    const res = await db.d1_query({ sql, params: [promptId] }, env);
    
    if (!res.results?.length) return null;
    const prompt = res.results[0];
    prompt.metadata = JSON.parse(prompt.metadata_json || '{}');
    return prompt;
}

/**
 * Retrieval for the spent ledger and audit trail.
 */
async function getInvocations(env) {
    const sql = "SELECT * FROM agentsam_skill_invocation ORDER BY invoked_at DESC LIMIT 100";
    const res = await db.d1_query({ sql }, env);
    return res.results || [];
}
