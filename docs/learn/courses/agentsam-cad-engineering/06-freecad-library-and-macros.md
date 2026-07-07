# Module 06 — FreeCAD-library + FreeCAD-macros

**Time:** 60 min  
**Repos:**

- https://github.com/FreeCAD/FreeCAD-library  
- https://github.com/FreeCAD/FreeCAD-macros

## Two complementary patterns

| Repo | Pattern | IAM analog |
|------|---------|------------|
| **FreeCAD-library** | Reusable part catalog (.FCStd) | R2 + `cms_assets` CAD parts |
| **FreeCAD-macros** | Small automation scripts | AgentSam-generated `.py` / `.FCMacro` |

---

## FreeCAD-library — parts catalog

### Study

- How parts are organized (fasteners, profiles, bearings)
- Metadata: name, category, preview
- `.FCStd` as portable part file

### IAM R2 asset model (target)

```txt
cad/parts/{slug}/
  source.FCStd
  preview.png
  metadata.json    # tags, dims, license, export_formats
  exports/
    part.stl
    part.step
```

Link to `cms_assets` categories `3d_studio`, `3d_studio_user`.

### AgentSam use

"Insert M8 bolt from catalog" → resolve asset by tag → append to assembly job — not regenerate bolt geometry.

---

## FreeCAD-macros — agent execution method

### Study

- Macro structure: selection → operation → export
- Addon Manager peer-review pattern
- Single-purpose tools (one job, one script)

### IAM integration

1. Agent generates FreeCAD Python macro from user intent
2. Job stored in `agentsam_cad_jobs.script_body`
3. Runner executes via `freecadcmd`
4. Outputs: FCStd + STL → GLB pipeline

### Prompt pattern

```txt
Write a FreeCAD Python script for FreeCADCmd (no GUI).
Create a 100mm x 40mm L-bracket, 4mm thick, two M4 clearance holes.
Export bracket.stl and save bracket.FCStd to /output/
```

---

## Clone setup

```bash
cd ~/cad-study
git clone --depth 1 https://github.com/FreeCAD/FreeCAD-library.git
git clone --depth 1 https://github.com/FreeCAD/FreeCAD-macros.git
```

Browse 3 macros + 3 parts — note parametric vs static.

---

## Lab checklist

- [ ] Clone both repos
- [ ] Open one FCStd from library in FreeCAD GUI (if available)
- [ ] Read one macro — list API calls used (`Part.makeBox`, etc.)
- [ ] Map one library part to proposed `cms_assets` row fields
- [ ] Test IAM API path (authenticated):

```txt
POST /api/cad/freecad/script
Body: { "prompt": "...", "workspace_id": "..." }
```

- [ ] Document fix for STEP-only jobs: require STL export in macro for GLB preview

## Security note

Runner must not execute arbitrary shell — only structured job payloads with hashed scripts (see `PIPELINE.md`).

## Next module

→ `07-freecad-bim-architecture.md`
