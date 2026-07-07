# IAM CAD worker (Cloudflare Container)

Headless **OpenSCAD → Blender → FreeCAD** worker for Design Studio CAD jobs.

Production traffic stays on **ExecOS GCP** until smoke is green and `CAD_DISPATCH_TARGET=container` (or `auto`) is set on the Worker.

## Image

| Property | Value |
|----------|--------|
| Base | Ubuntu 22.04 |
| Toolchain | `openscad`, `blender`, `freecad` (apt) |
| OpenSCAD libs | BOSL2 + gridfinity-rebuilt-openscad at `/opt/openscad-libs` (`OPENSCADPATH`) |
| Templates | `scripts/designstudio/templates/gridfinity-bin/` (IAM v1) |
| Instance type | `standard-2` (6 GiB RAM) recommended |
| Registry tag | `meauxcontainer-cad-worker:cad-v1` |
| Binding | `env.IAM_CAD_WORKER` → DO `IamCadWorkerContainer` |

## Build + deploy

```bash
# Build + push to CF registry (Docker Desktop required)
./scripts/build-iam-cad-worker-container.sh

# Deploy Worker binding (after image push)
npm run deploy:full
```

## Smoke (no production traffic switch)

```bash
# Internal health via Worker (after deploy)
curl -sS -H "X-Internal-Secret: $INTERNAL_API_SECRET" \
  https://inneranimalmedia.com/api/internal/cad-container/health | jq .

# Local Docker smoke (optional)
docker build -f containers/iam-cad-worker/Dockerfile -t iam-cad-worker:local .
docker run --rm -p 8080:8080 iam-cad-worker:local
curl -sS localhost:8080/health | jq .
```

## Dispatch routing

| `CAD_DISPATCH_TARGET` | Behavior |
|-----------------------|----------|
| `gcp` (default) | ExecOS → iam-tunnel VM only |
| `auto` | CF container if healthy, else GCP fallback |
| `container` | CF container only (fail if unavailable) |

Set in Cloudflare dashboard (Worker vars). **Do not enable `container` until smoke passes.**

## API (inside container)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Toolchain probe |
| POST | `/cad/run` | Accept job (202), run pipeline async, callback Worker |

Worker dispatch: `src/core/cad-dispatch.js` → `src/core/iam-cad-worker-container.js`.

## vs iam-sandbox

| | iam-sandbox | iam-cad-worker |
|--|-------------|----------------|
| Base | node:22-alpine | ubuntu:22.04 |
| RAM | basic (1 GiB) | standard-2+ |
| Purpose | Untrusted one-liners | CAD batch jobs |
| Tools | shell only | OpenSCAD, Blender, FreeCAD |

## GCP parity

The same Dockerfile can run on `iam-tunnel` via Docker for a single image across CF + GCP:

```bash
docker build -f containers/iam-cad-worker/Dockerfile -t iam-cad-worker:cad-v1 .
docker run -d --name cad-worker -p 8080:8080 \
  -e INTERNAL_API_SECRET=... \
  -e IAM_WORKER_ORIGIN=https://inneranimalmedia.com \
  iam-cad-worker:cad-v1
```
