# Terminal keys — full reset checklist

Use this when you want **one** new shared token everywhere the terminal stack checks auth. Nothing here is stored in D1; it is all Worker secrets + your Mac PTY process.

## What must match (same string)

| Where | Variable | Role |
|--------|----------|------|
| Mac `~/iam-pty` (PM2 / `ecosystem.config.cjs`) | `PTY_AUTH_TOKEN` | PTY server validates WebSocket `?token=` and `/exec` `Authorization: Bearer` |
| Cloudflare Worker **inneranimalmedia** | `TERMINAL_SECRET` | Worker adds this to upstream WebSocket URL and `x-terminal-secret` when proxying `/api/agent/terminal/ws` |
| Cloudflare Worker **inneranimalmedia** | `PTY_AUTH_TOKEN` | Bearer token for `POST /api/terminal/session/register` (separate from `TERMINAL_SECRET` in code — set both to the **same** value to avoid confusion) |
| Cloudflare Worker **inneranimalmedia-mcp-server** | `PTY_AUTH_TOKEN` | MCP tool `terminal_execute` calls `https://terminal.inneranimalmedia.com/exec` with this Bearer token |

## Not a rotating “key” (but must be correct)

| Where | Variable | Typical value |
|--------|----------|----------------|
| Worker **inneranimalmedia** | `TERMINAL_WS_URL` | `https://terminal.inneranimalmedia.com` |

Use **`https://`**, not `wss://`. No path. This is the URL the Worker `fetch()` uses for the WebSocket upgrade.

## 1. Generate a new token (local only)

```bash
openssl rand -hex 32
```

Copy the output into your vault. Do not commit it or paste it into chat logs you care about.

## 2. Mac PTY (`iam-pty`)

1. Set **`PTY_AUTH_TOKEN`** in `~/iam-pty/ecosystem.config.cjs` (or whatever env your `server.js` reads — canonical name is `PTY_AUTH_TOKEN`).
2. Restart:

```bash
pm2 restart iam-pty
# or, if you changed ecosystem file:
pm2 delete iam-pty && pm2 start ~/iam-pty/ecosystem.config.cjs
```

3. Local check (install `wscat` if needed: `npm i -g wscat`):

```bash
wscat -c "ws://127.0.0.1:3099/?token=YOUR_NEW_TOKEN"
```

You want a successful open, not an immediate error close.

## 3. Main Worker secrets (`inneranimalmedia`)

From repo root (uses `with-cloudflare-env.sh` so `CLOUDFLARE_API_TOKEN` is loaded):

```bash
cd /path/to/march1st-inneranimalmedia

./scripts/with-cloudflare-env.sh npx wrangler secret put TERMINAL_SECRET -c wrangler.production.toml
# paste YOUR_NEW_TOKEN

./scripts/with-cloudflare-env.sh npx wrangler secret put PTY_AUTH_TOKEN -c wrangler.production.toml
# paste the SAME token

printf '%s' 'https://terminal.inneranimalmedia.com' | ./scripts/with-cloudflare-env.sh npx wrangler secret put TERMINAL_WS_URL -c wrangler.production.toml
```

Secrets apply on the **next** Worker invocation; no full redeploy is strictly required for secret-only updates, but if something still looks cached, redeploy after Sam approves.

## 4. MCP Worker secret (`inneranimalmedia-mcp-server`)

```bash
cd /path/to/march1st-inneranimalmedia

./scripts/with-cloudflare-env.sh npx wrangler secret put PTY_AUTH_TOKEN -c inneranimalmedia-mcp-server/wrangler.toml
# paste the SAME token as above
```

## 5. Tunnel + port sanity

- Tunnel public hostname should forward to **`http://127.0.0.1:3099`** (or whatever `PTY_PORT` you use).
- In `~/.cloudflared/config.yml`, do **not** use `protocol: http2` for this ingress; it breaks WebSocket upgrades. See `docs/IAM_INFRASTRUCTURE_TERMINAL_FIX_AGENT_SAM_HANDOFF.md` and `docs/TERMINAL_REBUILD.md`.

## 6. Quick remote checks

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://terminal.inneranimalmedia.com
```

You expect something other than a long hang; the PTY server may return a short HTML/text line for non-WebSocket GET.

## Verify secrets exist (names only)

```bash
./scripts/with-cloudflare-env.sh npx wrangler secret list -c wrangler.production.toml | grep -E 'TERMINAL|PTY'
cd inneranimalmedia-mcp-server && ../scripts/with-cloudflare-env.sh npx wrangler secret list -c wrangler.toml | grep PTY
```

Cloudflare will not print values.

## Related docs

- `docs/TERMINAL_REBUILD.md` — tunnel + server from scratch
- `docs/TERMINAL_SERVER_SETUP.md` — Access / Bot Fight exemptions for `terminal.inneranimalmedia.com`
- `docs/IAM_INFRASTRUCTURE_TERMINAL_FIX_AGENT_SAM_HANDOFF.md` — incident notes and recovery order
