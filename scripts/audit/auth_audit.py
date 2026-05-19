#!/usr/bin/env python3
"""
IAM Auth & Identity Audit
Run from repo root: python3 auth_audit.py
Outputs a report of identity propagation issues, hardcoded values,
OAuth token patterns, and user scoping gaps.
"""

import os
import re
import json
from pathlib import Path
from collections import defaultdict

REPO_ROOT = Path("/Users/samprimeaux/inneranimalmedia")

# All files from Cursor's auth file list
AUTH_FILES = [
    # Entry & routing
    "src/index.js",
    "src/core/router.js",
    "src/core/production-dispatch.js",
    # Core session / JWT / identity
    "src/core/auth.js",
    "src/core/identity.js",
    "src/core/actor-context.js",
    "src/core/runtime-actor.js",
    "src/core/bootstrap.js",
    "src/core/workspace-provisioning.js",
    "src/core/dashboard-realtime-jwt.js",
    "src/core/mcp-auth.js",
    "src/core/mcp-authorization.js",
    # Auth API
    "src/api/auth.js",
    "src/api/auth-me.js",
    "src/api/auth-hooks.js",
    "src/api/dashboard-api-identity.js",
    "src/api/kanban-scope.js",
    "src/api/access.js",
    "src/api/provisioning.js",
    "src/api/onboarding.js",
    # OAuth
    "src/api/oauth.js",
    "src/api/oauth-login-callbacks.js",
    "src/core/user-oauth-token.js",
    "src/core/auth-events.js",
    "src/core/provisionAuthenticatedUser.js",
    "src/core/ensureAppUser.js",
    "src/core/provisionNewUser.js",
    "src/integrations/tokens.js",
    "src/integrations/github.js",
    "src/api/integrations.js",
    "src/api/integrations/connect.js",
    "src/api/settings-integrations.js",
    # Dashboard gate
    "src/core/media-r2-access.js",
    "src/api/workspace.js",
    "src/api/workspaces.js",
    "src/api/settings-workspace.js",
    # Key Worker APIs
    "src/api/r2-api.js",
    "src/api/agent.js",
    "src/api/agentsam.js",
    "src/api/settings.js",
    "src/api/settings-api-keys.js",
    "src/api/unified-search.js",
    "src/api/vault.js",
    "src/api/storage.js",
    # Dashboard React
    "dashboard/App.tsx",
    "dashboard/src/lib/supabase.ts",
    "dashboard/features/agent-chat/ChatAssistant.tsx",
    "dashboard/components/auth/AuthSignInPage.tsx",
    "dashboard/components/auth/AuthSignUpPage.tsx",
]

# Patterns that indicate potential identity issues
PATTERNS = {
    # Hardcoded env vars used as user identity (should never substitute user_id)
    "hardcoded_tenant": [
        r'env\.TENANT_ID',
        r'env\.WORKSPACE_ID',
        r'"tenant_inneranimalmedia"',
        r'"ws_inneranimalmedia"',
        r'tenant_sam_primeaux',
    ],
    # Correct: reading user_id from session/JWT
    "user_id_from_session": [
        r'user_id.*session',
        r'session.*user_id',
        r'actor\.user_id',
        r'identity\.user_id',
        r'getUserId',
        r'extractUserId',
        r'req\.user_id',
        r'ctx\.user_id',
    ],
    # OAuth token storage — should always include user_id
    "oauth_token_write": [
        r'upsertOauthToken',
        r'INSERT.*user_oauth_tokens',
        r'user_oauth_tokens.*INSERT',
        r'storeToken',
        r'saveToken',
    ],
    # OAuth token read — check if scoped by user_id
    "oauth_token_read": [
        r'getOauthToken',
        r'SELECT.*user_oauth_tokens',
        r'user_oauth_tokens.*SELECT',
        r'getUserToken',
        r'readToken',
    ],
    # Plaintext secret storage (bad)
    "plaintext_secrets": [
        r'access_token\s*=\s*["\'](?!.*encrypt)',
        r'secret_key\s*=\s*["\']',
        r'INSERT.*access_token.*VALUES',
        r'\.access_token\s*,(?!.*encrypt)',
    ],
    # Encrypted secret storage (good)
    "encrypted_secrets": [
        r'_encrypted',
        r'AES.GCM',
        r'VAULT_MASTER_KEY',
        r'encrypt\(',
        r'decrypt\(',
    ],
    # Session extraction patterns
    "session_extraction": [
        r'getSession',
        r'verifySession',
        r'parseSession',
        r'sessionId',
        r'cookie.*session',
        r'Authorization.*Bearer',
        r'jwt\.verify',
        r'JWT\.verify',
    ],
    # Cross-tenant risk: workspace/tenant used where user_id expected
    "cross_tenant_risk": [
        r'WHERE tenant_id\s*=.*(?!user)',
        r'WHERE workspace_id\s*=.*(?!user)',
        r'tenant_id.*instead.*user',
        r'scope.*tenant(?!.*user_id)',
    ],
    # R2 credential resolution
    "r2_credentials": [
        r'R2_ACCESS_KEY',
        r'R2_SECRET',
        r'r2_access_key',
        r'r2_secret',
        r'user_storage_access_keys',
        r'cf_account_id',
    ],
    # Google Drive OAuth
    "google_drive": [
        r'google_drive',
        r'google_oauth',
        r'Google.*Drive',
        r'drive\.google',
        r'googleapis',
    ],
    # GitHub OAuth
    "github_oauth": [
        r'github.*token',
        r'GITHUB.*TOKEN',
        r'octokit',
        r'github.*oauth',
        r'github.*user_id',
    ],
}

def read_file(path):
    try:
        with open(REPO_ROOT / path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.readlines()
    except FileNotFoundError:
        return None

def find_pattern_matches(lines, pattern):
    matches = []
    for i, line in enumerate(lines, 1):
        if re.search(pattern, line, re.IGNORECASE):
            matches.append((i, line.rstrip()))
    return matches

def audit_file(filepath):
    lines = read_file(filepath)
    if lines is None:
        return None

    results = {
        "path": filepath,
        "exists": True,
        "line_count": len(lines),
        "findings": defaultdict(list),
        "summary": {}
    }

    for category, patterns in PATTERNS.items():
        for pattern in patterns:
            matches = find_pattern_matches(lines, pattern)
            if matches:
                results["findings"][category].extend([
                    {"line": ln, "content": content, "pattern": pattern}
                    for ln, content in matches
                ])

    # Deduplicate by line number within each category
    for category in results["findings"]:
        seen = set()
        deduped = []
        for item in results["findings"][category]:
            if item["line"] not in seen:
                seen.add(item["line"])
                deduped.append(item)
        results["findings"][category] = deduped

    results["summary"] = {cat: len(items) for cat, items in results["findings"].items() if items}
    return results

def check_missing_files(file_list):
    missing = []
    for f in file_list:
        if not (REPO_ROOT / f).exists():
            missing.append(f)
    return missing

def analyze_r2_scoping(results_map):
    """Check if r2-api.js properly scopes by user_id vs env vars"""
    r2 = results_map.get("src/api/r2-api.js")
    if not r2:
        return ["r2-api.js NOT FOUND"]

    issues = []
    findings = r2["findings"]

    has_user_scoping = bool(findings.get("user_id_from_session"))
    has_env_fallback = bool(findings.get("hardcoded_tenant"))
    has_r2_creds = bool(findings.get("r2_credentials"))
    has_encrypted = bool(findings.get("encrypted_secrets"))

    if not has_user_scoping:
        issues.append("CRITICAL: r2-api.js does not extract user_id from session — all requests use same credentials")
    if has_env_fallback:
        issues.append("WARNING: r2-api.js references hardcoded TENANT_ID/WORKSPACE_ID env vars")
    if has_r2_creds and not has_encrypted:
        issues.append("WARNING: R2 credentials referenced but no encryption pattern found")
    if not has_r2_creds:
        issues.append("INFO: No R2 credential resolution found in r2-api.js yet")

    return issues

def analyze_oauth_flow(results_map):
    """Check if OAuth callbacks properly store tokens with user_id"""
    issues = []

    oauth_files = ["src/api/oauth.js", "src/api/oauth-login-callbacks.js"]
    for f in oauth_files:
        result = results_map.get(f)
        if not result:
            continue

        findings = result["findings"]
        has_write = bool(findings.get("oauth_token_write"))
        has_user_id = bool(findings.get("user_id_from_session"))
        has_encrypted = bool(findings.get("encrypted_secrets"))

        if has_write and not has_user_id:
            issues.append(f"CRITICAL: {f} writes OAuth tokens but no user_id extraction found — tokens may not be user-scoped")
        if has_write and not has_encrypted:
            issues.append(f"WARNING: {f} writes OAuth tokens — verify encryption is applied")

    # Check Google Drive specifically
    gd_files = [f for f, r in results_map.items() if r and r["findings"].get("google_drive")]
    if not gd_files:
        issues.append("WARNING: No Google Drive OAuth handling found — may explain why Drive connect doesn't persist")

    return issues

def analyze_identity_propagation(results_map):
    """Find files that use tenant/workspace ID where user_id should be used"""
    issues = []

    for filepath, result in results_map.items():
        if not result:
            continue
        findings = result["findings"]

        hardcoded = findings.get("hardcoded_tenant", [])
        has_user_id = bool(findings.get("user_id_from_session"))

        if hardcoded and not has_user_id:
            issues.append({
                "file": filepath,
                "severity": "HIGH",
                "issue": "Uses hardcoded TENANT_ID/WORKSPACE_ID with no user_id resolution",
                "lines": [h["line"] for h in hardcoded[:3]]
            })
        elif hardcoded and has_user_id:
            issues.append({
                "file": filepath,
                "severity": "MEDIUM",
                "issue": "Uses both hardcoded env vars AND user_id — verify env vars don't override user scope",
                "lines": [h["line"] for h in hardcoded[:3]]
            })

    return issues

def print_report(results_map, missing_files):
    print("=" * 80)
    print("IAM AUTH & IDENTITY AUDIT REPORT")
    print("=" * 80)
    print()

    # Missing files
    if missing_files:
        print(f"⚠️  MISSING FILES ({len(missing_files)}):")
        for f in missing_files:
            print(f"   - {f}")
        print()

    # R2 scoping analysis
    print("─" * 80)
    print("R2 CREDENTIAL SCOPING")
    print("─" * 80)
    r2_issues = analyze_r2_scoping(results_map)
    for issue in r2_issues:
        print(f"  {issue}")
    print()

    # OAuth flow analysis
    print("─" * 80)
    print("OAUTH TOKEN STORAGE")
    print("─" * 80)
    oauth_issues = analyze_oauth_flow(results_map)
    for issue in oauth_issues:
        print(f"  {issue}")
    print()

    # Identity propagation
    print("─" * 80)
    print("IDENTITY PROPAGATION ISSUES")
    print("─" * 80)
    identity_issues = analyze_identity_propagation(results_map)
    high = [i for i in identity_issues if i["severity"] == "HIGH"]
    medium = [i for i in identity_issues if i["severity"] == "MEDIUM"]

    print(f"  HIGH severity: {len(high)} files")
    for issue in high:
        print(f"    [{issue['file']}] line(s) {issue['lines']}")
        print(f"    → {issue['issue']}")

    print(f"\n  MEDIUM severity: {len(medium)} files")
    for issue in medium[:10]:  # cap output
        print(f"    [{issue['file']}]")
        print(f"    → {issue['issue']}")
    print()

    # Per-file summary
    print("─" * 80)
    print("PER-FILE FINDINGS SUMMARY")
    print("─" * 80)
    for filepath, result in results_map.items():
        if not result:
            print(f"  ✗ {filepath} (not found)")
            continue
        if not result["summary"]:
            continue
        summary_str = ", ".join([f"{k}:{v}" for k, v in result["summary"].items()])
        print(f"  {filepath}")
        print(f"    {summary_str}")
    print()

    # Specific: files with OAuth writes but no encryption
    print("─" * 80)
    print("ENCRYPTION GAPS (OAuth/secret writes without encryption pattern)")
    print("─" * 80)
    for filepath, result in results_map.items():
        if not result:
            continue
        has_writes = result["findings"].get("oauth_token_write") or result["findings"].get("plaintext_secrets")
        has_encrypt = result["findings"].get("encrypted_secrets")
        if has_writes and not has_encrypt:
            print(f"  ⚠️  {filepath}")
    print()

    # Files handling Google Drive + GitHub
    print("─" * 80)
    print("GOOGLE DRIVE & GITHUB OAUTH HANDLERS")
    print("─" * 80)
    for filepath, result in results_map.items():
        if not result:
            continue
        gd = result["findings"].get("google_drive")
        gh = result["findings"].get("github_oauth")
        if gd:
            print(f"  Google Drive: {filepath} ({len(gd)} refs)")
            for item in gd[:3]:
                print(f"    L{item['line']}: {item['content'][:80]}")
        if gh:
            print(f"  GitHub: {filepath} ({len(gh)} refs)")
            for item in gh[:3]:
                print(f"    L{item['line']}: {item['content'][:80]}")
    print()

    # Hardcoded env var usage — full list
    print("─" * 80)
    print("HARDCODED TENANT/WORKSPACE USAGE (should never be user identity)")
    print("─" * 80)
    for filepath, result in results_map.items():
        if not result:
            continue
        items = result["findings"].get("hardcoded_tenant", [])
        if items:
            print(f"  {filepath} ({len(items)} occurrences)")
            for item in items[:5]:
                print(f"    L{item['line']}: {item['content'][:80]}")
    print()

    print("=" * 80)
    print("AUDIT COMPLETE")
    print("=" * 80)

def main():
    print("Running IAM Auth Audit...")
    print(f"Repo: {REPO_ROOT}")
    print()

    missing = check_missing_files(AUTH_FILES)
    results_map = {}

    for filepath in AUTH_FILES:
        result = audit_file(filepath)
        results_map[filepath] = result

    print_report(results_map, missing)

    # Save JSON for deeper analysis
    output_path = REPO_ROOT / "auth_audit_results.json"
    serializable = {}
    for k, v in results_map.items():
        if v:
            serializable[k] = {
                "path": v["path"],
                "exists": v["exists"],
                "line_count": v["line_count"],
                "findings": {cat: items for cat, items in v["findings"].items()},
                "summary": v["summary"]
            }

    with open(output_path, 'w') as f:
        json.dump(serializable, f, indent=2)

    print(f"\nFull results saved to: {output_path}")

if __name__ == "__main__":
    main()
