/**
 * Human-readable copy for inline tool approval cards (ChatGPT-style pre-flight).
 */

import type { ToolApprovalPayload } from './types';

export type ToolApprovalRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export function formatToolApprovalTitle(toolName: string, description?: string): string {
  const d0 = String(description || '')
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean);
  if (d0 && d0.length >= 4 && d0.length <= 120) return d0;
  const raw = String(toolName || '').trim();
  if (raw) {
    const t = raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (/terminal|shell|pty/i.test(t)) return 'Run shell command on your platform terminal?';
    if (/^run\b/i.test(t)) return t.length > 72 ? t.slice(0, 70) + '…' : t;
    return t.length > 72 ? t.slice(0, 70) + '…' : t;
  }
  return d0 || 'Allow this action?';
}

export function normalizeToolApprovalRisk(level?: string): ToolApprovalRiskLevel {
  const r = String(level || 'medium').toLowerCase();
  if (r === 'critical' || r === 'high' || r === 'medium' || r === 'low') return r;
  return 'medium';
}

export function toolApprovalRiskStyles(level: ToolApprovalRiskLevel): { pill: string; ring: string } {
  switch (level) {
    case 'critical':
      return {
        pill: 'bg-red-500/15 text-red-300 border-red-400/30',
        ring: 'ring-red-400/25',
      };
    case 'high':
      return {
        pill: 'bg-amber-500/12 text-amber-200 border-amber-400/28',
        ring: 'ring-amber-400/20',
      };
    case 'medium':
      return {
        pill: 'bg-yellow-500/10 text-yellow-200/90 border-yellow-400/22',
        ring: 'ring-yellow-400/15',
      };
    default:
      return {
        pill: 'bg-emerald-500/10 text-emerald-200/90 border-emerald-400/22',
        ring: 'ring-emerald-400/12',
      };
  }
}

/** Prefer explicit preview; else derive command/SQL from tool parameters. */
export function resolveToolApprovalPreview(tool: ToolApprovalPayload): string {
  const explicit = String(tool.preview || '').trim();
  if (explicit) return explicit;
  const p = tool.parameters;
  if (!p || typeof p !== 'object') return '';
  const rec = p as Record<string, unknown>;
  const cmd =
    rec.command ??
    rec.cmd ??
    rec.shell_command ??
    rec.shell ??
    rec.query ??
    rec.sql;
  if (cmd != null && String(cmd).trim()) return String(cmd).trim();
  const path = rec.path ?? rec.cwd ?? rec.working_directory;
  if (path != null && String(path).trim()) {
    const base = String(path).trim();
    if (cmd != null) return `cd ${base} && ${String(cmd).trim()}`;
    return base;
  }
  try {
    return JSON.stringify(rec, null, 2).slice(0, 4000);
  } catch {
    return '';
  }
}

export function defaultIntegrationLabel(tool: ToolApprovalPayload): string {
  const s = String(tool.server_display_name || '').trim();
  if (s) return s;
  if (tool.plan_terminal) return 'Plan terminal';
  return 'Agent Sam';
}

export function defaultLaneFootnote(tool: ToolApprovalPayload): string | null {
  const lane = String(tool.connection_resolution || '').trim();
  if (!lane) return null;
  if (lane === 'superadmin_operator_workspace') {
    return 'Platform operator lane · localpty';
  }
  if (lane.includes('byok') || lane.includes('tunnel')) {
    return 'Customer workspace · tunnel required';
  }
  return lane.replace(/_/g, ' ');
}
