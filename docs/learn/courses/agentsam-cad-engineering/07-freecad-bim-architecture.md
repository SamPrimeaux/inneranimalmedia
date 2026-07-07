# Module 07 — FreeCAD BIM / Arch (shop-house lane)

**Time:** 45 min study  
**Repos:**

- https://github.com/yorikvanhavre/BIM_Workbench  
- FreeCAD Arch docs: https://wiki.freecad.org/Arch_Workbench

## Vision lane

Sam's shop-house, garage, gym, pool area — **concept massing first**, BIM detailing later.

## Layered tooling (upstream model)

| Layer | Tool | IAM mode |
|-------|------|----------|
| Base geometry | Arch Workbench | Walls, slabs, structures |
| UX polish | BIM Workbench | Friendlier BIM workflow on Arch |
| Exchange | IFC (where enabled) | Future client deliverable |

Study how BIM Workbench wraps Arch — **two modes in IAM**, one engine.

## IAM script seed

Already in repo:

```txt
scripts/designstudio/freecad-bim-export-with-sidecar.py
scripts/designstudio/placement/cadj_bimexample311065.placement.json
```

Migrations reference BIM example GLB in `cms_assets` (701, 420 series).

### Study the sidecar pattern

Sidecar JSON carries placement/metadata for Design Studio viewport — decouples FreeCAD export from Three.js spawn.

## AgentSam workflows

### Mode A — Massing (ship first)

```txt
User: "30x40 shop with 12ft walls, one rollup door opening"
  → FreeCAD Arch macro: walls as boxes, opening as boolean
  → Export coarse STL/GLB for viewport
  → Store FCStd for edit round-trip
```

### Mode B — BIM detail (later)

```txt
Spaces, materials, dimensions, IFC export
  → Requires BIM workbench on runner
  → TechDraw for fabrication drawings
```

## Lab checklist

- [ ] Read BIM Workbench README on GitHub
- [ ] Read `freecad-bim-export-with-sidecar.py` end-to-end
- [ ] Inspect `cadj_bimexample311065.placement.json`
- [ ] Load BIM example GLB in Design Studio if URL in D1/cms_assets
- [ ] List 5 Arch objects you'd create for a simple garage massing

## UX honesty

Show **massing GLB** + "Open in FreeCAD" (FCStd download) — not fake wall editor in browser.

## Next module

→ `08-freecad-assemblies.md`
