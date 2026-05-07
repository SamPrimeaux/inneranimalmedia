# Git and GitHub: Branches, Commits, Pull Requests, Rollback Thinking, and Repo Hygiene

    ## Metadata

    ```yaml
    course_id: course_software_engineering_builder_os
    module_id: module_sebo_terminal_ide_git
    lesson_id: lesson_sebo_004_git_github_repo_hygiene
    slug: git-github-repo-hygiene
    content_type: markdown
    content_url: https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/004_git-github-repo-hygiene.md
    estimated_minutes: 105
    required: true
    published: true
    ```

    ## Lesson Summary

    A practical Git workflow lesson for builders who need confidence before shipping.

    ## Objective

    Use Git and GitHub safely for real project work: inspect state, stage changes, commit intentionally, push, and understand rollback options.

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

    1. Inspect git status and recent commits.
2. Create a small docs-only change.
3. Stage only the intended file.
4. Commit with a clean message.
5. Explain how to revert or recover if the wrong file is changed.

    ## Commands

    Route risky commands through Agent Sam command governance.

    ```bash
    git status --short
git log --oneline -n 10
git diff -- docs | head -n 120
    ```

    ## Files to Inspect or Edit

    - `.gitignore`
- `README.md`
- `docs/`
- `scripts/`

    ## Tables to Understand

    - `agentsam_command_run`
- `agentsam_tool_call_log`

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

    - git status before and after
- commit hash
- rollback/recovery explanation

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
