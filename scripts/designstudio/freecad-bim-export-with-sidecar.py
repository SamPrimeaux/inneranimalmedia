#!/usr/bin/env python3
"""
FreeCAD BIM export: STL + iam.cad.placement.v1 sidecar JSON.
Usage: freecad-bim-export-with-sidecar.py input.FCStd [output_dir]
Writes output.stl and placement_sidecar.json in output_dir (default: cwd).
"""
import json
import os
import sys

import FreeCAD
import Mesh
import MeshPart
import Part


def vec3(obj):
    if hasattr(obj, "x"):
        return [float(obj.x), float(obj.y), float(obj.z)]
    if isinstance(obj, (list, tuple)) and len(obj) >= 3:
        return [float(obj[0]), float(obj[1]), float(obj[2])]
    return [0.0, 0.0, 0.0]


def rotation_euler_deg(base):
    if base is None:
        return [0.0, 0.0, 0.0]
    try:
        rot = base.Rotation
        yaw, pitch, roll = rot.toEuler()
        return [float(roll), float(pitch), float(yaw)]
    except Exception:
        return [0.0, 0.0, 0.0]


def main():
    if len(sys.argv) < 2:
        print("usage: freecad-bim-export-with-sidecar.py input.FCStd [output_dir]", file=sys.stderr)
        return 1

    input_fcstd = os.path.abspath(sys.argv[1])
    out_dir = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.getcwd())
    os.makedirs(out_dir, exist_ok=True)

    if not os.path.isfile(input_fcstd):
        raise RuntimeError(f"missing_input: {input_fcstd}")

    doc = FreeCAD.open(input_fcstd)
    doc.recompute()

    exportable = [
        obj
        for obj in doc.Objects
        if hasattr(obj, "Shape") and obj.Shape and not obj.Shape.isNull()
    ]
    if not exportable:
        raise RuntimeError("no_exportable_shapes")

    stl_path = os.path.join(out_dir, "output.stl")
    try:
        Part.export(exportable, stl_path)
    except Exception:
        shapes = [obj.Shape for obj in exportable]
        compound = Part.makeCompound(shapes)
        mesh = MeshPart.meshFromShape(
            Shape=compound,
            LinearDeflection=0.1,
            AngularDeflection=0.523599,
        )
        mesh.write(stl_path)

    bbox = FreeCAD.BoundBox()
    for obj in exportable:
        bbox.add(obj.Shape.BoundBox)

    placement_pos = [0.0, 0.0, 0.0]
    placement_rot = [0.0, 0.0, 0.0]
    for obj in exportable:
        if getattr(obj, "Placement", None) is not None:
            placement_pos = vec3(obj.Placement.Base)
            placement_rot = rotation_euler_deg(obj.Placement)
            break

    sidecar = {
        "schema": "iam.cad.placement.v1",
        "units": "mm",
        "up_axis": "Z",
        "bbox_mm": {
            "min": [float(bbox.XMin), float(bbox.YMin), float(bbox.ZMin)],
            "max": [float(bbox.XMax), float(bbox.YMax), float(bbox.ZMax)],
        },
        "placement": {
            "position_mm": placement_pos,
            "rotation_euler_deg": placement_rot,
        },
        "spawn": {
            "profile": "bim",
            "fit_to_viewport": False,
        },
        "source_fcstd": os.path.basename(input_fcstd),
    }

    sidecar_path = os.path.join(out_dir, "placement_sidecar.json")
    with open(sidecar_path, "w", encoding="utf-8") as f:
        json.dump(sidecar, f, indent=2)

    print(f"exported_stl={stl_path}")
    print(f"exported_sidecar={sidecar_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
