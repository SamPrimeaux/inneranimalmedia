// dashboard/features/agent-presence/iamDerivePresenceState.ts

import type { AgentPresenceState } from './iamPresenceStateMap';

export function derivePresenceState(event: Record<string, unknown>): AgentPresenceState {
  const type    = String(event?.type    || '').toLowerCase();
  const handler = String(event?.handler_type || event?.handler || '').toLowerCase();
  const tool    = String(event?.tool_name    || event?.name    || event?.tool || '').toLowerCase();
  const title   = String(event?.title        || event?.task_title || event?.message || '').toLowerCase();

  const signal = `${handler} ${tool} ${title}`;

  if (!type) return 'idle';

  // Lifecycle
  if (type === 'thinking_start' || type === 'thinking')           return 'thinking';
  if (type === 'plan_thinking'  || type === 'plan_created')       return 'planning';
  if (type === 'approval_required' || type === 'plan_confirmation_required') return 'waiting_approval';
  if (type === 'plan_complete'  || type === 'done' || type === 'complete')   return 'complete';
  if (type === 'error'          || type === 'tool_error' || type === 'failed') return 'failed';

  // task_start — handler_type is strongest signal
  if (type === 'task_start') {
    if (/terminal|shell|bash|exec|command/.test(signal))                      return 'terminal';
    if (/db_query|database|d1|sql|supabase|postgres|table/.test(signal))      return 'database';
    if (/browser|playwright|cdt|screenshot|navigate|click/.test(signal))      return 'browser';
    if (/image|thumbnail|media|visual.asset|generate.image/.test(signal))     return 'imaging';
    if (/excalidraw|diagram|draw|canvas|flowchart|wireframe/.test(signal))    return 'drawing';
    if (/r2|bucket|asset|upload|download|artifact|file.browser|storage/.test(signal)) return 'files';
    if (/monaco|write|create|save|edit|patch|diff/.test(signal))              return 'writing';
    if (/read|fetch|get|inspect|load|open|grep|search/.test(signal))          return 'reading';
    if (/mcp_tool|tool/.test(signal))                                         return 'tool';
    return 'thinking';
  }

  // tool_start — tool name carries semantic context
  if (type === 'tool_start') {
    if (/browser|playwright|cdt|navigate|screenshot|click|highlight|dom|css/.test(signal))        return 'browser';
    if (/terminal|shell|bash|run|exec|command|wrangler|npm|node|python|build|deploy/.test(signal)) return 'terminal';
    if (/d1|sql|supabase|postgres|database|query|table|schema|migration/.test(signal))            return 'database';
    if (/image|thumbnail|media|asset.preview|visual.asset|generate.image/.test(signal))           return 'imaging';
    if (/excalidraw|diagram|draw|canvas|flowchart|wireframe/.test(signal))                        return 'drawing';
    if (/r2|bucket|upload|download|artifact|asset|storage|file.browser/.test(signal))             return 'files';
    if (/monaco|write|create|save|edit|patch|diff|replace|commit/.test(signal))                   return 'writing';
    if (/read|fetch|get|inspect|load|open|grep|search|list|scan/.test(signal))                    return 'reading';
    return 'tool';
  }

  // Progress events preserve previous state upstream
  if (type === 'tool_delta' || type === 'task_delta' || type === 'progress') {
    return (event?.previousPresenceState as AgentPresenceState) || 'thinking';
  }

  return 'thinking';
}
