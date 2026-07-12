# Routing spine — one front-door (shipped slice 2026-07-12)

## Law

`message → resolveTurnDecision → one agentsam_intent_decisions row → consumers only`

Consumers must not re-regex for authority. Bootstrap regex (`inferIntentHeuristically`) is cold-start / no-D1 only — not spine authority when D1 is up.

## Shipped in this slice

| Change | File |
|--------|------|
| Single front-door | `src/core/turn-decision.js` |
| Spine calls once per turn | `src/api/agent-chat-spine.js` |
| classifyIntent consumes precomputed | `src/api/agent/classify-intent.js` |
| Image eval without duplicate log | `src/core/image-intent-gate.js` → `evaluatePrimaryImageGenerationIntent` |
| Spine chat keywords: no heuristic fallback | `inferIntentFromKeywords(..., { spineMode: true })` |
| user_app lane hard-paused | `user-app-runtime.js`, dashboard sends `tenant_saas` |

## Golden pass/fail (required before closing routing tickets)

| ID | Prompt | Pass | Fail |
|----|--------|------|------|
| G1 | Generate an image of a red barn | `task_type=image_generation`, image fast path | Chat-only |
| G1b | Same thread: edit it to be a blue barn | `matched_by=revision_followup` (or keyword), image fast path | `cms_edit` / chat-only |
| G2 | Open tickets playbook + tkt_* paste | `task_type=chat`, NOT image | Gemini image error |
| G3 | create a site plan image | image path | code rejection |
| G4 | create a Next.js site with auth | code/agent tools | image fast path |
| G5 | what tables are in D1? | d1_query / ask | wrong taskType |

### Regex removal gates (in_review → shipped)

- **Pass:** exactly **one** `agentsam_intent_decisions` row per turn; `metadata_json.spine = turn-decision-v1`
- **Pass:** Workers log contains `[turn-decision]` with `decisionId`
- **Fail:** second decision row for same turn from chat-intent or image-gate legacy log
- **Fail:** `matched_by=bootstrap` on hot path when D1 keywords loaded (unless D1 empty)
- **Fail:** `inferIntentHeuristically` alone sets route with no decision row

### D1 proof

```sql
SELECT id, task_type, matched_by, reason, metadata_json
FROM agentsam_intent_decisions
WHERE conversation_id = ?
ORDER BY created_at DESC LIMIT 1;
```

## Remaining (next tranches)

- P0#2: `code-implementation-intent.js` → consume decision only
- P0#3: remove silent image JS veto after keyword match
- P0#6: Design Studio pin → decision consumer
- OAuth default-deny tool catalog
- API block on `shipped` without verification row
