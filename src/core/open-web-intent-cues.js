/**
 * Pure lexical cues for public-web discovery. Keep this module dependency-free
 * so routing phrases can be tested without loading the Worker runtime graph.
 */
export function hasExplicitOpenWebSearchCue(message) {
  const m = String(message || '').trim().toLowerCase();
  if (!m) return false;

  return (
    /\b(search the web|look it up online|google|find online|search online|web\s*search|latest on|current news|what(?:'s| is) the latest|(?:most )?recent (?:news|updates|docs|models?|releases?)|official docs for|provider documentation)\b/i.test(
      m,
    ) ||
    (/\b(latest|current|today|most recent|202[4-9])\b/i.test(m) &&
      /\b(openai|anthropic|cloudflare|tavily|api|pricing|release notes|changelog)\b/i.test(m))
  );
}
