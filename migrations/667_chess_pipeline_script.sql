-- 667: Chess Meshy pipeline — R2 autorag + agentsam_scripts + /chess_pipeline slash.
--
-- Upload first:
--   ./scripts/upload-agentsam-scripts-r2.sh \
--     "scripts/chess_pipeline.sh|ingest/chess_pipeline.sh|chess_pipeline|ingest|high|Meshy preview→refine for 5 white chess pieces; gltf-transform optimize; upload to R2 chess-pieces/"
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/667_chess_pipeline_script.sql

INSERT OR REPLACE INTO agentsam_scripts (
  id, tenant_id, workspace_id, slug, name, path, body, description, purpose,
  runner, language, script_hash, is_global, is_active, requires_env, owner_only,
  safe_to_run, approval_required, risk_level, preferred_for, notes, source_stored,
  created_at_epoch, updated_at_epoch
) VALUES (
  'script_chess_pipeline',
  'tenant_sam_primeaux',
  'ws_designstudio',
  'chess_pipeline',
  'Chess Meshy GLB pipeline',
  'scripts/chess_pipeline.sh',
  '',
  'Generate procedural Three.js board (STEP 0, free) + queen/bishop/knight/rook/pawn via Meshy text-to-3D (parallel preview→refine), optimize with gltf-transform, upload to inneranimalmedia R2 chess-pieces/. Requires MESHYAI_API_KEY in .env.cloudflare, gltf-transform CLI, dashboard npm install (three), operator Mac with wrangler auth. ~75–100 Meshy credits for pieces; board is zero credits.',
  'ingest',
  'bash',
  'bash',
  '0c5ed45d6b49869b1972e53c41998d9b200b65b9ccba248c7e67aa1075021bdc',
  0,
  1,
  1,
  1,
  1,
  1,
  'high',
  'designstudio,chess,meshy,glb,r2,ingest',
  'Run: cd ~/inneranimalmedia && bash scripts/chess_pipeline.sh. Board: https://assets.inneranimalmedia.com/chess-pieces/chess_board_opt.glb. Pieces: chess_{piece}_white_opt.glb. King uploaded separately unless already on R2.',
  'r2:inneranimalmedia-autorag/scripts/ingest/chess_pipeline.sh',
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_commands (
  id, workspace_id, tenant_id, slug, display_name, description, pattern, pattern_type,
  mapped_command, category, subcategory, risk_level, requires_confirmation,
  show_in_slash, show_in_palette, sort_order, is_active, is_global, execution_mode,
  router_type, tool_key, internal_seo, created_at, updated_at
) VALUES (
  'cmd_chess_pipeline',
  'platform',
  'tenant_sam_primeaux',
  '/chess_pipeline',
  'Chess Meshy pipeline',
  'Regenerate full chess set: procedural Three.js board + 5 white piece GLBs via Meshy (preview→refine), optimize, upload to R2 chess-pieces/. Board is free; pieces ~75–100 credits. Runs on operator Mac via terminal.',
  '/chess_pipeline',
  'exact',
  'bash scripts/chess_pipeline.sh',
  'designstudio',
  'meshy',
  'high',
  1,
  1,
  1,
  45,
  1,
  1,
  'agent',
  'script',
  'chess_pipeline',
  'slash_chess_pipeline_meshy_glb',
  datetime('now'),
  datetime('now')
);

UPDATE agentsam_commands SET
  router_type = 'script',
  tool_key = 'chess_pipeline',
  mapped_command = 'bash scripts/chess_pipeline.sh',
  category = 'designstudio',
  subcategory = 'meshy',
  risk_level = 'high',
  requires_confirmation = 1,
  show_in_slash = 1,
  is_active = 1,
  is_global = 1,
  updated_at = datetime('now')
WHERE id = 'cmd_chess_pipeline';
