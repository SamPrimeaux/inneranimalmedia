#!/usr/bin/env python3
"""
audit_r2_s3_crud_wiring.py
---------------------------
Scans the inneranimalmedia codebase for R2/S3 access control, CRUD route,
bucket scoping, and media preview bugs from the P0-B spec.

Usage:
    python scripts/audit_r2_s3_crud_wiring.py
    python scripts/audit_r2_s3_crud_wiring.py --root /path/to/repo
    python scripts/audit_r2_s3_crud_wiring.py --json findings.json
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_ROOT = Path("/Users/samprimeaux/inneranimalmedia")

SCAN_EXTENSIONS = {".js", ".ts", ".tsx", ".jsx", ".py", ".sql", ".toml", ".json"}

SKIP_DIRS = {
    "node_modules", ".git", "dist", ".wrangler", "__pycache__",
    ".venv", "venv", ".next", "coverage", ".turbo",
}

# Known bucket names for the project
KNOWN_BUCKETS = ["inneranimalmedia", "agent-sam"]
WRONG_BUCKET_ASSUMPTIONS = ["agent-sam"]  # wrong primary bucket for app files

# ---------------------------------------------------------------------------
# Finding model
# ---------------------------------------------------------------------------

@dataclass
class Finding:
    pattern_id: str
    severity: str
    file: str
    line: int
    snippet: str
    detail: str
    recommendation: str


SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "INFO": 3}


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

# R1: R2 bucket binding used without workspace check
RE_R2_PUT_GET = re.compile(
    r"\b(env\.\w*[Rr]2\w*|c\.env\.\w*[Rr]2\w*)\s*\.\s*(put|get|list|delete|head)\s*\(",
)

# R2: bucket name hardcoded as string
RE_BUCKET_NAME_HARDCODED = re.compile(
    r"['\"`](inneranimalmedia|agent-sam)['\"`]",
)

# R3: list() call on R2 without prefix/workspace scoping
RE_R2_LIST_UNSCOPED = re.compile(
    r"\.(list)\s*\(\s*(\{[^}]*\}|\s*)\s*\)",
)

# R4: presigned URL / media preview URL patterns
RE_PRESIGNED = re.compile(
    r"(createPresignedPost|getSignedUrl|presign|r2\.url|publicUrl|preview_url|mediaUrl)",
    re.IGNORECASE,
)

# R5: multipart upload references
RE_MULTIPART = re.compile(
    r"(createMultipartUpload|uploadPart|completeMultipartUpload|abortMultipartUpload)",
    re.IGNORECASE,
)

# R6: CORS headers missing on R2 routes
RE_CORS_MISSING = re.compile(
    r"(router\.(get|put|post|delete|options)|app\.(get|put|post|delete))\s*\(\s*['\"`]/api/r2",
    re.IGNORECASE,
)

# R7: /api/r2 or /api/s3 routes
RE_R2_ROUTE = re.compile(
    r"(router|app|hono|itty)\.(get|post|put|delete|patch|options)\s*\(\s*['\"`][^'\"` ]*(?:r2|s3|storage|bucket|object|upload|download|media)[^'\"` ]*['\"`]",
    re.IGNORECASE,
)

# R8: workspace_id missing from R2 key construction
RE_R2_KEY_NO_WORKSPACE = re.compile(
    r"(key|prefix|objectKey|r2Key)\s*[=:]\s*[`'\"][^`'\"]*[`'\"]",
    re.IGNORECASE,
)

# R9: bucket allowlist check
RE_BUCKET_ALLOWLIST = re.compile(
    r"(allowlist|allowed_buckets|bucket_allowlist|BUCKET_ALLOW)",
    re.IGNORECASE,
)

# R10: error handling on R2 ops
RE_R2_ERROR_UNHANDLED = re.compile(
    r"\.(put|get|delete|list)\s*\([^)]*\)\s*(?![\s\S]{0,80}catch)",
)


# ---------------------------------------------------------------------------
# File walker
# ---------------------------------------------------------------------------

def walk_files(root: Path) -> list[Path]:
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = Path(dirpath) / fn
            if p.suffix in SCAN_EXTENSIONS:
                results.append(p)
    return results


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

def scan_file(path: Path, root: Path) -> list[Finding]:
    rel = str(path.relative_to(root))
    findings: list[Finding] = []

    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return findings

    lines = raw.splitlines()

    # ------------------------------------------------------------------
    # R1: R2 binding used — check for workspace/user scope nearby
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        if RE_R2_PUT_GET.search(line):
            block = " ".join(lines[max(0, i-5):min(len(lines), i+5)])
            low = block.lower()
            if "workspace_id" not in low and "workspace" not in low and "user_id" not in low:
                findings.append(Finding(
                    pattern_id="R1-R2-UNSCOPED-BINDING",
                    severity="HIGH",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail="R2 binding operation with no workspace_id/user_id in scope.",
                    recommendation="Construct R2 key as workspace/{workspace_id}/... or verify allowlist before op.",
                ))

    # ------------------------------------------------------------------
    # R2: Hardcoded bucket name
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        m = RE_BUCKET_NAME_HARDCODED.search(line)
        if m:
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("#") or stripped.startswith("*"):
                continue
            bucket = m.group(1)
            detail = f"Hardcoded bucket name '{bucket}'."
            rec = "Resolve bucket from workspace config or wrangler binding — do not hardcode."
            if bucket == "agent-sam":
                detail += " NOTE: agent-sam is the dashboard static file bucket, NOT the primary app bucket."
                rec = "Primary app bucket is 'inneranimalmedia'. Only use agent-sam for dashboard HTML/JS assets."
            findings.append(Finding(
                pattern_id="R2-HARDCODED-BUCKET",
                severity="HIGH",
                file=rel,
                line=i,
                snippet=stripped,
                detail=detail,
                recommendation=rec,
            ))

    # ------------------------------------------------------------------
    # R3: R2 list() with no prefix — returns entire bucket
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        low = line.lower()
        if ".list(" in low and ("r2" in low or "bucket" in low or "env." in low):
            block = " ".join(lines[max(0, i-2):min(len(lines), i+3)])
            if "prefix" not in block.lower():
                findings.append(Finding(
                    pattern_id="R3-R2-LIST-NO-PREFIX",
                    severity="HIGH",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail="R2 .list() call without a prefix — returns entire bucket contents.",
                    recommendation="Always pass prefix: `workspace/{workspace_id}/` to scope listings.",
                ))

    # ------------------------------------------------------------------
    # R4: Media/preview URL construction — check for expiry and auth
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        if RE_PRESIGNED.search(line):
            block = " ".join(lines[max(0, i-3):min(len(lines), i+5)])
            low = block.lower()
            missing = []
            if "expires" not in low and "expiry" not in low and "expiresin" not in low:
                missing.append("expiry")
            if "workspace" not in low and "user" not in low:
                missing.append("workspace/user scope")
            if missing:
                findings.append(Finding(
                    pattern_id="R4-PRESIGNED-URL-ISSUE",
                    severity="MEDIUM",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail=f"Presigned/preview URL missing: {', '.join(missing)}.",
                    recommendation="Set explicit expiry and scope URL generation to workspace/user.",
                ))

    # ------------------------------------------------------------------
    # R5: Multipart upload — flag for queue/incomplete check
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        if RE_MULTIPART.search(line):
            findings.append(Finding(
                pattern_id="R5-MULTIPART-UPLOAD",
                severity="INFO",
                file=rel,
                line=i,
                snippet=line.strip(),
                detail="Multipart upload reference found.",
                recommendation="Verify basic CRUD and preview work before relying on multipart. Queue if incomplete.",
            ))

    # ------------------------------------------------------------------
    # R6: /api/r2 routes — check for CORS and auth middleware
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        if RE_R2_ROUTE.search(line):
            block = " ".join(lines[max(0, i-5):min(len(lines), i+15)])
            low = block.lower()
            missing = []
            if "cors" not in low and "access-control" not in low:
                missing.append("CORS headers")
            if (
                "authenticate" not in low
                and "auth" not in low
                and "token" not in low
                and "session" not in low
                and "middleware" not in low
            ):
                missing.append("auth middleware")
            if "workspace_id" not in low and "workspace" not in low:
                missing.append("workspace_id filter")
            if missing:
                findings.append(Finding(
                    pattern_id="R6-R2-ROUTE-MISSING-GUARDS",
                    severity="HIGH",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail=f"R2/S3 route missing: {', '.join(missing)}.",
                    recommendation="All /api/r2 routes need: auth middleware, workspace_id filter, CORS headers.",
                ))

    # ------------------------------------------------------------------
    # R7: Key construction — check workspace prefix
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        m = RE_R2_KEY_NO_WORKSPACE.search(line)
        if m and ("r2" in line.lower() or "bucket" in line.lower() or "object" in line.lower() or "key" in line.lower()):
            val = m.group(0)
            if (
                "workspace" not in val.lower()
                and "workspace_id" not in val.lower()
                and "${workspace" not in val
                and "user" not in val.lower()
            ):
                # Only flag template literals and plain string concatenations
                if "`" in line or "+" in line or "join" in line.lower():
                    findings.append(Finding(
                        pattern_id="R7-R2-KEY-NO-WORKSPACE-PREFIX",
                        severity="MEDIUM",
                        file=rel,
                        line=i,
                        snippet=line.strip(),
                        detail="R2 object key constructed without workspace prefix.",
                        recommendation="Prefix all R2 keys: `workspace/${workspace_id}/${userPath}`.",
                    ))

    # ------------------------------------------------------------------
    # R8: Bucket allowlist — flag if NOT present in file (only for API/route files)
    # ------------------------------------------------------------------
    is_api_file = (
        "api" in rel.lower()
        or "worker" in rel.lower()
        or "route" in rel.lower()
        or "handler" in rel.lower()
    )
    if is_api_file and any(
        RE_R2_PUT_GET.search(line) or RE_R2_ROUTE.search(line)
        for line in lines
    ):
        full_text = raw.lower()
        if "allowlist" not in full_text and "allowed_bucket" not in full_text and "bucket_allowlist" not in full_text:
            findings.append(Finding(
                pattern_id="R8-NO-BUCKET-ALLOWLIST",
                severity="HIGH",
                file=rel,
                line=1,
                snippet="(file-level check)",
                detail="API/route file performs R2 ops but has no bucket allowlist check.",
                recommendation="Add bucket allowlist: reject requests for buckets not in workspace config.",
            ))

    # ------------------------------------------------------------------
    # R9: Delete without soft-delete or confirmation pattern
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        low = line.lower()
        if (
            ".delete(" in low
            and ("r2" in low or "bucket" in low or "env." in low)
        ):
            block = " ".join(lines[max(0, i-3):min(len(lines), i+5)])
            low_block = block.lower()
            if (
                "soft" not in low_block
                and "recycle" not in low_block
                and "confirm" not in low_block
                and "workspace_id" not in low_block
                and "user_id" not in low_block
            ):
                findings.append(Finding(
                    pattern_id="R9-R2-DELETE-UNGUARDED",
                    severity="MEDIUM",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail="R2 delete without workspace_id guard or soft-delete pattern.",
                    recommendation="Require workspace_id + user_id verification before delete. Log deletion events.",
                ))

    # ------------------------------------------------------------------
    # R10: Download/read route — check for content-type and range headers
    # ------------------------------------------------------------------
    for i, line in enumerate(lines, 1):
        low = line.lower()
        if (
            ("download" in low or "/read" in low or "/get" in low)
            and ("r2" in low or "bucket" in low or "object" in low)
        ):
            block = " ".join(lines[max(0, i-2):min(len(lines), i+10)])
            low_block = block.lower()
            missing = []
            if "content-type" not in low_block and "contenttype" not in low_block:
                missing.append("Content-Type header")
            if "range" not in low_block and "accept-ranges" not in low_block:
                missing.append("Range/Accept-Ranges (required for video preview)")
            if missing:
                findings.append(Finding(
                    pattern_id="R10-DOWNLOAD-MISSING-HEADERS",
                    severity="MEDIUM",
                    file=rel,
                    line=i,
                    snippet=line.strip(),
                    detail=f"Download/read route may be missing: {', '.join(missing)}.",
                    recommendation="Set Content-Type from R2 object metadata. Add Accept-Ranges: bytes for media preview.",
                ))

    return findings


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def print_report(findings: list[Finding], root: Path) -> None:
    findings.sort(key=lambda f: (SEVERITY_ORDER.get(f.severity, 9), f.file, f.line))

    counts: dict[str, int] = {}
    for f in findings:
        counts[f.severity] = counts.get(f.severity, 0) + 1

    print("\n" + "=" * 72)
    print("R2 / S3 CRUD WIRING AUDIT")
    print(f"Root: {root}")
    print("=" * 72)
    print(f"Total findings: {len(findings)}")
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "INFO"]:
        if sev in counts:
            print(f"  {sev}: {counts[sev]}")
    print()

    by_pattern: dict[str, list[Finding]] = {}
    for f in findings:
        by_pattern.setdefault(f.pattern_id, []).append(f)

    for pid, group in sorted(
        by_pattern.items(),
        key=lambda kv: SEVERITY_ORDER.get(kv[1][0].severity, 9),
    ):
        sev = group[0].severity
        print(f"[{sev}] {pid}")
        print(f"  Recommendation: {group[0].recommendation}")
        print(f"  Occurrences ({len(group)}):")
        for f in group[:20]:
            print(f"    {f.file}:{f.line}")
            print(f"      {f.snippet[:120]}")
            print(f"      → {f.detail}")
        if len(group) > 20:
            print(f"    ... and {len(group) - 20} more")
        print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Audit R2/S3 CRUD wiring.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--json", metavar="FILE")
    parser.add_argument("--severity", choices=["CRITICAL", "HIGH", "MEDIUM", "INFO"])
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if not root.exists():
        print(f"ERROR: root path does not exist: {root}", file=sys.stderr)
        sys.exit(1)

    files = walk_files(root)
    print(f"Scanning {len(files)} files under {root} ...", file=sys.stderr)

    all_findings: list[Finding] = []
    for path in files:
        all_findings.extend(scan_file(path, root))

    seen: set[tuple] = set()
    deduped: list[Finding] = []
    for f in all_findings:
        key = (f.pattern_id, f.file, f.line)
        if key not in seen:
            seen.add(key)
            deduped.append(f)

    if args.severity:
        threshold = SEVERITY_ORDER[args.severity]
        deduped = [f for f in deduped if SEVERITY_ORDER.get(f.severity, 9) <= threshold]

    print_report(deduped, root)

    if args.json:
        out = Path(args.json)
        out.write_text(
            json.dumps([asdict(f) for f in deduped], indent=2),
            encoding="utf-8",
        )
        print(f"JSON written to {out}")

    has_critical = any(f.severity == "CRITICAL" for f in deduped)
    sys.exit(1 if has_critical else 0)


if __name__ == "__main__":
    main()
