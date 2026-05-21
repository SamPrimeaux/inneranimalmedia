/**
 * agent-step.js
 * Named workflow step handler registry.
 * Register handlers here — keeps workflow-executor.js clean.
 * Import with: const stepMod = await import('./agent-step.js');
 */

const HANDLER_MAP = new Map();

export function registerAgentStepHandler(key, fn) {
  HANDLER_MAP.set(key, fn);
}

export function isRegisteredAgentStepHandler(handlerKey) {
  return HANDLER_MAP.has(handlerKey);
}

export async function agentChatStep(env, { handler_key, input, runContext, node, smoke }) {
  const fn = HANDLER_MAP.get(handler_key);
  if (!fn) return { ok: false, error: `No handler registered for: ${handler_key}` };
  return fn(env, { input, runContext, node, smoke });
}
