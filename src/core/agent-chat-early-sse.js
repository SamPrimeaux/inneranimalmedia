/**
 * Early SSE heartbeat for POST /api/agent/chat — return response headers before D1 preflight.
 */

export const AGENT_CHAT_SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Access-Control-Allow-Origin': '*',
};

/**
 * @param {() => Promise<Response>} runPipeline
 * @returns {Response}
 */
export function startAgentChatEarlySse(runPipeline) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const emit = async (type, payload = {}) => {
    try {
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`),
      );
    } catch {
      /* stream closed */
    }
  };

  const pipeResponse = async (response) => {
    if (!response) {
      await emit('error', { message: 'empty_agent_response' });
      await emit('done', {});
      return;
    }
    const ct = String(response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok || !response.body || !ct.includes('event-stream')) {
      const text = await response.text().catch(() => '');
      let message = text;
      try {
        const j = JSON.parse(text);
        message = j.message || j.error || text;
      } catch {
        /* raw text */
      }
      await emit('error', {
        message: message || `HTTP ${response.status}`,
        code: response.status === 503 ? 'no_model_resolved' : undefined,
      });
      await emit('done', {});
      return;
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) await writer.write(value);
    }
  };

  void (async () => {
    try {
      await emit('thinking_start', {});
      await emit('status', { phase: 'preflight' });
      const inner = await runPipeline({ emit, pipeResponse });
      if (inner instanceof Response) {
        await pipeResponse(inner);
      }
    } catch (e) {
      console.warn('[agent-chat-early-sse]', e?.message ?? e);
      await emit('error', { message: String(e?.message || e || 'agent_chat_failed') });
      await emit('done', {});
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: AGENT_CHAT_SSE_HEADERS });
}
