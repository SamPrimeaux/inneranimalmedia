# Software Engineering Builder OS

    Generated: 2026-05-07 06:37:54 UTC

    This course is a reusable, multi-user Software Engineering and Builder OS curriculum. It is not Connor-specific. It is the baseline course for teaching developers, operators, founders, and internal users how to build with the Inner Animal Media platform.

    ## Course Goal

    Teach the learner how modern software products are built end to end:

    ```txt
    software architecture
    terminal
    IDE/editor workflow
    Git/GitHub
    frontend/dashboard UX
    Cloudflare Workers
    D1/R2/KV/Durable Objects
    Hyperdrive/Supabase
    AI provider routing
    Agent Sam command governance
    database workbench
    testing/deploy/review loops
    ```

    ## R2 Prefix

    ```txt
    learn/software-engineering-builder-os/
    ```

    ## Public Base URL

    ```txt
    https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/
    ```

    ## The 10 Lesson Plans

    ```txt
    001. The Software Engineering Map: How Modern Apps Actually Fit Together
002. Terminal Mastery: Commands, Files, Paths, Processes, and Safe Execution
003. IDE Workflow: Monaco, Cursor, File Trees, Search, Refactors, and Review Loops
004. Git and GitHub: Branches, Commits, Pull Requests, Rollback Thinking, and Repo Hygiene
005. Frontend Foundations: React, Routes, Components, State, and Dashboard UX
006. Cloudflare Runtime: Workers, Routes, Bindings, Wrangler, and Deployment Flow
007. Data and Storage: D1, SQLite, R2, KV, Durable Objects, Hyperdrive, and Supabase
008. AI Engineering: OpenAI, Claude, Gemini, Workers AI, Routing, Cost, and Agent Sam
009. Database Studio: Building an In-House D1, SQLite, Hyperdrive, and Supabase Workbench
010. Capstone: Ship, Test, Review, Measure, and Improve a Real Dashboard Feature
    ```

    ## Required Dashboard Behavior

    Each lesson should work as a focused session inside `/dashboard/learn`.

    ```txt
    Course Library
      -> Course Session
        -> Lesson Lab
          -> Read / Lab / Editor / Browser / Terminal / Submit / Feedback
    ```

    ## Required Data Tables

    ```txt
    lessons
    lesson_assets
    lesson_versions
    lesson_progress
    course_assignments
    course_submissions
    course_grades
    agentsam_workspace_state
    agentsam_command_run
    agentsam_tool_call_log
    agentsam_guardrail_events
    ```

    ## Build Standard

    No placeholders. No fake terminal. No fake browser. No fake editor.

    If a tab exists, it must connect to the existing Agent workspace tooling.
