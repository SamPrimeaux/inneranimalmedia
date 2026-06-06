/**
 * User-facing tool trace titles (Claude-style: "Agentsam terminal local").
 */

import type { AgentToolTraceRow } from '../components/ChatAssistant/execution/types';

function simplifyToolName(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return 'working';
  return t.replace(/^agentsam_/i, '').replace(/_/g, ' ').toLowerCase();
}

function formatBrand(label?: string | null): string {
  const s = String(label || 'Agent Sam').trim();
  if (/^agent\s*sam$/i.test(s)) return 'Agentsam';
  return s;
}

function connectionSuffix(row: Pick<AgentToolTraceRow, 'connectionResolution' | 'execHost' | 'toolName'>): string {
  const tn = String(row.toolName || '').toLowerCase();
  if (/terminal_local|shell_local/.test(tn)) return 'local';
  if (/terminal_remote|shell_remote/.test(tn)) return 'remote';
  const res = String(row.connectionResolution || row.execHost || '').toLowerCase();
  if (res.includes('localpty') || res.includes('mac_local') || res.includes('local')) return 'local';
  if (res.includes('tunnel') || res.includes('remote') || res.includes('gcp')) return 'remote';
  return '';
}

export function formatToolTraceDisplayTitle(
  row: Pick<AgentToolTraceRow, 'toolName' | 'integrationLabel' | 'connectionResolution' | 'execHost'>,
): string {
  const brand = formatBrand(row.integrationLabel);
  const tool = simplifyToolName(row.toolName);
  const conn = connectionSuffix(row);
  if (/terminal|shell|pty/.test(String(row.toolName || '').toLowerCase())) {
    if (conn && !tool.includes(conn)) return `${brand} ${tool}`.replace(/\s+/g, ' ').trim();
    return `${brand} ${tool}`.replace(/\s+/g, ' ').trim();
  }
  return `${brand} ${tool}`.replace(/\s+/g, ' ').trim();
}

export function resolveToolTraceCommand(row: AgentToolTraceRow): string | null {
  const raw = String(row.detailsJson || '').trim();
  if (raw) {
    try {
      const p = JSON.parse(raw) as Record<string, unknown>;
      const cmd =
        p.command ?? p.cmd ?? p.shell_command ?? p.shell ?? p.query ?? p.sql ?? p.statement;
      if (cmd != null && String(cmd).trim()) return String(cmd).trim();
    } catch {
      /* ignore */
    }
  }
  for (const line of row.lines) {
    const m = line.match(/^(?:command|cmd|query|sql):\s*(.+)$/i);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

export function resolveToolTraceMetaLabel(row: AgentToolTraceRow, command: string | null): string {
  if (row.status === 'running') {
    if (command) return command.length > 96 ? `${command.slice(0, 94)}…` : command;
    return 'Running…';
  }
  if (row.status === 'error') return 'Failed';
  return 'Result';
}
