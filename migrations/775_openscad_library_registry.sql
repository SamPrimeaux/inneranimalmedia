-- Migration 775: OpenSCAD library registry
-- Purpose: D1 source-of-truth for available OpenSCAD libraries on the runner.
-- Replaces full markdown injection into system prompts with targeted retrieval
-- based on capability_tags extracted from the user's CAD intent.
-- Source: https://openscad.org/libraries.html (scraped 2026-07-06)

CREATE TABLE IF NOT EXISTS agentsam_openscad_libraries (
  slug              TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  import_line       TEXT NOT NULL,        -- exact string to prepend to generated script
  capability_tags   TEXT NOT NULL DEFAULT '[]', -- JSON array of keyword strings
  license           TEXT NOT NULL,
  commercial_safe   INTEGER NOT NULL DEFAULT 1, -- 1 = yes, 0 = GPL/restricted
  priority          INTEGER NOT NULL DEFAULT 5,  -- 1 = first choice, 10 = last resort
  repo_url          TEXT,
  notes             TEXT,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─── Seed: 26 libraries ───────────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_openscad_libraries
  (slug, display_name, import_line, capability_tags, license, commercial_safe, priority, repo_url, notes)
VALUES

-- P1: BOSL2 — first choice for almost everything
('bosl2',
 'BOSL2',
 'include <BOSL2/std.scad>',
 '["rounding","chamfer","fillet","anchor","attach","threading","screw","nut","path","bezier","sweep","loft","skin","mask","prism","tube","grid","mirror","distribute","hull","minkowski","rounded_box","cuboid","cylinder","sphere","mechanical"]',
 'BSD-2-Clause', 1, 1,
 'https://github.com/BelfrySCAD/BOSL2',
 'Most comprehensive OpenSCAD library. Prefer over hand-rolled hull() rounding. Selective includes: BOSL2/rounding.scad, BOSL2/threading.scad, BOSL2/paths.scad, BOSL2/beziers.scad'),

-- P2: threads.scad — metric threads, bolts, nuts
('threads_scad',
 'threads.scad',
 'use <threads.scad>',
 '["thread","threading","metric_thread","bolt","nut","screw","fastener","rod","tap","clearance_hole","countersink","hex_bolt"]',
 'CC0-1.0', 1, 2,
 'https://github.com/rcolyer/threads-scad',
 'CC0 license. Key modules: metric_thread(), thread_in(), hex_bolt(), nut(). Pair with catchnhole for full fastener coverage.'),

-- P2: Catch'n'Hole — nutcatches and screw holes
('catchnhole',
 "Catch'n'Hole",
 'use <catchnhole/catchnhole.scad>',
 '["nutcatch","nut_trap","screw_hole","countersink","fastener","insert","m3","m4","m5","m6","clearance_hole"]',
 'MIT', 1, 2,
 'https://github.com/mmalecki/catchnhole',
 'Ergonomic nutcatch + screw hole modules. nutcatch_parallel(), nutcatch_sidecut(), screw(). Pair with threads.scad.'),

-- P2: YAPP — PCB project boxes
('yapp_box',
 'YAPP Box',
 'include <YAPP_Box/YAPP_Box.scad>',
 '["enclosure","project_box","pcb","standoff","usb","hdmi","cutout","panel","snap_fit","electronics","raspberry_pi","arduino","two_part_box"]',
 'MIT', 1, 2,
 'https://github.com/mrWheel/YAPP_Box',
 'PCB-first box generator. MIT license preferred over Marks Enclosure Helper (GPL) for commercial work. Define PCB dims → auto-generates matching box.'),

-- P2: Round Anything — focused rounding
('round_anything',
 'Round Anything',
 'include <Round-Anything/polyround.scad>',
 '["rounding","rounded_polygon","per_vertex_radius","extrude_with_radius","2d_rounding","profile_rounding","minkowski_round"]',
 'MIT', 1, 3,
 'https://github.com/Irev-Dev/Round-Anything',
 'Lighter than BOSL2 when only rounding is needed. polyRound(), extrudeWithRadius(), minkowskiRound(). Per-vertex radii on 2D polygons.'),

-- P3: Tray Library — storage trays and organizers
('tray_lib',
 'Tray Library',
 'include <tray.scad>',
 '["tray","organizer","drawer","insert","storage","compartment","bin","grid_bin","subdivision","board_game","tool_tray","hardware_tray"]',
 'LGPL-3.0-or-later', 1, 3,
 'https://github.com/sofian/openscad-tray',
 'LGPL — library stays separate. Key module: tray(l, w, h, wall, floor, ...). Faster than hand-rolling grid_bin pattern.'),

-- P3: Mark's Enclosure Helper — hinged two-piece boxes
('marks_enclosure',
 "Mark's Enclosure Helper",
 'use <MarksEnclosureHelper/enclosure.scad>',
 '["enclosure","hinged_box","two_part","snap_fit","magnet_closure","screw_closure","lid","electronics_box","project_box"]',
 'GPL-3.0-only', 0, 4,
 'https://github.com/sbambach/MarksEnclosureHelper',
 'GPL license — flag for commercial use. Prefer YAPP (MIT) for PCB work. Use this for non-PCB hinged enclosures when GPL is acceptable.'),

-- P3: dotSCAD — curves, spirals, polyhedra, path sweeps
('dotscad',
 'dotSCAD',
 'use <dotSCAD/src/helix_extrude.scad>',
 '["spiral","helix","bezier","curve","path_sweep","polyhedra","geodesic","platonic","voronoi","turtle","archimedean","text_on_path","shape_on_path","organic"]',
 'LGPL-3.0-only', 1, 4,
 'https://github.com/JustinSDK/dotSCAD',
 'LGPL — library stays separate. Per-module imports (no single std.scad). Strong for organic/mathematical shapes.'),

-- P3: Function Plotting — mathematical surfaces
('plot_function',
 'Function Plotting Library',
 'use <plot-function.scad>',
 '["math_surface","function_plot","parametric_surface","terrain","wave","cartesian","polar","cylindrical","axial","mathematical"]',
 'CC0-1.0', 1, 4,
 'https://github.com/rcolyer/plot-function',
 'CC0. Cartesian, polar, cylindrical, axial coordinate modes. For terrain-like or mathematically-defined surfaces.'),

-- P4: NopSCADlib — real hardware parts for 3D printer/electronics
('nopscadlib',
 'NopSCADlib',
 'include <NopSCADlib/utils/core/core.scad>',
 '["fan","motor","bearing","belt","pulley","pcb","raspberry_pi","arduino","iec_socket","panel_cutout","connector","terminal","cable_clip","3d_printer","real_hardware","mechanical_assembly"]',
 'GPL-3.0-or-later', 0, 5,
 'https://github.com/nophead/NopSCADlib',
 'GPL license. Use when user needs realistic hardware models (40mm fan, RPi Zero, IEC socket). Flag GPL for commercial output.'),

-- P4: Smooth Primitives — lightweight rounded shapes
('smooth_prim',
 'Smooth Primitives',
 'use <smooth-prim.scad>',
 '["rounded_cylinder","rounded_box","smooth_torus","smooth_primitive","lightweight_rounding"]',
 'CC0-1.0', 1, 5,
 'https://github.com/rcolyer/smooth-prim',
 'CC0. Lighter than BOSL2 when only a few smooth primitives are needed. SmoothCylinder(), SmoothBox(), SmoothTorus().'),

-- P4: ClosePoints — polyhedrons from point layers
('closepoints',
 'ClosePoints Library',
 'use <closepoints.scad>',
 '["polyhedron","point_layer","organic_shell","vase","cross_section","custom_shape","hull_from_layers","loft"]',
 'CC0-1.0', 1, 5,
 'https://github.com/rcolyer/closepoints',
 'CC0. closePoints() builds polyhedrons from layers of outline points. For custom organic shapes that do not fit cylinder/cube/sphere.'),

-- P4: Pathbuilder — SVG-like 2D path syntax
('pathbuilder',
 'Pathbuilder',
 'use <pathbuilder.scad>',
 '["svg_path","2d_path","fillet","chamfer","complex_profile","bezier_path","arc","polygon_from_path"]',
 'MIT', 1, 5,
 'https://github.com/dinther/pathbuilder',
 'MIT. Full SVG path command support (M,L,C,A,Q,Z) with built-in fillets and chamfers. Best when user provides SVG-style 2D profile description.'),

-- P4: BOLTS — standard technical parts
('bolts',
 'BOLTS',
 'include <BOLTS/bolts.scad>',
 '["iso_bolt","iso_nut","washer","bearing","profile","i_beam","l_profile","t_slot","extrusion","standard_part","engineering_spec","2020_extrusion","608_bearing"]',
 'LGPL-2.1-or-later', 1, 5,
 'https://github.com/boltsparts/BOLTS',
 'Dual LGPL/GPL depending on part. Use when dimensional accuracy to engineering spec is required (not approximation).'),

-- P5: Constructive — constraint-like mating parts
('constructive',
 'Constructive Library',
 'include <constructive/constructive.scad>',
 '["mating_parts","snap_fit","press_fit","sliding_joint","constraint","complementary","mechanical_assembly","stamping"]',
 'GPL-2.0-only', 0, 6,
 'https://github.com/solidboredom/constructive',
 'GPL. Creates parts that automatically mate without manual offset math. Acts as constraint-based CAD substitute for snap/press/slide fit joints.'),

-- P5: Functional OpenSCAD — functional programming patterns
('functional_openscad',
 'Functional OpenSCAD',
 'use <FunctionalOpenSCAD/functional.scad>',
 '["functional","higher_order","geometry_as_data","composable","programmatic","advanced_parametric"]',
 'MIT', 1, 6,
 'https://github.com/thehans/FunctionalOpenSCAD',
 'MIT. Implements geometry as data using function literals. For advanced scripts needing composable shape combinators.'),

-- P5: funcutils — functional list tools
('funcutils',
 'funcutils',
 'use <funcutils/funcutils.scad>',
 '["map","filter","reduce","list","functional","higher_order","array_processing"]',
 'CC0-1.0', 1, 6,
 'https://github.com/thehans/funcutils',
 'CC0. Requires function-literals feature in OpenSCAD. map(), filter(), reduce() for point/dimension list processing in parametric scripts.'),

-- P5: SCON — structured config data
('scon',
 'SCON',
 'use <openscad-scon/scon.scad>',
 '["config","json_like","structured_data","params","configuration_injection"]',
 'MIT', 1, 6,
 'https://github.com/wmacevoy/openscad-scon',
 'MIT. JSON-like config data within .scad files. Useful for AgentSam to inject parameters as structured data into generated scripts.'),

-- P5: A2D — 2D drawing helpers
('a2d',
 "Altair's 2D Library (A2D)",
 'use <A2D/A2D.scad>',
 '["2d","drawing","profile","cross_section","constants","2d_shape","technical_2d"]',
 'MIT', 1, 6,
 'https://github.com/ridercz/A2D',
 'MIT. 2D shape helpers and constants. Use for complex 2D profiles before linear_extrude().'),

-- P5: UB.scad — full workflow + mechanical parts
('ub_scad',
 'UB.scad',
 'use <UB.scad/UB.scad>',
 '["workflow","view_helper","annotation","print_orientation","mechanical_part","debug"]',
 'CC0-1.0', 1, 6,
 'https://github.com/UBaer21/UB.scad',
 'CC0. Full 3D printing workflow solution. View helpers, object generation, mechanical parts.'),

-- P5: StoneAgeLib — general purpose, requires Manifold
('stoneagelib',
 'StoneAgeLib',
 'use <StoneAgeLib/StoneAgeLib.scad>',
 '["general","utility","3d_printing","manifold"]',
 'CC0-1.0', 1, 7,
 'https://github.com/Stone-Age-Sculptor/StoneAgeLib',
 'CC0. REQUIRES OpenSCAD >=2025 + Manifold renderer (--enable=manifold). Verify ExecOS OpenSCAD version before using.'),

-- P5: STEMFIE — interlocking construction set
('stemfie',
 'STEMFIE Parts Library',
 'use <Stemfie_OpenSCAD/stemfie.scad>',
 '["stemfie","construction_set","interlocking","modular","stem","educational","toy"]',
 'GPL-3.0-or-later', 0, 7,
 'https://github.com/Cantareus/Stemfie_OpenSCAD',
 'GPL. STEMFIE-compatible construction parts. Use for modular interlocking systems or STEMFIE ecosystem parts.'),

-- P5: Board Game Toolkit — boxes, inserts, tessellation
('boardgame_toolkit',
 'Board Game Toolkit',
 'use <openscad_boardgame_toolkit/boardgame_toolkit.scad>',
 '["board_game","insert","tray","tessellation","finger_hole","token","meeple","dice_tray","multi_color","3mf"]',
 'Apache-2.0', 1, 7,
 'https://github.com/pinkfish/openscad_boardgame_toolkit',
 'Apache 2.0. Multi-color 3MF generation capability (notable). Board game boxes, inserts, tokens, tessellation layouts.'),

-- P5: Dimensions — annotation drawings
('dimensions',
 'Dimensions Library',
 'use <openscad-new-dimensions/dimensions.scad>',
 '["dimension","annotation","technical_drawing","linear_dimension","angular_dimension","fabrication","measurement"]',
 'MIT', 1, 7,
 'https://github.com/adrien-delhorme/openscad-new-dimensions',
 'MIT. Draw dimension annotations on parts. For technical drawing output with measurement callouts.'),

-- P5: Doll House — panel-based architectural system
('dollhouse',
 'Doll House Library',
 'use <openscad-doll-house/dollhouse.scad>',
 '["panel","wall","floor","roof","architecture","massing","structural","opening"]',
 'GPL-3.0-only', 0, 8,
 'https://github.com/adrien-delhorme/openscad-doll-house',
 'GPL. Panel-based structural system. The panel construction pattern (walls as flat panels, openings as cutouts) is reusable for architectural massing.'),

-- P6: Asset Collection — reference meshes
('asset_collection',
 'Asset Collection',
 'use <OpenSCAD-Snippet/asset.scad>',
 '["furniture","mechanical_reference","game_asset","base_mesh","reference"]',
 'MIT', 1, 8,
 'https://github.com/AngeloNicoli/OpenSCAD-Snippet',
 'MIT. Reference implementations — furniture, mechanical parts, game design base meshes. Use as starting point, not include.');

-- Register migration
INSERT OR IGNORE INTO d1_migrations (name, applied_at)
VALUES ('775_openscad_library_registry', unixepoch());
