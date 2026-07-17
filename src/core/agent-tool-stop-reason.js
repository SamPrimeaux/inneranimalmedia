export function normalizeOpenAiToolStopReason(finishReason, pendingToolCallCount = 0) {
  if (Number(pendingToolCallCount) > 0) return 'tool_use';
  const reason = String(finishReason || '').trim();
  if (reason === 'tool_use' || reason === 'tool_calls') return 'tool_use';
  if (!reason || reason === 'stop' || reason === 'end_turn' || reason === 'completed') {
    return 'end_turn';
  }
  return reason;
}
