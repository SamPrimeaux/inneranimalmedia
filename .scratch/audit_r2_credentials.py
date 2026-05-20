#!/usr/bin/env python3
"""
Audit user_storage_access_keys — credential storage alignment for T004.
"""
import subprocess
from pathlib import Path

ROOT = Path('/Users/samprimeaux/inneranimalmedia')

def grep(pattern, *paths, context=0, extra_includes=None):
    args = ['grep', '-rn', '--include=*.js', '--include=*.ts', '--include=*.tsx']
    if extra_includes:
        for e in extra_includes:
            args += [f'--include={e}']
    if context:
        args += ['-A', str(context), '-B', str(context)]
    args += [pattern] + [str(p) for p in (paths or [ROOT / 'src', ROOT / 'dashboard'])]
    r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip() or '  (none found)'

SRC = ROOT / 'src'

print('='*70)
print('1. WHO WRITES to user_storage_access_keys')
print('='*70)
print(grep('user_storage_access_keys', SRC, context=3))

print('\n' + '='*70)
print('2. WHO READS / LOADS credentials from user_storage_access_keys')
print('='*70)
print(grep('loadUserCloudflareR2Credentials\|user_storage_access_keys.*SELECT\|SELECT.*user_storage_access_keys', SRC, context=4))

print('\n' + '='*70)
print('3. secret_hash — is it a real hash or an encrypted value?')
print('   (if hashed with bcrypt/SHA it cannot be used to sign R2 requests)')
print('='*70)
print('\n--- secret_hash write sites ---')
print(grep('secret_hash', SRC, context=3))
print('\n--- r2_secret_access_key_encrypted write/read sites ---')
print(grep('r2_secret_access_key_encrypted', SRC, context=3))
print('\n--- secret_encrypted write/read sites ---')
print(grep("secret_encrypted\b", SRC, context=3))
print('\n--- access_key_id_encrypted ---')
print(grep('access_key_id_encrypted', SRC, context=3))

print('\n' + '='*70)
print('4. HOW credentials are used to make actual R2/S3 calls')
print('   (what gets passed to R2Client / S3Client / fetch)')
print('='*70)
print(grep('S3Client\|R2Client\|accessKeyId.*secret\|secretAccessKey\|new.*R2\|createR2', SRC, context=3))

print('\n' + '='*70)
print('5. user_storage_provider_preferences — bucket resolution')
print('='*70)
print(grep('user_storage_provider_preferences\|default_bucket\|preferences_json', SRC, context=3))

print('\n' + '='*70)
print('6. mergeR2S3EnvFromUserStorage — where/how used')
print('='*70)
print(grep('mergeR2S3EnvFromUserStorage', SRC, context=4))

print('\n' + '='*70)
print('7. cf_account_id — is this the users CF account or platform account?')
print('='*70)
print(grep('cf_account_id', SRC, context=2))

print('\n' + '='*70)
print('8. SUMMARY: which column does the ACTUAL working R2 credential live in?')
print('   Checking what gets decrypted before an R2 call...')
print('='*70)
print(grep('decryptWithVault\|aesGcmDecrypt\|decrypt.*r2\|r2.*decrypt', SRC, context=3))
