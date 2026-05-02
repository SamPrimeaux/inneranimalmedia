# Runbook: R2 upload rules

## Config

- Use `./scripts/with-cloudflare-env.sh` and explicit `-c wrangler.jsonc` (or `wrangler.production.toml` when that is the approved prod config) — never rely on wrong worker config at monorepo root.

## Bucket

- `inneranimalmedia`: dashboard app under `dashboard/app/`, docs under `docs/`.
- Do not confuse with `tools`, `autorag`, `iam-docs`, or `agent-sam` without checking bindings.

## Safety

- No secrets or tokens in R2 objects.
- Content-Type: set `text/markdown` for `.md`, `text/html` for HTML, `application/javascript` for JS.

## MCP

- `r2_write` MCP tool has been unreliable; prefer Worker-side or wrangler CLI for critical uploads.
