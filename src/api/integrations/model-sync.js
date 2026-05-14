/**
 * Best-effort agentsam_ai sync after user BYOK save. Failures are logged only.
 */
function genModelId(provider, modelKey) {
  const h = modelKey.replace(/[^a-z0-9]+/gi, '_').slice(0, 80);
  return `mdl_${provider}_${h}`.slice(0, 120);
}

/**
 * @param {any} env
 * @param {string} provider
 * @param {string} apiKey
 * @param {{ tenantId?: string | null, createdBy?: string | null }} [meta] — required for D1 agentsam_ai NOT NULL columns on remote
 */
export async function syncProviderModels(env, provider, apiKey, meta = {}) {
  if (!env?.DB || !apiKey) return;
  const p = String(provider || '').trim();
  const tenantId = String(meta.tenantId || env.TENANT_ID || '').trim();
  if (!tenantId) {
    console.warn('[model-sync] skip syncProviderModels: no tenant_id (pass meta.tenantId or env.TENANT_ID)');
    return;
  }
  const createdBy = String(meta.createdBy || 'apikey_sync').trim() || 'apikey_sync';
  try {
    let models = [];
    if (p === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      const data = await res.json().catch(() => ({}));
      const arr = data?.data || data?.models || [];
      models = (Array.isArray(arr) ? arr : []).map((m) => ({
        key: m.id || m.name || '',
        name: m.display_name || m.name || m.id || '',
      }));
    } else if (p === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json().catch(() => ({}));
      models = (data?.data || []).map((m) => ({
        key: m.id || '',
        name: m.id || '',
      }));
    } else if (p === 'google_ai') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`,
      );
      const data = await res.json().catch(() => ({}));
      models = (data?.models || []).map((m) => ({
        key: (m.name || '').replace(/^models\//, ''),
        name: (m.displayName || m.name || '').replace(/^models\//, ''),
      }));
    } else {
      return;
    }
    for (const m of models) {
      if (!m.key) continue;
      const id = genModelId(p, m.key);
      const display = String(m.name || m.key || '').trim() || m.key;
      await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_ai (
           id, tenant_id, name, role_name, mode, safety_level, tenant_scope, created_by,
           provider, model_key, display_name, billing_unit, show_in_picker, picker_eligible, api_platform, pricing_unit, status
         ) VALUES (?, ?, ?, ?, 'model', 'strict', 'multi_tenant', ?, ?, ?, ?, 'tokens', 1, 1, ?, 'usd_per_mtok', 'active')`,
      )
        .bind(id, tenantId, display, display, createdBy, p, m.key, display, p)
        .run()
        .catch(() => {});
    }
    await env.DB.prepare(
      `UPDATE agentsam_ai SET show_in_picker = 1, updated_at = unixepoch() WHERE provider = ?`,
    )
      .bind(p)
      .run()
      .catch(() => {});
  } catch (e) {
    console.warn('[model-sync] syncProviderModels', p, e?.message || e);
  }
}
