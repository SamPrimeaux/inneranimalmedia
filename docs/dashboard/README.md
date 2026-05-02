# Dashboard routes — file map and sizes

This document maps production URLs under `https://inneranimalmedia.com/dashboard/*` to **source files** in this repo and gives **byte-accurate sizes** from a local workspace scan (TypeScript/HTML sources; built artifacts from `agent-dashboard/agent-dashboard/dist` when present).

## Architecture (short)

1. **Auth:** The Worker requires a session for `/dashboard/*` HTML; unauthenticated users go to `/auth/login?next=…`.
2. **HTML shell:** First-party dashboard UI is a **single React SPA** (Vite). The browser loads an HTML shell from the **DASHBOARD** R2 bucket, then `/static/dashboard/agent/agent-dashboard.js` and `.css`.
3. **Routing:** **React Router** in `agent-dashboard/agent-dashboard/App.tsx` chooses the page component from the URL path. All routes below share the same bundle unless code-splitting adds extra chunks.
4. **Worker selection:** For `/dashboard/<segment>/…`, `worker.js` picks the R2 key for the HTML shell. Segments listed in `SPA_ROUTES` use `dashboard/app/agent.html` (with fallbacks). The segment **`agent`** is handled as **`static/dashboard/agent.html`** / `dashboard/agent.html` (not the `SPA_ROUTES` set). **`learn`** is **not** in `SPA_ROUTES` in the current `worker.js`; production should either serve `static/dashboard/learn.html` or **`learn` should be added to `SPA_ROUTES`** next to `overview` so the same SPA shell is used — align Worker with `App.tsx` if anything 404s.

Reference: `worker.js` (dashboard HTML branch, `SPA_ROUTES` near the `/dashboard/` handler).

---

## Built bundle (Vite output)

Paths relative to repo root. Sizes from `stat` on this machine’s `dist/` (minify off in `vite.config.ts`; sourcemaps included — total `dist/` is large).

| Artifact | Path | Size (bytes) | Notes |
|----------|------|--------------|--------|
| Main JS | `agent-dashboard/agent-dashboard/dist/agent-dashboard.js` | 6,987,322 | Entire app + routes (single entry build) |
| Main CSS | `agent-dashboard/agent-dashboard/dist/agent-dashboard.css` | 392,806 | Global styles |
| Vite HTML | `agent-dashboard/agent-dashboard/dist/index.html` | 2,740 | Used as `agent.html` upload in CF deploy script |
| **`dist/` directory total** | `agent-dashboard/agent-dashboard/dist/` | ~45 MB | Includes `.map`, fonts, many Rollup chunks |

**Shell HTML (repo source, not the Vite output):** `dashboard/agent.html` — 2,080 bytes (published separately to R2 as configured in deploy scripts).

---

## Entry and shared layout

| File | Bytes | Role |
|------|-------|------|
| `agent-dashboard/agent-dashboard/index.tsx` | 576 | React mount |
| `agent-dashboard/agent-dashboard/index.html` | 2,693 | Vite dev/prod template |
| `agent-dashboard/agent-dashboard/App.tsx` | 111,372 | Router, `/dashboard/agent` IDE layout vs other routes, providers |

---

## Per-URL breakdown

For each URL, the **primary UI module** is the **page component** (plus shared `App.tsx` and the single main bundle). Sizes are **source** `.tsx` only unless noted.

### `/dashboard/overview`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/OverviewPage.tsx` | 56,894 |

### `/dashboard/agent`

| Role | Path | Bytes |
|------|------|-------|
| Layout / tabs / IDE | `agent-dashboard/agent-dashboard/App.tsx` (branch when `pathname === '/dashboard/agent'`) | (shared 111,372) |
| Shell HTML (repo) | `dashboard/agent.html` | 2,080 |

Subcomponents include `WorkspaceDashboard`, `ChatAssistant`, `MonacoEditorView`, `XTermShell`, etc. (see imports at top of `App.tsx`).

### `/dashboard/learn`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/LearnPage.tsx` | 8,177 |

### `/dashboard/designstudio`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/DesignStudioPage.tsx` | 31,880 |

### `/dashboard/storage`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/StoragePage.tsx` | 22,944 |

### `/dashboard/integrations`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/IntegrationsPage.tsx` | 52,921 |

### `/dashboard/mcp`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/McpPage.tsx` | 41,689 |

### `/dashboard/database`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/DatabasePage.tsx` | 58,640 |

Related shared UI: `components/DatabaseBrowser.tsx` (imported from other screens too).

### `/dashboard/meet`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/MeetPage.tsx` | 80,989 |
| Context | `agent-dashboard/agent-dashboard/src/MeetContext.tsx` | 1,727 |
| Shell / secondary UI | `agent-dashboard/agent-dashboard/components/MeetShellPanel.tsx` | 10,515 |

### `/dashboard/images`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/ImagesPage.tsx` | 33,504 |

### `/dashboard/mail`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/MailPage.tsx` | 67,884 |

### `/dashboard/settings`

| Role | Path | Bytes |
|------|------|-------|
| Page | `agent-dashboard/agent-dashboard/components/SettingsPanel.tsx` | 202,786 |

Rendered by `<Route path="/dashboard/settings" element={<SettingsPanel … />} />` in `App.tsx`.

---

## Directory tree (trimmed)

Rough sizes: **`components/`** tree ~**1.4 MB** source total; **`dist/`** ~**45 MB** built (maps + chunks).

```
agent-dashboard/agent-dashboard/
├── index.html                    (~2.7 KB)
├── index.tsx                     (~0.6 KB)
├── App.tsx                       (~109 KB)     # all /dashboard routes + /dashboard/agent IDE
├── vite.config.ts
├── components/
│   ├── OverviewPage.tsx          (~56 KB)
│   ├── LearnPage.tsx             (~8 KB)
│   ├── DatabasePage.tsx          (~57 KB)
│   ├── McpPage.tsx               (~41 KB)
│   ├── IntegrationsPage.tsx      (~52 KB)
│   ├── DesignStudioPage.tsx      (~31 KB)
│   ├── StoragePage.tsx           (~22 KB)
│   ├── ImagesPage.tsx            (~33 KB)
│   ├── MailPage.tsx              (~66 KB)
│   ├── MeetPage.tsx              (~79 KB)
│   ├── MeetShellPanel.tsx        (~10 KB)
│   ├── SettingsPanel.tsx         (~198 KB)
│   ├── …                         # ChatAssistant, WorkspaceDashboard, etc. (shared)
│   └── …
├── src/
│   ├── MeetContext.tsx           (~1.7 KB)
│   └── …
└── dist/                         (~45 MB total; main bundle ~6.7 MB JS, ~383 KB CSS)
```

```
dashboard/
├── agent.html                    (~2 KB)       # HTML shell variant for /dashboard/agent path in Worker
└── …                             # legacy / other static dashboard HTML (not all used by unified SPA)
```

---

## API / Worker (not sized here)

- **Worker:** `worker.js` — dashboard HTML routing, static asset paths under `static/dashboard/agent/`, R2 keys `dashboard/app/…`.
- **Modular Worker entry (if used in your deploy):** `src/index.js` + `src/core/router.js` for `/api/*` (this repo may dual-track; follow your active production deploy).

---

## Regenerating sizes

From repo root (macOS):

```bash
stat -f "%z %N" agent-dashboard/agent-dashboard/components/{OverviewPage,LearnPage,DatabasePage,McpPage,IntegrationsPage,DesignStudioPage,StoragePage,ImagesPage,MailPage,MeetPage}.tsx
stat -f "%z %N" agent-dashboard/agent-dashboard/components/SettingsPanel.tsx
stat -f "%z %N" agent-dashboard/agent-dashboard/dist/agent-dashboard.js agent-dashboard/agent-dashboard/dist/agent-dashboard.css
```

---

*Last updated: 2026-04-30 — file sizes from local `stat` on this checkout.*
