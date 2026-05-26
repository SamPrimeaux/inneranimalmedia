# Launch Desk

Launch Desk is a launch-planning agent app for turning a rough product idea into an execution-ready release plan.

## What it does

- Accepts a product brief, audience, launch date, constraints, and available assets.
- Streams progress from the agent while it works.
- Produces a prioritized plan, risk register, owner checklist, launch copy suggestions, and follow-up questions.
- Uses the current OpenAI Agents SDK pattern with function tools and server-side tracing.

## Local setup

1. Install dependencies.
2. Set `OPENAI_API_KEY` in your shell before starting the worker dev server.
3. Run the dashboard frontend.
4. Run the worker backend so `/api/launch-desk` can reach the OpenAI API.

### Required env

- `OPENAI_API_KEY`

Optional:

- `OPENAI_AGENTS_DISABLE_TRACING=1` to disable SDK tracing during local debugging.
- `LAUNCH_DESK_MODEL=gpt-5.5` or another project-approved model if your OpenAI project has access.

Default model:

- The app falls back to `gpt-4.1` if `LAUNCH_DESK_MODEL` is not set.

## Routes

- Frontend: `/dashboard/launch-desk`
- API: `POST /api/launch-desk`

## Code layout

- `src/api/launch-desk.js` - worker route and SSE stream.
- `src/launch-desk/agent.js` - agent definition and prompt assembly.
- `src/launch-desk/tools.js` - deterministic launch-planning tools.
- `dashboard/pages/LaunchDeskPage.tsx` - frontend page.
- `dashboard/pages/launch-desk/useLaunchDeskStream.ts` - SSE client hook.

## Output contract

The assistant should produce:

- Prioritized Plan
- Risk Register
- Owner Checklist
- Launch Copy Suggestions
- Follow-up Questions
- Assumptions

## Extending it

- Add a new deterministic tool in `src/launch-desk/tools.js`.
- Register it in `src/launch-desk/agent.js`.
- Update the prompt to tell the agent when to use it.
- If the UI needs a new panel, wire it into `dashboard/pages/LaunchDeskPage.tsx`.
