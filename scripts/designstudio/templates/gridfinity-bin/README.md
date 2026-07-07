# Gridfinity bin template (IAM v1)

Parametric organizer scaffold for Design Studio / CAD runner.

- **Schema:** `scripts/designstudio/templates/gridfinity-bin/template.json`
- **Render:** `./scripts/designstudio/run-openscad.sh gridfinity-bin.scad /tmp/out.stl`
- **Libraries:** requires BOSL2 on `OPENSCADPATH` (vendored in `iam-cad-worker` image at `/opt/openscad-libs/BOSL2`)

v1 uses BOSL2 `cuboid()` with Gridfinity unit sizing. v2 will wrap upstream `gridfinity-rebuilt-openscad` modules from `/opt/openscad-libs/gridfinity-rebuilt-openscad`.
