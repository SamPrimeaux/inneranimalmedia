/**
 * InnerAnimalMedia — Worker Entry Point
 * main: src/index.js (wrangler.jsonc)
 *
 * Intentionally thin:
 *   fetch     → src/core/router.js
 *   scheduled → cron jobs
 *   queue     → production only (sandbox omits MY_QUEUE binding)
 *
 * DO class exports → src/core/durable_objects.js
 */
import { handleRequest }     from './core/router.js';
import { runHealthSnapshot } from './api/health.js';

// ─── Durable Object Exports ───────────────────────────────────────────────────
// Class names must match wrangler.jsonc durable_objects.bindings exactly.
export { IAMCollaborationSession, AgentChatSqlV1, ChessRoom }
  from './core/durable_objects.js';

// ─── Worker Export ────────────────────────────────────────────────────────────
export default {

  // ── HTTP ──────────────────────────────────────────────────────────────────
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Internal-Secret, X-Ingest-Secret, Cookie',
          'Access-Control-Max-Age':       '86400',
        },
      });
    }
    return handleRequest(request, env, ctx);
  },

  // ── Crons ─────────────────────────────────────────────────────────────────
  // 0 6 * * *    — daily summary email
  // 30 13 * * *  — afternoon health snapshot
  // 0 9 * * *    — morning health snapshot
  // */30 * * * * — rolling health snapshot
  // 0 0 * * *    — midnight rollup + cache compaction
  async scheduled(event, env, ctx) {
    const cron   = event.cron;
    const origin = (env.IAM_ORIGIN || '').replace(/\/$/, '');
    const secret = env.INGEST_SECRET || '';

    // Every 30 min + 9am + 1:30pm + midnight — health snapshot
    if (['*/30 * * * *', '0 9 * * *', '30 13 * * *', '0 0 * * *'].includes(cron)) {
      ctx.waitUntil(
        runHealthSnapshot(env, 'cron').catch(e => console.warn('[cron:health]', e?.message))
      );
    }

    // 6am — daily summary email
    if (cron === '0 6 * * *' && origin) {
      ctx.waitUntil(
        fetch(`${origin}/api/workflow/summary`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'X-Ingest-Secret': secret },
          body:    JSON.stringify({ trigger: 'daily_cron' }),
        }).catch(e => console.warn('[cron:summary]', e?.message))
      );
    }

    // Midnight — expire stale context cache
    if (cron === '0 0 * * *' && env.DB) {
      ctx.waitUntil(
        env.DB.prepare(`DELETE FROM ai_compiled_context_cache WHERE expires_at < unixepoch()`)
          .run().catch(() => {})
      );
    }
  },

  // ── Queue consumer (production only; sandbox wrangler.jsonc omits MY_QUEUE) ─
  async queue(batch, env, ctx) {
    const origin = (env.IAM_ORIGIN || '').replace(/\/$/, '');
    const secret = env.INGEST_SECRET || '';

    for (const msg of batch.messages) {
      try {
        const body = msg.body || {};
        const type = body.type || body.job_type || '';

        if ((type === 'screenshot' || type === 'scrape' || type === 'playwright') && origin) {
          await fetch(`${origin}/api/browser/invoke`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'X-Ingest-Secret': secret },
            body:    JSON.stringify({ tool: type, params: body }),
          });
        }

        msg.ack();
      } catch (e) {
        console.warn('[queue]', e?.message);
        msg.retry();
      }
    }
  },
};
