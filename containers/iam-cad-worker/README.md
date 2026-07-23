# IAM CAD worker (Cloudflare Container)

Headless **OpenSCAD → Blender → FreeCAD** worker for Design Studio CAD jobs.

**Production (LOCKED):** all CAD jobs dispatch to this container (`CAD_DISPATCH_TARGET=container`).  
The GCP `iam-tunnel` VM is **not** CAD-capable (tiny RAM). See `docs/platform/iam-tunnel-vm-role-2026-07.md`.

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
npm run deploy:full   # Mac
# or npm run ship:remote on GCP (never Vite on iam-tunnel)
```

## Smoke

```bash
curl -sS -H "X-Internal-Secret: $INTERNAL_API_SECRET" \
  https://inneranimalmedia.com/api/internal/cad-container/health | jq .
# expect: ok=true, toolchain_ok=true, dispatch_target=container
```

Local Docker (optional):

```bash
docker build -f containers/iam-cad-worker/Dockerfile -t iam-cad-worker:local .
docker run --rm -p 8080:8080 iam-cad-worker:local
curl -sS localhost:8080/health | jq .
```

## Dispatch routing

| `CAD_DISPATCH_TARGET` | Behavior |
|-----------------------|----------|
| **`container` (production LOCKED)** | CF container only |
| `auto` | Break-glass: container if healthy, else GCP ExecOS |
| `gcp` | Break-glass: ExecOS iam-tunnel only — **not CAD-capable** |

Set in `wrangler.production.toml` `[vars]` (and Cloudflare dashboard if overriding).

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

## Legacy note

`scripts/designstudio/cad-job-runner.mjs` remains for local/dev and break-glass ExecOS one-shots. Production Design Studio traffic must not depend on the GCP VM runner.
