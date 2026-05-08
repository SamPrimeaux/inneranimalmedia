-- 312: Map remaining 15 agentsam_skill rows to task_types
-- All were always_apply=0 with task_types_json='[]' — never fired

-- Platform context / codebase patterns — fires on code + debug + chat
UPDATE agentsam_skill SET
  task_types_json = '["code","debug","chat"]',
  route_keys_json = '["code","debug","general"]'
WHERE id IN (
  'skill_code_workflow',
  'skill_iam_agentsam_project_context',
  'skill_ws_agent_mobile_dashboard'
);

-- Hard rules — should fire on everything, treat as near-always
UPDATE agentsam_skill SET
  task_types_json = '["code","debug","deploy","terminal_execution","sql_d1_generation"]',
  route_keys_json = '["code","debug","deploy","terminal_execution","db_query"]'
WHERE id = 'skill_rules_hard';

-- Playwright — debug + code (QA/testing context)
UPDATE agentsam_skill SET
  task_types_json = '["debug","code"]',
  route_keys_json = '["debug","code_review"]'
WHERE id = 'skill_iam_playwright_jobs';

-- Skill creator — code + plan (building/designing skills)
UPDATE agentsam_skill SET
  task_types_json = '["code","plan"]',
  route_keys_json = '["code","plan"]'
WHERE id = 'skill_skill_creator';

-- Canvas design — plan (design before implementation)
UPDATE agentsam_skill SET
  task_types_json = '["plan","code"]',
  route_keys_json = '["plan","code"]'
WHERE id = 'skill_canvas_design';

-- Provider comparison — chat + plan (architecture decisions)
UPDATE agentsam_skill SET
  task_types_json = '["chat","plan"]',
  route_keys_json = '["general","plan"]'
WHERE id = 'skill_provider_compare';

-- Endgame roadmap — plan + chat (strategic context)
UPDATE agentsam_skill SET
  task_types_json = '["plan","chat"]',
  route_keys_json = '["plan","general"]'
WHERE id IN ('skill_endgame_roadmap','skill_learning_os_operator');

-- iMessage tools — tool_use + summary (recall/send messages)
UPDATE agentsam_skill SET
  task_types_json = '["tool_use","summary"]',
  route_keys_json = '["tool_use","summary"]'
WHERE id IN ('imessage.history','imessage.list','imessage.send');

-- Time utilities — chat (quick utility, fires on general questions)
UPDATE agentsam_skill SET
  task_types_json = '["chat"]',
  route_keys_json = '["general"]'
WHERE id IN ('time.convert','time.now');

-- Verify
SELECT COUNT(*) as still_empty
FROM agentsam_skill
WHERE is_active = 1 AND always_apply = 0 AND task_types_json = '[]';
