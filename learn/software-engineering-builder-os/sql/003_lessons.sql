-- 003_lessons.sql
-- Canonical lessons seed for Software Engineering Builder OS.

INSERT OR REPLACE INTO lessons (
  id,
  module_id,
  course_id,
  title,
  slug,
  description,
  content_type,
  content_url,
  content_text,
  order_index,
  estimated_minutes,
  is_required,
  is_published,
  published_at,
  created_at,
  updated_at
) VALUES
('lesson_sebo_001_software_engineering_map', 'module_sebo_foundations', 'course_software_engineering_builder_os', 'The Software Engineering Map: How Modern Apps Actually Fit Together', 'software-engineering-map', 'A panoramic orientation lesson that gives learners the mental model they need before touching code.', 'markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/001_software-engineering-map.md', NULL, 1, 75, 1, 1, unixepoch(), unixepoch(), unixepoch()),
('lesson_sebo_002_terminal_command_line', 'module_sebo_terminal_ide_git', 'course_software_engineering_builder_os', 'Terminal Mastery: Commands, Files, Paths, Processes, and Safe Execution', 'terminal-command-line', 'Learners build terminal fluency without reckless copy-paste habits.', 'markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/002_terminal-command-line.md', NULL, 2, 90, 1, 1, unixepoch(), unixepoch(), unixepoch()),
('lesson_sebo_003_ide_workflow_monaco_cursor', 'module_sebo_terminal_ide_git', 'course_software_engineering_builder_os', 'IDE Workflow: Monaco, Cursor, File Trees, Search, Refactors, and Review Loops', 'ide-workflow-monaco-cursor', 'A practical lesson on professional editing workflows across Cursor, Monaco, and the in-dashboard editor.', 'markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/003_ide-workflow-monaco-cursor.md', NULL, 3, 100, 1, 1, unixepoch(), unixepoch(), unixepoch()),
('lesson_sebo_004_git_github_repo_hygiene', 'module_sebo_terminal_ide_git', 'course_software_engineering_builder_os', 'Git and GitHub: Branches, Commits, Pull Requests, Rollback Thinking, and Repo Hygiene', 'git-github-repo-hygiene', 'A practical Git workflow lesson for builders who need confidence before shipping.', 'markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/004_git-github-repo-hygiene.md', NULL, 4, 105, 1, 1, unixepoch(), unixepoch(), unixepoch()),
('lesson_sebo_005_frontend_react_dashboard_ux', 'module_sebo_frontend_ux', 'course_software_engineering_builder_os', 'Frontend Foundations: React, Routes, Components, State, and Dashboard UX', 'frontend-react-dashboard-ux', 'Learners trace and improve a real dashboard UI without redesigning the whole app.', 'markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/005_frontend-react-dashboard-ux.md', NULL, 5, 120, 1, 1, unixepoch(), unixepoch(), unixepoch()),
('lesson_sebo_006_cloudflare_workers_runtime', 'module_sebo_cloudflare_runtime', 'course_software_engineering_builder_os', 'Cloudflare Runtime: Workers, Routes, Bindings, Wrangler, and Deployment Flow', 'cloudflare-workers-runtime', 'A hands-on Cloudflare runtime lesson for real Workers-based SaaS architecture.', 'markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/006_cloudflare-workers-runtime.md', NULL, 6, 130, 1, 1, unixepoch(), unixepoch(), unixepoch()),
('lesson_sebo_007_data_storage_d1_r2_hyperdrive_supabase', 'module_sebo_data_storage', 'course_software_engineering_builder_os', 'Data and Storage: D1, SQLite, R2, KV, Durable Objects, Hyperdrive, and Supabase', 'data-storage-d1-r2-hyperdrive-supabase', 'A deep database/storage orientation lesson for the Inner Animal Media platform.', 'markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/007_data-storage-d1-r2-hyperdrive-supabase.md', NULL, 7, 150, 1, 1, unixepoch(), unixepoch(), unixepoch()),
('lesson_sebo_008_ai_engineering_agent_sam_routing', 'module_sebo_ai_agents', 'course_software_engineering_builder_os', 'AI Engineering: OpenAI, Claude, Gemini, Workers AI, Routing, Cost, and Agent Sam', 'ai-engineering-agent-sam-routing', 'A practical AI engineering lesson built around Agent Sam’s routing, model, and telemetry tables.', 'markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/008_ai-engineering-agent-sam-routing.md', NULL, 8, 135, 1, 1, unixepoch(), unixepoch(), unixepoch()),
('lesson_sebo_009_database_studio_workbench', 'module_sebo_database_studio', 'course_software_engineering_builder_os', 'Database Studio: Building an In-House D1, SQLite, Hyperdrive, and Supabase Workbench', 'database-studio-workbench', 'A product-building lesson that turns database operations into a safe dashboard-native workflow.', 'markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/009_database-studio-workbench.md', NULL, 9, 160, 1, 1, unixepoch(), unixepoch(), unixepoch()),
('lesson_sebo_010_capstone_ship_review_measure', 'module_sebo_shipping_quality', 'course_software_engineering_builder_os', 'Capstone: Ship, Test, Review, Measure, and Improve a Real Dashboard Feature', 'capstone-ship-review-measure', 'The capstone lesson where learners prove they can operate the full builder workflow.', 'markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/010_capstone-ship-review-measure.md', NULL, 10, 180, 1, 1, unixepoch(), unixepoch(), unixepoch());
