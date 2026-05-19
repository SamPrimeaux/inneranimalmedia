# IAM Platform — Next Chat Handoff
**Date:** May 18, 2026 (evening session continuation)
**Repo:** `SamPrimeaux/inneranimalmedia`
**Working dir:** `/Users/samprimeaux/inneranimalmedia`
**Live URL:** `https://inneranimalmedia.com/dashboard/agent`
**Worker version:** `71fd6d65-aaa2-48cc-a9ed-571d52db53f6`

---

## What We Accomplished Today (Full Session)

- Killed hardcoded personal identity (`tenant_sam_primeaux`, `ws_inneranimalmedia`, `usr_sam_primeaux`) across 10 files
- Fixed 403 guardrail bug blocking all logged-in users
- Consolidated `sessions` → `auth_users` (one session table)
- Fixed OAuth token keying — was storing by email, now stores by `au_*` user ID
- Dropped `users` table entirely — redirected all 8 references to `auth_users`
- Dropped `user_storage_preferences` (empty, redundant)
- Dropped `auth_user_identities` (4 rows, 1 code reference, redundant)
- Fixed `ensureAppUser.js` — new users now get their own `tenant_id` generated at signup
- Fixed `provisionNewUser.js` — same tenant generation, no fallback
- User-scoped encrypted R2 credentials via `user_storage_access_keys`
- Auth audit passes: 0 HIGH severity, 0 MEDIUM severity, 0 hardcoded personal values
- Cleaned orphan OAuth tokens (Connor's token pointed at Sam's Google account — deleted)
- Fixed Google Drive OAuth callback to use `upsertOauthToken` + write `integration_registry`
- Fixed GitHub file tree route — `/api/github/repos/:owner/:repo/contents` was missing
- General settings profile UI shipped (Cursor)
- Pending frontend deploy: `npm run deploy:frontend`

---

## Auth Audit Current State

Run audit anytime:
```bash
python3 /Users/samprimeaux/inneranimalmedia/scripts/audit/auth_audit.py
```

**Clean:**
- HARDCODED TENANT/WORKSPACE: 0 files
- HIGH severity identity propagation: 0 files
- MEDIUM severity: 0 files
- R2 credential scoping: OK (user-scoped encrypted)

**Remaining issues to fix in this session:**

---

## Issue 1 — Encryption Gaps (audit flags these 2 files)

```
⚠️  src/api/oauth-login-callbacks.js
⚠️  src/api/integrations.js
```

### What the audit is checking
The audit looks for OAuth token writes (`oauth_token_write` pattern) without an encryption pattern (`_encrypted`, `VAULT_MASTER_KEY`, etc.) in the same file.

### oauth-login-callbacks.js status
Cursor fixed the Google Drive `connectDrive` block today — it now uses `upsertOauthToken` which handles AES-GCM encryption. The audit flag may be a false positive because the audit pattern doesn't recognize `upsertOauthToken` as an encrypted write.

**Verify with these greps FIRST before touching anything:**
```bash
# Does connectDrive still use raw INSERT or upsertOauthToken?
grep -n "INSERT.*user_oauth_tokens\|upsertOauthToken" /Users/samprimeaux/inneranimalmedia/src/api/oauth-login-callbacks.js

# Does connectGitHub use raw INSERT or upsertOauthToken?
grep -n "INSERT.*user_oauth_tokens\|upsertOauthToken" /Users/samprimeaux/inneranimalmedia/src/api/oauth-login-callbacks.js | head -20

# Are there any plaintext access_token writes remaining?
grep -n "access_token\b" /Users/samprimeaux/inneranimalmedia/src/api/oauth-login-callbacks.js | grep -v "encrypted\|upsert\|header\|Bearer\|refresh"
```

**Expected results:**
- `upsertOauthToken` should appear for both connectDrive and connectGitHub
- No raw `INSERT INTO user_oauth_tokens` with plaintext `access_token`
- If raw INSERTs still exist → fix them to use `upsertOauthToken`

### integrations.js status
This is the real problem. `integrations.js` has `plaintext_secrets:1` and `cross_tenant_risk:16`. It writes OAuth tokens somewhere without confirmed encryption.

**Audit these first:**
```bash
# Find every INSERT into user_oauth_tokens in integrations.js
grep -n "INSERT.*user_oauth_tokens\|upsertOauthToken\|access_token" /Users/samprimeaux/inneranimalmedia/src/api/integrations.js | head -30

# Find plaintext secret writes
grep -n "access_token\s*=\|\.access_token\b" /Users/samprimeaux/inneranimalmedia/src/api/integrations.js | grep -v "encrypted\|upsert\|Bearer\|header" | head -20

# Check what upsertOauthToken is imported from
grep -n "import.*upsertOauthToken\|require.*upsertOauthToken" /Users/samprimeaux/inneranimalmedia/src/api/integrations.js
```

**Fix:** Any raw `INSERT INTO user_oauth_tokens` with plaintext `access_token` in `integrations.js` must be replaced with `upsertOauthToken` imported from `./oauth.js`. That function handles AES-GCM encryption via `VAULT_MASTER_KEY` automatically.

---

## Issue 2 — Cross-Tenant Risks

Audit shows `cross_tenant_risk` hits in:
- `src/api/onboarding.js` — 8 hits
- `src/api/workspaces.js` — 8 hits  
- `src/api/settings.js` — 24 hits
- `src/api/settings-workspace.js` — 10 hits
- `src/api/storage.js` — 9 hits
- `src/api/provisioning.js` — 5 hits
- `src/core/bootstrap.js` — 3 hits

### What cross_tenant_risk means
The audit pattern catches `WHERE tenant_id = ?` queries that don't also filter by `user_id`. This means one tenant could theoretically access another tenant's data if they know the tenant ID.

### Audit approach — greps first, fixes second
For each file, run:
```bash
# settings.js — worst offender (24 hits)
grep -n "WHERE tenant_id\|AND tenant_id\|tenant_id =" /Users/samprimeaux/inneranimalmedia/src/api/settings.js | grep -v "user_id\|authUser\|session" | head -20

# workspaces.js
grep -n "WHERE tenant_id\|AND tenant_id" /Users/samprimeaux/inneranimalmedia/src/api/workspaces.js | grep -v "user_id\|authUser" | head -20

# onboarding.js
grep -n "WHERE tenant_id\|AND tenant_id" /Users/samprimeaux/inneranimalmedia/src/api/onboarding.js | grep -v "user_id\|authUser" | head -20
```

### The fix pattern
Every query that filters by `tenant_id` should also filter by `user_id` from the authenticated session:

```javascript
// WRONG — tenant scoped only
WHERE tenant_id = ?

// RIGHT — tenant + user scoped
WHERE tenant_id = ? AND user_id = ?
```

The `user_id` always comes from `authUser.id` resolved from the session JWT — never from the request body or query params.

### Priority order
Fix `settings.js` first (24 hits, most-used), then `workspaces.js` (8), then `onboarding.js` (8). Use `sed` for simple pattern replacements, Python for multi-line blocks.

---

## Key Rules For This Session

1. **Audit with greps before ANY fix** — never touch a file blind
2. **Use `sed -i ''` for single-line replacements** — verify with `sed -n` first
3. **Use Python for multi-line block removals** — same pattern as today's users table cleanup
4. **Verify zero remaining hits after each fix** with grep before moving to next file
5. **Commit + deploy atomically** — no half-fixed states in production
6. **Never use Cursor** for auth/identity changes — terminal only
7. **Run auth audit after all fixes** to confirm clean

---

## Deploy State

Commits on `main` not yet in R2 (need `npm run deploy:frontend`):
- General settings profile UI
- Google Drive popup OAuth fix
- GitHub file tree route
- `ensureAppUser` tenant generation fix
- `auth_sessions` consolidation

Run this before starting fixes:
```bash
npm run deploy:frontend
```

Then test:
1. Hard refresh `/dashboard/agent`
2. GitHub Sync → click `inneranimalmedia` repo → file tree should load
3. Google Drive → Connect → popup should open → after Allow → Explorer refreshes
4. Settings → General → profile fields should be visible

---

## DB State

**Single user table:** `auth_users` (`au_*` IDs) — canonical, everything reads from here
**Dropped today:** `users`, `user_storage_preferences`, `auth_user_identities`
**Session table:** `auth_sessions` only (consolidated from dual `sessions`/`auth_sessions`)
**OAuth tokens:** `user_oauth_tokens` keyed by `au_*` user ID, AES-GCM encrypted via `VAULT_MASTER_KEY`
**R2 credentials:** `user_storage_access_keys` — encrypted, user-scoped

**Known users:**
- Sam: `au_871d920d1233cbd1` / `tenant_sam_primeaux` / `info@inneranimals.com`
- Connor: `au_5d17673408aaebc7` / `tenant_connor_mcneely` / `connordmcneely@leadershiplegacydigital.com`
