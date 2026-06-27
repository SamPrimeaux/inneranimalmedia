# iam-workflows

Durable Agent Sam workflow orchestration on **Cloudflare Python Workflows**.

## Architecture

| Layer | Role |
|-------|------|
| **iam-workflows** (this service) | `WorkflowEntrypoint` walks the D1 graph; each node → `@step.do(name=handler_key)` |
| **inneranimalmedia** | Handler registry SSOT — `POST /api/internal/workflow/execute-node` runs `dispatchNode()` |
| **agentsam_workflows.metadata_json** | `execution_engine`: `sse` \| `durable` \| `auto` |

Handler logic is **never** duplicated in Python. Python only orchestrates; JS executes nodes via the registry.

## Metadata

Set on any workflow row:

```json
{
  "execution_engine": "durable",
  "entry_node_key": "start"
}
```

- `sse` — default; fast in-Worker SSE (backward compatible)
- `durable` — CF Workflows via this service
- `auto` — durable when `requires_approval`, high/critical risk, or >10 nodes

Per-run override: `POST /api/agentsam/workflows/:id/run` body `{ "execution_engine": "durable" }`.

## Local dev

```bash
./scripts/setup_iam_workflows.sh
cd services/iam-workflows && uv run pywrangler dev --port 8789
```

## Deploy

```bash
./scripts/deploy_iam_workflows.sh
```

Requires `.env.cloudflare` with `CLOUDFLARE_API_TOKEN` (or break-glass token bridged by your env loader).

Both workers need `IAM_SERVICE_KEY` secret for service-binding auth.

## Routes

- `workflows.inneranimalmedia.com/health`
- `POST /v1/runs` — create workflow instance
- `POST /v1/runs/:id/events` — approval resume events
- `GET /v1/runs/:id` — instance status
