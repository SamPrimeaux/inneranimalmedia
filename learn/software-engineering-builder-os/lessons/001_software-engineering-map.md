# The Software Engineering Map: How Modern Apps Actually Fit Together

    ## Metadata

    ```yaml
    course_id: course_software_engineering_builder_os
    module_id: module_sebo_foundations
    lesson_id: lesson_sebo_001_software_engineering_map
    slug: software-engineering-map
    content_type: markdown
    content_url: https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/001_software-engineering-map.md
    estimated_minutes: 75
    required: true
    published: true
    ```

    ## Lesson Summary

    A panoramic orientation lesson that gives learners the mental model they need before touching code.

    ## Objective

    Understand the full map of modern software engineering: frontend, backend, databases, APIs, cloud runtime, storage, auth, deployment, observability, and AI tooling.

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

    1. Draw the architecture of a basic SaaS app.
2. Label frontend, API, database, object storage, auth, and deployment layers.
3. Identify where Cloudflare Workers, D1, R2, Supabase, GitHub, and Agent Sam fit.
4. Write a short explanation of what each layer owns.

    ## Commands

    Route risky commands through Agent Sam command governance.

    ```bash
    pwd
ls -la
find . -maxdepth 2 -type d | sort
    ```

    ## Files to Inspect or Edit

    - `README.md`
- `docs/`
- `src/`
- `dashboard/`
- `worker.js or src/index.js`

    ## Tables to Understand

    - `courses`
- `course_modules`
- `lessons`
- `lesson_assets`
- `agentsam_project_context`

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

    - Architecture sketch or markdown diagram
- Repo folder map
- Short explanation of each major system layer

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
