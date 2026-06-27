"""
IAM Workflows — durable Agent Sam DAG orchestration (Python Workflows).

Each agentsam_workflow_nodes.handler_key maps to a step.do() that delegates handler
execution to the platform Worker via service binding (registry-driven, not hardcoded).
"""

from __future__ import annotations

import json
from urllib.parse import urlparse

from workers import Request, Response, WorkerEntrypoint, WorkflowEntrypoint
from workers.workflows import NonRetryableError

from dag import sanitize_step_name, topological_node_order

APPROVAL_EVENT_TYPE = "workflow.approval"


def _json_response(payload, status=200):
    return Response.from_json(payload, status=status)


def _parse_json(raw, fallback=None):
    if fallback is None:
        fallback = {}
    if raw is None:
        return fallback
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(str(raw))
        return parsed if isinstance(parsed, dict) else fallback
    except Exception:
        return fallback


async def _platform_fetch(env, path: str, body: dict | None = None, method: str = "POST"):
    platform = getattr(env, "PLATFORM", None)
    if platform is None or not hasattr(platform, "fetch"):
        return None, {"error": "PLATFORM binding missing", "status": 503}

    origin = str(getattr(env, "PLATFORM_ORIGIN", None) or "https://inneranimalmedia.com").rstrip("/")
    p = path if path.startswith("/") else f"/{path}"
    headers = {"Content-Type": "application/json"}
    service_key = getattr(env, "IAM_SERVICE_KEY", None)
    if service_key:
        headers["X-IAM-Service-Key"] = str(service_key)

    init = {"method": method.upper(), "headers": headers}
    if body is not None and method.upper() != "GET":
        init["body"] = json.dumps(body)

    resp = await platform.fetch(Request(f"{origin}{p}", **init))
    text = await resp.text()
    try:
        data = json.loads(text) if text else {}
    except Exception:
        data = {"raw": text}
    return resp, data


class AgentsamDagWorkflow(WorkflowEntrypoint):
    async def run(self, event, step):
        payload = _parse_json(getattr(event, "payload", None) if event else None, {})
        if not payload:
            payload = _parse_json(event.get("payload") if isinstance(event, dict) else None, {})

        run_id = str(payload.get("run_id") or "")
        workflow_key = str(payload.get("workflow_key") or "")
        nodes = payload.get("nodes") or []
        edges = payload.get("edges") or []
        meta = _parse_json(payload.get("workflow_metadata"), {})
        entry_key = meta.get("entry_node_key")
        initial_input = payload.get("input") or {}

        nodes_by_key = {str(n.get("node_key")): n for n in nodes if n.get("node_key")}
        order = topological_node_order(nodes, edges, entry_key)
        if not order:
            raise NonRetryableError("empty workflow graph")

        node_input = initial_input
        resume_from = payload.get("resume_from_node_key")
        if resume_from and resume_from in nodes_by_key:
            idx = order.index(resume_from)
            order = order[idx:]

        for node_key in order:
            node = nodes_by_key.get(node_key)
            if not node:
                continue

            handler_key = str(node.get("handler_key") or "")
            step_name = sanitize_step_name(node_key, handler_key or None)
            captured_key = node_key
            captured_node = node

            @step.do(step_name)
            async def execute_node(captured_key=captured_key, captured_node=captured_node):
                _, result = await _platform_fetch(
                    self.env,
                    "/api/internal/workflow/execute-node",
                    {
                        "run_id": run_id,
                        "workflow_key": workflow_key,
                        "node_key": captured_key,
                        "node": captured_node,
                        "input": node_input,
                        "run_context": payload.get("run_context") or {},
                    },
                )
                if not result:
                    return {"ok": False, "error": "platform_unreachable"}
                if result.get("error") and not result.get("ok"):
                    return result
                return result

            result = await execute_node()
            if not result.get("ok"):
                err = str(result.get("error") or "node_failed")
                await _platform_fetch(
                    self.env,
                    "/api/internal/workflow/finalize-run",
                    {
                        "run_id": run_id,
                        "status": "failed",
                        "kill_reason": err,
                        "step_results": result.get("step_results"),
                    },
                )
                raise NonRetryableError(err)

            if result.get("awaiting_approval"):
                approval_id = result.get("approval_id")
                event_result = await step.wait_for_event(
                    f"approval_{node_key}",
                    APPROVAL_EVENT_TYPE,
                    timeout="7 days",
                )
                decision_payload = _parse_json(event_result, {})
                decision = str(decision_payload.get("decision") or "denied").lower()
                if decision not in ("approved", "approve"):
                    await _platform_fetch(
                        self.env,
                        "/api/internal/workflow/finalize-run",
                        {
                            "run_id": run_id,
                            "status": "failed",
                            "kill_reason": "approval_rejected",
                        },
                    )
                    raise NonRetryableError("approval_rejected")

                next_key = decision_payload.get("next_node_key")
                if next_key and str(next_key) in nodes_by_key:
                    idx = order.index(node_key)
                    tail = order[idx + 1 :]
                    if str(next_key) in tail:
                        order = order[: idx + 1] + tail[tail.index(str(next_key)) :]
                    elif str(next_key) not in order[idx + 1 :]:
                        order = order[: idx + 1] + [str(next_key)] + [
                            k for k in tail if k != str(next_key)
                        ]

                node_input = {
                    "status": "approved",
                    "approval_id": approval_id,
                    **(_parse_json(result.get("output"), {})),
                }
                continue

            node_input = result.get("output") if result.get("output") is not None else result

        await _platform_fetch(
            self.env,
            "/api/internal/workflow/finalize-run",
            {
                "run_id": run_id,
                "status": "completed",
                "output": node_input,
            },
        )
        return {"ok": True, "run_id": run_id, "status": "completed"}


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = urlparse(request.url)
        path = url.path.rstrip("/") or "/"
        method = request.method.upper()

        if path == "/health":
            return _json_response({"ok": True, "service": "iam-workflows", "runtime": "python"})

        if path == "/v1/runs" and method == "POST":
            body = await request.json()
            payload = body.get("payload") if isinstance(body, dict) else {}
            if not payload:
                return _json_response({"error": "payload required"}, status=400)

            wf = getattr(self.env, "IAM_DAG_WORKFLOW", None)
            if wf is None or not hasattr(wf, "create"):
                return _json_response({"error": "IAM_DAG_WORKFLOW binding missing"}, status=503)

            instance = await wf.create(payload={"payload": payload})
            instance_id = getattr(instance, "id", None) or str(instance)
            run_id = str(payload.get("run_id") or "")

            if self.env.DB and run_id:
                row = (
                    await self.env.DB.prepare(
                        "SELECT metadata_json FROM agentsam_workflow_runs WHERE id = ? LIMIT 1"
                    )
                    .bind(run_id)
                    .first()
                )
                meta = _parse_json(row.get("metadata_json") if row else None, {})
                meta["cf_workflow_instance_id"] = instance_id
                meta["execution_engine"] = "durable"
                await (
                    self.env.DB.prepare(
                        "UPDATE agentsam_workflow_runs SET metadata_json = ?, updated_at = datetime('now') WHERE id = ?"
                    )
                    .bind(json.dumps(meta), run_id)
                    .run()
                )

            return _json_response(
                {
                    "ok": True,
                    "run_id": run_id,
                    "instance_id": instance_id,
                    "mode": "durable",
                }
            )

        if path.startswith("/v1/runs/") and path.endswith("/events") and method == "POST":
            parts = path.split("/")
            if len(parts) < 4:
                return _json_response({"error": "invalid path"}, status=400)
            instance_id = parts[3]
            body = await request.json()
            event_type = str(body.get("type") or APPROVAL_EVENT_TYPE)
            event_payload = body.get("payload") or body

            wf = getattr(self.env, "IAM_DAG_WORKFLOW", None)
            if wf is None or not hasattr(wf, "get"):
                return _json_response({"error": "IAM_DAG_WORKFLOW binding missing"}, status=503)

            instance = await wf.get(instance_id)
            if instance is None or not hasattr(instance, "send_event"):
                return _json_response({"error": "instance_not_found", "instance_id": instance_id}, status=404)

            await instance.send_event({"type": event_type, "payload": event_payload})
            return _json_response({"ok": True, "instance_id": instance_id, "type": event_type})

        if path.startswith("/v1/runs/") and method == "GET":
            parts = path.split("/")
            if len(parts) < 4:
                return _json_response({"error": "invalid path"}, status=400)
            instance_id = parts[3]

            wf = getattr(self.env, "IAM_DAG_WORKFLOW", None)
            if wf is None or not hasattr(wf, "get"):
                return _json_response({"error": "IAM_DAG_WORKFLOW binding missing"}, status=503)

            instance = await wf.get(instance_id)
            if instance is None:
                return _json_response({"error": "instance_not_found"}, status=404)

            status = getattr(instance, "status", None)
            if callable(status):
                status = await status()
            status_str = str(getattr(status, "state", status) or "unknown")

            return _json_response(
                {
                    "ok": True,
                    "instance_id": instance_id,
                    "status": status_str,
                }
            )

        return _json_response({"error": "not_found", "path": path}, status=404)
