# MCP Optimization Spec — Seamless Multi-Client Agent Operation
**Target:** `mcp.inneranimalmedia.com` (97-tool server) + in-app Agent Sam runtime
**Consumers:** Claude (claude.ai connector + API), ChatGPT (connector), Cursor (MCP client), in-app Agent Sam (D1-routed tool profiles)
**Prereqs shipped:** github_search response slimming, empty-result index hints / `github_grep`, `d1_validate_migration` dry-run, ledger drift detection

---

## 0. Design principle

Every tool result is consumed by a language model paying per token, deciding its next action from your envelope alone. Optimize for three things, in order:
1. **Fewest round trips** — composite tools over primitive chains
2. **Smallest sufficient envelope** — every byte in a response should change the model's next decision
3. **Self-describing failure** — an error that doesn't tell the agent what to do next forces a wasted retry

---

## 1. Universal response contract (all 97 tools)

Standardize every tool response to this envelope. Claude, ChatGPT, and Cursor all handle it well, and it makes in-app Agent Sam's result-parsing deterministic.

```json
{
  "ok": true,
  "data": { ... },                      // the payload, shaped per §2
  "meta": {
    "truncated": false,
    "row_count": 12,
    "elapsed_ms": 340,
    "scope": "ws_inneranimalmedia"      // keep — agents use this to catch scope bugs
  },
  "next": null                          // or a hint, see §3
}
```

On failure:

```json
{
  "ok": false,
  "error": {
    "code": "D1_CONFLICT_TARGET_MISMATCH",   // stable, grep-able taxonomy
    "message": "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint",
    "hint": "Table agentsam_memory's unique index on (tenant_id,user_id,key) is partial (WHERE status='active'). Include the WHERE clause in the conflict target, or conflict on id.",
    "retryable": false
  }
}
```

**Action items:**
- [ ] Create `src/mcp/envelope.js` with `ok(data, meta)`, `fail(code, message, hint, retryable)` helpers; migrate handlers to it incrementally (leaf tools first, same extraction discipline as the worker.js monolith split — one tool at a time, never wholesale).
- [ ] Build the error-code taxonomy as a D1 table `agentsam_mcp_error_codes` (code, default_hint, retryable, doc_url) so hints are editable without deploys. Handlers look up hints by code.
- [ ] `retryable: true` errors should include `retry_after_ms` when rate limits are involved (GitHub search's ~10/min especially).

---

## 2. Token economy per tool class

### 2.1 Read tools (`github_read`, `github_read_many`, `d1_query`, `r2_get`, `memory_search`)
- [ ] Add a `max_bytes` param (default sensible per tool: 32KB for file reads, 16KB for query results). When truncating, always return `meta.truncated: true` + `meta.total_bytes` + a `next` hint with the offset param to fetch the remainder. Truncation without a resume path is data loss; truncation with one is pagination.
- [ ] `d1_query`: add `columns` param to project only requested columns, and a `format: "compact"` option returning arrays-of-arrays with a single header row instead of repeated JSON keys. For a 100-row × 15-column result, key repetition is ~60% of the payload.
- [ ] `github_read_many`: return per-file `sha` always (agents need it for subsequent patches) but make file *content* opt-out-able via `metadata_only: true` — Cursor often just needs to know what exists and at what sha.

### 2.2 Search tools (`github_search`, `github_grep`, `memory_search`, `codebase_retrieve`)
- [ ] Uniform result shape: `{path, sha, score, snippet}` — snippet capped at ~200 chars around the match. Never full-file content in search results.
- [ ] `codebase_retrieve` (AST/Vectorize lane): include `symbol_kind` and `parent_symbol` in results so agents can request the enclosing function via `github_read` with a line range instead of the whole file. Add `line_start`/`line_end` to enable that.
- [ ] All search tools: `meta.index_freshness` timestamp (last index update). This generalizes the github_search staleness fix — memory_search's Vectorize mirror has had a stuck sync job before; agents should be able to see "this index is 3 days stale" instead of trusting empty results.

### 2.3 Write tools (`github_patch`, `github_write`, `github_commit_tree`, `d1_write`, `memory_commit`)
- [ ] Every write returns the minimal proof: `{commit_sha}` or `{rowid, rows_affected}` — never echo the written content back. `github_commit_tree` currently returns well; hold that line.
- [ ] Add `dry_run: true` support to **all** write tools, not just memory_commit. A dry run returns what *would* change (`{would_replace: 1, current_sha, resulting_diff_stat}`) without committing. This is what makes multi-step agent plans safe: plan with dry runs, execute once.
- [ ] `idempotency_key` on every write. `memory_commit` has this; extend to `d1_write` and ticket tools. When a client retries after a network timeout, the second call must be a no-op with `meta.idempotent_replay: true`.

---

## 3. `next` hints — the cheapest capability multiplier

A one-line machine-readable hint in successful responses steers all four clients without any prompt engineering:

| Situation | `next` hint |
|---|---|
| `d1_query` returns 0 rows on a table name that doesn't exist | `{"suggest": "d1_query", "args": {"mode": "schema"}, "why": "table not found; list tables"}` |
| `github_search` empty | `{"suggest": "github_grep", "why": "code search index may lag; grep walks live tree"}` |
| `d1_validate_migration` finds failures | `{"suggest": "github_patch", "args": {"path": "<failing file>"}, "why": "fix before deploy"}` |
| write tool succeeds on a migration file | `{"suggest": "d1_validate_migration", "why": "re-validate backlog after edit"}` |
| `ticket_set_status` → blocked | `{"suggest": "ticket_add_note", "why": "status_reason required for blocked"}` |

- [ ] Implement as a static rules map keyed by `(tool, result_condition)` in D1 (`agentsam_mcp_next_hints`) so new hints ship without code deploys.
- [ ] Keep hints to one suggestion. Menus of options waste tokens and split agent attention.

## 4. Client-specific adaptation layer

The three external clients have different tool-calling behavior. Handle this server-side in one place rather than maintaining per-client tool forks.

### 4.1 Detection
- [ ] You already key connector identity via OAuth client (`agentsam_mcp_oauth_tool_allowlist.client_id`, connector_priority from migrations 960/961). Add a `client_profile` resolution step: `chatgpt`, `claude`, `cursor`, `in_app` — attached to the request context.

### 4.2 Per-client shaping
- **ChatGPT connector:** hard tool-count ceilings and weaker schema tolerance. Keep `expose_on_connector` curation tight (you already scrubbed `ai_complete`/`run_agent` in 962-963 — right call). Additionally: ChatGPT handles `oneOf`/`anyOf` in input schemas poorly — flatten to optional fields + server-side validation with a clear error hint. The Gemini vendor-key lesson (`x-google-enum-descriptions` causing 400s) generalizes: **strip all vendor extension keys from schemas at the connector boundary, per client.**
- **Claude:** supports large tool catalogs via deferred loading, but description quality drives tool selection. First sentence of every description must state *when to use it*, not what it is. Audit all 97: "Query an authorized D1 database using read-only SQL" is good; anything starting with the tool's own name restated is wasted.
- **Cursor:** longest sessions, most write-heavy. Prioritize `dry_run` + idempotency (§2.3) and sha-freshness errors: when `github_patch` fails because the file changed under it, the error hint must include the current sha so Cursor can re-read and retry in one step.

### 4.3 Schema discipline (all clients)
- [ ] One canonical JSON Schema per tool in D1 (`agentsam_tools.input_schema` is already SSOT — keep it), with a per-client serializer that strips unsupported constructs. Never hand-fork schemas.
- [ ] Every enum param: include the enum values in the *description* too. Some clients truncate schema display; the description survives.

---

## 5. Composite tools — collapse the common round-trip chains

From real session traces, these primitive chains recur constantly. Each composite saves 2–4 round trips and their token overhead:

1. **`agentsam_repo_context`** — input: `paths[]` or `symbols[]`; returns tree slice + file contents + latest commit sha in one call. Replaces the tree → read_many → list_commits dance that opens nearly every repo task.
2. **`agentsam_ship_check`** — runs pre-deploy verification as one call: `d1_validate_migration` (all pending) + build-affecting file diff vs last deploy manifest + ledger drift check. Returns pass/fail per lane with hints. This becomes the mandatory gate in the `deploy:full` script *and* the in-app ship lane (skills 970/971/973).
3. **`agentsam_d1_upsert_safe`** — input: table, rows, conflict intent ("update" | "ignore"). Server introspects the table's actual unique constraints (including partial indexes) and generates the correct ON CONFLICT clause. This permanently retires the entire class of bug from the migration sprint — no agent should ever hand-write a conflict target against your schema again.
4. **`agentsam_ticket_work`** — get ticket + related memory + linked files in one call, for session-start context loading in any client.

- [ ] Register composites through the normal `agentsam_tools` path with tool profiles; expose to connectors selectively (ship_check: yes everywhere; d1_upsert_safe: in_app + cursor only initially).

---

## 6. In-app Agent Sam benefits (what this unlocks beyond the connectors)

The in-app agent shares the same tool layer, so every §1–5 item compounds there — plus these in-app-specific wins:

1. **Fixes the zero-tool-calls gate failures.** The `G-inspect`/`G-ask-repo` failures were the model answering conversationally instead of invoking tools. Two levers: (a) `next` hints (§3) give the model an explicit continuation path mid-plan, and (b) with composites reducing chains to single calls, set `tool_choice` forcing on the *first* call of inspect/repo task types — one forced call into `agentsam_repo_context` and the model has real context instead of a reason to guess. Wire this into the tool profile bindings: add a `force_first_tool` column to `agentsam_tool_profile_bindings`.
2. **Cheaper routing arms.** Compact envelopes (§2) cut per-call token cost, which changes Thompson sampling economics — T2/T3 arms that were losing on cost-per-success start winning. After envelope migration, expect `applyEtoAfterRun` reward data to shift; let the bandit re-converge rather than re-seeding priors.
3. **Ship lane becomes trustworthy.** `agentsam_ship_check` as a required DAG node in the deploy skills means in-app Agent Sam can run `deploy:full`-class operations autonomously without the whack-a-mole risk that burned this week. That's a direct step toward the Cursor-replacement goal: the missing piece wasn't capability, it was *pre-flight verification*.
4. **Error taxonomy feeds triage.** Stable error codes (§1) make `agentsam_cron_triage_log`-style analytics possible for tool calls: which codes recur, which tools degrade, which hints get followed. Add `agentsam_tool_call_outcomes` (tool, code, client_profile, followed_hint, ts) — one non-blocking insert per call, same pattern as migration 901.
5. **Memory commit outbox stays authoritative.** All memory writes across all four clients flow through the same `memory_commit` contract with idempotency — no more out-of-band schema drift like the 947 ledger incident. Pair with the shipped drift detector: any table a pending migration recreates gets checked against live DDL at validate time.

---

## 7. Sequencing (dependency-ordered)

| Phase | Items | Why first |
|---|---|---|
| 1 | §1 envelope + error taxonomy; §2.3 dry_run + idempotency on writes | Everything else builds on the contract |
| 2 | §5.2 ship_check + wire into deploy:full and ship-lane skills | Highest-pain fix; unblocks autonomous deploys |
| 3 | §3 next hints; §6.1 force_first_tool binding | Directly closes the live gate failures |
| 4 | §2.1/2.2 read/search token economy; §4 client adaptation layer | Cost + reliability across connectors |
| 5 | §5.1/5.3/5.4 remaining composites; §6.4 outcomes analytics | Compounding wins |

**Verification per phase:** each phase ships with a gate proof in `agentsam_tickets` (dual-pass E2E per migration 911 law): one pass from Cursor as MCP client, one from in-app Agent Sam, asserting identical envelopes and behavior.
