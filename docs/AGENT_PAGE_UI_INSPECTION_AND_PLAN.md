# Agent page UI: inspection, plan, and simple-English summary

**Scope:** [https://www.inneranimalmedia.com/dashboard/agent](https://www.inneranimalmedia.com/dashboard/agent) — minor UI tweaks, chat scroll behavior, and browser rendering inside the existing UI.

---

## 1. Inspection results

### Footer

- **Shell footer:** The HTML has an `#agent-footer-chat` bar (context gauge, $ gauge, "Chat ▼" expand) and a `.dashboard-mobile-footer`. On the agent page, **both are hidden** via `body.agent-dashboard-page #agent-footer-chat, body.agent-dashboard-page .dashboard-mobile-footer { display: none }`. So the shell footer is not visible and not “locked” on the agent route — by design, because the React app provides its own input row.
- **React “footer” (input row):** The Agent dashboard has a bottom bar (agent picker, model picker, textarea, context/$ gauges, preview button, send). It’s in a flex column with `flexShrink: 0`, so it’s intended to stay at the bottom. If the **chat column** doesn’t constrain height correctly, the whole column (including that bar) can grow with content and the page can feel like it’s scrolling instead of the messages area scrolling.

### Chat scroll behavior (why the page feels broken)

- **Intended layout:** Outer container is flex column with `overflow: hidden`; the messages block has `flex: 1`, `minHeight: 0`, `overflow: "auto"` so only that block scrolls; the input row has `flexShrink: 0` so it stays at the bottom.
- **What’s going wrong:** The scroll chain depends on every parent having a bounded height. The shell uses `main.agent-page-main` (flex, overflow hidden) and `#agent-dashboard-root` (height 100%, overflow hidden). If `html`/`body` don’t have an explicit height (e.g. `height: 100%`), or if the React root doesn’t fill the main, the flex child that’s supposed to scroll can grow with content instead of taking a fixed viewport height. Result: the whole page gets longer as chat grows, and the input row moves down with it instead of staying fixed at the bottom.
- **Indexed when requested:** Not implemented yet. Could mean: deep-link to a session (`?session=id`) or scroll-to-message; session list already exists and can be wired to URL/scroll.

### Browser / preview panel (existing)

- **Location:** Right-hand panel when “+ PREVIEW” is open: URL input, LOAD, and a **SCREENSHOT** button (currently no-op). There’s an iframe that shows `previewUrl` when a URL is loaded.
- **Backend:** `POST /api/agent/playwright` creates a job (`screenshot` or `render`); queue consumer runs Puppeteer and updates `playwright_jobs` with `result_url`; `GET /api/agent/playwright/:id` returns status and `result_url`. Tables exist after migration 116.

---

## 2. Plan (concise)

| # | Task | What we’ll do |
|---|------|----------------|
| 1 | **Lock layout so only chat scrolls** | (Shell) Ensure `html, body` have `height: 100%` when agent page so the flex chain is bounded. (React) Keep root as flex column with `height: 100%`; ensure the **messages wrapper** is the only scrollable region (`flex: 1`, `minHeight: 0`, `overflow-y: auto`) and the **input row** stays `flexShrink: 0`. Optionally make the icon bar + workflow tabs a single sticky header so they don’t scroll away. |
| 2 | **Optional: compactable header** | Allow collapsing the workflow tabs (or icon bar) so more vertical space goes to the message list; one small toggle or “compact” mode. |
| 3 | **Optional: indexed / deep-link** | When a session is selected from the list, set `?session=id` and scroll to bottom (or to a selected message if we add that later). |
| 4 | **Browser rendering in this UI** | Use the **existing** preview panel. Wire **Screenshot**: on click, if `previewUrl` is set, POST `/api/agent/playwright` with `{ url: previewUrl, job_type: 'screenshot' }`; poll `GET /api/agent/playwright/:id` until `status === 'completed'` or `'failed'`; then show the image in the panel (e.g. `<img src={result_url} />`) or in a second view. Add **Render** the same way with `job_type: 'render'` and show the result (e.g. iframe with result_url or HTML content). No separate app or page. |

---

## 3. Simple English summary (before we begin work)

- **Footer:** On the agent page the shell’s footer chat bar and mobile footer are intentionally hidden. The “footer” you see is the React app’s input row; we’ll keep it fixed at the bottom by fixing the scroll layout.
- **Chat scroll:** Right now the whole page can grow when the conversation gets long, so the UI feels broken. We’ll fix it so the **only** thing that scrolls is the message list above the input bar. The header (icon bar and workflow tabs) will stay at the top of the chat column, and the input row will stay at the bottom. We can add a way to collapse the header to get more room for chat.
- **Browser rendering:** You already have a preview panel with a URL field and an iframe. We’ll add real behavior to the **Screenshot** button (and a **Render** button): they’ll call the existing backend (create job → poll → get result URL), then show the screenshot image or the rendered page in that same panel. No new page or separate tool UI — everything stays inside the current agent dashboard and preview pane.

Once you’re good with this, we’ll implement in this order: (1) layout/scroll fix so chat scrolls and footer stays put, (2) wire Screenshot and Render in the preview panel, (3) optional header collapse and session deep-link.
