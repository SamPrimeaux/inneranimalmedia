# Module 02 — OpenSCAD ecosystem reference (MCAD, OMDL, awesome-openscad)

**Time:** 30 min map · optional deep dives  
**Use:** Reference layer — **not** IAM's primary abstraction

## Purpose

BOSL2 is the default. This module maps **secondary** OpenSCAD ecosystems so AgentSam and builders know when to reach beyond BOSL2 — and when not to.

---

## 1. OpenSCAD / MCAD

**Repo:** https://github.com/openscad/MCAD  
**IAM registry:** check `775` for MCAD-related slugs if seeded

### What it is

Older mechanical design library: gears, bearings, fasteners, motors, mockup primitives.

### Study for

- Gear tooth patterns
- Standard mechanical mockup vocabulary
- Legacy scripts you may encounter in the wild

### AgentSam takeaway

Useful **reference**, not the future-facing abstraction. Prefer BOSL2 + targeted libs (threads.scad, catchnhole) over MCAD for new IAM templates.

### Quick clone

```bash
git clone --depth 1 https://github.com/openscad/MCAD.git ~/cad-study/MCAD
```

---

## 2. OMDL — OpenSCAD Mechanical Design Library

**Repo:** search awesome-openscad or GitHub for current OMDL maintainer  
**Concept:** Reusable fabrication-oriented primitives

### Study for

- How serious libraries **organize modules** (`/parts`, `/utils`, `/hardware`)
- Fabrication-oriented naming (clearance, tap, wall thickness)

### AgentSam takeaway

Inspiration for IAM internal layout:

```txt
scripts/designstudio/templates/openscad/
  enclosures/
  organizers/
  brackets/
  shared/
```

---

## 3. awesome-openscad

**Repo:** https://github.com/openscad/awesome-openscad

### What it is

Curated map: robotics CAD, joinery, generators, woodworking joints, domain projects.

### High-value entries to skim

| Category | Example use for IAM |
|----------|---------------------|
| Robotics | MuSHR racecar — full parametric chassis pattern |
| Joinery | Laser/CNC joint generators |
| Organizers | Gridfinity family (module 03) |
| Enclosures | YAPP-style boxes (already in D1 registry) |
| Domain | keyboard_parts (module 04) |

### AgentSam takeaway

Use awesome-openscad as a **template category roadmap**:

```txt
enclosures · organizers · brackets · mounts · fixtures
robotics · joints · signs · badges · architecture massing
```

Do not try to integrate every link — pick categories that match IAM products (shop, garage, Meaux Games, client enclosures).

---

## 4. IAM D1 registry (already curated)

Migration `775` includes 26 libraries beyond BOSL2, e.g.:

| Slug | When |
|------|------|
| `threads_scad` | Metric threads, hex bolts |
| `catchnhole` | Nut traps, screw holes |
| `yapp_box` | PCB project boxes |
| `round_anything` | Light rounding without full BOSL2 |
| `tray_lib` | Drawer inserts |
| `marks_enclosure_helper` | GPL — commercial caution |

Read full seed: `migrations/775_openscad_library_registry.sql`

Resolver: `src/core/openscad-library-resolver.js`

---

## Lab checklist

- [ ] Skim awesome-openscad README — list 5 categories IAM should ship first
- [ ] Compare one MCAD gear example vs BOSL2 approach — note verbosity
- [ ] Query (or read migration) `agentsam_openscad_libraries` — count commercial_safe=0 rows
- [ ] Add one library slug you'd propose for migration 776+ with rationale

## Decision matrix

| Need | First choice | Fallback |
|------|--------------|----------|
| Rounded box | BOSL2 | Round Anything |
| M3 hole + nut trap | catchnhole + threads.scad | BOSL2 threading |
| PCB enclosure | yapp_box | Custom BOSL2 cuboid |
| Gear mockup | MCAD (reference) | Hand simplified |
| New IAM template | BOSL2 scaffold | Domain repo clone |

## Next module

→ `03-gridfinity-parametric-generators.md`
