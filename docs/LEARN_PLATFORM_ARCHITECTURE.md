# Learn Platform Architecture (InnerAnimalMedia)

This doc describes how `/dashboard/learn` works as a reusable, DB-driven Learning OS.

## Goals

- Courses are **generic and reusable** (not tied to a single user).
- Course content is **authored in D1**, not hardcoded in React.
- The dashboard renders **any valid course** from the D1 course tables.
- Progress, submissions, and grades are **user-scoped** and safe by default.

## Relationship between `course_*` and `cms_*`

The Learn platform is **course-driven** (the source of truth for learning content is `course_*`), but it lives inside a dashboard that is **CMS-driven** for theme/chrome and will eventually support CMS-driven content blocks.

- **`course_*`**: Learning product data model (courses, modules, lessons, assignments, exports, progress, submissions, grades).
- **`cms_*`**: Platform content system (themes/tokens, pages/sections/components, asset registry, drafts/overrides, activity log).

Current principle:

- Learn uses `course_*` for curriculum and assessment.
- Learn respects CMS infrastructure indirectly (especially `cms_themes`) and keeps its UI modular so it can map to CMS sections/components later.

## Current CMS integrations

### Theme compatibility via `cms_themes`

Learn does **not** fetch theme rows directly. It inherits the dashboard’s existing theme pipeline:

- Server: `GET /api/themes/active` resolves an active `cms_themes` row and returns a **CSS variable map** as `payload.data`.
  - Implementation: `src/api/themes.js` → `handleThemesApi()` + `src/core/cms-theme-active.js` → `buildActiveThemeApiPayload()`
- Client: `dashboard/src/applyCmsTheme.ts` applies `payload.data` to `document.documentElement.style` and caches it in localStorage for first paint.
- First paint: `dashboard/index.html` reads the cached CSS vars from localStorage and applies them before React mounts.

Because Learn styles only reference dashboard CSS variables (e.g. `--bg-app`, `--bg-panel`, `--border-subtle`, `--text-main`, `--text-muted`, `--solar-cyan`), it stays compatible with the CMS theme system.

## Future CMS integration roadmap (not implemented yet)

### Future course_exports ↔ cms_assets bridge

Today, `course_exports` is a course-scoped resource library (`file_url` or `r2_bucket/r2_key` + metadata).

Future direction:

- Add optional linkage (schema or convention) from `course_exports` to `cms_assets` so exports can reuse:
  - asset metadata, tags, collections
  - consistent R2 storage conventions
  - preview thumbnails and unified resource browsing

### Future Learn activity logging via `cms_activity_log`

Learn currently updates progress/submissions via:

- `POST /api/learn/progress`
- `POST /api/learn/submit`

Future direction:

- Add event logging (server-side) to `cms_activity_log` (or an equivalent analytics/events table) for:
  - lesson started / completed
  - submission saved / submitted
  - grade posted
  - export opened/downloaded
  - course completion

### Future lesson/layout blocks as `cms_component_templates`

Learn UI is currently implemented as React components in the dashboard codebase.

Future direction:

- Represent reusable blocks (lesson header, objectives, lab instructions, rubric, resource library) as CMS templates:
  - `cms_component_templates` (template definitions)
  - `cms_page_sections` / `cms_section_components` (page composition)
  - `cms_page_overrides` / drafts / versions for safe editing

This allows future course landing pages, lesson previews, and resource libraries to be composed and edited via CMS sections/components while keeping `course_*` as the curriculum source of truth.

## Data model (D1)

Core authoring tables (course definition):

- `courses`: top-level course metadata (title/slug/long_description/category/level/duration/status/metadata).
- `course_modules`: ordered modules per course.
- `course_lessons`: ordered lessons per module/course.
  - Authoring fields: `content`, `content_format` (default `markdown`), `has_content`
  - Lab fields: `sandbox_query`, `sandbox_db`
- `course_assignments`: deliverables + evidence requirements + rubric JSON.
- `course_exports`: resource library items (file_url or R2 pointer).

User state tables (per student/operator):

- `enrollments`: ties a user to a course (active enrollment is used for progress/submissions).
- `course_progress`: per-enrollment per-lesson status/time/token spend (unique on `(enrollment_id, lesson_id)`).
- `course_submissions`: per-enrollment assignment evidence and submission status.
- `course_grades`: grading outcomes (rubric_scores/score/feedback/etc).

## API contract

### GET `/api/learn/dashboard`

Returns a nested payload the dashboard can render without additional joins.

Shape:

```json
{
  "ok": true,
  "courses": [
    {
      "id": "...",
      "title": "...",
      "slug": "...",
      "description": "...",
      "long_description": "...",
      "category": "...",
      "level": "...",
      "duration_hours": 8,
      "status": "published",
      "metadata": {},
      "enrollment": { "id": "...", "progress_percent": 25, "...": "..." } | null,
      "progress_summary": { "total_lessons": 10, "completed_lessons": 2, "progress_percent": 20 },
      "modules": [
        {
          "id": "...",
          "title": "...",
          "lessons": [
            {
              "id": "...",
              "title": "...",
              "type": "lesson|lab|assignment|milestone",
              "content": "...",
              "content_format": "markdown",
              "has_content": 1,
              "sandbox_query": null,
              "progress": { "status": "not_started|in_progress|completed", "time_spent_minutes": 0, "token_spend": 0 },
              "assignments": [
                {
                  "id": "...",
                  "required_evidence": "[\"URL\", \"Screenshot\", ...]",
                  "rubric": "{\"criteria\": [...]}",
                  "submission": { "...": "..." } | null,
                  "grade": { "...": "..." } | null
                }
              ]
            }
          ],
          "assignments": [ /* module-level assignments */ ]
        }
      ],
      "assignments": [ /* course-level list */ ],
      "exports": [
        { "id": "...", "export_type": "template|doc|sql|...", "file_url": "...", "r2_bucket": "...", "r2_key": "...", "metadata": {} }
      ]
    }
  ]
}
```

Visibility rules:

- **Admins** (superadmins) can see all courses.
- Non-admins see:
  - courses they’re enrolled in, plus
  - public published courses (`is_public=1` and `status='published'`).

Progress fallbacks:

- If a user has no progress row for a lesson, the API returns a default progress object (`not_started`, 0 minutes, 0 tokens).
- Courses may render without an enrollment; progress is still shown as defaults and the UI remains usable.

### POST `/api/learn/progress`

Body:

```json
{
  "course_id": "...",
  "module_id": "...",
  "lesson_id": "...",
  "status": "not_started|in_progress|completed",
  "time_spent_minutes": 3,
  "token_spend": 0
}
```

Behavior:

- Validates the lesson exists for the given course.
- Ensures an active enrollment exists (creates one if missing).
- Upserts `course_progress` using `(enrollment_id, lesson_id)`.
- Returns updated progress + course progress percent.

### POST `/api/learn/submit`

Body:

```json
{
  "assignment_id": "...",
  "course_id": "...",
  "evidence": { "urls": [], "notes": "", "github_commit": "" },
  "status": "draft|submitted",
  "time_spent_minutes": 12,
  "token_spend": 0
}
```

Behavior:

- Validates assignment exists and belongs to the course.
- Ensures an active enrollment exists (creates one if missing).
- Inserts or updates `course_submissions`.
- `status='draft'` saves evidence without forcing `submitted_at`.
- `status='submitted'` sets `submitted_at` and moves the submission to review-ready state.

## Dashboard UI component map

- Route: `/dashboard/learn` → `dashboard/components/LearnPage.tsx`
- Main layout: `dashboard/components/learn/LearningOS.tsx`
  - Left: course/module/lesson navigator
  - Center: course overview or lesson content
  - Right: assignment/rubric/evidence/grade + exports library
- Markdown rendering: `dashboard/components/learn/MarkdownLite.tsx`
  - Safe minimal renderer (no HTML injection)

## Course authoring workflow

1. Insert `courses` row (set `status='published'` when ready; set `is_public=1` to show for non-enrolled users).
2. Insert `course_modules` rows with `order_index`.
3. Insert `course_lessons` rows with `order_index` and `module_id`.
   - Put lesson markdown in `course_lessons.content`
   - Set `has_content=1`
   - Set `content_format='markdown'`
4. Insert `course_assignments` rows:
   - Use `lesson_id` to attach to a specific lesson (recommended)
   - Put rubric JSON in `rubric`
   - Put evidence labels/requirements JSON in `required_evidence`
5. Insert `course_exports` rows:
   - Prefer `file_url` for externally accessible docs
   - Or use `r2_bucket` + `r2_key` for internal R2-backed resources
6. Enrollments/progress/submissions/grades are created through user interaction.

## Safety rules (labs, terminal work, deploys)

High-risk lessons (terminal, deploys, secrets, DB writes) must follow these rules:

- Do not expose secrets in lesson content or exports.
- If a lesson includes a command sequence, it must clearly label:
  - expected working directory
  - “read-only” vs “writes state”
  - rollback/undo steps when applicable
- Do not grade destructive tasks based only on self-reported evidence.
- Any grading automation should be behind an admin-only path and should require explicit approval before executing live changes.

