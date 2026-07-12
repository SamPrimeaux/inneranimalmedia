# Agent Sam — Frontier Qualification Matrix (2026-07-11)

**SSOT for pause wave + slow-test sequence.** No hardcoded model strings in hot paths — all routing via D1 `agentsam_model_catalog` + `agentsam_routing_arms`.

**Posture:** Sol designs and resolves · Sonnet 5 challenges and structures · Codex implements · Gemini inspects and competes on code/design · Terra operates · Luna handles bounded daily volume.

**Cost guard (unchanged):** `claude-opus-4-8` paused · `claude-fable-5` inactive — not in this matrix until cheap lanes prove out.

---

## 1. Pricing ladder (cheapest → highest)

Standard API rates per **1M tokens**. Example column = 250k in + 25k out (no tools/cache/retries).

| Model | Input | Output | Example run | Position |
|---|---|---|---|---|
| Gemini 3.5 Flash | $0.75 | $4.50 | $0.30 | Cheapest serious challenger |
| GPT-5.6 Luna | $1.00 | $6.00 | $0.40 | High-volume GPT-5.6 |
| Claude Sonnet 5 (promo) | $2.00 | $10.00 | $0.75 | Through **2026-08-31** |
| GPT-5.3 Codex | $1.75 | $14.00 | $0.79 | Specialized engineering |
| GPT-5.6 Terra | $2.50 | $15.00 | $1.00 | Balanced general agent |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $1.13 | Incumbent |
| Claude Sonnet 5 (regular) | $3.00 | $15.00 | $1.13 | From **2026-09-01** |
| GPT-5.5 | $5.00 | $30.00 | $2.00 | Benchmark only (same $ as Sol) |
| GPT-5.6 Sol | $5.00 | $30.00 | $2.00 | Current flagship |
| GPT-5.5 Pro | $30.00 | $180.00 | $12.00 | Exceptional use only |

**D1 catalog alignment (2026-07-11):** Luna, Sonnet 5 promo, Codex, Terra, Sonnet 4.6, Sol match. **Fix needed:** `gemini-3.5-flash` catalog still shows $1.50/$9 per 1M (should be $0.75/$4.50). **Missing:** `gpt-5.5`, `gpt-5.5-pro` — add before benchmark runs.

**Sonnet 5 tokenizer note:** ~30% more tokens for identical text vs 4.6 — score **accepted result per dollar**, not raw token count.

**GPT-5.5 rule:** Same price as Sol; OpenAI positions 5.6 as strictly better. Keep 5.5 as **controlled historical benchmark** — earns a lane only if it beats Sol/Terra/Sonnet 5/Codex on a real workflow.

---

## 2. Frontier qualification set (P0 / P1)

| Priority | Model | Treatment | Purpose |
|---|---|---|---|
| **P0** | `gpt-5.6-sol` | Qualify | Architecture, hard infra, agent design, complex E2E |
| **P0** | `gpt-5.6-terra` | Qualify | General agent execution, daily ops, implementation coordination |
| **P0** | `gpt-5.6-luna` | Qualify | Routine ops, customer responses, bounded workers |
| **P0** | `claude-sonnet-5` | Qualify | Architecture, coding, product/design, agent creation |
| **P0** | `gemini-3.5-flash` | Qualify | Coding/design, browser work, multimodal, research |
| **P0** | `gpt-5.3-codex` | Qualify | Repo implementation, terminal, tests, refactoring |
| **P0** | `deepseek-v4-flash` | Qualify | L3 search volume + L7 economics |
| **P0** | `deepseek-v4-pro` | Qualify | Hard debug / L7 vs Codex |
| **P1** | `claude-sonnet-4-6` | Incumbent | Defend proven lanes vs Sonnet 5 (winner-stays) |
| **P1** | `gpt-5.5` | Benchmark | Prove 5.6 actually improved our workflows |

**Pause from automatic routing during qualification:**
- Every `gpt-5.4*` arm
- Haiku in all non-scout roles
- Generic Workers AI chat/code swarms (`@cf/*`, Gemma, Kimi, GLM, R1, …)
- Old Sonnet 4.6 duplicates outside proven lanes
- Generic arms on bare `agent` / `code` / `chat` without qualification intent
- Thompson lottery across unrelated providers or authority levels
- `gemini-3.1-pro-preview*` (power tier — out of matrix; use 3.5 Flash only)

**Delete after dependency inspection:**
- Jul-23 retired Codex aliases
- Invalid fallback aliases
- Retired previews
- Orphan arms / superseded duplicate task types
- `gpt-5.4*` arms after replacements proven
- Sonnet 4.6 if Sonnet 5 wins S1–S5
- GPT-5.5 if it fails to beat Sol or Terra on every tested category

---

## 3. Quality layers → routing intent

### Layer A — System and agent architecture

| Role | Primary | Challenger |
|---|---|---|
| Platform architect | Sol | Sonnet 5 |
| Agent-system designer | Sonnet 5 | Sol |
| Infrastructure planner | Sol | Sonnet 5 |
| Cost-aware system planner | Terra | Sonnet 5 |
| Architecture verifier | Sonnet 5 | Gemini 3.5 Flash |

**Rule:** Never let the same model design *and* certify. Reverse Sol/Sonnet when testing Anthropic as architect.

### Layer B — Software engineering and infrastructure

| Engineering layer | Primary | Challenger 1 | Challenger 2 |
|---|---|---|---|
| Repository analysis | Sonnet 5 | Gemini 3.5 Flash | Codex |
| Feature planning | Sonnet 5 | Sol | Terra |
| Repository mutation | Codex | Sonnet 5 | Sol |
| Cloudflare Worker implementation | Codex | Sol | Sonnet 5 |
| D1/Supabase schema changes | Codex | Sol | Sonnet 5 |
| Terminal and deployment | Codex | Sol | Terra |
| Distributed debugging | Sol | Sonnet 5 | Codex |
| Code review | Sonnet 5 | Sol | Gemini 3.5 Flash |
| Frontend implementation | Sol | Sonnet 5 | Gemini 3.5 Flash |
| Visual QA / browser inspection | Gemini 3.5 Flash | Sol | Sonnet 5 |
| CAD / code-based design | Sol | Codex | Gemini 3.5 Flash |

### Layer C — Creative, branding, marketing, media

Text models **direct** specialized media models — they do not replace image/video generators.

| Task | Primary | Challenger |
|---|---|---|
| Brand architecture | Sonnet 5 | Sol |
| Positioning and messaging | Sonnet 5 | Terra |
| Website creative direction | Sol | Sonnet 5 |
| Website design-to-code | Sol | Gemini 3.5 Flash |
| Campaign strategy | Sonnet 5 | Sol |
| Marketing research | Gemini 3.5 Flash | Terra |
| Customer persona synthesis | Sonnet 5 | Terra |
| Long-form brand writing | Sonnet 5 | Sol |
| Social campaign variants | Terra | Luna |
| Visual reference analysis | Gemini 3.5 Flash | Sol |
| Media-production planning | Sol | Sonnet 5 |
| Image/video QA | Gemini 3.5 Flash | Sol |

**Hypotheses (to prove):** brand strategist → Sonnet 5 · UI creative director → Sol · visual/browser QA → Gemini 3.5 Flash · marketing ops → Terra · high-volume content → Luna · implementation engineer → Codex

### Layer D — Daily operations and executive assistant

| Task | Primary | Escalation |
|---|---|---|
| Routine email drafting | Luna | Terra |
| Customer responses | Luna | Terra |
| Sensitive customer issue | Terra | Sonnet 5 |
| Inbox categorization | Luna | Terra |
| Schedule / task coordination | Luna | Terra |
| Meeting preparation | Terra | Sol |
| Project status synthesis | Terra | Sonnet 5 |
| Proposal drafting | Sonnet 5 | Sol |
| Contract / high-stakes document analysis | Sol | Sonnet 5 |
| Personal assistant conversation | Terra | Luna |
| Operational tool execution | Terra | Sol |
| Executive decision brief | Sol | Sonnet 5 |

---

## 4. Agent lifecycle roles (formal capability)

| Role | Model candidates | Delivers |
|---|---|---|
| **Agent Architect** | Sol ↔ Sonnet 5 | Purpose, authority, tools, memory, workflow states, failure/retry/escalation, eval fixtures, success criteria, cost ceiling |
| **Agent Builder** | Codex ↔ Sonnet 5 | Registration, routing arm, prompt, tool schemas, permissions, D1 records, handler, observability, tests |
| **Agent Verifier** | Gemini 3.5 Flash or Sol (whichever did **not** design) | Tool correctness, scope violations, missing failure paths, UI/browser behavior, malformed output, test coverage |
| **Agent Operator** | Terra | Runs agent, watches metrics, escalates abnormal executions |
| **Agent Maintainer** | Sonnet 5 or Sol | Trace-driven bounded improvements — no silent prod changes |

**Lifecycle:** Need → Architect → Builder → Verifier → Owner approves → Operator runs → Maintainer reviews evidence.

---

## 5. Sonnet 5 vs Sonnet 4.6 — winner-stays protocol

Sonnet 4.6 active until at least **2027-02-17**. Sonnet 5 replaces 4.6 only when it wins **≥3 of 5** and does not regress tool reliability, scope discipline, edit burden, latency, or cost per accepted deliverable.

| Run | Test |
|---|---|
| S1 | Architecture plan for an existing IAM subsystem |
| S2 | Long-context repository understanding |
| S3 | Tool-chain plan: D1, R2, Workers, terminal |
| S4 | High-fidelity frontend section + responsive implementation |
| S5 | Design and spec of a new specialized agent |

**Record per run:** raw API cost · in/out tokens · completed-task cost · human correction minutes · failed tool calls · retry count.

---

## 6. Coding / design tournament fixtures

### C1 — Existing repository feature
Inspect repo → integration points → plan → implement → test → repair → change summary.

### C2 — High-fidelity frontend from brief
Responsive desktop/mobile · design tokens · no generic card swarm · screenshot inspection · one refinement pass.

### C3 — Heavy infrastructure change
Worker API + D1 migration + Queue consumer + DO coordination + R2 artifacts + structured logs + retries + idempotency + rollback + integration tests + deploy verification.

**Candidates C3:** Sol, Sonnet 5, Codex, Gemini 3.5 Flash — **not** Terra/Luna until best implementation established, then cost-compress.

---

## 7. Slow-test sequence (one E2E at a time)

| Phase | Focus | Models |
|---|---|---|
| **1 — Heavy infra** | One isolated real function | Sol vs Sonnet 5 vs Codex · Gemini verifies |
| **2 — Coding + design** | C1 + C2 | Gemini vs Codex vs Sonnet 5 · Sol reference |
| **3 — Agent creation** | Functioning specialized agent | Sol/Sonnet architect · Codex/Sonnet builder · Gemini verify · Terra operate |
| **4 — Daily ops** | Real email/status/scheduling fixtures | Luna vs Terra |
| **5 — Cost compression** | Same task as Phase 1–3 winners | Terra vs champion · then Luna vs Terra |

### Infrastructure evaluation weights

| Category | Weight |
|---|---|
| End-to-end functional completion | 30% |
| Correctness and test results | 20% |
| Deployment and rollback safety | 15% |
| Tool-call reliability | 10% |
| Architecture quality | 10% |
| Scope discipline | 5% |
| Human correction time | 5% |
| Cost | 3% |
| Latency | 2% |

**Auto-fail:** unauthorized mutation · unrecoverable migration · fabricated test success · ignored failing checks · wrong env deploy · missing rollback · secret exposure · unexplained destructive action.

---

## 8. D1 arm targets (pause wave + priorities)

Thompson **disabled for qualification** — use fixed priority ordering on KEEP set only (`is_paused=1` on everything else in lane).

### Core lanes

| `task_type` | KEEP (priority) | PAUSE |
|---|---|---|
| `gate` / auto | Luna **90**, Haiku scout **200** only | nano, Gemma, Flash-lite duplicates |
| `intent_classification` / auto | Sol **250**, Luna **150** (fallback) | Haiku, Flash-lite, Granite, nano, WAI |
| `chat` / agent | Terra **90**, Luna **70** | nano@100, 5.4*, WAI, Sonnet chat |
| `search_code` / agent | Sonnet 5 **90**, DeepSeek flash **85**, Gemini 3.5 **80**, Terra **75** | 3.1 Pro, WAI |
| `code` / agent | Codex **95**, Sonnet 5 **90**, Sol **85**, Gemini **75**, Terra **70** | mini@95, 4.6, WAI |
| `code_gen` / agent | Codex **90**, Sol **85**, Sonnet 5 **80** | Gemini Pro swarm, 5.4* |
| `debug` / agent | Sol **90**, Sonnet 5 **85**, Codex **80**, DeepSeek pro **75** | Haiku, WAI |
| `plan` / agent | Sol **90**, Sonnet 5 **85** | Haiku@90, 4.6 default |
| `tool_use` / agent | Terra **90**, Sol **80**, Codex **75** | GLM, Kimi, mini swarm |
| `terminal_execution` / agent | Codex **95**, Sol **85**, Terra **75** | mini, 3.1 customtools |
| `subagent_worker` / agent | Luna **90**, Terra **80**, DeepSeek flash **75**, Codex **70** | nano, WAI |
| `subagent_master` / agent | Sol **90**, Sonnet 5 **80** | mini, Kimi |
| `workflow_orchestration` / agent | Sol **90**, Sonnet 5 **80** | Haiku, 5.4 |
| `reasoning` / agent | Sol **90**, Sonnet 5 **80** | WAI R1, gpt-oss |
| `designstudio_cad_script` / agent | Sol **90**, Codex **85**, Gemini **75** | DeepSeek-only default |

### Benchmark-only arms (manual pin / eval workflow — not Auto)

| Model | Use |
|---|---|
| `gpt-5.5` | Historical control vs Sol on C1–C3 |
| `claude-sonnet-4-6` | Winner-stays S1–S5 on lanes it currently wins |

---

## 9. Final recommended lineup

```
FRONTIER ARCHITECT     → GPT-5.6 Sol          (challenger: Claude Sonnet 5)
AGENT DESIGNER         → Claude Sonnet 5      (challenger: GPT-5.6 Sol)
GENERAL END-TO-END     → GPT-5.6 Terra        (escalation: Sol)
ENGINEERING EXECUTOR   → GPT-5.3 Codex        (challengers: Sonnet 5, Gemini 3.5 Flash)
CODE + DESIGN CHALLENGER → Gemini 3.5 Flash   (challengers: Sonnet 5, Codex)
SEARCH VOLUME            → DeepSeek V4 Flash  (challengers: Sonnet 5, Gemini 3.5 Flash)
HIGH-VOLUME OPS          → GPT-5.6 Luna         (escalation: Terra)
ANTHROPIC INCUMBENT    → Sonnet 4.6           (winner-stays vs Sonnet 5)
HISTORICAL OPENAI CTRL → GPT-5.5              (benchmark only)
FRONTIER REVIEW        → different provider from worker
```

---

## 10. Execution checklist (when you say go)

1. **Catalog patch** — fix Gemini 3.5 Flash pricing; add `gpt-5.5` + `gpt-5.5-pro` benchmark rows; Sonnet 5 promo rate note through 2026-08-31.
2. **Pause wave** — migration: `is_paused=1` on all non-KEEP arms per §8.
3. **Priority wave** — bump KEEP priorities; INSERT missing Codex/Sol/Gemini/Terra arms on terminal, code, design lanes.
4. **Thompson freeze** — qualification runs use pin or fixed arm priority (document in eval ticket).
5. **Phase 1 smoke** — C3-lite on one Worker+D1 fixture; log metrics template below.
6. **Phases 2–5** — sequential; no parallel qualification lanes until prior phase has a accepted winner.
7. **Cull** — DELETE paused arms after zero draws + dependency check.

### Per-run metrics (all phases)

- `model_key`, `routing_arm_id`, `task_type`, `phase`, `fixture_id`
- `finalToolCount`, tool names, failed/retry counts
- latency (TTFT, total), raw API cost, completed-task cost
- human score 1–5 + correction minutes
- auto-fail flags, wrong-lane binary

---

## 11. Delta from prior draft (2026-07-11 earlier)

| Prior | Now |
|---|---|
| DeepSeek optional / paused | **P0 L3 + L7 — kept in qualification** |
| Codex = CAD lane only | **Codex = primary engineering executor** |
| Gemini = optional one challenger | **Gemini 3.5 Flash = P0 code/design/browser** |
| Thompson lottery during test | **Frozen** — fixed priority qualification |
| Frontend editor redesign | **Out of scope** — system = D1 lanes + AGENTSAM portfolios |

**Ready for migration SQL on:** `defaults` / `go`.
