# CMS realtime edit loop — ChatAssistant, BrowserView, Monaco

This documents how the dashboard ties together **live inspection**, **source editing**, and **Agent Sam** for CMS/theme workflows.

## Roles

1. **BrowserView** — Visual surface over an iframe (and CDT hooks). It navigates, highlights elements, captures computed styles, and exposes a structured payload when the user picks an element (`iam-element-selected` → `iam:browser-element-selected`).
2. **Monaco** — Code editor for local files, R2-backed artifacts, or GitHub paths (depending on integrations). User and Agent Sam edits land here before draft/publish steps.
3. **ChatAssistant** — Agent Sam’s UI. It receives BrowserView selection context (appended as JSON to the next `/api/agent/chat` message when present), Monaco/active-file context via `@file` / `@monaco` builders, and workspace identity from `window.__IAM_WORKSPACE_ID__`.
4. **`cms_pipeline` (workspace `settings_json`)** — Output routing and capability flags (storage target, R2 metadata, GitHub paths, Agent Sam CMS permissions, BrowserView/Monaco flags). Resolved at runtime from `GET /api/settings/workspace`; **no hardcoded workspace or tenant IDs**.

## Event bridge

Prefer existing patterns; additive events:

| Event | Purpose |
|--------|---------|
| `iam:browser-element-selected` | Structured element payload for ChatAssistant / Agent Sam |
| `iam:agent-context-attach` | Optional bundle (`browser_element`) for tooling |
| `iam-browser-navigate` | Already used for agent-driven navigation |

Payload shape matches `browser_element_selected` in product spec (`workspace_id`, `url`, `route_path`, `selector`, `tag`, `classes`, `text`, `computed_styles`, `cms_mapping`, `source_mapping`).

## Flow (happy path)

1. User selects an element in BrowserView → structured payload dispatches on `window`.
2. ChatAssistant stores the payload and shows a composer chip; on send, JSON is appended to the user message for the worker.
3. Agent Sam classifies target: CMS section vs R2/static file vs GitHub vs theme token — using workspace `cms_pipeline` and integrations **as configured** (never fake “green” capabilities).
4. Draft edits go through CMS/theme draft tables and preview refresh; publish runs only after approval when `validation.require_approval_publish` is set.

## Workspace settings

`/dashboard/settings/workspace` edits `workspaces.settings_json.cms_pipeline` via `PATCH /api/settings/workspace`. Theme packaging uses **`canUsePlatformAssetsR2Upload`** (`cms-theme-resolve.js`): env allowlists (`CMS_THEME_PLATFORM_WORKSPACE_IDS`, `CMS_THEME_PLATFORM_TENANT_IDS`) or workspace flags (`platform_r2_upload`, `storage_output: platform_r2`).
