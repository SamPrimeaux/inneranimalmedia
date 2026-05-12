/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Block chat UI leaks that look like OpenAI streaming chunks (never append). */
export function looksLikeRawProviderLeak(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  const looksOpenAiFraming =
    o.object === 'chat.completion.chunk' ||
    (typeof o.id === 'string' && o.id.startsWith('chatcmpl'));
  if (!looksOpenAiFraming) return false;
  const choices = o.choices as Array<{ delta?: { content?: unknown } }> | undefined;
  const dc = choices?.[0]?.delta?.content;
  if (typeof dc === 'string' && dc.length > 0) return false;
  return true;
}

export function ssePayloadLooksReasoningOnly(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  const choices = o.choices as Array<{ delta?: Record<string, unknown> }> | undefined;
  const d = choices?.[0]?.delta;
  if (!d || typeof d !== 'object') return false;
  const c = d.content;
  const hasContent = typeof c === 'string' && c.length > 0;
  if (hasContent) return false;
  return !!(d.reasoning_content ?? d.reasoning ?? d.thinking ?? d.logprobs ?? d.token_ids ?? d.prompt_token_ids);
}

/**
 * Visible assistant text only — never reasoning_content / thinking / logprobs / raw SSE lines.
 */
export function normalizeAssistantSseText(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return '';
  const p = parsed as Record<string, unknown>;
  const pt = p.type;
  if (pt === 'done' || pt === 'error' || pt === 'tool_approval_request') return '';

  const direct =
    (typeof p.text === 'string' ? p.text : '') ||
    (pt === 'token' && typeof p.text === 'string' ? p.text : '') ||
    (pt === 'delta' && typeof p.text === 'string' ? p.text : '') ||
    (pt === 'text' && typeof p.text === 'string' ? p.text : '');
  if (direct) return direct;

  const nestedDelta = p.delta as Record<string, unknown> | undefined;
  if (nestedDelta && typeof nestedDelta.content === 'string' && nestedDelta.content.length > 0) {
    return nestedDelta.content;
  }
  if (nestedDelta?.reasoning_content) {
    return '';
  }

  const choices = p.choices as Array<{ delta?: { content?: string } }> | undefined;
  const oc = choices?.[0]?.delta?.content;
  if (typeof oc === 'string' && oc.length > 0) return oc;

  if (pt === 'content_block_start') {
    const blockType = (p.content_block as Record<string, unknown> | undefined)?.type;
    if (blockType === 'server_tool_use' || blockType === 'tool_search_tool_result') {
      return '';
    }
  }

  if (pt === 'content_block_delta') {
    const delta = p.delta as Record<string, unknown> | undefined;
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') return delta.text;
  }

  const candidates = p.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  if (Array.isArray(candidates) && candidates[0]?.content?.parts) {
    return candidates[0].content.parts.map((x) => (x.text != null ? String(x.text) : '')).join('');
  }

  return '';
}

export function isStreamErrorPayload(
  parsed: unknown,
): parsed is { error: string; detail?: string; provider?: string; model?: string } {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as { error?: unknown; type?: string };
  if (p.type === 'tool_error') return false;
  return 'error' in p && typeof p.error === 'string';
}

/** Decode minimal XML entities inside `<parameter>` bodies from streamed tool XML. */
function decodeMonacoParameterText(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseMonacoInvokeParameterBlock(inner: string): Record<string, string> {
  const params: Record<string, string> = {};
  const paramRe = /<parameter\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/parameter>/gi;
  let m: RegExpExecArray | null;
  while ((m = paramRe.exec(inner)) !== null) {
    const k = m[1].trim().toLowerCase();
    params[k] = decodeMonacoParameterText(m[2].trim());
  }
  return params;
}

/**
 * Remove complete `<invoke name="...">...</invoke>` blocks (any tool name) from streamed assistant text.
 * For `name="monaco"`, parse filename/content and return files to open in the editor.
 */
export function extractMonacoInvokesFromBuffer(text: string): { text: string; files: Array<{ name: string; content: string }> } {
  const files: Array<{ name: string; content: string }> = [];
  let out = text;
  const blockRe = /<(?:antml:)?invoke\b([^>]*)>([\s\S]*?)<\/(?:antml:)?invoke>/i;
  for (let guard = 0; guard < 64; guard++) {
    const m = out.match(blockRe);
    if (!m || m.index === undefined) break;
    const attrs = m[1] || '';
    const inner = m[2] || '';
    const nameMatch = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i);
    const toolName = (nameMatch?.[1] || '').trim().toLowerCase();
    if (toolName === 'monaco') {
      const params = parseMonacoInvokeParameterBlock(inner);
      const nameRaw = params.filename || params.file || params.path || '';
      const filename = (nameRaw || 'snippet.txt').trim() || 'snippet.txt';
      const content = params.content ?? '';
      if (content.length > 0) {
        files.push({ name: filename, content });
      } else {
        console.warn('[ChatAssistant] monaco invoke skipped: missing or empty content parameter', {
          filename,
          paramKeys: Object.keys(params),
        });
      }
    }
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
  }
  const fcRe = /<function_calls\b[^>]*>[\s\S]*?<\/function_calls>/i;
  for (let guard = 0; guard < 64; guard++) {
    const m = out.match(fcRe);
    if (!m || m.index === undefined) break;
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
  }
  return { text: out, files };
}

/** While the model is still streaming tool XML, hide partial `<function_calls>` / `<invoke>` tails from the bubble. */
export function hideIncompleteMonacoInvokeTail(text: string): string {
  let lastFc = -1;
  const fcOpenRe = /<function_calls\b/gi;
  let fm: RegExpExecArray | null;
  while ((fm = fcOpenRe.exec(text)) !== null) {
    lastFc = fm.index;
  }
  if (lastFc >= 0) {
    const tailFc = text.slice(lastFc);
    if (!/<\/function_calls>/i.test(tailFc)) {
      return text.slice(0, lastFc);
    }
  }
  const openRe = /<(?:antml:)?invoke\b[^>]*>/gi;
  let lastOpen = -1;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(text)) !== null) {
    lastOpen = m.index;
  }
  if (lastOpen < 0) return text;
  const tail = text.slice(lastOpen);
  if (/<\/(?:antml:)?invoke>/i.test(tail)) return text;
  return text.slice(0, lastOpen);
}

/** True when streamed text has clearly entered raw HTML/CSS/SVG body (before r2_file_updated). */
export function looksLikeEmbeddedFileDumpStart(full: string): boolean {
  const tail = full.slice(-14000);
  if (/<!DOCTYPE\s+html/i.test(tail)) return true;
  if (/<\s*html[\s>]/i.test(tail)) return true;
  if (/<\s*head[\s>]/i.test(tail) && /<\s*body[\s>]/i.test(tail)) return true;
  if (/<\s*meta\s+[^>]*charset/i.test(tail)) return true;
  if (/<\s*style[\s>]/i.test(tail) && tail.includes('{') && tail.includes('}')) return true;
  if (/<svg[\s>]/i.test(tail) && tail.length > 400) return true;
  if (/^\s*@(?:charset|import|layer)\s+/im.test(tail.slice(-2500))) return true;
  const m = tail.match(/\{[^{}]*\}/g);
  if (m && m.length >= 18 && /[#.][a-zA-Z0-9_-]+\s*\{/.test(tail)) return true;
  return false;
}

export function formatHttpErrorMessage(status: number, bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as { error?: string; detail?: string; status?: number; model?: string };
    const parts = [j.error, j.detail, j.model ? `model: ${j.model}` : '', status ? `HTTP ${status}` : ''].filter(
      Boolean,
    );
    if (parts.length) return parts.join(' — ');
  } catch {
    /* use body */
  }
  return bodyText.trim() || `HTTP ${status}`;
}
