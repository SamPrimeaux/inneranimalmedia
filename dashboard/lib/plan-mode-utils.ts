import type { AgentMode } from '../components/ChatAssistant/types';
import { AGENT_MODES } from '../components/ChatAssistant/types';

const PLAN_PREFIX_RE = /^\/plan\b\s*/i;

export function suggestPlanMode(text: string): boolean {
  const m = String(text || '').trim();
  if (!m || m.length < 12) return false;
  if (PLAN_PREFIX_RE.test(m)) return false;
  const words = m.split(/\s+/).filter(Boolean);
  if (words.length >= 12) return true;
  if (/\b(refactor|architect|migration|multi-?file|across|sprint|roadmap|strategy|redesign)\b/i.test(m)) {
    return true;
  }
  if (/\b(api|dashboard|worker|supabase|d1|schema|workflow)\b.*\b(and|plus|with)\b/i.test(m)) {
    return true;
  }
  const specific = /[/.`]|\.(js|ts|tsx|sql|md)\b|src\/|dashboard\//i.test(m);
  if (!specific && words.length >= 8) return true;
  return false;
}

export function nextAgentMode(current: AgentMode): AgentMode {
  const ids = AGENT_MODES.map((m) => m.id);
  const idx = ids.indexOf(current);
  const next = idx < 0 ? 0 : (idx + 1) % ids.length;
  return ids[next] || 'agent';
}

export function isPlanSlashMessage(text: string): boolean {
  return PLAN_PREFIX_RE.test(String(text || '').trim());
}
