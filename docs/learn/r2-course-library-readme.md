# Learning OS R2 Course Library

Generated: 2026-05-07 06:48:05 UTC

This folder is the source package for the `/learn/` area inside the `inneranimalmedia` R2 bucket.

R2 public path:

```txt
https://assets.inneranimalmedia.com/learn/
```

R2 object prefix:

```txt
learn/
```

Current course folders:

```txt
learn/
  connor-platform-operator/
  software-engineering-builder-os/
  agentsam-cad-engineering/          # source: docs/learn/courses/agentsam-cad-engineering/
```

This README exists so Agent Sam, Cursor, and future maintainers can understand the course storage plan immediately without guessing.

---

# Purpose

The `learn/` R2 area is the portable course-content layer for Inner Animal Media Learning OS.

It stores:

```txt
course documentation
course manifests
lesson markdown
SQL seed files
rubrics
starter files
solution files
screenshots
diagrams
exports
QA checklists
downloadable templates
```

D1 stores structured course data.

R2 stores editable, portable, versionable course content.

`/dashboard/learn` combines both.

---

# Core Architecture

```txt
Repo learn/ folder
  -> committed source course package

R2 learn/ prefix
  -> public or dashboard-loadable course assets

D1 course/lesson tables
  -> structured metadata, progress, submissions, grades

Dashboard /dashboard/learn
  -> interactive learning workspace

Agent Sam
  -> tutor, reviewer, lab guide, terminal governance, code helper
```

Intended flow:

```txt
write course files in repo
  -> upload course folder to R2
  -> seed D1 lessons and lesson_assets
  -> render in /dashboard/learn
  -> use Agent Sam/editor/browser/terminal for guided labs
```

---

# R2 Folder Behavior

R2 does not have real folders. It has object keys.

A path like:

```txt
learn/software-engineering-builder-os/lessons/001_software-engineering-map.md
```

is one object key.

Cloudflare displays prefixes as folders when objects exist under that prefix.

For empty planned folders, we use `.keep` files.

Example:

```txt
learn/software-engineering-builder-os/assets/images/.keep
```

This makes the folder visible until real assets are uploaded.

When real files exist in a folder, `.keep` is optional.

---

# Canonical Course Folder Shape

Every course should follow this shape:

```txt
learn/{course-slug}/
  README.md
  COURSE.md
  RUBRIC.md
  TO-DO.md
  manifest.json

  lessons/
    001_lesson-slug.md
    002_lesson-slug.md
    003_lesson-slug.md

  sql/
    001_course.sql
    002_modules.sql
    003_lessons.sql
    004_assignments.sql
    005_exports.sql
    006_lesson_assets.sql
    007_lesson_versions.sql

  assets/
    images/
    diagrams/
    starter-files/
    solution-files/
    datasets/

  rubrics/
    module-or-lesson.rubric.md

  exports/
    templates/
    markdown/
    sql/

  qa/
    smoke-checks.md
    validation-checklist.md
```

---

# Required Root Files Per Course

## `README.md`

Human-readable overview.

Should explain:

```txt
what the course teaches
who it is for
how lessons are structured
where files live
how to publish/update it
```

## `COURSE.md`

Product-level course definition.

Should include:

```txt
course promise
target learner
course outcomes
module map
skill progression
dashboard behavior
Agent Sam behavior
```

## `RUBRIC.md`

Default grading standard.

Should include:

```txt
correctness
safety
evidence quality
conceptual understanding
operator independence
```

## `TO-DO.md`

Buildout checklist.

Should include:

```txt
remaining lesson drafts
assets needed
SQL seeds needed
rubrics needed
dashboard wiring
QA requirements
```

## `manifest.json`

Machine-readable course map.

Should include:

```txt
course_id
course_slug
r2_bucket
r2_prefix
public_base_url
lesson_count
lessons[]
required_files[]
asset folders
```

Agent Sam and Cursor should prefer `manifest.json` when they need a structured map.

---

# D1 Tables Connected to This Area

Main course and lesson tables:

```sql
CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  content_type TEXT DEFAULT 'text',
  content_url TEXT,
  content_text TEXT,
  order_index INTEGER NOT NULL,
  estimated_minutes INTEGER,
  is_required INTEGER DEFAULT 1,
  is_published INTEGER DEFAULT 0,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(course_id, slug)
);
```

```sql
CREATE TABLE lesson_assets (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  asset_url TEXT NOT NULL,
  r2_key TEXT,
  r2_bucket TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  order_index INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Related course tables:

```txt
courses
course_modules
course_lessons
lesson_versions
lesson_progress
course_assignments
course_submissions
course_grades
course_exports
enrollments
```

Agent-integrated tables:

```txt
agentsam_workspace_state
agentsam_command_run
agentsam_tool_call_log
agentsam_guardrail_events
agentsam_execution_performance_metrics
agentsam_plans
agentsam_plan_tasks
agentsam_project_context
```

---

# Lesson Content Rules

Each lesson should have:

```txt
stable id
module_id
course_id
title
slug
description
content_type
content_url or content_text
order_index
estimated_minutes
published state
```

Preferred lesson content mode:

```txt
content_type = markdown
content_url = https://assets.inneranimalmedia.com/learn/{course-slug}/lessons/{lesson-file}.md
content_text = NULL or cached excerpt
```

This lets R2 be the editable curriculum source while D1 remains the queryable metadata layer.

---

# Lesson Markdown Standard

Every lesson markdown file should include:

```txt
# Lesson Title

Metadata
Lesson Summary
Objective
Why This Matters
Concept Map
Read
Lab
Commands
Files to Inspect or Edit
Tables to Understand
Dashboard Tooling
Expected Evidence
Agent Sam Prompts
Rubric
Completion Checklist
```

A lesson should not be passive. It should create a real work session.

---

# Interactive Lesson Workspace

Each lesson should power these real tabs in `/dashboard/learn`:

```txt
Read
Lab
Editor
Browser
Terminal
Submit
Feedback
```

Rules:

```txt
Read tab renders markdown.
Lab tab shows checklist/workflow.
Editor tab uses the real Monaco/editor system.
Browser tab uses the real BrowserView/preview system.
Terminal tab uses the real XTermShell/terminal system.
Submit tab writes course_submissions.
Feedback tab reads course_grades/rubrics.
Agent Sam receives course/module/lesson context.
```

No fake tabs. No placeholder tool panels. If the UI shows a tool, it must connect to the real platform capability.

---

# Course Asset Types

Recommended `lesson_assets.asset_type` values:

```txt
readme
course_markdown
lesson_markdown
sql_seed
assignment_seed
rubric
todo
manifest
starter_file
solution_file
screenshot
diagram
video
audio
dataset
export
template
reference_doc
qa_script
browser_preview
terminal_transcript
```

---

# Example `lesson_assets` Row

```sql
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
) VALUES (
  'asset_sebo_001_software_engineering_map_markdown',
  'lesson_sebo_001_software_engineering_map',
  'lesson_markdown',
  'https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/001_software-engineering-map.md',
  'learn/software-engineering-builder-os/lessons/001_software-engineering-map.md',
  'inneranimalmedia',
  '001_software-engineering-map.md',
  NULL,
  'text/markdown',
  1,
  unixepoch(),
  unixepoch()
);
```

---

# Current Courses

## `connor-platform-operator/`

Purpose:

```txt
Client/project-specific operator course for Connor / Leadership Legacy Digital.
```

Current known files:

```txt
001_connor_course.sql
002_connor_course_modules.sql
003_connor_course_lessons_min.sql
004_connor_course_assignments.sql
005_connor_course_exports.sql
README.md
RUBRIC.md
TO-DO.md
```

This course is project-specific.

## `software-engineering-builder-os/`

Purpose:

```txt
General reusable Software Engineering / Builder OS curriculum for multiple users.
```

Current generated structure:

```txt
COURSE.md
README.md
RUBRIC.md
TO-DO.md
manifest.json

lessons/
  001_software-engineering-map.md
  002_terminal-command-line.md
  003_ide-workflow-monaco-cursor.md
  004_git-github-repo-hygiene.md
  005_frontend-react-dashboard-ux.md
  006_cloudflare-workers-runtime.md
  007_data-storage-d1-r2-hyperdrive-supabase.md
  008_ai-engineering-agent-sam-routing.md
  009_database-studio-workbench.md
  010_capstone-ship-review-measure.md

sql/
  003_lessons.sql
  006_lesson_assets.sql
```

This course is reusable and subscription-product ready.

---

# R2 Upload Workflow

Use the sync script:

```bash
python3 scripts/sync_learn_course_to_r2.py software-engineering-builder-os --dry-run
python3 scripts/sync_learn_course_to_r2.py software-engineering-builder-os
```

That uploads local files under:

```txt
learn/software-engineering-builder-os/
```

to R2 keys under:

```txt
inneranimalmedia/learn/software-engineering-builder-os/
```

---

# R2 Verification Workflow

Wrangler v4 does not support this command for your setup:

```bash
wrangler r2 object list
```

Use `get` on known representative objects:

```bash
npx wrangler r2 object get inneranimalmedia/learn/software-engineering-builder-os/README.md --file /tmp/sebo_README.md --remote

npx wrangler r2 object get inneranimalmedia/learn/software-engineering-builder-os/lessons/001_software-engineering-map.md --file /tmp/sebo_lesson_001.md --remote

npx wrangler r2 object get inneranimalmedia/learn/software-engineering-builder-os/sql/003_lessons.sql --file /tmp/sebo_003_lessons.sql --remote
```

Then inspect:

```bash
head -n 20 /tmp/sebo_README.md
head -n 30 /tmp/sebo_lesson_001.md
head -n 30 /tmp/sebo_003_lessons.sql
```

If these work, the R2 objects exist.

If public `curl -I` returns:

```txt
HTTP/2 403
cf-mitigated: challenge
```

that means Cloudflare security/WAF challenged the request. It does not mean the R2 object is missing.

---

# D1 Seed Workflow

After uploading course content to R2, seed D1.

For Software Engineering Builder OS:

```bash
npx wrangler d1 execute inneranimalmedia-business --remote --file learn/software-engineering-builder-os/sql/003_lessons.sql

npx wrangler d1 execute inneranimalmedia-business --remote --file learn/software-engineering-builder-os/sql/006_lesson_assets.sql
```

Verify lessons:

```bash
npx wrangler d1 execute inneranimalmedia-business --remote --command "
SELECT
  id,
  course_id,
  module_id,
  title,
  slug,
  content_url,
  is_published
FROM lessons
WHERE course_id = 'course_software_engineering_builder_os'
ORDER BY order_index;
"
```

Verify assets:

```bash
npx wrangler d1 execute inneranimalmedia-business --remote --command "
SELECT
  lesson_id,
  asset_type,
  asset_url,
  r2_key,
  r2_bucket,
  file_name,
  mime_type
FROM lesson_assets
WHERE lesson_id LIKE 'lesson_sebo_%'
ORDER BY lesson_id, order_index;
"
```

---

# Agent Instructions

Agents working in this area should follow these rules.

## Do

```txt
Read this README first.
Inspect manifest.json before modifying a course.
Preserve stable lesson IDs and slugs.
Keep R2 keys and D1 content_url values aligned.
Use .keep files only for intentional empty folders.
Update SQL seeds when lesson files change.
Use Agent Sam command governance for D1 writes and R2 uploads.
Verify representative R2 objects with wrangler r2 object get.
Commit course source files to repo before uploading.
```

## Do Not

```txt
Do not create random one-off folders.
Do not hardcode local machine paths into D1 rows.
Do not point content_url to /Users/... paths.
Do not make fake dashboard tabs.
Do not bypass D1 seed files for permanent content.
Do not delete .keep files unless the folder has real files.
Do not assume public curl 403 means an R2 object is missing.
Do not make Connor-specific content inside reusable courses.
```

---

# Naming Rules

Course slug:

```txt
lowercase-kebab-case
```

Lesson file:

```txt
001_lesson-slug.md
```

Lesson ID:

```txt
lesson_{short_course_key}_{number}_{snake_slug}
```

Asset ID:

```txt
asset_{short_course_key}_{number}_{snake_slug}_{asset_type}
```

R2 key:

```txt
learn/{course_slug}/lessons/{file_name}
```

Public URL:

```txt
https://assets.inneranimalmedia.com/learn/{course_slug}/lessons/{file_name}
```

---

# Future Course Ideas

Recommended future course folders:

```txt
cloudflare-platform-operator/
database-studio-builder/
agent-sam-operator/
frontend-dashboard-ux/
ai-routing-and-tool-governance/
cms-theme-builder/
nonprofit-platform-operator/
shopify-style-cms-builder/
```

Each one should follow the same folder contract.

---

# Buildout Plan

Immediate next steps:

```txt
1. Apply Software Engineering Builder OS lesson rows to D1.
2. Apply lesson_assets rows to D1.
3. Create/verify course and module rows for Software Engineering Builder OS.
4. Update /api/learn/dashboard to include lessons + lesson_assets.
5. Update /dashboard/learn to render R2 markdown content_url.
6. Add admin-only curriculum builder.
7. Add lesson_versions for draft/publish workflow.
8. Add QA script that validates R2 URL, D1 rows, and lesson order.
```

---

# Implementation Principle

The Learning OS should be built like a product, not a content dump.

Every course should be:

```txt
portable
versionable
R2-backed
D1-queryable
Agent-integrated
workspace-aware
multi-user ready
safe for subscriptions
```
