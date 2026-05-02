# Comprehensive Theme System Audit

**Date:** 2026-03-16  
**Purpose:** Map entire theme flow to fix theme_id slug vs id prefix inconsistencies in one deployment.

---

## 1. DATABASE STATE (Query Results)

### What theme values are actually stored?

**user_settings.theme (distinct):**
| theme |
|-------|
| meaux-storm-gray |
| tactical-slate-sage |
| meaux-editor |
| dark |

All stored values are **slug form** (no "theme-" prefix). These match `cms_themes.slug`.

**user_preferences (theme_preset):**  
- Query `SELECT DISTINCT value FROM user_preferences WHERE key = 'theme_preset'` **failed** in production: `no such column: value`.  
- Production table `user_preferences` has schema: `id, user_id, email, theme_id, sidebar_collapsed, notifications_enabled, created_at, updated_at` — i.e. **no key/value columns**. The worker expects a key-value table (`key`, `value`). So **theme_preset fallback in worker.js (lines 806–807) will not work** in production as written; the SELECT uses non-existent columns.

**workspaces.theme_id:**  
- Table `workspaces` exists (id, name, domain, category, status, etc.). Column `theme_id` was not listed in the schema snippet; if present, `SELECT DISTINCT theme_id FROM workspaces WHERE theme_id IS NOT NULL` can be run to list stored values.  
- `/api/settings/workspaces` returns `{ workspaces: [] }` (worker.js 759–760), so workspace theme_id is not currently sourced from D1 in production.

**cms_themes sample (id, slug, name):**
| id | slug | name |
|----|------|------|
| theme-light | light | Light |
| theme-dark | dark | Dark |
| theme-google | google | Google |
| theme-clay | clay | Clay |
| theme-midnight | midnight | Midnight |

**Important:** `id` has "theme-" prefix; `slug` does not. Lookups in worker use **slug only** (`WHERE slug = ?`). Storing `theme-meaux-storm-gray` in user_settings.theme would break lookup.

**cms_themes for stored theme values:**  
Confirmed rows exist for: slug `dark`, `meaux-storm-gray`, `meaux-editor`, `tactical-slate-sage`, `meaux-glass-blue` (id = theme-meaux-storm-gray, etc.).

**Sam's user data:**
- `user_id = 'au_871d920d1233cbd1'`: `theme = 'dark'` (slug; valid).
- `user_settings` sample: two rows — `user_id = 'au_c4bf765aff63b31f'` theme `meaux-storm-gray`, `user_id = 'sam_primeaux'` theme `tactical-slate-sage`.

---

## 2. ALL THEME WRITE OPERATIONS (Code Locations)

### API endpoints that accept theme parameters

| Location | Method | Body / behavior | Value saved | Normalization |
|----------|--------|------------------|------------|---------------|
| **worker.js 764–856** | GET /api/settings/theme | N/A (read) | — | — |
| **worker.js 839–854** | PATCH /api/settings/theme | `{ theme: string }` | `user.id`, `theme` → user_settings | None. Stored as-is. |
| **worker.js 712–734** | PATCH /api/user/preferences | `{ theme_preset: string }` | Writes to user_preferences (key/value) and user_settings | None. Production user_preferences has no key/value; INSERT may fail or use different table. |

### Client-side calls that write theme

| File | Line(s) | What is sent | Value type |
|------|---------|--------------|------------|
| dashboard/user-settings.html | 1854 | PATCH /api/settings/theme `{ theme: name }` | `name` = first argument to usApplyTheme = theme card's `t.slug \|\| t.name` (slug from /api/themes) |
| dashboard/user-settings.html | 2612 | Same (loadThemesV2 apply) | Same |

### localStorage.setItem('dashboard-theme', ...)

| File | Line | Value stored |
|------|------|--------------|
| dashboard/chats.html | 34 | slug (from applyShellTheme) |
| dashboard/cms.html | 34 | slug |
| dashboard/mail.html | 34 | slug |
| dashboard/pipelines.html | 34 | slug |
| dashboard/onboarding.html | 34 | slug |
| dashboard/user-settings.html | 1686, 2593, 2606 | themeName / name (from apply/sync) |
| dashboard/time-tracking.html | 34 | slug |
| dashboard/kanban.html | 34 | slug |
| dashboard/meet.html | 34 | slug |
| dashboard/images.html | 34 | slug |
| dashboard/cloud.html | 34 | slug |
| dashboard/calendar.html | 34 | slug |
| dashboard/mcp.html | 34 | slug |
| dashboard/clients.html | 34 | slug |
| dashboard/billing.html | 34 | slug |
| dashboard/tools.html | 34 | slug |
| dashboard/finance.html | 34 | slug |
| dashboard/overview.html | 34 | slug |
| dashboard/hub.html | 34 | slug |
| dashboard/projects.html | 34 | slug |
| dashboard/billing-from-r2.html | 34 | slug |
| static/dashboard/agent.html | 38 | slug |
| agent-sam/static/dashboard/shell-v2.html | 1067, 1075 | dashboard-theme-css; dashboard-theme (from API response td.theme) |

All of these receive the theme **slug** from applyShellTheme or API response; no "theme-" prefix is added by this code.

### Database INSERT/UPDATE (theme columns)

| File | Line(s) | Statement | Normalization |
|------|---------|-----------|---------------|
| worker.js | 721 | INSERT user_preferences (user_id, key, value) theme_preset | None. Production table has no key/value. |
| worker.js | 724–725 | INSERT/UPDATE user_settings (user_id, theme) | None |
| worker.js | 844–848 | INSERT/UPDATE user_settings (user_id, theme) on PATCH /api/settings/theme | None |

**Conclusion:** All intended writes use **slug**. The only risk is if a client ever sent `id` (e.g. theme-meaux-storm-gray) instead of slug; then cms_themes lookup would fail. Normalize in worker: if value starts with "theme-", treat as id and resolve to slug before storing and before cms_themes lookup.

---

## 3. ALL THEME READ OPERATIONS (Code Locations)

### Calls to /api/settings/theme (GET)

- dashboard/agent.html 1029  
- dashboard/chats.html 67, 1209  
- dashboard/cms.html 67  
- dashboard/mail.html 67  
- dashboard/pipelines.html 67  
- dashboard/onboarding.html 67  
- dashboard/user-settings.html (loadThemes applies theme from state; sync via loadThemesV2 fetches GET)  
- dashboard/time-tracking.html 67, 1187  
- dashboard/kanban.html 67  
- dashboard/meet.html 67, 1616  
- dashboard/images.html 67  
- dashboard/cloud.html 67  
- dashboard/calendar.html 67  
- dashboard/mcp.html 67  
- dashboard/clients.html 67, 1431  
- dashboard/billing.html 67, 1269  
- dashboard/tools.html 67  
- dashboard/finance.html 67, 1184  
- dashboard/overview.html 67, 1191  
- dashboard/hub.html 63, 69  
- dashboard/projects.html 67, 1285  
- dashboard/billing-from-r2.html 67, 1234  
- static/dashboard/agent.html 76, 1463  
- static/dashboard/draw.html 1959  
- agent-sam/static/dashboard/shell-v2.html 1071  

### Calls to /api/themes (GET)

- dashboard/user-settings.html 1721, 2564  
- dashboard/chats.html 79  
- dashboard/cms.html 79  
- (same pattern in mail, pipelines, onboarding, time-tracking, kanban, meet, images, cloud, calendar, mcp, clients, billing, tools, finance, overview, hub, projects, billing-from-r2)  
- static/dashboard/agent.html 88  
- agent-sam/static/dashboard/shell-v2.html 1051  

### localStorage.getItem('dashboard-theme')

Present in all dashboard HTML files that have the shell theme script (see section 5). Typical pattern: first script reads `dashboard-theme` and sets `data-theme`; later applyShellTheme or similar uses it as fallback.

### Database SELECT (theme columns)

- worker.js 804: `SELECT theme FROM user_settings WHERE user_id = ?`  
- worker.js 806: `SELECT value FROM user_preferences WHERE user_id = ? AND key = 'theme_preset'` (fails in prod: no key/value)  
- worker.js 771, 809: `SELECT name, config FROM cms_themes WHERE slug = ?`  

### data-theme attribute set

- Every dashboard HTML: `<html ... data-theme="meaux-glass-blue">` and script that does `document.documentElement.setAttribute('data-theme', t)` or `setAttribute('data-theme', slug)`.

---

## 4. ALL THEME FALLBACK/DEFAULT LOGIC

### meaux-glass-blue

| File | Line(s) | Context |
|------|---------|--------|
| worker.js | 837 | Catch block fallback: `Response.json({ theme: 'meaux-glass-blue', ... })` |
| dashboard/agent.html | 2, 30, 897, 1002 | Default data-theme; CSS block; updateHeaderLogo fallback; BUILTIN_THEMES |
| dashboard/chats.html | 2, 126, 1078, 1182 | Same pattern |
| dashboard/user-settings.html | 2, 30, 1885, 1895, 2218, 2322, 2587 | Default; themeOpts fallback; resolvedTheme fallback; BUILTIN_THEMES; loadThemesV2 saved fallback |
| dashboard/cms.html, mail, pipelines, onboarding, time-tracking, kanban, meet, images, cloud, calendar, mcp, clients, billing, tools, finance, overview, hub, projects, billing-from-r2 | 2, 126/141, getAttribute fallback, BUILTIN_THEMES | Default data-theme; CSS; header theme fallback |
| static/dashboard/agent.html | 2, 174, 1198, 1203, 1323, 1436, 2084 | Default; lightBlock; iam_theme fallback |
| static/dashboard/draw.html | 2, 30, 1828, 1932 | Default; getAttribute; BUILTIN_THEMES |
| agent-dashboard (FloatingPreviewPanel.jsx) | 237 | isDarkTheme check (meaux-storm-gray in list) |
| AgentDashboard.jsx | 1361–1362 | getAttribute / localStorage fallback |

### meaux-storm-gray

| File | Line(s) | Context |
|------|---------|--------|
| worker.js | 769, 807 | Unauthenticated default slug; fallback when no user_settings theme and pref.value missing |
| dashboard/cms.html | 2077 | Inline script fallback: `localStorage.getItem('dashboard-theme') \|\| 'meaux-storm-gray'` |
| agent-sam/static/dashboard/pages/*.html | 1 | Same inline fallback |

### inneranimal-slate

| File | Context |
|------|---------|
| All dashboard HTML | CSS block `[data-theme="inneranimal-slate"]` and BUILTIN_THEMES array |

### meaux-mono

| File | Context |
|------|---------|
| All dashboard HTML | CSS block `[data-theme="meaux-mono"]` and BUILTIN_THEMES array |

---

## 5. ALL DASHBOARD HTML FILES

### dashboard/ (23 files)

- agent.html, billing-from-r2.html, billing.html, calendar.html, chats.html, clients.html, cloud.html, cms.html, finance.html, hub.html, images.html, mail.html, meet.html, mcp.html, onboarding.html, overview.html, pipelines.html, projects.html, time-tracking.html, tools.html, user-settings.html, kanban.html, pages/agent.html  

### static/dashboard/ (4 files)

- agent.html, draw.html, glb-viewer.html, pages/draw.html  

### Theme loading pattern (shared by most)

1. **First script (sync):** Read `localStorage.getItem('dashboard-theme')` (and sometimes `dashboard-theme-vars`), set `data-theme` on documentElement.  
2. **Second script (async):** `fetch('/api/settings/theme')` then optionally `fetch('/api/themes')`, find theme by slug, call `applyShellTheme(slug, config)` which sets `data-theme`, `localStorage.setItem('dashboard-theme', slug)`, and injects style.  
3. **Later in page:** BUILTIN_THEMES and applyDynamicTheme; some pages re-fetch /api/settings/theme on visibility change.  

### agent.html (dashboard/)

- No loadThemes() function. Inline: BUILTIN_THEMES, applyDynamicTheme, savedTheme from localStorage, fetch /api/settings/theme if savedTheme not in BUILTIN_THEMES.  

### user-settings.html

- loadThemes(): fetch /api/themes, build themeList/themeDataMap, renderThemeGallery, applyThemeToShell.  
- usApplyTheme(name, displayName): PATCH /api/settings/theme with `{ theme: name }`, localStorage.setItem('dashboard-theme', themeName).  
- loadThemesV2: fetch /api/themes, build CSS from slug/config, fetch /api/settings/theme, set localStorage and data-theme from response.  

### cms.html

- Inline at 2077: `localStorage.getItem('dashboard-theme')||'meaux-storm-gray'`; also dashboard-theme-css.  

### shell-v2.html (agent-sam/static/dashboard/)

- loadThemes(): GET /api/themes, build CSS; GET /api/settings/theme, set localStorage and data-theme from td.theme.  

---

## 6. WORKER.JS THEME ENDPOINTS (COMPLETE CODE)

### GET /api/themes (lines 679–689)

```javascript
if (pathLower === '/api/themes' && request.method === 'GET') {
  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, slug, config FROM cms_themes ORDER BY is_system DESC, name ASC"
    ).all();
    return jsonResponse({ themes: results || [] });
  } catch (e) {
    return jsonResponse({ themes: [], error: e?.message }, 500);
  }
}
```

### GET /api/themes/active (lines 691–708)

Uses cookie `iam_theme` or header `X-IAM-Theme`; looks up `themes` table (name, is_dark). Returns `{ name, is_dark }`. Not used for cms_themes/slug flow.

### PATCH /api/user/preferences (lines 711–734)

```javascript
if (pathLower === '/api/user/preferences' && (request.method || 'GET').toUpperCase() === 'PATCH') {
  try {
    const body = await request.json().catch(() => ({}));
    const themePreset = body.theme_preset;
    if (themePreset != null && typeof themePreset === 'string') {
      if (env.DB) {
        try {
          await env.DB.prepare(
            "INSERT INTO user_preferences (user_id, key, value, updated_at) VALUES (?, 'theme_preset', ?, datetime('now')) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
          ).bind('sam_primeaux', themePreset).run();
          await env.DB.prepare(
            "INSERT INTO user_settings (user_id, theme, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, updated_at = unixepoch()"
          ).bind('sam_primeaux', themePreset).run().catch(() => null);
        } catch (_) { /* table may not exist */ }
      }
      return jsonResponse({ ok: true, theme_preset: themePreset });
    }
    return jsonResponse({ ok: false, error: 'theme_preset required' }, 400);
  } catch (e) {
    return jsonResponse({ ok: false, error: e?.message }, 500);
  }
}
```

Production `user_preferences` has no `key`/`value`; this INSERT will fail. The user_settings sync uses fixed user_id `sam_primeaux`.

### GET /api/settings/theme (lines 764–835)

- If no user: defaultSlug = `'meaux-storm-gray'`, then `SELECT name, config FROM cms_themes WHERE slug = ?`, build variables, return `{ theme, name, variables }`.  
- If user: try SESSION_CACHE `theme:${user.id}`; else `SELECT theme FROM user_settings WHERE user_id = ?`; if no slug, `SELECT value FROM user_preferences WHERE user_id = ? AND key = 'theme_preset'` (fails in prod), fallback slug `'meaux-storm-gray'`. Then `SELECT name, config FROM cms_themes WHERE slug = ?`, build variables, cache, return.  
- On catch: return `{ theme: 'meaux-glass-blue', name: 'meaux-glass-blue', variables: {} }`.  

### PATCH /api/settings/theme (lines 839–855)

- Requires auth. Body `{ theme: string }`. Upsert/update user_settings (user_id, theme). Invalidate SESSION_CACHE. No slug normalization.

---

## 7. THEME APPLICATION FLOW

### User clicks theme in user-settings.html

1. Theme card onclick: `usApplyTheme(slugOrName, displayName)` — first argument is `t.slug || t.name` from theme list (from GET /api/themes), so **slug**.  
2. `usState.currentTheme = name`; `applyThemeToShell(name, themeData)` (sets data-theme, injects style, localStorage).  
3. `fetch('/api/settings/theme', { method: 'PATCH', body: JSON.stringify({ theme: name }) })`.  
4. Worker: `user.id`, `theme` → INSERT/UPDATE user_settings. No normalization.  
5. Toast "Theme applied" or "Failed to save theme".  

So the value sent to the API is the **slug** from the theme card (same as cms_themes.slug). If the gallery ever showed or used `t.id` (theme-xyz), that would be a bug.

### Propagation to other pages

- Other pages do not subscribe to a live channel. They:  
  - On load: read localStorage `dashboard-theme` and/or fetch GET /api/settings/theme, then set data-theme and inject CSS.  
  - So after changing theme in user-settings, the next load or refresh of any dashboard page will get the new theme from API or from localStorage (if same browser).  
- Shell-v2 and loadThemesV2: on load they fetch GET /api/settings/theme and set localStorage and data-theme from response, so they stay in sync after refresh.

### Recommended fix for slug vs id

1. **Worker GET /api/settings/theme:** Before `cms_themes WHERE slug = ?`, normalize: if `slug.startsWith('theme-')`, set `slug = slug.slice(6)` (or look up by id and use row.slug).  
2. **Worker PATCH /api/settings/theme:** Before writing to user_settings, normalize the same way so we always store slug.  
3. **Worker PATCH /api/user/preferences:** Same normalization for theme_preset before writing.  
4. **user_preferences:** Either add a key/value user_preferences table for theme_preset, or stop using it and rely only on user_settings.theme (current production behavior).  

This audit is complete for one deployment fix.
