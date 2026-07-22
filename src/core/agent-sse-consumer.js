import { aggregateOpenAiCompatibleUsageTokens } from './openai-usage-tokens.js';

function readSseChunk(reader, signal) {
  if (!signal) return reader.read();
  if (signal.aborted) {
    return Promise.reject(
      signal.reason instanceof Error
        ? signal.reason
        : Object.assign(new Error('Stream aborted'), { name: 'AbortError' }),
    );
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      void reader.cancel('aborted').catch(() => {});
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : Object.assign(new Error('Stream aborted'), { name: 'AbortError' }),
      );
    };
    signal.addEventListener('abort', onAbort, { once: true });
    reader
      .read()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return {};
  try {
    return JSON.parse(value);
  } catch {
    return { __raw: value, __parse_error: true };
  }
}

/**
 * OpenAI Chat Completions SSE stream (`delta.tool_calls`). Merges tool call fragments by `index`
 * (id may be omitted on later chunks). Not for Responses API — use a separate adapter there.
 * Without reconstructing tool_calls here, pendingToolCalls stay empty and no tools run.
 */
export async function consumeOpenAIChatCompletionsSse(readable, emit, opts = {}) {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  const throwIfAborted = opts.throwIfAborted;
  let buf = '';
  /** @type {Map<number, { id?: string, name?: string, args: string }>} */
  const tcByIndex = new Map();
  let textBuf = '';
  let reasoningBuf = '';
  /** @type {string|null} */
  let finishReason = null;
  /** @type {Record<string, unknown>|null} */
  let usage = null;
  let terminalEvent = false;

  const mergeDelta = (delta) => {
    if (delta == null || typeof delta !== 'object') return;
    const reasoning = delta.reasoning_content;
    if (typeof reasoning === 'string' && reasoning) {
      reasoningBuf += reasoning;
      emit('reasoning', { text: reasoning });
    }
    const content = delta.content;
    if (typeof content === 'string' && content) {
      textBuf += content;
      emit('text', { text: content });
    }
    if (!Array.isArray(delta.tool_calls)) return;
    for (const part of delta.tool_calls) {
      const idx = Number(part.index ?? 0);
      if (!Number.isFinite(idx)) continue;
      if (!tcByIndex.has(idx)) tcByIndex.set(idx, { args: '' });
      const slot = tcByIndex.get(idx);
      if (typeof part.id === 'string' && part.id) slot.id = part.id;
      const fn = part.function;
      if (fn && typeof fn === 'object') {
        if (typeof fn.name === 'string' && fn.name) slot.name = fn.name;
        if (typeof fn.arguments === 'string' && fn.arguments) slot.args += fn.arguments;
        if (typeof fn.gemini_thought_signature === 'string' && fn.gemini_thought_signature) {
          slot.geminiThoughtSignature = fn.gemini_thought_signature;
        }
      }
    }
  };

  const processPayload = (payload) => {
    if (payload === '[DONE]') {
      terminalEvent = true;
      return true;
    }
    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      return false;
    }
    const choices = json?.choices;
    if (json?.usage && typeof json.usage === 'object') {
      usage = json.usage;
    }
    if (!Array.isArray(choices) || !choices.length) return false;
    const ch = choices[0];
    if (ch.finish_reason != null && String(ch.finish_reason).trim() !== '') {
      finishReason = String(ch.finish_reason);
    }
    if (ch.delta) mergeDelta(ch.delta);
    return false;
  };

  /** One SSE event: join all `data:` lines (spec allows multi-line data fields). */
  const processEventBlock = (blockText) => {
    const lines = blockText.split('\n').map((l) => l.trim()).filter(Boolean);
    const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart());
    if (!dataLines.length) return false;
    return processPayload(dataLines.join('\n').trim());
  };

  try {
    while (!terminalEvent) {
      if (throwIfAborted) await throwIfAborted();
      const { done, value } = await readSseChunk(reader, opts.signal);
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const part = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        if (processEventBlock(part)) break;
      }
    }
    const tail = buf.trim();
    if (tail && !terminalEvent) processEventBlock(tail);
  } finally {
    if (terminalEvent) {
      await reader.cancel('sse_terminal_event').catch(() => {});
    }
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  const pendingToolCalls = [...tcByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, slot]) => ({
      type: 'tool_use',
      id: slot.id || `openai_tool_${index}`,
      name: slot.name,
      input: safeJsonParse(slot.args || '{}'),
      raw_input: slot.args || '{}',
      provider: 'openai_chat_completions',
      index,
      ...(slot.geminiThoughtSignature
        ? { gemini_thought_signature: slot.geminiThoughtSignature }
        : {}),
    }))
    .filter((c) => c.name);

  return {
    text: textBuf,
    reasoningContent: reasoningBuf,
    finishReason,
    pendingToolCalls,
    usage,
    ...aggregateOpenAiCompatibleUsageTokens(usage),
  };
}

/**
 * OpenAI /v1/responses SSE — NOT chat.completions. Events like `response.output_text.delta`,
 * `response.output_item.added` (function_call), `response.completed`.
 * Normalizes to the same bridge as consumeOpenAIChatCompletionsSse; adds `responseId` for chaining.
 */
export async function consumeOpenAIResponsesSse(readable, emit, opts = {}) {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  const throwIfAborted = opts.throwIfAborted;
  let buf = '';
  let textBuf = '';
  let streamFinish = null;
  let responseId = null;
  let terminalEvent = false;

  const slots = [];
  const byCallId = new Map();
  const byItemId = new Map();

  const mergeSlot = (callId, itemId, name, outputIndex) => {
    let idx;
    if (callId && byCallId.has(callId)) idx = byCallId.get(callId);
    else if (itemId && byItemId.has(itemId)) idx = byItemId.get(itemId);
    if (idx == null) {
      idx = slots.length;
      slots.push({
        id: itemId || null,
        call_id: callId || null,
        name: name || '',
        args: '',
        caller: null,
        outputIndex: outputIndex != null ? Number(outputIndex) : null,
      });
      if (callId) byCallId.set(callId, idx);
      if (itemId) byItemId.set(itemId, idx);
    }
    const s = slots[idx];
    if (callId) {
      s.call_id = callId;
      byCallId.set(callId, idx);
    }
    if (itemId) {
      s.id = itemId;
      byItemId.set(itemId, idx);
    }
    if (name) s.name = name;
    if (outputIndex != null && s.outputIndex == null) s.outputIndex = Number(outputIndex);
    return s;
  };

  let outputItems = null;

  const captureFunctionCallItem = (item, outputIndex) => {
    if (!item || item.type !== 'function_call') return;
    const s = mergeSlot(item.call_id, item.id, item.name, outputIndex);
    if (typeof item.arguments === 'string' && item.arguments) s.args = item.arguments;
    if (item.caller != null) s.caller = item.caller;
  };

  const handleObj = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    const t = String(obj.type || '');

    if (t === 'response.created' || t === 'response.in_progress') {
      const rid = obj.response?.id;
      if (rid) responseId = String(rid);
      return false;
    }

    if (t === 'response.output_text.delta') {
      const d = typeof obj.delta === 'string' ? obj.delta : '';
      if (d) {
        textBuf += d;
        emit('text', { text: d });
      }
      return false;
    }

    if (t === 'response.output_item.added' || t === 'response.output_item.done') {
      const item = obj.item;
      if (item?.type === 'function_call') {
        captureFunctionCallItem(item, obj.output_index);
      }
      return false;
    }

    if (t.includes('function_call_arguments') && t.includes('delta')) {
      const callId = obj.call_id || obj.callId;
      const itemId = obj.item_id || obj.itemId;
      const delta =
        typeof obj.delta === 'string'
          ? obj.delta
          : typeof obj.arguments_delta === 'string'
            ? obj.arguments_delta
            : '';
      if ((callId || itemId) && delta) {
        const s = mergeSlot(callId, itemId, undefined, obj.output_index);
        s.args += delta;
      }
      return false;
    }

    if (t === 'response.completed') {
      const resp = obj.response;
      if (resp?.id) responseId = String(resp.id);
      if (Array.isArray(resp?.output)) {
        outputItems = resp.output;
        resp.output.forEach((it, i) => {
          if (it?.type === 'function_call') captureFunctionCallItem(it, i);
        });
      }
      const st = resp?.status != null ? String(resp.status) : '';
      if (st) streamFinish = st;
      if (resp?.usage) {
        streamFinish = {
          status: st,
          input_tokens:  Number(resp.usage.input_tokens)  || 0,
          output_tokens: Number(resp.usage.output_tokens) || 0,
        };
      }
      terminalEvent = true;
      return true;
    }
    if (t === 'response.failed' || t === 'response.incomplete' || t === 'response.cancelled') {
      streamFinish = t.slice('response.'.length);
      terminalEvent = true;
      return true;
    }
    return false;
  };

  const processEventBlock = (blockText) => {
    const dataParts = [];
    for (const line of blockText.split(/\r?\n/)) {
      const s = line.trim();
      if (s.startsWith('data:')) dataParts.push(s.slice(5).trimStart());
    }
    if (!dataParts.length) return false;
    const payload = dataParts.join('\n').trim();
    if (!payload) return false;
    if (payload === '[DONE]') {
      terminalEvent = true;
      return true;
    }
    try {
      return handleObj(JSON.parse(payload));
    } catch {
      /* ignore non-JSON */
      return false;
    }
  };

  try {
    while (!terminalEvent) {
      if (throwIfAborted) await throwIfAborted();
      const { done, value } = await readSseChunk(reader, opts.signal);
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const part = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        if (processEventBlock(part)) break;
      }
    }
    if (buf.trim() && !terminalEvent) processEventBlock(buf.trim());
  } finally {
    if (terminalEvent) {
      await reader.cancel('sse_terminal_event').catch(() => {});
    }
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  slots.sort((a, b) => (a.outputIndex ?? 1e9) - (b.outputIndex ?? 1e9));

  const pendingToolCalls = slots
    .filter((s) => s.name)
    .map((s, index) => {
      const raw = s.args || '';
      const itemId = s.id || `openai_response_tool_${index}`;
      return {
        type: 'tool_use',
        id: itemId,
        call_id: s.call_id || null,
        name: s.name,
        input: safeJsonParse(raw || '{}'),
        raw_input: raw || '{}',
        provider: 'openai_responses',
        index,
        ...(s.caller != null ? { caller: s.caller } : {}),
      };
    });

  let finishReason = 'end_turn';
  if (pendingToolCalls.length) finishReason = 'tool_use';
  else if (streamFinish === 'completed') finishReason = 'end_turn';

  const _sfObj = typeof streamFinish === 'object' && streamFinish !== null ? streamFinish : {};
  return {
    text: textBuf,
    finishReason,
    pendingToolCalls,
    responseId,
    outputItems: Array.isArray(outputItems) ? outputItems : null,
    input_tokens:  _sfObj.input_tokens  ?? 0,
    output_tokens: _sfObj.output_tokens ?? 0,
  };
}

/** Emit structured diff preview when tool JSON includes before/after + path. */
export function tryEmitCodeDiffFromToolOutput(emit, toolName, toolOutput) {
  if (!emit) return;
  let parsed;
  try {
    parsed = JSON.parse(String(toolOutput || 'null'));
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const path =
    (typeof parsed.path === 'string' && parsed.path.trim()) ||
    (typeof parsed.file_path === 'string' && parsed.file_path.trim()) ||
    (typeof parsed.file === 'string' && parsed.file.trim()) ||
    (Array.isArray(parsed.files_touched) && typeof parsed.files_touched[0] === 'string'
      ? String(parsed.files_touched[0]).trim()
      : '');
  const before =
    typeof parsed.before === 'string'
      ? parsed.before
      : typeof parsed.content_before === 'string'
        ? parsed.content_before
        : typeof parsed.original === 'string'
          ? parsed.original
          : typeof parsed.original_content === 'string'
            ? parsed.original_content
            : null;
  const after =
    typeof parsed.after === 'string'
      ? parsed.after
      : typeof parsed.content_after === 'string'
        ? parsed.content_after
        : typeof parsed.modified === 'string'
          ? parsed.modified
          : typeof parsed.patched_content === 'string'
            ? parsed.patched_content
            : typeof parsed.content === 'string'
              ? parsed.content
              : null;
  if (!path || before == null || after == null || before === after) return;
  const language =
    typeof parsed.language === 'string' && parsed.language.trim()
      ? parsed.language.trim()
      : (() => {
          const m = path.match(/\.([a-z0-9]+)$/i);
          return m ? m[1].toLowerCase() : 'plaintext';
        })();
  emit('code_diff', {
    path: path.slice(0, 500),
    before: before.slice(0, 120_000),
    after: after.slice(0, 120_000),
    language,
    tool_name: toolName ? String(toolName).slice(0, 120) : undefined,
  });
}

// ─── SSE Tool Loop ────────────────────────────────────────────────────────────

