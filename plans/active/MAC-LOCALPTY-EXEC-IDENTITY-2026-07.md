# Mac localpty Exec-Identity + in-app local terminal soak (2026-07-22)

**D1 ticket:** `tkt_mac_localpty_exec_identity_20260722`  
**Dual-pass:** required = 2

## Problem

In-app `agentsam_terminal_local` reached localpty but omitted `X-IAM-Exec-Identity` → ExecOS 403 → automatic sandbox cascade (`/tmp/specialist` / `cloudchamber`) while the UI still attributed the run to `agentsam_terminal_local`. Progressive thin-pipe also failed to pin the tool when the user named it and banned `search_tools`.

## Fixes shipped

| Commit | Change |
|---|---|
| `2e536caa` | D1 pin `remote_exec_user=samprimeaux` for Mac tunnels; harden `resolveTerminalExecIdentity` |
| `99c53557` | Named catalog pin for `agentsam_*` / terminal tools on progressive thin-pipe |
| `a8f1c9ca` | Health-aware connection SELECT includes identity columns |
| `137e24bb` | Always merge identity from D1; refresh DO-cached local tunnels; no sandbox cascade on Exec-Identity / user deny-sandbox |
| `f44418b8` | System `rg` on iam-tunnel for operator SSH (assistive; not required for this soak) |

## Acceptance (proven)

1. Named pin + preinvoke of `agentsam_terminal_local` works without `agentsam_search_tools`.
2. Tool JSON / stdout shows Mac desk: `cwd` under `/Users/samprimeaux/…`, `whoami=samprimeaux`, `hostname=Sams-iMac.local`.
3. No `fallback_tool=agentsam_terminal_sandbox` / no `cloudchamber`.
4. `rg` available on Mac local PATH (`/opt/homebrew/bin/rg`).

## E2E proof IDs

| Pass | When | Conversation | Agent run | Tool call log |
|---|---|---|---|---|
| PASS1 | 2026-07-22 ~9:06 CDT | `06153d02-3d8d-45e6-8182-dc8749967e4e` | `arun_352d5cee8779` | `tcl_8bfcd21ef3884269` |
| PASS2 | 2026-07-22 ~9:10 CDT | `9b5a672d-d437-48cd-ab69-ee408174cd7d` | `arun_789e62646a76` | `tcl_61fd650ef8214ac4`, `tcl_047448191fa04e1d` |

Extra (same day): `4e0e4276-…` / `arun_8f6e18402b9c` / `tcl_9da4c5d0fd624293` (JSON soak with hostname + rg).

## Non-goals

- Connor multi-user local tunnel (`tkt_connor_local_terminal_e2e`) — separate.
- Gemini Interactions transport (`tkt_gemini_interactions_transport`) — backlog.
- OpenAI PTC (`tkt_oai_ptc`) — next fleet work.
