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

1. **Build command:** `node scripts/smart-build.mjs` (Vite + bump-cache; skips CMS vendor npm install)
2. **Deploy command (main):** `npm run deploy:fast:cf` (R2 delta via **CF API token** or S3 keys + wrangler — no zsh)
3. **Auth:** Builds already injects `CLOUDFLARE_API_TOKEN`. Account id is read from `wrangler.production.toml` vars if unset. Optional speed-up: add `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` as Build secrets (S3 backend).
4. **Watch paths:** must **not** exclude `dashboard/**`
5. Sync triggers: `./scripts/cf-builds-sync.sh`

## Bloat killed (2026-07-11)

| Waste | Fix |
|-------|-----|
| wrangler CLI × N R2 puts (~2s each → 5 min) | Parallel CF R2 REST / S3; refuse wrangler backend |
| `with-cloudflare-env.sh` (zsh) on CF image | Direct `npx wrangler` when token present |
| `copy-cms-vendor` npm install react@18 (~19s) | Skipped on CI |
| rclone `--checksum` full crawl | Content-hash manifest delta only |