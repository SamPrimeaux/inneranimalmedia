# Learning OS Reconciliation Plan

    Generated: 2026-05-07 06:54:30 UTC

    This document explains how the Software Engineering Builder OS course ties Cursor's v1 Learn implementation to the new R2-backed `lessons` and `lesson_assets` system.

    ## Why this exists

    The verification queries failed because they selected `is_published` from `courses` and `course_modules`, but those columns do not exist in the current D1 schema.

    This is the exact failure class we need to avoid going forward:

    ```txt
    no such column: is_published
    ```

    The fix is not to guess columns. The fix is to introspect the schema with `PRAGMA table_info(...)` and generate SQL/API selectors that only reference real columns.

    ## Generated SQL

    ```txt
    sql/learn/010_reconcile_software_engineering_builder_os.sql
    ```

    ## Current schema columns discovered by the script

    ```json
    {
  "courses": [
    "category",
    "created_at",
    "currency",
    "description",
    "duration_hours",
    "id",
    "instructor_id",
    "is_featured",
    "is_public",
    "level",
    "long_description",
    "metadata",
    "org_id",
    "price_cents",
    "published_at",
    "slug",
    "status",
    "thumbnail_url",
    "title",
    "updated_at"
  ],
  "course_modules": [
    "course_id",
    "created_at",
    "description",
    "estimated_minutes",
    "id",
    "is_required",
    "order_index",
    "title",
    "updated_at"
  ],
  "course_lessons": [
    "content",
    "content_format",
    "course_id",
    "created_at",
    "description",
    "estimated_minutes",
    "has_content",
    "id",
    "is_required",
    "module_id",
    "order_index",
    "sandbox_db",
    "sandbox_query",
    "title",
    "type",
    "updated_at"
  ],
  "lessons": [
    "content_text",
    "content_type",
    "content_url",
    "course_id",
    "created_at",
    "description",
    "estimated_minutes",
    "id",
    "is_published",
    "is_required",
    "module_id",
    "order_index",
    "published_at",
    "slug",
    "title",
    "updated_at"
  ],
  "lesson_assets": [
    "asset_type",
    "asset_url",
    "created_at",
    "file_name",
    "file_size",
    "id",
    "lesson_id",
    "mime_type",
    "order_index",
    "r2_bucket",
    "r2_key",
    "updated_at"
  ]
}
    ```

    ## Course package

    ```txt
    learn/software-engineering-builder-os/
      README.md
      COURSE.md
      RUBRIC.md
      TO-DO.md
      manifest.json
      lessons/
      sql/
    ```

    ## R2 package

    ```txt
    inneranimalmedia/learn/software-engineering-builder-os/
    ```

    ## D1 canonical lesson source

    ```txt
    lessons
    lesson_assets
    ```

    ## Compatibility layer

    Cursor's v1 Learn work may still read:

    ```txt
    courses
    course_modules
    course_lessons
    ```

    The generated SQL ensures:

    ```txt
    courses has the Software Engineering Builder OS parent row.
    course_modules has module rows if the table exists.
    course_lessons is backfilled if that table exists.
    lessons remains the canonical lesson table.
    lesson_assets remains the canonical R2 asset table.
    ```

    ## Required `/api/learn/dashboard` behavior

    `src/api/learn.js` must return a normalized view model, regardless of whether a row came from `lessons` or `course_lessons`.

    Required shape:

    ```ts
    type NormalizedLesson = {
      id: string;
      course_id: string;
      module_id: string;
      title: string;
      slug: string;
      description?: string;
      content_type: 'markdown' | 'text' | 'video' | string;
      content_url?: string;
      content_text?: string;
      order_index: number;
      estimated_minutes?: number;
      is_required?: number;
      is_published?: number;
      assets: LessonAsset[];
      progress?: LessonProgress;
      assignments: CourseAssignment[];
    };
    ```

    ## No fake workspace tooling

    `/dashboard/learn` must reuse the real Agent workspace systems:

    ```txt
    ChatAssistant
    MonacoEditorView
    BrowserView
    XTermShell
    WorkspaceExplorerPanel
    agentsam_workspace_state
    agentsam_command_run
    agentsam_tool_call_log
    agentsam_guardrail_events
    ```

    ## Cursor implementation instruction

    ```txt
    Refactor /dashboard/learn so it consumes the reconciled Learning OS data model.

    Do not assume courses.is_published or course_modules.is_published exist.
    Use API-side normalization and safe SELECTs.
    Prefer canonical lessons + lesson_assets.
    Use course_lessons only as compatibility fallback.
    Reuse existing Agent workspace tooling from /dashboard/agent:
    ChatAssistant, MonacoEditorView, BrowserView, XTermShell, workspace state, command governance, and telemetry.
    Do not build fake terminal/editor/browser panels.
    Admin/superadmin can edit/reorder curriculum.
    Students can read, run labs, submit evidence, and get feedback.
    ```
