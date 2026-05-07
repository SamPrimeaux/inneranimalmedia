# Database Studio: Building an In-House D1, SQLite, Hyperdrive, and Supabase Workbench

    ## Metadata

    ```yaml
    course_id: course_software_engineering_builder_os
    module_id: module_sebo_database_studio
    lesson_id: lesson_sebo_009_database_studio_workbench
    slug: database-studio-workbench
    content_type: markdown
    content_url: https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/009_database-studio-workbench.md
    estimated_minutes: 160
    required: true
    published: true
    ```

    ## Lesson Summary

    A product-building lesson that turns database operations into a safe dashboard-native workflow.

    ## Objective

    Design and understand the in-house database editor that replaces day-to-day D1 Studio/Supabase Studio workflows inside the dashboard.

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

    1. Map the current DatabaseBrowser frontend.
2. Identify missing tables or broken assumptions.
3. Design canonical agentsam DB snippets and query history.
4. Define safe read vs mutation behavior.
5. Draft the API contract for schema browser, query runner, snippets, history, and result grid.

    ## Commands

    Route risky commands through Agent Sam command governance.

    ```bash
    grep -R "agent_db_snippets\|agent_db_query_history\|DatabaseBrowser" -n src dashboard | head -n 120
npx wrangler d1 execute inneranimalmedia-business --remote --command "PRAGMA table_info(agentsam_tool_call_log);"
    ```

    ## Files to Inspect or Edit

    - `dashboard/components/DatabaseBrowser.tsx`
- `src/api/agent.js`
- `src/api/database.js`
- `src/api/hyperdrive.js`

    ## Tables to Understand

    - `agentsam_db_snippets`
- `agentsam_db_query_history`
- `agentsam_guardrails`
- `agentsam_guardrail_events`

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

    - Database Studio gap map
- Canonical table proposal
- API contract draft

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
