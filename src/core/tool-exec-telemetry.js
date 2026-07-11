/**
 * Tool execution telemetry SSOT — usage/cost extraction for catalog + chat tool loop.
 *
 * Body relocated from catalog-tool-executor.js `extractUsageMetrics` (was private).
 * Import this module from catalog-tool-executor and agent-tool-loop — do not reimplement
 * field fallbacks elsewhere (avoids dual-extractor drift).
 *
 * Chat ledger write ownership (TELEMETRY-001 Layer 2):
 * When runContext.skipToolCallLog === true (set by agent-tool-loop before
 * dispatchToolCallWithBudget), catalog finalizeTelemetry must NOT INSERT into
 * agentsam_tool_call_log; the loop owns that row via scheduleAgentsamToolCallLog.
 */

/**
 * @param {unknown} output
 * @param {string|null} [fallbackModel]
 * @param {string|null} [fallbackProvider]
 * @returns {{
 *   inputTokens: number,
 *   outputTokens: number,
 *   inputCostUsd: number,
 *   outputCostUsd: number,
 *   totalCostUsd: number,
 *   modelUsed: string|null,
 *   provider: string|null,
 * }}
 */
export function extractToolExecUsage(output, fallbackModel = null, fallbackProvider = null) {
  const usageMetadata =
    output?.usageMetadata && typeof output.usageMetadata === 'object'
      ? output.usageMetadata
      : output?.body?.usageMetadata && typeof output.body.usageMetadata === 'object'
        ? output.body.usageMetadata
        : null;
  const usage =
    output?.usage && typeof output.usage === 'object'
      ? output.usage
      : output?.body?.usage && typeof output.body.usage === 'object'
        ? output.body.usage
        : usageMetadata
          ? {
              prompt_tokens: usageMetadata.promptTokenCount ?? usageMetadata.prompt_tokens,
              output_tokens:
                usageMetadata.candidatesTokenCount ??
                usageMetadata.output_tokens ??
                usageMetadata.completion_tokens,
              input_tokens: usageMetadata.promptTokenCount ?? usageMetadata.input_tokens,
              completion_tokens:
                usageMetadata.candidatesTokenCount ?? usageMetadata.completion_tokens,
              cost_usd: usageMetadata.cost_usd ?? usageMetadata.costUsd,
            }
          : null;
  const inputTokens = Math.max(
    0,
    Math.floor(
      Number(
        usage?.input_tokens ??
          usage?.prompt_tokens ??
          usage?.promptTokenCount ??
          usage?.inputTokens ??
          output?.input_tokens ??
          output?.body?.input_tokens ??
          0,
      ) || 0,
    ),
  );
  const outputTokens = Math.max(
    0,
    Math.floor(
      Number(
        usage?.output_tokens ??
          usage?.completion_tokens ??
          usage?.candidatesTokenCount ??
          usage?.outputTokens ??
          output?.output_tokens ??
          output?.body?.output_tokens ??
          0,
      ) || 0,
    ),
  );
  const totalCostUsd =
    Number(
      usage?.cost_usd ??
        usage?.costUsd ??
        output?.cost_usd ??
        output?.body?.cost_usd ??
        output?.costUsd ??
        output?.body?.costUsd ??
        0,
    ) || 0;
  const inputCostUsd = Number(usage?.input_cost_usd ?? usage?.inputCostUsd ?? 0) || 0;
  const outputCostUsd = Number(usage?.output_cost_usd ?? usage?.outputCostUsd ?? 0) || 0;
  const modelUsed =
    output?.model_key ??
    output?.modelKey ??
    output?.body?.model_key ??
    output?.body?.modelKey ??
    output?.model ??
    output?.body?.model ??
    fallbackModel;
  const provider = output?.provider ?? output?.body?.provider ?? fallbackProvider;
  return {
    inputTokens,
    outputTokens,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd,
    modelUsed: modelUsed != null ? String(modelUsed).trim() || null : null,
    provider: provider != null ? String(provider).trim() || null : null,
  };
}

/** @deprecated Intentional transitional alias — delete once nothing outside this file imports `extractUsageMetrics` by name (prefer extractToolExecUsage). */
export const extractUsageMetrics = extractToolExecUsage;

/**
 * @param {Record<string, unknown>|null|undefined} runContext
 * @returns {boolean}
 */
export function shouldSkipCatalogToolCallLog(runContext) {
  if (!runContext || typeof runContext !== 'object') return false;
  return (
    runContext.skipToolCallLog === true ||
    runContext.skip_tool_call_log === true ||
    runContext.ledgerOwner === 'tool_loop' ||
    runContext.ledger_owner === 'tool_loop'
  );
}
