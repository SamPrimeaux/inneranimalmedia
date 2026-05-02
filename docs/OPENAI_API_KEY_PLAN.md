# Quick plan: OpenAI API keys → Cloudflare Worker

**Goal:** Collect new OpenAI API key(s), store them securely in the Worker, use a temp key to finish current work.

---

## Deployment record

| Version ID | Configured |
|------------|------------|
| `959655b0-73e4-4a1c-aab4-779b7b2875c9` | **OPENAI_API_KEY** (encrypted), **MYBROWSER** (browser binding) |

---

## 1. Plan (order of operations)

| Step | What to do |
|------|------------|
| 1 | Get new OpenAI API key(s) from [platform.openai.com](https://platform.openai.com/api-keys). Create one for production and (optional) one temp for finishing work. |
| 2 | Add the key(s) as **Encrypted** env in Cloudflare Dashboard (see below). Use plain key string only. |
| 3 | Use **temp key** for now; when ready, switch the Worker to use the production key (same variable name or a second one). |
| 4 | In the Worker, read with `env.OPENAI_API_KEY` (or `env.OPENAI_API_KEY_TEMP` if you use two vars). Never commit keys to git or put in `wrangler.production.toml`. |

---

## 2. How to format and save in Cloudflare Dashboard

### Where to go

1. **Cloudflare Dashboard** → **Workers & Pages** → open **inneranimalmedia**.
2. **Settings** tab → **Variables and Secrets**.
3. Under **Encrypted** (secrets), click **Add** (or **Edit** if you already have one).

### Format for the value

- **Variable name (recommended):** `OPENAI_API_KEY`  
  - For a temp key you can use the same name and overwrite later, or add a second: `OPENAI_API_KEY_TEMP`.
- **Value:** Paste the key **exactly as OpenAI gives it** — a single string like `sk-proj-...` or `sk-...`.  
  - No extra quotes, no JSON, no `OPENAI_API_KEY=`. Just the key.

### Add the secret

- **Variable name:** `OPENAI_API_KEY` (or `OPENAI_API_KEY_TEMP` for the temp key).
- **Value:** (paste key).
- **Encrypted:** leave as **Encrypted** (default).  
- Save. Redeploy the Worker if it says so, or wait for the next deploy — secrets are picked up on deploy.

---

## 3. Using it in the Worker

- In `worker.js`, the key is available as:
  - `env.OPENAI_API_KEY` (if you added that variable name), or  
  - `env.OPENAI_API_KEY_TEMP` (if you added that for the temp key).
- Check before use (same pattern as your OAuth secrets):

```js
if (!env.OPENAI_API_KEY) {
  return jsonResponse({ error: 'OpenAI not configured' }, 503);
}
// then use env.OPENAI_API_KEY in fetch() to OpenAI API
```

- **Do not** put the key in `wrangler.production.toml` or in `[vars]` — those are plaintext. Use **Variables and Secrets → Encrypted** only.

---

## 4. Optional: two keys (temp vs production)

- Add two encrypted variables: `OPENAI_API_KEY` (production) and `OPENAI_API_KEY_TEMP` (temp).
- In code, prefer temp while finishing work, e.g.  
  `const key = env.OPENAI_API_KEY_TEMP || env.OPENAI_API_KEY;`
- When done, remove or stop using `OPENAI_API_KEY_TEMP` and rely on `OPENAI_API_KEY`.

---

## 5. Checklist

- [x] New OpenAI key(s) created.
- [x] Key(s) added under **Workers & Pages → inneranimalmedia → Settings → Variables and Secrets → Encrypted**.
- [x] Variable name(s): `OPENAI_API_KEY` and/or `OPENAI_API_KEY_TEMP`.
- [x] Value = raw key string only.
- [ ] Worker code uses `env.OPENAI_API_KEY` (and optionally temp) and never logs or exposes the key.
- [x] Key not in git or `wrangler.production.toml`.

Once the temp key is in the dashboard, we can wire it into any route or AI flow you want to finish next.
