/**
 * Validate route/profile tool_keys resolve to active catalog rows or supersession aliases.
 * Pure helpers — pass an activeKeys Set (lowercased tool_name/tool_key from agentsam_tools).
 */
import {
  resolveCatalogDispatchToolKey,
  LEGACY_CATALOG_TOOL_KEY_REDIRECT,
} from './catalog-tool-key-resolve.js';
import { resolveToolSupersession, TOOL_SUPERSESSION } from './agentsam-tool-supersession.js';

/** Keys that must stay private (handler-only — never model-facing catalog pins). */
export const EXCALIDRAW_PRIVATE_HANDLER_KEYS = Object.freeze([
  'excalidraw_clear',
  'excalidraw_add_elements',
]);

/**
 * @param {string} rawKey
 * @returns {{ canonical: string, viaAlias: boolean, aliasFrom?: string }}
 */
export function resolveToolKeyWithAlias(rawKey) {
  const raw = String(rawKey ?? '').trim();
  if (!raw) return { canonical: '', viaAlias: false };
  const viaCatalog = resolveCatalogDispatchToolKey(raw);
  const viaSuper = resolveToolSupersession(viaCatalog);
  const canonical = viaSuper || viaCatalog || raw;
  const viaAlias = canonical !== raw;
  return viaAlias ? { canonical, viaAlias: true, aliasFrom: raw } : { canonical, viaAlias: false };
}

/**
 * @param {Iterable<string>} toolKeys
 * @param {Set<string>|Iterable<string>} activeCatalogKeys lowercased active tool_name/tool_key
 * @returns {{
 *   valid: boolean,
 *   unresolvedKeys: string[],
 *   resolvedAliases: Record<string, string>,
 *   privateHandlerLeaks: string[],
 * }}
 */
export function validateToolProfileKeys(toolKeys, activeCatalogKeys) {
  const active = activeCatalogKeys instanceof Set
    ? activeCatalogKeys
    : new Set([...(activeCatalogKeys || [])].map((k) => String(k).trim().toLowerCase()).filter(Boolean));

  const unresolvedKeys = [];
  /** @type {Record<string, string>} */
  const resolvedAliases = {};
  const privateHandlerLeaks = [];

  for (const raw of toolKeys || []) {
    const key = String(raw ?? '').trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    if (EXCALIDRAW_PRIVATE_HANDLER_KEYS.includes(lower)) {
      privateHandlerLeaks.push(key);
      unresolvedKeys.push(key);
      continue;
    }
    const { canonical, viaAlias, aliasFrom } = resolveToolKeyWithAlias(key);
    const canonLower = String(canonical).trim().toLowerCase();
    if (!canonLower || !active.has(canonLower)) {
      unresolvedKeys.push(key);
      continue;
    }
    if (viaAlias && aliasFrom) resolvedAliases[aliasFrom] = canonical;
  }

  return {
    valid: unresolvedKeys.length === 0,
    unresolvedKeys,
    resolvedAliases,
    privateHandlerLeaks,
  };
}

/**
 * Snapshot of redirect maps used by Draw alignment (for tests / audits).
 */
export function listExcalidrawOpenAliases() {
  const out = [];
  if (LEGACY_CATALOG_TOOL_KEY_REDIRECT.excalidraw_open) {
    out.push({ from: 'excalidraw_open', to: LEGACY_CATALOG_TOOL_KEY_REDIRECT.excalidraw_open, source: 'catalog_redirect' });
  }
  if (TOOL_SUPERSESSION.excalidraw_open) {
    out.push({ from: 'excalidraw_open', to: TOOL_SUPERSESSION.excalidraw_open, source: 'supersession' });
  }
  return out;
}
