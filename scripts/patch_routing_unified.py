#!/usr/bin/env python3
"""
patch_routing_unified.py — replaces the double Thompson call pattern with
a single resolveRoutingArm() that does one JOIN query covering:
  agentsam_routing_arms + agentsam_model_catalog + agentsam_ai + agentsam_model_routing_memory

Target: src/core/routing.js
Also patches: src/api/agent.js call sites
"""
from pathlib import Path

ROUTING = Path("src/core/routing.js")
AGENT   = Path("src/api/agent.js")

# ── 1. Add resolveRoutingArm to routing.js ────────────────────────────────────

NEW_FUNCTION = '''
/**
 * UNIFIED routing resolution — replaces the double getDefaultModelForTask +
 * selectThompsonArm pattern. One JOIN query, one flag check, one ai lookup.
 *
 * D1 reads per call (typical):
 *   1 — arms + catalog + ai + routing_memory JOIN
 *   1 — feature flag (thompson_sampling)
 *   0 — no per-arm loops, no separate PRAGMA, no duplicate scans
 *
 * Returns the same shape as getDefaultModelForTask for drop-in compatibility.
 *
 * @param {object} env
 * @param {{ taskType: string, mode: string, workspaceId: string,
 *            routeKey?: string|null, toolRequired?: boolean,
 *            userId?: string, tenantId?: string }} ctx
 */
export async function resolveRoutingArm(env, ctx = {}) {
  const db = env?.DB;
  if (!db) return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'no_db' };

  const ws       = ctx.workspaceId != null ? String(ctx.workspaceId).trim() : '';
  const tt       = ctx.taskType    != null ? String(ctx.taskType).trim()    : 'chat';
  const mode     = ctx.mode        != null ? String(ctx.mode).trim()        : 'auto';
  const toolReq  = ctx.toolRequired ? 1 : 0;

  if (!ws) return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'missing_workspace' };

  try {
    // ── 1. Single JOIN: arms × catalog × ai × routing_memory ─────────────────
    const toolsClause = toolReq ? ' AND ra.supports_tools = 1' : '';
    const sql = `
      SELECT
        ra.id, ra.model_key, ra.fallback_model_key,
        ra.success_alpha, ra.success_beta, ra.decayed_score,
        ra.priority, ra.tools_json, ra.workspace_id,
        ai.id   AS ai_model_id,
        ai.api_platform,
        COALESCE(mrm.success_rate, 0.5)   AS prior_success_rate,
        COALESCE(mrm.avg_latency_ms, 0)   AS prior_latency_ms,
        COALESCE(mrm.sample_n, 0)         AS prior_sample_n
      FROM agentsam_routing_arms ra
      JOIN agentsam_model_catalog mc
        ON mc.model_key = ra.model_key
       AND mc.is_active  = 1
       AND mc.is_degraded = 0
      JOIN agentsam_ai ai
        ON ai.model_key = ra.model_key
       AND ai.mode      = 'model'
       AND ai.status    = 'active'
       AND ai.is_global = 1
      LEFT JOIN agentsam_model_routing_memory mrm
        ON mrm.model_key    = ra.model_key
       AND mrm.workspace_id = ra.workspace_id
       AND mrm.task_type    = ra.task_type
      WHERE ra.task_type      = ?
        AND ra.mode           = ?
        AND ra.workspace_id   = ?
        AND ra.is_active      = 1
        AND ra.is_eligible    = 1
        AND ra.is_paused      = 0
        AND ra.budget_exhausted = 0
        ${toolsClause}
        AND lower(trim(ra.model_key)) != 'gpt-5.5'
      ORDER BY ra.decayed_score DESC, COALESCE(ra.priority,0) DESC
      LIMIT 40
    `;

    let arms = (await db.prepare(sql).bind(tt, mode, ws).all().catch(() => ({ results: [] }))).results || [];

    // Fallback to global arms if workspace returned nothing
    if (!arms.length) {
      const sqlGlobal = sql.replace(
        'AND ra.workspace_id   = ?',
        "AND COALESCE(TRIM(ra.workspace_id),'') = ''"
      );
      // global query doesn't bind workspace
      const binds = toolReq ? [tt, mode] : [tt, mode];
      arms = (await db.prepare(sqlGlobal).bind(...binds).all().catch(() => ({ results: [] }))).results || [];
    }

    if (!arms.length) {
      return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'no_eligible_arms' };
    }

    // ── 2. Single flag check (cached in KV if available) ─────────────────────
    const useThompson = await isThompsonRoutingSamplingEnabled(env, {
      userId:   ctx.userId,
      tenantId: ctx.tenantId,
    });

    // ── 3. Thompson selection with routing_memory priors blended in ───────────
    let selectedArm;
    if (useThompson) {
      // Blend prior success_rate into Beta params if we have samples
      const enriched = arms.map(arm => {
        const n = Number(arm.prior_sample_n) || 0;
        if (n < 5) return arm; // not enough data, use raw bandit params
        const sr    = Math.max(0.05, Math.min(0.95, Number(arm.prior_success_rate) || 0.5));
        const pseudo = Math.min(n, 20); // cap blending weight
        return {
          ...arm,
          success_alpha: Math.max(1e-6, Number(arm.success_alpha ?? 1) + Math.round(sr * pseudo)),
          success_beta:  Math.max(1e-6, Number(arm.success_beta  ?? 1) + Math.round((1 - sr) * pseudo)),
        };
      });
      selectedArm = pickRoutingArmByThompson(enriched);
    } else {
      selectedArm = arms[0];
    }

    if (!selectedArm?.model_key) {
      return { modelId: null, armId: null, source: 'fallback', fallbackReason: 'no_arm_selected' };
    }

    const modelId = selectedArm.ai_model_id
      ? String(selectedArm.ai_model_id).trim()
      : null;

    if (!modelId) {
      return {
        modelId:          null,
        armId:            selectedArm.id || null,
        source:           'fallback',
        fallbackReason:   'arm_missing_ai_model_id',
        fallbackModelKey: selectedArm.fallback_model_key || selectedArm.model_key,
      };
    }

    return {
      modelId,
      armId:            selectedArm.id || null,
      modelKey:         selectedArm.model_key,
      apiPlatform:      selectedArm.api_platform ?? null,
      fallbackModelKey: selectedArm.fallback_model_key || null,
      source:           'thompson',
    };

  } catch (e) {
    console.warn('[routing] resolveRoutingArm failed:', e?.message ?? e);
    return { modelId: null, armId: null, source: 'fallback', fallbackReason: String(e?.message ?? 'error') };
  }
}
'''

routing_text = ROUTING.read_text()

# Add after getDefaultModelForTask export (find its end)
MARKER = "export async function loadChatRoutingArmsModelKeyOrder"
if MARKER not in routing_text:
    print(f"ERROR: could not find insertion marker in {ROUTING}")
    exit(1)

if "resolveRoutingArm" in routing_text:
    print("resolveRoutingArm already present — skipping routing.js insert")
else:
    routing_text = routing_text.replace(MARKER, NEW_FUNCTION + "\n" + MARKER)
    ROUTING.write_text(routing_text)
    print(f"✅ Added resolveRoutingArm to {ROUTING}")

# ── 2. Add to imports in routing.js (already exported above) ─────────────────
# Check it's exported
if "export async function resolveRoutingArm" not in routing_text:
    print("WARN: resolveRoutingArm not found as export after insert — check manually")

# ── 3. Patch agent.js — import resolveRoutingArm ─────────────────────────────
agent_text = AGENT.read_text()

OLD_IMPORT = "  getDefaultModelForTask,"
NEW_IMPORT = "  getDefaultModelForTask,\n  resolveRoutingArm,"

if "resolveRoutingArm" in agent_text:
    print("resolveRoutingArm already imported in agent.js — skipping import patch")
elif OLD_IMPORT not in agent_text:
    print("WARN: could not find getDefaultModelForTask import line — add resolveRoutingArm manually")
else:
    agent_text = agent_text.replace(OLD_IMPORT, NEW_IMPORT, 1)
    print(f"✅ Added resolveRoutingArm to imports in {AGENT}")

# ── 4. Patch agent.js — replace double call with single resolveRoutingArm ─────
# Find the double-call block:
# routingPick = await getDefaultModelForTask(...)
# ... (several lines)
# const thompsonPick = await selectThompsonArm(...)
# if (thompsonPick && (!routingPick || routingPick.source !== 'thompson')) { routingPick = thompsonPick; }

import re

double_call_pattern = re.compile(
    r'(  let routingPick = null;\s*try \{.*?routingPick = await getDefaultModelForTask\(env,\s*\{.*?\}\s*\);\s*\} catch[^}]+\}\s*)'
    r'(  const thompsonPick = await selectThompsonArm\(.*?\);\s*)'
    r'(  if \(thompsonPick && \(!routingPick \|\| routingPick\.source !== .thompson.\)\) \{\s*routingPick = thompsonPick;\s*\})',
    re.DOTALL
)

match = double_call_pattern.search(agent_text)
if not match:
    # Try simpler targeted replacement
    OLD_DOUBLE = """  const thompsonPick = await selectThompsonArm(
    env,
    intentResult.taskType,
    intentResult.mode || requestedMode,
    workspaceId,
    promptRouteRow?.route_key ?? null,
    { toolRequired: requireTools, userId, tenantId },
  );
  if (thompsonPick && (!routingPick || routingPick.source !== 'thompson')) {
    routingPick = thompsonPick;
  }"""

    if OLD_DOUBLE in agent_text:
        NEW_SINGLE = """  // Unified routing: resolveRoutingArm already ran getDefaultModelForTask+Thompson
  // in one JOIN query above — no second pass needed."""
        agent_text = agent_text.replace(OLD_DOUBLE, NEW_SINGLE, 1)
        print("✅ Removed redundant selectThompsonArm double-call from agent.js")
    else:
        print("WARN: double-call block not found by simple match — check agent.js lines 5207-5240 manually")
        print("      Remove the selectThompsonArm call and the if(thompsonPick) merge block manually.")
        print("      getDefaultModelForTask will be replaced by resolveRoutingArm in the next step.")
else:
    print("✅ Matched double-call pattern via regex")

# ── 5. Replace getDefaultModelForTask call with resolveRoutingArm ─────────────
OLD_GET_DEFAULT = """    routingPick = await getDefaultModelForTask(env, {
      taskKey: resolvedRoutingTaskType,
      tenantId,
      userId,"""

NEW_GET_DEFAULT = """    routingPick = await resolveRoutingArm(env, {
      taskType: resolvedRoutingTaskType,
      tenantId,
      userId,"""

if OLD_GET_DEFAULT in agent_text:
    agent_text = agent_text.replace(OLD_GET_DEFAULT, NEW_GET_DEFAULT, 1)
    print("✅ Replaced getDefaultModelForTask with resolveRoutingArm in agent.js")
elif "resolveRoutingArm" in agent_text and "getDefaultModelForTask" not in agent_text:
    print("Already using resolveRoutingArm — skipping")
else:
    print("WARN: getDefaultModelForTask call site not found by exact match")
    print("      Manually replace `await getDefaultModelForTask(env, { taskKey:` with")
    print("      `await resolveRoutingArm(env, { taskType:` around line 5207")

AGENT.write_text(agent_text)
print(f"\nPatched {AGENT}")
print("\nNext: npm run deploy — then re-run eval_pipeline_e2e.py to verify routing read count drops")
