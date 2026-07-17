export const AGENT_RUN_DEADLINE_RESERVE_MS = 2500;

export function clampToolBudgetToRunDeadline(
  requestedBudgetMs,
  {
    runStartedAt,
    maxRunMs,
    now = Date.now(),
    reserveMs = AGENT_RUN_DEADLINE_RESERVE_MS,
  } = {},
) {
  const requested = Math.max(1, Math.floor(Number(requestedBudgetMs) || 1));
  const started = Number(runStartedAt);
  const runtime = Number(maxRunMs);
  if (!Number.isFinite(started) || !Number.isFinite(runtime) || runtime <= 0) {
    return requested;
  }

  const remaining = Math.floor(started + runtime - Number(now) - Math.max(0, reserveMs));
  if (remaining <= 0) return 0;
  return Math.min(requested, remaining);
}

export function agentRunDeadlineError() {
  return Object.assign(new Error('Agent run deadline reached before tool execution'), {
    code: 'agent_run_deadline',
  });
}

export async function raceToolExecutionBudget(promise, budgetMs, toolName = 'tool') {
  const timeoutMs = Math.max(1, Math.floor(Number(budgetMs) || 1));
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error(`${toolName} timed out after ${timeoutMs}ms`), {
              code: 'tool_timeout',
              tool_name: toolName,
              timeout_ms: timeoutMs,
            }),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}
