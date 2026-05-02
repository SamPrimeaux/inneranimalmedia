# Agent plan: Get telemetry endpoints live

**Purpose:** Cloudflare Workers Observability is configured to push **traces** and **logs** to dataset destinations. Those destinations are currently returning **404** because the receiver URLs are not implemented. This doc tells the AI how to fix it.

---

## Current status (errors)

| Type   | Dataset destination              | Endpoint URL                                                    | Status / error |
|--------|----------------------------------|------------------------------------------------------------------|----------------|
| traces | inneranimalmedia-selfhosted      | `https://inneranimalmedia.com/api/telemetry/v1/traces`          | **404** — error pushing: error uploading to https: status 404 |
| logs   | meauxbility-central-analytics    | `https://meauxbility.org/api/telemetry/otlp/v1/logs`            | **404** — error pushing: error uploading to https: status 404 |

---

## What to do

### 1. Traces (inneranimalmedia.com worker)

- **Host:** inneranimalmedia.com (this repo’s worker: `worker.js`, `wrangler.production.toml`).
- **Path:** `POST /api/telemetry/v1/traces`
- **Expected:** OTLP HTTP request (typically `Content-Type: application/json` or protobuf). Cloudflare sends trace data to this URL. The worker must:
  - Accept `POST` at `/api/telemetry/v1/traces`.
  - Respond with `200` or `204` so the pipeline stops returning 404.
  - Optionally: parse and store traces, or forward to another backend; minimal fix is accept and return 200.

**Implementation options:**

- Add a route in `worker.js`: if `pathLower === '/api/telemetry/v1/traces' && method === 'POST'`, read the body (or ignore it for a minimal stub), return `new Response(null, { status: 204 })` or `jsonResponse({ ok: true }, 200)`.
- For a real pipeline: accept OTLP JSON/protobuf, then forward to your trace backend or write to D1/R2. See [OTLP HTTP spec](https://opentelemetry.io/docs/specs/otlp/#http-protocol) if you need to parse.

### 2. Logs (meauxbility.org)

- **Host:** meauxbility.org (may be a different Worker or same account, different route).
- **Path:** `POST /api/telemetry/otlp/v1/logs`
- **Expected:** OTLP HTTP request for logs. The server that handles meauxbility.org must:
  - Accept `POST` at `/api/telemetry/otlp/v1/logs`.
  - Respond with `200` or `204` so the pipeline stops returning 404.

**Implementation:**

- If meauxbility.org is served by the **same** worker (e.g. a route or zone), add a route: `pathLower === '/api/telemetry/otlp/v1/logs' && method === 'POST'` → accept body, return 204.
- If meauxbility.org is a **different** Worker/project, add the same route in that project’s worker so `/api/telemetry/otlp/v1/logs` exists there.

---

## Config reference (this repo)

- **wrangler.production.toml:** `[observability]`, `[observability.logs]` (destinations = meauxbility-central-analytics), `[observability.traces]` (destinations = inneranimalmedia-selfhosted).
- Destinations and their URLs are configured in the **Cloudflare dashboard** (Workers → Observability → Logs/Traces → Dataset destinations). The URLs above are what the pipeline is trying to push to; they must be implemented on the corresponding hosts.

---

## Format for Claude / Agent Sam

When working on this tomorrow:

1. **Traces:** In the inneranimalmedia worker, add a handler for `POST /api/telemetry/v1/traces`. Return 200/204 so the destination stops 404ing. Optionally implement full OTLP ingest or forward.
2. **Logs:** Ensure `POST /api/telemetry/otlp/v1/logs` is implemented on the host that serves meauxbility.org (this repo or another). Return 200/204 so the destination stops 404ing. Optionally implement full OTLP log ingest or forward.
3. After deploy, re-check the Observability dashboard; the dataset destinations should report success instead of 404.

Store this file in `docs/memory/agent-plans/telemetry-endpoints.md` and reference it from the daily log so the AI has clear instructions.
