# Terminal Mastery: Commands, Files, Paths, Processes, and Safe Execution

    ## Metadata

    ```yaml
    course_id: course_software_engineering_builder_os
    module_id: module_sebo_terminal_ide_git
    lesson_id: lesson_sebo_002_terminal_command_line
    slug: terminal-command-line
    content_type: markdown
    content_url: https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/002_terminal-command-line.md
    estimated_minutes: 90
    required: true
    published: true
    ```

    ## Lesson Summary

    Learners build terminal fluency without reckless copy-paste habits.

    ## Objective

    Become comfortable using the terminal as a real production tool for navigation, inspection, setup, and safe command execution.

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

    1. Navigate the repo using pwd, ls, cd, find, and tree-style commands.
2. Inspect files with cat, head, tail, sed, grep, and wc.
3. Run a harmless command and capture output.
4. Classify commands by risk: safe read, write, destructive, deploy, secret-sensitive.
5. Explain why command governance matters in Agent Sam.

    ## Commands

    Route risky commands through Agent Sam command governance.

    ```bash
    pwd
ls -lah
find . -maxdepth 3 -type f | sort | head -n 80
grep -R "TODO" -n docs src dashboard | head -n 50
    ```

    ## Files to Inspect or Edit

    - `scripts/`
- `docs/`
- `src/`
- `dashboard/`

    ## Tables to Understand

    - `agentsam_commands`
- `agentsam_command_run`
- `agentsam_command_allowlist`
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

    - Terminal output from repo inspection
- A command risk classification table
- Notes explaining which commands should require approval

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
