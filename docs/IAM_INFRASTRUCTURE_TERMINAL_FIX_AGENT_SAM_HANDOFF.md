# IAM INFRASTRUCTURE — TERMINAL FIX & AGENT SAM HANDOFF
## Date: 2026-03-11 Night Session
## Status: Terminal WORKING. Agent Sam execution BROKEN. Fix next.

---

## TERMINAL — WHAT BROKE, WHY, HOW IT WAS FIXED

### Root Cause (full chain)
Three separate rogue processes were fighting for port 3099:

1. **`com.inneranimalmedia.terminal-server.plist`** — a launchd agent at
   `~/Library/LaunchAgents/` spawning `~/.local/iam-terminal-server/terminal.js`.
   Created by Cursor. Had wrong token. `KeepAlive: true` meant macOS respawned it
   instantly every time it was killed. This was the primary zombie.

2. **`~/Downloads/march1st-inneranimalmedia/server/terminal.js`** — a second
   rogue terminal server in the main repo. Also created by Cursor. Also uses
   `TERMINAL_SECRET` env var name instead of `PTY_AUTH_TOKEN`.

3. **`protocol: http2` in `~/.cloudflared/config.yml`** — added by the Copilot
   branch `copilot/add-local-pty-server`. HTTP/2 strips `Upgrade` headers,
   breaking WebSocket handshakes through the tunnel.

### Fix Applied
- Removed `com.inneranimalmedia.terminal-server.plist` via `launchctl bootout`
- Killed rogue node process (pid varied, ran `terminal.js` not `server.js`)
- Removed `protocol: http2` from `~/.cloudflared/config.yml`, added `http2Origin: false`
- Hardcoded token fallback in `server.js` line 8 (PM2 env injection broken for ES modules on Node 20)
- Restarted PM2 clean

### Working State RIGHT NOW
```
PTY server:   PM2 process `iam-pty`, ~/iam-pty/server.js, port 3099
Token:        cec612d68ceea6b7c1e549edfa92f3cd0c0c13272d7f3a789d12bb073256f029
Worker secret TERMINAL_SECRET = same token (must match)
Worker secret TERMINAL_WS_URL = https://terminal.inneranimalmedia.com (no token embedded)
Tunnel:       aa79ecd4-d8c6-4c40-bc17-09f9ae230508 → 127.0.0.1:3099
Cloudflare config: ~/.cloudflared/config.yml (NO protocol: http2)
```

### Verification Command (run this before touching anything terminal-related)
```bash
wscat -c "ws://127.0.0.1:3099/?token=cec612d68ceea6b7c1e549edfa92f3cd0c0c13272d7f3a789d12bb073256f029"
# Expected: Connected + session_id JSON. Any 4001 = token mismatch or rogue process.
```

---

## BACKUPS — WHERE EVERYTHING IS STORED

### GitHub
- Repo: https://github.com/samprimeaux/iam-pty
- Branch: `main`
- Last commit: "fix: hardcode token fallback, remove debug logs - working state 2026-03-11"
- Contains: `server.js`, `ecosystem.config.cjs`, `package.json`, `backup-to-r2.sh`
- To restore from GitHub: `cd ~/iam-pty && git pull origin main && pm2 restart iam-pty`

### R2 Backup
- Bucket: `agent-sam`
- `agent-sam/pty-server/server.js` — current working server
- `agent-sam/pty-server/ecosystem.config.cjs` — current working PM2 config
- To restore from R2:
```bash
wrangler r2 object get agent-sam/pty-server/server.js \
  --remote -c ~/Downloads/march1st-inneranimalmedia/wrangler.production.toml \
  --file ~/iam-pty/server.js

wrangler r2 object get agent-sam/pty-server/ecosystem.config.cjs \
  --remote -c ~/Downloads/march1st-inneranimalmedia/wrangler.production.toml \
  --file ~/iam-pty/ecosystem.config.cjs

pm2 kill && pm2 start ~/iam-pty/ecosystem.config.cjs
```

### Worker Secrets (Cloudflare Dashboard + wrangler)
- `TERMINAL_SECRET` = token above
- `TERMINAL_WS_URL` = `https://terminal.inneranimalmedia.com`
- Both must be set. Verify: `wrangler secret list -c wrangler.production.toml | grep TERMINAL`

---

## PERMANENT DO NOT TOUCH LIST
**Any Cursor session that violates this list is to be immediately rolled back.**

| Path | Rule |
|------|------|
| `~/.cloudflared/config.yml` | NEVER add `protocol: http2`. NEVER modify without Sam approval. |
| `~/Library/LaunchAgents/` | NEVER create any plist for iam-pty, terminal, or node processes. |
| `~/iam-pty/ecosystem.config.cjs` | NEVER modify env vars or script path without Sam approval. |
| `~/.local/iam-terminal-server/` | DELETE THIS DIRECTORY if it reappears. It is a rogue server. |
| `~/Downloads/march1st-inneranimalmedia/server/terminal.js` | DELETE THIS FILE if it reappears. It is a rogue server. |
| `wrangler.production.toml` | Already protected. Never touch. |
| `handleGoogleOAuthCallback` | Already protected. Never touch. |
| `handleGitHubOAuthCallback` | Already protected. Never touch. |
| `~/IAM_SECRETS.env` | Read only. Never overwrite. |

---

## TERMINAL RECOVERY PROCEDURE
**Run in order. Stop at the step that fixes it.**

```bash
# Step 1 — kill whatever is on 3099
sudo kill -9 $(lsof -ti :3099) 2>/dev/null

# Step 2 — remove rogue launchd agent if present
launchctl unload ~/Library/LaunchAgents/com.inneranimalmedia.terminal-server.plist 2>/dev/null
rm -f ~/Library/LaunchAgents/com.inneranimalmedia.terminal-server.plist

# Step 3 — check for other rogue plist files
ls ~/Library/LaunchAgents/ | grep -iv "google\|keystone\|pm2\|southernpets"
# Any unknown plist → unload it and delete it

# Step 4 — restart PM2 clean
pm2 kill && pm2 start ~/iam-pty/ecosystem.config.cjs

# Step 5 — verify locally
wscat -c "ws://127.0.0.1:3099/?token=cec612d68ceea6b7c1e549edfa92f3cd0c0c13272d7f3a789d12bb073256f029"
# Must say "Connected" — if 4001, check lsof -i :3099 for non-PM2 pid

# Step 6 — verify tunnel
curl -s https://terminal.inneranimalmedia.com
# Must return: IAM Terminal Server. Connect via WebSocket with ?token=SECRET

# Step 7 — verify Worker secrets match
# TERMINAL_SECRET in Cloudflare Worker must equal PTY_AUTH_TOKEN in ecosystem.config.cjs
# If unsure: re-run secret put commands below
echo -n "cec612d68ceea6b7c1e549edfa92f3cd0c0c13272d7f3a789d12bb073256f029" | \
  wrangler secret put TERMINAL_SECRET -c ~/Downloads/march1st-inneranimalmedia/wrangler.production.toml
echo -n "https://terminal.inneranimalmedia.com" | \
  wrangler secret put TERMINAL_WS_URL -c ~/Downloads/march1st-inneranimalmedia/wrangler.production.toml
./scripts/with-cloudflare-env.sh wrangler deploy -c ~/Downloads/march1st-inneranimalmedia/wrangler.production.toml
```

---

## AGENT SAM — WHAT NEEDS TO BE FIXED NEXT

The terminal is now live. Agent Sam can SEE the terminal but cannot USE it.
The agent hallucinates command output instead of actually executing.

### Priority Order

**1. Wire `run_terminal` so agent actually executes commands**
- Agent receives a bash code block and shows "Run in terminal" but calls no real tool
- Need: Worker endpoint `/api/agent/terminal/run` wired to the PTY session
- The endpoint exists in worker.js (lines 2122–2138) — it's the MCP `run_terminal` tool that's not being called
- Fix: In the React agent component, when agent outputs a bash block, the "Run in terminal"
  button must POST to `/api/agent/terminal/run` with the current session_id and command,
  then stream output back to the terminal panel

**2. AutoRAG — `rag_search` tool never called**
- Agent ignores memory/knowledge base entirely
- Check: Does `/api/agent/boot` return the rag_search tool in the tools list?
- Fix: Ensure `rag_search` is in the tools array sent to Anthropic API in the agent's
  system prompt / tool definitions

**3. Shell dropdown z-index**
- Topbar dropdowns fall behind agent content panel
- CSS fix: add `z-index` to shell dropdown container

**4. Glassmorphic "Run in Terminal" CTA**
- Style the bash code block run button to match the glassmorphic UI

### What Cursor Needs to Know Before Touching Agent Sam
- Agent source: `agent-dashboard/src/` (Vite/React)
- Built bundle: `dist/agent-dashboard.js`
- R2 path: `agent-sam/static/dashboard/agent/agent-dashboard.js`
- Cache bust: bump `?v=` in `agent-sam/static/dashboard/agent.html` on every deploy
- Deploy sequence: build → R2 upload bundle → R2 upload agent.html → wrangler deploy
- NEVER edit the bundle directly. Always edit source, rebuild, upload.
- Current version: `?v=30`

### The Core Problem with Agent Sam in One Sentence
The agent is wired to Claude (Anthropic API) correctly and streams responses correctly,
but the tool execution layer — the bridge between "agent says run this command" and
"command actually runs in the terminal" — is disconnected. The agent is essentially
talking to itself.

---

## SESSION HISTORY SUMMARY (for context)
- 100+ hours lost over multiple weeks to Cursor rebuilding/breaking the same infrastructure
- Cursor has created at minimum: 2 rogue terminal servers, 1 rogue launchd plist,
  1 broken tunnel config, multiple broken theme systems, a destroyed wrangler.toml,
  13 lost Worker secrets, broken OAuth (repaired), broken PTY token (repaired 8+ times)
- Pattern: Cursor "improves" infrastructure files it doesn't own, breaks working systems,
  next session doesn't know about the breakage, rebuilds from scratch in wrong direction
- Solution going forward: Cursor reads this document FIRST before any session.
  Cursor asks Sam before touching anything outside `agent-dashboard/src/` and `worker.js`.
