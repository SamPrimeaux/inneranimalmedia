# Module 03 — Gridfinity: parametric product generators

**Time:** 60 min study · 90 min hands-on  
**Repos (clone first):**

1. https://github.com/ostat/gridfinity_extended_openscad  
2. https://github.com/kennetek/gridfinity-rebuilt-openscad

## Why Gridfinity is the IAM pattern

Gridfinity projects are **OpenSCAD as product generator**, not toy scripting:

```txt
User changes dimensions/options
  → app rewrites params (or customizer variables)
  → OpenSCAD renders
  → STL export / preview
```

This is exactly what Design Studio needs: **params panel → regenerate job → GLB preview**.

## Study: gridfinity_extended_openscad

### Learn

- Online customizer vs local script paths
- Exposed variables (`grid_x`, `grid_y`, height, lip style, etc.)
- Model families (base plate, bin, lid variants)
- How README documents param semantics

### Clone

```bash
cd ~/cad-study
git clone --depth 1 https://github.com/ostat/gridfinity_extended_openscad.git
cd gridfinity_extended_openscad
# Read README + open main .scad in OpenSCAD customizer
```

### AgentSam takeaway

When user says "Gridfinity bin 3×2, 6 units tall, scooped front" — map to **named params**, not rewrite entire SCAD from scratch.

---

## Study: gridfinity-rebuilt-openscad

### Learn

- Ground-up port with many parameter combinations
- Compartments, subdivisions, layout logic
- Scale: many SCAD files vs one mega-parametric file

### Clone

```bash
git clone --depth 1 https://github.com/kennetek/gridfinity-rebuilt-openscad.git ~/cad-study/gridfinity-rebuilt
```

### AgentSam takeaway

Pick **one** upstream as IAM vendor template — do not fork both long-term. Extended is strong for customizer UX; Rebuilt for compartment complexity.

---

## IAM target template shape

Proposed path: `scripts/designstudio/templates/organizers/gridfinity-bin/`

```txt
template.json          # param schema (IAM UI + agent)
gridfinity-bin.scad    # vendor or adapted SCAD
defaults.json          # shipped defaults
README.md              # attribution + license
```

Example `template.json` fields:

```json
{
  "slug": "gridfinity-bin",
  "engine": "openscad",
  "libraries": ["bosl2"],
  "params": {
    "grid_x": { "type": "int", "min": 1, "max": 6, "default": 2 },
    "grid_y": { "type": "int", "min": 1, "max": 6, "default": 2 },
    "height_units": { "type": "number", "default": 6 },
    "scooped_front": { "type": "bool", "default": false }
  }
}
```

Flow:

1. UI or agent sets params JSON
2. Worker/template renderer substitutes into SCAD (or passes `-D` flags)
3. Existing runner: OpenSCAD → STL → GLB

---

## Lab checklist

- [ ] Clone both Gridfinity repos
- [ ] Generate one bin STL locally with customizer or `-D` defines
- [ ] Document 8 params you'd expose in IAM UI
- [ ] Run through IAM pipeline (manual SCAD paste OK for now):

```bash
# Save customized .scad as /tmp/gridfinity-test.scad
./scripts/designstudio/run-openscad.sh /tmp/gridfinity-test.scad /tmp/gf.stl
python3 scripts/designstudio/stl-to-glb.py /tmp/gf.stl /tmp/gf.glb
```

- [ ] Note license on chosen upstream — confirm commercial_safe for IAM clients

## UX wireframe (honest)

```txt
┌─────────────────────────────────────┐
│ Gridfinity Bin          [Generate]  │
├──────────────┬──────────────────────┤
│ grid_x: 2    │                      │
│ grid_y: 3    │   GLB preview        │
│ height: 6    │   (from job)         │
│ scoop: on    │                      │
├──────────────┴──────────────────────┤
│ [Download STL] [Download GLB]       │
└─────────────────────────────────────┘
```

No fake drag handles on the mesh — params drive regeneration.

## Next module

→ `04-domain-specific-generators.md`
