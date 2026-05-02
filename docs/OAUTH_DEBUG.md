# OAuth debug (Google / GitHub)

When sign-in fails with `?error=token_failed`, the worker now appends **`&reason=...`** with Google’s error code so you can see why the token exchange failed.

---

## 1. See the reason

After a failed Google sign-in, check the URL you’re redirected to:

- `...?error=token_failed&reason=invalid_grant` → redirect_uri mismatch, or code already used/expired
- `...?error=token_failed&reason=invalid_client` → wrong client_id or client_secret, or secret not set in Cloudflare
  - If you also see **`&hint=secret_or_id_not_configured`** → the Worker has no `GOOGLE_OAUTH_CLIENT_SECRET` (or `GOOGLE_CLIENT_ID`) set. Add the secret in Cloudflare Dashboard → Workers → inneranimalmedia → Settings → Variables and Secrets.
  - If there is **no** `hint` → client_id/secret are present but Google rejected them: re-copy the **Client secret** from Google Cloud Console (APIs & Services → Credentials → your OAuth client) and run `npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET` for the inneranimalmedia worker, or update the secret in the Dashboard.
- `...?error=token_failed&reason=invalid_request` → bad request (e.g. missing parameter)
- `...?error=token_failed&reason=unknown` → response wasn’t JSON or had an unexpected error code

---

## 2. Your side: Google Cloud Console

1. **APIs & Services → Credentials**  
   Open the OAuth 2.0 Client ID you use for Inner Animal Media (the one whose Client ID is in `GOOGLE_CLIENT_ID`).

2. **Authorized redirect URIs**  
   Must include **exactly** (no trailing slash):
   - `https://inneranimalmedia.com/api/oauth/google/callback`
   - If users can start from www: `https://www.inneranimalmedia.com/api/oauth/google/callback`  
   The value must match **character-for-character** what we send to Google (we use the same host you used when you clicked “Sign in with Google”).

3. **Client ID and Client secret**  
   - In Cloudflare Dashboard → Workers → inneranimalmedia → Settings → Variables and Secrets:
     - **GOOGLE_CLIENT_ID** (plaintext) = the Client ID from Google (e.g. `427617292678-....apps.googleusercontent.com`).
     - **GOOGLE_OAUTH_CLIENT_SECRET** (secret) = the **Client secret** from that same OAuth client (not the Client ID).  
   If the secret was rotated in Google, create a new secret and update **GOOGLE_OAUTH_CLIENT_SECRET** in Cloudflare.

4. **Application type**  
   The OAuth client must be **Web application** (not Desktop or other).

5. **OAuth consent screen**  
   If the app is in “Testing”, add your Google account as a test user so you can sign in.

---

## 3. Common fixes for `invalid_grant`

- **Redirect URI mismatch**  
  Add the exact callback URL(s) above in Google Cloud Console. No http, no typo, no extra path.

- **Code already used**  
  Authorization codes are one-time use. If you retry by reopening the same callback URL (with the same `?code=...`), Google will return `invalid_grant`. Start again from the sign-in page and click “Sign in with Google” once.

- **Wrong host**  
  If you click “Sign in with Google” on `https://inneranimalmedia.com/auth/signin`, we send `redirect_uri=https://inneranimalmedia.com/api/oauth/google/callback`. If you’re on `https://www.inneranimalmedia.com/auth/signin`, we send the www variant. Both must be in **Authorized redirect URIs** if you use both hosts.

---

## 4. Deploy after code changes

After changing the worker (e.g. adding the `reason` param), deploy so the live worker has the update:

```bash
source ~/.zshrc
cd /Users/samprimeaux/Downloads/march1st-inneranimalmedia
npx wrangler deploy --config wrangler.production.toml
```

Then try Google sign-in again and check the new redirect URL for `reason=...`.

---

## 5. “It worked the other day”

If you see `invalid_client` but nothing changed in Google Console:

- **Cloudflare secret**  
  Secrets are per-Worker and per-account. If you re-deployed from another machine/branch or the Worker was recreated, the **GOOGLE_OAUTH_CLIENT_SECRET** might be missing for this Worker. Set it again in Dashboard → Workers → inneranimalmedia → Settings → Variables and Secrets (Encrypted), or run:
  ```bash
  npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET --config wrangler.production.toml
  ```
  and paste the **Client secret** from Google (same OAuth client as GOOGLE_CLIENT_ID).

- **Wrong OAuth client**  
  If you have multiple Google OAuth clients (e.g. dev vs prod), make sure **GOOGLE_CLIENT_ID** in wrangler vars matches the client whose **Client secret** you put in **GOOGLE_OAUTH_CLIENT_SECRET**. They must be from the same OAuth client.
