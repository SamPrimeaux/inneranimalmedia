#!/usr/bin/env python3
"""
Convert STL to GLB using Blender in batch mode (no bpy in system Python).
Usage: stl-to-glb.py input.stl output.glb [path-to-blender]
"""
import os
import subprocess
import sys
import tempfile
import textwrap
from shutil import which
from typing import Optional


def find_blender(explicit: Optional[str]) -> Optional[str]:
    if explicit and os.path.isfile(explicit):
        return explicit
    envb = os.environ.get("BLENDER_BIN")
    if envb and os.path.isfile(envb):
        return envb
    # Prefer official macOS .app bundle before PATH (PATH may point at a broken dev build).
    if sys.platform == "darwin":
        mac = "/Applications/Blender.app/Contents/MacOS/Blender"
        if os.path.isfile(mac):
            return mac
    w = which("blender")
    if w and os.path.isfile(w):
        return w
    return None


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: stl-to-glb.py input.stl output.glb [blender_bin]", file=sys.stderr)
        return 1
    stl = os.path.abspath(sys.argv[1])
    glb = os.path.abspath(sys.argv[2])
    blender = sys.argv[3] if len(sys.argv) > 3 else None
    if not os.path.isfile(stl):
        print(f"not found: {stl}", file=sys.stderr)
        return 1
    blender = find_blender(blender)
    if not blender:
        print(
            "blender not found; install from blender.org or set BLENDER_BIN "
            "(e.g. /Applications/Blender.app/Contents/MacOS/Blender on macOS)",
            file=sys.stderr,
        )
        return 1

    stl_esc = stl.replace("\\", "/")
    glb_esc = glb.replace("\\", "/")

    py = textwrap.dedent(
        f"""
        import bpy
        bpy.ops.wm.read_factory_settings(use_empty=True)
        stl_path = r"{stl_esc}"
        glb_path = r"{glb_esc}"
        try:
            bpy.ops.wm.stl_import(filepath=stl_path)
        except Exception:
            bpy.ops.import_mesh.stl(filepath=stl_path)
        bpy.ops.export_scene.gltf(filepath=glb_path, export_format="GLB")
        """
    ).strip()

    with tempfile.NamedTemporaryFile(mode="w", suffix="_stl2glb.py", delete=False) as f:
        f.write(py)
        tmp = f.name
    try:
        cmd = [blender, "--background", "--python", tmp]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr or r.stdout or "blender failed", file=sys.stderr)
            return r.returncode
        if not os.path.isfile(glb):
            print("blender finished but output glb missing", file=sys.stderr)
            return 1
        return 0
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
