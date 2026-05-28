# R2 upload credentials — dashboard-agent-audit mirror

**Never commit API tokens.** This file documents **where** to set secrets, not the secret values.

Target upload: bucket **`inneranimalmedia-autorag`**, prefix **`knowledge/agentsam/dashboard-agent-audit/`**  
Upload script: **`scripts/upload-dashboard-agent-audit-to-autorag.sh`**

---

## 1. Cursor Cloud Agent (so the agent can finish the R2 work)

Cloud Agents run in a remote VM. They **do not** read your Mac’s `.env.cloudflare` (gitignored, not in the clone).

### Where to set `CLOUDFLARE_API_TOKEN`

1. Open **Cursor** → **Settings** (or go to [cursor.com/dashboard/cloud-agents](https://cursor.com/dashboard/cloud-agents)).
2. Open the **Secrets** tab (Cloud Agent setup docs: [Cloud agent setup](https://cursor.com/docs/cloud-agent/setup)).
3. Add or update these **environment variables** (names must match exactly):

| Variable | Required | Notes |
|----------|----------|--------|
| `CLOUDFLARE_API_TOKEN` | Yes | API token with R2 write on `inneranimalmedia-autorag` (see permissions below) |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Must match production: `ede6590ac0d2fb7daf155b35653457b2` (`wrangler.production.toml` `[vars]`) |

4. **Restart** the Cloud Agent (or start a new agent run) after changing secrets — existing VMs do not always pick up new values mid-flight.

### If secrets still fail (401 / code 9109)

- Token is for the **wrong Cloudflare account** (account ID mismatch).
- Token lacks **R2 Object Read & Write** on bucket `inneranimalmedia-autorag`.
- Token expired or was rotated — create a new token and update Secrets.
- Workspace/team scope: secrets are **workspace-scoped**; confirm the agent runs under the same Cursor account where you added them ([Cloud Agents troubleshooting](https://cursor.com/docs/cloud-agent)).

### Optional: repo `environment.json`

You can also declare **names only** in `.cursor/environment.json` (committed); values still come from the **Secrets** tab, not from the file. See [environment configuration](https://cursor.com/docs/cloud-agent/setup). This repo does not require `environment.json` for upload if Secrets are set.

---

## 2. Local machine (Sam / operator retry)

For your Mac or any machine with **zsh** and the repo:

```bash
cp .env.cloudflare.example .env.cloudflare   # once
# Edit .env.cloudflare — never commit
```

Set at minimum:

```bash
CLOUDFLARE_ACCOUNT_ID=ede6590ac0d2fb7daf155b35653457b2
CLOUDFLARE_API_TOKEN=<your_token>
```

Run upload:

```bash
cd /path/to/inneranimalmedia
./scripts/with-cloudflare-env.sh ./scripts/upload-dashboard-agent-audit-to-autorag.sh
```

`.env.cloudflare` is listed in **`.gitignore`** — it must **never** be committed.

---

## 3. Cloudflare API token permissions (Wrangler `r2 object put`)

Create the token in [Cloudflare Dashboard → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens).

**Recommended:** Custom token

| Permission | Access |
|------------|--------|
| Account → **Workers R2 Storage** | **Edit** |
| Account → **Account Settings** | **Read** (Wrangler often needs this) |

**Account resources:** Include account **`ede6590ac0d2fb7daf155b35653457b2`** (Inner Animal Media production).

**Bucket scope:** Restrict to **`inneranimalmedia-autorag`** if the token UI allows; otherwise Edit on R2 for the account is sufficient.

Verify one object before batch upload:

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object put \
  inneranimalmedia-autorag/knowledge/agentsam/dashboard-agent-audit/README.md \
  --file docs/dashboard-agent-audit/README.md \
  --content-type "text/markdown" \
  --remote -c wrangler.production.toml
```

---

## 4. R2 S3 API keys (different from Wrangler upload)

`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` in `.env.cloudflare` are for **S3-compatible** scripts (`deploy-frontend` rclone, `scripts/lib/r2-s3-client.mjs`).  

The **dashboard-agent-audit** upload script uses **Wrangler** + **`CLOUDFLARE_API_TOKEN`**, not the S3 keys.

---

## 5. What is in the repo (safe to commit)

| Path | Purpose |
|------|---------|
| `.env.cloudflare.example` | Template variable **names** only |
| `docs/dashboard-agent-audit/r2-upload-manifest.json` | Object keys to upload |
| `docs/dashboard-agent-audit/r2-upload-notes.md` | Last upload attempt / status |
| `docs/dashboard-agent-audit/r2-upload-credentials.md` | This runbook |
| `scripts/upload-dashboard-agent-audit-to-autorag.sh` | Batch upload script |

After a successful upload, update **`r2-upload-notes.md`** and mark **R2 mirrored** in [README.md](./README.md).
