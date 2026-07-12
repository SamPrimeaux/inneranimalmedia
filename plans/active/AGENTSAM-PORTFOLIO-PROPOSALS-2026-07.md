# Agent Sam — Portfolio Proposals (2026-07-11)

Each product owns a **proposed agent portfolio** — specialized agents with lane, model cohort, tools, and success criteria. Agents design agents via **L4 Architect → Builder → Verifier → Operator** lifecycle.

**SSOT lanes:** [`AGENTSAM-CONCEPTUAL-LANES-2026-07.md`](./AGENTSAM-CONCEPTUAL-LANES-2026-07.md)

---

## Platform — `docs/products/agent-sam/AGENTSAM.md`

| Agent slug | Lane | Primary model | Purpose |
|---|---|---|---|
| `platform_architect` | L4 | Sol | Cross-service architecture, risk, escalation design |
| `agent_architect` | L4 | Sonnet 5 | Agent specs, workflows, behavioral contracts |
| `implementation_engineer` | L2 | Codex | Worker/D1/migration/terminal execution |
| `code_navigator` | L3 | Sonnet 5 + DeepSeek flash | search_code, schema discovery |
| `architecture_verifier` | L5 | Gemini 3.5 Flash | Independent review, browser-visible checks |
| `daily_operator` | L1 | Terra | Chat, tool orchestration, project status |
| `volume_scribe` | L1 | Luna | Drafts, classification, bounded workers |
| `benchmark_control` | B | GPT-5.5 | Manual eval vs Sol (not Auto) |

**Editor surface (`/dashboard/agent/editor`):** default bind `implementation_engineer` + `code_navigator`; chat rail uses `daily_operator`; escalate to `platform_architect` on infra/C3 fixtures.

---

## Create — `docs/products/create/AGENTSAM.md`

| Agent slug | Lane | Primary | Purpose |
|---|---|---|---|
| `create_router` | L0 | Luna | Phase pick: sketch vs CAD vs mesh |
| `sketch_assistant` | L6 | Gemini image + Draw surface | Sam Sketch, excalidraw intent |
| `cad_planner` | L4 | Sonnet 5 | Phase routing, BOSL2/Arch intent |
| `cad_builder` | L2 | Codex | OpenSCAD/FreeCAD script mutation |
| `mesh_director` | L6 | Meshy lane | Character/prop generation |
| `cad_verifier` | L5 | Gemini 3.5 Flash | GLB preview, dimension sanity |

**Portfolio rule:** Create never uses Sol for sketch — reserve Sol for architecture disputes only.

---

## Design Studio — `docs/products/design-studio/AGENTSAM.md`

| Agent slug | Lane | Primary | Purpose |
|---|---|---|---|
| `cadcreator` | L2 | Codex | Existing subagent — repo + terminal |
| `design_director` | L4 | Sol | Complex multi-engine projects |
| `script_author` | L2 | Codex + DeepSeek pro | openscad/freecad scripts |
| `visual_inspector` | L5 | Gemini 3.5 Flash | Rendered output, browser QA |
| `job_operator` | L1 | Terra | `agentsam_cad_jobs` status, R2 paths |

**Truth:** Runner down → say so; never fake live preview.

---

## CMS — `docs/products/cms/AGENTSAM.md`

| Agent slug | Lane | Primary | Purpose |
|---|---|---|---|
| `cms_platform_editor` | L2 | Codex | IAM PrimeTech pages, KV bootstrap |
| `cms_client_bridge` | L2 | Terra | Federated worker admin API |
| `publish_verifier` | L5 | Gemini 3.5 Flash | D1 → R2 → KV path checks |
| `content_strategist` | L4 | Sonnet 5 | IA, page structure, messaging |

**Gap to close:** Editor loop must match `/dashboard/agent/editor` reliability before agent edits ship to prod CMS.

---

## Movie Mode — `docs/products/movie-mode/AGENTSAM.md`

| Agent slug | Lane | Primary | Purpose |
|---|---|---|---|
| `media_pipeline_ops` | L1 | Terra | Batch render, queue coordination |
| `asset_search` | L3 | DeepSeek flash + media vector | RAG over `AGENTSAM_VECTORIZE_MEDIA` |
| `render_planner` | L4 | Sonnet 5 | Timeline-adjacent batch plans |
| `visual_qa` | L5 | Gemini 3.5 Flash | Frame/still inspection |
| `conversion_worker` | L6 | specialist transcode tools | ffmpeg-style lanes |

**Gap:** Add `route_key` to `dashboardRouteContext.ts` for quick actions.

---

**Gap:** Add `route_key` to `dashboardRouteContext.ts` for quick actions.

---

## Editor IDE — proposed agent binding

Editor route resolves agents from **session workspace** + D1 routing — never hardcoded repo names.

| UI zone | Agent slug | Lane |
|---|---|---|
| File tree + sessions | `code_navigator` | L3 |
| Monaco / terminal | `implementation_engineer` | L2 |
| Chat side panel | `daily_operator` | L1 |
| Preview / browser split | `visual_inspector` | L5 |

---

## Qualification sequence (portfolio-level)

1. **Platform** — C3 infra fixture (`platform_architect` + `implementation_engineer`)
2. **Editor** — C1 repo feature on `inneranimalmedia`
3. **Design Studio** — CAD script + GLB verify
4. **CMS** — publish path verifier only (read-only first)
5. **Movie Mode** — asset search + visual QA
6. **Create** — sketch → CAD handoff
7. **Economics** — DeepSeek + Terra compression vs winners

Each phase produces: agent slug, D1 arm rows, eval fixture id, accept/reject score.
