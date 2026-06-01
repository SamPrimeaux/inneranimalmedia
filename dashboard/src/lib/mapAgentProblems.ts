/** Terminal Problems panel row (XTermShell). */
export type TerminalProblemRow = {
  file: string;
  line: number;
  msg: string;
  severity: 'error' | 'warning';
  ts?: string;
  id?: string;
};

type ProblemsApiPayload = {
  problems?: TerminalProblemRow[];
  error_log?: unknown[];
  mcp_tool_errors?: unknown[];
  audit_failures?: unknown[];
  worker_errors?: unknown[];
};

/** Prefer server-built `problems` array; fallback to legacy telemetry fields. */
export function mapProblemsApiPayload(data: ProblemsApiPayload | null | undefined): TerminalProblemRow[] {
  if (!data) return [];
  if (Array.isArray(data.problems)) {
    return data.problems.map((p) => ({
      file: String(p.file || 'error'),
      line: Number(p.line) || 0,
      msg: String(p.msg || ''),
      severity: p.severity === 'warning' ? 'warning' : 'error',
      ts: p.ts,
      id: p.id,
    }));
  }
  return [];
}

export function countProblemSeverities(rows: TerminalProblemRow[]) {
  let errors = 0;
  let warnings = 0;
  for (const p of rows) {
    if (p.severity === 'warning') warnings += 1;
    else errors += 1;
  }
  return { errors, warnings };
}
