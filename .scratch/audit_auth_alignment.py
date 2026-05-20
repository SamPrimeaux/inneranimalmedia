#!/usr/bin/env python3
"""
Audit auth_users / auth_sessions / user_oauth_tokens alignment.
Surfaces dual-encryption, orphaned columns, and lookup path inconsistencies.
"""
import subprocess
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')

def grep(pattern, *paths, context=0):
    args = ['grep', '-rn', f'--include=*.js', f'--include=*.ts', f'--include=*.tsx']
    if context:
        args += ['-A', str(context), '-B', str(context)]
    args += [pattern] + [str(p) for p in paths]
    r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip()

SRC = ROOT / 'src'
DASH = ROOT / 'dashboard'

print('='*70)
print('1. DUAL ENCRYPTION — plaintext access_token vs access_token_encrypted')
print('='*70)
print('\n--- Writes to plaintext access_token column ---')
print(grep('access_token.*=.*tok\|INSERT.*access_token[^_]', SRC))
print('\n--- Writes to access_token_encrypted ---')
print(grep('access_token_encrypted', SRC))
print('\n--- vault_access_token_id references (Supabase Vault path?) ---')
print(grep('vault_access_token_id\|vault_refresh_token_id', SRC))

print('\n' + '='*70)
print('2. TOKEN READ PATHS — how tokens are retrieved')
print('='*70)
print('\n--- resolveOAuthAccessToken ---')
print(grep('resolveOAuthAccessToken', SRC, context=3))
print('\n--- getUserGithubToken / getUserGoogleToken / getIntegrationOAuthRow ---')
print(grep('getUserGithubToken\|getUserGoogleToken\|getIntegrationOAuthRow', SRC, context=2))
print('\n--- Direct SELECT from user_oauth_tokens ---')
print(grep('SELECT.*user_oauth_tokens\|FROM user_oauth_tokens', SRC))

print('\n' + '='*70)
print('3. person_uuid SYNC — present in all 3 tables, is it kept in sync?')
print('='*70)
print('\n--- person_uuid written to auth_sessions ---')
print(grep('person_uuid', SRC / 'core' / 'auth.js', context=2))
print('\n--- person_uuid written to user_oauth_tokens ---')
print(grep('person_uuid.*upsert\|upsert.*person_uuid', SRC))

print('\n' + '='*70)
print('4. tenant_id vs active_tenant_id on auth_users')
print('='*70)
print('\n--- auth_users tenant_id writes ---')
print(grep('auth_users.*tenant_id\|tenant_id.*auth_users\|UPDATE auth_users.*tenant', SRC))
print('\n--- active_tenant_id usage ---')
print(grep('active_tenant_id', SRC, context=1))

print('\n' + '='*70)
print('5. auth_sessions.provider — login provider vs integration provider')
print('='*70)
print('\n--- sessions written with provider field ---')
print(grep("provider.*=.*'github'\|provider.*=.*'google'\|provider.*=.*'email'", SRC / 'core' / 'auth.js', context=2))
print('\n--- provider_subject usage ---')
print(grep('provider_subject', SRC, context=1))

print('\n' + '='*70)
print('6. ORPHANED / DUPLICATE COLUMNS to investigate')
print('='*70)
print('\n--- scopes vs scope (both exist on user_oauth_tokens) ---')
print(grep("'scopes'\|\"scopes\"\|\.scopes\b", SRC))
print('\n--- supabase_user_id on auth_users vs auth_sessions ---')
print(grep('supabase_user_id', SRC / 'core', context=1))

print('\n' + '='*70)
print('7. LOGIN vs INTEGRATION OAuth — are they clearly separated?')
print('='*70)
print('\n--- createLoginSession call sites ---')
print(grep('createLoginSession', SRC, context=2))
print('\n--- integration_registry / integration_events writes ---')
print(grep('integration_registry\|integration_events', SRC, context=1))
