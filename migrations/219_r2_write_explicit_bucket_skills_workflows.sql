-- 219: Explicit bucket: DASHBOARD for r2_write in mcp_workflows + agentsam_skill (agent-sam defaults elsewhere)
-- Remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/219_r2_write_explicit_bucket_skills_workflows.sql

-- wf_dashboard_deploy step 3: r2_write previously omitted bucket (required for agent-sam / dashboard keys)
UPDATE mcp_workflows
SET steps_json = '[
  {"step":1,"name":"List current R2 dashboard assets","tool":"r2_list","agent":"mcp_agent_operator","params":{"prefix":"static/dashboard/"},"requires_approval":false,"on_failure":"halt"},
  {"step":2,"name":"Verify agent bundle key exists","tool":"r2_read","agent":"mcp_agent_operator","params":{"key":"static/dashboard/agent/agent-dashboard.js","head_only":true},"requires_approval":false,"on_failure":"halt","safety_note":"Confirm bundle key before any writes"},
  {"step":3,"name":"Upload updated dashboard file","tool":"r2_write","agent":"mcp_agent_builder","params":{"bucket":"DASHBOARD","key":"{{target_r2_key}}","source":"{{local_file_path}}"},"requires_approval":true,"on_failure":"halt"},
  {"step":4,"name":"Verify deployment via telemetry","tool":"telemetry_query","agent":"mcp_agent_tester","params":{"query":"SELECT status, count(*) FROM worker_analytics_events WHERE timestamp > datetime(''now'',''-5 minutes'') GROUP BY status"},"requires_approval":false,"on_failure":"warn"}
]'
WHERE id = 'wf_dashboard_deploy';

UPDATE agentsam_skill
SET content_markdown = '# Canvas Design

Phase 1: Write design philosophy via r2_write with bucket: ''DASHBOARD'' and key canvas/{job_id}/philosophy.md (agent-sam / tools bundle).
Movement name 1-2 words. 4-6 paragraphs. Emphasize craftsmanship repeatedly.

Phase 2: Check imgx_list_providers() first.

Approach A (imgx_generate_image): painterly/atmospheric/abstract
Prompt: "{movement}, {3 descriptors}, palette:{c1},{c2},{c3}, museum quality, expert craftsmanship"
Providers: openai (dall-e-3/gpt-image-1), workers_ai (flux), stability (SD3)

Approach B (HTML canvas): posters/typography/geometric
1200x1800 poster, 1200x1200 square, 1920x1080 wide
Inline CSS, Google Fonts, CSS vars, 60px margins, nothing overlapping
data URI → cdt_navigate_page → cdt_take_screenshot → cloudconvert for PDF

Approach C (imgx_edit_image): surgical refinement only

Output: cf_images_upload then share URL. r2_write with bucket: ''DASHBOARD'', keys canvas/{job_id}/output.png and canvas/{job_id}/meta.json

Refinement pass mandatory: do NOT add elements. Ask how to make this more art.'
WHERE id = 'skill_canvas_design';

UPDATE agentsam_skill
SET content_markdown = '# Monaco Code Editor

Core rule: Never print code >15 lines in chat as final delivery. Use monaco invoke or r2_write.

## Writing a new file to Monaco
Use the monaco XML invoke. The content parameter MUST be the complete, fully working file — not a summary, not a description, not placeholder text:
<invoke name="monaco">
<parameter name="filename">dashboard.html</parameter>
<parameter name="content"><!DOCTYPE html>... (full file here)</parameter>
</invoke>

Rules:
- filename must have the correct extension (.html, .tsx, .js, .css, .sql, etc.)
- content must be the complete file — every line, no truncation, no "..." placeholders
- For HTML: include <!DOCTYPE html>, <html>, <head> with styles, <body> with real structure
- For .tsx/.jsx: include all imports, types, component, export default
- Never write a text description or architecture diagram when asked to build a file
- Never use agent_output.text or agent_output.typescript as filenames — use a meaningful name

## Editing an existing R2 file
1. r2_read with explicit bucket + key (e.g. bucket: ''DASHBOARD'', key: static/dashboard/...) → get current content
2. Surgical edits with line numbers
3. r2_write({ bucket: ''DASHBOARD'', key: <same key as r2_read>, body: <full text>, content_type: as appropriate }) — always pass bucket: ''DASHBOARD'' for agent-sam / dashboard files so writes do not target the ASSETS sandbox default
4. terminal_execute → deploy if needed

## R2 source paths
worker.js → source/worker.js
AgentDashboard.jsx → source/agent-dashboard/src/AgentDashboard.jsx

## Rules
Never say "written" without calling r2_write or monaco invoke.
Never fabricate results.
D1: d1_query for reads, d1_write for writes. Always check schema first.'
WHERE id = 'skill_monaco_code';
