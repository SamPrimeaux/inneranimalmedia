/**
 * Human-readable execution row summaries (raw JSON lives in detailsJson).
 */

export type ToolTraceSummary = {
  summaryLines: string[];
  detailsJson?: string;
};

export type ToolTraceReceiptMeta = {
  connectionResolution?: string;
  connectionId?: string;
  execHost?: string;
  stdoutPreview?: string;
};

function nestedRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function pickTerminalField(parsed: Record<string, unknown>, key: string): string | undefined {
  const direct = parsed[key];
  if (direct != null && String(direct).trim()) return String(direct).trim();
  const body = nestedRecord(parsed.body);
  if (body?.[key] != null && String(body[key]).trim()) return String(body[key]).trim();
  const data = nestedRecord(parsed.data);
  if (data?.[key] != null && String(data[key]).trim()) return String(data[key]).trim();
  return undefined;
}

export function parseToolTraceReceiptMeta(
  toolName: string,
  outputPreview: string | null | undefined,
): ToolTraceReceiptMeta | undefined {
  const tn = String(toolName || '').toLowerCase();
  if (!/terminal|pty|shell_remote|shell_local/.test(tn)) return undefined;
  const raw = String(outputPreview || '').trim();
  const parsed = raw ? tryParseJson(raw) : null;
  if (!parsed) return undefined;

  const stdout =
    (typeof parsed.stdout === 'string' && parsed.stdout) ||
    (typeof parsed.output === 'string' && parsed.output) ||
    pickTerminalField(parsed, 'stdout');
  const stdoutPreview = stdout ? stdout.split('\n').slice(0, 4).join('\n').slice(0, 400) : undefined;

  return {
    connectionResolution: pickTerminalField(parsed, 'connection_resolution'),
    connectionId: pickTerminalField(parsed, 'connection_id'),
    execHost: pickTerminalField(parsed, 'exec_host'),
    stdoutPreview,
  };
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function formatToolTraceInput(toolName: string, inputPreview: string | null | undefined): ToolTraceSummary {
  const raw = String(inputPreview || '').trim();
  const parsed = raw ? tryParseJson(raw) : null;
  const detailsJson = raw && parsed ? raw : undefined;

  if (toolName === 'browser_navigate' || toolName === 'cdt_navigate_page') {
    const target =
      (typeof parsed?.url === 'string' && parsed.url) ||
      (typeof parsed?.href === 'string' && parsed.href) ||
      (typeof parsed?.target_url === 'string' && parsed.target_url) ||
      '';
    const wait = parsed?.wait_for != null ? String(parsed.wait_for) : parsed?.waitFor != null ? String(parsed.waitFor) : 'body';
    const timeout = parsed?.timeout != null ? String(parsed.timeout) : undefined;
    const lines = [`Target: ${target || '(unknown URL)'}`];
    if (wait) lines.push(`Wait: ${wait}`);
    if (timeout) lines.push(`Timeout: ${timeout}ms`);
    return { summaryLines: lines, detailsJson };
  }

  if (toolName === 'browser_verify_current_page') {
    const expected =
      (typeof parsed?.expected_url === 'string' && parsed.expected_url) ||
      (typeof parsed?.url === 'string' && parsed.url) ||
      '';
    return {
      summaryLines: [`Expected: ${expected || '(unknown URL)'}`],
      detailsJson,
    };
  }

  if (toolName === 'browser_scroll') {
    const amount = parsed?.amount != null ? String(parsed.amount) : '700';
    const dir = parsed?.direction != null ? String(parsed.direction) : 'down+up';
    return {
      summaryLines: [`Scroll: ${dir}`, `Amount: ${amount}px`],
      detailsJson,
    };
  }

  if (parsed) {
    const keys = Object.keys(parsed).slice(0, 4);
    const lines = keys.map((k) => `${k}: ${String(parsed[k]).slice(0, 120)}`);
    return { summaryLines: lines.length ? lines : [toolName], detailsJson };
  }

  return { summaryLines: raw ? [raw.slice(0, 160)] : [toolName] };
}

export function formatToolTraceOutput(toolName: string, outputPreview: string | null | undefined): ToolTraceSummary {
  const raw = String(outputPreview || '').trim();
  const parsed = raw ? tryParseJson(raw) : null;
  const detailsJson = raw && parsed ? raw : undefined;

  if (parsed) {
    const url = typeof parsed.url === 'string' ? parsed.url : '';
    const title = typeof parsed.title === 'string' ? parsed.title : '';
    const verified = parsed.verified === true || parsed.url_verified === true;
    if (toolName === 'browser_verify_current_page') {
      const lines = [`Current: ${url || '(unknown)'}`];
      if (title) lines.push(`Title: ${title.slice(0, 120)}`);
      lines.push(parsed.verified === false ? 'Verification: failed' : verified ? 'Verification: ok' : 'Verification: pending');
      return { summaryLines: lines, detailsJson };
    }
    if (url && (toolName.includes('navigate') || toolName === 'browser_navigate')) {
      const lines = [`Committed: ${url}`];
      if (title) lines.push(`Title: ${title.slice(0, 120)}`);
      if (parsed.verified === false) lines.push('Verification: failed');
      else if (verified) lines.push('Verification: ok');
      return { summaryLines: lines, detailsJson };
    }
    if (toolName === 'browser_scroll' && parsed.ok === true) {
      return {
        summaryLines: [
          `Scroll amount: ${parsed.scroll_amount ?? '?'}`,
          parsed.scrolled_up ? 'Scrolled down then up' : 'Scrolled',
        ],
        detailsJson,
      };
    }

    const terminalMeta = parseToolTraceReceiptMeta(toolName, raw);
    if (terminalMeta) {
      const lines: string[] = [];
      if (terminalMeta.connectionResolution) {
        lines.push(`connection_resolution: ${terminalMeta.connectionResolution}`);
      }
      if (terminalMeta.connectionId) lines.push(`connection_id: ${terminalMeta.connectionId}`);
      if (terminalMeta.execHost) lines.push(`exec_host: ${terminalMeta.execHost}`);
      if (terminalMeta.stdoutPreview) {
        const previewLines = terminalMeta.stdoutPreview.split('\n').slice(0, 3);
        lines.push(`stdout: ${previewLines.join(' · ').slice(0, 200)}`);
      }
      if (lines.length) return { summaryLines: lines, detailsJson };
    }
  }

  return { summaryLines: raw ? [raw.slice(0, 200)] : [], detailsJson };
}
