INSERT INTO course_exports (
  id,
  course_id,
  export_type,
  file_url,
  r2_key,
  r2_bucket,
  file_size,
  metadata,
  created_by,
  created_at
) VALUES
(
  'export_connor_todo',
  'course_connor_platform_operator',
  'template',
  'https://github.com/SamPrimeaux/leadership-legacy/blob/main/TO-DO.md',
  'docs/course/connor-platform-operator/TO-DO.md',
  'leadership-legacy',
  NULL,
  '{"kind":"setup_checklist","source":"repo","path":"TO-DO.md"}',
  'agent_sam',
  unixepoch()
),
(
  'export_connor_readme',
  'course_connor_platform_operator',
  'template',
  'https://github.com/SamPrimeaux/leadership-legacy/blob/main/README.md',
  'docs/course/connor-platform-operator/README.md',
  'leadership-legacy',
  NULL,
  '{"kind":"repo_front_door","source":"repo","path":"README.md"}',
  'agent_sam',
  unixepoch()
),
(
  'export_connor_rubric',
  'course_connor_platform_operator',
  'rubric',
  'https://github.com/SamPrimeaux/leadership-legacy/blob/main/docs/RUBRIC.md',
  'docs/course/connor-platform-operator/RUBRIC.md',
  'leadership-legacy',
  NULL,
  '{"kind":"rubric","source":"repo","path":"docs/RUBRIC.md"}',
  'agent_sam',
  unixepoch()
),
(
  'export_connor_agentsam_registration',
  'course_connor_platform_operator',
  'sql',
  'https://github.com/SamPrimeaux/leadership-legacy/blob/main/sql/agentsam/register_connor_workspace_scripts.sql',
  'docs/course/connor-platform-operator/register_connor_workspace_scripts.sql',
  'leadership-legacy',
  NULL,
  '{"kind":"workspace_registration","source":"repo","path":"sql/agentsam/register_connor_workspace_scripts.sql"}',
  'agent_sam',
  unixepoch()
),
(
  'export_connor_course_seed',
  'course_connor_platform_operator',
  'sql',
  NULL,
  'docs/course/connor-platform-operator/seed_connor_course_assignments.sql',
  'leadership-legacy',
  NULL,
  '{"kind":"course_seed","source":"d1","course_id":"course_connor_platform_operator"}',
  'agent_sam',
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  course_id = excluded.course_id,
  export_type = excluded.export_type,
  file_url = excluded.file_url,
  r2_key = excluded.r2_key,
  r2_bucket = excluded.r2_bucket,
  file_size = excluded.file_size,
  metadata = excluded.metadata,
  created_by = excluded.created_by;
