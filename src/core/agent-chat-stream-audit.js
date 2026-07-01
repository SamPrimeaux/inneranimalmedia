/**
 * Explicit lifecycle logging for POST /api/agent/chat SSE streams.
 * Detects silent hangs: stream closes without token or done events.
 */

/**
 * @param {Record<string, unknown>} [meta]
 */
export function createChatStreamLifecycle(meta = {}) {
  const t0 = Date.now();
  /** @type {Record<string, number>} */
  const eventTypes = {};
  let sawToken = false;
  let sawDone = false;
  let sawError = false;
  /** @type {string|null} */
  let lastPhase = null;
  let firstTokenMs = null;

  const basePayload = () => ({
    ...meta,
    elapsed_ms: Date.now() - t0,
    event_types: { ...eventTypes },
    saw_token: sawToken,
    saw_done: sawDone,
    saw_error: sawError,
    last_phase: lastPhase,
    first_token_ms: firstTokenMs,
  });

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [payload]
   */
  const record = (type, payload = {}) => {
    const t = String(type || 'unknown');
    eventTypes[t] = (eventTypes[t] || 0) + 1;
    if (t === 'status' && payload?.phase != null) {
      lastPhase = String(payload.phase);
    }
    if (t === 'error') sawError = true;
    if (t === 'done') sawDone = true;
    if ((t === 'text' || t === 'content') && !sawToken) {
      sawToken = true;
      firstTokenMs = Date.now() - t0;
      console.info('[chat_stream] first_token', JSON.stringify(basePayload()));
    }
  };

  /**
   * @param {(type: string, payload?: Record<string, unknown>) => unknown} emit
   */
  const wrapEmit = (emit) => {
    return (type, payload = {}) => {
      record(type, payload);
      return emit(type, payload);
    };
  };

  /**
   * @param {string} [reason]
   */
  const finalize = (reason = 'stream_close') => {
    const payload = { ...basePayload(), reason };
    if (sawError) {
      console.warn('[chat_stream] close_with_error', JSON.stringify(payload));
      return payload;
    }
    if (!sawDone && !sawToken) {
      console.warn('[chat_stream] close_without_token_or_done', JSON.stringify(payload));
      return payload;
    }
    if (sawDone && !sawToken) {
      console.warn('[chat_stream] close_done_no_token', JSON.stringify(payload));
      return payload;
    }
    console.info('[chat_stream] close_ok', JSON.stringify(payload));
    return payload;
  };

  const logOpen = () => {
    console.info('[chat_stream] open', JSON.stringify({ ...meta, t0 }));
  };

  return { wrapEmit, finalize, record, logOpen, basePayload, t0, get sawToken() { return sawToken; }, get sawDone() { return sawDone; } };
}
