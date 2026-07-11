-- 812: Mac-free ship lanes rule — stop agents running deploy:full/Vite on GCP iam-tunnel.
-- Remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/812_mac_free_ship_lanes_rule.sql

INSERT OR IGNORE INTO agentsam_rules_document (
  id,
  rule_key,
  user_id,
  workspace_id,
  title,
  body_markdown,
  version,
  is_active,
  created_at_epoch,
  updated_at_epoch,
  apply_mode,
  rule_type,
  trigger_type,
  sort_order,
  notes,
  source_stored
) VALUES (
  'rule_mac_free_ship_lanes',
  'rule_mac_free_ship_lanes',
  '',
  'ws_inneranimalmedia',
  'LOCKED: Ship by host — Mac deploy:full/fast; GCP VM ship:remote only',
  '## Ship lanes (LOCKED — pick by host)

**SSOT:** docs/platform/mac-free-ship-lanes-2026-07.md · Cursor `.cursor/rules/iam-ship-lanes.mdc`

| Host | Command | Banned |
|------|---------|--------|
| Mac (operator) | `npm run deploy:full` or `npm run deploy:fast` | bare `npm run deploy` for SPA/PWA |
| GCP iam-tunnel / phone / remote PTY | `npm run ship:remote` | `deploy:full`, `deploy:fast`, Vite, rclone |
| Cloudflare Workers Builds | `smart-build` + `deploy:fast:cf` | wrangler-per-file R2 loops |
| Emergency worker-only | `npm run ship:remote -- --worker-only` | Expects SPA/PWA unchanged |

### Why
The GCP `iam-tunnel` VM has ~1GB RAM. Vite + rclone + `deploy:full` OOM/crash the box. Production SPA/PWA ships via Cloudflare Builds after `git push`.

### Remote procedure
1. Finish work + validate (`node --check`; skip Vite on the VM).
2. Commit + push (or let `ship:remote` push a clean tree).
3. Run `npm run ship:remote` — hands off to CF Builds.
4. Proof: `https://inneranimalmedia.com/pwa-build-meta.json` → `git_sha` + `cache_bust`.

### Do NOT
- Do not run `npm run deploy:full` on iam-tunnel.
- Do not run Vite / `npm --prefix dashboard run build` on iam-tunnel.
- Do not retry failed VM deploys with the same full pipeline — switch to `ship:remote`.',
  1,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'operations',
  'system',
  4,
  'Prevents OOM deploys on GCP; mirrors Cursor iam-ship-lanes.mdc',
  'd1:agentsam_rules_document:rule_mac_free_ship_lanes'
);

UPDATE agentsam_rules_document
SET
  title = 'LOCKED: Ship by host — Mac deploy:full/fast; GCP VM ship:remote only',
  body_markdown = '## Ship lanes (LOCKED — pick by host)

**SSOT:** docs/platform/mac-free-ship-lanes-2026-07.md · Cursor `.cursor/rules/iam-ship-lanes.mdc`

| Host | Command | Banned |
|------|---------|--------|
| Mac (operator) | `npm run deploy:full` or `npm run deploy:fast` | bare `npm run deploy` for SPA/PWA |
| GCP iam-tunnel / phone / remote PTY | `npm run ship:remote` | `deploy:full`, `deploy:fast`, Vite, rclone |
| Cloudflare Workers Builds | `smart-build` + `deploy:fast:cf` | wrangler-per-file R2 loops |
| Emergency worker-only | `npm run ship:remote -- --worker-only` | Expects SPA/PWA unchanged |

### Why
The GCP `iam-tunnel` VM has ~1GB RAM. Vite + rclone + `deploy:full` OOM/crash the box. Production SPA/PWA ships via Cloudflare Builds after `git push`.

### Remote procedure
1. Finish work + validate (`node --check`; skip Vite on the VM).
2. Commit + push (or let `ship:remote` push a clean tree).
3. Run `npm run ship:remote` — hands off to CF Builds.
4. Proof: `https://inneranimalmedia.com/pwa-build-meta.json` → `git_sha` + `cache_bust`.

### Do NOT
- Do not run `npm run deploy:full` on iam-tunnel.
- Do not run Vite / `npm --prefix dashboard run build` on iam-tunnel.
- Do not retry failed VM deploys with the same full pipeline — switch to `ship:remote`.',
  rule_key = 'rule_mac_free_ship_lanes',
  is_active = 1,
  apply_mode = 'always',
  trigger_type = 'system',
  sort_order = 4,
  updated_at_epoch = unixepoch(),
  source_stored = 'd1:agentsam_rules_document:rule_mac_free_ship_lanes'
WHERE id = 'rule_mac_free_ship_lanes';

-- Keep project runtime contract deploy text host-aware.
UPDATE agentsam_rules_document
SET
  body_markdown = '## Project runtime contract: inneranimalmedia

**SSOT:** agentsam_workspace `ws_inneranimalmedia` + wrangler.production.toml — not hardcoded operator paths in global rules.

### Repo & ship
- github_repo: resolve from agentsam_workspace (SamPrimeaux/inneranimalmedia)
- root_path: resolve from agentsam_workspace.root_path or metadata_json.repo.local_path
- validate: `npm run build:vite-only` when dashboard touched **on Mac/CI**; on GCP VM use `node --check` only (no Vite)
- deploy (Mac): `npm run deploy:full` or `npm run deploy:fast` from **this repo root only**
- deploy (GCP iam-tunnel / remote): `npm run ship:remote` only — never Vite/`deploy:full` on the VM
- D1: inneranimalmedia-business migrations from **this** repo
- Ship lanes SSOT: docs/platform/mac-free-ship-lanes-2026-07.md

### Terminal lanes (ExecOS)
| Lane | Hostname | When |
|------|----------|------|
| local | localpty.inneranimalmedia.com (samsmac tunnel) | Mac awake at desk |
| remote | terminal.inneranimalmedia.com (GCP iam-tunnel) | Mac asleep / phone / away |
| sandbox | MY_CONTAINER pool | Heavy builds, isolated zones |

### Sandbox R2 FUSE (default — not optional)
- Writable cwd: `/mnt/r2/{workspace_r2_prefix}/{zone_slug}/`
- Persist assets under `{zone_slug}/assets/` — do not rely on ephemeral container disk alone
- Read workspace r2_prefix from workspaces.r2_prefix / agentsam_workspace metadata

### Related docs
- docs/platform/mac-free-ship-lanes-2026-07.md
- docs/platform/terminal-three-lane-model.md
- docs/platform/worker-env-production-2026-06.md',
  updated_at_epoch = unixepoch()
WHERE id = 'rule_inneranimalmedia_runtimecontract';
