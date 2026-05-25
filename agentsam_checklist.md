# Agent Sam — Audit Checklist
_Generated: 2026-05-16 03:39_

## UNBLOCK
- [ ] Fix classifyIntent() to return classified results.
- [ ] Call selectAutoModel() in the appropriate workflow.
- [ ] Ensure Provider waterfall executes in the correct order.
- [ ] Implement frontend data pumping to tables instead of seeding.
- [x] Review agentsam_slash_commands for redundancy and consolidate (migration 410 → agentsam_commands).

## WIRE
- [ ] Wire agentsam_approval_queue to the workflow lifecycle.
- [ ] Connect agentsam_compaction_events to RAG rollup process.
- [ ] Link agentsam_context_digest to the appropriate workflows.
- [ ] Integrate agentsam_guardrail_events into the system once stable.
- [ ] Define routes for agentsam_user_feature_override.

## BUILD
- [ ] Create agentsam_model_routing_rules in D1.
- [ ] Implement prompt caching in agentsam_prompt_cache_keys.
- [ ] Develop real versioning for agentsam_prompt_versions.
- [ ] Build functional routing in agentsam_prompt_routes.
- [ ] Establish a subagent_python_primeaux for agentsam_subagent_profile.
- [ ] Set up triggers and conditions for agentsam_workflows.
- [ ] Implement Thompson Sampling calls in agentsam_routing_arms.
- [ ] Define promotion thresholds for agentsam_eval_runs.

## REFINE
- [ ] Optimize agentsam_workflows for agentic workforce capabilities.
- [ ] Enhance agentsam_workflow_runs with additional observability metrics.
- [ ] Improve agentsam_workflow_nodes for better node type handling.
- [ ] Refine agentsam_workflow_edges to better manage conditions.
- [ ] Review and enhance agentsam_skill_revision for clarity.

## CUT
- [ ] Merge agentsam_artifact_skills into agentsam_skill.
- [ ] Drop agentsam_guardrail_rulesets until system stabilizes.
- [ ] Eliminate agentsam_capability_aliases if redundant.
- [ ] Remove agentsam_skill_revision if confirmed redundant.
