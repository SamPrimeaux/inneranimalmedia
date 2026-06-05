import { runAgentsamMemoryDecay } from '../../core/memory.js';
import { indexMemoryMarkdownToVectorize } from './index-memory-vectorize.js';
import { runKnowledgeDailySync } from './knowledge-daily-sync.js';
import { runWebhookEventsMaintenanceCron } from './webhook-events-maintenance.js';
import { writeDailySnapshot } from './write-daily-snapshot.js';

/**
 * 0 6 * * * — compact chats → R2 knowledge files → index stats → memory decay (worker.js chain).
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
export function scheduleSixAmRagJobs(env, ctx) {
  console.log('[cron] Starting daily doc sync (compact -> knowledge sync -> Vectorize index)');
  ctx.waitUntil(
    runKnowledgeDailySync(env)
      .then((r) => {
        if (r.memory_key || r.priorities_key) {
          console.log('[cron] knowledge sync:', r.memory_key, r.priorities_key);
        }
      })
      .then(() => indexMemoryMarkdownToVectorize(env))
      .then((r) => {
        console.log('[cron] RAG index-memory:', r?.chunks ?? 0, 'chunks from', r?.indexed ?? 0, 'keys');
      })
      .then(() => runAgentsamMemoryDecay(env))
      .catch((e) => console.error('[cron] RAG sync failed:', e?.message || e)),
  );
  ctx.waitUntil(runWebhookEventsMaintenanceCron(env));
  ctx.waitUntil(writeDailySnapshot(env, 'cron_6am').catch(() => {}));
}
