-- 006_lesson_assets.sql
-- Lesson markdown asset seed for Software Engineering Builder OS.

INSERT OR REPLACE INTO lesson_assets (
  id,
  lesson_id,
  asset_type,
  asset_url,
  r2_key,
  r2_bucket,
  file_name,
  file_size,
  mime_type,
  order_index,
  created_at,
  updated_at
) VALUES
('asset_sebo_001_software_engineering_map_markdown', 'lesson_sebo_001_software_engineering_map', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/001_software-engineering-map.md', 'learn/software-engineering-builder-os/lessons/001_software-engineering-map.md', 'inneranimalmedia', '001_software-engineering-map.md', NULL, 'text/markdown', 1, unixepoch(), unixepoch()),
('asset_sebo_002_terminal_command_line_markdown', 'lesson_sebo_002_terminal_command_line', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/002_terminal-command-line.md', 'learn/software-engineering-builder-os/lessons/002_terminal-command-line.md', 'inneranimalmedia', '002_terminal-command-line.md', NULL, 'text/markdown', 2, unixepoch(), unixepoch()),
('asset_sebo_003_ide_workflow_monaco_cursor_markdown', 'lesson_sebo_003_ide_workflow_monaco_cursor', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/003_ide-workflow-monaco-cursor.md', 'learn/software-engineering-builder-os/lessons/003_ide-workflow-monaco-cursor.md', 'inneranimalmedia', '003_ide-workflow-monaco-cursor.md', NULL, 'text/markdown', 3, unixepoch(), unixepoch()),
('asset_sebo_004_git_github_repo_hygiene_markdown', 'lesson_sebo_004_git_github_repo_hygiene', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/004_git-github-repo-hygiene.md', 'learn/software-engineering-builder-os/lessons/004_git-github-repo-hygiene.md', 'inneranimalmedia', '004_git-github-repo-hygiene.md', NULL, 'text/markdown', 4, unixepoch(), unixepoch()),
('asset_sebo_005_frontend_react_dashboard_ux_markdown', 'lesson_sebo_005_frontend_react_dashboard_ux', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/005_frontend-react-dashboard-ux.md', 'learn/software-engineering-builder-os/lessons/005_frontend-react-dashboard-ux.md', 'inneranimalmedia', '005_frontend-react-dashboard-ux.md', NULL, 'text/markdown', 5, unixepoch(), unixepoch()),
('asset_sebo_006_cloudflare_workers_runtime_markdown', 'lesson_sebo_006_cloudflare_workers_runtime', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/006_cloudflare-workers-runtime.md', 'learn/software-engineering-builder-os/lessons/006_cloudflare-workers-runtime.md', 'inneranimalmedia', '006_cloudflare-workers-runtime.md', NULL, 'text/markdown', 6, unixepoch(), unixepoch()),
('asset_sebo_007_data_storage_d1_r2_hyperdrive_supabase_markdown', 'lesson_sebo_007_data_storage_d1_r2_hyperdrive_supabase', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/007_data-storage-d1-r2-hyperdrive-supabase.md', 'learn/software-engineering-builder-os/lessons/007_data-storage-d1-r2-hyperdrive-supabase.md', 'inneranimalmedia', '007_data-storage-d1-r2-hyperdrive-supabase.md', NULL, 'text/markdown', 7, unixepoch(), unixepoch()),
('asset_sebo_008_ai_engineering_agent_sam_routing_markdown', 'lesson_sebo_008_ai_engineering_agent_sam_routing', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/008_ai-engineering-agent-sam-routing.md', 'learn/software-engineering-builder-os/lessons/008_ai-engineering-agent-sam-routing.md', 'inneranimalmedia', '008_ai-engineering-agent-sam-routing.md', NULL, 'text/markdown', 8, unixepoch(), unixepoch()),
('asset_sebo_009_database_studio_workbench_markdown', 'lesson_sebo_009_database_studio_workbench', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/009_database-studio-workbench.md', 'learn/software-engineering-builder-os/lessons/009_database-studio-workbench.md', 'inneranimalmedia', '009_database-studio-workbench.md', NULL, 'text/markdown', 9, unixepoch(), unixepoch()),
('asset_sebo_010_capstone_ship_review_measure_markdown', 'lesson_sebo_010_capstone_ship_review_measure', 'lesson_markdown', 'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/010_capstone-ship-review-measure.md', 'learn/software-engineering-builder-os/lessons/010_capstone-ship-review-measure.md', 'inneranimalmedia', '010_capstone-ship-review-measure.md', NULL, 'text/markdown', 10, unixepoch(), unixepoch());
