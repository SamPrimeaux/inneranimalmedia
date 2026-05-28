# Chunk 14 — Terminal and PTY

**Status:** Draft

## Purpose
XTermShell on agent page — hosted VM PTY as operational backbone.

## Live production scope
isAgentShellPath terminal mount in App.tsx. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/XTermShell.tsx
- dashboard/App.tsx — isTerminalOpen, terminalRef, runInTerminal
- PTY routes in src/api/agent.js (grep terminal)
- agentsam_user_policy.can_run_pty

## What is ALREADY engineered
Terminal drawer on agent; Cmd+J; problems tab via debug activity.

## What is PARTIALLY engineered
B14-001 mobile terminal UX.

## What is BROKEN
B14-002 bridge future — not in repo.

## UX reality today
Desktop: strong; mobile: weak raw terminal.

## Data / event / execution flow
runInTerminal → WS PTY → output lines in shell

## Validation commands
```bash
rg XTermShell App.tsx
rg can_run_pty src
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
| ID | Title | Paths | Expected | Validation |
|----|-------|-------|----------|------------|
| B14-001 | Mobile terminal operator cards | XTermShell.tsx | Card UI on phone | mobile |
| B14-002 | AgentSamBridgeKey local connector | new | Local bridge + VM fallback | POC |

## Immediate next implementation step
Document exact PTY WebSocket URL from XTermShell.
