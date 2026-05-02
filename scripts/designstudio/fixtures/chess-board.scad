// Fixture: parametric chess board (flat, printable)
// E2E proof asset — Meshy-free pipeline (OpenSCAD → STL → Blender GLB)
// Z = vertical; board sits on XY plane.

square = 40;       // mm per square
rows = 8;
cols = 8;
thickness = 3;
border = 4;

board_w = cols * square + 2 * border;
board_d = rows * square + 2 * border;

// Single solid: base slab + 64 alternating tile prisms (checker visual via height steps)
union() {
  color([0.25, 0.22, 0.2])
    cube([board_w, board_d, thickness * 0.35]);
  for (r = [0 : rows - 1])
    for (c = [0 : cols - 1]) {
      cx = border + c * square;
      cy = border + r * square;
      light = ((r + c) % 2) == 0;
      z0 = thickness * 0.35;
      h = light ? thickness * 0.65 : thickness * 0.55;
      color(light ? [0.92, 0.9, 0.85] : [0.18, 0.15, 0.13])
        translate([cx, cy, z0])
          cube([square, square, h]);
    }
}
