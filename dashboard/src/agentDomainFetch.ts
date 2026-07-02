/**
 * L2 agent-domain fetches — policy, models, default model.
 * Not loaded by dashboard bootstrap; invalidate on workspace switch.
 */

import type { ChatModelRow } from '../components/ChatAssistant/types';

const policyCacheByWorkspace: Record<string, Record<string, unknown> | null> = {};
let modelsCache: ChatModelRow[] | undefined;
let modelsInflight: Promise<ChatModelRow[]> | null = null;
let defaultModelCache: string | null | undefined;
let defaultModelInflight: Promise<string | null> | null = null;

function debugL2(label: string, detail?: string) {
  try {
    if (localStorage.getItem('IAM_DEBUG_L2') !== '1') return;
    console.info(`[IAM L2] ${label}${detail ? `: ${detail}` : ''}`);
  } catch {
    /* ignore */
  }
}

function mapModelRow(raw: Record<string, unknown>): ChatModelRow {
  return {
    id: String(raw.id ?? raw.model_key ?? ''),
    name: String(raw.name ?? raw.display_name ?? raw.model_key ?? ''),
    provider: String(raw.provider ?? ''),
    model_key: String(raw.model_key ?? ''),
    api_platform: String(raw.api_platform ?? ''),
    picker_group:
      raw.picker_group != null && String(raw.picker_group).trim()
        ? String(raw.picker_group).trim()
        : '',
    size_class: raw.size_class != null ? String(raw.size_class) : '',
    input_rate_per_mtok: raw.input_rate_per_mtok != null ? Number(raw.input_rate_per_mtok) : null,
    output_rate_per_mtok: raw.output_rate_per_mtok != null ? Number(raw.output_rate_per_mtok) : null,
    byok_configured: raw.byok_configured === true,
    byok_masked: raw.byok_masked != null ? String(raw.byok_masked) : null,
    billing_key_source:
      raw.billing_key_source != null ? String(raw.billing_key_source) : undefined,
  };
}

/** Clear L2 caches — call on workspace switch (all) or single workspace policy. */
export function invalidateAgentDomainCache(workspaceId?: string | null) {
  if (workspaceId?.trim()) {
    delete policyCacheByWorkspace[workspaceId.trim()];
    debugL2('invalidate policy cache', workspaceId.trim());
  } else {
    for (const k of Object.keys(policyCacheByWorkspace)) delete policyCacheByWorkspace[k];
    modelsCache = undefined;
    modelsInflight = null;
    defaultModelCache = undefined;
    defaultModelInflight = null;
    debugL2('invalidate all L2 caches');
  }
}

export async function fetchAgentPolicy(
  workspaceId: string,
): Promise<Record<string, unknown> | null> {
  const ws = workspaceId.trim();
  if (!ws) return null;

  if (Object.prototype.hasOwnProperty.call(policyCacheByWorkspace, ws)) {
    return policyCacheByWorkspace[ws];
  }

  debugL2('fetch /api/agent/policy', ws);
  try {
    const r = await fetch('/api/agent/policy', { credentials: 'same-origin' });
    if (!r.ok) {
      policyCacheByWorkspace[ws] = null;
      return null;
    }
    const data = (await r.json()) as { agent_policy?: Record<string, unknown> | null };
    const next = data?.agent_policy ?? null;
    policyCacheByWorkspace[ws] = next;
    return next;
  } catch {
    policyCacheByWorkspace[ws] = null;
    return null;
  }
}

export async function fetchAgentModels(): Promise<ChatModelRow[]> {
  if (modelsCache !== undefined) return modelsCache;
  if (modelsInflight) return modelsInflight;

  debugL2('fetch /api/agent/models');
  modelsInflight = fetch('/api/agent/models?show_in_picker=1', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : []))
    .then((data) => {
      const rows = Array.isArray(data)
        ? (data as Record<string, unknown>[]).map(mapModelRow)
        : [];
      modelsCache = rows;
      return rows;
    })
    .catch(() => {
      modelsCache = [];
      return [] as ChatModelRow[];
    })
    .finally(() => {
      modelsInflight = null;
    });

  return modelsInflight;
}

export async function fetchAgentDefaultModel(): Promise<string | null> {
  if (defaultModelCache !== undefined) return defaultModelCache;
  if (defaultModelInflight) return defaultModelInflight;

  debugL2('fetch /api/settings/default-model');
  defaultModelInflight = fetch('/api/settings/default-model', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : {}))
    .then((d: { default_model?: string | null }) => {
      const dm =
        typeof d.default_model === 'string' && d.default_model.trim()
          ? d.default_model.trim()
          : null;
      defaultModelCache = dm;
      return dm;
    })
    .catch(() => {
      defaultModelCache = null;
      return null;
    })
    .finally(() => {
      defaultModelInflight = null;
    });

  return defaultModelInflight;
}
