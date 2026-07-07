# Module 12 — Clone-first checklist + local setup

**Time:** 2–4 hours (one sitting)  
**Goal:** Reproduce the study stack locally so AgentSam CAD work references **real repos**, not hallucinated APIs.

## Directory layout (recommended)

```bash
mkdir -p ~/cad-study/{openscad-libs,templates,freecad,python-cad}
cd ~/cad-study
```

## Clone order (matches ship priority)

Run from `~/cad-study`:

```bash
# 1 — OpenSCAD abstraction (required)
git clone --depth 1 https://github.com/BelfrySCAD/BOSL2.git openscad-libs/BOSL2

# 2–3 — Parametric product generators
git clone --depth 1 https://github.com/ostat/gridfinity_extended_openscad.git templates/gridfinity-extended
git clone --depth 1 https://github.com/kennetek/gridfinity-rebuilt-openscad.git templates/gridfinity-rebuilt

# 4–5 — FreeCAD patterns
git clone --depth 1 https://github.com/FreeCAD/FreeCAD-macros.git freecad/macros
git clone --depth 1 https://github.com/FreeCAD/FreeCAD-library.git freecad/library

# 6–7 — BIM + assemblies (study)
git clone --depth 1 https://github.com/yorikvanhavre/BIM_Workbench.git freecad/BIM_Workbench
git clone --depth 1 https://github.com/leoheck/FreeCAD_Assembly4.1.git freecad/Assembly4.1

# 8–10 — Python CAD + preview UX
git clone --depth 1 https://github.com/CadQuery/cadquery.git python-cad/cadquery
git clone --depth 1 https://github.com/CadQuery/CQ-editor.git python-cad/CQ-editor
git clone --depth 1 https://github.com/gumyr/build123d.git python-cad/build123d
git clone --depth 1 https://github.com/bernhard-42/vscode-ocp-cad-viewer.git python-cad/vscode-ocp-cad-viewer

# Reference map (no clone required — bookmark)
# https://github.com/openscad/awesome-openscad
# https://github.com/openscad/MCAD
```

## Toolchain install

### macOS (dev machine)

```bash
brew install openscad          # or download app bundle
brew install --cask freecad    # optional GUI
pip3 install cadquery build123d
```

### Ubuntu (matches iam-cad-worker)

```bash
sudo apt-get update
sudo apt-get install -y openscad blender freecad
pip3 install cadquery build123d
```

### IAM repo checks

```bash
cd /path/to/inneranimalmedia
npm run designstudio:check
npm run designstudio:smoke     # requires local openscad + blender
```

## Environment variables

```bash
# OpenSCAD library path (adjust to your clone root)
export OPENSCADPATH="$HOME/cad-study/openscad-libs/BOSL2:$OPENSCADPATH"

# Optional: IAM fixture smoke
export IAM_REPO=/path/to/inneranimalmedia
```

## Verification matrix

| Check | Command | Pass criteria |
|-------|---------|---------------|
| BOSL2 | `openscad -o /tmp/t.stl -D '$fn=24' - <<<'include<BOSL2/std.scad>; cuboid([10,10,10]);'` | STL written |
| Gridfinity | Open customizer on cloned `.scad` | Preview renders |
| IAM chess | `$IAM_REPO/scripts/designstudio/run-openscad.sh $IAM_REPO/scripts/designstudio/fixtures/chess-board.scad /tmp/chess.stl` | Exit 0 |
| CadQuery | Module 09 smoke script | `/tmp/cq-box.stl` exists |
| build123d | Module 09 smoke script | `/tmp/b123d-box.stl` exists |
| Runner | `$IAM_REPO/npm run designstudio:runner` (with D1 creds) | Jobs drain from pending |

## Link clones to IAM runner (future ops)

When vendoring for production:

1. Add submodule or COPY in `containers/iam-cad-worker/Dockerfile`
2. Pin commit SHA in migration or `agentsam_cad_templates` notes
3. Record license per vendor (BOSL2 BSD-2, Gridfinity check upstream)
4. Set `OPENSCADPATH` in `cad-job-runner.mjs` and container entrypoint

## Study schedule (suggested)

| Day | Modules | Clone |
|-----|---------|-------|
| 1 | 00–01 | BOSL2 |
| 2 | 03–04 | Gridfinity both |
| 3 | 05–06 | FreeCAD-library, macros |
| 4 | 07–08 | BIM_Workbench, Assembly4 (read-only) |
| 5 | 09–10 | cadquery, build123d, CQ-editor docs |
| 6 | 11–12 | IAM E2E proof |

## Capstone

Produce one artifact through the **real IAM pipeline**:

1. BOSL2-based parametric part (not chess-board raw SCAD)
2. Submit via Design Studio Creation lane or `illustration_create`
3. Runner produces GLB on R2
4. Load in `/dashboard/designstudio`
5. Document params JSON for repeatability

## Course complete

Return to `docs/platform/design-cad-draw-inventory-2026-07.md` — pick the next P0 gap and ship one template.
