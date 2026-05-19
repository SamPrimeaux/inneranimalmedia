# Agent Sam — Worker Route Health Map
**Generated:** 2026-05-19T13:09:27.622321+00:00

## Summary
| Category | Count |
|----------|------:|
| Routes defined in Worker/src | 577 |
| Routes called from frontend | 366 |
| Routes mentioned in docs | 2485 |
| Matched (defined + called) | 193 |
| Defined only (possibly dead) | 316 |
| Called only (404 risk) | 98 |
| Documented only | 782 |
| SSE/streaming routes | 29 |

## SSE / Streaming Routes
Primary targets for the Event Protocol remaster.
- `ANY /api/agent/workflow/approve` — `src/api/agent.js:9024`
- `ANY /api/chat` — `src/integrations/ollama.js:22`
- `ANY /api/draw/` — `src/api/draw.js:454`
- `ANY /api/draw/connections` — `src/api/draw.js:280`
- `ANY /api/draw/download/` — `src/api/draw.js:257`
- `ANY /api/draw/export` — `src/api/draw.js:340`
- `ANY /api/draw/libraries` — `src/api/draw.js:216`
- `ANY /api/draw/list` — `src/api/draw.js:227`
- `ANY /api/draw/load` — `src/api/draw.js:241`
- `ANY /api/draw/save` — `src/api/draw.js:292`
- `ANY /api/generate` — `src/integrations/ollama.js:18`
- `ANY /api/integrations/gdrive/raw` — `src/api/integrations.js:819`
- `ANY /api/integrations/gdrive/raw` — `src/integrations/github.js:512`
- `ANY /api/integrations/github/raw` — `src/api/integrations.js:854`
- `ANY /api/mail/attachment/` — `src/api/mail.js:762`
- `ANY /api/r2/buckets` — `src/api/r2-api.js:379`
- `ANY /api/r2/copy` — `src/api/r2-api.js:785`
- `ANY /api/r2/multipart/create` — `src/api/r2-api.js:842`
- `ANY /api/r2/stream` — `src/api/r2-api.js:818`
- `ANY /api/tags` — `src/integrations/ollama.js:14`
- `ANY /api/terminal/assist` — `src/api/terminal.js:179`
- `ANY /api/terminal/session/register` — `src/api/terminal.js:90`
- `ANY /api/terminal/session/validate` — `src/api/terminal.js:54`
- `ANY /api/terminal/session/verify` — `src/api/terminal.js:27`
- `ANY /api/webhooks/anthropic` — `src/index.js:183`
- `ANY /api/webhooks/github` — `src/index.js:179`
- `ANY /designstudio/events` — `src/do/AgentChat.js:405`
- `ANY /designstudio/stream-event` — `src/do/AgentChat.js:394`
- `ANY /terminal/exec` — `src/do/AgentChat.js:327`

## Called-Only Routes (404 Risk)
Frontend calls these but no matching handler was found.
- `/api/agent/approval/:param` — called from `dashboard/src/components/ToolApprovalModal.tsx`
- `/api/agent/artifacts/:param` — called from `dashboard/api/artifacts.ts`
- `/api/agent/artifacts:param` — called from `dashboard/api/artifacts.ts`
- `/api/agent/notifications/:param/read` — called from `dashboard/App.tsx`
- `/api/agent/proposals/:param/approve` — called from `dashboard/features/agent-chat/ChatAssistant.tsx`
- `/api/agent/proposals/:param/deny` — called from `dashboard/features/agent-chat/ChatAssistant.tsx`
- `/api/agent/rules` — called from `dashboard/src/iamDashboardFeeds.ts`
- `/api/agent/sessions/:param/messages` — called from `dashboard/App.tsx`
- `/api/agent/today-todo` — called from `dashboard/src/iamDashboardFeeds.ts`
- `/api/agent/workspace/:param` — called from `dashboard/App.tsx`
- `/api/agentsam/workflow-runs/:param/approve` — called from `dashboard/features/agent-chat/components/WorkflowRunBoard.tsx`
- `/api/agentsam/workflows/:param/run` — called from `dashboard/features/agent-chat/components/WorkflowRunBoard.tsx`
- `/api/analytics/agent/stream-events` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/codebase/chunks` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/codebase/overview` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/codebase/symbols` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/costs` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/costs/forecasts` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/data-health` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/deploys/build-events` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/errors/events` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/models/performance-snapshots` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/prompts/runs` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/rag/documents` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/rag/search-log` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/analytics/tools/events` — called from `dashboard/config/analyticsDataSources.ts`
- `/api/auth/forgot-password` — called from `dashboard/components/auth/AuthForgotPage.tsx`
- `/api/auth/reset-password` — called from `dashboard/components/auth/AuthResetPage.tsx`
- `/api/calendar/events` — called from `dashboard/components/CalendarPage.tsx`
- `/api/calendar/view` — called from `dashboard/components/CalendarPage.tsx`
- `/api/cms/tenants` — called from `dashboard/components/ImagesPage.tsx`
- `/api/collab/canvas/elements` — called from `dashboard/components/ExcalidrawView.tsx`
- `/api/collab/canvas/state` — called from `dashboard/components/ExcalidrawView.tsx`
- `/api/d1/table` — called from `dashboard/components/DatabasePage.tsx`
- `/api/drive/delete` — called from `dashboard/components/GoogleDriveExplorer.tsx`
- `/api/drive/file` — called from `dashboard/App.tsx`
- `/api/drive/folder` — called from `dashboard/components/GoogleDriveExplorer.tsx`
- `/api/drive/search` — called from `dashboard/components/GoogleDriveExplorer.tsx`
- `/api/drive/upload` — called from `dashboard/components/GoogleDriveExplorer.tsx`
- `/api/finance/import-csv` — called from `dashboard/Finance.js`
- `/api/finance/summary` — called from `dashboard/Finance.js`
- `/api/finance/transactions` — called from `dashboard/Finance.js`
- `/api/github/repos/:param/:param/contents` — called from `dashboard/App.tsx`
- `/api/hyperdrive/table` — called from `dashboard/components/DatabasePage.tsx`
- `/api/images/:param` — called from `dashboard/components/ImagesPage.tsx`
- `/api/images/:param/meta` — called from `dashboard/components/ImagesPage.tsx`
- `/api/integrations/:param/webhook` — called from `dashboard/components/IntegrationsPage.deprecated.tsx`
- `/api/integrations/github/connect` — called from `dashboard/components/settings/sections/GitHubSection.tsx`
- `/api/mail/email/:param` — called from `dashboard/components/MailPage.tsx`
- `/api/mcp/agent/:param/chat` — called from `dashboard/components/McpPage.tsx`
- `/api/mcp/agent/:param/session` — called from `dashboard/components/McpPage.tsx`
- `/api/mcp/agent/:param/workflows` — called from `dashboard/components/McpPage.tsx`
- `/api/mcp/services` — called from `dashboard/components/McpPage.tsx`
- `/api/mcp/workflows` — called from `dashboard/components/McpPage.tsx`
- `/api/mcp/workflows/:param/run` — called from `dashboard/components/McpPage.tsx`
- `/api/meet/recording/save` — called from `dashboard/components/MeetPage.tsx`
- `/api/meet/rooms` — called from `dashboard/components/MeetPage.tsx`
- `/api/meet/schedule` — called from `dashboard/components/MeetPage.tsx`
- `/api/meet:param` — called from `dashboard/components/MeetPage.tsx`
- `/api/monaco/complete` — called from `dashboard/components/MonacoEditorView.tsx`
- `/api/moviemode/export-status/:param` — called from `dashboard/features/moviemode/ExportPanel.tsx`
- `/api/oauth/supabase/start` — called from `dashboard/components/IntegrationsPage.deprecated.tsx`
- `/api/overview/recent-activity` — called from `dashboard/src/iamDashboardFeeds.ts`
- `/api/projects/:param` — called from `dashboard/api/projects.ts`
- `/api/projects/overview:param` — called from `dashboard/api/projects.ts`
- `/api/rag/query` — called from `dashboard/components/KnowledgeSearchPanel.tsx`
- `/api/settings/agents/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/agents/commands/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/agents/domains/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/agents/mcp/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/agents:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/ai-models/:param` — called from `dashboard/components/settings/sections/AIModelsSection.tsx`
- `/api/settings/ai-models/keys/:param` — called from `dashboard/components/settings/sections/AIModelsSection.tsx`
- `/api/settings/api-keys/:param` — called from `dashboard/components/settings/sections/ApiKeysSection.tsx`
- `/api/settings/api-keys/:param/rotate` — called from `dashboard/components/settings/sections/ApiKeysSection.tsx`
- `/api/settings/commands/:param/toggle` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/hooks/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/integrations/:param/test` — called from `dashboard/components/settings/sections/IntegrationsSection.tsx`
- `/api/settings/mcp/tools/:param` — called from `dashboard/App.tsx`
- `/api/settings/mcp/tools/:param/toggle` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/models/:param/toggle` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/models/tiers/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/models:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/rules/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/security/findings/:param` — called from `dashboard/components/settings/sections/SecuritySection.tsx`
- `/api/settings/security/sessions/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/skills/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/subagents/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/tools/:param` — called from `dashboard/components/settings/sections/ToolsMcpSection.tsx`
- `/api/settings/workspace/reindex:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/settings/workspace:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/themes/active:param` — called from `dashboard/components/themes/ThemeBrowser.tsx`
- `/api/themes:param` — called from `dashboard/components/themes/ThemeBrowser.tsx`
- `/api/tunnel/restart` — called from `dashboard/components/XTermShell.tsx`
- `/api/vault/llm-keys/:param` — called from `dashboard/components/settings/hooks/useSettingsData.ts`
- `/api/vault/secrets/:param` — called from `dashboard/components/settings/sections/SecuritySection.tsx`
- `/api/vault/secrets/:param/reveal` — called from `dashboard/components/settings/sections/SecuritySection.tsx`
- `/api/workspace/:param` — called from `dashboard/components/LocalExplorer.tsx`

## Defined-Only Routes (Possibly Dead)
Defined in backend but not detected in frontend calls.
- `/` — `src/api/oauth-login-callbacks.js:53`
- `/api/...` — `src/index.js:68` *(documented)*
- `/api/admin/run-retention` — `src/index.js:204` *(documented)*
- `/api/agent` — `src/core/production-dispatch.js:177` *(documented)*
- `/api/agent/alignment-sync` — `src/api/agent.js:7992` *(documented)*
- `/api/agent/approve` — `src/index.js:550` *(documented)*
- `/api/agent/artifact` — `src/api/agent-artifacts.js:253` *(documented)*
- `/api/agent/boot` — `src/api/agent.js:8227` *(documented)*
- `/api/agent/bootstrap` — `src/api/agent.js:9207` *(documented)*
- `/api/agent/cicd` — `src/api/agent.js:6983` *(documented)*
- `/api/agent/conversations/search` — `src/api/agent.js:6981` *(documented)*
- `/api/agent/do-history` — `src/api/agent.js:9173` *(documented)*
- `/api/agent/execute` — `src/index.js:506` *(documented)*
- `/api/agent/git/repos` — `src/api/agent.js:8129` *(documented)*
- `/api/agent/github` — `src/api/dashboard.js:581` *(documented)*
- `/api/agent/github/file` — `src/integrations/github.js:46` *(documented)*
- `/api/agent/github/repos` — `src/integrations/github.js:29` *(documented)*
- `/api/agent/health` — `src/api/agent.js:6978` *(documented)*
- `/api/agent/intake` — `src/core/production-dispatch.js:156` *(documented)*
- `/api/agent/intake/answer` — `src/api/intake.js:154` *(documented)*
- `/api/agent/intake/start` — `src/api/intake.js:22` *(documented)*
- `/api/agent/keyboard-shortcuts` — `src/api/agent.js:7806` *(documented)*
- `/api/agent/mcp` — `src/api/agent.js:6984` *(documented)*
- `/api/agent/memory/search` — `src/api/agent.js:7937` *(documented)*
- `/api/agent/memory/sync` — `src/api/agent.js:7987` *(documented)*
- `/api/agent/memory/upsert` — `src/api/agent.js:7879` *(documented)*
- `/api/agent/modes` — `src/api/agent.js:6979` *(documented)*
- `/api/agent/proposals/pending` — `src/api/agent.js:8586` *(documented)*
- `/api/agent/propose` — `src/api/agent.js:8539` *(documented)*
- `/api/agent/rag/query` — `src/api/agent.js:9113` *(documented)*
- `/api/agent/session/mode` — `src/api/agent.js:7641` *(documented)*
- `/api/agent/subagent-profiles` — `src/api/agent.js:7242` *(documented)*
- `/api/agent/terminal/exec` — `src/api/dashboard.js:413` *(documented)*
- `/api/agent/terminal/socket-url` — `src/api/dashboard.js:262` *(documented)*
- `/api/agent/terminal/status` — `src/api/dashboard.js:372` *(documented)*
- `/api/agent/todo` — `src/api/agent.js:7534` *(documented)*
- `/api/agent/tool-smoke` — `src/api/agent.js:7389` *(documented)*
- `/api/agent/tools` — `src/api/agent.js:7339` *(documented)*
- `/api/agent/workers-ai/image` — `src/api/agent.js:9127` *(documented)*
- `/api/agent/workflow/approve` — `src/api/agent.js:9024` *(documented)*
- `/api/agent/workflows/trigger` — `src/api/agent.js:9093` *(documented)*
- `/api/agentsam` — `src/core/production-dispatch.js:93` *(documented)*
- `/api/agentsam/ai` — `src/api/agentsam.js:232` *(documented)*
- `/api/agentsam/invocations` — `src/api/agentsam.js:246` *(documented)*
- `/api/agentsam/plans` — `src/api/agentsam.js:41` *(documented)*
- `/api/agentsam/prompts` — `src/api/agentsam.js:365` *(documented)*
- `/api/agentsam/time` — `src/core/production-dispatch.js:89` *(documented)*
- `/api/ai` — `src/core/production-dispatch.js:200` *(documented)*
- `/api/ai/models` — `src/api/settings.js:1376` *(documented)*
- `/api/analytics` — `src/core/production-dispatch.js:271` *(documented)*
- `/api/analytics/layout` — `src/api/analytics/index.js:71` *(documented)*
- `/api/artifacts` — `src/api/studio-session.js:156` *(documented)*
- `/api/auth` — `src/core/production-dispatch.js:305` *(documented)*
- `/api/auth-hooks` — `src/index.js:417` *(documented)*
- `/api/auth-hooks/before-user-created` — `src/api/auth-hooks.js:263` *(documented)*
- `/api/auth-hooks/custom-access-token` — `src/api/auth-hooks.js:262` *(documented)*
- `/api/auth-hooks/send-email` — `src/api/auth-hooks.js:261` *(documented)*
- `/api/auth/agent-session/mint` — `src/api/auth.js:41` *(documented)*
- `/api/auth/backup-code` — `src/api/auth.js:92` *(documented)*
- `/api/auth/cloudflare/start` — `src/index.js:387` *(documented)*
- `/api/auth/github/start` — `src/index.js:363` *(documented)*
- `/api/auth/google/start` — `src/index.js:363` *(documented)*
- `/api/auth/logout` — `src/api/auth.js:95` *(documented)*
- `/api/auth/oauth/consent/approve` — `src/api/auth.js:1720` *(documented)*
- `/api/auth/oauth/consent/deny` — `src/api/auth.js:1716` *(documented)*
- `/api/auth/password-reset/confirm` — `src/api/auth.js:101` *(documented)*
- `/api/auth/password-reset/request` — `src/api/auth.js:98` *(documented)*
- `/api/auth/session` — `src/api/auth.js:81` *(documented)*
- `/api/auth/supabase/callback` — `src/api/auth.js:1110` *(documented)*
- `/api/auth/supabase/start` — `src/index.js:384` *(documented)*
- `/api/auth/verify-email` — `src/api/auth.js:51` *(documented)*
- `/api/billing` — `src/api/billing.js:787` *(documented)*
- `/api/billing/summary` — `src/api/finance.js:55` *(documented)*
- `/api/browser` — `src/api/dashboard.js:571` *(documented)*
- `/api/browser/screenshot` — `src/integrations/playwright.js:120` *(documented)*
- `/api/cad` — `src/core/production-dispatch.js:159` *(documented)*
- `/api/cad/blender/script` — `src/api/cad.js:198` *(documented)*
- `/api/cad/jobs` — `src/api/cad.js:261` *(documented)*
- `/api/cad/meshy/generate` — `src/api/cad.js:18` *(documented)*
- `/api/cad/openscad/generate` — `src/api/cad.js:141` *(documented)*
- `/api/calendar` — `src/api/calendar.js:136` *(documented)*
- `/api/canvas/theme` — `src/api/draw.js:180` *(documented)*
- `/api/chat` — `src/api/dashboard.js:533` *(documented)*
- `/api/cicd` — `src/core/production-dispatch.js:209` *(documented)*
- `/api/cicd/current` — `src/api/cicd.js:22` *(documented)*
- `/api/cicd/run` — `src/api/cicd.js:30` *(documented)*
- `/api/cicd/runs` — `src/api/cicd.js:185` *(documented)*
- `/api/clients` — `src/api/finance.js:47` *(documented)*
- `/api/cms` — `src/core/production-dispatch.js:98` *(documented)*
- `/api/cms/pages` — `src/api/cms.js:113` *(documented)*
- `/api/collab/canvas` — `src/do/Collaboration.js:24` *(documented)*
- `/api/collab/room/{room}` — `src/index.js:241` *(documented)*
- `/api/context/attached-content` — `src/tools/builtin/context.js:39` *(documented)*
- `/api/context/chunk` — `src/tools/builtin/context.js:34` *(documented)*
- `/api/context/extract` — `src/tools/builtin/context.js:37` *(documented)*
- `/api/context/knowledge-search` — `src/tools/builtin/context.js:24` *(documented)*
- `/api/context/memory/add` — `src/tools/builtin/context.js:28` *(documented)*
- `/api/context/memory/list` — `src/tools/builtin/context.js:29` *(documented)*
- `/api/context/optimize` — `src/tools/builtin/context.js:32` *(documented)*
- `/api/context/progressive` — `src/tools/builtin/context.js:33` *(documented)*
- `/api/context/progressive-search` — `src/tools/builtin/context.js:40` *(documented)*
- `/api/context/rag-search` — `src/tools/builtin/context.js:25` *(documented)*
- `/api/context/summarize-code` — `src/tools/builtin/context.js:38` *(documented)*
- `/api/convert/create` — `src/tools/builtin/integrations.js:71` *(documented)*
- `/api/convert/status` — `src/tools/builtin/integrations.js:72` *(documented)*
- `/api/cursor` — `src/core/production-dispatch.js:168` *(documented)*
- `/api/cursor/agent/:param/stream` — `src/api/cursor-agent.js:91` *(documented)*
- `/api/cursor/agent/spawn` — `src/api/cursor-agent.js:17` *(documented)*
- `/api/cursor/agents` — `src/api/cursor-agent.js:215` *(documented)*
- `/api/d1` — `src/core/production-dispatch.js:149` *(documented)*
- `/api/dashboard/status-bundle` — `src/core/production-dispatch.js:153` *(documented)*
- `/api/deployments` — `src/core/production-dispatch.js:229` *(documented)*
- `/api/deployments/recent` — `src/api/deployments.js:61` *(documented)*
- `/api/designstudio` — `src/core/production-dispatch.js:225` *(documented)*
- `/api/designstudio/blueprints` — `src/api/designstudio/index.js:200` *(documented)*
- `/api/designstudio/runs` — `src/api/designstudio/index.js:332` *(documented)*
- `/api/draw` — `src/api/dashboard.js:561` *(documented)*
- `/api/draw/clear` — `src/tools/builtin/media.js:27` *(documented)*
- `/api/draw/connections` — `src/api/draw.js:280` *(documented)*
- `/api/draw/download` — `src/api/draw.js:257` *(documented)*
- `/api/draw/elements` — `src/tools/builtin/media.js:28` *(documented)*
- `/api/draw/export` — `src/api/draw.js:340` *(documented)*
- `/api/draw/libraries` — `src/api/draw.js:216` *(documented)*
- `/api/draw/library` — `src/tools/builtin/media.js:30` *(documented)*
- `/api/draw/list` — `src/api/draw.js:227` *(documented)*
- `/api/draw/load` — `src/api/draw.js:241` *(documented)*
- `/api/draw/save` — `src/api/draw.js:292` *(documented)*
- `/api/email/broadcast` — `src/tools/builtin/integrations.js:57` *(documented)*
- `/api/email/domains` — `src/tools/builtin/integrations.js:58` *(documented)*
- `/api/email/inbound` — `src/api/integrations.js:124` *(documented)*
- `/api/email/keys` — `src/tools/builtin/integrations.js:59` *(documented)*
- `/api/email/send` — `src/core/production-dispatch.js:283` *(documented)*
- `/api/finance` — `src/api/finance.js:24` *(documented)*
- `/api/games` — `src/core/production-dispatch.js:300` *(documented)*
- `/api/games/rooms` — `src/api/games.js:20` *(documented)*
- `/api/games/ws` — `src/api/games.js:63` *(documented)*
- `/api/gdrive/fetch` — `src/tools/builtin/integrations.js:68` *(documented)*
- `/api/gdrive/list` — `src/tools/builtin/integrations.js:67` *(documented)*
- `/api/generate` — `src/integrations/ollama.js:18` *(documented)*
- `/api/health/hyperdrive` — `src/api/health/index.js:46` *(documented)*
- `/api/hooks/supabase` — `src/index.js:187` *(documented)*
- `/api/hub` — `src/core/production-dispatch.js:263` *(documented)*
- `/api/hyperdrive` — `src/api/dashboard.js:566` *(documented)*
- `/api/images/cf/delete` — `src/tools/builtin/integrations.js:64` *(documented)*
- `/api/images/cf/list` — `src/tools/builtin/integrations.js:63` *(documented)*
- `/api/images/cf/upload` — `src/tools/builtin/integrations.js:62` *(documented)*
- `/api/images/edit` — `src/tools/builtin/media.js:72` *(documented)*
- `/api/images/generate` — `src/tools/builtin/media.js:71` *(documented)*
- `/api/integrations` — `src/api/integrations.js:132` *(documented)*
- `/api/integrations/api-keys` — `src/api/integrations.js:185` *(documented)*
- `/api/integrations/bluebubbles/webhook` — `src/api/integrations.js:110` *(documented)*
- `/api/integrations/events` — `src/api/integrations.js:176` *(documented)*
- `/api/integrations/gdrive/raw` — `src/api/integrations.js:819` *(documented)*
- `/api/integrations/github/file` — `src/api/integrations.js:842` *(documented)*
- `/api/integrations/github/files` — `src/api/integrations.js:832` *(documented)*
- `/api/integrations/github/raw` — `src/api/integrations.js:854` *(documented)*
- `/api/integrations/mcp-tools` — `src/api/integrations.js:182` *(documented)*
- `/api/integrations/resend/webhook` — `src/api/integrations.js:115` *(documented)*
- `/api/internal` — `src/core/production-dispatch.js:229` *(documented)*
- `/api/internal/cicd-event` — `src/core/production-dispatch.js:213` *(documented)*
- `/api/internal/designstudio` — `src/core/production-dispatch.js:225` *(documented)*
- `/api/internal/designstudio/sync-run` — `src/api/designstudio/index.js:517` *(documented)*
- `/api/internal/post-deploy` — `src/core/production-dispatch.js:217` *(documented)*
- `/api/internal/record-deploy` — `src/api/deployments.js:74` *(documented)*
- `/api/internal/trigger-workers-build` — `src/core/production-dispatch.js:221` *(documented)*
- `/api/learn` — `src/core/production-dispatch.js:292` *(documented)*
- `/api/mail` — `src/core/production-dispatch.js:279` *(documented)*
- `/api/mail/attachment` — `src/api/mail.js:762` *(documented)*
- `/api/mail/email` — `src/api/mail.js:654` *(documented)*
- `/api/mail/gmail/callback` — `src/api/mail.js:383` *(documented)*
- `/api/mail/label` — `src/api/mail.js:892` *(documented)*
- `/api/mail/labels` — `src/api/mail.js:824` *(documented)*
- `/api/mcp` — `src/core/production-dispatch.js:246` *(documented)*
- `/api/mcp/agents/dispatch` — `src/api/mcp.js:665` *(documented)*
- `/api/mcp/agents/status` — `src/api/mcp.js:559` *(documented)*
- `/api/mcp/audit` — `src/api/mcp.js:541` *(documented)*
- `/api/mcp/commands` — `src/api/mcp.js:959` *(documented)*
- `/api/mcp/credentials` — `src/api/mcp.js:534` *(documented)*
- `/api/mcp/server-allowlist` — `src/api/mcp.js:527` *(documented)*
- `/api/mcp/servers` — `src/api/mcp.js:280` *(documented)*
- `/api/mcp/stats` — `src/api/mcp.js:549` *(documented)*
- `/api/mcp/status` — `src/api/mcp.js:275` *(documented)*
- `/api/mcp/token/create` — `src/index.js:466` *(documented)*
- `/api/mcp/token/revoke` — `src/index.js:494` *(documented)*
- `/api/mcp/tool-calls` — `src/api/mcp-calls.js:12` *(documented)*
- `/api/mcp/tools/catalog` — `src/api/mcp.js:808` *(documented)*
- `/api/media/assets/register` — `src/api/moviemode-api.js:105` *(documented)*
- `/api/meet` — `src/api/meet.js:187` *(documented)*
- `/api/meshy/image-to-3d` — `src/tools/builtin/media.js:67` *(documented)*
- `/api/meshy/task` — `src/tools/builtin/media.js:68`
- `/api/meshy/text-to-3d` — `src/tools/builtin/media.js:66` *(documented)*
- `/api/moviemode` — `src/core/production-dispatch.js:130` *(documented)*
- `/api/moviemode/agent` — `src/api/moviemode-api.js:253` *(documented)*
- `/api/moviemode/ingest` — `src/api/moviemode-api.js:249` *(documented)*
- `/api/moviemode/projects` — `src/api/moviemode-api.js:38` *(documented)*
- `/api/moviemode/render-jobs` — `src/api/moviemode-api.js:148` *(documented)*
- `/api/moviemode/timelines` — `src/api/moviemode-api.js:207` *(documented)*
- `/api/notifications/email` — `src/core/production-dispatch.js:287` *(documented)*
- `/api/notify/deploy-complete` — `src/core/production-dispatch.js:242` *(documented)*
- `/api/oauth` — `src/index.js:374` *(documented)*
- `/api/oauth/authorize` — `src/api/oauth.js:1057` *(documented)*
- `/api/oauth/gmail/callback` — `src/api/oauth.js:1070` *(documented)*
- `/api/oauth/gmail/start` — `src/api/oauth.js:1067` *(documented)*
- `/api/oauth/google/:wildcard` — `src/api/oauth.js:390` *(documented)*
- `/api/oauth/supabase/callback` — `src/api/auth.js:1155` *(documented)*
- `/api/oauth/token` — `src/api/oauth.js:1060` *(documented)*
- `/api/oauth/userinfo` — `src/api/oauth.js:1063` *(documented)*
- `/api/onboarding` — `src/core/production-dispatch.js:296` *(documented)*
- `/api/onboarding/send-invite` — `src/api/onboarding.js:674` *(documented)*
- `/api/onboarding/status` — `src/api/onboarding.js:1075` *(documented)*
- `/api/overview` — `src/core/production-dispatch.js:275` *(documented)*
- `/api/overview/goals-launch` — `src/api/overview.js:128` *(documented)*
- `/api/platform/a11y/audit` — `src/tools/builtin/platform.js:28` *(documented)*
- `/api/platform/a11y/summary` — `src/tools/builtin/platform.js:29` *(documented)*
- `/api/platform/clients` — `src/tools/builtin/platform.js:25` *(documented)*
- `/api/platform/info` — `src/tools/builtin/platform.js:24` *(documented)*
- `/api/projects/overview` — `src/api/projects.js:713` *(documented)*
- `/api/provider-colors` — `src/index.js:218` *(documented)*
- `/api/r2` — `src/core/production-dispatch.js:126` *(documented)*
- `/api/r2/copy` — `src/api/r2-api.js:785` *(documented)*
- `/api/r2/delete-batch` — `src/api/r2-api.js:736` *(documented)*
- `/api/r2/head` — `src/api/r2-api.js:765` *(documented)*
- `/api/r2/put` — `src/api/r2-api.js:649` *(documented)*
- `/api/r2/stats` — `src/api/r2-api.js:426` *(documented)*
- `/api/r2/stream` — `src/api/r2-api.js:818` *(documented)*
- `/api/r2/sync` — `src/api/r2-api.js:438` *(documented)*
- `/api/r2/url` — `src/api/r2-api.js:988` *(documented)*
- `/api/rag/ingest` — `src/api/rag.js:828` *(documented)*
- `/api/rag/search` — `src/api/rag.js:831` *(documented)*
- `/api/rag/sync` — `src/api/rag.js:834` *(documented)*
- `/api/search` — `src/api/rag.js:825` *(documented)*
- `/api/settings` — `src/core/production-dispatch.js:198` *(documented)*
- `/api/settings/ai-models/usage` — `src/api/settings.js:1860` *(documented)*
- `/api/settings/billing/status` — `src/api/settings-sections.js:1184` *(documented)*
- `/api/settings/feature-flags` — `src/api/settings.js:717`
- `/api/settings/hooks/status` — `src/api/settings-sections.js:1183` *(documented)*
- `/api/settings/integrations` — `src/api/settings-integrations.js:353` *(documented)*
- `/api/settings/integrations/status` — `src/api/settings-sections.js:1190` *(documented)*
- `/api/settings/mcp/status` — `src/api/settings.js:2250` *(documented)*
- `/api/settings/model-preference` — `src/api/settings.js:1389` *(documented)*
- `/api/settings/models` — `src/api/settings.js:2151` *(documented)*
- `/api/settings/preferences` — `src/api/settings.js:595` *(documented)*
- `/api/settings/storage/status` — `src/api/settings-sections.js:1188` *(documented)*
- `/api/settings/theme` — `src/api/settings.js:565` *(documented)*
- `/api/settings/themes/status` — `src/api/settings-sections.js:1181` *(documented)*
- `/api/settings/tools/status` — `src/api/settings-sections.js:1186` *(documented)*
- `/api/settings/workspace/default` — `src/api/settings.js:1329` *(documented)*
- `/api/settings/workspace/members` — `src/api/settings-workspace.js:309` *(documented)*
- `/api/settings/workspace/members/invite` — `src/api/settings-workspace.js:362` *(documented)*
- `/api/settings/workspace/modules` — `src/api/settings-workspace.js:653` *(documented)*
- `/api/settings/workspace/reindex` — `src/api/settings.js:3179` *(documented)*
- `/api/storage` — `src/core/production-dispatch.js:122` *(documented)*
- `/api/storage/access-keys` — `src/api/storage.js:731` *(documented)*
- `/api/storage/activity` — `src/api/storage.js:567` *(documented)*
- `/api/storage/jobs` — `src/api/storage.js:591` *(documented)*
- `/api/storage/jobs/rollup-bucket-summary` — `src/api/storage.js:623` *(documented)*
- `/api/storage/jobs/rollup-worker-analytics` — `src/api/storage.js:648` *(documented)*
- `/api/storage/jobs/sync-project-storage` — `src/api/storage.js:595` *(documented)*
- `/api/storage/preferences` — `src/api/storage.js:811` *(documented)*
- `/api/storage/r2/list` — `src/tools/builtin/storage.js:26` *(documented)*
- `/api/storage/r2/read` — `src/tools/builtin/storage.js:27` *(documented)*
- `/api/storage/r2/search` — `src/tools/builtin/storage.js:29` *(documented)*
- `/api/storage/r2/summary` — `src/tools/builtin/storage.js:31` *(documented)*
- `/api/storage/r2/url` — `src/tools/builtin/storage.js:30` *(documented)*
- `/api/storage/r2/write` — `src/tools/builtin/storage.js:28` *(documented)*
- `/api/storage/s3-config` — `src/api/storage.js:723` *(documented)*
- `/api/storage/s3/keys` — `src/api/storage.js:731` *(documented)*
- `/api/storage/settings` — `src/api/storage.js:822` *(documented)*
- `/api/studio` — `src/core/production-dispatch.js:162` *(documented)*
- `/api/system/health` — `src/index.js:446` *(documented)*
- `/api/tags` — `src/integrations/ollama.js:14` *(documented)*
- `/api/tenant` — `src/core/production-dispatch.js:199` *(documented)*
- `/api/tenant/branding` — `src/api/settings.js:1094` *(documented)*
- `/api/tenant/onboarding` — `src/api/settings.js:943` *(documented)*
- `/api/terminal` — `src/core/production-dispatch.js:178` *(documented)*
- `/api/terminal/assist` — `src/api/terminal.js:179` *(documented)*
- `/api/terminal/session/register` — `src/api/terminal.js:90` *(documented)*
- `/api/terminal/session/validate` — `src/api/terminal.js:54` *(documented)*
- `/api/terminal/session/verify` — `src/api/provisioning.js:441` *(documented)*
- `/api/test/code-execution-e2e` — `src/index.js:193` *(documented)*
- `/api/themes` — `src/api/themes.js:287` *(documented)*
- `/api/themes/create` — `src/api/themes.js:354` *(documented)*
- `/api/unified-search/recent` — `src/api/unified-search.js:476` *(documented)*
- `/api/user/storage-keys` — `src/core/production-dispatch.js:118`
- `/api/user/storage-keys/cloudflare` — `src/api/user-storage-keys.js:21`
- `/api/v1:param` — `src/integrations/bluebubbles.js:15`
- `/api/vault` — `src/core/production-dispatch.js:145` *(documented)*
- `/api/vault/audit` — `src/api/vault.js:443` *(documented)*
- `/api/vault/projects` — `src/api/vault.js:442` *(documented)*
- `/api/vault/registry` — `src/api/vault.js:439` *(documented)*
- `/api/voxel/generate` — `src/tools/builtin/media.js:62` *(documented)*
- `/api/voxel/spawn` — `src/tools/builtin/media.js:63` *(documented)*
- `/api/webhooks/anthropic` — `src/index.js:183` *(documented)*
- `/api/webhooks/github` — `src/index.js:179` *(documented)*
- `/api/webhooks/resend` — `src/api/integrations.js:115` *(documented)*
- `/api/webhooks/stripe` — `src/api/billing.js:727` *(documented)*
- `/api/webhooks/supabase` — `src/index.js:187` *(documented)*
- `/api/workflow/plan` — `src/tools/builtin/workflow.js:24` *(documented)*
- `/api/workflow/summary` — `src/tools/builtin/workflow.js:23` *(documented)*
- `/api/workspace` — `src/core/production-dispatch.js:205` *(documented)*
- `/api/workspace/list` — `src/api/workspace.js:58` *(documented)*
- `/api/workspaces/current/shell` — `src/api/workspace.js:182` *(documented)*
- `/broadcast` — `src/do/Collaboration.js:29`
- `/canvas/elements` — `src/do/Collaboration.js:53`
- `/canvas/state` — `src/do/Collaboration.js:44`
- `/canvas/theme` — `src/do/Collaboration.js:64`
- `/dashboard/settings/integrations` — `src/api/oauth-login-callbacks.js:54`
- `/designstudio/events` — `src/do/AgentChat.js:405`
- `/designstudio/stream-event` — `src/do/AgentChat.js:394`
- `/health` — `src/do/AgentChat.js:331`
- `/history` — `src/do/AgentChat.js:335`
- `/message` — `src/do/AgentChat.js:344`
- `/rag-cache` — `src/do/AgentChat.js:360`
- `/terminal/exec` — `src/do/AgentChat.js:327`
- `/terminal/status` — `src/do/AgentChat.js:321`
- `/terminal/ws` — `src/do/AgentChat.js:317`

## Documented-Only Routes
- `/api/(cms|themes|pages|sections)|cms_` — `scripts/audit/iam_audit_report.md`
- `/api/:wildcard` — `docs/CURRENT_STATE_AUDIT_2026-05-01.md`
- `/api/[a-zA-Z0-9_./-]+` — `scripts/audit/iam_audit_report.md`
- `/api/\` — `scripts/audit/iam_audit_report.md`
- `/api/admin/archive-conversations` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/admin/cleanup/stuck-runs` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/admin/db-health` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/admin/overnight/start` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/admin/overnight/start`` — `docs/PLATFORM_WIREFRAME_TECHNICAL_OVERVIEW.md`
- `/api/admin/overnight/validate` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/admin/overnight/validate`` — `docs/PLATFORM_WIREFRAME_TECHNICAL_OVERVIEW.md`
- `/api/admin/rag-backfill` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/admin/reindex-codebase` — `docs/AUTORAG_SEARCH_AUDIT.md`
- `/api/admin/retention` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/admin/retention`` — `docs/cursor-session-log.md`
- `/api/admin/run-provider-test`` — `docs/ARCHITECTURE.md`
- `/api/admin/run-provider-test`:wildcard` — `docs/ARCHITECTURE.md`
- `/api/admin/send-digest`` — `docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md`
- `/api/admin/trigger-workflow` — `docs/AGENT_SAM_100_AUDIT_2026-03-18.md`
- `/api/admin/trigger-workflow`` — `docs/AGENT_SAM_100_AUDIT_2026-03-18.md`
- `/api/admin/trigger-workflow`.` — `docs/METRICS_AND_MONITORING_AUDIT.md`
- `/api/admin/vectorize-kb` — `docs/AGENT_SAM_AUDIT_AND_ROADMAP.md`
- `/api/admin/vectorize-kb`:wildcard` — `docs/memory/D1_CANONICAL_AGENT_KEYS.md`
- `/api/agen` — `scripts/audit_hardcoded_identity_report.md`
- `/api/agent-sam` — `scripts/audit/iam_audit_report.md`
- `/api/agent-sam/:wildcard` — `docs/modularization/WORKER_EXTRACTION_AUDIT_2026-05-01.md`
- `/api/agent-sam/agent-runs` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/agent-sam/deployments` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/agent...` — `scripts/audit/iam_audit_report.md`
- `/api/agent/...` — `docs/agent-api-contract-audit.md`
- `/api/agent/...\` — `scripts/audit/iam_audit_report.md`
- `/api/agent/:wildcard` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`
- `/api/agent/:wildcard`` — `docs/specs/AGENT_DASHBOARD_FULL_TECH_SPEC.md`
- `/api/agent/[a-zA-Z0-9_./-]+` — `scripts/audit/iam_audit_report.md`
- `/api/agent/apply-change-set` — `docs/LIVE_DASHBOARD_API_SURFACE.md`
- `/api/agent/approval` — `docs/agent-api-contract-audit.md`
- `/api/agent/audit-log` — `docs/LIVE_DASHBOARD_API_SURFACE.md`
- `/api/agent/boot",` — `scripts/smoke/agentsam_seed_visualizer_todos.py`
- `/api/agent/boot:wildcard` — `docs/TERMINAL_SERVER_SETUP.md`
- `/api/agent/boot:wildcard,` — `docs/AGENT_UI_PRE_LAUNCH_STATUS.md`
- `/api/agent/boot`` — `docs/AGENT_SAM_FULL_CAPABILITY_AUDIT.md`
- `/api/agent/bootstrap`` — `docs/AGENT_SAM_FULL_CAPABILITY_AUDIT.md`
- `/api/agent/browse` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/agent/browse),` — `docs/cursor-session-log.md`
- `/api/agent/browse`` — `docs/cursor-session-log.md`
- `/api/agent/change-set` — `docs/LIVE_DASHBOARD_API_SURFACE.md`
- `/api/agent/chat/execute-approved-tool\` — `scripts/audit/iam_audit_report.md`
- `/api/agent/chat/execute-approved-tool\\\` — `scripts/audit/iam_audit_report.md`
- `/api/agent/chat\` — `scripts/audit/iam_audit_report.md`
- `/api/agent/chat\\\` — `scripts/audit/iam_audit_report.md`
- `/api/agent/chat`` — `docs/AGENT_SAM_FULL_CAPABILITY_AUDIT.md`
- `/api/agent/chat`)` — `docs/OVERNIGHT_EMAIL_AND_METRICS.md`
- `/api/agent/chat`);` — `docs/OVERNIGHT_BATCH_API_TEST_BRIEF.md`
- `/api/agent/chat`,` — `docs/audits/agentsam-workspace-capability-map.md`
- `/api/agent/chat`.` — `docs/DASHBOARD_METRICS_AND_TIME_TRACKING.md`
- `/api/agent/chat`:param` — `docs/iam-docs/platform/worker-routing.md`
- `/api/agent/chat`:wildcard.` — `docs/iam-docs/agents/README.md`
- `/api/agent/chat`:wildcard:` — `docs/iam-docs/platform/bindings-reference.md`
- `/api/agent/cicd:wildcard` — `docs/PLATFORM_TABLES_AUDIT_AND_WIRING.md`
- `/api/agent/cicd`` — `docs/AGENT_SAM_FULL_CAPABILITY_AUDIT.md`
- `/api/agent/cicd`,` — `docs/PLATFORM_WIREFRAME_TECHNICAL_OVERVIEW.md`
- `/api/agent/commands/execute` — `docs/AGENT_SAM_DASHBOARD_FEATURE_STATUS_REPORT.md`
- `/api/agent/commands/execute`` — `docs/cursor-session-log.md`
- `/api/agent/commands/execute`:wildcard` — `docs/knowledge/workflows/IAM_DEPLOY_PROMOTE_AND_SESSION_LOG_RAG.md`
- `/api/agent/context` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`
- `/api/agent/context-picker/catalog\` — `scripts/audit/iam_audit_report.md`
- `/api/agent/context-picker/catalog\\\` — `scripts/audit/iam_audit_report.md`
- `/api/agent/context-refs` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`
- `/api/agent/context/bootstrap` — `docs/codebase-index/ws_inneranimalmedia/route-map.md`
- `/api/agent/context/bootstrap`` — `docs/ARCHITECTURAL_AUDIT.md`
- `/api/agent/context/bootstrap`,` — `docs/AGENT_SAM_FULL_CAPABILITY_AUDIT.md`
- `/api/agent/conversations` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`
- `/api/agent/conversations/:param` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`
- `/api/agent/db-context` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`
- `/api/agent/db-schema` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`
- `/api/agent/db-table-count` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`
- `/api/agent/exec` — `scripts/audit/iam_audit_report.md`
- `/api/agent/execute-action` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`
- `/api/agent/execute-request` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`
- `/api/agent/generate-image` — `docs/AGENT_SAM_WORKSTATION_MASTER_PLAN.md`

## Matched Routes
| Route | Method | File | Documented |
|-------|--------|------|------------|
| `/api/agent/allowlist` | ANY | `src/api/agent.js` | yes |
| `/api/agent/approval/pending` | ANY | `src/api/agent.js` | yes |
| `/api/agent/artifact-filters` | ANY | `src/api/agent-artifacts.js` | yes |
| `/api/agent/artifacts` | ANY | `src/api/agent-artifacts.js` | yes |
| `/api/agent/chat` | ANY | `src/api/agent.js` | yes |
| `/api/agent/chat/execute-approved-tool` | ANY | `src/api/agent.js` | yes |
| `/api/agent/commands` | ANY | `src/api/agent.js` | yes |
| `/api/agent/context-picker/catalog` | ANY | `src/api/agent.js` | yes |
| `/api/agent/db/query-history` | ANY | `src/api/agent.js` | yes |
| `/api/agent/db/snippets` | ANY | `src/api/agent.js` | yes |
| `/api/agent/db/tables` | ANY | `src/api/agent.js` | yes |
| `/api/agent/git/branches` | ANY | `src/api/agent.js` | yes |
| `/api/agent/git/status` | ANY | `src/api/agent.js` | yes |
| `/api/agent/git/sync` | ANY | `src/api/agent.js` | yes |
| `/api/agent/memory/list` | ANY | `src/api/agent.js` | yes |
| `/api/agent/models` | ANY | `src/api/agent.js` | yes |
| `/api/agent/notifications` | ANY | `src/api/agent.js` | yes |
| `/api/agent/plan-task/resume` | ANY | `src/api/agent.js` | yes |
| `/api/agent/problems` | ANY | `src/api/agent.js` | yes |
| `/api/agent/sessions` | ANY | `src/api/agent.js` | yes |
| `/api/agent/telemetry` | ANY | `src/api/agent.js` | yes |
| `/api/agent/terminal/complete` | ANY | `src/api/dashboard.js` | yes |
| `/api/agent/terminal/config-status` | ANY | `src/api/agent.js` | yes |
| `/api/agent/terminal/run` | ANY | `src/api/dashboard.js` | yes |
| `/api/agent/terminal/ws` | ANY | `src/api/dashboard.js` | yes |
| `/api/agent/workflow/start` | ANY | `src/api/agent.js` | yes |
| `/api/agentsam/agent-chat-plan-trace` | ANY | `src/api/agentsam.js` | yes |
| `/api/agentsam/browser/trust` | ANY | `src/core/production-dispatch.js` | yes |
| `/api/agentsam/config` | ANY | `src/api/agentsam.js` | yes |
| `/api/agentsam/skills` | ANY | `src/api/agentsam.js` | yes |
| `/api/agentsam/workflows` | ANY | `src/api/agentsam.js` | yes |
| `/api/analytics/advisors` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/advisors/guardrails` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/agent/dependencies` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/agent/graph` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/agent/runs` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/codebase` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/errors/d1-log` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/mcp/tools` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/models/drift` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/models/evals` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/models/leaderboard` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/models/prompt-cache` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/models/routing-arms` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/models/routing-decisions` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/overview` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/rag` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/source-health` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/workers/dashboard-versions` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/workers/r2` | ANY | `src/api/analytics/index.js` | yes |
| `/api/analytics/workers/summary` | ANY | `src/api/analytics/index.js` | yes |
| `/api/auth/email-change/request` | ANY | `src/api/auth.js` | yes |
| `/api/auth/identities` | ANY | `src/api/auth.js` | yes |
| `/api/auth/login` | ANY | `src/api/auth.js` | yes |
| `/api/auth/me` | ANY | `src/api/auth.js` | yes |
| `/api/auth/oauth/consent` | ANY | `src/index.js` | yes |
| `/api/auth/password-change` | ANY | `src/api/auth.js` | yes |
| `/api/auth/signup` | ANY | `src/api/auth.js` | yes |
| `/api/billing/checkout` | ANY | `src/api/billing.js` | yes |
| `/api/billing/invoices` | ANY | `src/api/billing.js` | yes |
| `/api/billing/plans` | ANY | `src/api/billing.js` | yes |
| `/api/billing/portal` | ANY | `src/api/billing.js` | yes |
| `/api/billing/subscription` | ANY | `src/api/billing.js` | yes |
| `/api/catalog/integrations` | ANY | `src/index.js` | yes |
| `/api/commands` | ANY | `src/core/production-dispatch.js` | yes |
| `/api/d1/query` | ANY | `src/api/d1-dashboard.js` | yes |
| `/api/d1/tables` | ANY | `src/api/d1-dashboard.js` | yes |
| `/api/games/pieces` | ANY | `src/api/games.js` | yes |
| `/api/health` | ANY | `src/index.js` | yes |
| `/api/health/advisors` | ANY | `src/api/health/index.js` | yes |
| `/api/health/agent` | ANY | `src/api/health/index.js` | yes |
| `/api/health/agentsam-d1` | ANY | `src/api/health/index.js` | yes |
| `/api/health/deployments` | ANY | `src/api/health/index.js` | yes |
| `/api/health/mcp` | ANY | `src/api/health/index.js` | yes |
| `/api/health/mcp/check` | ANY | `src/api/health/index.js` | yes |
| `/api/health/models` | ANY | `src/api/health/index.js` | yes |
| `/api/health/summary` | ANY | `src/api/health/index.js` | yes |
| `/api/health/workers` | ANY | `src/api/health/index.js` | yes |
| `/api/hyperdrive/health` | ANY | `src/integrations/hyperdrive.js` | yes |
| `/api/hyperdrive/query` | ANY | `src/integrations/hyperdrive.js` | yes |
| `/api/hyperdrive/status` | ANY | `src/integrations/hyperdrive.js` | yes |
| `/api/hyperdrive/tables` | ANY | `src/integrations/hyperdrive.js` | yes |
| `/api/images` | ANY | `src/api/images-workspace.js` | yes |
| `/api/integrations/gdrive/file` | ANY | `src/api/integrations.js` | yes |
| `/api/integrations/gdrive/files` | ANY | `src/api/integrations.js` | yes |
| `/api/integrations/github/repos` | ANY | `src/api/integrations.js` | yes |
| `/api/integrations/status` | ANY | `src/api/integrations.js` | yes |
| `/api/integrations/summary` | ANY | `src/api/integrations.js` | yes |
| `/api/integrations/supabase` | ANY | `src/api/integrations.js` | yes |
| `/api/integrations/webhooks` | ANY | `src/api/integrations.js` | yes |
| `/api/internal/git-status` | ANY | `src/api/deployments.js` | yes |
| `/api/learn/dashboard` | ANY | `src/api/learn.js` | yes |
| `/api/learn/progress` | ANY | `src/api/learn.js` | yes |
| `/api/learn/submit` | ANY | `src/api/learn.js` | yes |
| `/api/mail/archived` | ANY | `src/api/mail.js` | yes |
| `/api/mail/draft` | ANY | `src/api/mail.js` | yes |
| `/api/mail/gmail/start` | ANY | `src/api/mail.js` | yes |
| `/api/mail/gmail/status` | ANY | `src/api/mail.js` | yes |
| `/api/mail/inbox` | ANY | `src/api/mail.js` | yes |
| `/api/mail/send` | ANY | `src/api/mail.js` | yes |
| `/api/mail/senders` | ANY | `src/api/mail.js` | yes |
| `/api/mail/sent` | ANY | `src/api/mail.js` | yes |
| `/api/mail/starred` | ANY | `src/api/mail.js` | yes |
| `/api/mail/stats` | ANY | `src/api/mail.js` | yes |
| `/api/mail/templates` | ANY | `src/api/mail.js` | yes |
| `/api/mcp/agent/session/start` | ANY | `src/api/mcp.js` | yes |
| `/api/mcp/agents` | ANY | `src/api/mcp.js` | yes |
| `/api/mcp/agents/reset` | ANY | `src/api/mcp.js` | yes |
| `/api/mcp/agents/reset-all` | ANY | `src/api/mcp.js` | yes |
| `/api/mcp/dispatch` | ANY | `src/api/mcp.js` | yes |
| `/api/mcp/invoke` | ANY | `src/api/mcp.js` | yes |
| `/api/mcp/tools` | ANY | `src/api/mcp.js` | yes |
| `/api/media/assets` | ANY | `src/api/moviemode-api.js` | yes |
| `/api/moviemode/export` | ANY | `src/api/moviemode-api.js` | yes |
| `/api/oauth/cloudflare/start` | ANY | `src/index.js` | yes |
| `/api/oauth/github/start` | ANY | `src/index.js` | yes |
| `/api/oauth/google/start` | ANY | `src/index.js` | yes |
| `/api/onboarding/intake` | ANY | `src/api/onboarding.js` | yes |
| `/api/onboarding/profile-setup` | ANY | `src/api/onboarding.js` | yes |
| `/api/onboarding/recovery-codes` | ANY | `src/api/onboarding.js` | yes |
| `/api/overview/activity-strip` | ANY | `src/api/overview.js` | yes |
| `/api/overview/agent-activity` | ANY | `src/api/overview.js` | yes |
| `/api/overview/commands-workflows` | ANY | `src/api/overview.js` | yes |
| `/api/overview/dashboard-bundle` | ANY | `src/api/overview.js` | yes |
| `/api/overview/deployments` | ANY | `src/api/overview.js` | yes |
| `/api/overview/kpi-strip` | ANY | `src/api/overview.js` | yes |
| `/api/overview/stats` | ANY | `src/api/overview.js` | yes |
| `/api/playwright` | ANY | `src/api/dashboard.js` | yes |
| `/api/playwright/screenshot` | ANY | `src/integrations/playwright.js` | yes |
| `/api/projects` | ANY | `src/api/finance.js` | yes |
| `/api/r2/buckets` | ANY | `src/api/r2-api.js` | yes |
| `/api/r2/delete` | ANY | `src/api/r2-api.js` | yes |
| `/api/r2/file` | ANY | `src/api/r2-api.js` | yes |
| `/api/r2/list` | ANY | `src/api/r2-api.js` | yes |
| `/api/r2/multipart/abort` | ANY | `src/api/r2-api.js` | yes |
| `/api/r2/multipart/complete` | ANY | `src/api/r2-api.js` | yes |
| `/api/r2/multipart/create` | ANY | `src/api/r2-api.js` | yes |
| `/api/r2/multipart/part` | ANY | `src/api/r2-api.js` | yes |
| `/api/r2/search` | ANY | `src/api/r2-api.js` | yes |
| `/api/r2/upload` | ANY | `src/api/r2-api.js` | yes |
| `/api/settings/agents` | ANY | `src/api/settings.js` | yes |
| `/api/settings/agents/commands` | ANY | `src/api/settings.js` | yes |
| `/api/settings/agents/domains` | ANY | `src/api/settings.js` | yes |
| `/api/settings/agents/mcp` | ANY | `src/api/settings.js` | yes |
| `/api/settings/agents/policy` | ANY | `src/api/settings.js` | yes |
| `/api/settings/ai-models` | ANY | `src/api/settings.js` | yes |
| `/api/settings/ai-models/keys` | ANY | `src/api/settings.js` | yes |
| `/api/settings/api-keys` | ANY | `src/api/settings-api-keys.js` | yes |
| `/api/settings/api-keys/audit` | ANY | `src/api/settings-api-keys.js` | yes |
| `/api/settings/cicd` | ANY | `src/api/settings-sections.js` | yes |
| `/api/settings/commands` | ANY | `src/api/settings.js` | yes |
| `/api/settings/default-model` | ANY | `src/api/settings.js` | yes |
| `/api/settings/docs` | ANY | `src/api/settings-sections.js` | yes |
| `/api/settings/github` | ANY | `src/api/settings-sections.js` | yes |
| `/api/settings/hooks` | ANY | `src/api/settings.js` | yes |
| `/api/settings/integrations/connected` | ANY | `src/api/settings-integrations.js` | yes |
| `/api/settings/integrations/custom` | ANY | `src/api/settings-integrations.js` | yes |
| `/api/settings/integrations/custom-mcp` | ANY | `src/api/settings-integrations.js` | yes |
| `/api/settings/mcp` | ANY | `src/api/settings.js` | yes |
| `/api/settings/network` | ANY | `src/api/settings-sections.js` | yes |
| `/api/settings/notifications` | ANY | `src/api/settings-sections.js` | yes |
| `/api/settings/profile` | ANY | `src/api/auth.js` | yes |
| `/api/settings/profile/avatar` | ANY | `src/api/settings.js` | yes |
| `/api/settings/rules` | ANY | `src/api/settings.js` | yes |
| `/api/settings/security/findings` | ANY | `src/api/settings.js` | yes |
| `/api/settings/security/sessions` | ANY | `src/api/settings.js` | yes |
| `/api/settings/skills` | ANY | `src/api/settings.js` | yes |
| `/api/settings/storage-preferences` | ANY | `src/api/settings.js` | yes |
| `/api/settings/subagents` | ANY | `src/api/settings.js` | yes |
| `/api/settings/usage` | ANY | `src/api/settings.js` | yes |
| `/api/settings/user-policy` | ANY | `src/api/settings.js` | yes |
| `/api/settings/workspace` | ANY | `src/api/settings-workspace.js` | yes |
| `/api/settings/workspaces` | ANY | `src/api/settings.js` | yes |
| `/api/settings/workspaces/active` | ANY | `src/api/settings.js` | yes |
| `/api/storage/analytics` | ANY | `src/api/storage.js` | yes |
| `/api/storage/buckets` | ANY | `src/api/storage.js` | yes |
| `/api/storage/policies` | ANY | `src/api/storage.js` | yes |
| `/api/storage/s3` | ANY | `src/api/storage.js` | yes |
| `/api/storage/vectors` | ANY | `src/api/storage.js` | yes |
| `/api/terminal/session/resume` | ANY | `src/api/dashboard.js` | yes |
| `/api/themes/active` | ANY | `src/api/themes.js` | yes |
| `/api/themes/apply` | ANY | `src/api/themes.js` | yes |
| `/api/themes/package` | ANY | `src/api/themes.js` | yes |
| `/api/tunnel/status` | ANY | `src/core/tunnel-status.js` | yes |
| `/api/unified-search` | ANY | `src/api/unified-search.js` | yes |
| `/api/unified-search/track` | ANY | `src/api/unified-search.js` | yes |
| `/api/vault/llm-keys` | ANY | `src/api/vault.js` | yes |
| `/api/vault/secrets` | ANY | `src/api/vault.js` | yes |
| `/api/vault/store` | ANY | `src/api/vault.js` | yes |
| `/api/workspace/create` | ANY | `src/api/workspace.js` | yes |
| `/api/workspace/settings` | ANY | `src/api/workspace.js` | yes |
| `/api/workspaces` | ANY | `src/api/settings.js` | yes |
| `/api/workspaces/list` | ANY | `src/api/workspaces.js` | yes |

---
*Generated by `scripts/audit_worker_routes.py` at 2026-05-19T13:09:27.622321+00:00*