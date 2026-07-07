// IAM template: gridfinity-bin v1 (BOSL2 parametric tray — runner OPENSCADPATH includes BOSL2)
// Full Gridfinity lip/stacking: migrate to gridfinity-rebuilt modules when template v2 lands.

grid_x = 2;       // [-D grid_x=2]
grid_y = 2;       // [-D grid_y=2]
height_mm = 42;   // [-D height_mm=42]
wall_mm = 1.2;    // [-D wall_mm=1.2]

include <BOSL2/std.scad>

unit = 42; // Gridfinity unit mm (approx)
inner_w = grid_x * unit - wall_mm * 2;
inner_d = grid_y * unit - wall_mm * 2;

difference() {
  cuboid([grid_x * unit, grid_y * unit, height_mm], rounding=1.5, edges="Z");
  translate([0, 0, wall_mm])
    cuboid([inner_w, inner_d, height_mm], rounding=0.8, edges="Z");
}
