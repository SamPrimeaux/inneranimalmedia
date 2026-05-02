-- Register repo cache-bust v138 in dashboard_versions (aligns with dashboard/agent.html ?v=138).
-- File hashes/sizes from workspace at insert time; re-run with updated hashes if bundle changes.
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/d1-dashboard-versions-v138.sql

INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES
('agent-js-v138-registry-20260324', 'agent', 'v138', 'c9454273f5de3467870bba25fa3078db', 460707, 'static/dashboard/agent/agent-dashboard.js', 'Repo dashboard/agent.html ?v=138; MD5/size from agent-dashboard/dist (registry sync)', 1, 1, unixepoch()),
('agent-css-v138-registry-20260324', 'agent-css', 'v138', 'a1348a706026570e3476f67b1c382d7a', 3391, 'static/dashboard/agent/agent-dashboard.css', 'Repo dashboard/agent.html ?v=138; MD5/size from agent-dashboard/dist (registry sync)', 1, 1, unixepoch()),
('agent-html-v138-registry-20260324', 'agent-html', 'v138', '65ededb993efdfa8312acee729886165', 64931, 'static/dashboard/agent.html', 'Repo dashboard/agent.html ?v=138 (cache-bust query matches bundle registry)', 1, 1, unixepoch());
