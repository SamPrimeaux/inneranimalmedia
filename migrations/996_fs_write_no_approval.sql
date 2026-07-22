-- 996: Agent file create/edit must not require UI approval (Cursor-parity autonomy).
-- Safety stays on write_policy (Ask/Plan deny; Agent allows file.write).
-- Keep approval for deploy / git push / email / cms publish / etc.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/996_fs_write_no_approval.sql

UPDATE agentsam_tools
SET
  requires_approval = 0,
  updated_at = unixepoch()
WHERE tool_key IN ('fs_write_file', 'fs_edit_file')
  AND COALESCE(requires_approval, 0) = 1;
