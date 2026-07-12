# Agent Sam — Anthropic Model Catalog Update (2026-07-11)

**Handoff for Cursor / Agent Sam.** All three models already existed in `agentsam_model_catalog` with correct base pricing. Notes and corrections applied 2026-07-11. Do **not** hardcode Anthropic model strings — resolve via catalog `anthropic_model_id` + Thompson arms.

**Related:** GPT-5.6 Sol/Terra/Luna briefing → [`MODEL-CATALOG-gpt-5.6-sol-terra-luna-2026-07.md`](./MODEL-CATALOG-gpt-5.6-sol-terra-luna-2026-07.md). Migration 820 cost guards still apply.

---

## Claude Sonnet 5 — `claude-sonnet-5`

| Field | Value |
|---|---|
| `model_key` | `claude-sonnet-5` |
| **Pinned API id** | `claude-sonnet-5-20260630` (`anthropic_model_id`) |
| Alias | `claude-sonnet-5` (unpinned) — prefer dated pin in dispatch |
| tier / lane | `power` / `standard` |
| Intro $/MTok | **$2 / $10** through **2026-08-31** |
| Standard after | **$3 / $15** — bake step-up into budgets now |
| Catalog $/1K | `0.002` / `0.010` (intro) · cached_in `0.0002` |

### Corrections applied

- `supports_reasoning` → **1** (was wrongly 0)
- Adaptive thinking + effort scaling: **low / medium / high / max / xhigh**
- `thinking_policy` → **`adaptive`**
- `anthropic_model_id` → **`claude-sonnet-5-20260630`**

### Tokenizer / cache

- **New tokenizer** (same family as Opus 4.7+). Same input ≈ **1.0–1.35×** more tokens than Sonnet 4.6. Re-benchmark workloads migrating from 4.6 that rely on cached prefixes — hit rates will change.
- Cache: **5m write = 1.25×**, **1h write = 2×**, **read = 0.1×** (90% off). Batch = 50% off.

### Capabilities / role

Vision, tools, computer use, web search, JSON schema, file inputs. Default for Free/Pro claude.ai and Claude Code at launch.

**Agent Sam role:** T2–T3 **active default builder** (code / search_code / debug / plan / chat / subagent_worker / code_gen arms live after migration 820).

---

## Claude Opus 4.8 — `claude-opus-4-8`

| Field | Value |
|---|---|
| Pricing | **$5 / $25** per MTok standard |
| Fast mode | **$10 / $50 (2×)** — **not** 6× |
| Context / out | 1M, no long-context surcharge · 128K max · 300K via `output-300k-2026-03-24` batch header |
| Thinking | Adaptive + effort scaling |

### Fast-mode history (do not confuse)

| Model | Fast mode | Status |
|---|---|---|
| Opus 4.6 | discontinued 2026-06-29 | Prefer 4.8 |
| Opus 4.7 | **6×** fast — **removed 2026-07-24** | Catalog **retired** (`is_active=0`, arms paused) |
| Opus 4.8 | **2×** fast | Current premium |

### Role

Premium fallback when **Fable 5** is overkill or hits a safety classifier refusal (fallback billed at Opus rates).

**Cost guard:** catalog active for pin, but **all Opus 4.8 Thompson arms remain `is_paused=1`** until routing is proven cheap. Do not unpause casually.

---

## Claude Fable 5 — `claude-fable-5`

| Field | Value |
|---|---|
| Pricing | **$10 / $50** per MTok (= **2× Opus 4.8**) |
| Cache | hits **$1/M** (90% off) · 5m write **$12.50/M** · 1h write **$20/M** · Batch 50% off |
| Context / out | 1M, no surcharge · 128K max |

### Behavior

- Mythos-class weights + **safety classifiers**. Cyber/bio/chemistry hits → `stop_reason: "refusal"` as **HTTP 200**, **not billed**, auto-fallback to **Opus 4.8** at Opus rates. Affects &lt;5% general sessions; higher for security/bio-adjacent work.
- **Adaptive thinking always ON** — `thinking: {type:"disabled"}` unsupported. Raw CoT never returned; `thinking.display` = summary vs empty.
- Access restored **2026-07-01** after US export-control suspension.

### Role / guard

T5 escalation only. **Routing arms stay inactive** (`is_active=0`) until cost-proven — do **not** activate without benchmarking. Arms carry `fallback_model_key=claude-opus-4-8`.

Ops: Fable may require **30-day Anthropic data retention** for safety monitoring — confirm org policy before enabling.

---

## Live routing posture (2026-07-11)

| model_key | Catalog | Thompson |
|---|---|---|
| `claude-sonnet-5` | active · pinned `…-20260630` | **active** builder arms |
| `claude-opus-4-8` | active | **paused** (cost guard) |
| `claude-fable-5` | active | **inactive** arms (cost guard) |
| `claude-opus-4-7` | **retired** Jul 24 | arms paused |
| `claude-sonnet-4-6` | still active | demote over time; token-cost migration risk |

---

## Cursor do / don’t

**Do**

- Dispatch Anthropic via catalog `anthropic_model_id` (Sonnet 5 → dated pin)
- Plan Sonnet intro→standard price step-up (Aug 31)
- Re-benchmark cache prefixes when moving 4.6 → 5
- Keep Opus/Fable out of Auto until spend is trusted

**Don’t**

- Hardcode `claude-sonnet-5` / Opus / Fable in `src/` hot paths
- Assume Opus 4.7 or 6× fast mode still exists after 2026-07-24
- Enable Fable arms without refusal-fallback + retention review
- Treat Fable as a daily Agent default

---

## Unlock later (explicit only)

```sql
-- Opus 4.8 Auto
UPDATE agentsam_routing_arms
SET is_paused = 0, pause_reason = NULL, updated_at = unixepoch()
WHERE model_key = 'claude-opus-4-8';

-- Fable 5 Auto
UPDATE agentsam_routing_arms
SET is_active = 1, pause_reason = NULL, updated_at = unixepoch()
WHERE id LIKE 'ra_fable5_%';
```

---

## Verify

```sql
SELECT model_key, anthropic_model_id, supports_reasoning, thinking_policy,
       cost_per_1k_in, cost_per_1k_out, is_active, is_degraded, cost_notes
FROM agentsam_model_catalog
WHERE model_key IN ('claude-sonnet-5','claude-opus-4-8','claude-fable-5','claude-opus-4-7');

SELECT model_key,
  SUM(CASE WHEN COALESCE(is_active,1)=1 AND COALESCE(is_paused,0)=0 THEN 1 ELSE 0 END) AS arms_live
FROM agentsam_routing_arms
WHERE model_key IN ('claude-sonnet-5','claude-opus-4-8','claude-fable-5','claude-opus-4-7')
GROUP BY model_key;
```
