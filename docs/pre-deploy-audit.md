# Pre-deploy audit (Inner Animal Media Worker / dashboard)

Run every verification below **in order**. Fix anything that fails. **Do not stage until all checks pass.**

---

## AUDIT 1 — OAuth token resolver exists and is exported

```bash
grep -n "resolveOAuthAccessToken\|resolveOAuthRefreshToken" src/api/oauth.js
```

Must show both functions defined and exported. If either is missing, add them before continuing.

---

## AUDIT 2 — No remaining raw `.access_token` reads from D1 rows

```bash
grep -rn "tokenRow\.access_token\|token\.access_token\|gmailTok\.access_token\|tok\.access_token\|gdrive\.access_token" \
  src/api/integrations.js src/api/mail.js src/api/draw.js src/integrations/github.js 2>/dev/null
```

Must return **zero** results. Any hit means the fix was missed at that line.

---

## AUDIT 3 — GitHub/Drive token SELECTs used for API calls include encrypted columns

```bash
grep -rn "SELECT.*access_token.*FROM user_oauth_tokens\|FROM user_oauth_tokens" \
  src/api/integrations.js src/api/mail.js src/api/draw.js src/integrations/github.js \
  src/api/oauth.js 2>/dev/null | grep -v "\.md:"
```

Every SELECT that returns a row **used for API calls** must include `access_token_encrypted` and `refresh_token_encrypted` (or delegate to `getIntegrationOAuthRow` / `SELECT *` where appropriate). Listing-only queries that never send bearer tokens may omit them.

---

## AUDIT 4 — Google Drive refresh is real (not only comments)

```bash
grep -n "oauth2.googleapis.com/token\|grant_type.*refresh_token\|refresh_token_encrypted" \
  src/api/draw.js src/api/oauth.js src/api/mail.js 2>/dev/null
```

Must show at least one `oauth2.googleapis.com/token` usage with `grant_type: 'refresh_token'` that persists back to D1 (typically in `oauth.js`, `mail.js`, or `src/core/user-oauth-token.js` via `getIntegrationToken`).

---

## AUDIT 5 — Anthropic model keys are clean

```bash
grep -rn "claude-haiku-4-5[^-]\|claude-sonnet-4-5\|claude-haiku-3\b\|claude-haiku-4\.5\|claude-sonnet-4\.5\|claude-sonnet-3\." \
  src/ 2>/dev/null | grep -v "\.md:\|migration\|deprecated\|DEPRECATED"
```

Must return **zero** results. Any hit is a stale hardcoded model id.

---

## AUDIT 6 — Compaction beta string is correct

```bash
grep -rn "compaction\|compact" src/integrations/anthropic.js
```

Must show `compact-2026-01-12` only for compaction. Must **not** show `compaction-2026-03-24`.

---

## AUDIT 7 — Betas are gated (no unconditional pushes)

```bash
grep -n "betas.push\|betas =" src/integrations/anthropic.js
```

Every `betas.push` must sit inside an `if` (or equivalent guard). Zero unconditional pushes beyond initializing `betas` from options/features.

---

## AUDIT 8 — `pause_turn` loop is complete

```bash
grep -n "pause_turn\|PAUSE_TURN_MAX\|containerId\|pauseIterations" src/api/agent.js
```

Must show: `PAUSE_TURN_MAX`, `pause_turn` handling, `containerId`, `pauseIterations`, and the guard `if (pauseIterations >= PAUSE_TURN_MAX)` (or equivalent).

---

## AUDIT 9 — Tool search and code execution in Anthropic tools builder

```bash
grep -n "tool_search_tool_bm25\|code_execution_2026\|code_execution_2025\|defer_loading\|buildAnthropicMessagesTools" \
  src/integrations/anthropic.js
```

Must include: `tool_search_tool_bm25_20251119`, either `code_execution_20260120` or `code_execution_20250825`, `defer_loading: true` on MCP tools where applicable, and the exported builder name.

---

## AUDIT 10 — Python tool wired end to end

```bash
grep -n "python_execute\|PYTHON_TOOLS" src/tools/ai-dispatch.js src/tools/builtin/python.js
```

Must show the tool definition in `python.js` and the `python_execute` dispatch branch in `ai-dispatch.js`.

---

## AUDIT 11 — Anthropic webhook handler is complete

```bash
grep -n "agentsam_webhook_events\|X-Webhook-Signature\|whsec_\|ANTHROPIC_WEBHOOK" \
  src/api/webhooks/anthropic.js src/core/anthropic-webhook-verify.js 2>/dev/null
```

Must show D1 insert, signature header read, `whsec_` handling, and env-based signing secret. No `TODO` or `throw new Error('not implemented')` on the happy path.

---

## AUDIT 12 — ChatAssistant server/tool-search block guard

```bash
grep -n "server_tool_use\|tool_search_tool_result" dashboard/components/ChatAssistant.tsx
```

Must show handling that skips or neutralizes these block types (for example an early return of empty content).

---

## AUDIT 13 — Ghost Anthropic model rows (remote D1)

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  -c wrangler.production.toml \
  --command "SELECT model_key, status FROM agentsam_ai WHERE provider='anthropic' ORDER BY status, model_key"
```

Expect only **`claude-haiku-4-5-20251001`** and **`claude-sonnet-4-6`** with `status='active'` (adjust if product policy changes; document deviations).

---

## AUDIT 14 — Routing arms for deprecated Anthropic models (remote D1)

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  -c wrangler.production.toml \
  --command "SELECT model_key, is_paused, pause_reason FROM agentsam_routing_arms WHERE provider='anthropic' ORDER BY is_paused, model_key"
```

Only intended production models should have `is_paused=0`; deprecated arms should be paused.

---

## AUDIT 15 — `agent_mode_configs.gate_model` resolves to an active row (remote D1)

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  -c wrangler.production.toml \
  --command "SELECT slug, gate_model, model_preference FROM agent_mode_configs WHERE is_active=1"
```

Every `gate_model` must exist as an **`active`** row in `agentsam_ai`. Verify the current gate (often `gpt-5.4-nano`):

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  -c wrangler.production.toml \
  --command "SELECT model_key, status FROM agentsam_ai WHERE model_key='gpt-5.4-nano'"
```

---

## After all 15 audits pass — stage, review, commit, push

```bash
git add \
  src/api/oauth.js \
  src/api/integrations.js \
  src/api/mail.js \
  src/api/draw.js \
  src/integrations/github.js \
  src/integrations/tokens.js \
  src/api/agent.js \
  src/integrations/anthropic.js \
  src/api/webhooks/anthropic.js \
  src/core/anthropic-webhook-verify.js \
  src/tools/builtin/python.js \
  src/tools/ai-dispatch.js \
  dashboard/components/ChatAssistant.tsx \
  dashboard/components/settings/mcp/McpMonacoHost.tsx

git status
# Confirm only intended paths are staged. Unstage extras: git restore --staged <file>

git diff --cached --stat

git commit -m "fix(oauth): decrypt encrypted tokens at all read sites + Google Drive auto-refresh

- resolveOAuthAccessToken/resolveOAuthRefreshToken helpers in oauth.js
- integrations.js GitHub endpoints: encrypted cols + ghToken resolved per handler
- mail.js: gmailAccessToken resolved per handler; SELECT includes encrypted columns
- draw.js: bearer via resolver; Google refresh via getIntegrationOAuthRow / tokens.js
- github.js: integration routes use resolver
- tokens.js: getIntegrationToken → getIntegrationOAuthRow
- anthropic.js: compact-2026-01-12 gated; betas conditional; tool search + code execution
- agent.js: pause_turn loop with PAUSE_TURN_MAX guard
- python.js + ai-dispatch.js: python_execute wired
- ChatAssistant.tsx: server_tool_use / tool_search_tool_result guard
- McpMonacoHost.tsx: monacoLangFromFilename exported"

git push origin main
```

Adjust the commit message body to match the files actually changed in that run.

---

## Notes

- **`src/integrations/tokens.js`** is listed because it routes **`getIntegrationToken`** to **`getIntegrationOAuthRow`** (vault decrypt + Google refresh). Omit it from the commit only when that file did not change.
- Default deploy for production frontend + Worker: **`npm run deploy:full`** from repo root (see `.cursorrules`).
