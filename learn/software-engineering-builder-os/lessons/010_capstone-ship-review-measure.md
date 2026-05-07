# Capstone: Ship, Test, Review, Measure, and Improve a Real Dashboard Feature

    ## Metadata

    ```yaml
    course_id: course_software_engineering_builder_os
    module_id: module_sebo_shipping_quality
    lesson_id: lesson_sebo_010_capstone_ship_review_measure
    slug: capstone-ship-review-measure
    content_type: markdown
    content_url: https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/010_capstone-ship-review-measure.md
    estimated_minutes: 180
    required: true
    published: true
    ```

    ## Lesson Summary

    The capstone lesson where learners prove they can operate the full builder workflow.

    ## Objective

    Complete an end-to-end feature workflow: plan, implement, test, deploy, measure, document, and review with Agent Sam.

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

    1. Pick a small dashboard improvement.
2. Create a plan and task breakdown.
3. Make a focused implementation.
4. Run build/type/lint/smoke checks where available.
5. Capture command/tool metrics.
6. Submit evidence and request Agent Sam review.

    ## Commands

    Route risky commands through Agent Sam command governance.

    ```bash
    git status --short
npm run build
git diff --stat
npx wrangler d1 execute inneranimalmedia-business --remote --command "SELECT source_table, execution_count, success_count, failure_count FROM agentsam_execution_performance_metrics ORDER BY metric_date DESC LIMIT 20;"
    ```

    ## Files to Inspect or Edit

    - `dashboard/`
- `src/api/`
- `scripts/`
- `docs/`

    ## Tables to Understand

    - `agentsam_plans`
- `agentsam_plan_tasks`
- `agentsam_command_run`
- `agentsam_execution_performance_metrics`
- `course_submissions`
- `course_grades`

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

    - Plan ID or task list
- Code diff
- Validation output
- Deployment or preview URL
- Agent Sam feedback summary

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
