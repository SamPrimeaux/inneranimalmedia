# R2 upload — dashboard-agent-audit series

**Last successful upload:** 2026-05-28

## Outcome

**Upload succeeded.** All **29** Markdown files are in R2.

| Field | Value |
|-------|--------|
| Bucket | `inneranimalmedia-autorag` |
| Prefix | `knowledge/agentsam/dashboard-agent-audit/` |
| Tool | `scripts/upload-dashboard-agent-audit-to-autorag.sh` |
| Wrangler | `npx wrangler r2 object put` with `--remote -c wrangler.production.toml` |
| File count | 29 |

## Verification

Spot-check (requires valid `CLOUDFLARE_API_TOKEN` with R2 read):

```bash
npx wrangler r2 object get inneranimalmedia-autorag/knowledge/agentsam/dashboard-agent-audit/README.md \
  --remote -c wrangler.production.toml --file /tmp/audit-readme.md
head -5 /tmp/audit-readme.md
```

## Prior failures (resolved)

- **2026-05-28 (early):** Cloud Agent runtime secret had invalid token (`/user/tokens/verify` → 401). Fixed by using a valid User API Token with R2 Edit on `inneranimalmedia-autorag`.
- **zsh:** `with-cloudflare-env.sh` needs zsh; upload script falls back to `npx wrangler` when zsh is missing.

## Credentials

See [r2-upload-credentials.md](./r2-upload-credentials.md). **Never commit tokens.** Store only in Cursor Secrets or `.env.cloudflare`.

## After upload

- [x] Objects written under `knowledge/agentsam/dashboard-agent-audit/`
- [x] [README.md](./README.md) upload status → **R2 mirrored**
- [ ] Optional: re-index AutoRAG / Vectorize for prefix `knowledge/agentsam/dashboard-agent-audit/` (chunk 22)

## Files uploaded

All paths in [r2-upload-manifest.json](./r2-upload-manifest.json), including:

- `README.md`
- `00-series-conventions.md` … `25-dashboard-agent-master-backlog.md`
- `r2-upload-credentials.md`, `r2-upload-notes.md`
