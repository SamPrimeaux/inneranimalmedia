# [UX] Agent chat surface layouts — center / side / hidden

## Product
Agent Sam shell (`/dashboard/agent/*`, Design Studio, Draw, editor)

## Status
**Partial fix shipped** — empty hollow canvas on conversation routes. Broader surface SSOT still open.

## Clarification (telemetry)

Image generation **fast path** is **message-intent** driven (`isPrimaryImageGenerationIntent` in `agent-chat-spine.js`), not Design Studio–only. Starting at `/dashboard/agent/new` with “Create a visual…” still hits `handleDirectImageGenerationChatStream` and bypasses the tool loop. Design Studio is one host surface; the chat spine is shared.

## Problem (layout)

On `/dashboard/agent/{conversationId}` after an image (or after any earlier workbench tab stayed open), the shell can show:

- Empty grey **center** canvas (no tabs, no content)
- Chat squeezed into a **right rail**

### Root cause

1. `resolveAgentChatLayout`: center-chat routes (`/agent`, `/new`, `/agent/{id}`) flip to `right-rail` when `isAgentWorkbenchSurfaceActive` (activeTab `browser`|`cms`|`code`, or `hasActiveFile`).
2. `isCenterChatAtmospheric` was true for **all** center-chat routes, including when layout had already flipped to a rail — so workbench **tabs stayed hidden** (`!isCenterChatAtmospheric`).
3. Result: rail chat + hollow center with no way to see/close the workbench tab that forced the flip.
4. Stale SPA state (`activeTab` left on `browser` from an earlier turn) can re-trigger this on a pure chat conversation.

Images themselves correctly persist **in the chat transcript** (good). They should not require a separate center surface.

## Fix (done)

| Change | Intent |
|--------|--------|
| `isCenterChatAtmospheric` only when `agentChatLayout === 'center'` | Side-rail always shows workbench chrome |
| On center-chat routes without `activeFile`, reset `browser`/`cms`/`code` → `Workspace` | Pure chat stays center; no hollow canvas from stale tabs |

## Desired product contract (follow-up)

| Mode | When | Chat | Center |
|------|------|------|--------|
| **Center** | `/agent/new`, `/agent/{id}`, atmospheric home — no live workbench surface | Full-bleed composer | Chat IS the page |
| **Right/left rail** | Editor with file, explicit Browser/CMS/Code, Design Studio post-entry, CMS fullscreen | Side panel | Real surface content |
| **Hidden** | CMS fullscreen operator choice, `agentPosition=off` on non-chat hosts | Off | Host product only |

Images / drafts stay **in-message** on center mode. Do **not** auto-`surface_open` to Browser for `imgx_*` / image fast path.

## Follow-ups

1. Explicit `surface: 'image'` in SSE should be a no-op for shell layout (or open a future Images panel) — today it resolves to null, which is fine.
2. Document SSOT in `shellLayoutMeta.ts` + one dashboard smoke matrix (new → image → still center; editor+file → rail; close file → back).
3. Optional: “Close workbench / back to chat” control when rail is open on a conversation URL.

## Related

- `plans/backlog/UX-CHAT-EMPTY-PENDING-STUB.md` — `(empty)` pending assistant stub
- `plans/active/TELEMETRY-002-paid-tool-usage-cost.md` — fast path ledger (any agent route)
