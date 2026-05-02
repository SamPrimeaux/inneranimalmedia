# Time tracking Fix B — run when authenticated

Run these once (with valid Cloudflare credentials) so today's session and active_timers are correct:

```bash
cd /path/to/march1st-inneranimalmedia
source .env.cloudflare  # or export CLOUDFLARE_API_TOKEN

# 1) Insert today's session (2026-03-03 from 08:00)
npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --command "INSERT OR IGNORE INTO project_time_entries (id, user_id, project_id, start_time, end_time, duration_seconds, is_active, description, created_at) VALUES ('session-2026-03-03-sam', 'sam_primeaux', 'inneranimalmedia', '2026-03-03 08:00:00', NULL, 0, 1, 'IAM Dashboard — Overview refactor, time tracking, deploy logging', datetime('now'))"

# 2) Point active_timers at this entry (both user_id variants)
npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --command "UPDATE active_timers SET active_time_entry_id = 'session-2026-03-03-sam', active_project_id = 'inneranimalmedia', status = 'running', updated_at = datetime('now') WHERE user_id IN ('sam_primeaux', 'user_sam_primeaux')"
```

If no row exists in `active_timers`, insert one first (tenant_sam_primeaux / user_sam_primeaux as appropriate for your schema).
