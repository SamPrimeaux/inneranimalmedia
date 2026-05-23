#!/usr/bin/env python3
"""Seed Thompson routing arms + workflow handlers/nodes (D1 REST API). Idempotent."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date

TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN")
if not TOKEN:
    sys.exit("ERROR: CLOUDFLARE_API_TOKEN not set")

ACCOUNT_ID = "ede6590ac0d2fb7daf155b35653457b2"
DB_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database"
TENANT = "tenant_sam_primeaux"
WORKSPACE = "ws_inneranimalmedia"
TODAY = date.today().isoformat()
NOW = int(time.time())


def d1(sql: str, params: list | None = None) -> list:
    body: dict = {"sql": sql}
    if params:
        body["params"] = params
    req = urllib.request.Request(
        f"{BASE}/{DB_ID}/query",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode()[:2000]) from e
    if not resp.get("success"):
        raise RuntimeError(resp.get("errors", resp))
    return resp["result"][0].get("results", [])


def upsert_arm(arm: dict) -> None:
    task_type = arm.get("task_type") or arm["intent_slug"]
    mode = arm.get("mode", "agent")
    model_key = arm["model_key"]
    agent_slug = arm.get("agent_slug", "")

    existing = d1("SELECT id FROM agentsam_routing_arms WHERE id=?", [arm["id"]])
    if existing:
        print(f"  SKIP  arm → {arm['id']}")
        return

    composite = d1(
        """SELECT id FROM agentsam_routing_arms
           WHERE workspace_id=? AND task_type=? AND mode=? AND model_key=? AND COALESCE(agent_slug,'')=?""",
        [WORKSPACE, task_type, mode, model_key, agent_slug],
    )
    if composite:
        d1(
            """UPDATE agentsam_routing_arms
               SET intent_slug=?, priority=?, reasoning_effort=?,
                   supports_tools=?, fallback_model_key=?, is_eligible=1, is_active=1, updated_at=?
               WHERE id=?""",
            [
                arm["intent_slug"],
                arm.get("priority", 50),
                arm.get("reasoning_effort", "medium"),
                arm.get("supports_tools", 1),
                arm.get("fallback", "gpt-5.4-nano"),
                NOW,
                composite[0]["id"],
            ],
        )
        print(f"  PATCH {composite[0]['id']:22s} → intent_slug={arm['intent_slug']}")
        return

    d1(
        """
        INSERT INTO agentsam_routing_arms (
            id, task_type, mode, model_key, provider,
            success_alpha, success_beta,
            cost_n, cost_mean, cost_m2,
            latency_n, latency_mean, latency_m2,
            decayed_score, last_decay_at,
            is_eligible, is_paused, is_active,
            avg_quality_score, quality_n,
            total_executions, intent_slug,
            workspace_id, agent_slug,
            priority, reasoning_effort,
            fallback_model_key, supports_tools,
            tools_json, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        [
            arm["id"],
            task_type,
            mode,
            arm["model_key"],
            arm["provider"],
            1.0,
            1.0,
            0,
            0.0,
            0.0,
            0,
            0.0,
            0.0,
            0.0,
            NOW,
            1,
            0,
            1,
            0.0,
            0,
            0,
            arm["intent_slug"],
            WORKSPACE,
            arm.get("agent_slug", ""),
            arm.get("priority", 50),
            arm.get("reasoning_effort", "medium"),
            arm.get("fallback", "gpt-5.4-nano"),
            arm.get("supports_tools", 1),
            json.dumps(arm.get("tools", [])),
            NOW,
        ],
    )
    print(f"  ARM   {arm['intent_slug']:20s} → {arm['model_key']}")
    time.sleep(0.04)


ARMS = [
    {"id": "arm_cms_typescript", "intent_slug": "cms_routing", "task_type": "cms_routing", "mode": "router", "model_key": "typescript", "provider": "cloudflare_worker", "priority": 60, "supports_tools": 0},
    {"id": "arm_cms_python", "intent_slug": "cms_routing", "task_type": "cms_routing", "mode": "router", "model_key": "python", "provider": "cloudflare_worker", "priority": 40, "supports_tools": 0},
    {"id": "arm_code_qwen_coder_32b", "intent_slug": "code_gen", "task_type": "code_gen", "mode": "agent", "model_key": "@cf/qwen/qwen2.5-coder-32b-instruct", "provider": "workers_ai", "priority": 70, "reasoning_effort": "medium"},
    {"id": "arm_code_gpt_oss_120b", "intent_slug": "code_gen", "task_type": "code_gen", "mode": "agent", "model_key": "@cf/openai/gpt-oss-120b", "provider": "workers_ai", "priority": 60, "reasoning_effort": "high"},
    {"id": "arm_code_gpt_oss_20b", "intent_slug": "code_gen", "task_type": "code_gen", "mode": "agent", "model_key": "@cf/openai/gpt-oss-20b", "provider": "workers_ai", "priority": 50, "reasoning_effort": "medium"},
    {"id": "arm_code_mistral_small", "intent_slug": "code_gen", "task_type": "code_gen", "mode": "agent", "model_key": "@cf/mistralai/mistral-small-3.1-24b-instruct", "provider": "workers_ai", "priority": 45, "reasoning_effort": "medium"},
    {"id": "arm_code_mini_baseline", "intent_slug": "code_gen", "task_type": "code_gen", "mode": "agent", "model_key": "gpt-5.4-mini", "provider": "openai", "priority": 55, "reasoning_effort": "medium"},
    {"id": "arm_code_nano_baseline", "intent_slug": "code_gen", "task_type": "code_gen", "mode": "agent", "model_key": "gpt-5.4-nano", "provider": "openai", "priority": 40, "reasoning_effort": "low"},
    {"id": "arm_tool_glm_47_flash", "intent_slug": "tool_use", "task_type": "tool_use", "mode": "agent", "model_key": "@cf/zai-org/glm-4.7-flash", "provider": "workers_ai", "priority": 75, "reasoning_effort": "medium", "supports_tools": 1},
    {"id": "arm_tool_kimi_k26", "intent_slug": "tool_use", "task_type": "tool_use", "mode": "agent", "model_key": "@cf/moonshotai/kimi-k2.6", "provider": "workers_ai", "priority": 70, "reasoning_effort": "high", "supports_tools": 1},
    {"id": "arm_tool_kimi_k25", "intent_slug": "tool_use", "task_type": "tool_use", "mode": "agent", "model_key": "@cf/moonshotai/kimi-k2.5", "provider": "workers_ai", "priority": 55, "reasoning_effort": "medium", "supports_tools": 1},
    {"id": "arm_tool_gemma4_26b", "intent_slug": "tool_use", "task_type": "tool_use", "mode": "agent", "model_key": "@cf/google/gemma-4-26b-a4b-it", "provider": "workers_ai", "priority": 50, "reasoning_effort": "medium", "supports_tools": 1},
    {"id": "arm_tool_nemotron_120b", "intent_slug": "tool_use", "task_type": "tool_use", "mode": "agent", "model_key": "@cf/nvidia/nemotron-3-120b-a12b", "provider": "workers_ai", "priority": 45, "reasoning_effort": "high", "supports_tools": 1},
    {"id": "arm_tool_granite_micro", "intent_slug": "tool_use", "task_type": "tool_use", "mode": "agent", "model_key": "@cf/ibm-granite/granite-4.0-h-micro", "provider": "workers_ai", "priority": 40, "reasoning_effort": "low", "supports_tools": 1},
    {"id": "arm_tool_mini_baseline", "intent_slug": "tool_use", "task_type": "tool_use", "mode": "agent", "model_key": "gpt-5.4-mini", "provider": "openai", "priority": 65, "reasoning_effort": "medium", "supports_tools": 1},
    {"id": "arm_reason_qwq_32b", "intent_slug": "reasoning", "task_type": "reasoning", "mode": "agent", "model_key": "@cf/qwen/qwq-32b", "provider": "workers_ai", "priority": 75, "reasoning_effort": "high"},
    {"id": "arm_reason_deepseek_r1", "intent_slug": "reasoning", "task_type": "reasoning", "mode": "agent", "model_key": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "provider": "workers_ai", "priority": 70, "reasoning_effort": "high"},
    {"id": "arm_reason_gpt_oss_120b", "intent_slug": "reasoning", "task_type": "reasoning", "mode": "agent", "model_key": "@cf/openai/gpt-oss-120b", "provider": "workers_ai", "priority": 65, "reasoning_effort": "high"},
    {"id": "arm_reason_nemotron", "intent_slug": "reasoning", "task_type": "reasoning", "mode": "agent", "model_key": "@cf/nvidia/nemotron-3-120b-a12b", "provider": "workers_ai", "priority": 55, "reasoning_effort": "high"},
    {"id": "arm_reason_mini_baseline", "intent_slug": "reasoning", "task_type": "reasoning", "mode": "agent", "model_key": "gpt-5.4-mini", "provider": "openai", "priority": 60, "reasoning_effort": "high"},
    {"id": "arm_sql_sqlcoder_7b", "intent_slug": "sql", "task_type": "sql", "mode": "agent", "model_key": "@cf/defog/sqlcoder-7b-2", "provider": "workers_ai", "priority": 80, "reasoning_effort": "low"},
    {"id": "arm_sql_qwen_coder", "intent_slug": "sql", "task_type": "sql", "mode": "agent", "model_key": "@cf/qwen/qwen2.5-coder-32b-instruct", "provider": "workers_ai", "priority": 65, "reasoning_effort": "medium"},
    {"id": "arm_sql_glm_flash", "intent_slug": "sql", "task_type": "sql", "mode": "agent", "model_key": "@cf/zai-org/glm-4.7-flash", "provider": "workers_ai", "priority": 55, "reasoning_effort": "low"},
    {"id": "arm_sql_nano_baseline", "intent_slug": "sql", "task_type": "sql", "mode": "agent", "model_key": "gpt-5.4-nano", "provider": "openai", "priority": 50, "reasoning_effort": "low"},
    {"id": "arm_micro_llama32_3b", "intent_slug": "router_micro", "task_type": "router_micro", "mode": "agent", "model_key": "@cf/meta/llama-3.2-3b-instruct", "provider": "workers_ai", "priority": 70, "reasoning_effort": "low"},
    {"id": "arm_micro_llama32_1b", "intent_slug": "router_micro", "task_type": "router_micro", "mode": "agent", "model_key": "@cf/meta/llama-3.2-1b-instruct", "provider": "workers_ai", "priority": 60, "reasoning_effort": "low"},
    {"id": "arm_micro_granite", "intent_slug": "router_micro", "task_type": "router_micro", "mode": "agent", "model_key": "@cf/ibm-granite/granite-4.0-h-micro", "provider": "workers_ai", "priority": 65, "reasoning_effort": "low"},
    {"id": "arm_micro_nano_baseline", "intent_slug": "router_micro", "task_type": "router_micro", "mode": "agent", "model_key": "gpt-5.4-nano", "provider": "openai", "priority": 75, "reasoning_effort": "low"},
    {"id": "arm_master_mini_baseline", "intent_slug": "subagent_master", "task_type": "subagent_master", "mode": "agent", "model_key": "gpt-5.4-mini", "provider": "openai", "priority": 70, "reasoning_effort": "medium", "supports_tools": 1},
    {"id": "arm_master_kimi_k26", "intent_slug": "subagent_master", "task_type": "subagent_master", "mode": "agent", "model_key": "@cf/moonshotai/kimi-k2.6", "provider": "workers_ai", "priority": 65, "reasoning_effort": "high", "supports_tools": 1},
    {"id": "arm_master_gpt_oss_120b", "intent_slug": "subagent_master", "task_type": "subagent_master", "mode": "agent", "model_key": "@cf/openai/gpt-oss-120b", "provider": "workers_ai", "priority": 55, "reasoning_effort": "high", "supports_tools": 1},
    {"id": "arm_master_glm_flash", "intent_slug": "subagent_master", "task_type": "subagent_master", "mode": "agent", "model_key": "@cf/zai-org/glm-4.7-flash", "provider": "workers_ai", "priority": 60, "reasoning_effort": "medium", "supports_tools": 1},
    {"id": "arm_worker_nano_baseline", "intent_slug": "subagent_worker", "task_type": "subagent_worker", "mode": "agent", "model_key": "gpt-5.4-nano", "provider": "openai", "priority": 75, "reasoning_effort": "low", "supports_tools": 1},
    {"id": "arm_worker_glm_flash", "intent_slug": "subagent_worker", "task_type": "subagent_worker", "mode": "agent", "model_key": "@cf/zai-org/glm-4.7-flash", "provider": "workers_ai", "priority": 70, "reasoning_effort": "low", "supports_tools": 1},
    {"id": "arm_worker_granite_micro", "intent_slug": "subagent_worker", "task_type": "subagent_worker", "mode": "agent", "model_key": "@cf/ibm-granite/granite-4.0-h-micro", "provider": "workers_ai", "priority": 60, "reasoning_effort": "low", "supports_tools": 1},
    {"id": "arm_worker_mini_baseline", "intent_slug": "subagent_worker", "task_type": "subagent_worker", "mode": "agent", "model_key": "gpt-5.4-mini", "provider": "openai", "priority": 65, "reasoning_effort": "medium", "supports_tools": 1},
    {"id": "arm_worker_llama32_3b", "intent_slug": "subagent_worker", "task_type": "subagent_worker", "mode": "agent", "model_key": "@cf/meta/llama-3.2-3b-instruct", "provider": "workers_ai", "priority": 50, "reasoning_effort": "low", "supports_tools": 0},
    {"id": "arm_vision_llama32_11b", "intent_slug": "vision", "task_type": "vision", "mode": "agent", "model_key": "@cf/meta/llama-3.2-11b-vision-instruct", "provider": "workers_ai", "priority": 75, "reasoning_effort": "medium"},
    {"id": "arm_vision_llama4_scout", "intent_slug": "vision", "task_type": "vision", "mode": "agent", "model_key": "@cf/meta/llama-4-scout-17b-16e-instruct", "provider": "workers_ai", "priority": 70, "reasoning_effort": "medium"},
    {"id": "arm_vision_uform", "intent_slug": "vision", "task_type": "vision", "mode": "agent", "model_key": "@cf/unum/uform-gen2-qwen-500m", "provider": "workers_ai", "priority": 55, "reasoning_effort": "low", "supports_tools": 0},
    {"id": "arm_vision_llava_7b", "intent_slug": "vision", "task_type": "vision", "mode": "agent", "model_key": "@cf/llava-hf/llava-1.5-7b-hf", "provider": "workers_ai", "priority": 50, "reasoning_effort": "low", "supports_tools": 0},
    {"id": "arm_safety_llama_guard", "intent_slug": "safety", "task_type": "safety", "mode": "agent", "model_key": "@cf/meta/llama-guard-3-8b", "provider": "workers_ai", "priority": 90, "reasoning_effort": "low", "supports_tools": 0},
    {"id": "arm_safety_distilbert", "intent_slug": "safety", "task_type": "safety", "mode": "agent", "model_key": "@cf/huggingface/distilbert-sst-2-int8", "provider": "workers_ai", "priority": 70, "reasoning_effort": "low", "supports_tools": 0},
    {"id": "arm_embed_bge_large", "intent_slug": "embeddings", "task_type": "embeddings", "mode": "embed", "model_key": "@cf/baai/bge-large-en-v1.5", "provider": "workers_ai", "priority": 80, "supports_tools": 0},
    {"id": "arm_embed_bge_small", "intent_slug": "embeddings", "task_type": "embeddings", "mode": "embed", "model_key": "@cf/baai/bge-small-en-v1.5", "provider": "workers_ai", "priority": 70, "supports_tools": 0},
    {"id": "arm_embed_bge_m3", "intent_slug": "embeddings", "task_type": "embeddings", "mode": "embed", "model_key": "@cf/baai/bge-m3", "provider": "workers_ai", "priority": 65, "supports_tools": 0},
    {"id": "arm_embed_qwen3", "intent_slug": "embeddings", "task_type": "embeddings", "mode": "embed", "model_key": "@cf/qwen/qwen3-embedding-0.6b", "provider": "workers_ai", "priority": 55, "supports_tools": 0},
    {"id": "arm_embed_gemma_300m", "intent_slug": "embeddings", "task_type": "embeddings", "mode": "embed", "model_key": "@cf/google/embeddinggemma-300m", "provider": "workers_ai", "priority": 50, "supports_tools": 0},
]

HANDLERS = [
    ("handler_thompson_code_gen", "agent", "agent_llm", "Thompson Code Generation", "Samples intent_slug=code_gen via Beta draw.", {"intent_slug": "code_gen", "fallback_model_key": "gpt-5.4-mini", "min_eligible_arms": 2}, "medium"),
    ("handler_thompson_tool_use", "agent", "agent_llm", "Thompson Tool-Use Agent", "Samples intent_slug=tool_use.", {"intent_slug": "tool_use", "fallback_model_key": "gpt-5.4-mini", "requires_tool_support": True, "min_eligible_arms": 2}, "medium"),
    ("handler_thompson_reasoning", "agent", "agent_llm", "Thompson Reasoning Agent", "Samples intent_slug=reasoning.", {"intent_slug": "reasoning", "fallback_model_key": "gpt-5.4-mini", "min_eligible_arms": 2}, "medium"),
    ("handler_thompson_sql", "agent", "agent_llm", "Thompson SQL Agent", "Samples intent_slug=sql.", {"intent_slug": "sql", "fallback_model_key": "gpt-5.4-nano", "guardrail": "read_only_unless_approved", "min_eligible_arms": 2}, "low"),
    ("handler_thompson_router_micro", "agent", "agent_llm", "Thompson Micro Router", "Samples intent_slug=router_micro.", {"intent_slug": "router_micro", "fallback_model_key": "gpt-5.4-nano", "min_eligible_arms": 2}, "low"),
    ("handler_thompson_subagent_master", "agent", "agent_llm", "Thompson Subagent Master", "Samples intent_slug=subagent_master.", {"intent_slug": "subagent_master", "fallback_model_key": "gpt-5.4-mini", "supports_subagent_spawn": True, "max_subagents": 10, "min_eligible_arms": 2}, "medium"),
    ("handler_thompson_subagent_worker", "agent", "agent_llm", "Thompson Subagent Worker", "Samples intent_slug=subagent_worker.", {"intent_slug": "subagent_worker", "fallback_model_key": "gpt-5.4-nano", "context_isolated": True, "min_eligible_arms": 2}, "low"),
    ("handler_thompson_vision", "agent", "agent_llm", "Thompson Vision Inspector", "Samples intent_slug=vision.", {"intent_slug": "vision", "fallback_model_key": "@cf/meta/llama-3.2-11b-vision-instruct", "requires_vision": True, "min_eligible_arms": 2}, "low"),
    ("handler_bash_execute", "tool", "terminal", "Bash Executor", "Runs shell commands via terminal executor.", {"executor": "bash", "working_dir": "/Users/samprimeaux/agentsam-cms-editor", "timeout_ms": 30000, "dry_run_first": True}, "medium"),
    ("handler_approval_gate", "approval", "approval", "Human Approval Gate", "Blocks until owner approval.", {"approver": "tenant_sam_primeaux", "timeout_ms": 86400000, "notify_channel": "agent_sam_dashboard"}, "high"),
    ("handler_smoke_test", "tool", "eval", "Smoke Test Runner", "Runs smoke validation scripts.", {"executor": "python", "script_dir": "scripts/smoke/", "write_results_to": "agentsam_eval_runs", "min_pass_rate": 0.8}, "low"),
]

WF_ROUTER_KEY = "wf_cms_thompson_router"
WF_ROUTER_ID = "wf_cms_thompson_router"
WF_SPAWN_KEY = "wf_gpt5_4_mini_subagent_spawn_v1"

ROUTER_NODES = [
    (0, "node_scaffold_router", "terminal", "Scaffold router Worker project", "Create agentsam-cms-router/ skeleton", "handler_bash_execute", {"cmd": "mkdir -p /Users/samprimeaux/agentsam-cms-router/src"}),
    (1, "node_seed_arms", "script", "Seed Thompson arms in D1", "Run py2_seed_thompson_arms_full.py", "handler_bash_execute", {"cmd": "./scripts/with-cloudflare-env.sh python3 scripts/audit/py2_seed_thompson_arms_full.py", "idempotent": True}),
    (2, "node_build_sampler", "agent", "Build sampler.py", "Beta sampler — no hardcoded models", "handler_thompson_code_gen", {"intent_slug": "code_gen", "output_file": "src/sampler.py"}),
    (3, "node_build_scorer", "agent", "Build scorer.py", "Feedback loop to routing_arms", "handler_thompson_code_gen", {"intent_slug": "code_gen", "output_file": "src/scorer.py"}),
    (4, "node_build_entry", "agent", "Build entry.py", "Router Worker fetch handler", "handler_thompson_code_gen", {"intent_slug": "code_gen", "output_file": "src/entry.py"}),
    (5, "node_deploy_router", "approval_gate", "Deploy router Worker", "Requires approval", "handler_approval_gate", {"approval_required": True, "risk": "high"}),
    (6, "node_wire_eval_scores", "agent", "Wire eval scores to arms", "Patch scoring.py", "handler_thompson_code_gen", {"intent_slug": "code_gen", "output_file": "evals/lib/scoring.py"}),
    (7, "node_validate", "eval", "Smoke Thompson routing", "Verify usage_events + alpha", "handler_smoke_test", {"script": "scripts/smoke/py_smoke_thompson_routing.py"}),
    (8, "node_enable_live", "approval_gate", "Enable live traffic", "DNS/route approval", "handler_approval_gate", {"risk": "high"}),
]

SPAWN_NODES = [
    (0, "master_agent", "agent", "Thompson Master Coordinator", "Samples subagent_master", "handler_thompson_subagent_master", {"intent_slug": "subagent_master", "fallback_model_key": "gpt-5.4-mini"}),
    (1, "subagent_1_data_reader", "agent", "Subagent 1 — Plan", "Samples subagent_worker", "handler_thompson_subagent_worker", {"intent_slug": "subagent_worker", "task_type": "plan"}),
    (2, "subagent_2_task_processor", "agent", "Subagent 2 — Processor A", "Samples subagent_worker", "handler_thompson_subagent_worker", {"intent_slug": "subagent_worker", "task_type": "process"}),
    (3, "subagent_3_task_processor", "agent", "Subagent 3 — Processor B", "Samples subagent_worker", "handler_thompson_subagent_worker", {"intent_slug": "subagent_worker", "task_type": "process"}),
    (4, "subagent_4_task_processor", "agent", "Subagent 4 — Processor C", "Samples subagent_worker", "handler_thompson_subagent_worker", {"intent_slug": "subagent_worker", "task_type": "process"}),
    (5, "subagent_5_task_processor", "agent", "Subagent 5 — Processor D", "Samples subagent_worker", "handler_thompson_subagent_worker", {"intent_slug": "subagent_worker", "task_type": "process"}),
]


def ensure_router_workflow() -> None:
    existing = d1("SELECT id FROM agentsam_workflows WHERE workflow_key=?", [WF_ROUTER_KEY])
    if existing:
        print(f"  SKIP  workflow → {WF_ROUTER_KEY} ({existing[0]['id']})")
        return
    d1(
        """
        INSERT INTO agentsam_workflows (
            id, tenant_id, workspace_id, workflow_key, display_name, description,
            workflow_type, trigger_type, default_mode, default_task_type,
            risk_level, max_concurrent_nodes, timeout_ms,
            is_active, is_platform_global, created_at_unix
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        [
            WF_ROUTER_ID,
            TENANT,
            WORKSPACE,
            WF_ROUTER_KEY,
            "CMS Thompson Router Buildout",
            "Build agentsam-cms-router Worker with Beta arm selection from agentsam_routing_arms.",
            "agentic",
            "manual",
            "agent",
            "cms_routing",
            "high",
            5,
            600000,
            1,
            1,
            NOW,
        ],
    )
    print(f"  WORKFLOW {WF_ROUTER_KEY}")


def upsert_handler(hkey: str, ntype: str, ekind: str, title: str, desc: str, config: dict, risk: str) -> None:
    existing = d1("SELECT handler_key FROM agentsam_workflow_handlers WHERE handler_key=?", [hkey])
    if existing:
        print(f"  SKIP  handler → {hkey}")
        return
    d1(
        """
        INSERT INTO agentsam_workflow_handlers (
            handler_key, node_type, executor_kind, title, description,
            handler_config_json, risk_level, is_active, tenant_id, workspace_id
        ) VALUES (?,?,?,?,?,?,?,?,?,?)
        """,
        [hkey, ntype, ekind, title, desc, json.dumps(config), risk, 1, TENANT, WORKSPACE],
    )
    print(f"  HANDLER {hkey}")
    time.sleep(0.04)


def upsert_router_node(sort_order: int, node_key: str, node_type: str, title: str, desc: str, handler_key: str, hconfig: dict) -> None:
    existing = d1(
        "SELECT id FROM agentsam_workflow_nodes WHERE workflow_id=? AND node_key=?",
        [WF_ROUTER_ID, node_key],
    )
    if existing:
        d1(
            """UPDATE agentsam_workflow_nodes
               SET handler_key=?, handler_config_json=?, updated_at=datetime('now')
               WHERE workflow_id=? AND node_key=?""",
            [handler_key, json.dumps(hconfig), WF_ROUTER_ID, node_key],
        )
        print(f"  UPDATE {node_key}")
        return
    d1(
        """
        INSERT INTO agentsam_workflow_nodes (
            workflow_id, node_key, node_type, title, description,
            handler_key, handler_config_json,
            risk_level, requires_approval, is_active, sort_order,
            created_at, updated_at, created_at_unix
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),?)
        """,
        [
            WF_ROUTER_ID,
            node_key,
            node_type,
            title,
            desc,
            handler_key,
            json.dumps(hconfig),
            "high" if node_type == "approval_gate" else "medium",
            1 if node_type == "approval_gate" else 0,
            1,
            sort_order,
            NOW,
        ],
    )
    print(f"  NODE  {node_key}")
    time.sleep(0.04)


def main() -> None:
    print("\n── A. Thompson Arms ─────────────────────────────────────────────────")
    for arm in ARMS:
        upsert_arm(arm)
    print(f"\n  Arms processed: {len(ARMS)}")

    print("\n── B. Workflow Handlers ───────────────────────────────────────────")
    for row in HANDLERS:
        upsert_handler(*row)

    print("\n── C. Router workflow + nodes ───────────────────────────────────────")
    ensure_router_workflow()
    for row in ROUTER_NODES:
        upsert_router_node(*row)

    print("\n── D. Spawn workflow nodes (skip if exist) ──────────────────────────")
    spawn_rows = d1("SELECT id FROM agentsam_workflows WHERE workflow_key=?", [WF_SPAWN_KEY])
    if not spawn_rows:
        sys.exit(f"ERROR: missing workflow {WF_SPAWN_KEY}")
    wf_spawn_id = spawn_rows[0]["id"]
    for sort_order, node_key, node_type, title, desc, handler_key, hconfig in SPAWN_NODES:
        existing = d1(
            "SELECT id FROM agentsam_workflow_nodes WHERE workflow_id=? AND node_key=?",
            [wf_spawn_id, node_key],
        )
        if existing:
            print(f"  SKIP  spawn_node → {node_key}")
            continue
        d1(
            """
            INSERT INTO agentsam_workflow_nodes (
                workflow_id, node_key, node_type, title, description,
                handler_key, handler_config_json,
                risk_level, requires_approval, is_active, sort_order,
                created_at, updated_at, created_at_unix
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),?)
            """,
            [
                wf_spawn_id,
                node_key,
                node_type,
                title,
                desc,
                handler_key,
                json.dumps(hconfig),
                "medium",
                0,
                1,
                sort_order,
                NOW,
            ],
        )
        print(f"  SPAWN_NODE  {node_key}")
        time.sleep(0.04)

    print("\n── D2. Router edges ─────────────────────────────────────────────────")
    router_edges = [
        ("node_scaffold_router", "node_seed_arms", "success", 0, False),
        ("node_seed_arms", "node_build_sampler", "success", 0, False),
        ("node_build_sampler", "node_build_scorer", "success", 0, False),
        ("node_build_scorer", "node_build_entry", "success", 0, False),
        ("node_build_entry", "node_deploy_router", "success", 0, False),
        ("node_deploy_router", "node_wire_eval_scores", "success", 0, False),
        ("node_wire_eval_scores", "node_validate", "success", 0, False),
        ("node_validate", "node_enable_live", "success", 0, False),
        ("node_validate", "node_scaffold_router", "failed", 0, True),
    ]
    for src, tgt, from_status, pri, is_fallback in router_edges:
        existing = d1(
            """SELECT id FROM agentsam_workflow_edges
               WHERE workflow_id=? AND from_node_key=? AND to_node_key=?""",
            [WF_ROUTER_ID, src, tgt],
        )
        if existing:
            print(f"  SKIP  router_edge {src}→{tgt}")
            continue
        d1(
            """
            INSERT INTO agentsam_workflow_edges (
                workflow_id, from_node_key, to_node_key,
                condition_type, condition_json, priority, is_fallback, created_at_unix
            ) VALUES (?,?,?,?,?,?,?,?)
            """,
            [
                WF_ROUTER_ID,
                src,
                tgt,
                "status",
                json.dumps({"from_status": from_status}),
                pri,
                int(is_fallback),
                NOW,
            ],
        )
        print(f"  ROUTER_EDGE {src} →[{from_status}]→ {tgt}")
        time.sleep(0.03)

    spawn_edges = [
        ("master_agent", "subagent_1_data_reader", "always", 0, False, "spawn_parallel"),
        ("master_agent", "subagent_2_task_processor", "always", 0, False, "spawn_parallel"),
        ("master_agent", "subagent_3_task_processor", "always", 0, False, "spawn_parallel"),
        ("master_agent", "subagent_4_task_processor", "always", 0, False, "spawn_parallel"),
        ("master_agent", "subagent_5_task_processor", "always", 0, False, "spawn_parallel"),
    ]
    for src, tgt, ctype, pri, is_fallback, label in spawn_edges:
        existing = d1(
            """SELECT id FROM agentsam_workflow_edges
               WHERE workflow_id=? AND from_node_key=? AND to_node_key=?""",
            [wf_spawn_id, src, tgt],
        )
        if existing:
            print(f"  SKIP  spawn_edge → {src}→{tgt}")
            continue
        d1(
            """
            INSERT INTO agentsam_workflow_edges (
                workflow_id, from_node_key, to_node_key,
                condition_type, priority, is_fallback, label, created_at_unix
            ) VALUES (?,?,?,?,?,?,?,?)
            """,
            [wf_spawn_id, src, tgt, ctype, pri, int(is_fallback), label, NOW],
        )
        print(f"  SPAWN_EDGE  {src} → {tgt}")

    lanes: dict[str, int] = {}
    for a in ARMS:
        lanes[a["intent_slug"]] = lanes.get(a["intent_slug"], 0) + 1
    print("\n══════════════════════════════════════════════════════════════════")
    print(f"  Intent lanes: {len(lanes)} | arms in script: {len(ARMS)}")
    for lane, n in sorted(lanes.items()):
        print(f"    {lane:20s} → {n} candidates")
    print("DONE")


if __name__ == "__main__":
    main()
