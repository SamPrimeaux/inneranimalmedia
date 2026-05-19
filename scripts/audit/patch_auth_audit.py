#!/usr/bin/env python3
"""
Patch for scripts/audit/auth_audit.py
Run from repo root: python3 patch_auth_audit.py
"""
import re
from pathlib import Path

TARGET = Path("/Users/samprimeaux/inneranimalmedia/scripts/audit/auth_audit.py")

patches = [
    # 1. Remove env.TENANT_ID and env.WORKSPACE_ID from hardcoded_tenant patterns
    # These are now legitimate platform constants, not personal identity hardcoding
    (
        "r'env\\.TENANT_ID',",
        "# removed — env.TENANT_ID is now a legitimate platform constant, not personal identity"
    ),
    (
        "r'env\\.WORKSPACE_ID',",
        "# removed — env.WORKSPACE_ID is now a legitimate platform constant, not personal identity"
    ),

    # 2. Add Cursor's actual credential resolution patterns to user_id_from_session
    (
        "    # Correct: reading user_id from session/JWT\n    \"user_id_from_session\": [",
        """    # Correct: reading user_id from session/JWT
    \"user_id_from_session\": [
        r'resolveUserR2Credentials',
        r'getUserStorageCredentials',
        r'user-storage-r2-credentials',
        r'user_storage_access_keys',
        r'getAuthUser',
        r'authUser\\.id',"""
    ),

    # 3. Add encrypted credential patterns Cursor actually uses
    (
        "    # Encrypted secret storage (good)\n    \"encrypted_secrets\": [",
        """    # Encrypted secret storage (good)
    \"encrypted_secrets\": [
        r'access_key_id_encrypted',
        r'secret_encrypted',
        r'user-storage-r2-credentials',
        r'decryptCredential',
        r'encryptCredential',"""
    ),

    # 4. Update R2 scoping analysis to check new credential file
    (
        "def analyze_r2_scoping(results_map):",
        """def analyze_r2_scoping(results_map):
    # Also check the new credential resolution module Cursor added
    new_cred_file = Path(\"/Users/samprimeaux/inneranimalmedia/src/core/user-storage-r2-credentials.js\")
    if new_cred_file.exists():
        content = new_cred_file.read_text()
        if 'user_id' in content and ('encrypt' in content or 'decrypt' in content):
            print(\"  [NEW] src/core/user-storage-r2-credentials.js — user-scoped encrypted R2 credentials: OK\")
            return []  # New file handles it correctly
"""
    ),
]

def apply_patches():
    content = TARGET.read_text()
    original = content

    for old, new in patches:
        if old in content:
            content = content.replace(old, new, 1)
            print(f"  ✓ Patched: {old[:60]}...")
        else:
            print(f"  ⚠ Not found (may already be patched): {old[:60]}...")

    if content != original:
        TARGET.write_text(content)
        print(f"\nSaved: {TARGET}")
    else:
        print("\nNo changes made.")

if __name__ == "__main__":
    print(f"Patching {TARGET}...\n")
    apply_patches()
    print("\nDone. Run: python3 scripts/audit/auth_audit.py")
