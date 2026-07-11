/**
 * Unified abort scope for agent tool loops — client disconnect, fetch abort, and D1 cancel flag.
 */
import { isAgentRunCancelRequested } from './agent-run-cancel.js';

export function makeAgentRunAbortError(reason = 'agent_run_cancelled') {
  const err = new Error('Stopped by user');
  err.name = 'AbortError';
  err.code = reason;
  return err;
}

export function isAgentRunAbortError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const code = String(err.code || '').trim();
  return code === 'agent_run_cancelled' || code === 'spend_cap_exceeded';
}

/**
 * @param {{
 *   request?: Request|null,
 *   externalSignal?: AbortSignal|null,
 *   env?: any,
 *   agentRunId?: string|null,
 * }} opts
 */
export function createAgentRunAbortScope(opts = {}) {
  const controller = new AbortController();
  const cancelFlagCache = { at: 0, value: false };
  const linked = [];

  const abort = (reason = 'agent_run_cancelled') => {
    if (controller.signal.aborted) return;
    try {
      controller.abort(reason);
    } catch {
      /* ignore */
    }
  };

  const linkSignal = (sig) => {
    if (!sig) return;
    if (sig.aborted) {
      abort(sig.reason || 'linked_aborted');
      return;
    }
    const onAbort = () => abort(sig.reason || 'linked_aborted');
    sig.addEventListener('abort', onAbort, { once: true });
    linked.push({ sig, onAbort });
  };

  linkSignal(opts.request?.signal ?? null);
  linkSignal(opts.externalSignal ?? null);

  const throwIfAborted = async () => {
    if (controller.signal.aborted) throw makeAgentRunAbortError(String(controller.signal.reason || 'agent_run_cancelled'));
    const runId = opts.agentRunId != null ? String(opts.agentRunId).trim() : '';
    if (runId && opts.env?.DB) {
      const cancelled = await isAgentRunCancelRequested(opts.env, runId, { cache: cancelFlagCache });
      if (cancelled) {
        abort('agent_run_cancelled');
        throw makeAgentRunAbortError('agent_run_cancelled');
      }
    }
  };

  const dispose = () => {
    for (const { sig, onAbort } of linked) {
      sig.removeEventListener('abort', onAbort);
    }
    linked.length = 0;
  };

  /**
   * @template T
   * @param {Promise<T>} promise
   * @returns {Promise<T>}
   */
  const race = async (promise) => {
    await throwIfAborted();
    if (controller.signal.aborted) throw makeAgentRunAbortError();
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(makeAgentRunAbortError(String(controller.signal.reason || 'agent_run_cancelled')));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve(promise)
        .then(resolve, reject)
        .finally(() => controller.signal.removeEventListener('abort', onAbort));
    });
  };

  return {
    signal: controller.signal,
    abort,
    throwIfAborted,
    race,
    dispose,
    isAborted: () => controller.signal.aborted,
  };
}

/**
 * Abort-aware ReadableStream reader loop.
 * @param {ReadableStream<Uint8Array>} readable
 * @param {(chunk: Uint8Array) => void|Promise<void>} onChunk
 * @param {{ throwIfAborted?: () => Promise<void> }} [opts]
 */
export async function consumeReadableWithAbort(readable, onChunk, opts = {}) {
  const reader = readable.getReader();
  const throwIfAborted = opts.throwIfAborted;
  try {
    while (true) {
      if (throwIfAborted) await throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (value) await onChunk(value);
    }
  } catch (e) {
    try {
      await reader.cancel('aborted');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
