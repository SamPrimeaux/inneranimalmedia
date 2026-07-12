# Proposal: Model-aware chat intent classify (audit)

**proposal_id:** `prop-chat-intent-d1-escalate`  
**status:** `approved` — operator APPROVE 2026-07-11  
**phases:** sonnet pin · phase1 D1 · phase2 Sol escalate — implementing  
**lane:** L0 Scout  
**risk:** Phase 1 medium · Phase 2 high · Phase 3 low  
**author:** Cursor agent (architecture audit of operator-proposed design)  
**date:** 2026-07-11

---

## Verdict

**Approve the direction.** Same 3-layer pattern as `image-intent-gate.js` is the correct fix for the hidden regex stack in `classify-intent.js`.

**Do not ship Phase 2 yet** until:
1. Sonnet 5 API pin is fixed (`prop-sonnet5-api-id-unpinned`) — broken catalog breaks builder lanes after classify.
2. Sol on `intent_classification` is smoke-proven via image-gate escalate (or a dedicated classify smoke).
3. Phase 1 D1 seed is live and parity-tested against current heuristics.

**Prereq (separate, do first):** `APPROVE prop-sonnet5-api-id-unpinned`

---

## Diagnosis (confirmed)

| Component | Reality |
|---|---|
| `classifyIntent` → `inferIntentHeuristically` | 100% hardcoded `\b...\b` in source. No D1, no model. |
| Every Agent Sam turn | `taskType` from this path → arms → tools. Wrong type = wrong money. |
| `agentsam_classification_keywords` | **Already exists** (migration 818). Live purposes today: image_intent_* + image_tier_* only. |
| `loadClassificationKeywords(env, purpose)` | Already D1 + 60s cache + bootstrap fallback. |
| Sol `intent_classification` arm | Live (822), but **chat never calls it** — only image-gate escalate. |

Your screenshot/tail: *"Find where resolveModel is defined"* → `taskType: chat` (regex miss) → Sonnet 5 chat arm → **404** on bad pin `claude-sonnet-5-20260630`. Two bugs stacked.

---

## Proposed architecture (accepted with amendments)

### Layer 0 — D1 keyword bundles

Reuse **`agentsam_classification_keywords`** (no new table).

**Purpose naming (amendment):**

| Purpose pattern | Role |
|---|---|
| `chat_intent_<task_type>` | Trigger phrases for that task |
| `chat_intent_escalate` | Soft cues that force Layer 2 even if a weak match exists |

`label` column = optional mode hint (`agent` / `auto`) or priority weight later.

**Critical:** Current heuristics are **ordered** (workflow before deploy before code…). Flat “any match wins” will regress. Phase 1 must preserve **priority order** of task types (export as ordered list in JS or `priority` column). Prefer adding:

```sql
-- optional Phase 1b if needed
ALTER TABLE agentsam_classification_keywords ADD COLUMN weight INTEGER NOT NULL DEFAULT 100;
```

Or keep match order in code: fixed `TASK_TYPE_PRIORITY[]` array that walks purposes in law order (same order as today’s if-chain). **Recommendation: keep ordered walk in code; put only patterns in D1.** Simpler, safer.

### Layer 1 — Fast path

```text
load bundles once per request (Promise.all purposes) → compileWordRe (existing)
walk TASK_TYPE_PRIORITY → first match wins → confidence high if multi-phrase / long pattern hit
bootstrap = today’s regex lists in BOOTSTRAP (classification-keywords.js style)
```

`classifyIntent(env, text)` must pass **`env`** (today `_env` is unused — already a smell).

### Layer 2 — Model escalate

Mirror `classifyImageIntentWithModel`:

- `resolveModelForTask({ task_type: 'intent_classification', mode: 'auto' })` → Sol @250
- JSON: `{ "task_type": "...", "confidence": 0-1, "reason": "..." }`
- Allowlist of canonical task types only (reject inventing new types)
- Log `agentsam_intent_decisions` with `task_type='chat_intent'`, `matched_by='model'|'keyword'|'bootstrap'`
- Cap: max_tokens low, temperature 0, timeout hard; on failure → Layer 1 result or `chat`

### Layer 3 (your Phase 3) — confidence gating

Defer until Phase 1+2 metrics exist. Keyword confidence from: longest pattern match, pattern count, exclusive vs multi-hit conflict.

---

## Sequence (sign-off per phase)

### Phase 0 — unblock Anthropic (separate proposal)

`prop-sonnet5-api-id-unpinned`  
Set `anthropic_model_id = 'claude-sonnet-5'` (bare alias works; dated pin 404s).

### Phase 1 — D1 extract only (`prop-chat-intent-d1-escalate` phase A)

| Deliverable | Notes |
|---|---|
| Migration seed | Extract every phrase from `inferIntentHeuristically` into `chat_intent_*` rows |
| `inferIntentFromKeywords(env, text)` | Ordered walk; bootstrap fallback = current regex |
| `classifyIntent(env, …)` | Still no model; same outputs as today on golden fixtures |
| Eval | Golden set of ~30 prompts (including “Find where X is defined”) — exact taskType parity |

**Allowed without model spend.** Tune routing via D1 without deploy after seed.

**Rollback:** feature flag `CHAT_INTENT_D1=0` or empty D1 → bootstrap only.

### Phase 2 — Sol escalate (`…` phase B)

| Deliverable | Notes |
|---|---|
| `classifyIntentWithModel` | Image-gate twin |
| `shouldEscalate` | No keyword match OR confidence &lt; 0.8 OR escalate cues; ≥5 words |
| Cost guard | Skip escalate for &lt;5 words; skip if keyword confidence ≥ 0.8 |
| Metrics | Compare heuristic-only vs Sol on same ambiguous prompts |

**Do not enable in prod Auto until:** golden parity Phase 1 green + Sol smoke on image escalate + Sonnet pin fixed.

### Phase 3 — confidence weights (`…` phase C)

Weight column / multi-hit conflict → escalate only on ties/ambiguity.

---

## What this does **not** include

- Frontend / editor redesign
- Pausing all gpt-5.4 chat arms (separate: `prop-gate-pause-5.4-lottery`)
- Removing heuristics entirely on day one
- Letting Sol invent arbitrary task types

---

## Architecture quality notes (auditor)

1. **Reuse 818 table** — don’t invent a second keywords table.  
2. **Preserve if-chain priority** — biggest regression risk.  
3. **Add missing patterns in D1 first** (e.g. `find where`, `where … is defined`) as Phase 1 seed fixes — proves D1 value before model.  
4. **Sol classify cost** is acceptable for ambiguous ≥5-word turns; not for “hey”.  
5. **Designer ≠ verifier:** after Phase 2 ships, run Gemini or Sonnet 4.6 as independent review of escalate prompts (L5), not Sol auditing Sol.  
6. **Logging law:** every Layer 2 decision → `agentsam_intent_decisions` (never silent), same as image gate.

---

## Sign-off options

Reply with one of:

| Phrase | Effect |
|---|---|
| `APPROVE prop-sonnet5-api-id-unpinned` | Fix 404 pin only (do this first) |
| `APPROVE prop-chat-intent-d1-escalate phase1` | Seed D1 + wire Layer 1 only |
| `APPROVE prop-chat-intent-d1-escalate phase2` | Model escalate (after phase1 + pin) |
| `APPROVE prop-chat-intent-d1-escalate` | All phases sequenced under one approve (still ship phase1 first) |
| `REJECT …` | Stop |

---

## Related

- Live bug: `claude-sonnet-5-20260630` → Anthropic 404; bare `claude-sonnet-5` OK  
- Lanes: `plans/active/AGENTSAM-CONCEPTUAL-LANES-2026-07.md`  
- Gate: `plans/active/QUALIFICATION-TEST-GATE-2026-07.md`  
- Image pattern: `src/core/image-intent-gate.js` + `src/core/classification-keywords.js`
