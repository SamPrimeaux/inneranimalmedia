# IAM bare-minimum compute — definitive plan (2026-07-22)

**Status:** PLAN LOCKED from live scorecard — execute tickets in order; do not parallelize.  
**Probed:** ~2026-07-23 00:05Z · PWA/worker SHA `23e6bf68`  
**Law:** No Proof + SHA → RED. Deploy ≠ pass. Dual-pass E2E before `shipped`.

---

## Live scorecard (freeze)

| Surface | Status | Proof / gap | Owner | SHA |
|---------|--------|-------------|-------|-----|
| Main Agent `/api/agent/chat` | **GREEN** | write→read same `conn_mac_local` on `.scratch/lane-pin-test.txt` (`87727d39-…`) | `inneranimalmedia` | `23e6bf68` |
| `fs_*` + localpty | **GREEN** | Mac disk proof + D1 `workspace_pty_write` | main + ExecOS localpty | `23e6bf68` |
| `agentsam_terminal_local` | **GREEN** | cwd Mac repo; write+cat `/tmp/…` (`1a33cea6-…`) | main + ExecOS localpty | `23e6bf68` |
| PWA/SW | **GREEN** | `pwa-build-meta.json` = `23e6bf68`, sw.js 200 | R2 + main | `23e6bf68` |
| `agentsam_terminal_remote` | **RED** | ExecOS `/health` 200 only; last call `all_terminal_lanes_failed` / `terminal_exec_530` | main + ExecOS remote | — |
| Hosted shell (OpenAI `/mnt/data`) | **RED** | empty `commands:[]` → `close_done_no_token` (`3880f2b4-…`); no successful proof | OpenAI | — |
| MY_CONTAINER / `terminal_sandbox` | **RED** | `/api/sandbox/health` 401 unauthed; no fresh whoami | `MY_CONTAINER` | — |
| MCP OAuth tools | **RED** | MCP `/health` 200; `tools/list` 401; Cursor discovery error | `inneranimalmedia-mcp-server` | unverified |
| Sandbox bridge (OpenAI Agents) | **RED** | No separate bridge Worker; `/api/sandbox/*` ≠ OpenAI bridge contract | none | — |

**Bottom line:** 4 green (workspace path). Everything else claiming run/exec is red.

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
4. Hosted shell either (a) unused on workspace prompts or (b) real non-empty `/mnt/data` proof — never silent empty  
5. MCP: authenticated `tools/list` non-empty + one exec  
6. Deploy: worker + `pwa-build-meta` SHA match (already true at probe)

---

## Ticket order (do not reorder)

### Gate 0 — Dual-pass the greens (ops, not code)
- **Ticket:** record E2E for workspace + terminal_local + pin (`agentsam_pty_lane_pin`)  
- **Do:** two separate operator turns; `record:ticket-e2e-pass` on relevant tickets (`tkt_mac_localpty_exec_identity_20260722`, workspace)  
- **Block:** do not start Gate 1+ until Gate 0 pass #1 logged  

### Gate 1 — Hosted shell containment (highest user-visible red)
- **ID (proposed):** `tkt_hosted_shell_workspace_containment`  
- **Outcome:** workspace prompts never die on empty `commands:[]`; model prefers Job 1 tools; hosted shell only for `/mnt/data`  
- **Allowed work:** recovery path already partly in `f49fd74e`; UI labels; hybrid instruction; optional flag off for Sam until proven  
- **Banned:** inventing tool-name suppress lists; rewriting progressive core again without measurement  
- **Proof:** (A) HTML/file ask → `fs_write_file` success, no empty hosted shell kill; (B) explicit “run in hosted shell: ls /mnt/data” → real `shell_call_output`  

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

### Gate 5 — Remote ExecOS (after workspace solid)
- **ID (proposed):** `tkt_terminal_remote_exec_530`  
- **Outcome:** fresh whoami/pwd on GCP desk; no launder to sandbox on non-zero exit  
- **Blocked by:** Gate 0–1 (stop stealing turns first)

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
2. **Agent:** open Gate 1 ticket body + implement only containment (no remote, no MCP, no bridge).  
3. Re-probe scorecard after Gate 1; update this file’s Status column.

---

## Related

- Scorecard source: operator probe 2026-07-23 00:05Z  
- Diagnosis: [AGENTSAM-FILE-CREATE-HTML-FAILURES-2026-07-22.md](./AGENTSAM-FILE-CREATE-HTML-FAILURES-2026-07-22.md)  
- Pin: `agentsam_pty_lane_pin` + `23e6bf68` progressive core terminal  
- Fleet (Responses, not SandboxAgent): [OPENAI-AGENTSAM-FLEET-2026-07.md](./OPENAI-AGENTSAM-FLEET-2026-07.md)  
- Localpty: [MAC-LOCALPTY-EXEC-IDENTITY-2026-07.md](./MAC-LOCALPTY-EXEC-IDENTITY-2026-07.md)  
