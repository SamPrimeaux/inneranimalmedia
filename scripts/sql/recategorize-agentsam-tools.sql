UPDATE agentsam_tools SET
  tool_category='browser.navigate',
  intent_category_tags='["browser","navigation","live_page"]',
  schema_hint='Use when Agent Sam needs to open or move to a trusted URL before inspecting, screenshotting, or testing it.',
  updated_at=unixepoch()
WHERE tool_name='browser_navigate';

UPDATE agentsam_tools SET
  tool_category='browser.inspect',
  intent_category_tags='["browser","inspection","live_page","dom","content"]',
  schema_hint='Use when Agent Sam needs readable page text, headings, links, or lightweight DOM/content evidence from a trusted URL.',
  updated_at=unixepoch()
WHERE tool_name='browser_content';

UPDATE agentsam_tools SET
  tool_category='browser.capture',
  intent_category_tags='["browser","screenshot","visual_qa","layout_debug"]',
  schema_hint='Use when the user asks what a page looks like, wants visual proof, or needs layout/UI verification.',
  updated_at=unixepoch()
WHERE tool_name='playwright_screenshot';

UPDATE agentsam_tools SET
  tool_category='browser.inspect.dom',
  intent_category_tags='["browser","dom","selector","component_debug"]',
  schema_hint='Use for deeper DOM or selector-level inspection when debugging UI components.',
  updated_at=unixepoch()
WHERE tool_name='cdt_get_dom';

UPDATE agentsam_tools SET
  tool_category='browser.capture',
  intent_category_tags='["browser","screenshot","cdt","visual_qa"]',
  schema_hint='Use for DevTools-backed screenshot capture when precise browser-state evidence is needed.',
  updated_at=unixepoch()
WHERE tool_name='cdt_screenshot';

UPDATE agentsam_tools SET
  tool_category='browser.interact',
  intent_category_tags='["browser","interaction","click","test_flow"]',
  schema_hint='Use only when the user asks Agent Sam to interact with a page. Requires confirmation because clicks can change state.',
  updated_at=unixepoch()
WHERE tool_name='cdt_click';

UPDATE agentsam_tools SET
  tool_category='browser.interact.form',
  intent_category_tags='["browser","form","input","test_flow"]',
  schema_hint='Use only when the user asks Agent Sam to fill a field or test a form. Requires confirmation.',
  updated_at=unixepoch()
WHERE tool_name='cdt_fill';

UPDATE agentsam_tools SET
  tool_category='browser.debug.script',
  intent_category_tags='["browser","javascript","debug","high_risk"]',
  schema_hint='Use only for approved debugging that requires evaluating JavaScript in the page context.',
  updated_at=unixepoch()
WHERE tool_name='cdt_evaluate_script';

UPDATE agentsam_tools SET
  tool_category='code.file.open',
  intent_category_tags='["code","monaco","open_file","inspect_file"]',
  schema_hint='Use when the user asks to open or inspect a file in the Monaco workspace.',
  updated_at=unixepoch()
WHERE tool_name='monaco_open_file';

UPDATE agentsam_tools SET
  tool_category='code.file.create',
  intent_category_tags='["code","monaco","file_generation","build"]',
  schema_hint='Use when Agent Sam needs to create a new file, component, page, script, or generated code artifact.',
  updated_at=unixepoch()
WHERE tool_name='monaco_create_file';

UPDATE agentsam_tools SET
  tool_category='code.patch.diff',
  intent_category_tags='["code","monaco","diff","review","patch"]',
  schema_hint='Use before applying code changes so the user can review a before/after diff.',
  updated_at=unixepoch()
WHERE tool_name='monaco_show_diff';

UPDATE agentsam_tools SET
  tool_category='code.patch.apply',
  intent_category_tags='["code","monaco","apply_patch","edit_file","high_risk"]',
  schema_hint='Use to apply a patch to a file after approval. This changes workspace code.',
  updated_at=unixepoch()
WHERE tool_name='monaco_apply_patch';

UPDATE agentsam_tools SET
  tool_category='code.validate',
  intent_category_tags='["code","monaco","lint","validate"]',
  schema_hint='Use to validate generated or edited code before previewing/publishing.',
  updated_at=unixepoch()
WHERE tool_name='monaco_validate_file';

UPDATE agentsam_tools SET
  tool_category='design.diagram.create',
  intent_category_tags='["design","diagram","excalidraw","architecture","workflow_map"]',
  schema_hint='Use when the user asks to diagram, map, sketch, wireframe, or visualize a system/workflow.',
  updated_at=unixepoch()
WHERE tool_name='excalidraw_create_scene';

UPDATE agentsam_tools SET
  tool_category='design.diagram.update',
  intent_category_tags='["design","diagram","excalidraw","update_scene"]',
  schema_hint='Use when modifying an existing diagram scene.',
  updated_at=unixepoch()
WHERE tool_name='excalidraw_update_scene';

UPDATE agentsam_tools SET
  tool_category='design.export.image',
  intent_category_tags='["design","diagram","export","png","artifact"]',
  schema_hint='Use when a diagram should be exported as an image artifact.',
  updated_at=unixepoch()
WHERE tool_name='excalidraw_export_png';

UPDATE agentsam_tools SET
  tool_category='artifact.create',
  intent_category_tags='["artifact","generated_output","create"]',
  schema_hint='Use when Agent Sam has generated output that should become a tracked artifact payload.',
  updated_at=unixepoch()
WHERE tool_name='artifact_create';

UPDATE agentsam_tools SET
  tool_category='artifact.register',
  intent_category_tags='["artifact","library","register","d1"]',
  schema_hint='Use after generated content is stored to create or update the agentsam_artifacts library record.',
  updated_at=unixepoch()
WHERE tool_name='artifact_register';

UPDATE agentsam_tools SET
  tool_category='artifact.preview',
  intent_category_tags='["artifact","preview","library"]',
  schema_hint='Use to retrieve or validate a public preview URL for an artifact.',
  updated_at=unixepoch()
WHERE tool_name='artifact_preview_url';

UPDATE agentsam_tools SET
  tool_category='storage.r2.write',
  intent_category_tags='["r2","storage","publish","upload","artifact"]',
  schema_hint='Use to upload generated files/content to R2. Requires confirmation for writes.',
  updated_at=unixepoch()
WHERE tool_name='r2_put_object';

UPDATE agentsam_tools SET
  tool_category='storage.r2.read',
  intent_category_tags='["r2","storage","read","asset","artifact"]',
  schema_hint='Use to read an existing R2 object for inspection or validation.',
  updated_at=unixepoch()
WHERE tool_name='r2_get_object';

UPDATE agentsam_tools SET
  tool_category='storage.r2.list',
  intent_category_tags='["r2","storage","list","asset","artifact"]',
  schema_hint='Use to list R2 objects under a prefix.',
  updated_at=unixepoch()
WHERE tool_name='r2_list_objects';

UPDATE agentsam_tools SET
  tool_category='database.d1.schema',
  intent_category_tags='["database","d1","schema","inspect"]',
  schema_hint='Use to inspect D1 table schema, columns, and create SQL.',
  updated_at=unixepoch()
WHERE tool_name='d1_schema_inspect';

UPDATE agentsam_tools SET
  tool_category='database.d1.read',
  intent_category_tags='["database","d1","read","query","validate"]',
  schema_hint='Use for read-only D1 validation, counts, previews, and audits.',
  updated_at=unixepoch()
WHERE tool_name='d1_query_read';

UPDATE agentsam_tools SET
  tool_category='database.d1.write',
  intent_category_tags='["database","d1","write","insert","update","high_risk"]',
  schema_hint='Use only after approval for D1 inserts, updates, deletes, or migrations.',
  updated_at=unixepoch()
WHERE tool_name='d1_query_write';

UPDATE agentsam_tools SET
  tool_category='database.hyperdrive.health',
  intent_category_tags='["database","hyperdrive","supabase","health","connectivity"]',
  schema_hint='Use for safe Hyperdrive/Supabase connectivity checks without exposing secrets.',
  updated_at=unixepoch()
WHERE tool_name='hyperdrive_test_connection';

UPDATE agentsam_tools SET
  tool_category='terminal.script.run',
  intent_category_tags='["terminal","script","test","build","validate"]',
  schema_hint='Use to run an allowlisted script from agentsam_scripts.',
  updated_at=unixepoch()
WHERE tool_name='script_run';

UPDATE agentsam_tools SET
  tool_category='terminal.command.run',
  intent_category_tags='["terminal","command","debug","high_risk"]',
  schema_hint='Use for allowlisted terminal commands only. Approval required by default.',
  updated_at=unixepoch()
WHERE tool_name='terminal_run';

UPDATE agentsam_tools SET
  tool_category='terminal.wrangler.d1',
  intent_category_tags='["terminal","wrangler","d1","database"]',
  schema_hint='Use to execute Wrangler D1 validation or migration commands. Writes require approval.',
  updated_at=unixepoch()
WHERE tool_name='wrangler_d1_execute';

UPDATE agentsam_tools SET
  tool_category='terminal.wrangler.r2',
  intent_category_tags='["terminal","wrangler","r2","upload","artifact"]',
  schema_hint='Use to upload a local file to R2 through Wrangler.',
  updated_at=unixepoch()
WHERE tool_name='wrangler_r2_put';

UPDATE agentsam_tools SET
  tool_category='terminal.wrangler.deploy',
  intent_category_tags='["terminal","wrangler","deploy","worker","critical"]',
  schema_hint='Use only after explicit approval to deploy a Worker.',
  updated_at=unixepoch()
WHERE tool_name='wrangler_deploy';

UPDATE agentsam_tools SET
  tool_category='github.repo.search',
  intent_category_tags='["github","repo","search","code_search"]',
  schema_hint='Use to search repository files and code references.',
  updated_at=unixepoch()
WHERE tool_name='github_search_repo';

UPDATE agentsam_tools SET
  tool_category='github.file.read',
  intent_category_tags='["github","repo","read_file","code"]',
  schema_hint='Use to read a file from a connected GitHub repository.',
  updated_at=unixepoch()
WHERE tool_name='github_read_file';

UPDATE agentsam_tools SET
  tool_category='github.patch.apply',
  intent_category_tags='["github","patch","code_edit","high_risk"]',
  schema_hint='Use to apply a patch to a branch after approval.',
  updated_at=unixepoch()
WHERE tool_name='github_apply_patch';

UPDATE agentsam_tools SET
  tool_category='github.pr.create',
  intent_category_tags='["github","pull_request","review"]',
  schema_hint='Use to open a pull request from a prepared branch.',
  updated_at=unixepoch()
WHERE tool_name='github_open_pr';

UPDATE agentsam_tools SET
  tool_category='ai.classify',
  intent_category_tags='["ai","classify","route","capability_router","nano"]',
  schema_hint='Use gpt-5.4-nano to classify request intent, required capabilities, risk, and routing path.',
  updated_at=unixepoch()
WHERE tool_name='ai_classify_intent';

UPDATE agentsam_tools SET
  tool_category='ai.plan',
  intent_category_tags='["ai","planning","workflow","mini"]',
  schema_hint='Use gpt-5.4-mini to plan execution using available tools and constraints.',
  updated_at=unixepoch()
WHERE tool_name='ai_plan_execution';

UPDATE agentsam_tools SET
  tool_category='ai.generate',
  intent_category_tags='["ai","generation","artifact","code","website","mini"]',
  schema_hint='Use gpt-5.4-mini to generate substantial files, websites, code, reports, or artifacts.',
  updated_at=unixepoch()
WHERE tool_name='ai_generate_artifact';

UPDATE agentsam_tools SET
  tool_category='ai.validate',
  intent_category_tags='["ai","validation","qa","contract","nano"]',
  schema_hint='Use gpt-5.4-nano to validate generated output against a strict contract.',
  updated_at=unixepoch()
WHERE tool_name='ai_validate_output';

UPDATE agentsam_tools SET
  tool_category='workflow.ledger.start',
  intent_category_tags='["workflow","ledger","start_run"]',
  schema_hint='Use to create an agentsam_workflow_runs row for a new autonomous run.',
  updated_at=unixepoch()
WHERE tool_name='workflow_start_run';

UPDATE agentsam_tools SET
  tool_category='workflow.ledger.step',
  intent_category_tags='["workflow","ledger","step_results"]',
  schema_hint='Use to append a structured step result to agentsam_workflow_runs.step_results_json.',
  updated_at=unixepoch()
WHERE tool_name='workflow_append_step';

UPDATE agentsam_tools SET
  tool_category='workflow.ledger.complete',
  intent_category_tags='["workflow","ledger","complete_run"]',
  schema_hint='Use to finalize agentsam_workflow_runs with output_json, status, duration, tokens, and cost.',
  updated_at=unixepoch()
WHERE tool_name='workflow_complete_run';

UPDATE agentsam_tools SET
  tool_category='workflow.approval.request',
  intent_category_tags='["workflow","approval","risk_gate","safety"]',
  schema_hint='Use to create an approval queue item for risky or destructive actions.',
  updated_at=unixepoch()
WHERE tool_name='approval_request';
