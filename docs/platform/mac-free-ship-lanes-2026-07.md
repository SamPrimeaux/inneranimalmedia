# Mac-free ship lanes (LOCKED)

When the Mac is asleep, **do not** run `npm run deploy:full` on the GCP `iam-tunnel` VM (Vite + rclone OOMs the box).

## Lanes

| Lane | Host | Command | What ships |
|------|------|---------|------------|
| **Remote (default)** | VM / phone / any git | `npm run ship:remote` | Push → Cloudflare Workers Builds runs Vite + R2 delta + wrangler |
| **Fast (operator)** | Mac or CI with RAM | `npm run deploy:fast` | Critical path only (no email/GCP/memory hooks) |
| **Full (operator)** | Mac preferred | `npm run deploy:full` | Fast path + blocking post-hooks (legacy script today) |
| **Emergency worker** | VM | `npm run ship:remote -- --worker-only` | Wrangler only — SPA/PWA unchanged |

## Cloudflare Builds requirements

1. **Build command:** `node scripts/smart-build.mjs` (Vite + bump-cache)
2. **Deploy command (main):** `npm run deploy:fast:cf` (`DEPLOY_FAST_SKIP_BUILD=1` → R2 delta + wrangler)
3. **Build secrets:** `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID` (plus existing API token)
4. **Watch paths:** must **not** exclude `dashboard/**` (was historically excluded — that forced Mac `deploy:full` for SPA). `ship:remote` also POSTs the deploy hook as a backstop.
5. Sync triggers from any host with API token: `./scripts/cf-builds-sync.sh`

## R2 sync

`scripts/r2-dashboard-delta-sync.mjs` replaces rclone `--checksum`: local SHA-256 manifest vs `analytics/deploys/previous-manifest.json`, PutObject delta only, delete stale, publish PWA + canonical keys.
