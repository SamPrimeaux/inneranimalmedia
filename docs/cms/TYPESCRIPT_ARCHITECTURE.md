# CMS TypeScript Architecture

**Rule:** TypeScript owns contracts and UI. JavaScript stays for the Worker runtime until modules migrate incrementally. Python is for ops/scripts and the `iam-cms-pipeline` HTML intelligence worker.

## Layers

| Layer | Language | Location | Status |
|-------|----------|----------|--------|
| **Contracts** | TS | `src/types/cms.ts` | Canonical — all new shapes go here |
| **Dashboard API client** | TS | `src/dashboard/cms/cmsApi.ts` | Typed fetch wrappers |
| **Dashboard UI** | TSX | `src/dashboard/cms/*.tsx` | Sites, templates, studio shell |
| **Storefront URLs** | TS | `src/core/cms-storefront-url.ts` | Apex domain map |
| **Worker CMS API** | JS | `src/api/cms.js` | Publish, bootstrap, sections (migrate last) |
| **Worker CMS core** | JS | `src/core/cms-*.js` | R2, gates, hydrate (migrate incrementally) |
| **Agent tools** | JS | `src/tools/builtin/cms.js` | Calls shared `cms-agent-publish.ts` + page helpers |
| **Studio editor canvas** | TS (Vite bundle) | `dashboard/cms-editor/` → `dist/cms/cms-editor.js` | Iframe loads ES module (replaces Babel + `cms-editor-core.js`) |
| **Agent publish** | TS | `src/core/cms-agent-publish.ts` | Shared by `POST .../publish` + `agentsam_cms_publish` |
| **Legacy editor source** | JS (deprecated) | `dashboard/public/cms/cms-editor-core.js` | Kept for rollback until bundle verified in prod |
| **Pipeline intelligence** | Python | `iam-cms-pipeline` | Prototype, extract, inject preview |

## Import rule

```ts
// ✅ Dashboard / new code
import type { CmsPage, CmsPublishResponse } from '../../types/cms';
import { publishCmsPage, saveCmsPageHtml } from './cmsApi';

// ❌ Don't duplicate API shapes in loose JS/TS
```

## PrimeTech agent loop (typed)

Defined in `src/types/cms.ts`:

- `CMS_PRIMETECH_AGENT_LOOP` — `read | save | publish | verify`
- `CmsAgentReadResponse`, `CmsAgentPublishResponse`, `CmsAgentVerifyLiveResponse`, …

Dashboard helper: `runCmsPublishAndVerify()` in `cmsApi.ts`.

Agent runtime: `agentsam_cms_*` tools in `src/tools/builtin/cms.js` (implement the same loop server-side).

## Migration order (agreed)

1. ✅ `src/types/cms.ts` + `cmsApi.ts` + TSX studio shell
2. ✅ Agent loop types + API wrappers
3. ✅ Vite bundle `dashboard/cms-editor/` → studio iframe loads `cms-editor.js`
4. ✅ `src/core/cms-agent-publish.ts` — API publish + agent tools share one path
5. **Later:** `src/api/cms.js` → thin router calling TS modules (Workers bundler already compiles TS)

## What stays JS for now

- Worker entry `src/index.js` routing glue
- Most `src/core/cms-*.js` helpers (incremental TS migration)
- Python pipeline (`entry.py`) — not a TS target

## Build

Dashboard CMS TSX compiles via main Vite app (`dashboard/vite.config.ts` → `src/dashboard/cms/` imports).

CMS studio iframe editor: second Vite pass (`dashboard/cms-editor/vite.config.ts`) emits `dist/cms/cms-editor.js` (copied to R2 as `static/dashboard/app/cms/cms-editor.js`).

Worker TS (`cms-storefront-url.ts`, `cms-agent-publish.ts`) is bundled by wrangler/esbuild on deploy — no separate build step.
