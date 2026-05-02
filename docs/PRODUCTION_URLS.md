# Inner Animal Media — Planned Production URLs

**Domains (from wrangler):**
- `inneranimalmedia.com`
- `www.inneranimalmedia.com`
- `webhooks.inneranimalmedia.com`

**R2 binding for company plans:** `R2` → bucket **iam-platform** (use for solidified plans, docs, assets).

---

## 1. Public marketing / site (sitemap candidates)

| URL | Purpose |
|-----|---------|
| https://inneranimalmedia.com/ | Home |
| https://inneranimalmedia.com/about | About |
| https://inneranimalmedia.com/blog | Blog |
| https://inneranimalmedia.com/clients | Clients |
| https://inneranimalmedia.com/contact | Contact |
| https://inneranimalmedia.com/industries | Industries |
| https://inneranimalmedia.com/services | Services |
| https://inneranimalmedia.com/work | Work |
| https://inneranimalmedia.com/process | Process |
| https://inneranimalmedia.com/pricing | Pricing |
| https://inneranimalmedia.com/privacy | Privacy |
| https://inneranimalmedia.com/terms | Terms |
| https://inneranimalmedia.com/3d-gallery | 3D Gallery |
| https://inneranimalmedia.com/games | Games |
| https://inneranimalmedia.com/tools | Tools index |
| https://inneranimalmedia.com/tools/local-scout | Local Scout tool |

Use **one canonical host** in the sitemap (e.g. `https://inneranimalmedia.com/`) and list the above paths. Exclude `/www.*` if you redirect www to apex.

---

## 2. Auth (do not put in sitemap)

| URL | Purpose |
|-----|---------|
| https://inneranimalmedia.com/auth/signin | Sign in |
| https://inneranimalmedia.com/auth/signup | Sign up |
| https://inneranimalmedia.com/login | Redirects → /auth/signin |

OAuth callbacks (`/api/oauth/google/start`, `/api/oauth/google/callback`, `/api/auth/google/start`, `/api/auth/google/callback`, `/api/auth/github/start`, `/api/auth/github/callback`) are API endpoints, not pages.

---

## 3. Dashboard (authenticated; typically exclude from sitemap or list with noindex)

| URL | Purpose |
|-----|---------|
| https://inneranimalmedia.com/dashboard | Dashboard home |
| https://inneranimalmedia.com/dashboard/overview | Overview (OAuth redirect target) |
| https://inneranimalmedia.com/dashboard/projects | Projects |
| https://inneranimalmedia.com/dashboard/clients | Clients |
| https://inneranimalmedia.com/dashboard/brands | Brands |
| https://inneranimalmedia.com/dashboard/analytics | Analytics |
| https://inneranimalmedia.com/dashboard/settings | Settings |
| https://inneranimalmedia.com/dashboard/meauxwork | MeauxWork (IDE) |
| https://inneranimalmedia.com/dashboard/meauxcad | MeauxCAD |
| https://inneranimalmedia.com/dashboard/meauxide-collab | MeauxIDE Collab |
| https://inneranimalmedia.com/dashboard/agent | Agent (Agent Sam workstation) |
| https://inneranimalmedia.com/dashboard/financial-plan | Financial plan |
| https://inneranimalmedia.com/dashboard/financial-command | Financial command |
| https://inneranimalmedia.com/dashboard/flow-field | Flow field |
| https://inneranimalmedia.com/dashboard/gallery | Gallery |
| https://inneranimalmedia.com/dashboard/claude | Claude |
| https://inneranimalmedia.com/dashboard/pipelines | Pipelines |
| https://inneranimalmedia.com/dashboard/themes | Themes |
| https://inneranimalmedia.com/dashboard/theme-factory | Theme factory |
| https://inneranimalmedia.com/dashboard/cost-analytics | Cost analytics |
| https://inneranimalmedia.com/dashboard/snowboard | Snowboard |
| https://inneranimalmedia.com/dashboard/dev | Dev |
| https://inneranimalmedia.com/dashboard/automation | Automation |
| https://inneranimalmedia.com/dashboard/media | Media |
| https://inneranimalmedia.com/dashboard/communication | Communication |

**Redirect aliases (resolve to above):**  
`/meauxide`, `/MeauxIDE` → `/dashboard/meauxwork`  
`/dashboard/collab` → `/dashboard/meauxide-collab`  
`/dashboard/financial` → `/dashboard/financial-plan`  
`/dashboard/brand` → `/dashboard/brands`  
`/dashboard/meauxgames` → `/dashboard/meauxcad`  
`/dashboard/art` → `/dashboard/flow-field`  
`/dashboard/streams` → `/dashboard/pipelines`  
`/dashboard/command` → `/dashboard/financial-command`  
`/gallery` → `/3d-gallery`  
`/connect` → `/contact`  
`/work-new` → `/work`

---

## 4. API bases (do not put in sitemap)

- `https://inneranimalmedia.com/api/*` — health, auth, dashboard data, pipelines, MCP, costs, payments, webhooks, etc.
- `https://www.inneranimalmedia.com/api/*` — same.

---

## 5. Webhooks (do not put in sitemap)

- `https://webhooks.inneranimalmedia.com/*` — e.g. GitHub, Stripe, Resend.

---

## 6. Sitemap update checklist

1. **Include:** Section 1 (public marketing/site). Use a single canonical host (e.g. `https://inneranimalmedia.com`).
2. **Exclude:** Auth (Section 2), dashboard (Section 3), all `/api/*`, webhooks subdomain.
3. **Optional:** Add `/dashboard` with `noindex` in page HTML or omit from sitemap so crawlers don’t treat it as primary content.
4. **Lastmod / changefreq:** Set from your CMS or build time; use `lastmod` for updated pages (e.g. blog, work).

---

## 7. iam-platform R2 (company plans)

- **Binding:** `R2` in the worker → bucket **iam-platform**.
- **Use:** Store solidified company plans, internal docs, and any assets that back those plans (e.g. PDFs, images).
- **Next steps you might take:**
  - Define object key layout (e.g. `plans/2026/q1-strategy.pdf`, `plans/roadmap.json`).
  - Add worker routes or internal tools that read from `env.R2.get(...)` to serve or list plans.
  - Optionally use the same bucket for sitemap or static JSON that lists “public” plan summaries, if you want to expose high-level roadmap pages later.

If you want, I can draft a `sitemap.xml` structure (with placeholder lastmod) and a short “iam-platform key layout” doc next.
