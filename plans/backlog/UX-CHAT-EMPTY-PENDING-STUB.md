# [UX] Chat shows literal "(empty)" on load

## Product
Agent Sam / Design Studio chat

## Status
**Partial fix shipped with TELEMETRY-002 follow-up** — UI mapper no longer renders `(empty)`. Deeper pending-stub cleanup still open.

## Problem

On chat load / refresh, the first bubble often shows the literal text `(empty)` (assistant avatar). Common on Design Studio image turns.

## Root cause (verified 2026-07-11)

1. `beginChatTurn` (`agentsam-chat-sessions.js`) reserves a **pending** assistant row with `content: ''` before the stream starts.
2. Image **fast path** (`handleDirectImageGenerationChatStream`) appends a **new** assistant message with markdown image — it does **not** update/finalize the pending stub.
3. `mapAgentSessionMessages` previously fell back blank content → literal `'(empty)'`, so the stub rendered as a visible bubble.

Session evidence: `6e8256ff-c57e-46ef-b216-2073accdc2df` — worker log `assistantMessageId` from `beginChatTurn` + separate image persist; `last_turn_status=done_no_token` (image SSE has no text tokens).

## Fix (done)

`dashboard/lib/mapAgentSessionMessages.ts` — skip blank assistant rows without `imageGenerationState`; never emit `'(empty)'` as display text.

## Follow-up (optional)

- Fast path / stream close should **finalize** the pending assistant message id from `beginChatTurn` instead of appending a second row (or delete the pending stub on image success).
- Same pattern may leave orphan pending rows for other early-SSE paths that never emit text tokens.

## Related

- TELEMETRY-002 image fast path ledger ownership
- `close_done_no_token` / `early_sse_close` audit on image turns
