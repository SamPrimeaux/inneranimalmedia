# IAM CAD worker (Cloudflare Container)

Headless **OpenSCAD → Blender → FreeCAD** worker for Design Studio CAD jobs.

**Production (LOCKED):** all CAD jobs dispatch here only. No GCP / ExecOS CAD path.  
The `iam-tunnel` VM is always-on terminal/ops — not CAD. See `docs/platform/iam-tunnel-vm-role-2026-07.md`.

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
./scripts/build-iam-cad-worker-container.sh
npm run deploy:full   # Mac
# or npm run ship:remote on GCP (never Vite on iam-tunnel)
```

## Smoke

```bash
curl -sS -H "X-Internal-Secret: $INTERNAL_API_SECRET" \
  https://inneranimalmedia.com/api/internal/cad-container/health | jq .
# expect: ok=true, toolchain_ok=true, dispatch_target=container
```

## Dispatch

`src/core/cad-dispatch.js` → `dispatchCadJobToContainer` only.  
Worker var `CAD_DISPATCH_TARGET=container` is documentary; code ignores gcp/auto.

## API (inside container)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Toolchain probe |
| POST | `/cad/run` | Accept job (202), run pipeline async, callback Worker |

## vs iam-sandbox

| | iam-sandbox | iam-cad-worker |
|--|-------------|----------------|
| Base | node:22-alpine | ubuntu:22.04 |
| RAM | basic (1 GiB) | standard-2+ |
| Purpose | Untrusted one-liners | CAD batch jobs |
| Tools | shell only | OpenSCAD, Blender, FreeCAD |

`scripts/designstudio/cad-job-runner.mjs` remains for local/dev experiments only — not production dispatch.
