# IAM bare-minimum compute — definitive plan (2026-07-22)

**Status:** PLAN LOCKED from live scorecard — execute tickets in order; do not parallelize.  
**Probed:** ~2026-07-23 00:05Z (scorecard) · remote re-proof ~00:09Z · PWA/worker SHA `23e6bf68`  
**Law:** No Proof + SHA → RED. Deploy ≠ pass. Dual-pass E2E before `shipped`.  
**Updates:**  
- `agentsam_terminal_remote` **GREEN** (connectivity). **No** open 530 ticket — Gate R is clone freshness only.  
- Hosted shell = Gate **1a + 1b** (scope ≠ executor).  
- MY_CONTAINER vs “Sandbox bridge” = **likely one red counted twice** (see Gap 3).

---

## Live scorecard (freeze)

| Surface | Status | Proof / gap | Owner | SHA |
|---------|--------|-------------|-------|-----|
| Main Agent `/api/agent/chat` | **GREEN** | write→read same `conn_mac_local` on `.scratch/lane-pin-test.txt` (`87727d39-…`) | `inneranimalmedia` | `23e6bf68` |
| `fs_*` + localpty | **GREEN** | Mac disk proof + D1 `workspace_pty_write` | main + ExecOS localpty | `23e6bf68` |
| `agentsam_terminal_local` | **GREEN** | cwd Mac repo; write+cat `/tmp/…` (`1a33cea6-…`) | main + ExecOS localpty | `23e6bf68` |
| `agentsam_terminal_remote` | **GREEN** | ~00:09Z whoami/pwd/date, `conn_gcp_iam_tunnel`, exit 0 | main + ExecOS remote | connectivity OK; checkout stale `5a060f7c` |
| PWA/SW | **GREEN** | `pwa-build-meta.json` = `23e6bf68` | R2 + main | `23e6bf68` |
| Hosted shell (OpenAI `/mnt/data`) | **RED** | empty `commands:[]` → `close_done_no_token`; needs **1a + 1b** | OpenAI | — |
| MCP OAuth tools | **RED** | `/health` 200; `tools/list` **401** — treat as **auth/token first**, not oauth_visible policy | `inneranimalmedia-mcp-server` | unverified |
| Job 2 isolated compute (merged row) | **RED** | See Gap 3 — **one** root until proven otherwise | `inneranimalmedia` `MY_CONTAINER` | — |

### Gap 3 — do not double-count sandbox reds

| Was listed as | What it actually is |
|---------------|---------------------|
| MY_CONTAINER / `terminal_sandbox` | IAM Job 2: `agentsam_terminal_sandbox` + `/api/sandbox/*` → `handleSandboxApi` → `MY_CONTAINER` |
| “Sandbox bridge” | **No** separate Worker (`sandbox` / `agentsam-sandbox` do not exist). Same host routes under `/api/sandbox/*`. **Not** OpenAI Agents `CloudflareSandboxClient` bridge API. |

Probe symptom for both rows was the same: **`/api/sandbox/health` → 401 without session**. Until an authenticated session proves health+whoami **or** we prove a second distinct failure mode, scorecard treats this as **one RED** (Job 2).  

`tkt_isolated_compute_ssot_decision` (adopt official CF sandbox-bridge vs keep MY_CONTAINER) is a **later decision ticket**, not a second current outage. Do not schedule bridge impl until Job 2 whoami is green **or** decision = abandon MY_CONTAINER for bridge.

**Bottom line:** 5 green. Independent reds: **hosted shell**, **MCP 401**, **Job 2 `/api/sandbox` auth/exec** (once). Optional ops: GCP git pull.

---

## Three jobs (product law — locked)

| Job | Allowed surfaces | Forbidden |
|-----|------------------|-----------|
| **1. Workspace** | `fs_*`, `agentsam_terminal_local`, `agentsam_terminal_remote` (connectivity green) | Hosted shell, MY_CONTAINER as “repo” |
| **2. Isolated compute** | `agentsam_terminal_sandbox` / MY_CONTAINER **or** (later) official CF sandbox-bridge — **one SSOT** | Calling `/api/sandbox` “OpenAI bridge” |
| **3. Scratch** | OpenAI hosted shell (`container_auto`) under `/mnt/data` only | Repo paths, `.scratch/`, git, deploy |

---

## Bare-minimum bar

1. Workspace dual-pass: `fs_write` → `fs_read` same `connection_id` + disk  
2. `agentsam_terminal_local` without hosted shell stealing  
3. Hosted shell **1a + 1b** both green  
4. MCP: **auth works** then tools/list non-empty + one exec (policy second)  
5. Job 2: authenticated sandbox health + whoami (single ticket)  
6. Deploy SHA match (already true at probe)

---

## Sequencing (blast-radius order — locked)

Do **not** reorder. Matches operator ranking.

### 0 — `tkt_workspace_e2e` (dual-pass)
- Confirm greens: Main Agent + `fs_*` + `terminal_local` (+ pin row).  
- Record two `e2e_pass` events. Most of the way there already.  
- **Block** Gate 1 until pass #1 logged.

### R — Remote (optional ops — **not** a 530 ticket)
- Connectivity **already GREEN** (~00:09Z). **Do not open** `tkt_terminal_remote_530`.  
- Optional: `tkt_gcp_iam_tunnel_git_pull_parity` — pull clone `5a060f7c` → `origin/main` when builds need current tree. Can run anytime; not on critical path for hosted-shell.

### 1a — `tkt_hosted_shell_scope`
- `/mnt/data` only; fail loud on repo paths. Policy/UX.  
- Does **not** fix empty `commands:[]` or container reuse.

### 1b — `tkt_hosted_shell_executor_contract`
- Empty `commands:[]` → durable non-success tool outcome before inventable text; persist `container_id` by `agent_run_id` → `container_reference` + response chaining.  
- Mode = `container_auto` (hosted), not local LocalShell.  
- Hosted shell stays **RED** until **1a and 1b** proofs land.

### 2 — `tkt_mcp_oauth_menu` (auth first)
- **Step 2.0:** classify the 401 — broken bearer / Cursor discovery / expired OAuth vs intentional empty allowlist.  
- **Do not** let “decide `oauth_visible` for fs_*” absorb a **broken token**. Fix auth proof first (`tools/list` 200 with valid token).  
- **Step 2.1:** only then decide oauth_visible / menu policy for external Claude.  
- **Proof:** authenticated tools/list count > 0; one MCP-path tool_call_log success.

### 3 — `tkt_my_container_whoami_proof` (Job 2 — single red)
- Authenticated `/api/sandbox/health` + `agentsam_terminal_sandbox` whoami/pwd.  
- Fixes the **one** 401/exec gap for MY_CONTAINER.  
- **Does not** deploy OpenAI bridge.

### 4 — `tkt_sandbox_bridge_decision` (decision only — after Gap 3 settled)
- **Prerequisite:** Gate 3 green **or** written abandon of MY_CONTAINER.  
- Confirm scorecard is not still double-counting the same 401.  
- Choose **A)** MY_CONTAINER sole Job 2 (document; stop saying “bridge”) **or** **B)** deploy official `cloudflare/sandbox-sdk/bridge` Worker for `CloudflareSandboxClient`.  
- **No impl of B** until 0 → 1a/1b → 2 → 3 green.

### Explicit DO NOT START
- OpenAI `SandboxAgent` / Runloop / Unix-local-as-product before Gate 4 = B  
- Second ticket that only re-probes unauthenticated `/api/sandbox/health`  
- Reopening remote 530  
- Tool-name hardcode lists for hosted shell  
- oauth_visible debates before MCP auth works  

---

## Anti-patterns (frozen)

1. Ship-racing without scorecard  
2. Counting MY_CONTAINER 401 and “missing bridge Worker” as two outages  
3. Calling `/api/sandbox/*` the OpenAI Agents bridge  
4. Hosted shell for `.scratch` / repo  
5. Progressive core edits without profile ceiling check  
6. Marking shipped on deploy alone  
7. Treating MCP 401 as a catalog policy ticket  

---

## Next action (immediate)

1. **Operator:** Gate 0 pass #1 — `fs_write` → `fs_read` + `terminal_local` `pwd`; paste `connection_id`s.  
2. **Agent:** **1a** then **1b** only.  
3. Re-probe; collapse Job 2 to one Status after authed sandbox proof.

---

## Related

- Scorecard: operator probe 2026-07-23 00:05Z · remote 00:09Z  
- [AGENTSAM-FILE-CREATE-HTML-FAILURES-2026-07-22.md](./AGENTSAM-FILE-CREATE-HTML-FAILURES-2026-07-22.md)  
- Pin + progressive terminal: `23e6bf68`  
- [OPENAI-AGENTSAM-FLEET-2026-07.md](./OPENAI-AGENTSAM-FLEET-2026-07.md)  
- [MAC-LOCALPTY-EXEC-IDENTITY-2026-07.md](./MAC-LOCALPTY-EXEC-IDENTITY-2026-07.md)  
