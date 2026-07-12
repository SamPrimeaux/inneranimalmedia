# Agent Sam — Conceptual Lanes (2026-07-11)

**Purpose:** Organize model routing, agent portfolios, and spend so nothing fires “random lottery” arms. Every request maps to **one lane** → **one primary model** → optional **challenger** → **escalation** only on failure.

**Law:** Lanes bind to `task_type` + `routing_lane` in D1 — not vibes in chat. Thompson sampling **off** during qualification; fixed priority within lane.

---

## Lane map (8 lanes)

```text
L0 SCOUT      → classify / gate only          (never builds)
L1 OPERATE    → daily volume, bounded tools   (Luna → Terra)
L2 BUILD      → repo mutation + terminal      (Codex → Sonnet 5 → Sol)
L3 SEARCH     → codebase + schema discovery   (Sonnet 5 → DeepSeek flash → Gemini)
L4 ARCHITECT  → system + agent design         (Sol ↔ Sonnet 5 duel)
L5 VERIFY     → review, browser, multimodal   (Gemini → Sonnet 5)
L6 MEDIA      → image/video/embed specialists (never LM power tier)
L7 ECONOMICS  → cost compression challengers  (DeepSeek, Terra vs winner)
B  BENCHMARK   → manual pin only               (GPT-5.5, Sonnet 4.6 incumbent)
```

---

## L0 — SCOUT (classify with judgment, not cheap noise)

| Role | Primary | Fallback | task_types |
|---|---|---|---|
| Intent classification | **GPT-5.6 Sol** | Luna | `intent_classification` |
| Route gate | Luna | Haiku | `gate` |

**Rationale:** Classification sets the whole run — wrong `task_type` burns more than Sol’s classify cost. Sol owns **intent_classification**; Luna/Haiku stay on cheap **gate** only.

**Never on L0 classify:** Haiku, nano, WAI, Gemma, Flash-lite (paused during qualification).

---

## L1 — OPERATE (high volume, bounded authority)

| Role | Primary | Escalation | task_types |
|---|---|---|---|
| Chat / assistant | Terra | Sol | `chat`, `tool_use` (light) |
| Email / status / scheduling | Luna | Terra | `subagent_worker`, ops fixtures |
| Customer response draft | Luna | Terra → Sonnet 5 | custom ops workflows |
| Tool execution (routine) | Terra | Sol | `tool_use`, `terminal_execution` (non-mutating) |

**Spend cap:** Luna/Terra only until task proves need for L2+.

---

## L2 — BUILD (repository mutation)

| Role | Primary | Challenger | Escalation | task_types |
|---|---|---|---|---|
| Implementation | Codex | Sonnet 5 | Sol | `code`, `code_gen`, `terminal_execution` |
| Refactor / patch | Codex | Sonnet 5 | — | `code`, `refactor` |
| Deploy / ship | Codex | Terra | Sol | `terminal_execution` |
| CAD script | Codex | Sol | Gemini | `designstudio_cad_script` |

**Rule:** Codex owns **writes**; Sonnet 5 owns **understanding**; Sol owns **judgment calls** on risky edits.

---

## L3 — SEARCH (read-only discovery)

| Role | Primary | Challenger | Escalation | task_types |
|---|---|---|---|---|
| Code search | Sonnet 5 | DeepSeek V4 Flash | Gemini 3.5 Flash | `search_code` |
| Schema / D1 discovery | Sonnet 5 | DeepSeek V4 Flash | Terra | `search_code`, `sql` |
| Long-context repo read | Sonnet 5 | Gemini 3.5 Flash | Sol | `research` |

**DeepSeek stays in matrix** as L3 volume + L7 economics challenger — not removed.

---

## L4 — ARCHITECT (agents design agents)

| Role | Primary | Challenger | Delivers |
|---|---|---|---|
| Platform architect | Sol | Sonnet 5 | subsystem design, risk, escalation |
| Agent-system designer | Sonnet 5 | Sol | agent specs, workflows, contracts |
| Infrastructure planner | Sol | Sonnet 5 | Worker+D1+Queue+DO plans |
| Agent Architect (formal) | Sol ↔ Sonnet 5 | rotate | full agent portfolio proposal |
| Agent Builder | Codex | Sonnet 5 | D1 rows, handlers, tests |
| Agent Operator | Terra | Luna | runs approved agents |
| Agent Maintainer | Sonnet 5 | Sol | trace-driven bounded fixes |

**Rule:** designer ≠ verifier (different provider).

---

## L5 — VERIFY (independent review)

| Role | Primary | Challenger | task_types |
|---|---|---|---|
| Code review | Sonnet 5 | Sol | `review` |
| Architecture review | Sonnet 5 | Gemini 3.5 Flash | `plan`, `review` |
| Browser / visual QA | Gemini 3.5 Flash | Sol | browser fixtures, frontend C2 |
| Agent Verifier | Gemini 3.5 Flash | Sol | agent qualification runs |

---

## L6 — MEDIA (specialist models only)

| Role | Model | Never route to |
|---|---|---|
| Text RAG embed | text-embedding-3-large | chat LM |
| Media embed | gemini-embedding-2 | chat LM |
| Image gen | gpt-image-2, Gemini image | Sol/Sonnet |
| Video | Veo 3.1* | chat LM |

Text LMs **plan and QA** media — they do not replace generators.

---

## L7 — ECONOMICS (compression after proof)

Run **only after** L2/L3/L4 winner accepted on a fixture.

| Challenger | Tests against | Win condition |
|---|---|---|
| DeepSeek V4 Flash | Sonnet 5 on search_code | same accuracy, lower $/task |
| DeepSeek V4 Pro | Codex on hard debug | acceptable quality at lower $ |
| Terra | Sol on same infra fixture | ≥ acceptance threshold, ≤50% cost |
| Luna | Terra on ops fixture | bounded task, ≥ quality bar |

---

## B — BENCHMARK (manual pin, not Auto)

| Model | Use |
|---|---|
| GPT-5.5 | Historical control vs Sol |
| Sonnet 4.6 | Winner-stays S1–S5 vs Sonnet 5 |

---

## Lane → model quick reference

| Lane | P0 models |
|---|---|
| L0 Scout | **Sol** (classify), Luna (gate), Haiku (gate fallback) |
| L1 Operate | Luna, Terra |
| L2 Build | Codex, Sonnet 5, Sol |
| L3 Search | Sonnet 5, **DeepSeek flash**, Gemini 3.5 Flash |
| L4 Architect | Sol, Sonnet 5 |
| L5 Verify | Gemini 3.5 Flash, Sonnet 5 |
| L6 Media | embed/image/video catalog |
| L7 Economics | **DeepSeek flash/pro**, Terra, Luna |
| B Benchmark | GPT-5.5, Sonnet 4.6 |

---

## Anti-patterns (pause = money burn)

- Thompson lottery across L0–L5 in one `task_type`
- Haiku on `plan` / `code`
- GPT-5.4* anywhere in Auto
- WAI `@cf/*` swarms on builder lanes
- gemini-3.1-pro* (use 3.5 Flash)
- Same model as architect **and** verifier
- Sol/Luna on “hey what’s up” without L1 classification

---

## Product surfaces → default lane

| Surface | Default lane | Primary agent role |
|---|---|---|
| `/dashboard/agent/editor` | L2 Build + L3 Search | Implementation engineer |
| `/dashboard/agent` (chat) | L1 Operate | General assistant |
| `/dashboard/designstudio` | L2 Build + L6 Media | CAD creator |
| `/dashboard/cms` | L2 Build + L5 Verify | CMS operator |
| `/dashboard/moviemode` | L6 Media + L5 Verify | Media pipeline |
| `/dashboard/draw` | L6 Media | Sketch assistant |
| Agent portfolio design | L4 Architect | Agent Architect |

See [`AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md`](./AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md) for per-product agent rosters.
