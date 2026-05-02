# Theme and component refinement — Agent Sam guide

Use this to help the user refine, repair, or redesign dashboard themes and other components from the Agent UI. All theme and shell behavior is driven by the DB and CSS variables; you can propose exact changes and SQL.

---

## 1. Themes (cms_themes)

- **Table**: `cms_themes` (D1). Columns used: `id`, `name`, `slug`, `config` (JSON text).
- **API**: `GET /api/themes` returns `{ themes: [ { id, name, slug, config } ] }`. User’s selected theme: `GET /api/settings/theme` → `{ theme: "<slug>" }`.
- **Apply**: Dashboard pages call `applyShellTheme(slug, config)`: they set `data-theme` and inject CSS variables from `config` so the shell and **main content** (including font colors) match.

### Config keys (JSON in `config`)

| Key | Maps to CSS | Purpose |
|-----|-------------|--------|
| `text` | `--text-nav`, `--text-primary` | Primary text (nav + content). Use light hex (e.g. `#f1f5f9`) for dark themes. |
| `textSecondary` | `--text-nav-muted`, `--text-secondary` | Muted/secondary text (e.g. `#94a3b8`). |
| `nav` | `--bg-nav` | Topbar/sidebar background. |
| `bg` | `--bg-canvas` | Main content background. |
| `surface` | `--bg-elevated` | Cards, panels. |
| `border` | `--border-nav`, `--color-border` | Borders. |
| `primary` | `--accent`, `--color-primary` | Buttons, links. |

To fix “black text on dark background”: ensure the theme’s `config` has `text` and `textSecondary` set to light colors (e.g. `#f1f5f9`, `#94a3b8`). The dashboard injects these into `--text-primary` and `--text-secondary` so content matches the side nav.

### SQL to list themes

```sql
SELECT id, name, slug, config FROM cms_themes ORDER BY name;
```

### SQL to update a theme’s config (e.g. slate sage)

```sql
-- Replace slug with the actual slug (e.g. 'slate-sage'). Merge into existing config.
UPDATE cms_themes
SET config = json_set(
  coalesce(json(config), '{}'),
  '$.text', '#f1f5f9',
  '$.textSecondary', '#94a3b8'
)
WHERE slug = 'slate-sage';
```

After updating, user refreshes the dashboard; no deploy needed. Suggest SQL first; wait for user approval before running.

---

## 2. Other components (dashboard pages, shell)

- **Repo**: Dashboard HTML lives in `dashboard/*.html` (overview, finance, billing, meet, agent, cloud, chats, mcp, time-tracking, etc.). Each page has theme scripts (localStorage + API), `applyShellTheme`, and CSS variables.
- **Serving**: Worker serves from R2 bucket `agent-sam` at `static/dashboard/<segment>.html`. To change what’s live: (1) edit the file in repo, (2) upload to R2, (3) deploy worker.
- **Upload one file**: `./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/<file>.html --file=dashboard/<file>.html --content-type=text/html --remote -c wrangler.production.toml`
- **Deploy**: After R2 uploads, run `npm run deploy` (never raw `wrangler deploy`). Use `./scripts/with-cloudflare-env.sh` for wrangler so the API token is set.

When the user asks to refine/repair/redesign a **page** or **component**: identify the file (e.g. `dashboard/meet.html`), propose the edit or theme fix, then give the R2 upload command and remind them to deploy. For **theme-only** changes, updating `cms_themes.config` and refreshing is enough.

---

## 3. Workflow in the Agent UI

1. **Themes**: Propose the exact `UPDATE cms_themes SET config = ...` SQL; after user approves, they can run it via D1 (wrangler or dashboard). Confirm that `text` / `textSecondary` fix content contrast for dark themes.
2. **Pages/components**: Propose code or config changes; then give the R2 upload command and “then run deploy” so they can validate in the live dashboard.

Reference: `docs/theme-logic.md`, `docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md`.
