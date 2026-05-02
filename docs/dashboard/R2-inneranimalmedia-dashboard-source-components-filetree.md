# R2 inventory: `inneranimalmedia` / `dashboard/source/components/`

Source: Cloudflare R2 Object Storage screenshots (bucket **inneranimalmedia**, prefix **`dashboard/source/components/`**).  
**Bucket (UI header):** ~139 MB, **Public access:** Enabled, default storage class Standard.  
Modified dates in UI: mostly **28 Apr 2026**; **`auth/`** objects also appear as **28 Apr 2024** in one capture. Storage class **Standard** on all listed objects.

## Assumed object keys and URLs

- **R2 object key (prefix):** `dashboard/source/components/<path>`
- **Assumed HTTPS URL** (only if this prefix is exposed on a public or dashboard origin; confirm in Worker/R2 bindings):

  `https://<dashboard-or-assets-host>/dashboard/source/components/<filename>`

  Replace `<dashboard-or-assets-host>` with the hostname that serves the `inneranimalmedia` bucket mirror (e.g. an `assets.*` host or same-origin path behind the Worker). This repo’s Vite source of truth for these components is **`agent-dashboard/agent-dashboard/components/`**; R2 uses the **`dashboard/source/components/`** mirror layout.

## Directory tree

```text
inneranimalmedia/
└── dashboard/
    └── source/
        └── components/
            ├── auth/
            │   ├── AuthForgotPage.tsx            3.75 KB
            │   ├── AuthResetPage.tsx             4.86 KB
            │   ├── AuthSignInPage.tsx            5.55 KB
            │   └── AuthSignUpPage.tsx            7.25 KB
            ├── learn/
            │   ├── AssignmentPanel.tsx          11.55 KB
            │   ├── CourseNav.tsx                 8.01 KB
            │   ├── LessonView.tsx                7.84 KB
            │   ├── ProgressRing.tsx              1.40 KB
            │   └── learn.types.ts                2.37 KB
            ├── onboarding/
            │   └── OnboardingPage.tsx           21.81 KB
            ├── AISearchPanel.tsx                 6.27 KB
            ├── BrowserView.tsx                48.86 KB
            ├── CalendarPage.tsx               20.52 KB
            ├── ChatAssistant.tsx             110.44 KB
            ├── DataGrid.tsx                    2.62 KB
            ├── DatabaseAgentChat.tsx          10.91 KB
            ├── DatabaseBrowser.tsx            28.19 KB
            ├── DatabasePage.tsx               58.64 KB
            ├── DesignStudioPage.tsx           31.88 KB
            ├── ExcalidrawView.tsx              6.15 KB
            ├── ExtensionsPanel.tsx             5.68 KB
            ├── GLBViewer.tsx                   1.21 KB
            ├── GitHubActionsPanel.tsx        4.52 KB
            ├── GitHubExplorer.tsx             17.70 KB
            ├── GlobalSearchPage.tsx            0 B
            ├── GoogleDriveExplorer.tsx        18.15 KB
            ├── ImagesPage.tsx                 33.50 KB
            ├── IntegrationsPage.tsx           50.50 KB
            ├── JsonModal.tsx                   5.77 KB
            ├── KnowledgeSearchPanel.tsx       10.42 KB
            ├── LearnPage.tsx                   8.18 KB
            ├── LocalExplorer.tsx              53.48 KB
            ├── MCPPanel.tsx                    5.08 KB
            ├── MailPage.tsx                   67.88 KB
            ├── McpPage.tsx                    41.20 KB
            ├── MeetShellPanel.tsx             10.52 KB
            ├── MonacoEditorView.tsx           17.26 KB
            ├── OverviewPage.tsx               56.37 KB
            ├── PlaywrightConsole.tsx          15.14 KB
            ├── ProblemsDebugPanel.tsx         12.82 KB
            ├── PromptModal.tsx                 5.32 KB
            ├── R2Explorer.tsx                 29.59 KB
            ├── SQLConsole.tsx                 10.29 KB
            ├── SettingsPanel.tsx             202.79 KB
            ├── SourcePanel.tsx                 9.11 KB
            ├── StatusBar.tsx                  19.30 KB
            ├── StoragePage.tsx                22.94 KB
            ├── StudioSidebar.tsx              27.41 KB
            ├── ThemeSwitcher.tsx               2.83 KB
            ├── ToolLauncherBar.tsx             4.72 KB
            ├── UIOverlay.tsx                  11.20 KB
            ├── UnifiedSearchBar.tsx           12.80 KB
            ├── WorkspaceDashboard.tsx         20.23 KB
            ├── WorkspaceExplorerPanel.tsx     14.48 KB
            ├── WorkspaceLauncher.tsx          22.48 KB
            └── XTermShell.tsx                 47.89 KB
```

## Flat table (relative path, size, assumed key)

Paths are under `dashboard/source/components/`.

### Root-level `.tsx` (and one empty file)

| File | Size | R2 object key |
|------|------|----------------|
| AISearchPanel.tsx | 6.27 KB | `dashboard/source/components/AISearchPanel.tsx` |
| BrowserView.tsx | 48.86 KB | `dashboard/source/components/BrowserView.tsx` |
| CalendarPage.tsx | 20.52 KB | `dashboard/source/components/CalendarPage.tsx` |
| ChatAssistant.tsx | 110.44 KB | `dashboard/source/components/ChatAssistant.tsx` |
| DataGrid.tsx | 2.62 KB | `dashboard/source/components/DataGrid.tsx` |
| DatabaseAgentChat.tsx | 10.91 KB | `dashboard/source/components/DatabaseAgentChat.tsx` |
| DatabaseBrowser.tsx | 28.19 KB | `dashboard/source/components/DatabaseBrowser.tsx` |
| DatabasePage.tsx | 58.64 KB | `dashboard/source/components/DatabasePage.tsx` |
| DesignStudioPage.tsx | 31.88 KB | `dashboard/source/components/DesignStudioPage.tsx` |
| ExcalidrawView.tsx | 6.15 KB | `dashboard/source/components/ExcalidrawView.tsx` |
| ExtensionsPanel.tsx | 5.68 KB | `dashboard/source/components/ExtensionsPanel.tsx` |
| GLBViewer.tsx | 1.21 KB | `dashboard/source/components/GLBViewer.tsx` |
| GitHubActionsPanel.tsx | 4.52 KB | `dashboard/source/components/GitHubActionsPanel.tsx` |
| GitHubExplorer.tsx | 17.70 KB | `dashboard/source/components/GitHubExplorer.tsx` |
| GlobalSearchPage.tsx | 0 B | `dashboard/source/components/GlobalSearchPage.tsx` |
| GoogleDriveExplorer.tsx | 18.15 KB | `dashboard/source/components/GoogleDriveExplorer.tsx` |
| ImagesPage.tsx | 33.50 KB | `dashboard/source/components/ImagesPage.tsx` |
| IntegrationsPage.tsx | 50.50 KB | `dashboard/source/components/IntegrationsPage.tsx` |
| JsonModal.tsx | 5.77 KB | `dashboard/source/components/JsonModal.tsx` |
| KnowledgeSearchPanel.tsx | 10.42 KB | `dashboard/source/components/KnowledgeSearchPanel.tsx` |
| LearnPage.tsx | 8.18 KB | `dashboard/source/components/LearnPage.tsx` |
| LocalExplorer.tsx | 53.48 KB | `dashboard/source/components/LocalExplorer.tsx` |
| MCPPanel.tsx | 5.08 KB | `dashboard/source/components/MCPPanel.tsx` |
| MailPage.tsx | 67.88 KB | `dashboard/source/components/MailPage.tsx` |
| McpPage.tsx | 41.20 KB | `dashboard/source/components/McpPage.tsx` |
| MeetShellPanel.tsx | 10.52 KB | `dashboard/source/components/MeetShellPanel.tsx` |
| MonacoEditorView.tsx | 17.26 KB | `dashboard/source/components/MonacoEditorView.tsx` |
| OverviewPage.tsx | 56.37 KB | `dashboard/source/components/OverviewPage.tsx` |
| PlaywrightConsole.tsx | 15.14 KB | `dashboard/source/components/PlaywrightConsole.tsx` |
| ProblemsDebugPanel.tsx | 12.82 KB | `dashboard/source/components/ProblemsDebugPanel.tsx` |
| PromptModal.tsx | 5.32 KB | `dashboard/source/components/PromptModal.tsx` |
| R2Explorer.tsx | 29.59 KB | `dashboard/source/components/R2Explorer.tsx` |
| SQLConsole.tsx | 10.29 KB | `dashboard/source/components/SQLConsole.tsx` |
| SettingsPanel.tsx | 202.79 KB | `dashboard/source/components/SettingsPanel.tsx` |
| SourcePanel.tsx | 9.11 KB | `dashboard/source/components/SourcePanel.tsx` |
| StatusBar.tsx | 19.30 KB | `dashboard/source/components/StatusBar.tsx` |
| StoragePage.tsx | 22.94 KB | `dashboard/source/components/StoragePage.tsx` |
| StudioSidebar.tsx | 27.41 KB | `dashboard/source/components/StudioSidebar.tsx` |
| ThemeSwitcher.tsx | 2.83 KB | `dashboard/source/components/ThemeSwitcher.tsx` |
| ToolLauncherBar.tsx | 4.72 KB | `dashboard/source/components/ToolLauncherBar.tsx` |
| UIOverlay.tsx | 11.20 KB | `dashboard/source/components/UIOverlay.tsx` |
| UnifiedSearchBar.tsx | 12.80 KB | `dashboard/source/components/UnifiedSearchBar.tsx` |
| WorkspaceDashboard.tsx | 20.23 KB | `dashboard/source/components/WorkspaceDashboard.tsx` |
| WorkspaceExplorerPanel.tsx | 14.48 KB | `dashboard/source/components/WorkspaceExplorerPanel.tsx` |
| WorkspaceLauncher.tsx | 22.48 KB | `dashboard/source/components/WorkspaceLauncher.tsx` |
| XTermShell.tsx | 47.89 KB | `dashboard/source/components/XTermShell.tsx` |

### `auth/`

| File | Size | R2 object key |
|------|------|----------------|
| AuthForgotPage.tsx | 3.75 KB | `dashboard/source/components/auth/AuthForgotPage.tsx` |
| AuthResetPage.tsx | 4.86 KB | `dashboard/source/components/auth/AuthResetPage.tsx` |
| AuthSignInPage.tsx | 5.55 KB | `dashboard/source/components/auth/AuthSignInPage.tsx` |
| AuthSignUpPage.tsx | 7.25 KB | `dashboard/source/components/auth/AuthSignUpPage.tsx` |

### `learn/`

| File | Size | R2 object key |
|------|------|----------------|
| AssignmentPanel.tsx | 11.55 KB | `dashboard/source/components/learn/AssignmentPanel.tsx` |
| CourseNav.tsx | 8.01 KB | `dashboard/source/components/learn/CourseNav.tsx` |
| LessonView.tsx | 7.84 KB | `dashboard/source/components/learn/LessonView.tsx` |
| ProgressRing.tsx | 1.40 KB | `dashboard/source/components/learn/ProgressRing.tsx` |
| learn.types.ts | 2.37 KB | `dashboard/source/components/learn/learn.types.ts` |

### `onboarding/`

| File | Size | R2 object key |
|------|------|----------------|
| OnboardingPage.tsx | 21.81 KB | `dashboard/source/components/onboarding/OnboardingPage.tsx` |

## Notes

- **Subfolders** `auth/`, `learn/`, and `onboarding/` are fully enumerated above (10 objects total under those prefixes).
- **GlobalSearchPage.tsx** is **0 B** in the listing (empty object).
- **Repo path:** implementation files typically live under **`agent-dashboard/agent-dashboard/components/`** (with matching **`auth/`**, **`learn/`**, **`onboarding/`** subdirs); R2 uses **`dashboard/source/components/`** as a mirrored prefix for delivery/reference.
