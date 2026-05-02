/**
 * InnerAutodidact / IAM — dynamic provisioning, billing plan resolution, BYOK, bridge keys.
 * Idempotent writes; no hardcoded workspace or tenant defaults.
 */

import { getAESKey, aesGcmDecryptFromB64, aesGcmEncryptToB64 } from '../core/crypto-vault.js';

const STARTER_COURSE_ID = 'course-modern-tech-foundations';

/** Deterministic workspace primary key from tenant id (no random). */
export function workspaceSlugFromTenantId(tenantId) {
  const tail = String(tenantId || '')
    .replace('tenant_', '')
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 36);
  return ('ws_' + tail).slice(0, 40);
}

/**
 * Ensure auth_users.tenant_id and optional tenants row exist.
 * @returns {Promise<string|null>}
 */
export async function ensureTenantForUser(env, userId, email) {
  if (!env?.DB || !userId) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT tenant_id, email FROM auth_users WHERE id = ? LIMIT 1`,
    )
      .bind(userId)
      .first();
    if (row?.tenant_id != null && String(row.tenant_id).trim() !== '') {
      return String(row.tenant_id).trim();
    }
    const em = String(email || row?.email || '').trim();
    const local = em.includes('@') ? em.split('@')[0] : em || 'user';
    const tenantId = `tenant_${local.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20)}_${crypto.randomUUID().slice(0, 8)}`;

    try {
      await env.DB.prepare(
        `INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, unixepoch(), unixepoch())`,
      )
        .bind(tenantId, em || tenantId)
        .run();
    } catch (e) {
      try {
        await env.DB.prepare(`INSERT INTO tenants (id, name, created_at) VALUES (?, ?, unixepoch())`)
          .bind(tenantId, em || tenantId)
          .run();
      } catch (e2) {
        console.warn('[ensureTenantForUser] tenants insert:', e2?.message ?? e2);
      }
    }

    await env.DB.prepare(
      `UPDATE auth_users SET tenant_id = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(tenantId, userId)
      .run();
    return tenantId;
  } catch (e) {
    console.warn('[ensureTenantForUser]', e?.message ?? e);
    return null;
  }
}

/**
 * Idempotent post-auth provisioning.
 * @param {object} opts
 * @param {string} opts.userId — auth_users.id
 * @param {string} [opts.email]
 * @param {string} [opts.tenantId] — if omitted, resolved from auth_users / ensureTenantForUser
 * @param {string} [opts.planId='free']
 */
export async function provisionUserWorkspace(env, { userId, email, tenantId: tenantIdOpt = null, planId = 'free' }) {
  if (!env?.DB || !userId) {
    return { workspaceId: null, provisioned: false, reason: 'no_db_or_user' };
  }

  const em = String(email || '').trim();
  let tenantId =
    tenantIdOpt != null && String(tenantIdOpt).trim() !== ''
      ? String(tenantIdOpt).trim()
      : null;

  if (!tenantId) tenantId = await ensureTenantForUser(env, userId, em);
  if (!tenantId) {
    const tr = await env.DB.prepare(`SELECT tenant_id FROM auth_users WHERE id = ? LIMIT 1`).bind(userId).first();
    tenantId = tr?.tenant_id != null ? String(tr.tenant_id).trim() : null;
  }
  if (!tenantId) {
    return { workspaceId: null, provisioned: false, reason: 'no_tenant' };
  }

  const wsSlug = workspaceSlugFromTenantId(tenantId);
  let hadExistingWs = false;

  try {
    const existingWs = await env.DB.prepare(
      `SELECT id FROM agentsam_workspace WHERE tenant_id = ? LIMIT 1`,
    )
      .bind(tenantId)
      .first();

    const workspaceId = existingWs?.id ? String(existingWs.id) : wsSlug;
    hadExistingWs = !!existingWs?.id;

    if (!existingWs?.id) {
      const displayName = `${em.split('@')[0]?.replace(/[^a-z0-9\s]/gi, ' ')?.trim() || 'My'} Workspace`;

      try {
        await env.DB.prepare(
          `INSERT INTO agentsam_workspace
             (id, workspace_slug, tenant_id, name, root_path, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, 'active', datetime('now'), datetime('now'))`,
        )
          .bind(workspaceId, wsSlug, tenantId, displayName)
          .run();
      } catch (e1) {
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO workspaces (id, name, handle, status, category, created_at)
             VALUES (?, ?, ?, 'active', 'personal', unixepoch())`,
          )
            .bind(workspaceId, displayName, wsSlug.replace(/^ws_/, ''))
            .run();
        } catch (_) {}
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO agentsam_workspace (id, tenant_id, display_name, created_at, updated_at)
             VALUES (?, ?, ?, unixepoch(), unixepoch())`,
          )
            .bind(workspaceId, tenantId, displayName)
            .run();
        } catch (e2) {
          try {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO agentsam_workspace (workspace_id, display_name, created_at)
               VALUES (?, ?, unixepoch())`,
            )
              .bind(workspaceId, displayName)
              .run();
          } catch (e3) {
            console.warn('[provisionUserWorkspace] agentsam_workspace:', e3?.message ?? e3);
          }
        }
      }
    }

    const existingTw = await env.DB.prepare(
      `SELECT id FROM tenant_workspaces WHERE tenant_id = ? AND workspace_id = ? LIMIT 1`,
    )
      .bind(tenantId, workspaceId)
      .first();

    if (!existingTw) {
      const twId = `tws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      try {
        await env.DB.prepare(
          `INSERT INTO tenant_workspaces
             (id, tenant_id, workspace_id, role, is_default, is_active, created_at, updated_at)
           VALUES (?, ?, ?, 'owner', 1, 1, unixepoch(), unixepoch())`,
        )
          .bind(twId, tenantId, workspaceId)
          .run();
      } catch (e) {
        try {
          await env.DB.prepare(
            `INSERT INTO tenant_workspaces
               (tenant_id, workspace_id, role, is_default, is_active, created_at, updated_at)
             VALUES (?, ?, 'owner', 1, 1, unixepoch(), unixepoch())`,
          )
            .bind(tenantId, workspaceId)
            .run();
        } catch (e2) {
          console.warn('[provisionUserWorkspace] tenant_workspaces:', e2?.message ?? e2);
        }
      }
    }

    const existingSub = await env.DB.prepare(
      `SELECT id FROM billing_subscriptions WHERE tenant_id = ? LIMIT 1`,
    )
      .bind(tenantId)
      .first();

    if (!existingSub) {
      try {
        await env.DB.prepare(
          `INSERT INTO billing_subscriptions
             (tenant_id, plan_id, status, started_at, created_at, updated_at)
           VALUES (?, ?, 'active', unixepoch(), datetime('now'), datetime('now'))`,
        )
          .bind(tenantId, planId)
          .run();
      } catch (e) {
        console.warn('[provisionUserWorkspace] billing_subscriptions:', e?.message ?? e);
      }
    }

    const onboardProbe = await env.DB.prepare(
      `SELECT id FROM onboarding_state WHERE tenant_id = ? LIMIT 1`,
    )
      .bind(tenantId)
      .first();

    if (!onboardProbe) {
      const completedSteps = JSON.stringify(['auth', 'create_tenant']);
      let onboardOk = false;
      try {
        await env.DB.prepare(
          `INSERT INTO onboarding_state
             (tenant_id, user_id, current_step, completed_steps_json, workspace_id, started_at, updated_at)
           VALUES (?, ?, 'choose_preset', ?, ?, unixepoch(), unixepoch())`,
        )
          .bind(tenantId, userId, completedSteps, workspaceId)
          .run();
        onboardOk = true;
      } catch (_) {
        /* LMS columns may not exist — fall back to step_key schema */
      }
      if (!onboardOk) {
        const obstId = `obst_${tenantId}_choose_preset`.slice(0, 120);
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO onboarding_state
               (id, tenant_id, step_key, status, meta_json, completed_at, created_at, updated_at)
             VALUES (?, ?, 'choose_preset', 'pending', ?, NULL, unixepoch(), unixepoch())`,
          )
            .bind(obstId, tenantId, JSON.stringify({ user_id: userId, email: em, workspace_id: workspaceId }))
            .run();
        } catch (e) {
          console.warn('[provisionUserWorkspace] onboarding_state:', e?.message ?? e);
        }
      }
    }

    const existingEnroll = await env.DB.prepare(
      `SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1`,
    )
      .bind(userId, STARTER_COURSE_ID)
      .first();

    if (!existingEnroll) {
      const enrId = `enr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      try {
        await env.DB.prepare(
          `INSERT INTO enrollments
             (id, user_id, course_id, tenant_id, status, enrolled_at, created_at)
           VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`,
        )
          .bind(enrId, userId, STARTER_COURSE_ID, tenantId)
          .run();
      } catch (e) {
        try {
          await env.DB.prepare(
            `INSERT INTO enrollments (user_id, course_id, tenant_id, status, enrolled_at, created_at)
             VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))`,
          )
            .bind(userId, STARTER_COURSE_ID, tenantId)
            .run();
        } catch (e2) {
          console.warn('[provisionUserWorkspace] enrollments:', e2?.message ?? e2);
        }
      }
    }

    return {
      workspaceId,
      tenantId,
      provisioned: !hadExistingWs,
    };
  } catch (e) {
    console.warn('[provisionUserWorkspace]', e?.message ?? e);
    return { workspaceId: null, provisioned: false, reason: String(e?.message || e) };
  }
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(String(text || ''));
  } catch (_) {
    return fallback;
  }
}

/**
 * Resolved subscription + plan metadata for model routing and feature gates.
 */
export async function getUserPlan(env, tenantId) {
  if (!env?.DB || !tenantId) {
    return {
      plan_id: 'free',
      features: {},
      free_models: [],
      allows_byok: false,
      allows_usage_billing: false,
      limits: {},
    };
  }

  try {
    const sub = await env.DB.prepare(
      `SELECT bs.plan_id, bp.features_json, bp.monthly_token_limit,
              bp.daily_request_limit, bp.max_concurrency,
              bp.allows_byok, bp.allows_usage_billing, bp.free_tier_models_json
       FROM billing_subscriptions bs
       JOIN billing_plans bp ON bp.id = bs.plan_id
       WHERE bs.tenant_id = ? AND bs.status = 'active'
       LIMIT 1`,
    )
      .bind(tenantId)
      .first();

    if (!sub) {
      const freePlan = await env.DB.prepare(`SELECT * FROM billing_plans WHERE id = ? LIMIT 1`)
        .bind('free')
        .first();
      return {
        plan_id: 'free',
        features: safeJsonParse(freePlan?.features_json, {}),
        free_models: safeJsonParse(freePlan?.free_tier_models_json, []),
        allows_byok: !!freePlan?.allows_byok,
        allows_usage_billing: !!freePlan?.allows_usage_billing,
        limits: {
          monthly_tokens: freePlan?.monthly_token_limit ?? null,
          daily_requests: freePlan?.daily_request_limit ?? null,
          concurrency: freePlan?.max_concurrency ?? null,
        },
      };
    }

    return {
      plan_id: sub.plan_id,
      features: safeJsonParse(sub.features_json, {}),
      free_models: safeJsonParse(sub.free_tier_models_json, []),
      allows_byok: !!sub.allows_byok,
      allows_usage_billing: !!sub.allows_usage_billing,
      limits: {
        monthly_tokens: sub.monthly_token_limit,
        daily_requests: sub.daily_request_limit,
        concurrency: sub.max_concurrency,
      },
    };
  } catch (e) {
    console.warn('[getUserPlan]', e?.message ?? e);
    try {
      const freePlan = await env.DB.prepare(`SELECT * FROM billing_plans WHERE id = 'free' LIMIT 1`).first();
      return {
        plan_id: 'free',
        features: safeJsonParse(freePlan?.features_json, {}),
        free_models: safeJsonParse(freePlan?.free_tier_models_json, []),
        allows_byok: false,
        allows_usage_billing: false,
        limits: {},
      };
    } catch (_) {
      return {
        plan_id: 'free',
        features: {},
        free_models: [],
        allows_byok: false,
        allows_usage_billing: false,
        limits: {},
      };
    }
  }
}

/**
 * Decrypt BYOK secret from user_api_keys.key_hash (AES-GCM blob, vault layout).
 */
export async function getUserBYOKey(env, userId, tenantId, provider) {
  if (!env?.DB || !userId || !tenantId || !provider) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT key_hash, key_preview FROM user_api_keys
       WHERE tenant_id = ? AND user_id = ? AND provider = ? AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
    )
      .bind(tenantId, userId, provider)
      .first();

    if (!row?.key_hash) return null;

    const aesKey = await getAESKey(env, ['decrypt']);
    const decrypted = await aesGcmDecryptFromB64(row.key_hash, aesKey);
    return { key: decrypted, preview: row.key_preview ?? null };
  } catch (e) {
    console.warn('[getUserBYOKey]', e?.message ?? e);
    return null;
  }
}

/** SHA-256 hex digest for bridge keys (never store raw). */
export async function hashBridgeKey(key) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(key || '')));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create per-user bridge key row; returns raw key once (caller must show UI once).
 */
export async function generateUserBridgeKey(env, userId, tenantId) {
  if (!env?.DB || !userId || !tenantId) throw new Error('generateUserBridgeKey: missing DB, user, or tenant');

  const raw = `iamb_${crypto.randomUUID().replace(/-/g, '')}`;
  const hash = await hashBridgeKey(raw);
  const connId = `conn_${userId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}_${crypto.randomUUID().slice(0, 6)}`;

  const attempts = [
    () =>
      env.DB.prepare(
        `INSERT INTO terminal_connections
           (id, name, type, ws_url, connection_type, user_id, tenant_id, bridge_key_hash, is_default, is_active, created_at)
         VALUES (?, 'IAM Bridge', 'pty', '', 'pty_tunnel', ?, ?, ?, 0, 0, unixepoch())`,
      )
        .bind(connId, userId, tenantId, hash)
        .run(),
    () =>
      env.DB.prepare(
        `INSERT INTO terminal_connections
           (id, name, type, ws_url, user_id, tenant_id, bridge_key_hash, is_default, is_active, created_at)
         VALUES (?, 'IAM Bridge', 'pty', '', ?, ?, ?, 0, 0, unixepoch())`,
      )
        .bind(connId, userId, tenantId, hash)
        .run(),
    () =>
      env.DB.prepare(
        `INSERT INTO terminal_connections
           (id, name, type, ws_url, bridge_key_hash, is_default, is_active, created_at)
         VALUES (?, 'IAM Bridge', 'pty', '', ?, 0, 0, unixepoch())`,
      )
        .bind(connId, hash)
        .run(),
    () =>
      env.DB.prepare(
        `INSERT INTO terminal_connections
           (id, name, type, ws_url, auth_token_secret_name, is_default, is_active, created_at)
         VALUES (?, 'IAM Bridge', 'pty', '', ?, 0, 0, unixepoch())`,
      )
        .bind(connId, `bridge_sha256:${hash}`)
        .run(),
  ];

  let lastErr = null;
  for (const run of attempts) {
    try {
      await run();
      return raw;
    } catch (e) {
      lastErr = e;
    }
  }
  console.warn('[generateUserBridgeKey] all variants failed:', lastErr?.message ?? lastErr);
  throw lastErr || new Error('terminal_connections insert failed');
}

/**
 * Encrypt API key for storage in user_api_keys.key_hash (BYOK upload path).
 */
export async function encryptApiKeyForStorage(env, plaintext) {
  const aesKey = await getAESKey(env, ['encrypt']);
  return aesGcmEncryptToB64(plaintext, aesKey);
}

/**
 * Map ai_models.api_platform to user_api_keys.provider slug for BYOK lookup.
 */
export function byokProviderSlugFromApiPlatform(apiPlatform) {
  const p = String(apiPlatform || '').trim();
  if (p === 'anthropic_api') return 'anthropic';
  if (p === 'openai' || p === 'cursor') return 'openai';
  if (p === 'gemini_api' || p === 'vertex_ai' || p === 'google_ai') return 'google_ai';
  return null;
}

function modelMatchesFreeTierList(modelKey, freeModels) {
  const mk = String(modelKey || '').trim();
  if (!mk) return false;
  const list = Array.isArray(freeModels) ? freeModels.map(String) : [];
  for (const f of list) {
    if (!f) continue;
    if (f === mk) return true;
    if (mk.includes(f) || f.includes(mk)) return true;
  }
  return false;
}

/**
 * Plan / BYOK gate for chat SSE. Returns either { allowed: true, ... } or { allowed: false, status, body }.
 * Free tier: Workers AI models listed in billing_plans.free_tier_models_json; Ollama allowed.
 * Paid / usage: platform keys when plan is not free or usage billing is enabled.
 * BYOK: when plan allows and user has stored key for the provider.
 */
export async function evaluatePlanForModelRequest(env, { tenantId, userId, modelKey, apiPlatform }) {
  const plan = await getUserPlan(env, tenantId);
  const mk = String(modelKey || '').trim();
  const plat = String(apiPlatform || '').trim();
  const freeModels = Array.isArray(plan.free_models) ? plan.free_models : [];

  const isWorkersAi = plat === 'workers_ai' || mk.startsWith('@cf/');
  const isOllama = plat === 'ollama' || mk === 'ollama/local' || /ollama/i.test(mk);

  if (isOllama) {
    return { allowed: true, billingSource: 'ollama', byokApiKey: null };
  }

  if (isWorkersAi) {
    if (modelMatchesFreeTierList(mk, freeModels)) {
      return { allowed: true, billingSource: 'platform_workers_ai', byokApiKey: null };
    }
    return {
      allowed: false,
      status: 402,
      body: {
        error: 'Model not available on your plan',
        upgrade_url: '/dashboard/settings/billing',
        free_models: freeModels,
      },
    };
  }

  const byokSlug = byokProviderSlugFromApiPlatform(plat);
  if (plan.allows_byok && userId && byokSlug) {
    const u = await getUserBYOKey(env, userId, tenantId, byokSlug);
    if (u?.key) {
      return { allowed: true, billingSource: 'byok', byokApiKey: u.key, byokProvider: byokSlug };
    }
  }

  const paidPlan = plan.plan_id && plan.plan_id !== 'free';
  if (paidPlan || plan.allows_usage_billing) {
    return { allowed: true, billingSource: 'platform_subscription', byokApiKey: null };
  }

  return {
    allowed: false,
    status: 402,
    body: {
      error: 'Model not available on your plan',
      upgrade_url: '/dashboard/settings/billing',
      free_models: freeModels,
    },
  };
}

/**
 * Request-scoped env proxy so chat helpers read BYOK without threading keys through every caller.
 */
export function envWithLlmKeyOverride(env, billingGate, apiPlatform) {
  if (!billingGate?.byokApiKey || billingGate.billingSource !== 'byok') return env;
  const k = billingGate.byokApiKey;
  const plat = String(apiPlatform || '').trim();
  if (plat === 'anthropic_api') {
    return new Proxy(env, {
      get(target, prop, receiver) {
        if (prop === 'ANTHROPIC_API_KEY') return k;
        return Reflect.get(target, prop, receiver);
      },
    });
  }
  if (plat === 'openai' || plat === 'cursor') {
    return new Proxy(env, {
      get(target, prop, receiver) {
        if (prop === 'OPENAI_API_KEY') return k;
        return Reflect.get(target, prop, receiver);
      },
    });
  }
  if (plat === 'gemini_api' || plat === 'vertex_ai') {
    return new Proxy(env, {
      get(target, prop, receiver) {
        if (prop === 'GOOGLE_AI_API_KEY' || prop === 'GEMINI_API_KEY') return k;
        return Reflect.get(target, prop, receiver);
      },
    });
  }
  return env;
}
