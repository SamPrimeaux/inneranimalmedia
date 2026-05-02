# Personal terminal server — one-time setup

This document covers installing and configuring the **personal terminal server**: a Node/Bun WebSocket server using **node-pty** that spawns a shell and pipes stdin/stdout bidirectionally. The dashboard’s **xterm.js** panel connects to it over a **Cloudflare Tunnel** (or direct `ws://` in dev).

---

## 1. Install dependencies

From the **repo root**:

```bash
# Terminal server (Node)
cd server && npm install
cd ..

# Dashboard terminal panel (xterm.js)
cd agent-dashboard && npm install
cd ..
```

You need **node-pty** and **ws** in `server/`, and **xterm** + **xterm-addon-fit** in `agent-dashboard/`. No new tables or migrations — the terminal is a separate process; when you wire command logging later, use existing tables: **command_executions**, **agent_command_executions**, **agent_workspace_state**, **agent_telemetry** (see briefing in the Cursor prompt).

---

## 2. Create and run the terminal server

**Option A — from repo root (runs server/terminal.js with server’s deps):**

```bash
TERMINAL_SECRET=your-secret-here PORT=3099 npm run terminal
```

**Option B — from server/:**

```bash
cd server
TERMINAL_SECRET=your-secret-here PORT=3099 npm start
```

**Option C — TypeScript (if you use tsx or Bun):**

```bash
TERMINAL_SECRET=your-secret-here PORT=3099 npx tsx server/terminal.ts
# or
TERMINAL_SECRET=your-secret-here PORT=3099 bun server/terminal.ts
```

The server listens on **127.0.0.1:3099**. Connections must include `?token=SECRET` (or the same token in `Sec-WebSocket-Protocol`) or the server closes with 4001 Unauthorized.

---

## 3. Cloudflare Tunnel (so the dashboard can connect via wss://)

The dashboard is served from **www.inneranimalmedia.com**; the terminal server runs on your machine. Expose it with a **Cloudflare Tunnel** so the browser can connect with **wss://**.

### 3.1 Create the tunnel

```bash
cloudflared tunnel create iam-terminal
```

Note the tunnel ID and where the credentials file is saved (e.g. `~/.cloudflared/<TUNNEL_ID>.json`).

### 3.2 Tunnel config (ingress → localhost:3099)

**Option A — Dashboard (recommended for token-based tunnels)**

In Cloudflare Zero Trust → **Networking** → **Tunnels** → your tunnel → **Routes** → **+ Add route** (or “Add published application”):

- **Subdomain:** `terminal` (so the public hostname is `terminal.inneranimalmedia.com`).
- **Domain:** `inneranimalmedia.com`.
- **Path (optional):** Leave empty so the whole hostname is for the terminal.
- **Service (URL):** **`http://127.0.0.1:3099`** — this is the exact URL the tunnel expects (your Node terminal server).

Then set the worker secret: `wrangler secret put TERMINAL_WS_URL` and enter **`https://terminal.inneranimalmedia.com`** (Workers `fetch()` uses `https://` with `Upgrade: websocket`; do not use `wss://`).

**Option B — Config file (for `cloudflared tunnel run <name>`)**

Copy and edit the example:

```bash
cp server/tunnel.yml.example server/tunnel.yml
```

Edit `server/tunnel.yml`:

- Set `tunnel: iam-terminal` (or your tunnel name).
- Set `credentials-file` to the path of the JSON file from `tunnel create`.
- Set the hostname (e.g. `iam-terminal.<your-tunnel-id>.cfargotunnel.com`) and service:

```yaml
tunnel: iam-terminal
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: iam-terminal.<TUNNEL_ID>.cfargotunnel.com
    service: http://127.0.0.1:3099
  - service: http_status:404
```

WebSocket connections to `wss://iam-terminal.<TUNNEL_ID>.cfargotunnel.com` will be forwarded to `http://127.0.0.1:3099` (the terminal server handles the WS upgrade).

### 3.3 (Optional) Cloudflare Access — restrict to your email

To restrict who can open the terminal:

1. In Cloudflare Zero Trust: **Access → Applications → Add an application**.
2. Choose **Self-hosted**; set the subdomain/hostname to your tunnel hostname (e.g. `iam-terminal.<TUNNEL_ID>.cfargotunnel.com`).
3. Add a **Policy** (e.g. “Allow” when Email equals `your@email.com`).
4. Save. Unauthenticated requests will get a login page before reaching the terminal server.

**Important:** If you protect **terminal.inneranimalmedia.com** with Access, the **Worker’s** server-side `fetch()` to that host will get **403 cf-mitigated: challenge** because service tokens do not work reliably with WebSocket upgrades. Use the exemption below instead.

### 3.3a Fix 403: Let the Worker reach the terminal (exempt subdomain)

The dashboard’s **Run in terminal** flow uses the Worker: the Worker does a WebSocket `fetch()` to **TERMINAL_WS_URL** (e.g. `https://terminal.inneranimalmedia.com`). If that host is behind Cloudflare Access or Bot Fight Mode, the request returns **403** and the terminal fails.

**Fastest fix — exempt the terminal subdomain (no code change, no deploy):**

1. **Cloudflare Zero Trust → Access → Applications**
   - Find the application that protects **terminal.inneranimalmedia.com** (e.g. “Terminal”).
   - Either:
     - **Option A (recommended):** Edit that application and add a **Bypass** policy that runs **before** your “Allow” policy: **Include** = “Everyone”, **Action** = “Bypass”. That exempts the host from Access so the Worker’s fetch reaches the tunnel without a challenge.
     - **Option B:** Delete the Access application for **terminal.inneranimalmedia.com** so the host has no Access protection (tunnel + TERMINAL_SECRET in the URL remain the only auth).

2. **If you still see 403** (e.g. from WAF/Bot Fight Mode, not Access):
   - **Security → WAF → Custom rules** (or **Security rules** in the new dashboard).
   - Create a rule: **If** `(http.host eq "terminal.inneranimalmedia.com")` **then** **Skip** → choose “Super Bot Fight Mode” (and any other managed rules that trigger challenges). Save and deploy.

After this, `curl -i https://terminal.inneranimalmedia.com` should return **101 Switching Protocols** (or at least not 403). Then the Worker’s WebSocket fetch will succeed. No Worker deploy needed for this step.

### 3.4 Run the tunnel

```bash
cloudflared tunnel run iam-terminal
```

Or with an explicit config:

```bash
cloudflared tunnel --config server/tunnel.yml run iam-terminal
```

Keep this running while you want the dashboard to reach the terminal. The terminal server must also be running (step 2).

### 3.5 Replicas and “Degraded” status

- **Two replicas:** If you ran both `sudo cloudflared service install <token>` and `cloudflared tunnel run --token <token>` (manual), two processes connect with the same token → dashboard shows **2 Active replicas**. Both work; to have only one, stop the manual run (Ctrl+C) and rely on the service (or use the HTTP/2 plist so the service connects reliably).
- **Degraded with 0 routes:** The tunnel shows “Degraded” until at least one **route** is added (see 3.2). Add a route with Service URL `http://127.0.0.1:3099` and the status will clear.

---

## 4. Worker config (so the dashboard gets the WebSocket URL and token)

The dashboard calls **GET /api/agent/boot** and uses `terminal_ws_url` and `terminal_token` from the response to connect the xterm.js panel. Set these in the worker:

- **TERMINAL_WS_URL** — URL for the Worker to fetch (WebSocket upgrade). Use **`https://`** (e.g. `https://terminal.inneranimalmedia.com` or `https://iam-terminal.<TUNNEL_ID>.cfargotunnel.com`). Workers `fetch()` does not accept `wss://`; use `https://` with `Upgrade: websocket` headers (no path; the server uses `/`).
- **TERMINAL_SECRET** — the same secret you run the terminal server with. The worker returns it as `terminal_token` so the dashboard can send it as `?token=...`. For production, prefer a short-lived token issued by the worker; for personal use, returning the shared secret from boot is acceptable if the dashboard is behind auth.

**Wrangler secrets (recommended):**

```bash
# From repo root, with wrangler.production.toml
npx wrangler secret put TERMINAL_WS_URL   # paste https://... (not wss:// — Workers fetch uses https://)
npx wrangler secret put TERMINAL_SECRET  # paste your secret
```

Redeploy the worker after setting secrets so boot includes the new values.

---

## 5. Dashboard: open the terminal panel

1. Deploy the dashboard bundle (including the xterm panel):  
   `./agent-dashboard/deploy-to-r2.sh`
2. Open **https://www.inneranimalmedia.com/dashboard/agent**.
3. Click **Terminal** in the welcome commands (or switch to the terminal mode in the UI). The xterm.js panel will connect to `terminal_ws_url` with `?token=terminal_token`. If TERMINAL_WS_URL / TERMINAL_SECRET are not set, the panel shows “Terminal not configured.”

**From iPhone or another device:** Open the same dashboard URL in the browser; the terminal panel connects through the tunnel to your Mac. No extra setup as long as the tunnel and terminal server are running on the Mac.

**24/7 availability:** The **Terminal.app** window does not need to stay open. The **Node terminal server** (step 2) must be running on the Mac whenever you want the web terminal to work. Options: run it in a persistent terminal, or run it as a service (e.g. `launchd` on macOS or `pm2`). The tunnel can run as a system service (e.g. `cloudflared service install`); only the terminal server process needs to be kept alive on the host.

### 5.1 Run the terminal server as a macOS service (survives close/reboot, auto-restarts)

So you don’t have to keep a terminal tab open and so it restarts if it crashes or WiFi is spotty. **macOS blocks launchd from running scripts in Downloads**, so the service is installed under **~/.local/iam-terminal-server** (use the install script below).

1. **Create the env file** (secret stays out of the plist):
   ```bash
   mkdir -p ~/.config
   printf 'TERMINAL_SECRET=your-same-secret-as-wrangler\nPORT=3099\n' > ~/.terminal-server.env
   chmod 600 ~/.terminal-server.env
   ```
   Use the same value as your `TERMINAL_SECRET` wrangler secret.

2. **Install the service** (copies server to ~/.local and loads LaunchAgent). From **repo root**:
   ```bash
   chmod +x server/install-terminal-server-service.sh
   ./server/install-terminal-server-service.sh
   ```
   If you had a previous LaunchAgent loaded that failed (e.g. exit 126), the script unloads it and loads the new one.

3. **Check it’s running:**
   ```bash
   launchctl list | grep terminal-server
   tail -5 ~/Library/Logs/terminal-server.out.log
   ```
   You should see a PID in the first column and log line like `Terminal server listening on ws://127.0.0.1:3099`.

The service will start at login and **restart automatically** if the process exits. Logs: `~/Library/Logs/terminal-server.out.log` and `.err.log`. To stop: `launchctl unload ~/Library/LaunchAgents/com.inneranimalmedia.terminal-server.plist`. To disable at login, unload and remove the plist from `~/Library/LaunchAgents/`.

**If you previously loaded the plist that pointed at the repo in Downloads:** run `launchctl unload ~/Library/LaunchAgents/com.inneranimalmedia.terminal-server.plist`, then run step 2 above so the service runs from ~/.local instead.

**WiFi:** The terminal server itself doesn’t use WiFi; only the tunnel does. Cloudflared (already installed as a service) will retry when the connection drops and comes back. So spotty WiFi may cause short disconnects in the web terminal until the tunnel reconnects; no need to restart anything.

---

## 6. Wiring to existing tables (no new tables)

When you add command/execution logging, use the **existing** schema:

- **command_execution_queue** — queue commands before running (if you adopt a queue-based flow).
- **command_executions** — log each execution with status/output.
- **agent_command_executions** — agent-triggered commands; link to **agent_sessions** and **agent_workspace_state**.
- **agent_workspace_state** — read/write before starting work so agents don’t overlap (see Cursor briefing).
- **agent_telemetry** / **agent_audit_log** — log every agent action.

The terminal server itself does not touch D1; you can add a small API or worker endpoint that receives “command executed” events from the server (or from the dashboard after it gets output) and writes to **command_executions** / **agent_command_executions** and related tables.

---

## 7. Quick reference

| Step | Command / action |
|------|-------------------|
| **Debug (one last check)** | `./scripts/with-cloudflare-env.sh ./scripts/terminal-debug.sh` — lists tunnels, tests WebSocket upgrade, reminds you to check Worker logs |
| **Rebuild from scratch** | See **docs/TERMINAL_REBUILD.md** — new tunnel via API, new secret, step-by-step |
| Install server deps | `cd server && npm install` |
| Install dashboard xterm | `cd agent-dashboard && npm install` |
| Run terminal server | `TERMINAL_SECRET=xxx PORT=3099 npm run terminal` (from root) |
| **Run as service (macOS)** | Create `~/.terminal-server.env`, copy `docs/com.inneranimalmedia.terminal-server.plist` to `~/Library/LaunchAgents/`, `launchctl load ~/Library/LaunchAgents/com.inneranimalmedia.terminal-server.plist` |
| Create tunnel | `cloudflared tunnel create iam-terminal` |
| Config tunnel | Edit `server/tunnel.yml` (hostname → `http://127.0.0.1:3099`) |
| (Optional) Access policy | Zero Trust → Application → restrict to your email |
| Run tunnel | `cloudflared tunnel run iam-terminal` |
| Worker secrets | `wrangler secret put TERMINAL_WS_URL` and `TERMINAL_SECRET` |
| Deploy dashboard | `./agent-dashboard/deploy-to-r2.sh` |
| Open terminal in UI | Dashboard → Agent → Terminal |
