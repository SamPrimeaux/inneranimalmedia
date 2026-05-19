# IAM Patch Agent — Postmortem
**Date:** May 16, 2026  
**Author:** Claude (documenting on behalf of Sam Primeaux)  
**Time wasted:** ~3 hours

---

## What was supposed to happen

One script. Feed 5 bug plans to competing models. Best patches auto-applied. Commit. Push. Deploy. Sam walks away.

## What actually happened

### Round 1 — Script didn't run
`iam_model_battle.py` had a syntax error on line 78: a list closed with `}` instead of `]`, plus a premature `]` inserted mid-list. Required 4 separate fix iterations before the script ran at all.

**Root cause:** Script was generated with a broken PURGE_KEYS data structure that was never syntax-checked before delivery.

---

### Round 2 — Gemini returned 0 lines every time (score: 1/6 across all plans)
Gemini scored 1/6 on all 5 plans. Response time: 0.1s. Looked like a win for GPT.

**Root cause:** Model string `gemini-2.5-flash-preview-05-20` doesn't exist on Sam's API key tier. The script caught the 404 exception and returned an error string, but the scorer saw 0 lines and assigned 1/6 instead of surfacing the actual error.

**Fix applied:** Listed available models via `genai.list_models()`, updated model string to `gemini-2.5-flash`.

---

### Round 3 — `google.generativeai` package deprecated
New warning on every run: the `google.generativeai` package is end-of-life. Must use `google.genai`.

**Fix applied:** `pip3 install google-genai`, updated import and API call pattern (`genai.Client` instead of `genai.configure` + `GenerativeModel`).

---

### Round 4 — `SKIP_KEYS` NameError
`iam_gemini_model_sync.py` referenced `SKIP_KEYS` which was never defined. Should have been `PURGE_KEYS`.

**Root cause:** Variable renamed during edits without updating all references.

---

### Round 5 — Scoring rubric was fake
After fixing all the above, both models consistently scored 5/6. Looked like real results.

**Actual rubric:**
- `has_diff` — does the text contain `@@`? 
- `has_workspace` — does the text contain the string `workspace_id`?
- `no_hardcode` — does the text avoid 5 specific strings?
- `file_coverage` — does the filename (not full path) appear anywhere in the output?
- Max score: 6, file_coverage capped at 3

**What this means:** Any model that produces text resembling a diff and mentions `workspace_id` anywhere scores 5/6 automatically. The rubric never checked whether the diff applied cleanly, whether context lines matched the actual file, or whether function names were real. A model could hallucinate an entire diff against code it never saw and score 5/6.

**Result:** 3 full battle runs executed. All produced meaningless scores. Zero patches were ever validated or applied. The 5 original bugs remain unfixed.

---

### Round 6 — D1 writeback never fired
The D1 writeback block was added to `iam_model_battle.py` but referenced `gpt_time` (deleted variable) instead of `gpt_ms`, causing a `KeyError` at runtime before the writeback executed. Required manual writeback via CF MCP.

---

### Round 7 — Models never saw real code
The biggest structural failure: the prompt fed models a **file path and line range**, not actual source code. Models were asked to produce diffs against code they never read. Any passing diff would have been coincidental.

---

## What the new script fixes

`iam_patch_agent.py` addresses every failure above:

| Old failure | New behavior |
|---|---|
| Fake scoring rubric | `patch --dry-run -p1` is the only scorer — binary pass/fail |
| Models never saw real code | Reads actual source lines ± 40 lines of context, feeds verbatim to model |
| No patch application | Passing diffs are applied immediately with `patch -p1` |
| No backup | All touched files backed up to `backups/TIMESTAMP/` before any write |
| No commit/push | Auto `git add` + `git commit` (exact files listed) + `git push origin main` |
| Gemini silent failures | Gemini is fallback only — GPT tried first, Gemini only if GPT dry-run fails |
| No manual fallback | Failed patches saved as `.patch` files for Cursor review |
| Variable naming errors | Single consistent naming throughout, no renamed variables |

---

## Recurring failure patterns to stop

1. **Generate-and-assume:** Script generated, delivered, assumed correct. No syntax check, no dry-run, no validation before handing off.

2. **Silent error swallowing:** `try/except` caught real errors and returned them as strings. Scorer then treated error strings as empty patches instead of surfacing the failure loudly.

3. **Fake metrics:** Scoring on text pattern matching instead of functional validation. If the output of a test doesn't require the code to actually run/apply, the test is not measuring anything real.

4. **Incremental patching of a broken foundation:** 7 rounds of fixes on a script that was structurally wrong from the start. Should have been identified and rewritten after Round 2.

5. **Delivering stubs:** `iam_battle_apply.py` was built and referenced but never validated. Dead code delivered as a feature.

---

## Time accounting

| Activity | Time |
|---|---|
| Syntax fixes (rounds 1–4) | ~40 min |
| Fake battle runs × 3 | ~45 min total |
| Debugging D1 writeback | ~15 min |
| Manual D1 writeback via MCP | ~5 min |
| Disk cleanup | ~5 min |
| Rewrite (iam_patch_agent.py) | ~20 min |
| This postmortem | ~10 min |
| **Total** | **~2h 20min** |
| **Bugs actually fixed** | **0** |

---

## Definition of done going forward

A script is done when:
1. `python3 -c "import ast; ast.parse(open('script.py').read()); print('OK')"` passes before delivery
2. Dry-run executes without error before any live run is requested
3. The primary validation is functional (patch applies, test passes, endpoint returns 200) — not text pattern matching
4. Commit message lists exact files changed
5. Sam does not touch the terminal more than once to kick it off
