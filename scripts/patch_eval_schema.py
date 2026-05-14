#!/usr/bin/env python3
"""
patch_eval_schema.py — corrects EXPECTED_COLUMNS in eval_pipeline_e2e.py
to match actual remote D1 schema (from PRAGMA table_info output).
"""
from pathlib import Path

TARGET = Path("scripts/eval_pipeline_e2e.py")
text   = TARGET.read_text()

OLD = '''\
EXPECTED_COLUMNS = {
    "agentsam_agent_run":     {"id","tenant_id","user_id","workspace_id","session_id","status","started_at","created_at"},
    "agentsam_workflow_runs": {"id","tenant_id","workspace_id","status","started_at","created_at","input_tokens","output_tokens","cost_usd"},
    "agentsam_execution_steps":{"id","node_key","node_type","status","created_at"},
    "agentsam_plan_tasks":    {"id","plan_id","title","status","priority","order_index","created_at"},
    "agentsam_usage_events":  {"id","tenant_id","workspace_id","model","tokens_in","tokens_out","cost_usd","created_at"},
    "agentsam_command_run":   {"id","tenant_id","workspace_id","selected_command_slug","success","created_at"},
    "agentsam_tool_call_log": {"id","tenant_id","tool_name","success","created_at"},
    "agentsam_routing_arms":  {"id","task_type","mode","model_key","success_alpha","success_beta","workspace_id"},
    "agentsam_model_routing_memory": {"workspace_id","task_type","model_key","success_rate","sample_n"},
}'''

NEW = '''\
EXPECTED_COLUMNS = {
    # session_id does not exist on agentsam_agent_run (uses work_session_id)
    "agentsam_agent_run":     {"id","tenant_id","user_id","workspace_id","status","started_at","created_at"},
    "agentsam_workflow_runs": {"id","tenant_id","workspace_id","status","started_at","created_at","input_tokens","output_tokens","cost_usd"},
    "agentsam_execution_steps":{"id","node_key","node_type","status","created_at"},
    "agentsam_plan_tasks":    {"id","plan_id","title","status","priority","order_index","created_at"},
    "agentsam_usage_events":  {"id","tenant_id","workspace_id","model","tokens_in","tokens_out","cost_usd","created_at"},
    "agentsam_command_run":   {"id","tenant_id","workspace_id","selected_command_slug","created_at"},
    # success does not exist on agentsam_tool_call_log (uses status column instead)
    "agentsam_tool_call_log": {"id","tenant_id","tool_name","status","created_at"},
    "agentsam_routing_arms":  {"id","task_type","mode","model_key","success_alpha","success_beta","workspace_id"},
    "agentsam_model_routing_memory": {"workspace_id","task_type","model_key","success_rate","sample_n"},
}'''

if OLD not in text:
    print("WARN: EXPECTED_COLUMNS block not found — may have changed.")
else:
    TARGET.write_text(text.replace(OLD, NEW))
    print("✅ Fixed EXPECTED_COLUMNS in eval_pipeline_e2e.py")
