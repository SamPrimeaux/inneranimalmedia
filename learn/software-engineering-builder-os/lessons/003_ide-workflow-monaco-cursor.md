# IDE Workflow: Monaco, Cursor, File Trees, Search, Refactors, and Review Loops

    ## Metadata

    ```yaml
    course_id: course_software_engineering_builder_os
    module_id: module_sebo_terminal_ide_git
    lesson_id: lesson_sebo_003_ide_workflow_monaco_cursor
    slug: ide-workflow-monaco-cursor
    content_type: markdown
    content_url: https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/003_ide-workflow-monaco-cursor.md
    estimated_minutes: 100
    required: true
    published: true
    ```

    ## Lesson Summary

    A practical lesson on professional editing workflows across Cursor, Monaco, and the in-dashboard editor.

    ## Objective

    Learn how to use an IDE like a software engineer: search first, inspect context, make focused edits, validate, and avoid accidental regressions.

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

    1. Open the project file tree.
2. Search for a route, component, and API handler.
3. Trace a frontend route to backend API call.
4. Write a small non-invasive doc/comment improvement.
5. Review the git diff and explain what changed.

    ## Commands

    Route risky commands through Agent Sam command governance.

    ```bash
    git status --short
grep -R "dashboard/learn" -n dashboard src | head -n 50
git diff --stat
    ```

    ## Files to Inspect or Edit

    - `dashboard/App.tsx`
- `dashboard/components/`
- `src/api/`
- `src/core/production-dispatch.js`

    ## Tables to Understand

    - `agentsam_workspace_state`
- `agentsam_project_context`
- `agentsam_plan_tasks`

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

    - Search path showing route/component/API relationship
- A focused diff
- Explanation of how the change was validated

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
