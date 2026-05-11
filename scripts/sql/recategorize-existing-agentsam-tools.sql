-- Reclassify existing live agentsam_tools rows into capability-aware hierarchical categories.
-- Uses actual current tool_name values from remote D1.

UPDATE agentsam_tools SET
  tool_category='ai.classify',
  intent_category_tags='["ai","classification","routing","capability_router","intent"]',
  schema_hint='Use to classify user intent, required capabilities, routing path, risk, and model/tool plan.',
  updated_at=unixepoch()
WHERE tool_name='ai_classify';

UPDATE agentsam_tools SET
  tool_category='ai.completion',
  intent_category_tags='["ai","completion","chat","generation","reasoning"]',
  schema_hint='Use for direct model completion when no specialized AI generation/planning tool is required.',
  updated_at=unixepoch()
WHERE tool_name='ai_completion';

UPDATE agentsam_tools SET
  tool_category='ai.embedding',
  intent_category_tags='["ai","embedding","vector","rag","search"]',
  schema_hint='Use for embeddings, semantic retrieval, vector indexing, and RAG preparation.',
  updated_at=unixepoch()
WHERE tool_name='ai_embed';

UPDATE agentsam_tools SET
  tool_category='cloudflare.commands.registry',
  intent_category_tags='["cloudflare","wrangler","workers","d1","r2","kv","deploy","command_registry"]',
  schema_hint='Use first when the user asks Agent Sam to inspect, create, update, deploy, validate, or manage Cloudflare resources. Search command registry before selecting an action.',
  updated_at=unixepoch()
WHERE tool_name='cloudflare_command_registry';

UPDATE agentsam_tools SET
  tool_category='database.d1.query',
  intent_category_tags='["database","d1","sql","query","read","write"]',
  schema_hint='Use for D1 SQL queries. Treat writes/migrations as approval-gated even if the row risk is not critical.',
  risk_level='medium',
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='d1_query';

UPDATE agentsam_tools SET
  tool_category='database.d1.schema',
  intent_category_tags='["database","d1","schema","pragma","inspect","tables"]',
  schema_hint='Use to inspect D1 schema, table columns, sqlite_master, PRAGMA table_info, and table structure.',
  updated_at=unixepoch()
WHERE tool_name='d1_schema';

UPDATE agentsam_tools SET
  tool_category='github.repo.search',
  intent_category_tags='["github","repo","search","code_search","find_file"]',
  schema_hint='Use to search code/repository references before reading or patching files.',
  updated_at=unixepoch()
WHERE tool_name='github_search';

UPDATE agentsam_tools SET
  tool_category='github.file.read',
  intent_category_tags='["github","repo","file","read","code"]',
  schema_hint='Use to read source files from GitHub or connected repo context.',
  updated_at=unixepoch()
WHERE tool_name='github_file';

UPDATE agentsam_tools SET
  tool_category='github.commit.create',
  intent_category_tags='["github","commit","write","code_change","approval"]',
  schema_hint='Use to create commits only after patch validation and approval. High-risk because it writes to repo history.',
  risk_level='high',
  requires_approval=1,
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='github_commit';

UPDATE agentsam_tools SET
  tool_category='github.pr.create',
  intent_category_tags='["github","pull_request","review","merge_flow"]',
  schema_hint='Use to open/manage pull requests after changes are prepared and validated.',
  risk_level='high',
  requires_approval=1,
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='github_pr';

UPDATE agentsam_tools SET
  tool_category='network.http.fetch',
  intent_category_tags='["http","fetch","web","url","api","external"]',
  schema_hint='Use to fetch external URLs or APIs when browser rendering is not required.',
  updated_at=unixepoch()
WHERE tool_name='http_fetch';

UPDATE agentsam_tools SET
  tool_category='network.proxy.dispatch',
  intent_category_tags='["proxy","network","dispatch","service_bridge"]',
  schema_hint='Use to route requests through the network-tier proxy dispatcher.',
  updated_at=unixepoch()
WHERE tool_name='proxy_dispatch';

UPDATE agentsam_tools SET
  tool_category='cloudflare.durable_object.fetch',
  intent_category_tags='["cloudflare","durable_object","do","fetch","websocket","stateful"]',
  schema_hint='Use to send requests to Durable Object instances or inspect DO-backed runtime behavior.',
  updated_at=unixepoch()
WHERE tool_name='cf_do_fetch';

UPDATE agentsam_tools SET
  tool_category='terminal.cloudflare.worker.deploy',
  intent_category_tags='["cloudflare","worker","deploy","wrangler","critical"]',
  schema_hint='Use only after explicit approval for Worker deployments. Critical production-affecting action.',
  risk_level='critical',
  requires_approval=1,
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='cf_worker_deploy';

UPDATE agentsam_tools SET
  tool_category='mcp.tool.call',
  intent_category_tags='["mcp","tool","dispatch","remote_tool"]',
  schema_hint='Use to dispatch a registered MCP tool call through the MCP server/tool registry.',
  updated_at=unixepoch()
WHERE tool_name='mcp_tool_call';

UPDATE agentsam_tools SET
  tool_category='mcp.workflow.trigger',
  intent_category_tags='["mcp","workflow","trigger","approval"]',
  schema_hint='Use to trigger a registered MCP workflow. Approval required because it may invoke multi-step actions.',
  risk_level='medium',
  requires_approval=1,
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='mcp_workflow_trigger';

UPDATE agentsam_tools SET
  tool_category='design.cad.brief',
  intent_category_tags='["meauxcad","cad","3d","design","brief","ai"]',
  schema_hint='Use when the user has a rough 3D/CAD idea and needs a structured modeling brief first.',
  updated_at=unixepoch()
WHERE tool_name='meauxcad_design_brief_create';

UPDATE agentsam_tools SET
  tool_category='design.diagram.excalidraw',
  intent_category_tags='["meauxcad","excalidraw","sketch","diagram","concept"]',
  schema_hint='Use to create or update an Excalidraw concept sketch from a CAD/design brief.',
  updated_at=unixepoch()
WHERE tool_name='meauxcad_excalidraw_sketch_create';

UPDATE agentsam_tools SET
  tool_category='design.cad.openscad.generate',
  intent_category_tags='["meauxcad","openscad","cad","generate","script"]',
  schema_hint='Use to generate parametric OpenSCAD code from a structured MeauxCAD brief.',
  updated_at=unixepoch()
WHERE tool_name='meauxcad_openscad_generate';

UPDATE agentsam_tools SET
  tool_category='terminal.cad.openscad.export',
  intent_category_tags='["meauxcad","openscad","stl","export","terminal"]',
  schema_hint='Use to compile OpenSCAD files into STL through an allowlisted terminal path.',
  risk_level='medium',
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='meauxcad_openscad_export_stl';

UPDATE agentsam_tools SET
  tool_category='terminal.cad.blender.convert',
  intent_category_tags='["meauxcad","blender","stl","glb","conversion","terminal"]',
  schema_hint='Use to convert STL to GLB with Blender headless through an allowlisted terminal path.',
  risk_level='medium',
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='meauxcad_blender_stl_to_glb';

UPDATE agentsam_tools SET
  tool_category='artifact.cad.register',
  intent_category_tags='["meauxcad","artifact","asset","register","cms_3d_assets","r2"]',
  schema_hint='Use to register generated STL/GLB/preview assets into asset tracking tables.',
  risk_level='medium',
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='meauxcad_asset_register';

UPDATE agentsam_tools SET
  tool_category='observability.cad.trace',
  intent_category_tags='["meauxcad","trace","metrics","tokens","cost","audit"]',
  schema_hint='Use to log prompt, model, tokens, cost, duration, outputs, validation, and repair attempts for MeauxCAD runs.',
  updated_at=unixepoch()
WHERE tool_name='meauxcad_run_trace_log';

UPDATE agentsam_tools SET
  tool_category='notification.alert',
  intent_category_tags='["notification","alert","error","workflow"]',
  schema_hint='Use to send workflow alert or error notifications.',
  updated_at=unixepoch()
WHERE tool_name='notify_alert';

UPDATE agentsam_tools SET
  tool_category='notification.deploy',
  intent_category_tags='["notification","deploy","webhook","release"]',
  schema_hint='Use to send deployment notification events.',
  updated_at=unixepoch()
WHERE tool_name='notify_deploy';

UPDATE agentsam_tools SET
  tool_category='observability.telemetry.write',
  intent_category_tags='["telemetry","trace","observability","log"]',
  schema_hint='Use to write a telemetry trace event.',
  updated_at=unixepoch()
WHERE tool_name='telemetry_write';

UPDATE agentsam_tools SET
  tool_category='observability.quality_gate.run',
  intent_category_tags='["quality","gate","ci","check","validation"]',
  schema_hint='Use to execute quality gates for deploys, workflow runs, artifacts, or generated outputs.',
  updated_at=unixepoch()
WHERE tool_name='quality_gate_run';

UPDATE agentsam_tools SET
  tool_category='planning.plan.create',
  intent_category_tags='["planning","plan","daily","agentsam"]',
  schema_hint='Use to create a structured agentsam_plans row for planning/tracking work.',
  updated_at=unixepoch()
WHERE tool_name='agentsam_plan_create';

UPDATE agentsam_tools SET
  tool_category='planning.todo.create',
  intent_category_tags='["planning","todo","task","queue","agentsam"]',
  schema_hint='Use to create a task/todo row with execution metadata.',
  updated_at=unixepoch()
WHERE tool_name='agentsam_todo_create';

UPDATE agentsam_tools SET
  tool_category='planning.todo.update',
  intent_category_tags='["planning","todo","status","queue","update"]',
  schema_hint='Use to update todo execution_status, output_summary, error_trace, or completion state.',
  updated_at=unixepoch()
WHERE tool_name='agentsam_todo_update';

UPDATE agentsam_tools SET
  tool_category='storage.kv.read',
  intent_category_tags='["cloudflare","kv","storage","read","session"]',
  schema_hint='Use to read from a Cloudflare KV namespace.',
  updated_at=unixepoch()
WHERE tool_name='cf_kv_read';

UPDATE agentsam_tools SET
  tool_category='storage.kv.write',
  intent_category_tags='["cloudflare","kv","storage","write","session"]',
  schema_hint='Use to write to Cloudflare KV. Confirmation recommended because it changes state.',
  risk_level='medium',
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='cf_kv_write';

UPDATE agentsam_tools SET
  tool_category='storage.r2.read',
  intent_category_tags='["cloudflare","r2","storage","read","object","asset"]',
  schema_hint='Use to read files/objects from R2 buckets.',
  updated_at=unixepoch()
WHERE tool_name='r2_read';

UPDATE agentsam_tools SET
  tool_category='storage.r2.write',
  intent_category_tags='["cloudflare","r2","storage","write","upload","publish","artifact"]',
  schema_hint='Use to write files/objects to R2. Confirmation recommended for writes.',
  risk_level='medium',
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='r2_write';

UPDATE agentsam_tools SET
  tool_category='storage.r2.list',
  intent_category_tags='["cloudflare","r2","storage","list","prefix"]',
  schema_hint='Use to list R2 objects under a bucket/prefix.',
  updated_at=unixepoch()
WHERE tool_name='r2_list';

UPDATE agentsam_tools SET
  tool_category='storage.r2.delete',
  intent_category_tags='["cloudflare","r2","storage","delete","destructive"]',
  schema_hint='Use only after approval to delete R2 objects.',
  risk_level='high',
  requires_approval=1,
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='r2_delete';

UPDATE agentsam_tools SET
  tool_category='terminal.bridge.health',
  intent_category_tags='["terminal","bridge","auth","health","diagnostic"]',
  schema_hint='Use to test terminal bridge authentication and health without executing arbitrary commands.',
  updated_at=unixepoch()
WHERE tool_name='bridge_key_auth_test';

UPDATE agentsam_tools SET
  tool_category='terminal.wrangler',
  intent_category_tags='["terminal","wrangler","cloudflare","deploy","d1","r2","worker"]',
  schema_hint='Use for allowlisted Wrangler operations. Writes/deploys require approval.',
  risk_level='high',
  requires_approval=1,
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='terminal_wrangler';

UPDATE agentsam_tools SET
  tool_category='terminal.command.run',
  intent_category_tags='["terminal","shell","command","pty","high_risk"]',
  schema_hint='Use for allowlisted terminal commands only. Approval required by default.',
  risk_level='critical',
  requires_approval=1,
  requires_confirmation=1,
  updated_at=unixepoch()
WHERE tool_name='terminal_run';

UPDATE agentsam_tools SET
  tool_category='workspace.context.read',
  intent_category_tags='["workspace","context","settings","bindings","member"]',
  schema_hint='Use to read workspace settings, bindings, member context, and active workspace metadata.',
  updated_at=unixepoch()
WHERE tool_name='workspace_read';
