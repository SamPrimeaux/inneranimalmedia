export const CONSUMED_TOOL_RESULT_CHAR_CAP = 4000;

function compactString(value, maxChars) {
  const text = String(value ?? '');
  if (text.length <= maxChars) return { value: text, removed: 0 };

  const markerReserve = 96;
  const available = Math.max(256, maxChars - markerReserve);
  const headChars = Math.floor(available * 0.8);
  const tailChars = available - headChars;
  const removed = text.length - headChars - tailChars;
  const marker = `\n…[compacted after first model pass; ${removed} chars omitted]…\n`;

  return {
    value: `${text.slice(0, headChars)}${marker}${text.slice(-tailChars)}`.slice(0, maxChars),
    removed,
  };
}

/**
 * Compact tool outputs only after a model has consumed them once.
 *
 * The tool-call IDs and message/block structure remain intact for provider
 * protocol validity. Newly produced results stay full-fidelity until the next
 * model pass; older results stop compounding the prompt on every loop turn.
 *
 * @param {Array<Record<string, any>>} messages
 * @param {{ maxChars?: number }} [opts]
 */
export function compactConsumedToolResultsInPlace(messages, opts = {}) {
  if (!Array.isArray(messages)) {
    return { compactedBlocks: 0, removedChars: 0 };
  }

  const maxChars = Math.max(
    512,
    Math.floor(Number(opts.maxChars) || CONSUMED_TOOL_RESULT_CHAR_CAP),
  );
  let compactedBlocks = 0;
  let removedChars = 0;

  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;

    if (message.role === 'tool' && typeof message.content === 'string') {
      const compacted = compactString(message.content, maxChars);
      if (compacted.removed > 0) {
        message.content = compacted.value;
        compactedBlocks += 1;
        removedChars += compacted.removed;
      }
      continue;
    }

    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (
        !block ||
        typeof block !== 'object' ||
        block.type !== 'tool_result' ||
        typeof block.content !== 'string'
      ) {
        continue;
      }
      const compacted = compactString(block.content, maxChars);
      if (compacted.removed > 0) {
        block.content = compacted.value;
        compactedBlocks += 1;
        removedChars += compacted.removed;
      }
    }
  }

  return { compactedBlocks, removedChars };
}
