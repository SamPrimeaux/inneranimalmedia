# Sandbox Worker — Cloudflare Workers Builds

Worker name: **inneranimal-dashboard** (`wrangler.jsonc`). Production uses **`wrangler.production.toml`** only; do not point production Builds at this file.

**No git submodules:** the dashboard app lives under **`agent-dashboard/`** in this repo. Workers Builds only needs a normal clone (no `submodule update`).

## Deploy command (recommended)

Use the npm script so the entry script path is explicit (avoids Wrangler “Missing entry-point” when the dashboard config or cwd is ambiguous):

```bash
npm run deploy:sandbox
```

Equivalent:

```bash
npx wrangler deploy ./worker.js -c ./wrangler.jsonc
```

## If Builds fail with “Missing entry-point to Worker script”

1. **Root directory** in Workers Builds → Settings → Build: must be the **repository root** (leave empty or `/`), not a subfolder such as `inneranimalmedia-mcp-server` or `agent-dashboard`. The repo root must contain **`worker.js`** and **`wrangler.jsonc`**.
2. **Deploy command** must not include a typo such as `wrangler.jsonc.` (trailing dot). Use `./wrangler.jsonc` or the `npm run deploy:sandbox` script above.
3. Confirm **`worker.js`** is committed on the branch Builds uses (not gitignored).

## Bindings note

`wrangler.jsonc` mirrors sandbox R2 (`agent-sam-sandbox-cicd` for ASSETS/DASHBOARD) and includes **`AUTORAG_BUCKET` → `autorag`** for parity with production indexing uploads. Queues are intentionally omitted on sandbox (see comment in `wrangler.jsonc`).
