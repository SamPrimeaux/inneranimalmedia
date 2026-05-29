# Agent Sam — Open Web Lane Design (implemented)

**Date:** 2026-05-29  
**Status:** Wired in runtime (see `src/core/agent-lane-router.js`)

---

## Four lanes (mutually exclusive primary)

| Lane | Tool(s) | Backend | When |
|------|---------|---------|------|
| `open_web_search` | `search_web` | Provider-native (future) → Tavily/`SEARCH_API_KEY` | Latest/public internet discovery |
| `web_fetch` | `web_fetch` | `fetch()` + domain allowlist | User gave a URL to read/extract |
| `browser_inspect` | `browser_*`, `cdt_*`, MYBROWSER | Cloudflare Browser Rendering | DOM, screenshot, click, live UI |
| `workspace_grep` | `fs_search_files`, `workspace_*`, `github_search_code` | PTY `rg` (planned) / catalog | Repo symbols, grep, codebase |

---

## 3-tier open-web stack

1. **Provider-native** — `agentsam_ai.supports_web_search = 1` on selected model (`resolveOpenWebSearchBackend`). Provider wiring in dispatch is a follow-up; tier is detected and logged.
2. **`search_web` tool** — Tavily when `TAVILY_API_KEY` or `SEARCH_API_KEY` set (`src/tools/builtin/web.js`).
3. **Unavailable** — tool hidden from manifest; handler returns `web_search_unavailable` if called.

---

## Anti-waste rules (enforced in `agent-lane-router.js`)

**Open web only when:**

- Latest/current/public info, external docs, provider comparison, stale internal knowledge

**Never open web for:**

- Repo symbols / grep / `agentsam_*` / D1 / R2 / Monaco paths / live UI inspection

---

## Mode policy

| Mode | `search_web` |
|------|----------------|
| ask | Allowed when lane = open_web_search (fast path still tool-less until ask path grows tools) |
| agent | Allowed when lane matches |
| plan | Allowed for research lane |
| debug | Allowed only for external-docs style queries (not workspace grep) |
| multitask | Allowed when lane matches (research subagent refinement later) |

---

## Runtime integration points

| File | Change |
|------|--------|
| `src/core/agent-lane-router.js` | Lane classification + tool filter |
| `src/core/capability-router.js` | Classifier flags + prompt |
| `src/core/tool-capability-filter.js` | Lane-first narrowing; `search_web` ∉ browser |
| `src/api/agent.js` | Families, SSE `execution_lane_selected`, logging |
| `src/tools/builtin/web.js` | `web_fetch` handler; clearer `search_web` errors |
| `src/tools/ai-dispatch.js` | Split open-web vs MYBROWSER dispatch |
| `migrations/453_web_fetch_agentsam_tool.sql` | Catalog row for `web_fetch` |

---

## Log line

```text
[agent] execution_lane_selected {"lane":"open_web_search","reason":"public_web_research",...}
```

SSE: `execution_lane_selected` on chat stream when capability block runs.

---

## Follow-ups (not in this slice)

- Provider-native OpenAI Responses / Anthropic web_search tool injection in `provider.js`
- `fs_search_files` PTY `rg --json` handler (see terminal parity plan)
- Ask-mode fast path: optional read-only `search_web` for public-info questions
