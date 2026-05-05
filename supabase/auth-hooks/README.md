# Supabase Auth Hooks (reference)

This project uses **HTTP hooks** implemented on the Cloudflare Worker:

- `POST /api/auth-hooks/send-email`
- `POST /api/auth-hooks/custom-access-token`
- `POST /api/auth-hooks/before-user-created`

Configure URLs and `AUTH_HOOK_SECRET` in the Supabase Dashboard (Authentication → Hooks). SQL files in this folder are optional notes only; production behavior lives in `src/api/auth-hooks.js`.
