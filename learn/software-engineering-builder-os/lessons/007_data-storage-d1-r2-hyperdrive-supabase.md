# Data and Storage: D1, SQLite, R2, KV, Durable Objects, Hyperdrive, and Supabase

    ## Metadata

    ```yaml
    course_id: course_software_engineering_builder_os
    module_id: module_sebo_data_storage
    lesson_id: lesson_sebo_007_data_storage_d1_r2_hyperdrive_supabase
    slug: data-storage-d1-r2-hyperdrive-supabase
    content_type: markdown
    content_url: https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/007_data-storage-d1-r2-hyperdrive-supabase.md
    estimated_minutes: 150
    required: true
    published: true
    ```

    ## Lesson Summary

    A deep database/storage orientation lesson for the Inner Animal Media platform.

    ## Objective

    Learn the different responsibilities of relational tables, object storage, key-value state, durable sessions, and external Postgres/Supabase access.

    ## Why This Matters

    This lesson exists because real software builders need practical operating knowledge, not passive theory. The learner should leave with a clearer map of what the system is doing, what tools are involved, what files/tables/routes matter, and how to validate work safely.

    ## Concept Map

    ```txt
    Understand the concept
      -> inspect the real project
      -> run safe commands
      -> use the editor/browser/terminal
      -> capture evidence
      -> ask Agent Sam for review
      -> submit and improve
    ```

    ## Read

    Study the topic and connect it directly to the Inner Animal Media dashboard/platform.

    Key questions:

    ```txt
    What problem does this solve?
    What files or tables does it touch?
    What can break if this is done wrong?
    What commands are safe?
    What actions require approval?
    What evidence proves the work is complete?
    ```

    ## Lab

    1. Inspect D1 schema groups.
2. Explain when data belongs in D1 vs R2 vs KV vs Durable Objects vs Supabase.
3. Trace a course lesson from D1 row to R2 asset.
4. Design a simple storage plan for a new feature.
5. Identify which operations require approval.

    ## Commands

    Route risky commands through Agent Sam command governance.

    ```bash
    npx wrangler d1 execute inneranimalmedia-business --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name LIMIT 50;"
npx wrangler r2 object list inneranimalmedia --prefix learn/ --remote
    ```

    ## Files to Inspect or Edit

    - `docs/db/`
- `sql/`
- `src/api/database.js`
- `src/api/hyperdrive.js`
- `src/api/learn.js`

    ## Tables to Understand

    - `lessons`
- `lesson_assets`
- `agentsam_db_snippets`
- `agentsam_db_query_history`
- `agentsam_execution_performance_metrics`

    ## Dashboard Tooling

    This lesson should be usable inside `/dashboard/learn` with real workspace tools:

    ```txt
    Read tab      -> markdown renderer
    Lab tab       -> checklist and guided tasks
    Editor tab    -> Monaco/editor workspace
    Browser tab   -> BrowserView/preview
    Terminal tab  -> XTermShell command cockpit
    Submit tab    -> evidence submission
    Feedback tab  -> rubric and Agent Sam review
    ```

    ## Expected Evidence

    - Storage responsibility matrix
- Course lesson asset trace
- Safe query/mutation checklist

    ## Agent Sam Prompts

    ```txt
    Explain this lesson in plain English.
    Help me start the lab.
    Check my command output.
    Review my evidence before I submit.
    Grade this against the rubric.
    Quiz me on the important parts.
    Give me a harder challenge.
    ```

    ## Rubric

    | Criterion | Excellent | Solid | Needs Work |
    |---|---|---|---|
    | Correctness | Work is accurate and verified. | Mostly accurate with minor gaps. | Incomplete or incorrect. |
    | Safety | Risky actions are identified and gated. | Most risky actions are handled. | Unsafe or unclear execution. |
    | Evidence | Evidence clearly proves completion. | Evidence is present but thin. | Evidence missing or weak. |
    | Understanding | Learner can explain the system. | Learner can explain pieces. | Learner is mostly copying steps. |
    | Independence | Learner can repeat the workflow. | Learner needs some help. | Learner cannot repeat without guidance. |

    ## Completion Checklist

    ```txt
    [ ] I understand the concept.
    [ ] I inspected the relevant files.
    [ ] I inspected the relevant tables or routes.
    [ ] I ran safe commands or requested approval for risky commands.
    [ ] I captured evidence.
    [ ] I asked Agent Sam for review.
    [ ] I submitted the lesson work.
    ```
