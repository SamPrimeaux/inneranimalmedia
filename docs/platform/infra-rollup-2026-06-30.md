---
title: IAM Infra Rollup — June 2026 sprint baseline
project_key: inneranimalmedia
doc_type: platform_rollup
topic: infra_commit_rollup
updated: 2026-06-30
commit_range: 0dad18ac..HEAD
---

# IAM Infra Rollup — 2026-06-30

**Purpose:** Single “where we are” snapshot after ~35 commits of major platform work. Use this for onboarding, Agent Sam context, and tomorrow’s fresh start — not as a substitute for D1 registry truth (`agentsam_*` tables).

| Metric | Value |
|--------|--------|
| **Commit range** | `0dad18ac` → `114dd19a` (+ palette mobile UX in same ship) |
| **Commits** | 35 in range |
| **Unique files touched** | ~161 |
| **Main worker deploy** | `npm run deploy:full` from repo root |
| **MCP worker** | Separate repo — only GitHub MCP *registration* migrations landed here |

**Related snapshots:** `docs/platform/iam-platform-snapshot.md`, `docs/platform/iam-runtime-architecture-2026-06.md`, `docs/platform/iam-identity-spine-2026-06.md`.

---

## Executive summary (why this sprint)

1. **Identity spine** — Active workspace comes from D1 (`auth_users.active_workspace_id`), not stale client headers; security fix on unanchored D1 grants.
2. **Projects lane** — Canonical `/dashboard/projects`, `project_id` on kanban/todos, repeat-visit CRUD, noise archived in D1.
3. **Agent surface** — Editor crash loop fixed, tab IDs keyed by source, chat recents + cloud terminal auto-connect, library routing + status bar health.
4. **Mobile Context Hub** — iOS-first drawer, connectors catalog, popup OAuth, Context Envelope v1 for GitHub repo picker.
5. **Sandbox / containers** — Go sandbox image + R2 FUSE spine, Wrangler auth lane law, runtime checks in Context tab; single named `MY_CONTAINER` pool documented.
6. **GitHub MCP** — Official remote MCP server registered in D1; palette-driven `git clone`; per-user OAuth in catalog executor.
7. **Unified search / data planes** — Per-user Cloudflare catalog (D1, R2, Hyperdrive, Vectorize); no hardcoded bucket fallbacks; mobile chip UX.
8. **Home + settings** — Screenshot-forward product grid, connect tiles, CfStack real account picker, settings API schema drift fixes.

---

## 1. Identity & workspace spine

**Why:** Stale `X-Workspace-Id` headers and repaired `ws_inneranimalmedia` rows were causing wrong DB scope and settings leakage. Platform law: resolve workspace from session + D1, never hardcode `ws_*` in hot paths.

| Commit | Message |
|--------|---------|
| `0dad18ac` | Repair `ws_inneranimalmedia` identity drift and fix workspace settings scoping |
| `501f6a0a` | Establish workspace SSOT from `auth_users.active_workspace_id` |
| `d05f1535` | Repair workspace identity spine so DB active workspace wins over stale client headers |
| `c03a267b` | Security: close unanchored D1 grant fallback in `resolveUserWorkspaceBinding` |
| `de7830de` | Spine migration — `project_id` on kanban/todos, CPAS workspace, archive CAD spam |

**Files (review list):**

```
dashboard/components/settings/sections/WorkspaceSection.tsx
dashboard/components/settings/components/WorkspaceActiveSwitcher.tsx
dashboard/src/context/WorkspaceContext.tsx
migrations/738_ws_inneranimalmedia_identity_repair.sql
migrations/740_identity_spine_user_settings_sync.sql
migrations/spine_project_link.sql
src/api/settings-workspace.js
src/api/settings.js
src/core/auth.js
src/core/data-isolation-scope.js
```

---

## 2. Projects spine & kanban

**Why:** `/dashboard/projects` needed to be a real home for project CRUD, branding, R2 uploads, and kanban — not a one-shot wizard. Sprint todo noise archived so ops desk stays usable.

| Commit | Message |
|--------|---------|
| `d122fd65` | Ship canonical `/dashboard/projects` routes and quiet stale task noise |
| `8fcb95df` | Make `/dashboard/projects` usable on repeat visits and wire project CRUD gaps |
| `de7830de` | (shared with §1) `project_id` spine on `kanban_tasks` + `agentsam_todo` |

**Files:**

```
dashboard/App.tsx
dashboard/api/projects.ts
dashboard/api/kanban.ts
dashboard/pages/projects/ProjectsPage.tsx
dashboard/components/projects/NewProjectModal.tsx
dashboard/components/projects/StartProjectWizard.tsx
dashboard/components/DatabasePage.tsx
dashboard/components/DatabaseStudio.tsx
dashboard/src/components/library/LibraryProjectsSurface.tsx
dashboard/src/components/library/LibraryProjectDetail.tsx
dashboard/src/components/library/LibrarySideRail.tsx
dashboard/src/components/library/ProjectQuickCreateMenu.tsx
dashboard/src/components/kanban/WorkspaceKanban.tsx
dashboard/src/iamProjectsCache.ts
dashboard/src/lib/databaseStudioRoute.ts
dashboard/src/lib/projectBranding.ts
dashboard/src/lib/projectR2Upload.ts
dashboard/src/styles/library.css
dashboard/src/styles/library-project-tabs.css
migrations/740_archive_sprint_todo_noise.sql
migrations/741_project_spine_columns.sql
migrations/742_archive_unbound_sprint_todos.sql
src/api/projects.js
src/api/kanban.js
```

---

## 3. Agent editor, chat & terminal

**Why:** `/dashboard/agent/editor` was crashing the tab (resource exhaustion). Chat sessions needed reliable resume, recents refresh, and cloud terminal auto-connect on open.

| Commit | Message |
|--------|---------|
| `6672bc46` | Fix `ERR_INSUFFICIENT_RESOURCES` crash loop on `/dashboard/agent/editor` |
| `435d84a5` | Fix tab-id collisions in `EditorContext` — `getFileId` keys by source |
| `977e3118` | Fix agent editor boot, chat recents refresh, and cloud terminal auto-connect |
| `c9719098` | Fix library chat routing and surface platform health in the status bar |
| `f2f662d2` | Fix Google/GitHub login and mobile Code session shell |

**Files:**

```
dashboard/App.tsx
dashboard/src/EditorContext.tsx
dashboard/components/ChatAssistant/ChatAssistant.tsx
dashboard/components/ChatAssistant/hooks/useAgentChatStream.ts
dashboard/components/XTermShell.tsx
dashboard/hooks/useAgentChatSessions.ts
dashboard/lib/openAgentConversation.ts
dashboard/lib/agentRoutes.ts
dashboard/src/ideWorkspace.ts
dashboard/components/StatusBar.tsx
dashboard/components/LocalExplorer.tsx
dashboard/components/agent/AgentHome.tsx
dashboard/agentChatConstants.ts
dashboard/src/components/library/LibraryProjectDetail.tsx
dashboard/src/lib/platformHealth.ts
src/api/oauth-login-callbacks.js
```

---

## 4. Tool spine (Phase 2 catalog)

**Why:** Move toward `domain.capability` tool naming, PTY filesystem list/write, and route resolver alignment with D1 `agentsam_tools`.

| Commit | Message |
|--------|---------|
| `a37741b4` | Phase 2 tool spine: domain.capability catalog, PTY fs write/list, migration 739 |

**Files:**

```
migrations/739_phase2_domain_capability_spine.sql
scripts/verify-route-domain-catalog.mjs
src/core/agentsam-route-tool-resolver.js
src/core/agentsam-tools-catalog.js
src/core/catalog-tool-executor.js
src/core/fs-list-dir.js
src/core/fs-write-file.js
src/core/runtime-profile.js
src/tools/fs.js
```

---

## 5. Mobile Context Hub, connectors & OAuth

**Why:** iOS/mobile agent chat needed a first-class Context drawer (connectors, GitHub repo, exec lane) without routing through MCP. Popup OAuth completes in-place; fresh-session defaults avoid stale tool toggles.

| Commit | Message |
|--------|---------|
| `39531be9` | Ship mobile `ContextHubDrawer` and GCP-first exec profile for iOS |
| `f25cd8b7` | Wire popup OAuth from mobile Context Hub Connectors lane |
| `c6b14e2a` | Ship connectors catalog spine in mobile Context Hub with fresh-session defaults |
| `9bb758c5` | Connector avatars, per-tool session toggles, project lane, CF container exec |
| `6f3cb485` | Bind GitHub picker context to agent tools via Context Envelope v1 |
| `f2f662d2` | (shared with §3) mobile Code session shell |

**Files:**

```
dashboard/components/ChatAssistant/ContextHubDrawer.tsx
dashboard/components/ChatAssistant/GithubContextLane.tsx
dashboard/components/ChatAssistant/RepoPickerBottomSheet.tsx
dashboard/components/ChatAssistant/mentionContext.ts
dashboard/components/ChatAssistant/hooks/useConnectorsCatalog.ts
dashboard/components/ChatAssistant/composer/useComposerIntegrations.ts
dashboard/api/connectorsCatalog.ts
dashboard/src/lib/execLane.ts
dashboard/src/lib/freshChatSession.ts
dashboard/src/lib/clientSurface.ts
dashboard/src/lib/integrationOAuthPopup.ts
dashboard/src/lib/connectorComposerSource.ts
dashboard/types/contextEnvelope.ts
dashboard/components/settings/sections/IntegrationsSection.tsx
dashboard/components/settings/components/IntegrationCard.tsx
migrations/744_integration_catalog_icon_urls.sql
src/api/integrations-connectors-catalog.js
src/api/integrations.js
src/api/oauth.js
src/api/oauth-login-callbacks.js
src/core/connectors-hub-helpers.js
src/core/mobile-exec-profile.js
src/core/oauth-popup-complete.js
src/core/integration-brand-avatars.js
src/core/context-envelope.js
src/core/active-file-envelope.js
src/core/mode-controllers/agent-controller.js
src/core/terminal-connection-health.js
src/core/terminal-routing-policy.js
src/core/terminal.js
tests/unit/connectors-catalog.test.mjs
tests/unit/mobile-exec-profile.test.mjs
tests/unit/oauth-popup-complete.test.mjs
tests/unit/context-envelope.test.mjs
tests/unit/integration-brand-avatars.test.mjs
```

---

## 6. Home UI & connect tiles

**Why:** Dashboard home should sell products (screenshot tiles) and surface integration connect state consistently with the API spine.

| Commit | Message |
|--------|---------|
| `947cfe4e` | Unify home connect tiles and ship screenshot-forward product grid |

**Files:**

```
dashboard/api/connectTiles.ts
dashboard/api/home.ts
dashboard/components/DashboardHome.tsx
dashboard/components/home/HomeTileEditor.tsx
dashboard/components/home/HomeTileEditor.css
dashboard/components/ui/AppIcon.css
dashboard/pages/LaunchDeskPage.tsx
dashboard/pages/launch-desk/CollaborateTasksPanel.tsx
dashboard/pages/launch-desk/collaborate-calendar.css
migrations/743_dashboard_surface_tiles.sql
src/api/dashboard-connect-tiles.js
src/api/dashboard-home.js
```

---

## 7. Sandbox, containers & Wrangler lanes

**Why:** Sandboxed exec needs a container spine (Go image, optional R2 FUSE), Wrangler credentials must follow lane law (platform vs BYOK), and the agent Context tab should show runtime readiness — not silent failures.

| Commit | Message |
|--------|---------|
| `623aea80` | Add Go sandbox container with optional R2 FUSE and worker API spine |
| `1f09396b` | Align sandbox terminal exec with Cloudflare Wrangler auth lane law |
| `06e91372` | Surface sandbox runtime checks and Wrangler setup in agent Context tab |
| `3cb74440` | Fix `MY_CONTAINER` README drift so agent answers match production |
| `6a9a618e` | chore(deps): bump wrangler to ^4.106.0 across worker packages |

**Production note:** `MY_CONTAINER` uses a **single named pool** (`getByName('inneranimalmedia')`), not per-workspace DO affinity. Isolation is path-based under R2 FUSE + cwd.

**Files:**

```
containers/iam-sandbox-go/Dockerfile
containers/iam-sandbox-go/entrypoint.sh
containers/iam-sandbox-go/go.mod
containers/iam-sandbox-go/main.go
containers/moviemode-render/README.md
scripts/build-iam-sandbox-go-container.sh
src/api/sandbox-api.js
src/api/terminal-sandbox-internal.js
src/api/terminal-wrangler-guide.js
src/api/status-bundle.js
src/core/my-container.js
src/core/terminal-sandbox.js
src/core/sandbox-r2-fuse-env.js
src/core/mcp-terminal-contract.js
src/core/wrangler-terminal-guidance.js
src/core/production-dispatch.js
src/do/MyContainer.js
dashboard/lib/wranglerCommandCatalog.ts
docs/platform/terminal-three-lane-model.md
wrangler.jsonc
wrangler.production.toml
package.json
package-lock.json
```

---

## 8. GitHub official MCP & palette git clone

**Why:** REST `agentsam_github_*` tools don’t cover the full GitHub MCP tool surface. Register the official remote server with per-user OAuth; palette `clone` mode parses GitHub refs and runs clone with correct auth.

| Commit | Message |
|--------|---------|
| `c761f528` | Register GitHub official remote MCP server (`auth_type=user_oauth_github`) |
| `e09d38e6` | Generator for GitHub official MCP tool rows (migration 701) |
| `d3b1f74c` | Official GitHub MCP tool surface (13 toolsets) |
| `1773acfd` | Wire GitHub MCP auth and add reliable palette-driven git clone |

**Files:**

```
migrations/699_agentsam_github_official_mcp_surface.sql
migrations/700_register_github_official_mcp_server.sql
scripts/generate-github-mcp-tools-migration.js
src/core/mcp-servers.js
src/core/github-clone.js
src/core/github-clone-parse.js
src/core/catalog-tool-executor.js
src/integrations/github.js
src/api/agent.js
dashboard/src/lib/githubClone.ts
dashboard/components/WorkspaceLauncher.tsx
tests/unit/github-clone.test.mjs
```

*(Also touches `UnifiedSearchBar.tsx` — see §9.)*

---

## 9. Unified search & Cloudflare data planes

**Why:** Command palette must list **real** per-user CF resources (like `wrangler d1 list` / account API), paginate R2, show bound vs BYO assets, and offer **+ Connect Cloudflare** when disconnected — not hardcoded `inneranimalmedia` bucket rows.

| Commit | Message |
|--------|---------|
| `114dd19a` | Palette data planes: per-user CF catalog for D1, R2, Hyperdrive, and Vectorize |
| *(this ship)* | Mobile/desktop chip UX: `planes:` / `r2:` / `d1:` taps, fixed dropdown panel |

**API routes:**

- `GET /api/data-plane/customer-cloudflare/catalog`
- `GET .../d1-databases`, `r2-buckets`, `hyperdrive-configs`, `vectorize-indexes`

**Files:**

```
dashboard/components/UnifiedSearchBar.tsx
dashboard/index.css
dashboard/src/lib/paletteCloudflare.ts
src/api/customer-data-plane-api.js
src/core/customer-cloudflare-catalog.js
src/core/customer-cloudflare-dispatch.js
```

**UX modes:** `planes:`, `r2:`, `d1:`, `hyperdrive:`, `vectorize:`, `command:`, `workflow:`, `file:`, `clone:`.

---

## 10. CMS, settings, CfStack & database studio

**Why:** CMS publish was failing on R2 body reuse; settings endpoints drifted from D1 schema; CfStack must not silently pick `accounts[0]`; Database page should not leave stale D1 slug in URL on platform workspace.

| Commit | Message |
|--------|---------|
| `e7a31dc7` | fix(cms): R2 body-already-used and content scope in `executeCmsPagePublish` |
| `ae102c38` | Fix D1 schema drift in `/api/settings/{cicd,github,integrations/status}` |
| `1c9408a7` | CfStackWizard: real account picker, no silent default |
| `7883618a` | CF stack: real account-level resolution, no more `accounts[0]` guessing |
| `15099ecf` | Wire stack/enumerate to forward `account_id` to `handleCfStackEnumerate` |
| `887fdf43` | Fix Database page leaving stale/explicit D1 slug in URL on platform workspace |

**Files:**

```
src/core/cms-agent-publish.ts
src/api/settings-sections.js
src/api/integrations/cloudflare-stack.js
src/api/integrations.js
dashboard/components/settings/sections/CfStackWizard.tsx
dashboard/components/DatabasePage.tsx
```

---

## Migrations index (this sprint)

| Migration | Theme |
|-----------|--------|
| `738_ws_inneranimalmedia_identity_repair.sql` | Identity |
| `739_phase2_domain_capability_spine.sql` | Tool spine |
| `740_identity_spine_user_settings_sync.sql` | Identity |
| `740_archive_sprint_todo_noise.sql` | Projects |
| `741_project_spine_columns.sql` | Projects |
| `742_archive_unbound_sprint_todos.sql` | Projects |
| `743_dashboard_surface_tiles.sql` | Home tiles |
| `744_integration_catalog_icon_urls.sql` | Connectors |
| `699_agentsam_github_official_mcp_surface.sql` | GitHub MCP |
| `700_register_github_official_mcp_server.sql` | GitHub MCP |
| `spine_project_link.sql` | Projects / kanban |

Apply via standard D1 migration path for `inneranimalmedia-business` from this repo.

---

## Quick review commands

```bash
# Full file list in range
git diff --name-only 0dad18ac^..HEAD | sort

# Per-theme log
git log --oneline 0dad18ac^..HEAD

# Palette + data plane only
git log --oneline -- dashboard/components/UnifiedSearchBar.tsx src/core/customer-cloudflare-*.js

# Health after deploy
curl -sS https://inneranimalmedia.com/api/health | head
```

---

## Known follow-ups (not blocking this baseline)

| Item | Notes |
|------|--------|
| `docs/platform/terminal-three-lane-model.md` | Partially stale vs single-pool `MY_CONTAINER` |
| `my-app/` scaffold | Untracked local experiment — not part of platform ship |
| MCP worker repo | GitHub MCP *runtime* is separate deploy if handler changes land there |
| Commit message archaeology | This doc supersedes noisy one-liners for the 35-commit window; history unchanged |

---

*Generated 2026-06-30. Update `updated:` and append sections when the next infra sprint lands.*
