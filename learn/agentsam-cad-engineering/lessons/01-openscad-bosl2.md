# Module 01 — BOSL2: default OpenSCAD abstraction

**Time:** 45 min study · 60 min hands-on  
**Repo:** https://github.com/BelfrySCAD/BOSL2  
**IAM registry:** `agentsam_openscad_libraries.slug = 'bosl2'` (migration 775, priority 1)

## Why BOSL2 matters

Raw OpenSCAD is `cube()` / `cylinder()` / `difference()` hell. BOSL2 turns it into a **parametric mechanical modeling language**:

- Anchors and attachments (`attach()`, `position()`)
- Rounded boxes, fillets, chamfers
- Threading, paths, beziers, sweeps, masks
- Distribute, mirror, hull utilities
- Reusable mechanical patterns

**AgentSam rule:** Generated OpenSCAD should target BOSL2 modules, not reinvent rounding with `minkowski()` every time.

## What to study in the repo

| Area | Path (typical) | Learn |
|------|----------------|-------|
| Std include | `BOSL2/std.scad` | Entry point |
| Rounding | `BOSL2/rounding.scad` | `cuboid()`, edge radii |
| Threading | `BOSL2/threading.scad` | Screw-compatible geometry |
| Paths | `BOSL2/paths.scad`, `beziers.scad` | Sweeps along curves |
| Attachments | docs + `attachments.scad` | Part-to-part positioning |
| Examples | `examples/` | Copy patterns, not syntax |

## Clone and local run

```bash
mkdir -p ~/cad-study && cd ~/cad-study
git clone --depth 1 https://github.com/BelfrySCAD/BOSL2.git

# OpenSCAD must find libraries — set OPENSCADPATH or use -I
export OPENSCADPATH="$HOME/cad-study/BOSL2:$OPENSCADPATH"

cat > /tmp/bosl2-smoke.scad <<'SCAD'
include <BOSL2/std.scad>
cuboid([30, 20, 10], rounding=2, edges="Z");
SCAD

openscad -o /tmp/bosl2-smoke.stl /tmp/bosl2-smoke.scad
```

## IAM integration (today)

1. User intent → `extractCapabilityTags()` in `openscad-library-resolver.js`
2. D1 returns `include <BOSL2/std.scad>` when mechanical tags match
3. LLM system prompt in `cad.js` receives **targeted** library hints, not full dump

## IAM integration (next)

1. **Vendor BOSL2 on runner image** at fixed path (e.g. `/opt/openscad-libs/BOSL2`)
2. Set `OPENSCADPATH` in `cad-job-runner.mjs` and container Dockerfile
3. Template scaffolds that **require** BOSL2 (`cuboid` not `cube`)

## Agent prompt pattern (good)

```txt
Generate OpenSCAD using BOSL2. Include BOSL2/std.scad.
Use cuboid() with rounding for the enclosure body.
Use attach() for mounting ear placement.
Export as single STL-ready union.
```

## Agent prompt pattern (bad)

```txt
Write OpenSCAD for a box with rounded corners using hull and minkowski spheres.
```

## Lab checklist

- [ ] Clone BOSL2
- [ ] Render one `cuboid()` + one threaded or rounded example from upstream docs
- [ ] Grep IAM: `migrations/775_openscad_library_registry.sql` — read BOSL2 row
- [ ] Trace: `openscad-library-resolver.js` → how BOSL2 gets prepended
- [ ] Run chess-board fixture through IAM script (baseline without BOSL2):

```bash
./scripts/designstudio/run-openscad.sh \
  scripts/designstudio/fixtures/chess-board.scad /tmp/chess.stl
```

- [ ] Write a BOSL2 version of a simple tray (30×20×10, 2mm walls) locally

## Concepts quiz

1. Why is BOSL2 P1 in D1 but raw SCAD still appears in fixtures?
2. What breaks if the runner lacks BOSL2 on disk but the prompt includes it?
3. Name three BOSL2 modules you'd use for an M3 screw boss.

## Next module

→ `02-openscad-ecosystem-reference.md`
