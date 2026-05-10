# Agent Sam Routing + Workflow Live D1 Inspection

This folder captures live remote D1 schema/sample output for the Agent Sam routing and workflow execution layer.

Important table groups:

## Thompson / model routing
- agentsam_prompt_routes
- agentsam_route_requirements
- agentsam_routing_arms
- agentsam_model_routing_memory
- agentsam_model_drift_signals
- agentsam_model_catalog

## Workflow graph
- agentsam_workflows
- agentsam_workflow_nodes
- agentsam_workflow_edges
- agentsam_workflow_runs
- agentsam_mcp_workflows

## Execution graph
- agentsam_execution_steps
- agentsam_execution_dependency_graph
- agentsam_execution_performance_metrics

## Hooks
- agentsam_hook
- agentsam_hook_execution

Rules:
- Routing decisions must use canonical agentsam_model_catalog.model_key.
- Raw provider IDs belong only in provider_model_id/model telemetry fields.
- Workers AI should be fallback/last-resort unless a route explicitly allows it.
- **`gpt-5.5` (base)** is not available to the API project; routing code excludes that key. **`gpt-5.5-pro`** may appear in catalog but should remain **`is_active = 0`** until smoke-tested and intentionally enabled.
- Thompson routing state should update after each completed run using success, quality, latency, cost, and failure signals.
