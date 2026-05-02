# Design Studio fixtures (Meshy-free E2E)

Sample **OpenSCAD** sources for local smoke and for template-based generation. See `docs/inneranimalmedia/product/designstudio/E2E-TEST-PIPELINE.md`.

## Test case → prompt hints

| File | Test case | Prompt hint |
|------|-----------|-------------|
| *(future)* `cube-tray.scad` | Cube tray | “shallow tray 80mm inside, 2mm walls” |
| `chess-board.scad` | Chess board | “8x8 chess board, 40mm squares, 3mm thick” |
| *(future)* `phone-stand.scad` | Phone stand | “angled phone stand, 12mm slot, stable base” |
| *(future)* `ramp-blockout.scad` | Ramp blockout | “wheelchair ramp wedge 200mm run 30mm rise” |
| *(future)* `logo-pedestal.scad` | Logo pedestal | “circular pedestal 80mm diameter 25mm tall” |
| *(future)* `shelf-bracket.scad` | Shelf bracket | “L-bracket 100mm leg, 4mm holes for M4” |

## First proof

Use **`chess-board.scad`** with:

```bash
./scripts/designstudio/run-openscad.sh scripts/designstudio/fixtures/chess-board.scad /tmp/chess.stl
python3 scripts/designstudio/stl-to-glb.py /tmp/chess.stl /tmp/chess.glb
```

Then upload with `../upload-asset.sh` when wiring R2.
