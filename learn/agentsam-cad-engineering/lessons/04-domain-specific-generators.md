# Module 04 — Domain-specific generators (keyboard_parts pattern)

**Time:** 30 min  
**Example repo:** https://github.com/rsheldw/keyboard_parts (or current maintainer fork from awesome-openscad)

## Core insight

**Generic CAD is hard. Domain generators are shippable.**

| Hard | Easier |
|------|--------|
| "Build me any mechanical part" | "Keyboard plate generator" |
| "Universal enclosure tool" | "Raspberry Pi 4 YAPP box" |
| "Any bracket" | "L-bracket 100mm, M4 holes" |

IAM should ship **template slugs** with domain vocabulary baked in.

## What keyboard_parts teaches

- Plate cutout shapes tied to keyboard standards (ANSI, ISO, etc.)
- Accessory modules (stands, knobs) sharing one library
- OpenSCAD modules named for domain concepts (`switch_cutout`, `plate_outline`)

## IAM template categories (recommended ship order)

| Priority | Slug | Domain hooks |
|----------|------|--------------|
| 1 | `gridfinity-bin` | organizer (module 03) |
| 2 | `yapp-enclosure` | PCB dims, USB cutouts (D1: yapp_box) |
| 3 | `l-bracket` | leg length, hole pattern, thickness |
| 4 | `phone-stand` | slot width, angle, base depth |
| 5 | `tray-insert` | tray_lib / compartments |
| 6 | `chess-board` | ✅ exists — `fixtures/chess-board.scad` |
| 7 | `badge-sign` | text + mounting holes |
| 8 | `shop-shelf-bracket` | Meaux garage / shop-house lane |

Fixtures README lists futures: `cube-tray`, `phone-stand`, `shelf-bracket` — implement using BOSL2 scaffolds.

## AgentSam prompt routing

```txt
Intent: "keyboard plate for 60% layout"
  → engine: openscad
  → template: keyboard-plate (future) OR study keyboard_parts imports
  → libraries: domain-specific + BOSL2 for standoffs

Intent: "organizer bin for Gridfinity"
  → template: gridfinity-bin
  → params: grid_x, grid_y, height_units
```

Extend `openscad-library-resolver.js` keyword map when adding domains (already has `board_game`, `architecture` tags).

## Lab checklist

- [ ] Find keyboard_parts (or equivalent) via awesome-openscad
- [ ] Identify 3 domain modules you'd copy structure from (not code verbatim if license differs)
- [ ] Pick one fixture from `scripts/designstudio/fixtures/README.md` to implement next
- [ ] Draft `template.json` for that fixture with 5 params

## Anti-pattern

Do not train AgentSam to emit 200-line one-off SCAD for "a simple tray" when `tray_lib` or BOSL2 `cuboid` + subtract pattern exists.

## Next module

→ `05-freecad-foundation.md`
