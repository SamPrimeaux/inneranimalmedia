# IAM bare-minimum compute — definitive plan (2026-07-22)

**Status:** PLAN LOCKED from live scorecard — execute tickets in order; do not parallelize.  
**Probed:** ~2026-07-23 00:05Z (scorecard) · remote re-proof ~00:09Z · PWA/worker SHA `23e6bf68`  
**Law:** No Proof + SHA → RED. Deploy ≠ pass. Dual-pass E2E before `shipped`.  
**Update:** `agentsam_terminal_remote` flipped **GREEN** (connectivity). Remaining remote gap = **stale git checkout** (`5a060f7c` vs `23e6bf68`), tracked as Gate 5 freshness — not 530.

---

## Live scorecard (freeze)

| Surface | Status | Proof / gap | Owner | SHA |
|---------|--------|-------------|-------|-----|
| Main Agent `/api/agent/chat` | **GREEN** | write→read same `conn_mac_local` on `.scratch/lane-pin-test.txt` (`87727d39-…`) | `inneranimalmedia` | `23e6bf68` |
| `fs_*` + localpty | **GREEN** | Mac disk proof + D1 `workspace_pty_write` | main + ExecOS localpty | `23e6bf68` |
| `agentsam_terminal_local` | **GREEN** | cwd Mac repo; write+cat `/tmp/…` (`1a33cea6-…`) | main + ExecOS localpty | `23e6bf68` |
| `agentsam_terminal_remote` | **GREEN** | Live ~00:09Z: `whoami&&pwd&&date` → `agentsam`, `/home/samprimeaux/inneranimalmedia`, exit 0, `conn_gcp_iam_tunnel`, `cwd_source=gcp_remote` | main + ExecOS remote | **connectivity** green; **checkout stale** at `5a060f7c` (not `23e6bf68`) |
| PWA/SW | **GREEN** | `pwa-build-meta.json` = `23e6bf68`, sw.js 200 | R2 + main | `23e6bf68` |
| Hosted shell (OpenAI `/mnt/data`) | **RED** | empty `commands:[]` → `close_done_no_token` (`3880f2b4-…`); no `/mnt/data` success; **needs Gate 1a + 1b** (scope ≠ empty-commands/container reuse) | OpenAI | — |
| MY_CONTAINER / `terminal_sandbox` | **RED** | `/api/sandbox/health` 401 unauthed; no fresh whoami | `MY_CONTAINER` | — |
| MCP OAuth tools | **RED** | MCP `/health` 200; `tools/list` 401; Cursor discovery error | `inneranimalmedia-mcp-server` | unverified |
| Sandbox bridge (OpenAI Agents) | **RED** | No separate bridge Worker; `/api/sandbox/*` ≠ OpenAI bridge contract | none | — |

**Bottom line:** 5 green (workspace + remote **connectivity**). Reds left: hosted shell, MY_CONTAINER, MCP, bridge.  
**GCP clone caveat:** `git rev-parse HEAD` on remote returned `5a060f7c` (~19:55 local time) — missing lane-pin / progressive-terminal / later fixes. Connectivity proof stands; do not trust remote for builds/deploys until `git pull` → SHA matches `origin/main`.

---

## Three jobs (product law — locked)

| Job | Allowed surfaces | Forbidden |
|-----|------------------|-----------|
| **1. Workspace** | `fs_*`, `agentsam_terminal_local`, (later) remote when green | Hosted shell, MY_CONTAINER, OpenAI SandboxAgent |
| **2. Isolated compute** | `agentsam_terminal_sandbox` / MY_CONTAINER **or** official CF sandbox bridge — **pick one later** | Pretending either is the IAM repo |
| **3. Scratch** | OpenAI hosted shell (`container_auto`) under `/mnt/data` only | Repo paths, `.scratch/`, git, deploy |

HTML-create / “file dead” symptoms today = Job 3 + tool-choice stealing Job 1 turns. **fs is green.**

---

## Bare-minimum bar (definition of “platform not on fire”)

Must all be green + dual-pass before any SandboxAgent / bridge / Runloop work:

1. Workspace: `fs_write` → `fs_read` same `connection_id` + file on disk  
2. Named `agentsam_terminal_local` whoami/pwd without hosted shell  
3. Progressive core includes terminal (shipped `23e6bf68` / session v13) — dual-pass only  
4. Hosted shell: **1a** scope + **1b** empty-commands contract + container_reference persistence — both green (not policy-only)  
5. MCP: authenticated `tools/list` non-empty + one exec  
6. Deploy: worker + `pwa-build-meta` SHA match (already true at probe)

---

## Ticket order (do not reorder)

### Gate 0 — Dual-pass the greens (ops, not code)
- **Ticket:** record E2E for workspace + terminal_local + pin (`agentsam_pty_lane_pin`)  
- **Do:** two separate operator turns; `record:ticket-e2e-pass` on relevant tickets (`tkt_mac_localpty_exec_identity_20260722`, workspace)  
- **Block:** do not start Gate 1+ until Gate 0 pass #1 logged  

### Gate 1 — Hosted shell (two tickets — do not merge)

Policy-only “/mnt/data UI” **undersells** the bug. Scope ≠ executor contract. Keep **1a** and **1b** separate; both required before hosted shell leaves RED.

#### Gate 1a — Scope / UX (`tkt_hosted_shell_scope`)
- **Outcome:** Job 3 only — `/mnt/data` scratch; fail loud (tool_result + UI) if model aims hosted shell at repo / `.scratch` / Mac/GCP paths  
- **Allowed:** hybrid instruction, UI copy (“OpenAI container, not workspace”), optional Sam flag off until 1b green  
- **Banned:** tool-name hardcode suppress lists; progressive-core churn without measurement  
- **Does not fix:** empty `commands:[]`, invented transcripts, or multi-turn container reuse  
- **Proof:** (A) file/HTML ask → Job 1 tools win, no hosted-shell death; (B) explicit “hosted shell: ls /mnt/data” → real non-empty `shell_call_output`

#### Gate 1b — Executor / API contract (`tkt_hosted_shell_executor_contract`)
- **Mode fact (locked):** we inject `environment: { type: "container_auto" }` — **hosted**. OpenAI runs the shell. We are **not** implementing OpenAI “local” `environment.type=local` LocalShell unless Gate 4 says so. Docs that tell *your* executor to return `shell_call_output` apply to **local** mode; for hosted, OpenAI returns `shell_call_output` in the Responses stream.  
- **Bug class to fix anyway:** empty `shell_call.action.commands: []` leaves a gap (empty/failed tool UI + model text-completing a fake terminal). Scoping to `/mnt/data` alone still allows invented scratch output.  
- **Required outcomes:**  
  1. **Empty-commands contract:** before the model gets another free-form token that can invent a transcript, the turn must surface a **durable, non-success tool outcome** (SSE `tool_result` / ledger with explicit `ok: false`, exit≠0 semantics, no blank “Done”). Prefer continuing the agent loop with that outcome in history (extend `f49fd74e` recovery — no silent `close_done_no_token`). Do **not** pretend we locally executed OpenAI’s container.  
  2. **Container reuse:** persist OpenAI `container_id` (from hosted shell / code-exec pause items) keyed by `agent_run_id` (same durability idea as `agentsam_pty_lane_pin`); subsequent Responses calls in that run use `environment: { type: "container_reference", container_id }` when available, with `previous_response_id` (or PTC exact-order replay) so `/mnt/data` state survives turns.  
- **Proof:** (A) force/observe empty `commands:[]` → UI shows hard failure + loop continues with Job 1 tools, **no** fabricated `ls`/stderr prose; (B) two hosted-shell turns in one run share the same container (D1/log `container_id` match) and second turn sees first turn’s `/mnt/data` file  

**Scorecard:** Hosted shell stays **RED** until **both** 1a and 1b proofs land.
### Gate 2 — MCP OAuth bare minimum
- **ID (proposed):** `tkt_mcp_oauth_tools_list_green`  
- **Outcome:** Cursor + Claude connector: discovery OK, `tools/list` with bearer, one tool exec  
- **Decide in ticket:** oauth_visible for `fs_write`/`fs_read` vs terminal-only for external  
- **Proof:** authenticated tools/list count > 0; one successful tool_call_log row from MCP path  

### Gate 3 — MY_CONTAINER whoami (isolated compute)
- **ID (proposed):** `tkt_my_container_whoami_proof`  
- **Outcome:** authenticated sandbox health + `whoami`/`pwd` via `agentsam_terminal_sandbox`  
- **Do not** build OpenAI bridge until this is green **or** explicitly abandoned in Gate 4  

### Gate 4 — Decision only (no impl): isolated compute SSOT
- **ID (proposed):** `tkt_isolated_compute_ssot_decision`  
- **Choose one:**  
  - **A)** MY_CONTAINER remains sole Job 2 (document; kill bridge talk)  
  - **B)** Deploy official CF sandbox-bridge Worker; Agents SDK `CloudflareSandboxClient` for Job 2 only  
- **Do not start B** until Gates 0–3 green  

### Gate 5 — Remote ExecOS clone freshness (connectivity already GREEN)
- **ID (proposed):** `tkt_gcp_iam_tunnel_git_pull_parity`  
- **Proven ~00:09Z:** whoami/pwd/date on `conn_gcp_iam_tunnel` — **do not reopen 530 ticket** unless it regresses  
- **Outcome:** `/home/samprimeaux/inneranimalmedia` on iam-tunnel matches `origin/main` (or documented intentional pin); `git rev-parse HEAD` == deployed/PWA SHA when used for builds  
- **Do:** `git fetch && git checkout main && git pull` on VM (via `ship:remote` / agentsam SSH — **never** Vite/`deploy:full` on the VM)  
- **Blocked by:** Gate 0–1 preferred so operator isn’t mid–hosted-shell fire drill; can run anytime as ops if needed for a remote build

### Explicit DO NOT START
- OpenAI `SandboxAgent` / Runloop / Unix-local-as-product  
- New D1 “routing” tables beyond existing pin  
- Three static tool-profile remasters (see `CURSOR-PARITY-TOOL-DISCOVERY`)  
- Treating `/api/sandbox/*` as OpenAI bridge-compatible without Gate 4 = B  

---

## Anti-patterns (frozen)

1. Ship-racing failover + pin + UI + hosted shell without scorecard  
2. Calling MY_CONTAINER “sandbox bridge”  
3. Hosted shell for `.scratch` / repo proofs  
4. Progressive core edits without checking `agentsam_tool_profiles` still owns the ceiling  
5. Marking tickets shipped on deploy alone  

---

## Next action (immediate)

1. **Operator:** Gate 0 pass #1 — one Agent turn: force `fs_write_file` + `fs_read_file` + `agentsam_terminal_local` `pwd`; paste tool `connection_id`s.  
2. **Agent:** Gate **1a** then **1b** (scope ≠ executor contract — do not collapse into one ticket).  
3. Re-probe scorecard after 1a+1b; update Status column.

---

## Related

- Scorecard source: operator probe 2026-07-23 00:05Z  
- Diagnosis: [AGENTSAM-FILE-CREATE-HTML-FAILURES-2026-07-22.md](./AGENTSAM-FILE-CREATE-HTML-FAILURES-2026-07-22.md)  
- Pin: `agentsam_pty_lane_pin` + `23e6bf68` progressive core terminal  
- Fleet (Responses, not SandboxAgent): [OPENAI-AGENTSAM-FLEET-2026-07.md](./OPENAI-AGENTSAM-FLEET-2026-07.md)  
- Localpty: [MAC-LOCALPTY-EXEC-IDENTITY-2026-07.md](./MAC-LOCALPTY-EXEC-IDENTITY-2026-07.md)  
