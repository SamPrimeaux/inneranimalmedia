# OAuth + API key secrets (Wrangler)

This repo deploys the `inneranimalmedia` Worker from the `production` branch.

Set secrets against that Worker:

```bash
cd inneranimalmedia-agentsam-dashboard
```

## Cloudflare OAuth app (account-level access)

Redirect URI:

- `https://inneranimalmedia.com/api/oauth/cloudflare/callback`

Wrangler secrets:

```bash
npx wrangler secret put CLOUDFLARE_OAUTH_CLIENT_ID --name inneranimalmedia --config wrangler.jsonc
npx wrangler secret put CLOUDFLARE_OAUTH_CLIENT_SECRET --name inneranimalmedia --config wrangler.jsonc
```

Temporary placeholders (optional, for shipping endpoints before real creds exist):

```bash
printf '%s' 'TEMP_PLACEHOLDER_CLOUDFLARE_OAUTH_CLIENT_ID' | npx wrangler secret put CLOUDFLARE_OAUTH_CLIENT_ID --name inneranimalmedia --config wrangler.jsonc
printf '%s' 'TEMP_PLACEHOLDER_CLOUDFLARE_OAUTH_CLIENT_SECRET' | npx wrangler secret put CLOUDFLARE_OAUTH_CLIENT_SECRET --name inneranimalmedia --config wrangler.jsonc
```

## Supabase OAuth app (account-level access)

Redirect URI:

- `https://inneranimalmedia.com/api/oauth/supabase/callback`

Wrangler secrets:

```bash
npx wrangler secret put SUPABASE_OAUTH_CLIENT_ID --name inneranimalmedia --config wrangler.jsonc
npx wrangler secret put SUPABASE_OAUTH_CLIENT_SECRET --name inneranimalmedia --config wrangler.jsonc
```

Temporary placeholders (optional):

```bash
printf '%s' 'TEMP_PLACEHOLDER_SUPABASE_OAUTH_CLIENT_ID' | npx wrangler secret put SUPABASE_OAUTH_CLIENT_ID --name inneranimalmedia --config wrangler.jsonc
printf '%s' 'TEMP_PLACEHOLDER_SUPABASE_OAUTH_CLIENT_SECRET' | npx wrangler secret put SUPABASE_OAUTH_CLIENT_SECRET --name inneranimalmedia --config wrangler.jsonc
```

## GitHub OAuth (already configured in production)

```bash
npx wrangler secret put GITHUB_CLIENT_SECRET --name inneranimalmedia --config wrangler.jsonc
```

## Google OAuth (Drive/Gmail/Calendar)

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET --name inneranimalmedia --config wrangler.jsonc
```

## API key providers (platform-level keys)

These are used for server-side integration calls (health checks, sync jobs, etc.).

```bash
npx wrangler secret put OPENAI_API_KEY --name inneranimalmedia --config wrangler.jsonc
npx wrangler secret put ANTHROPIC_API_KEY --name inneranimalmedia --config wrangler.jsonc
npx wrangler secret put GOOGLE_AI_API_KEY --name inneranimalmedia --config wrangler.jsonc
npx wrangler secret put RESEND_API_KEY --name inneranimalmedia --config wrangler.jsonc
```

## Vault encryption (required)

User tokens and API keys are stored **encrypted** in D1 using `VAULT_MASTER_KEY`.

```bash
npx wrangler secret put VAULT_MASTER_KEY --name inneranimalmedia --config wrangler.jsonc
```

