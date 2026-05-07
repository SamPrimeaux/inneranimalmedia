# AI Engineering: OpenAI, Claude, Gemini, Workers AI, Routing, Cost, and Agent Sam

    ## Metadata

    ```yaml
    course_id: course_software_engineering_builder_os
    module_id: module_sebo_ai_agents
    lesson_id: lesson_sebo_008_ai_engineering_agent_sam_routing
    slug: ai-engineering-agent-sam-routing
    content_type: markdown
    content_url: https://assets.inneranimalmedia.com/learn/software-engineering-builder-os/lessons/008_ai-engineering-agent-sam-routing.md
    estimated_minutes: 135
    required: true
    published: true
    ```

    ## Lesson Summary

    A practical AI engineering lesson built around Agent Sam’s routing, model, and telemetry tables.

    ## Objective

    Understand how modern AI applications route tasks across providers, track cost, manage model quality, and use tool calls safely.

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

    1. Inspect model/routing tables.
2. Map task types to model tiers.
3. Explain when local/fallback models are acceptable.
4. Trace one Agent Sam run through messages, command runs, tool logs, and usage.
5. Design a routing policy for Learn labs.

    ## Commands

    Route risky commands through Agent Sam command governance.

    ```bash
    npx wrangler d1 execute inneranimalmedia-business --remote --command "SELECT task_type, mode, model_key, provider, priority FROM agentsam_routing_arms ORDER BY task_type, priority LIMIT 80;"
npx wrangler d1 execute inneranimalmedia-business --remote --command "SELECT provider, model_key, is_enabled FROM agentsam_ai LIMIT 80;"
    ```

    ## Files to Inspect or Edit

    - `src/api/agent.js`
- `src/api/agentsamCommandGovernance.js`
- `docs/db/agentsam-d1-context/agentsam_commands.md`

    ## Tables to Understand

    - `agentsam_ai`
- `agentsam_routing_arms`
- `agentsam_usage_events`
- `agentsam_analytics`
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

    - Routing matrix
- Cost/quality notes
- Agent Sam run trace

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
