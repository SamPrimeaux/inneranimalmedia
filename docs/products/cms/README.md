# CMS

**Classification:** `independent_product`  
**Stage:** `incubating` (shell **unstable**)  
**Route:** `/dashboard/cms/*`  
**Manifest:** [`product-manifests/cms.json`](../../product-manifests/cms.json)

Cloudflare-native site builder — **mini-Shopify/Wix mental model** on CF infra (Workers, D1, R2, Images).

---

## Intended goal

Customers familiar with Shopify/Wix editor flows get a approachable web editor without Wrangler complexity — while benefiting from CF performance and pricing.

**Operator model:** Federated hub — IAM shell edits client runtimes without centralizing all content in platform D1.

---

## Status

| Area | Status |
|------|--------|
| Site launcher hub | **Verified** |
| Federated architecture doc | **Verified** |
| Route context / agent | **Verified** |
| Editor iframe (`/studio/editor`) | **Unstable** — display/edit loop broken |
| Shopify-like shell tabs | **Partial** |

---

## Routes

| Route | Purpose |
|-------|---------|
| `/dashboard/cms` | Site grid |
| `/dashboard/cms/pages?site=` | Page editor |
| `/dashboard/cms/online-store` | Commerce |
| `/dashboard/cms/theme-editor` | Theme |
| `/dashboard/cms/templates` | Templates |
| `/dashboard/cms/imports` | Imports |

Parser: `dashboard/pages/cms/cmsRoute.ts`

---

## Docs

- [PRODUCT_PRINCIPLES.md](./PRODUCT_PRINCIPLES.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [AGENTSAM.md](./AGENTSAM.md)
- **Technical SSOT:** [../../platform/cms-federated-hub-architecture.md](../../platform/cms-federated-hub-architecture.md)

---

## Recovery priority

1. One platform site (`inneranimalmedia`) end-to-end: load → sections render → save → publish
2. One federated client (e.g. Companions) via bridge
3. Then store/theme/template parity
