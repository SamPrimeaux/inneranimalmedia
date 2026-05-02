# Sprint notes — 2026-03-24 (Agent Sam / IAM dashboard)

## Shipped or implemented in repo (pending deploy)

- **Image generation (`imgx` / OpenAI):** Request `b64_json`; if the API returns a hosted `url`, fetch bytes and store (same pattern for edits). Workers AI image extraction broadened in `worker.js` (`extractWorkersAiImageBytes`).
- **Floating preview:** `handlePopOut` covers browser (incl. `/` URLs), view (HTML), draw (`drawPageSrc`), code (new window); popout/close use `stopPropagation`; close uses `×`; mobile tap targets for `.iam-viewer-pop-controls` in `index.css`.
- **Viewer strip:** `settings` removed from `VIEWER_STRIP_TAB_ORDER` in `viewer-panel-strip-icons.jsx` (settings still via Cmd+K / mobile header / vault).
- **Bottom MCP tab:** Server list with status dot; expand per server for endpoint / tools / ping (no raw JSON dump).
- **Terminal dock:** Connection cards (VPS Remote, Local, + Add Connection placeholder) above xterm; reconnect when disconnected/error.
- **Problems tab:** `GET /api/agent/problems` + D1 queries; 60s poll; cards; `worker_analytics_errors` logging on 5xx via `jsonResponse` + top-level fetch `catch` (requires D1 table from `migrations/167_worker_analytics_errors.sql`).
- **`wf_worker_health_check`:** Real steps in `AGENT_BUILTIN_WORKFLOW_STEPS` — `d1_query` (`SELECT COUNT(*) FROM agent_costs`), `terminal` (`pm2 list` via http-exec), `http_health` (`https://inneranimalmedia.com/api/health`). Executor extended with `d1_query` and `terminal` step types in `executeAgentWorkflowSteps`.
- **Chat UI:** Tool-like fenced blocks (json / shell / heuristics) render as `<details>` collapsed by default (`toolOutputSummaryLine` + `AssistantFencedContent`). `DiffProposalCard`: first 8 lines always visible with +/- coloring; overflow in nested `<details>`; button label **Open in Monaco**.

## Queued (after next approved deploy)

- **Stream-level tool aggregation:** Single summary line “Used N tools” when multiple tool results arrive in one assistant turn (needs SSE `tool_result` events or structured message model).
- **Inline proposed-file diff from chat JSON:** When API returns `proposed_file_change` on the assistant message, render a mini diff card (8-line preview + Open in Monaco + Accept/Reject wired to `setProposedFileChange` / DiffEditor) without relying only on `generatedCode` stream events.

## Documentation hygiene

- **`docs/cursor-session-log.md`:** Large (~600kB+); consider periodic archive to `docs/archive/cursor-session-log-YYYY-MM.md` and keeping the active file as last N sessions or a pointer-only tail (no archive run in this sprint).
- **`docs/DEPLOY-CHECKLIST.md`:** Canonical pre-deploy steps (this sprint).

## Verify after deploy

- Trigger **Worker Health Check** workflow; confirm three steps in `workflow_steps` (D1, terminal, HTTP), not a single noop.
- Agent chat: paste a ```json tool result fence and confirm collapsible row.
- Codegen path: confirm `DiffProposalCard` shows 8 lines + **Open in Monaco**.
