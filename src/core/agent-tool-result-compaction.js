export const CONSUMED_TOOL_RESULT_CHAR_CAP = 4000;

function summarizeJsonValue(value, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (depth >= 2) {
    return Array.isArray(value)
      ? `[array:${value.length}]`
      : `[object:${Object.keys(value || {}).length}]`;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => summarizeJsonValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, item]) => [key, summarizeJsonValue(item, depth + 1)]),
    );
  }
  return String(value);
}

function compactString(value, maxChars) {
  const text = String(value ?? '');
  if (text.length <= maxChars) return { value: text, removed: 0 };

  try {
    const parsed = JSON.parse(text);
    const compactedJson = JSON.stringify({
      _compacted: {
        after_first_model_pass: true,
        original_chars: text.length,
        kind: Array.isArray(parsed) ? 'array' : typeof parsed,
        ...(Array.isArray(parsed) ? { original_items: parsed.length } : {}),
      },
      preview: summarizeJsonValue(parsed),
    });
    if (compactedJson.length <= maxChars) {
      return { value: compactedJson, removed: text.length - compactedJson.length };
    }
    let previewChars = Math.max(64, maxChars - 320);
    let minimalJson = '';
    do {
      minimalJson = JSON.stringify({
        _compacted: {
          after_first_model_pass: true,
          original_chars: text.length,
          kind: Array.isArray(parsed) ? 'array' : typeof parsed,
        },
        preview_text: text.slice(0, previewChars),
      });
      previewChars = Math.floor(previewChars / 2);
    } while (minimalJson.length > maxChars && previewChars >= 32);
    return {
      value: minimalJson,
      removed: text.length - Math.min(text.length, minimalJson.length),
    };
  } catch {
    // Plain text keeps a head/tail representation below.
  }

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
