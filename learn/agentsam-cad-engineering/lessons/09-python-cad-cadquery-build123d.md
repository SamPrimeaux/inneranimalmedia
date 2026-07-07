# Module 09 — CadQuery + build123d (Python CAD backends)

**Time:** 90 min study · 120 min hands-on  
**Repos:**

- https://github.com/CadQuery/cadquery
- https://github.com/gumyr/build123d

## Why Python CAD for AgentSam

LLMs generate **Python more reliably** than OpenSCAD DSL.

| Engine | Strength | IAM role |
|--------|----------|----------|
| OpenSCAD + BOSL2 | Fast STL generators, customizer ecosystem | ✅ shipped |
| FreeCAD Python | Full CAD documents, BIM | ✅ partial |
| **CadQuery** | BREP/STEP workflows, clean codegen | 🔲 add runner |
| **build123d** | Modern Pythonic API on OCCT | 🔲 add runner |

## CadQuery — study focus

- Workplane API (`workplane()`, `box()`, `fillet()`)
- Selectors (`.faces(">Z")`, edges)
- STEP/STL export
- Assembly of solids before export

### Local smoke

```bash
pip install cadquery
python3 <<'PY'
import cadquery as cq
result = cq.Workplane("XY").box(30, 20, 10).edges("|Z").fillet(2)
cq.exporters.export(result, "/tmp/cq-box.stl")
print("ok", "/tmp/cq-box.stl")
PY
```

## build123d — study focus

- Context managers / builder patterns
- Very readable for agent output
- Same OCCT backend — similar export paths

### Local smoke

```bash
pip install build123d
python3 <<'PY'
from build123d import Box, export_stl
box = Box(30, 20, 10)
export_stl(box, "/tmp/b123d-box.stl")
print("ok")
PY
```

## IAM integration blueprint

### 1. Container image

Add to `containers/iam-cad-worker/Dockerfile`:

```dockerfile
RUN pip3 install cadquery build123d
```

(GCC/OCCT deps may require extra apt packages — validate in build.)

### 2. Runner script

```txt
scripts/designstudio/run-cadquery.py
scripts/designstudio/run-build123d.py
  → input: job script in /work/script.py
  → output: /work/model.stl (+ optional .step)
  → existing: stl-to-glb.py → R2
```

### 3. Router

Extend `illustration_create` / `cad.js`:

```txt
engine: "cadquery" | "build123d"
```

System prompt: Python only, no GUI imports, export STL to known path.

### 4. D1

`agentsam_cad_jobs.engine` column (if not present) or script_type enum.

## When to pick which engine

| Scenario | Engine |
|----------|--------|
| Organizer bin, Gridfinity | OpenSCAD template |
| Rounded enclosure, fillets | BOSL2 or build123d |
| STEP for CNC supplier | CadQuery or FreeCAD |
| BIM / walls | FreeCAD Arch |
| Agent one-shot bracket | build123d or CadQuery |

## Lab checklist

- [ ] Run both local smokes above
- [ ] Compare same 30×20×10 box — line count CadQuery vs build123d vs OpenSCAD
- [ ] Draft `cad.js` prompt addition for `engine: cadquery`
- [ ] List apt/pip deps needed for container PR
- [ ] Propose one template migrated from SCAD to build123d (simple bracket)

## IAM status

**Not in repo today** — zero references. This module is the spec for P3 engine work.

## Next module

→ `10-code-preview-ux.md`
