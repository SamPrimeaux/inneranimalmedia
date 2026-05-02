# Design Studio scripts

Local toolchain for **OpenSCAD → STL → GLB** and **R2 upload**. These run on a developer machine or on a **remote runner** host — not inside the Cloudflare Worker.

## Prerequisites

- [OpenSCAD](https://openscad.org/)
- [Blender](https://www.blender.org/) (batch mode)
- Python 3 (for `stl-to-glb.py`)
- Optional: FreeCAD CLI (`FreeCADCmd`)

Set `OPENSCAD_BIN`, `BLENDER_BIN`, `FREECAD_BIN` if binaries are not on `PATH`.

## Scripts

| Script | Purpose |
|--------|---------|
| `lib.sh` | Sourced by other scripts; resolves tool paths |
| `local-check.sh` | Print versions / exit 1 if required tools missing |
| `run-openscad.sh` | `input.scad` → `output.stl` |
| `stl-to-glb.py` | `input.stl` → `output.glb` via Blender `--background` |
| `run-blender-glb.sh` | Wrapper calling `stl-to-glb.py` |
| `freecad-check.sh` | Exit 0 if FreeCAD CLI found |
| `pipeline-smoke.sh` | Temp dir; minimal cube `.scad` → `.stl` → `.glb` |
| `upload-asset.sh` | `wrangler r2 object put` to bucket `inneranimalmedia` |

## Repo root NPM shortcuts

```bash
npm run designstudio:check
npm run designstudio:smoke
```

## Wrangler

Uploads use `./scripts/with-cloudflare-env.sh` and `-c wrangler.jsonc` (same pattern as dashboard deploy scripts).

## Fixtures (OpenSCAD)

`fixtures/chess-board.scad` — first E2E proof asset (see `fixtures/README.md` and `E2E-TEST-PIPELINE.md`).

## Full plan

See `docs/inneranimalmedia/product/designstudio/PIPELINE.md` and `E2E-TEST-PIPELINE.md`.
