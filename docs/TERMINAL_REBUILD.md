# Terminal + tunnel rebuild (nuclear option)

If the terminal still shows "Connected" then "Disconnected" after running `./scripts/terminal-debug.sh` and checking Worker logs, use this flow to create a **new** tunnel and wire it from scratch. Your `CLOUDFLARE_API_TOKEN` (in `.env.cloudflare` or `~/.zshrc`) must have **Cloudflare Tunnel: Edit** and **Zone DNS: Edit**.

---

## Prereqs

- `cloudflared` installed (`brew install cloudflared` or [download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/))
- Node in `server/` for the terminal server (`cd server && npm install`)
- Credentials: `./scripts/with-cloudflare-env.sh sh -c 'echo Token set: ${CLOUDFLARE_API_TOKEN:+yes}'` prints "Token set: yes"

---

## Step 1: Create a new tunnel (API)

From repo root, with token loaded:

```bash
./scripts/with-cloudflare-env.sh sh -c '
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-ede6590ac0d2fb7daf155b35653457b2}"
RES=$(curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"iam-terminal-v2\",\"config_src\":\"cloudflare\"}")
echo "$RES" | jq .
TUNNEL_ID=$(echo "$RES" | jq -r ".result.id")
TOKEN=$(echo "$RES" | jq -r ".result.token")
echo ""
echo "TUNNEL_ID=$TUNNEL_ID"
echo "TOKEN=$TOKEN"
echo ""
echo "Save the TOKEN above; you will run: cloudflared tunnel run --token <TOKEN>"
'
```

Copy the **TUNNEL_ID** and **TOKEN** from the output.

---

## Step 2: Configure tunnel ingress (API)

Set the tunnel to route `terminal.inneranimalmedia.com` → `http://127.0.0.1:3099`. Replace `$TUNNEL_ID` with the value from Step 1.

```bash
./scripts/with-cloudflare-env.sh sh -c '
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-ede6590ac0d2fb7daf155b35653457b2}"
TUNNEL_ID="<PASTE_TUNNEL_ID_HERE>"
curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"config\": {
      \"ingress\": [
        { \"hostname\": \"terminal.inneranimalmedia.com\", \"service\": \"http://127.0.0.1:3099\", \"originRequest\": {} },
        { \"service\": \"http_status:404\" }
      ]
    }
  }" | jq .
'
```

---

## Step 3: DNS CNAME for terminal subdomain

Get your zone ID for `inneranimalmedia.com`, then create a CNAME record. Replace `$ZONE_ID` and `$TUNNEL_ID`.

```bash
# Get ZONE_ID
./scripts/with-cloudflare-env.sh sh -c '
curl -sS "https://api.cloudflare.com/client/v4/zones?name=inneranimalmedia.com" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq ".result[0].id"
'

# Create CNAME (replace ZONE_ID and TUNNEL_ID)
./scripts/with-cloudflare-env.sh sh -c '
ZONE_ID="<PASTE_ZONE_ID_HERE>"
TUNNEL_ID="<PASTE_TUNNEL_ID_HERE>"
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"CNAME\",
    \"proxied\": true,
    \"name\": \"terminal\",
    \"content\": \"${TUNNEL_ID}.cfargotunnel.com\"
  }" | jq .
'
```

If `terminal` already exists, either delete it in the dashboard first or use a different hostname (e.g. `term2.inneranimalmedia.com`) and set **TERMINAL_WS_URL** to `https://term2.inneranimalmedia.com` in Step 5 (Workers use `https://`, not `wss://`).

---

## Step 4: Run cloudflared with the new token

In a terminal (keep it open or install as a service):

```bash
cloudflared tunnel run --token <PASTE_TOKEN_FROM_STEP_1>
```

Or install as a system service (macOS):

```bash
sudo cloudflared service install <PASTE_TOKEN_FROM_STEP_1>
```

---

## Step 5: New terminal secret + worker secrets

Generate a new secret and use it everywhere:

```bash
NEW_SECRET=$(openssl rand -hex 16)
echo "TERMINAL_SECRET=$NEW_SECRET"
```

Set worker secrets (from repo root):

```bash
./scripts/with-cloudflare-env.sh npx wrangler secret put TERMINAL_WS_URL -c wrangler.production.toml
# Enter: https://terminal.inneranimalmedia.com  (Workers fetch uses https://, not wss://)

./scripts/with-cloudflare-env.sh npx wrangler secret put TERMINAL_SECRET -c wrangler.production.toml
# Enter: the NEW_SECRET from above
```

Update terminal server env (for local process or launchd):

```bash
# If using ~/.terminal-server.env for launchd
printf 'TERMINAL_SECRET=<SAME_NEW_SECRET>\nPORT=3099\n' > ~/.terminal-server.env
chmod 600 ~/.terminal-server.env
# Then restart the terminal server service if you use launchd:
launchctl unload ~/Library/LaunchAgents/com.inneranimalmedia.terminal-server.plist
launchctl load ~/Library/LaunchAgents/com.inneranimalmedia.terminal-server.plist
```

---

## Step 6: Start the terminal server

If not using launchd:

```bash
cd ~/Downloads/march1st-inneranimalmedia
TERMINAL_SECRET=<SAME_NEW_SECRET> PORT=3099 npm run terminal
```

Keep this running (or rely on the launchd service).

---

## Step 7: Deploy worker and verify

```bash
./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml
```

Then:

1. Open **https://www.inneranimalmedia.com/dashboard/agent** and go to the Terminal tab.
2. Run the debug script again: `./scripts/with-cloudflare-env.sh ./scripts/terminal-debug.sh` (optionally set `TERMINAL_WS_URL=https://terminal.inneranimalmedia.com`).
3. Check Worker logs for `[terminal/ws]` to see if the connection stays open or who closes it.

---

## Quick reference

| Step | What |
|------|------|
| 1 | Create tunnel via API → get TUNNEL_ID + TOKEN |
| 2 | PUT tunnel config: hostname terminal.inneranimalmedia.com → http://127.0.0.1:3099 |
| 3 | Create CNAME terminal → TUNNEL_ID.cfargotunnel.com |
| 4 | Run cloudflared with TOKEN |
| 5 | New TERMINAL_SECRET; wrangler secret put TERMINAL_WS_URL + TERMINAL_SECRET |
| 6 | Start terminal server with same TERMINAL_SECRET |
| 7 | Deploy worker, test dashboard + terminal-debug.sh |

---

## If you still see "Disconnected"

- **Worker log says `closed: upstream`** → Tunnel or Node server is closing the WebSocket. Ensure (1) terminal server is running and (2) cloudflared is running with the same tunnel token and (3) no Access policy is blocking the Worker’s request to `terminal.inneranimalmedia.com` (see TERMINAL_SERVER_SETUP.md § 3.3a).
- **Worker log says `closed: client`** → Browser/dashboard is closing. Try a different browser or incognito; ensure you’re not switching tabs before the connection stabilizes.
- **No `[terminal/ws]` in logs** → Request might be 401 (not logged in) or 503 (TERMINAL_WS_URL not set). Confirm you’re signed in and secrets are set.
