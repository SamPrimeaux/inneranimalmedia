# Launch Desk Validation Checklist

## Agent behavior

- [ ] The agent asks for missing details when the brief is incomplete.
- [ ] The response includes a prioritized plan.
- [ ] The response includes a risk register with concrete blockers.
- [ ] The response includes an owner checklist.
- [ ] The response includes channel-specific launch copy.
- [ ] The response includes follow-up questions when key details are missing.
- [ ] The agent uses tools before producing the final answer.

## Frontend flow

- [ ] `/dashboard/launch-desk` loads successfully.
- [ ] The intake form accepts a brief, audience, launch date, constraints, and assets.
- [ ] The example payload button populates the form.
- [ ] The stream feed shows tool progress and text deltas.
- [ ] The final plan renders as a readable document.
- [ ] The output can be copied to the clipboard.

## Tool outputs

- [ ] `extract_launch_tasks` returns prioritized tasks and missing details.
- [ ] `check_launch_readiness` returns a rubric score, risks, and recommendation.
- [ ] `build_owner_checklist` returns owner-specific action items.
- [ ] `draft_launch_copy` returns channel-specific suggestions.

## End-to-end streaming

- [ ] Start the worker backend with `OPENAI_API_KEY` available.
- [ ] POST to `/api/launch-desk` from the local environment.
- [ ] Confirm at least one `tool_progress` SSE event.
- [ ] Confirm at least one `text_delta` SSE event.
- [ ] Confirm a `final_output` SSE event.
- [ ] Confirm the worker flushes tracing before request completion.
