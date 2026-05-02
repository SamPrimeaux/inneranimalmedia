/**
 * Best-effort ai_models sync after user BYOK save. Failures are logged only.
 */
function genModelId(provider, modelKey) {
  const h = modelKey.replace(/[^a-z0-9]+/gi, '_').slice(0, 80);
  return `mdl_${provider}_${h}`.slice(0, 120);
}

export async function syncProviderModels(env, provider, apiKey) {
  if (!env?.DB || !apiKey) return;
  const p = String(provider || '').trim();
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
      await env.DB.prepare(
        `INSERT OR IGNORE INTO ai_models (id, provider, model_key, display_name, billing_unit, is_active, show_in_picker, picker_eligible, api_platform, pricing_unit)
         VALUES (?, ?, ?, ?, 'tokens', 1, 1, 1, ?, 'usd_per_mtok')`,
      )
        .bind(id, p, m.key, m.name || m.key, p)
        .run()
        .catch(() => {});
    }
    await env.DB.prepare(
      `UPDATE ai_models SET show_in_picker = 1, updated_at = unixepoch() WHERE provider = ?`,
    )
      .bind(p)
      .run()
      .catch(() => {});
  } catch (e) {
    console.warn('[model-sync] syncProviderModels', p, e?.message || e);
  }
}
