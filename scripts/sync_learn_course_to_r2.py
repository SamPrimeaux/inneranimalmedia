#!/usr/bin/env python3
from __future__ import annotations

import argparse
import mimetypes
import subprocess
from pathlib import Path

DEFAULT_BUCKET = "inneranimalmedia"
DEFAULT_PREFIX_ROOT = "learn"

KEEP_DIRS = [
    "assets",
    "assets/images",
    "assets/diagrams",
    "assets/starter-files",
    "assets/solution-files",
    "assets/datasets",
    "rubrics",
    "exports",
    "exports/templates",
    "exports/markdown",
    "exports/sql",
    "qa",
]

def run(cmd: list[str], dry_run: bool) -> None:
    printable = " ".join(cmd)
    print(printable)
    if not dry_run:
        subprocess.run(cmd, check=True)

def content_type_for(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(str(path))
    if guessed:
        return guessed
    if path.suffix == ".sql":
        return "application/sql"
    if path.suffix in {".md", ".txt"}:
        return "text/markdown" if path.suffix == ".md" else "text/plain"
    if path.suffix == ".json":
        return "application/json"
    return "application/octet-stream"

def ensure_keep_files(course_dir: Path) -> None:
    for rel in KEEP_DIRS:
        folder = course_dir / rel
        folder.mkdir(parents=True, exist_ok=True)
        keep = folder / ".keep"
        if not keep.exists():
            keep.write_text(f"Placeholder for {folder.as_posix()} so R2 prefix appears as a folder.\n")

def iter_files(course_dir: Path):
    for path in sorted(course_dir.rglob("*")):
        if path.is_file():
            yield path

def main() -> None:
    ap = argparse.ArgumentParser(description="Sync a local learn/<course> folder to Cloudflare R2.")
    ap.add_argument("course_slug", help="Example: software-engineering-builder-os")
    ap.add_argument("--bucket", default=DEFAULT_BUCKET)
    ap.add_argument("--prefix-root", default=DEFAULT_PREFIX_ROOT)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-keep", action="store_true", help="Do not create/upload .keep files for empty folders.")
    args = ap.parse_args()

    course_dir = Path("learn") / args.course_slug
    if not course_dir.exists():
        raise SystemExit(f"Missing course directory: {course_dir}")

    if not args.no_keep:
        ensure_keep_files(course_dir)

    files = list(iter_files(course_dir))
    if not files:
        raise SystemExit(f"No files found under {course_dir}")

    print(f"Syncing {len(files)} files from {course_dir} to R2 bucket {args.bucket}")
    print("")

    for file_path in files:
        rel = file_path.relative_to(course_dir).as_posix()
        r2_key = f"{args.prefix_root}/{args.course_slug}/{rel}"

        cmd = [
            "npx",
            "wrangler",
            "r2",
            "object",
            "put",
            f"{args.bucket}/{r2_key}",
            "--file",
            str(file_path),
            "--remote",
            "--content-type",
            content_type_for(file_path),
        ]
        run(cmd, args.dry_run)

    print("")
    print("Verify with:")
    print(f"npx wrangler r2 object list {args.bucket} --prefix {args.prefix_root}/{args.course_slug}/ --remote")
    print("")
    print("Public base:")
    print(f"https://assets.inneranimalmedia.com/{args.prefix_root}/{args.course_slug}/")

if __name__ == "__main__":
    main()
