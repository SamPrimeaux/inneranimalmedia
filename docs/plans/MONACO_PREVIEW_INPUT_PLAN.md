# Monaco diff + browser preview + chat input responsive — implementation plan

## A) Monaco diff flow fix

### Problem
Worker never sends `type: "code"` in the SSE stream. React at [AgentDashboard.jsx](agent-dashboard/src/AgentDashboard.jsx) 1015-1028 already handles `data.type === "code"` and sets `generatedCode`, `filename`, `language` on the assistant message; the "Open in Monaco" button (2066, 2078) and `openInMonaco` (1215-1241) exist but never receive data because no code events are emitted.

### Approach: Parse markdown code blocks from assistant text, emit code events before "done"
- **No new tool.** Use the assistant's final text (after streaming). Before sending the "done" event, parse it for markdown fenced code blocks and emit one or more `type: "code"` events. React currently stores a single `generatedCode` per message, so emit **only the first** code block per turn to avoid overwriting.
- **Format** (already expected by React): `{ type: "code", code: string, filename?: string, language?: string, bucket?: string }`. React uses `data.filename ?? "snippet"`, `data.language ?? "text"`. `bucket` optional (defaults to `defaultBucketForMonacoRef`).

### Worker: shared helper and call sites
1. **Add helper** (worker.js, ~1760): `emitCodeBlocksFromText(fullText, enqueue)` — regex `` /```(\w*)\s*([^\n]*)\n([\s\S]*?)```/g ``, first match only; enqueue `{ type: 'code', code, filename, language }`.
2. **Call before "done"** in: streamOpenAI (~1818-1821), streamGoogle (~1896-1900), streamWorkersAI (~1962-1966), inline Anthropic stream (~3533-3573), chatWithToolsAnthropic (~4860-4873, ~4897-4902, ~4964-4968). Optional: normalize chatWithToolsAnthropic done payload to top-level `input_tokens` / `output_tokens` / `cost_usd` for React.

### React (Monaco)
- No change required for basic flow. Optionally: `bucket: data.bucket ?? m.bucket` in code merge (1017-1027). Optional: strip first ``` block from displayed content when message has `generatedCode`.

---

## B) Browser preview auto-open fix

### Problem
Worker system prompt (worker.js 3305-3306) instructs the agent to output `OPEN_IN_PREVIEW: <full URL>`. React never parses this; it only appends `data.text` to content (1029-1035).

### Plan
1. **Where:** [AgentDashboard.jsx](agent-dashboard/src/AgentDashboard.jsx) 1029-1035, inside `else if (data.type === "text" && data.text)`.
2. **Logic:** After `fullContent += data.text`, match `OPEN_IN_PREVIEW:\s*(https?:\/\/[^\s\n]+)` in `fullContent`. If match: `setBrowserUrl(match[1])`. Set message content to `fullContent.replace(/\n?OPEN_IN_PREVIEW:\s*https?:\/\/[^\s\n]+/g, '').trim()` so the directive is stripped from display.
3. **Regex:** Strict, anchored to `OPEN_IN_PREVIEW:` to avoid matching prose.

---

## C) Implementation order and testing

### Order
1. **Browser preview** first (single file, ~10 lines). Then **Monaco** (worker helper + 5 call sites). Then **Chat input** (section D).

### Testing
- **Browser:** Trigger agent to output `OPEN_IN_PREVIEW: https://example.com`. Verify preview URL updates, iframe loads, line stripped from message.
- **Monaco:** Prompt that produces a code block. Verify SSE includes `type: "code"`, "Open in Monaco" appears, diff view works.
- **Chat input:** Section D testing targets below.

### Risks
- Monaco: regex mis-parse on nested backticks; emit first block only. Browser: keep regex strict. Worker: consistent enqueue signature.

---

## D) Chat input field responsive fix

### Problem (from user report)
- On smaller screens / when browser preview is open, chat input becomes impossible to type in.
- On mobile, agent mode/model selector is in a popup (already implemented).
- Input area has poor flex/fit behavior.

### 1. Audit: chat input layout (AgentDashboard.jsx ~2224-2920)

**Parent chat pane** (1416-1429):
- `flex: previewOpen ? '0 0 ${100 - panelWidthPct}%' : '1 1 0%'` — when preview is open, chat gets a fixed % of width (e.g. 60%).
- `minWidth: 0`, `minHeight: 0`, `overflow: "hidden"`, `display: "flex"`, `flexDirection: "column"`.

**Scrollable messages region** (1870-1881): `flex: 1`, `minHeight: 0`, `overflowY: "auto"`.

**Input bar wrapper** (2232): `flexShrink: 0` — correct.
**Input bar inner** (2234): `flexShrink: 0`, `padding: "12px 16px"`, `background: "var(--bg-nav)"`, `borderTop: "1px solid var(--color-border)"`.

**agent-input-container** (2236-2251):
- `display: "flex"`, `alignItems: "center"`, `gap: window.innerWidth < 768 ? 2 : 10`, `padding: "10px 14px"`, `minHeight: 48`, `width: "100%"`, `maxWidth: 900`, `margin: "0 auto"`.
- No `minWidth`. When chat pane is narrow (e.g. preview open at 40% on 375px → chat ~225px), the row shrinks and the textarea (flex: 1, minWidth: 0) can collapse to near-zero or 0.

**Left controls** (2253-2254): `flexShrink: 0`. **Textarea** (2730-2765): `flex: 1`, `minWidth: 0`, `width: "100%"`, `minHeight: 28`, `maxHeight: 120`, no explicit `minWidth`. **Right controls** (2767, 2778, 2867): `flexShrink: 0`.

**Status bar** (2913-2921): `flexShrink: 0`.

### 2. Mobile-specific styles
- **No media query** targets the input area specifically. The only responsive rule in the input block is `gap: window.innerWidth < 768 ? 2 : 10` (2242).
- `isMobile` is used for connector popup (bottom sheet) and to hide mode/model dropdowns in favor of popup (2511, 2580: `!isMobile`). No conflict with preview panel width; the issue is narrow **chat pane** width when preview is open.

### 3. Specific issue (which style rule breaks on small screens)
- **Root cause:** When the chat pane width is small (preview open or small viewport), the flex row has no minimum width. The textarea has `minWidth: 0`, so it is allowed to shrink to zero. Result: input is unusable (invisible or 0-width).
- **Secondary:** No `minWidth` on the input container allows the whole row to be squashed below a usable size. No touch-friendly styles on the textarea (e.g. `touch-action: manipulation`) can contribute to tap/focus issues on mobile.
- **Z-index:** Input bar has no z-index. Modals (connector popup 10000/10001, cost popover 1001) are above content. If any fixed overlay or the preview panel overlapped the input, taps could be intercepted; the preview panel in this layout is a sibling flex child, not fixed, so stacking is unlikely the main cause. Giving the input bar a modest stacking context (e.g. `position: relative; zIndex: 10`) ensures it stays above the scroll area and any stray overlays.

### 4. Proposed fix — exact style changes

**File:** [AgentDashboard.jsx](agent-dashboard/src/AgentDashboard.jsx). Surgical edits only.

**(a) Input bar wrapper (ensure it never shrinks and has stacking context)**  
- **Lines 2232-2234:** Add `position: "relative"`, `zIndex: 10` to the outer input bar div (2232) so the footer stays above the messages area and is a clear tap target. Keep `flexShrink: 0`.

**(b) agent-input-container (prevent row from collapsing)**  
- **Lines 2238-2250:** Add `minWidth: 0` to the container so the flex child can shrink with the pane without overflowing, and add a **minimum width** so the row never goes below a typeable size, e.g. `minWidth: 200` (or 180 for very small). This keeps the input usable when preview is open on tablet/mobile.

**(c) Textarea (guarantee typeable area and touch)**  
- **Lines 2745-2764:** Add `minWidth: 80` (or 100) so the textarea never collapses to zero. Add `touchAction: "manipulation"` to reduce double-tap zoom and improve tap focus on mobile. Optionally add `WebkitAppearance: "none"` if iOS focus issues persist.

**Summary of edits:**

| Location | Current | Change |
|----------|---------|--------|
| 2232 | `style={{ "--mode-color": ..., flexShrink: 0 }}` | Add `position: "relative", zIndex: 10` |
| 2238-2250 | `style={{ display: "flex", ..., maxWidth: 900, margin: "0 auto" }}` | Add `minWidth: 200` (or 180), keep `minWidth: 0` on container if needed for flex (container already has width 100%; add minWidth for the row) |
| 2745-2764 | textarea style | Add `minWidth: 80`, `touchAction: "manipulation"` |

Clarification: The **container** (2236) has `width: "100%"` and `maxWidth: 900`. So when the chat pane is 225px, the container becomes 225px. The fix is to give the **textarea** a `minWidth: 80` so it never goes below 80px, and give the **container** a `minWidth: 200` so the whole input row doesn’t shrink below 200px (then the pane can overflow-x or the layout can scroll; with the parent having `minWidth: 0`, we need to allow horizontal scroll or ensure the chat pane has a minimum width). Safer approach: only set **textarea** `minWidth: 80` and **container** `minWidth: 200`. If the chat pane is 225px, the container will be 225px and the textarea will be at least 80px; the rest (buttons + gaps) will take the remaining ~145px. So the container minWidth should not exceed what we want for the whole bar — 200px is a reasonable minimum so the bar never disappears. When pane is 225px, container is 225px (> 200), so we’re good. When pane is 180px (e.g. 30% on 600px), container would try to be 200px; the parent has `minWidth: 0`, so the container would get 180px and could overflow. So either (1) chat pane gets `minWidth: 200` so it never goes below 200px when preview is open, or (2) container has `minWidth: 200` and the chat pane allows horizontal scroll. Option (1) is cleaner: give **iam-chat-pane** (1418) a `minWidth: 200` when preview is open, so the chat pane never shrinks below 200px. Then the input container (100% of that) is always at least 200px and the textarea minWidth: 80 keeps the field typeable. So:

**Final proposed style changes:**
1. **Line 2232:** Add `position: "relative", zIndex: 10` to input bar wrapper.
2. **Line 1418 (chat pane):** Add `minWidth: previewOpen ? 200 : 0` (or 220) so when preview is open the chat pane never goes below 200px.
3. **Lines 2238-2250 (agent-input-container):** Add `minWidth: 0` if not present (so container can shrink within the pane) — already has width 100%. So only ensure textarea has minWidth.
4. **Lines 2745-2764 (textarea):** Add `minWidth: 80`, `touchAction: "manipulation"`.

That way we don’t overflow the pane; we enforce a minimum pane width when preview is open.

### 5. Testing targets (section D)
- **Mobile viewport (375px, 414px):** Without preview: input full width, typeable. With preview open (e.g. 50%): chat pane 187px / 207px — below 200px; with minWidth: 200 the pane stays 200px and the preview gets the rest. Verify input is typeable and not covered.
- **Tablet with preview open (768px):** e.g. 60% chat / 40% preview → chat 460px. Input bar 100%, textarea has room. Verify no overlap, tap focuses textarea.
- **Desktop with preview open (1024px+):** Same; verify resize doesn’t collapse input.

---

## Summary: A + B + C + D

| Section | What | Files | Key changes |
|--------|------|-------|-------------|
| A | Monaco diff | worker.js | Helper `emitCodeBlocksFromText`; call before "done" in 5 stream paths |
| B | Browser preview | AgentDashboard.jsx | Parse OPEN_IN_PREVIEW in text handler; setBrowserUrl; strip line from content |
| C | Order & testing | — | Implement B → A → D; test each |
| D | Chat input responsive | AgentDashboard.jsx | Chat pane minWidth when preview open; input bar zIndex; textarea minWidth + touchAction |

No changes to FloatingPreviewPanel.jsx, agent.html, or worker auth/OAuth handlers.

---

Plan ready. Type **approved** to implement or suggest changes.
