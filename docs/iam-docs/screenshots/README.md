# Screenshots in `iam-docs` (DOCS_BUCKET)

## Purpose

The **`iam-docs`** R2 bucket is bound as **`DOCS_BUCKET`** in `wrangler.production.toml`. Agent/browser tool screenshots are stored by **`putAgentBrowserScreenshotToR2`** in `worker.js` (top of file and `runInternalPlaywrightTool`).

## Key layout

| Prefix | Purpose |
|--------|---------|
| `screenshots/agent/` | PNGs from `playwright_screenshot` / `browser_screenshot` and queue jobs when `DOCS_BUCKET` is bound. Filename pattern: `screenshots/agent/{timestamp}-{uuid}.png` (see `worker.js`). |

Optional organizational prefixes (documented for ops; not enforced in worker code):

| Prefix | Suggested use |
|--------|----------------|
| `screenshots/test/` | Manual or UI-test captures (if you adopt a convention) |

## Public URL

When **`DOCS_BUCKET`** is used, the worker returns:

`https://docs.inneranimalmedia.com/screenshots/agent/{timestamp}-{uuid}.png`

Constants: `DOCS_SCREENSHOTS_PUBLIC_BASE = 'https://docs.inneranimalmedia.com'` in `worker.js`.

**Important:** The **worker does not serve GET requests** for these objects from `inneranimalmedia.com`. Public access depends on **Cloudflare R2 custom domain** (or public bucket URL) for `docs.inneranimalmedia.com` pointing at **`iam-docs`**. If `DOCS_BUCKET` is missing at runtime, the worker falls back to **`DASHBOARD`** (`agent-sam`) with legacy `pub-....r2.dev` URLs.

## Worker routing

Screenshot **upload** is via Playwright in the worker (`runInternalPlaywrightTool`, queue consumer ~3953+). There is **no** `fetch` handler in `worker.js` that proxies `GET /screenshots/*` to `DOCS_BUCKET` for the main site; routing is **R2 public access + DNS**, not Worker routes.

## Retention

Automatic expiry (e.g. 14 days for `screenshots/agent/`, 7 days for `screenshots/test/`) is **not implemented in application code** as of this document. Configure **R2 lifecycle rules** in the Cloudflare dashboard on **`iam-docs`** if you need time-based deletion.
