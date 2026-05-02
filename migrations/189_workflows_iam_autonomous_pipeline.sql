-- 189: workflows table — IAM autonomous pipeline definitions (artifact → promote).
-- Idempotent: INSERT OR IGNORE by fixed id (does not overwrite existing rows or reset counts).
-- To refresh definitions after edit: DELETE FROM workflows WHERE id='wf_iam_...' then re-run, or UPDATE steps manually.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/189_workflows_iam_autonomous_pipeline.sql

INSERT OR IGNORE INTO workflows (
  id, name, description, workflow_type, trigger_type, trigger_config, steps, is_active, success_count, failure_count, last_run_at, created_at
) VALUES (
  'wf_iam_artifact_init',
  'Artifact Run Init',
  'Create workflow_runs row; register workflow_artifacts contract; emit run_started. Uses mcp_workflows FK for workflow_id when set.',
  'orchestration',
  'api',
  '{"triggers":["manual","api"],"iam":"workflow_runs + workflow_artifacts; not table artifacts"}',
  '[{"step":1,"name":"gen_run_id","type":"d1","action":"insert_workflow_run","description":"INSERT workflow_runs same fields as POST /api/agent/workflows/trigger; id prefix wfr_"},{"step":2,"name":"set_artifact_contract","type":"d1","action":"insert","table":"workflow_artifacts","description":"Map kind to artifact_type; r2_key; r2_bucket; content_hash; run_id FK"},{"step":3,"name":"emit_run_started","type":"notify","action":"sse_or_broadcast","description":"Emit event run_started with run_id; wire to agent SSE or broadcastAgentWorkflowEvent"}]',
  1,
  0,
  0,
  NULL,
  unixepoch()
);

INSERT OR IGNORE INTO workflows (
  id, name, description, workflow_type, trigger_type, trigger_config, steps, is_active, success_count, failure_count, last_run_at, created_at
) VALUES (
  'wf_iam_monaco_save',
  'Monaco Editor Save',
  'Validate payload; TOOLS R2 put monaco/{run_id}/{filename}; workflow_artifacts kind code; optional GET /api/settings/theme for monaco_theme.',
  'authoring',
  'api',
  '{"triggers":["api","postmessage_then_fetch"],"r2":"worker TOOLS binding; not MCP r2_write"}',
  '[{"step":1,"name":"receive_content","type":"validate","action":"validate_payload","fields":["run_id","filename","content","language"],"description":"Reject path traversal; cap size"},{"step":2,"name":"r2_put_tools","type":"r2","action":"r2_put","binding":"TOOLS","key_pattern":"monaco/{run_id}/{filename}"},{"step":3,"name":"d1_meta","type":"d1","action":"insert","table":"workflow_artifacts","artifact_type":"code"},{"step":4,"name":"theme_apply","type":"http","action":"fetch","route":"/api/settings/theme","extract":["monaco_theme"]}]',
  1,
  0,
  0,
  NULL,
  unixepoch()
);

INSERT OR IGNORE INTO workflows (
  id, name, description, workflow_type, trigger_type, trigger_config, steps, is_active, success_count, failure_count, last_run_at, created_at
) VALUES (
  'wf_iam_excalidraw_save',
  'Excalidraw Scene Save',
  'Scene JSON and optional SVG to TOOLS excalidraw/{run_id}/; workflow_artifacts diagram; optional IAM_COLLAB broadcast.',
  'authoring',
  'api',
  '{"triggers":["api","postmessage_then_fetch"],"collab":"IAM_COLLAB optional"}',
  '[{"step":1,"name":"receive_scene","type":"validate","action":"validate_payload","fields":["run_id","scene_json","export_svg"],"description":"Parse JSON; optional svg_string when export_svg true"},{"step":2,"name":"r2_put_scene","type":"r2","action":"r2_put","key":"excalidraw/{run_id}/scene.json"},{"step":3,"name":"r2_put_svg","type":"r2","action":"r2_put","when":"export_svg","key":"excalidraw/{run_id}/export.svg"},{"step":4,"name":"d1_meta","type":"d1","action":"insert","table":"workflow_artifacts","artifact_type":"diagram"},{"step":5,"name":"collab_sync","type":"do","action":"broadcast","binding":"IAM_COLLAB","optional":true}]',
  1,
  0,
  0,
  NULL,
  unixepoch()
);

INSERT OR IGNORE INTO workflows (
  id, name, description, workflow_type, trigger_type, trigger_config, steps, is_active, success_count, failure_count, last_run_at, created_at
) VALUES (
  'wf_iam_playwright_validate',
  'Playwright Artifact Validation',
  'playwright_jobs with job_type screenshot; queue consumer MYBROWSER; result_url; assertions in input_params_json; evaluate_assertions not in queue yet.',
  'validation',
  'manual',
  '{"depends_on":["wf_iam_monaco_save","wf_iam_excalidraw_save"],"trigger":"after_authoring","iam":"url column not target_url; use input_params_json for assertions and workflow_run_id"}',
  '[{"step":1,"name":"enqueue_job","type":"d1","action":"insert","table":"playwright_jobs","required":["id","job_type","url"],"defaults":{"job_type":"screenshot","status":"pending"}},{"step":2,"name":"queue_dispatch","type":"queue","action":"send","body":["jobId","job_type","url"]},{"step":3,"name":"browser_run","type":"browser","action":"mybrowser_screenshot","binding":"MYBROWSER"},{"step":4,"name":"screenshot_r2","type":"r2","action":"putAgentBrowserScreenshotToR2","note":"DOCS_BUCKET or DASHBOARD; key pattern differs from screenshots/runs/{run_id} unless extended"},{"step":5,"name":"assert_results","type":"logic","action":"evaluate_assertions","status":"implement_in_worker"},{"step":6,"name":"d1_result","type":"d1","action":"update","table":"playwright_jobs","fields":["status","result_url","result_json","duration_ms","error_text"]}]',
  1,
  0,
  0,
  NULL,
  unixepoch()
);

INSERT OR IGNORE INTO workflows (
  id, name, description, workflow_type, trigger_type, trigger_config, steps, is_active, success_count, failure_count, last_run_at, created_at
) VALUES (
  'wf_iam_approval_gate',
  'Admin Approval Gate',
  'SET status awaiting_approval; notify; human sets approved_at. status approved not in CHECK until migration; use approved_at IS NOT NULL.',
  'governance',
  'manual',
  '{"depends_on":["wf_iam_playwright_validate"],"requires_playwright_pass":true}',
  '[{"step":1,"name":"set_awaiting","type":"d1","action":"update","table":"workflow_runs","set":{"status":"awaiting_approval"}},{"step":2,"name":"notify","type":"notify","action":"approval_required","channels":["sse","email","in_app"],"payload":["run_id","artifact_urls","playwright_screenshot"]},{"step":3,"name":"wait_approval","type":"external","action":"poll_or_patch","success_when":"approved_at IS NOT NULL","timeout_ms":86400000}]',
  1,
  0,
  0,
  NULL,
  unixepoch()
);

INSERT OR IGNORE INTO workflows (
  id, name, description, workflow_type, trigger_type, trigger_config, steps, is_active, success_count, failure_count, last_run_at, created_at
) VALUES (
  'wf_iam_promote_prod',
  'Promote to Production',
  'Preflight approved_at; R2 promote explicit keys from workflow_artifacts; promote-to-prod.sh runs outside Worker; finalize workflow_runs status success; increment mcp_workflows.success_count.',
  'deploy',
  'manual',
  '{"depends_on":["wf_iam_approval_gate"],"gate":"deploy_approved_by_sam","shell_not_in_worker":true}',
  '[{"step":1,"name":"preflight_check","type":"d1","action":"assert","sql":"approved_at IS NOT NULL"},{"step":2,"name":"r2_promote","type":"r2","action":"copy_keys","note":"CIDI uses sandbox agent-sam to prod; TOOLS to DASHBOARD is explicit keys only"},{"step":3,"name":"promote","type":"ci","action":"external","cmd":"./scripts/promote-to-prod.sh"},{"step":4,"name":"d1_finalize","type":"d1","action":"update","table":"workflow_runs","set":{"status":"success"}},{"step":5,"name":"increment_success","type":"d1","action":"update","table":"mcp_workflows","field":"success_count","note":"If workflow_id links mcp_workflows; legacy workflows table separate"}]',
  1,
  0,
  0,
  NULL,
  unixepoch()
);
