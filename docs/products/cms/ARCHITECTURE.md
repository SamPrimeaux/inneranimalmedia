# CMS — architecture

---

## Frontend

| Component | Path |
|-----------|------|
| Router | `dashboard/pages/cms/CmsPage.tsx` |
| Hub | `CmsSiteLauncherGrid`, `CmsHubPage` |
| Shell | `CmsShellLayout` — Shopify-like tabs |
| Editor | `src/dashboard/cms/CmsStudioEditor.tsx` → iframe `/studio/editor` |
| Context hook | `dashboard/hooks/useCmsWorkspaceContext.ts` |

---

## Backend

| Component | Path |
|-----------|------|
| Platform API | `src/api/cms.js` |
| Hub sites | `src/core/cms-hub-sites.js` |
| Site config | `src/core/cms-site-config.js` |
| Client bridge | `src/core/cms-client-bridge.js` |
| Python editor worker | `cms-editor/` — separate deploy (`pywrangler`) |

---

## Federated model

```
/dashboard/cms
  → site tile → /dashboard/cms/pages?site={slug}
  → CmsStudioEditor iframe
  → API routes by api_profile (primetch | cpas_fragment | fuel_admin)
  → client worker OR IAM platform D1
```

Featured slugs: `inneranimalmedia`, `companionscpas`, `fuelnfreetime`, `meauxbility`

---

## Agent integration

| route_key | When |
|-----------|------|
| `cms_edit` | Platform IAM site |
| `cms_client_worker` | Client worker bridge |
| `fuel_cms_admin` | Fuel admin profile |

Source: `dashboardRouteContext.ts`

---

## Known blockers

- Iframe studio shell load / section hydration
- `cms-v2-api-patch.js` — partial API landing
- Legacy `ClientWorkerCmsStudio` embed — **do not revive**

---

## Related

- [../../platform/cms-federated-hub-architecture.md](../../platform/cms-federated-hub-architecture.md)
