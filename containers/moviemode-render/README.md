# MY_CONTAINER on inneranimalmedia

**SSOT for production:** `wrangler.production.toml` (`[[containers]]` + `MY_CONTAINER` binding) and `src/core/my-container.js`. If this README disagrees with those files, the code wins — update this doc.

## Canonical production config (2026-06)

| Item | Value |
|------|--------|
| **Registry image** | `registry.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2/inneranimalmedia:sandbox-v3` |
| **Pool / DO instance id** | `inneranimalmedia` (must match worker name) |
| **Worker binding** | `env.MY_CONTAINER` (alias: `env.MOVIEMODE_RENDER` in code paths) |
| **DO class** | `MyContainer` — `src/do/MyContainer.js` |
| **Dispatch / exec / render** | `src/core/my-container.js` |
| **Instance type** | `basic` |
| **Max instances** | `10` |
| **Container port** | `8080` |
| **Sleep after idle** | `30m` (pre-warm cron `*/25 * * * *`) |

### One-paragraph summary

Production uses **one MY_CONTAINER pool** on the `inneranimalmedia` worker: binding `env.MY_CONTAINER`, DO class `MyContainer`, instance name **`inneranimalmedia`**, image **`inneranimalmedia:sandbox-v3`**. The worker probes container **`GET /health`**, sandbox exec via **`POST /exec`**, and MovieMode export via **`POST /render`**; on 404/501/failure it falls back to **`PTY_SERVICE`**. Normal repo file edits use **PTY + filesystem tools** (`fs_read_file` / `fs_write_file`), not the container. **`agentsam_container_exec`** is platform-operator-only.

## Three execution lanes (do not conflate)

| Lane | Binding | Use |
|------|---------|-----|
| **Cloudflare Container** | `MY_CONTAINER` | Sandbox exec, MovieMode render attempt, operator container tools |
| **VPC / PTY** | `PTY_SERVICE` | Mac/GCP workspace, git, file read/write, MovieMode fallback |
| **ExecOS HTTP** | `EXECOS` | CAD/MCP terminal fabric (separate from MY_CONTAINER) |

## Internal worker endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/internal/my-container/health` | Probe container `/health` (internal auth) |
| POST | `/api/internal/my-container/exec` | Run command in container sandbox |
| POST | `/api/internal/my-container/purge-legacy` | Destroy legacy DO instance names |

Routed in `src/core/production-dispatch.js`.

## MovieMode export flow

1. `startRemotionRender` → `tryMoviemodeRenderOnContainer` → `POST http://container/render`
2. On 404, 501, or `fallback: true` → `startRemotionRenderOnPty` via `PTY_SERVICE`
3. See `src/api/moviemode-api.js`

## Legacy / deprecated (doc drift — do not cite)

The following was **wrong in older versions of this README** and may still appear in dashboard clutter or stale RAG:

- Image `meauxcontainer-mycontainer:6d6f76d2`
- Dashboard app label `meauxcontainer-mycontainer` as “orphan” with “7 warm instances, no worker traffic”
- Per-zone container DO ids (`meaux-pool`, `specialist`, `samprimeaux`, …) — purged; pool is **`inneranimalmedia` only**

**Failure mode:** Agent reads this README (or GitHub via `agentsam_github_read`) but stops before applying edits — always cross-check `wrangler.production.toml` + `src/core/my-container.js` before answering container questions.

## Local build (optional — not production today)

`Dockerfile` + `server.mjs` in this folder are for **future** Remotion/ffmpeg builds. Production does **not** use the local Dockerfile stub until a new image is built, pushed, and referenced in `wrangler.production.toml`.

When building a new tag (example — adjust tag to match wrangler after push):

```bash
npx wrangler containers build containers/moviemode-render -t inneranimalmedia:sandbox-v4 -p
```

Then update `[[containers]].image` in `wrangler.production.toml` and `CONTAINER_IMAGE_REF` in `src/core/my-container.js` together.

## Related (separate container — not enabled in prod wrangler)

- **CAD worker:** `meauxcontainer-cad-worker:cad-v1` — `containers/iam-cad-worker/`, binding `IAM_CAD_WORKER` (commented out in `wrangler.production.toml`)
