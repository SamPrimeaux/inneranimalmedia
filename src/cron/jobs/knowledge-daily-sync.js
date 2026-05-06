import { cronTenantId } from '../cron-tenant.js';

export async function runKnowledgeDailySync(env) {
  const today = new Date().toISOString().slice(0, 10);
  if (!env.R2) return { memory_key: '', priorities_key: '' };

  let memoryMd = `# Agent memory (high importance) -- ${today}\n\n`;
  const ksTid = cronTenantId(env);
  if (env.DB && ksTid) {
    try {
      const r = await env.DB.prepare(
        "SELECT key, value, importance_score FROM agentsam_memory WHERE importance_score >= 7 AND tenant_id = ? ORDER BY importance_score DESC"
      ).bind(ksTid).all();
      for (const row of (r.results || [])) {
        memoryMd += `## ${row.key} (score: ${row.importance_score})\n${(row.value || '').trim()}\n\n`;
      }
      await env.R2.put(`knowledge/memory/daily-${today}.md`, memoryMd, { httpMetadata: { contentType: 'text/markdown' } });
    } catch (e) {
      console.warn('[knowledge/daily] memory', e?.message);
    }
  }

  let prioritiesMd = `# Current priorities (active roadmap steps) -- ${today}\n\n`;
  if (env.DB) {
    try {
      const r = await env.DB.prepare(
        "SELECT id, title, status, order_index, description FROM roadmap_steps WHERE plan_id = 'plan_iam_dashboard_v1' AND status IN ('in_progress', 'not_started') ORDER BY order_index"
      ).all();
      for (const row of (r.results || [])) {
        prioritiesMd += `- **${(row.title || row.id || '').replace(/\*\*/g, '')}** (${row.status}) ${(row.description || '').slice(0, 200)}\n`;
      }
      await env.R2.put('knowledge/priorities/current.md', prioritiesMd, { httpMetadata: { contentType: 'text/markdown' } });
    } catch (e) {
      console.warn('[knowledge/priorities]', e?.message);
    }
  }

  return { memory_key: `knowledge/memory/daily-${today}.md`, priorities_key: 'knowledge/priorities/current.md' };
}
