#!/usr/bin/env python3
"""Meshy API client for local smoke tests (Design Studio dev only).

Production uses Worker src/core/meshy-api.js — do not call this from edge code.
Env: MESHY_API_KEY or MESHYAI_API_KEY (alias for local).
"""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

try:
    import requests
except ImportError:
    print("ERROR: pip install requests", file=sys.stderr)
    sys.exit(1)

BASE = "https://api.meshy.ai"
API_KEY = os.environ.get("MESHYAI_API_KEY") or os.environ.get("MESHY_API_KEY") or ""


class MeshyClientError(Exception):
    def __init__(self, message: str, status: int = 0, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


class MeshyClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = (api_key or API_KEY).strip()
        if not self.api_key:
            raise MeshyClientError("MESHYAI_API_KEY / MESHY_API_KEY not set")
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.headers.update({"Authorization": f"Bearer {self.api_key}"})

    def _request(self, method: str, path: str, **kwargs) -> dict:
        url = f"{BASE}{path}"
        resp = self.session.request(method, url, timeout=kwargs.pop("timeout", 30), **kwargs)
        if resp.status_code == 429:
            raise MeshyClientError("Rate limited (429)", 429)
        if resp.status_code == 402:
            bal = self.get_balance()
            raise MeshyClientError(
                f"Insufficient credits (402). Balance: {bal.get('balance')}",
                402,
                bal,
            )
        if not resp.ok:
            try:
                body = resp.json()
            except Exception:
                body = {"raw": resp.text[:500]}
            raise MeshyClientError(f"HTTP {resp.status_code}: {body}", resp.status_code, body)
        if not resp.text:
            return {}
        return resp.json()

    def get_balance(self) -> dict:
        return self._request("GET", "/openapi/v1/balance")

    def check_balance(self, estimated_cost: int) -> dict:
        bal = self.get_balance()
        balance = int(bal.get("balance") or 0)
        if balance < estimated_cost:
            raise MeshyClientError(
                f"Need {estimated_cost} credits, have {balance}",
                402,
                {"balance": balance, "required": estimated_cost},
            )
        return {"balance": balance, "required": estimated_cost, "ok": True}

    def create_text_to_3d_preview(self, payload: dict) -> str:
        body = {"mode": "preview", **payload}
        body["mode"] = "preview"
        data = self._request("POST", "/openapi/v2/text-to-3d", json=body)
        return str(data["result"])

    def create_text_to_3d_refine(self, preview_task_id: str, **kwargs) -> str:
        body = {"mode": "refine", "preview_task_id": preview_task_id, "enable_pbr": True, **kwargs}
        body["mode"] = "refine"
        data = self._request("POST", "/openapi/v2/text-to-3d", json=body)
        return str(data["result"])

    def get_task(self, task_type: str, task_id: str) -> dict:
        routes = {
            "text-to-3d": "/openapi/v2/text-to-3d",
            "image-to-3d": "/openapi/v1/image-to-3d",
        }
        base = routes.get(task_type, routes["text-to-3d"])
        return self._request("GET", f"{base}/{task_id}")

    def poll_task(self, task_type: str, task_id: str, timeout: int = 300) -> dict:
        elapsed = 0
        delay = 5
        while elapsed < timeout:
            task = self.get_task(task_type, task_id)
            status = task.get("status")
            progress = task.get("progress", 0)
            print(f"  [{task_id[:8]}] {status} {progress}% ({elapsed}s)", flush=True)
            if status == "SUCCEEDED":
                return task
            if status in ("FAILED", "CANCELED"):
                err = task.get("task_error", {}).get("message", status)
                raise MeshyClientError(f"Task {status}: {err}")
            time.sleep(delay)
            elapsed += delay
            delay = min(int(delay * 1.5), 30)
        raise MeshyClientError(f"Timeout after {timeout}s")


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "balance"
    client = MeshyClient()

    if cmd == "balance":
        print(json.dumps(client.get_balance(), indent=2))
        return 0

    if cmd == "preview":
        prompt = " ".join(sys.argv[2:]) or "low poly red fox"
        client.check_balance(20)
        task_id = client.create_text_to_3d_preview({"prompt": prompt})
        print(f"PREVIEW_TASK: {task_id}")
        task = client.poll_task("text-to-3d", task_id)
        print(json.dumps({"task_id": task_id, "status": task.get("status"), "glb": task.get("model_urls", {}).get("glb")}, indent=2))
        return 0

    if cmd == "full":
        prompt = " ".join(sys.argv[2:]) or "low poly red fox"
        client.check_balance(30)
        preview_id = client.create_text_to_3d_preview({"prompt": prompt})
        print(f"PREVIEW: {preview_id}")
        client.poll_task("text-to-3d", preview_id)
        refine_id = client.create_text_to_3d_refine(preview_id)
        print(f"REFINE: {refine_id}")
        task = client.poll_task("text-to-3d", refine_id)
        print(json.dumps({"preview_task_id": preview_id, "refine_task_id": refine_id, "glb": task.get("model_urls", {}).get("glb")}, indent=2))
        return 0

    print("Usage: meshy_client.py [balance|preview [prompt]|full [prompt]]", file=sys.stderr)
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except MeshyClientError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
