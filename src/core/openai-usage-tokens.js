/**
 * Normalize token usage from OpenAI-compatible providers without importing
 * telemetry or persistence modules into stream consumers.
 *
 * @param {Record<string, unknown>|null|undefined} usage
 */
export function aggregateOpenAiCompatibleUsageTokens(usage) {
  if (!usage || typeof usage !== 'object') {
    return {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    };
  }
  const cacheHit = Math.max(0, Math.floor(Number(usage.prompt_cache_hit_tokens) || 0));
  const cacheMiss = Math.max(0, Math.floor(Number(usage.prompt_cache_miss_tokens) || 0));
  const prompt = Math.max(0, Math.floor(Number(usage.prompt_tokens) || 0));
  const input =
    cacheHit + cacheMiss > 0
      ? cacheHit + cacheMiss
      : prompt || Math.max(0, Math.floor(Number(usage.input_tokens) || 0));
  return {
    input_tokens: input,
    output_tokens: Math.max(
      0,
      Math.floor(Number(usage.completion_tokens) || Number(usage.output_tokens) || 0),
    ),
    cache_read_input_tokens:
      cacheHit || Math.max(0, Math.floor(Number(usage.cache_read_input_tokens) || 0)),
    cache_creation_input_tokens: Math.max(
      0,
      Math.floor(Number(usage.cache_creation_input_tokens) || 0),
    ),
  };
}
