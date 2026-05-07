INSERT INTO course_modules (
  id,
  course_id,
  title,
  description,
  order_index,
  is_required,
  estimated_minutes,
  created_at,
  updated_at
) VALUES
(
  'mod_01_repo_foundation',
  'course_connor_platform_operator',
  'Repo Foundation and Local Development',
  'Clone the repo, install dependencies, understand source versus generated files, and run the app locally.',
  1,
  1,
  90,
  unixepoch(),
  unixepoch()
),
(
  'mod_02_cloudflare_runtime',
  'course_connor_platform_operator',
  'Cloudflare Runtime: Worker, R2, D1, KV, DO',
  'Understand the deployed Worker, R2 asset storage, planned D1 CMS runtime, KV, Durable Objects, and Workers AI.',
  2,
  1,
  150,
  unixepoch(),
  unixepoch()
),
(
  'mod_03_agent_connor_ai',
  'course_connor_platform_operator',
  'Agent Connor and AI Provider Routing',
  'Use OpenAI safely, understand chat versus code mode, add provider keys, and evaluate model routing.',
  3,
  1,
  150,
  unixepoch(),
  unixepoch()
),
(
  'mod_04_dashboard_ide',
  'course_connor_platform_operator',
  'Dashboard IDE and CMS Operator Skills',
  'Use dashboard routes, Monaco editor, terminal prep, storage browser, learning center, and MCP page.',
  4,
  1,
  160,
  unixepoch(),
  unixepoch()
),
(
  'mod_05_integrations',
  'course_connor_platform_operator',
  'Integrations: GitHub, Google, Resend, Supabase, MCP',
  'Prepare and understand the integration roadmap and approval-gated tool system.',
  5,
  1,
  210,
  unixepoch(),
  unixepoch()
),
(
  'mod_06_testing_release',
  'course_connor_platform_operator',
  'Testing, Release, and Production Handoff',
  'Run Playwright, interpret failures, deploy safely, and score production readiness.',
  6,
  1,
  180,
  unixepoch(),
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  course_id = excluded.course_id,
  title = excluded.title,
  description = excluded.description,
  order_index = excluded.order_index,
  is_required = excluded.is_required,
  estimated_minutes = excluded.estimated_minutes,
  updated_at = unixepoch();
