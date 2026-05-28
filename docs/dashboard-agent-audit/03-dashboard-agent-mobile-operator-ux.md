# Chunk 03 — Mobile operator UX

**Status:** Live-code verified  
**Sprint:** 0 blocker

## Purpose

Document how **live** `/dashboard/agent` behaves on narrow viewports (~&lt;768px) today, and what must change to deliver a **mobile autonomous operator console** — not a squeezed desktop IDE.

## Live production scope

Mobile users hitting **https://inneranimalmedia.com/dashboard/agent** get the **same** `dashboard/App.tsx` bundle with `isNarrowViewport === true`. There is no separate mobile app or `agent-dashboard` build.

## Existing live code paths

| Kind | Path |
|------|------|
| Viewport detection | `dashboard/App.tsx` — `isNarrowViewport` (`window.matchMedia('(max-width: 767px)')`) ~473–485 |
| Hide center when chat/sidebar | `narrowBlocksCenter` ~2594; main `max-md:hidden` ~3016 |
| Back to “editor” | `narrowBackToCenter` ~1466 — clears `activeActivity`, `agentPosition 'off'` |
| Open file from chat | `revealMainWorkspaceIfNarrow` ~1487 — calls `narrowBackToCenter` before code tab |
| Chat overlay | `ChatAssistant.tsx` — `mobileHubTab`, `mobileThreadTab` ~272, ~1725+ |
| Edge swipe | `mobileEdgeSwipeHandlers` ~2123 — swipe from left edge → `narrowBackToCenter` |
| Toasts | e.g. “Browser tab opened. Tap Chat to return to Agent Sam.” ~1569, ~2215 |
| Bottom bar | Mobile activity buttons ~3490+ in `App.tsx` |
| E2E | `tests/e2e/dashboard-agent-workbench.spec.ts` (desktop-oriented; no dedicated mobile spec in repo) |

## What is ALREADY engineered

- **Single-surface discipline (partial):** When chat panel or activity sidebar is open, center workbench hidden via `narrowBlocksCenter` + `max-md:hidden`.
- **Back affordance:** Chevron “Back to editor” when `narrowNeedsBack` (~2607–2616).
- **Chat-first mobile hub:** `mobileHubTab`: `'agents' | 'automations' | 'dashboard'` (~272).
- **Thread sub-tabs on mobile:** `mobileThreadTab` for chat vs context (~1728–1732).
- **Monaco open fix path:** Comment ~1483–1486 — opening Monaco from chat dismisses chat overlay so editor is visible.
- **Agent panel toggle:** `onChatLayoutToggle` — on narrow, toggles activity or cycles agent position (~2111–2120).

## What is PARTIALLY engineered

- **Operator progress:** `toolTraceRows`, `executionPlan` on messages exist on desktop; mobile layout does not prioritize a **progress feed** as primary surface.
- **Stop/cancel:** Present in chat stream path (chunk 09); touch target size not audited for 44px minimum everywhere.
- **Loading confidence:** `AnimatedStatusText` / thinking events exist; not structured as “Read files → Searched → Worked Ns” operator narrative on mobile.

## What is BROKEN

| Pain | Live cause (code) |
|------|-------------------|
| Full Monaco on ~390px | Same `MonacoEditorView` as desktop when code tab open; no operator-only editor mode |
| BrowserView unusable | iframe + toolbar on small height; no mobile browser operator layout |
| Tiny tabs/icons | Desktop tab strip in `App.tsx` ~3100+ without mobile-specific tab model |
| Too many surfaces | Rail + tabs + chat hub + automations — cognitive overload |
| Keyboard/chrome eats viewport | `100dvh` shell (~2603) but chat `fixed` layers; browser URL bar not accounted in designs |
| Touch failures | Small `ToolBtn` in BrowserView (~12px icons); dense activity rail |

**Product credibility:** Mobile today reads as **“tiny desktop IDE”**, not **“operator console”**.

## UX reality today

1. User lands on `/dashboard/agent` — likely sees **chat full screen** if agent panel open.
2. Tapping Files/GitHub opens sidebar; **center hidden** — must back out to see Monaco/browser.
3. Agent opens browser/code — toast says tap Chat to return — easy to lose context.
4. **No default tabs:** Chat / Diff / Preview / Logs as large operator tabs (desired state) — **not implemented**.
5. Full Monaco on phone — **should not be default** for Sprint 0 mobile.

### Desired mobile experience (target — not all built)

- Operator-first, session-first, **one active surface**
- Persistent composer; expandable execution logs
- Patch review cards; task progress feed
- Clear autonomous states (environment ready, read files, searched, explored N files, worked Ns)
- Large touch targets; visible stop; model/tool usage visible
- **Chat / Diff / Preview / Logs** — primary mobile tabs (design target)

## Data / event / execution flow

```text
Mobile load /dashboard/agent
  → isNarrowViewport true
  → User opens chat (agentPosition !== 'off')
  → narrowBlocksCenter true → main workbench display:none (max-md:hidden)
  → User triggers openInMonacoFromChat
  → revealMainWorkspaceIfNarrow() → narrowBackToCenter()
  → setActiveTab('code') → Monaco visible
```

No separate mobile API — same SSE and surfaces as desktop.

## Validation commands

```bash
rg -n "isNarrowViewport|narrowBlocksCenter|narrowBackToCenter|revealMainWorkspaceIfNarrow" dashboard/App.tsx
rg -n "mobileHubTab|mobileThreadTab|max-md" dashboard/components/ChatAssistant/ChatAssistant.tsx dashboard/App.tsx
# Manual: Chrome DevTools device mode 390×844 on https://inneranimalmedia.com/dashboard/agent
```

## Acceptance criteria

- [ ] Team agrees mobile default is **not** full Monaco IDE.
- [ ] Sprint 0 mobile spec references this chunk’s target tabs (Chat/Diff/Preview/Logs).
- [ ] B03-001–003 tracked in chunk 25 with owners.
- [ ] Playwright mobile viewport test added (future — B24 scope).

## Repair backlog IDs

| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B03-001 | Mobile operator mode | `App.tsx`, new `MobileOperatorShell` or route flag | Default mobile = operator console layout | Device test 390px |
| B03-002 | Disable full Monaco mobile default | `App.tsx`, `ChatAssistant` | Code opens as diff/review card unless user opts in | No full IDE layout on first open |
| B03-003 | Single active surface mobile routing | `App.tsx` narrow branch | Only one of chat/diff/preview/logs/browser full screen | E2E mobile viewport |

## Immediate next implementation step

**B03-003 prototype:** Under `isNarrowViewport`, replace `activeTab` strip with four large bottom tabs (`chat` | `diff` | `preview` | `logs`) mapping to existing surfaces — no new backend.
