# Client CMS alignment — Companions CPAS × Fuel & Free Time

**As-of:** 2026-07-13 (~12:20 AM CDT)  
**Tickets:** `tkt_companions_cms_ssot_audit` (P1) → then `tkt_fuelnfreetime_setup_outreach` (P2)  
**Law:** Do **not** force one CMS pattern onto the other. Audit what’s real, close gaps, revise sections — then wait on customer feedback / branding specs.

---

## Same Cloudflare account (operator owned)

| | Companions of CPAS | Fuel & Free Time |
|---|---|---|
| Worker | `companionscpas` | `fuelnfreetime` |
| Domain | companionsofcaddo.org | fuelnfreetime.com |
| Zone ID | `1fc12e66840f552578553108ada5e126` | `816a5d2284103e4481987ceeb16c2ca9` |
| Account | `ede6590ac0d2fb7daf155b35653457b2` | same |
| D1 | `companionscpas` `fd6dd6fb-…` | `fuelnfreetime` `9fd6ff92-…` |
| R2 | `companionscpas` | `fuelnfreetime` |
| KV | `companionscpas-cache` | `fuelnfreetime-cache` |
| Local | `/Users/samprimeaux/companionscpas` | `/Users/samprimeaux/fuelnfreetime` |
| Deploy | `npm run deploy:full` | `npm run deploy` / CF Builds hook |

---

## Two CMS models (by design — not a bug)

### Companions — sectional HTML CMS (semi-working, richer)

```
D1 cms_pages / cms_page_sections / cms_page_content_blocks
  → POST /api/cms/section/save (draft)
  → POST /api/cms/publish
  → R2 fragments static/pages/{route}/{section}.html + full index.html
  → CMS_CACHE bust
  → Public: KV → live assemble → R2 artifact
```

| Live fact (D1 2026-07-13) | Count |
|---|---|
| Published pages | `/` `/about` `/adopt` `/community` `/contact` `/donate` `/services` (all `plum_glass`) |
| Sections | 56 across routes (+ 2 `global`) |
| Editor | React Babel SPA `/dashboard/cms/*` — **no** Durable Object |
| Extra bindings | Stripe, Resend, Google OAuth, Meta stubs, cron `0 6 * * *` |
| Missing vs F&FT | No DO live editor, no Vectorize, no Workers Assets binding |

**SSOT docs:** `companionscpas/AGENTSAM.md` · IAM `docs/clients/companionscpas/`

**Known gaps (from AGENTSAM — treat as audit checklist tomorrow):**
1. Donate dashboard sections ↔ live R2 sync drift  
2. Brand color tokens in UI vs plum (`#6f2270` / `#c23689`)  
3. Generic inspector (weak type-specific fields / blocks UX)  
4. `/services` empty placeholders; content passes on about/adopt/contact  
5. Preview iframe scroll/highlight  
6. `/community` CTA reroute then hide from nav (already `nav_visible=0`)  
7. Ask Agent Sam button (IAM-side — defer)  

**Do tomorrow (Companions first):**
- [ ] Walk live `/dashboard/cms` on companionsofcaddo.org — save draft + publish one section on home + donate  
- [ ] Diff D1 `cms_page_sections` vs R2 `static/pages/donate/`  
- [ ] List section types in `cms_section_catalog.js` — mark which have type-specific inspectors  
- [ ] Write “gap vs by-design” notes into ticket `status_reason` (don’t invent a new CMS schema)  
- [ ] Prep short customer review pack (screenshots of hero/header/contact) — **wait for Lori/Michelle feedback before redesign**

---

### Fuel & Free Time — R2-body CMS + DO live rooms (platform ready)

```
D1 pages / page_sections (thin index; bodies NOT in D1)
  → R2 cms/pages/{slug}/draft|published/{section}.json
  → KV cms:page:{slug}:v1
  → hydrate [data-cms] on storefront
  → CMS_EDITOR DO WebSocket for multi-client live edit
```

| Live fact (D1 2026-07-13) | Count |
|---|---|
| Pages | `home` `about` `shop` `community` `site` (all published) |
| Sections | 19 |
| Products / variants | **3 / 5** (scaffold only) |
| Editor | Legacy `public/admin/page-edit.html` + live WS; React `admin-ui` = analytics only |
| Extra bindings | `CMS_EDITOR` DO, `FNF_VECTORIZE`, `ASSETS`, IAM_MCP_URL, cron `0 4 * * *` |

**SSOT docs:** `fuelnfreetime/AGENTSAM.md` · IAM `docs/clients/fuelnfreetime/`  
**Doc drift to fix when touching:** AGENTSAM still says `cms_pages` / `cms_sections` / `inventory` — real tables are `pages` / `page_sections` / `product_variants.inventory_qty`.

**Do tomorrow (after Companions audit, or in parallel if time):**
- [ ] Confirm publish path still green: edit one home section → publish → live hydrate  
- [ ] Inventory admin: products CRUD UI works; note empty catalog  
- [ ] Stripe status (Connor lane) — unpaid checkout only until secrets/contracts live  
- [ ] Draft outreach email to Justin: branding kit (logo, colors, fonts), product list + photos, launch timeline  
- [ ] **Do not** build CMS asset-upload / product photography tooling until branding specs return

---

## Shared operator checklist (both)

| Item | Companions | F&FT |
|---|---|---|
| CF account / zone owned | ✅ | ✅ |
| Custom domain live | ✅ | ✅ |
| Deploy hook | exists, never triggered | triggered 22d ago |
| Observability logs | **Disabled** — enable for CMS debug | Enabled 100% |
| IAM MCP bridge | telemetry + `/api/agentsam/mcp` | `IAM_MCP_URL` + bridge key |
| IAM PrimeTech CMS hub | partial (client worker path) | `ctx_cms_hub_fuelnfreetime` tile |
| Force into IAM `cms_edit` profile design | **No** — learn from Companions sectional model first | **No** — separate commerce CMS |

---

## IAM `cms_edit` routing implication

`tkt_cms_001` / Shopify-like section GUI is **platform** work. Client takeaway:

- Companions = closest real “sectional CMS” reference (pages → sections → blocks → R2 fragments).  
- F&FT = lighter hydrate slots + DO collab — different product shape (commerce storefront).  
- Designing IAM `cms_edit` tool profiles against Companions’ **working** publish contract is safer than inventing against F&FT’s thin index or against IAM home alone.

---

## Tomorrow sequence (recommended)

1. **P1 Companions** — live CMS walk + donate sync + gap list → update `tkt_companions_cms_ssot_audit`  
2. Customer review pack (Companions) — send / schedule; park redesign until reply  
3. **P2 F&FT** — platform smoke (CMS publish + shop scaffold) → outreach for branding/products  
4. Only then: feed Companions findings into IAM CMS section GUI / `cms_edit` profile work

---

## Evidence links

- Companions CF Worker: bindings WAI / CMS_CACHE / DB / WEBSITE_ASSETS  
- F&FT CF Worker: + ASSETS / CMS_EDITOR / FNF_VECTORIZE  
- Explore agents: Companions CMS audit · F&FT CMS audit (2026-07-13 session)
