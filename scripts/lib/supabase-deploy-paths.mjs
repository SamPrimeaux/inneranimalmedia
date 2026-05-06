import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function repoRoot() {
  return resolve(__dirname, '..', '..');
}

export const DEPLOY_CONTEXT_FILE = '.deploy-run-context.json';
export const DEPLOY_WORKER_STATS_FILE = '.deploy-worker-stats.json';
export const DEPLOY_EVAL_RESULTS_FILE = '.deploy-eval-results.json';
export const DEPLOY_TOOL_EVENTS_FILE = '.deploy-tool-events.jsonl';
