# Frontend Foundations: React, Routes, Components, State, and Dashboard UX

    ## Metadata

    ```yaml
    course_id: course_software_engineering_builder_os
    module_id: module_sebo_frontend_ux
    lesson_id: lesson_sebo_005_frontend_react_dashboard_ux
    slug: frontend-react-dashboard-ux
    content_type: markdown
    content_url: https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/005_frontend-react-dashboard-ux.md
    estimated_minutes: 120
    required: true
    published: true
    ```

    ## Lesson Summary

    Learners trace and improve a real dashboard UI without redesigning the whole app.

    ## Objective

    Understand how a modern dashboard frontend is structured and how routes, components, state, and styling combine into a usable product.

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

    1. Find a dashboard route in App.tsx.
2. Trace the route to its page component.
3. Identify child components, state, and API calls.
4. Suggest a focused UX improvement.
5. Write a small component-level improvement plan.

    ## Commands

    Route risky commands through Agent Sam command governance.

    ```bash
    grep -R "Route path" -n dashboard | head -n 60
grep -R "fetch('/api" -n dashboard/components | head -n 80
    ```

    ## Files to Inspect or Edit

    - `dashboard/App.tsx`
- `dashboard/components/`
- `dashboard/components/learn/`
- `dashboard/components/DatabaseBrowser.tsx`

    ## Tables to Understand

    - `agentsam_workspace_state`
- `cms_themes`
- `cms_assets`

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

    - Route-to-component map
- UX issue list
- Focused improvement plan

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
