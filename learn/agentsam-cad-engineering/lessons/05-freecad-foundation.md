# Module 05 — FreeCAD foundation (architecture, not UI clone)

**Time:** 45 min study  
**Repo:** https://github.com/FreeCAD/FreeCAD

## AgentSam rule

**FreeCAD is a backend engine first.** Do not recreate FreeCAD's UI in React. Run headless scripts; store FCStd + STEP; preview GLB when possible.

## What to study in FreeCAD (conceptual)

| Concept | Why it matters for IAM |
|---------|------------------------|
| Document model | One `.FCStd` = tree of objects |
| Parametric history | Features recompute when params change |
| Workbenches | Modular capability (Part, PartDesign, TechDraw, Arch, BIM) |
| Python macros | Agent-generated automation |
| FreeCADCmd | Headless batch execution on runner |

## IAM already has FreeCAD paths

| Asset | Path |
|-------|------|
| Shell runner | `scripts/designstudio/run-freecad.sh` |
| BIM export script | `scripts/designstudio/freecad-bim-export-with-sidecar.py` |
| API | `POST /api/cad/freecad/script`, `/api/cad/freecad/execute` |
| Container | `iam-cad-worker` apt installs `freecad` |
| Known gap | STEP-only output → `freecad_output_step_only` (no GLB ingest) |

## Headless execution pattern

```bash
# IAM pattern (see run-freecad.sh)
freecadcmd -c /path/to/generated_script.py
```

Agent-generated Python for FreeCAD should:

1. Create document objects programmatically
2. Export STL (for GLB pipeline) **or** STEP (for manufacturing)
3. Save FCStd to output path for editable round-trip

## Study upstream architecture (reading, not copying C++)

- `src/Mod/` — workbench modules
- Python API docs: https://wiki.freecad.org/Python_scripting_tutorial
- App vs Gui separation — runner uses **App** only

## Lab checklist

- [ ] Read `scripts/designstudio/run-freecad.sh`
- [ ] Read `freecad-bim-export-with-sidecar.py` — note sidecar JSON pattern
- [ ] If FreeCAD installed locally: run FreeCAD smoke:

```bash
./scripts/designstudio/freecad-smoke.sh   # if on configured host
```

- [ ] Trace `src/api/cad.js` → FreeCAD job creation
- [ ] List exports IAM should support: FCStd, STEP, STL, GLB (via Blender)

## AgentSam takeaway

| User need | Engine |
|-----------|--------|
| Quick printable part | OpenSCAD + BOSL2 |
| Editable mechanical doc | FreeCAD macro → FCStd |
| Manufacturing exchange | STEP from FreeCAD |
| Architecture massing | FreeCAD Arch/BIM (module 07) |

## Next module

→ `06-freecad-library-and-macros.md`
