# Agent Remaster — Asset Audit
Generated: 2026-05-14 14:03:32
Root: /Users/samprimeaux/inneranimalmedia

## Git State
```
STATUS: M src/core/agentsam-task-executor.js
?? scripts/audit_agent_remaster.py

LAST 5 COMMITS:
143acdb feat(dashboard): workflows page, rail icon, and multi-chat tabs
f66f975 chore(scripts): add D1 agentsam/cms table audit under scripts/
9b3cb6e chore(deps): bump wrangler to ^4.91.0
d5ec6ac chore(scripts): align may14_verify with ToolApprovalModal button copy
061fffe fix(auth): land social sign-in and OAuth defaults on /dashboard/overview
```

## Key Component Line Counts
| File | Lines |
|------|-------|
| `dashboard/components/WorkspaceDashboard.tsx` | 495 |
| `dashboard/components/ChatAssistant.tsx` | 14 |
| `dashboard/features/agent-chat/ChatAssistant.tsx` | 2145 |
| `dashboard/features/agent-chat/types.ts` | 191 |
| `dashboard/App.tsx` | 3223 |
| `dashboard/pages/workflows/WorkflowsPage.tsx` | 55 |

## Pattern Search Results

_Scanning 482 files..._

### WorkspaceDashboard_import

**`dashboard/App.tsx`**
  - L10: `import { WorkspaceDashboard } from './components/WorkspaceDashboard';`
  - L2750: `<WorkspaceDashboard`

**`dashboard/components/WorkspaceDashboard.tsx`**
  - L26: `interface WorkspaceDashboardProps {`
  - L53: `* WorkspaceDashboard: A premium, centered 'Cursor-style' home screen for the IDE.`
  - L69: `export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({`

### ChatAssistant_import

**`dashboard/App.tsx`**
  - L9: `import { ChatAssistant } from './components/ChatAssistant';`
  - L2432: `<ChatAssistant`
  - L2919: `<ChatAssistant`

**`dashboard/components/BrowserView.tsx`**
  - L799: `/** Latest BrowserView URL/viewport for ChatAssistant `browserContext` (user visual context, not server automation). */`

**`dashboard/components/ChatAssistant.tsx`**
  - L4: `export { ChatAssistant, IAM_AGENT_CHAT_CONVERSATION_CHANGE } from '../features/agent-chat/ChatAssistant';`

**`dashboard/components/McpPage.tsx`**
  - L32: `} from './ChatAssistant';`

**`dashboard/components/MeetPage.tsx`**
  - L751: `// Use the same FormData + SSE endpoint as ChatAssistant.tsx`

**`dashboard/components/MonacoEditorView.tsx`**
  - L194: `// Dispatch a custom event that ChatAssistant.tsx will listen to`

**`dashboard/components/settings/sections/WorkspaceSection.tsx`**
  - L60: `{ key: 'chat_receive_selection', label: 'ChatAssistant receives BrowserView selection' },`
  - L412: `Capability flags for the realtime loop (BrowserView → ChatAssistant → Monaco). If integrations are not`

**`dashboard/features/agent-chat/ChatAssistant.tsx`**
  - L39: `ChatAssistantProps,`
  - L75: `export const ChatAssistant: React.FC<ChatAssistantProps> = ({`
  - L238: `console.log('[ChatAssistant] canonical mounted agent-app-sse-v1');`
  - L843: `console.error('[ChatAssistant] execute-approved-tool', e);`
  - L871: `console.warn('[ChatAssistant] plan terminal deny', e);`

**`dashboard/features/agent-chat/hooks/useAgentChatStream.ts`**
  - L59: `/** Full tool-approval side effects (state + queue drain), matching prior ChatAssistant inline behavior. */`
  - L780: `console.warn('[ChatAssistant] onFileSelect failed for monaco invoke', e);`

**`dashboard/features/agent-chat/index.ts`**
  - L1: `export { ChatAssistant, IAM_AGENT_CHAT_CONVERSATION_CHANGE } from './ChatAssistant';`
  - L4: `ChatAssistantProps,`

**`dashboard/features/agent-chat/streamParsing.ts`**
  - L133: `console.warn('[ChatAssistant] monaco invoke skipped: missing or empty content parameter', {`

**`dashboard/features/agent-chat/types.ts`**
  - L64: `export interface ChatAssistantProps {`

**`dashboard/vite.config.ts`**
  - L77: `'agent-core': ['./components/ChatAssistant', './components/McpPage'],`

**`src/integrations/openai.js`**
  - L221: `// handled by both ChatAssistant and GorillaModeShell buddy panel.`

### PlusMenu_variants

**`dashboard/components/ToolLauncherBar.tsx`**
  - L22: `const [plusOpen, setPlusOpen] = useState(false);`
  - L25: `if (!plusOpen) return;`
  - L28: `setPlusOpen(false);`
  - L33: `}, [plusOpen]);`
  - L107: `onClick={() => setPlusOpen((v) => !v)}`
  - L110: `aria-expanded={plusOpen}`
  - L114: `{plusOpen && (`

**`dashboard/components/WorkspaceDashboard.tsx`**
  - L92: `const [isPlusOpen, setIsPlusOpen] = useState(false);`
  - L129: `setIsPlusOpen(false);`
  - L230: `onClick={() => setIsPlusOpen(!isPlusOpen)}`
  - L235: `{isPlusOpen && (`
  - L252: `setIsPlusOpen(false);`

**`dashboard/components/XTermShell.tsx`**
  - L264: `const plusMenuRef = useRef<HTMLDivElement>(null);`
  - L296: `const [plusMenuOpen, setPlusMenuOpen] = useState(false);`
  - L322: `if (plusMenuRef.current && !plusMenuRef.current.contains(t)) {`
  - L323: `setPlusMenuOpen(false);`
  - L660: `<div className="relative" ref={plusMenuRef}>`
  - L665: `onClick={() => setPlusMenuOpen((v) => !v)}`
  - L669: `{plusMenuOpen && (`
  - L685: `setPlusMenuOpen(false);`
  - _...and 5 more matches_

### ModelSelector

**`dashboard/components/WorkspaceDashboard.tsx`**
  - L90: `const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);`
  - L115: `if (filtered.length > 0) setSelectedModel(filtered[0]);`
  - L270: `<span>{selectedModel?.name || 'Auto'}</span>`
  - L290: `setSelectedModel(m);`
  - L293: `className={`w-full text-left px-3 py-2 rounded-lg text-[12px] transition-all flex items-center justify-between group ${s`
  - L299: `{selectedModel?.model_key === m.model_key && <Sparkles size={11} className="animate-pulse" />}`

**`dashboard/features/agent-chat/ChatAssistant.tsx`**
  - L128: `const [modelPickerStyle, setModelPickerStyle] = useState<React.CSSProperties | null>(null);`
  - L133: `const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);`
  - L380: `const [selectedModelKey, setSelectedModelKey] = useState<string>('');`
  - L405: `const measureModelPickerMenu = useCallback(() => {`
  - L406: `setModelPickerStyle(measureAboveAnchor(modeButtonRef.current, 280, 360, 320));`
  - L440: `if (!isModelPickerOpen) {`
  - L441: `setModelPickerStyle(null);`
  - L444: `measureModelPickerMenu();`
  - _...and 30 more matches_

### SendButton

**`dashboard/App.tsx`**
  - L743: `const handleSendMessage = useCallback((msg: string) => {`
  - L2761: `onSendMessage={handleSendMessage}`

**`dashboard/components/MeetPage.tsx`**
  - L149: `<button className="modal-send-btn" onClick={send} disabled={!email.trim() || sending}>`
  - L1735: `.modal-send-btn {`
  - L1741: `.modal-send-btn:hover:not(:disabled) { opacity: 0.85; }`
  - L1742: `.modal-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }`

**`dashboard/components/WorkspaceDashboard.tsx`**
  - L34: `onSendMessage: (message: string) => void;`
  - L77: `onSendMessage,`
  - L139: `const handleSendMessage = () => {`
  - L141: `onSendMessage(chatInput);`
  - L216: `else handleSendMessage();`
  - L316: `onClick={isAgentRunning ? handleStopAgent : handleSendMessage}`
  - L409: `onClick={() => onSendMessage(`Run in terminal: ${cmd}`)}`

**`dashboard/features/agent-chat/ChatAssistant.tsx`**
  - L117: `const handleSendRef = useRef<(override?: string) => Promise<void>>(async () => {});`
  - L354: `if (msg) handleSend(msg);`
  - L362: `}, [handleSend]);`
  - L813: `void handleSendRef.current(next);`
  - L889: `async function handleSend(overrideMessage?: string) {`
  - L1066: `void handleSendRef.current(next);`
  - L1100: `void handleSendRef.current(next);`
  - L1105: `handleSendRef.current = handleSend;`
  - _...and 2 more matches_

**`src/api/auth-hooks.js`**
  - L26: `async function handleSendEmailHook(request, env) {`
  - L280: `return handleSendEmailHook(request, env);`

### Greeting_state

**`dashboard/App.tsx`**
  - L145: `function buildAgentSamGreeting(workspaceDisplayLine: string): string {`
  - L346: `[stableAgentChatTabId]: [{ role: 'assistant', content: buildAgentSamGreeting(formatWorkspaceStatusLine({ source: 'none' `
  - L1012: `{ role: 'assistant' as const, content: buildAgentSamGreeting(workspaceDisplayLine) },`
  - L1022: `{ role: 'assistant' as const, content: buildAgentSamGreeting(workspaceDisplayLine) },`
  - L1035: `const next = buildAgentSamGreeting(workspaceDisplayLine);`
  - L1055: `[tid]: [{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayLine) }],`
  - L1101: `[tid]: [{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayLine) }],`
  - L1123: `[tid]: [{ role: 'assistant', content: buildAgentSamGreeting(workspaceDisplayLine) }],`
  - _...and 2 more matches_

**`dashboard/components/McpPage.tsx`**
  - L501: `/* keep greeting */`

**`dashboard/components/TerminalSessionPane.tsx`**
  - L66: `greeting?: string | null;`
  - L99: `const greeting = await fetch('/api/agent/memory/list', { method: 'GET', credentials: 'same-origin' })`
  - L103: `return items.find((m) => m.key === 'STARTUP_GREETING')?.value ?? null;`
  - L113: `greeting,`
  - L122: `greeting: null,`
  - L273: `const greeting = cachedBootstrapRef.current?.greeting ?? null;`
  - L274: `if (greeting && xtermRef.current) {`
  - L275: `xtermRef.current.writeln(`\r\n\x1b[1;36m  › ${greeting}\x1b[0m`);`

**`dashboard/features/agent-chat/ChatAssistant.tsx`**
  - L65: `isAgentSamEmptyThreadGreeting,`
  - L623: `(m) => m.role === 'assistant' && isAgentSamEmptyThreadGreeting(m.content)`

**`dashboard/features/agent-chat/composerLayout.ts`**
  - L8: `/** Matches App.tsx `buildAgentSamGreeting` — hide this bubble when no real thread content yet. */`
  - L9: `export function isAgentSamEmptyThreadGreeting(content: string): boolean {`

**`src/api/agent.js`**
  - L5147: `const skipSimpleAskGreetingRoute =`
  - L5154: `!skipSimpleAskGreetingRoute`
  - L5156: `const greetingRoute = await env.DB.prepare(``
  - L5158: `WHERE route_key = 'simple_ask_greeting'`
  - L5164: `if (greetingRoute) {`
  - L5168: `to: 'simple_ask_greeting',`
  - L5171: `promptRouteRow = greetingRoute;`
  - L5587: `'You are Agent Sam. Reply briefly and helpfully. For greetings, respond in one short sentence.';`
  - _...and 1 more matches_

**`src/core/agentsam-route-tool-resolver.js`**
  - L75: `simple_ask_greeting: {`

### cms_themes_fetch

**`dashboard/App.tsx`**
  - L461: `slug: typeof msg.theme_slug === 'string' ? msg.theme_slug : undefined,`

**`dashboard/components/MonacoEditorView.tsx`**
  - L72: `/** Resolve :root CSS custom properties (cms_themes / inneranimalmedia.css) for Monaco. */`

**`dashboard/components/MonacoSurface.tsx`**
  - L78: `/** Only `data-monaco-bg` / explicit prop — no CSS-token guessing (Monaco mirrors `cms_themes.monaco_bg`). */`

**`dashboard/components/overview/constants.ts`**
  - L18: `* UI typography: cms_themes `fontFamily` → --font-family; Tailwind entry sets --font-sans (Nunito).`

**`dashboard/components/settings/sections/WorkspaceSection.tsx`**
  - L9: `default_theme_slug?: string;`
  - L203: `<span className="font-mono text-[var(--text-main)]">{String(ws.theme_id ?? ws.theme_set ?? '—')}</span>`
  - L209: `defaultValue={pipe.default_theme_slug || ''}`
  - L210: `key={pipe.default_theme_slug || ''}`
  - L215: `void patch({ default_theme_slug: v || undefined });`

**`dashboard/components/themes/ThemeBrowser.tsx`**
  - L76: `const applyTheme = useCallback(`
  - L112: `theme_id: theme.id,`
  - L177: `theme_id: theme.id,`
  - L252: `onApply={(t) => void applyTheme(t)}`

**`dashboard/features/agent-chat/ChatAssistant.tsx`**
  - L1453: `everywhere via your workspace <code className="text-[var(--solar-cyan)]">cms_themes</code> row.`

**`dashboard/src/applyCmsTheme.ts`**
  - L3: `* Source of truth for preview/edit is always D1 `cms_themes.config` merged server-side — not R2 `theme.css`.`
  - L9: `export const INNERANIMALMEDIA_LS_THEME_SLUG = 'inneranimalmedia_theme_slug';`
  - L21: `return w ? `inneranimalmedia_theme_slug:${w}` : INNERANIMALMEDIA_LS_THEME_SLUG;`
  - L49: `const LEGACY_MCAD_SLUG = 'mcad_theme_slug';`
  - L64: `/** From `cms_themes.monaco_theme` or `{slug}-monaco` derived server-side from the same row (never invented in the clien`
  - L66: `/** From `cms_themes.monaco_bg`. */`
  - L68: `/** From `cms_themes.monaco_theme_data` (full `IStandaloneThemeData` JSON string). */`
  - L123: `if (!localStorage.getItem(INNERANIMALMEDIA_LS_THEME_SLUG)) {`
  - _...and 3 more matches_

**`src/api/draw.js`**
  - L183: `const theme_slug = String(body.theme_slug || '').trim();`
  - L185: `if (!theme_slug) return jsonResponse({ error: 'theme_slug required' }, 400);`
  - L196: `.bind(String(userId), workspace_id, theme_slug)`
  - L212: `return jsonResponse({ success: true, theme: theme_slug });`

**`src/api/settings-sections.js`**
  - L616: `'cms_themes',`
  - L618: `FROM cms_themes ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 50`,`
  - L627: ``SELECT user_id, workspace_id, theme_id, scope, updated_at FROM cms_theme_preferences WHERE user_id = ? LIMIT 1`,`
  - L638: ``SELECT user_id, workspace_id, theme_id, scope, updated_at FROM cms_theme_preferences WHERE workspace_id = ? AND scope I`
  - L648: `user_theme_id: userPref?.theme_id || null,`
  - L649: `workspace_theme_id: wsPref?.theme_id || null,`

**`src/api/settings.js`**
  - L2766: `const wsAllowed = ['theme_id', 'accent_color', 'timezone'];`

**`src/api/themes.js`**
  - L74: `async function fetchThemeRowBySlug(env, slug) {`
  - L77: `return await env.DB.prepare(`SELECT * FROM cms_themes WHERE slug = ? LIMIT 1`).bind(s).first();`
  - L120: `const row = await env.DB.prepare(`SELECT tokens_json FROM cms_themes WHERE id = ? LIMIT 1`)`
  - L134: `await env.DB.prepare(`UPDATE cms_themes SET tokens_json = ?, updated_at = unixepoch() WHERE id = ?`)`
  - L158: ``UPDATE cms_themes SET`
  - L225: ``UPDATE workspaces SET theme_id = ?, theme_set = ?, updated_at = datetime('now') WHERE id = ?`,`
  - L233: `await env.DB.prepare(`UPDATE workspaces SET theme_id = ?, updated_at = datetime('now') WHERE id = ?`)`
  - L290: `FROM cms_themes`
  - _...and 19 more matches_

**`src/core/cms-theme-active.js`**
  - L2: `* Live theme resolution from `cms_themes` rows (D1 `config` JSON + `css_vars_json`).`
  - L27: `/** Merge cms_themes.config into API variables (GET /api/settings/theme). Supports cssVars + css_vars. */`
  - L85: `* Map cms_themes.config-derived CSS variables to dashboard tokens (`--bg-app`, `--text-main`, …).`
  - L139: `* D1 `cms_themes.css_vars_json` — must match runtime apply (same as catalog `cssVarsMerged` in preview-model).`
  - L278: `env.DB.prepare(`UPDATE cms_themes SET css_vars_json = ? WHERE slug = ?`)`
  - L302: `* @param {Record<string, unknown>} row — cms_themes row`
  - L318: `/** Align with D1 `cms_themes.monaco_theme`, R2 monaco.json id, and IAM_COLLAB — `{slug}-monaco`, never `custom:` or bui`

**`src/core/cms-theme-create.js`**
  - L2: `* Pure helpers for POST /api/themes/create — builds cms_themes columns from request palette/tokens.`
  - L124: `* Default JSON column payloads for cms_themes.`

**`src/core/cms-theme-hashing.js`**
  - L53: `* @param {Record<string, unknown>} row — cms_themes row`

**`src/core/cms-theme-package-files.js`**
  - L158: `Realtime theming uses **D1** (\`cms_themes\`) via \`GET /api/themes/active\`.`
  - L172: `{ "theme_slug": "${slug}", "scope": "workspace", "workspace_id": "<id>" }`

**`src/core/cms-theme-preview-model.js`**
  - L2: `* Derives a stable preview_model for theme browser cards from cms_themes rows.`
  - L46: `* Parse all JSON-ish cms_themes columns for API responses.`
  - L241: `* Full normalization for one cms_themes row (for GET /api/themes).`

**`src/core/cms-theme-registry.js`**
  - L7: `* Merge package_meta into cms_themes.tokens_json (compact metadata).`
  - L68: `theme_id: themeId,`
  - L137: `JSON.stringify({ theme_id: themeId, slug, fname, ...metaExtra }),`

**`src/core/cms-theme-resolve.js`**
  - L2: `* Resolve live `cms_themes` row from D1 using workspace/project/user/tenant fallbacks.`
  - L166: `let row = await db.prepare(`SELECT * FROM cms_themes WHERE slug = ? LIMIT 1`).bind(s).first();`
  - L168: `row = await db.prepare(`SELECT * FROM cms_themes WHERE id = ? LIMIT 1`).bind(s).first();`
  - L176: ``SELECT theme_slug FROM cms_theme_preferences`
  - L190: ``SELECT theme_slug FROM cms_theme_preferences`
  - L204: ``SELECT theme_slug FROM cms_theme_preferences`
  - L217: `.prepare(`SELECT theme_id, theme FROM workspace_settings WHERE workspace_id = ? LIMIT 1`)`
  - L223: `row.theme_id != null && String(row.theme_id).trim() !== "" ? String(row.theme_id).trim() : null;`
  - _...and 22 more matches_

**`src/core/themes.js`**
  - L33: `'SELECT theme_id FROM workspaces WHERE id = ? OR handle = ? LIMIT 1'`
  - L36: `return normalizeThemeSlug(row?.theme_id, env);`

**`src/do/Collaboration.js`**
  - L65: `const { theme_slug } = await request.json();`
  - L67: `'SELECT * FROM cms_themes WHERE slug = ?'`
  - L68: `).bind(theme_slug).first();`
  - L69: `if (!row) return new Response(JSON.stringify({ error: 'unknown theme_slug' }), { status: 404, headers: { 'Content-Type':`
  - L76: `theme_slug: payload.slug,`
  - L85: `return new Response(JSON.stringify({ ok: true, theme_slug: payload.slug }), { headers: { 'Content-Type': 'application/js`

### css_vars_inject

**`dashboard/App.tsx`**
  - L455: `msg.cssVars &&`
  - L456: `typeof msg.cssVars === 'object' &&`
  - L457: `!Array.isArray(msg.cssVars) &&`
  - L458: `Object.keys(msg.cssVars as object).length > 0`
  - L462: `data: msg.cssVars as Record<string, string>,`

**`dashboard/Finance.js`**
  - L10: `height and width.`,q,x,a,s,f,l,r);var S=!Array.isArray(m)&&xt(m.type).endsWith("Chart");return Ce.default.Children.map(m`

**`dashboard/components/DatabasePage.tsx`**
  - L346: `if (accent) document.documentElement.style.setProperty('--color-accent', accent);`
  - L347: `if (theme.theme?.monaco_bg) document.documentElement.style.setProperty('--database-monaco-bg', String(theme.theme.monaco`

**`dashboard/components/IntegrationsPage.deprecated.tsx`**
  - L113: `// Fallback palette uses CSS variables only (no hardcoded hex).`

**`dashboard/components/McpPage.tsx`**
  - L11: `* Matches IAM dark IDE aesthetic via CSS vars.`

**`dashboard/components/MonacoEditorView.tsx`**
  - L77: `const st = getComputedStyle(document.documentElement);`
  - L171: `// Custom theme from :root CSS vars`

**`dashboard/components/MonacoSurface.tsx`**
  - L18: `const root = document.documentElement;`
  - L66: `return document.documentElement.getAttribute('data-monaco-theme')?.trim() || 'vs';`
  - L72: `const attr = document.documentElement.getAttribute('data-monaco-theme')?.trim();`
  - L82: `return document.documentElement.getAttribute('data-monaco-bg')?.trim() || '';`
  - L132: `mo.observe(document.documentElement, {`

**`dashboard/components/TerminalSessionPane.tsx`**
  - L369: `const s = getComputedStyle(document.documentElement);`
  - L382: `observer.observe(document.documentElement, {`
  - L456: `const s = getComputedStyle(document.documentElement);`

**`dashboard/components/XTermShell.tsx`**
  - L423: `'\x1b[38;5;240m  Theme: Settings → theme controls (CSS vars update this terminal).\x1b[0m\r\n',`

**`dashboard/components/settings/mcp/McpMonacoHost.tsx`**
  - L26: `return document.documentElement.getAttribute('data-monaco-theme')?.trim() || 'vs';`
  - L60: `mo.observe(document.documentElement, {`

**`dashboard/components/themes/ThemeBrowser.tsx`**
  - L92: `const vars = parsed.cssVars as Record<string, string> | undefined;`
  - L93: `const root = document.documentElement;`
  - L96: `if (typeof v === 'string') root.style.setProperty(k, v);`
  - L100: `if (k.startsWith('--') && typeof v === 'string') root.style.setProperty(k, v);`

**`dashboard/src/applyCmsTheme.ts`**
  - L80: `const root = document.documentElement;`
  - L147: `document.documentElement.setAttribute('data-dashboard-theme-ready', 'true');`
  - L149: `if (s) document.documentElement.setAttribute('data-cms-theme', s);`
  - L150: `else document.documentElement.removeAttribute('data-cms-theme');`
  - L159: `const root = document.documentElement;`
  - L206: `let prevCssVarKeys: string[] = [];`
  - L212: `prevCssVarKeys = Object.keys(prev).filter((k) => typeof k === 'string' && k.startsWith('--'));`
  - L236: `const root = document.documentElement;`
  - _...and 4 more matches_

**`src/api/integrations.js`**
  - L450: `return safeAll(env.DB, `SELECT slug, css_var, color AS primary_color, color AS secondary_color, '#ffffff' AS text_on_col`

**`src/api/themes.js`**
  - L26: `import { buildActiveThemeApiPayload, hydrateCmsThemeCssVarsFromR2 } from "../core/cms-theme-active.js";`
  - L419: `tokens_json, css_vars_json, brand_json, layout_json, typography_json, components_json, motion_json,`
  - L438: `css_vars_json = excluded.css_vars_json,`
  - L459: `sidecars.css_vars_json,`
  - L850: `await hydrateCmsThemeCssVarsFromR2(env, outRow);`

**`src/core/cms-theme-active.js`**
  - L2: `* Live theme resolution from `cms_themes` rows (D1 `config` JSON + `css_vars_json`).`
  - L5: `* `theme_update`, ThemeSwitcher optimistic apply) MUST use this pipeline — CSS variables merged`
  - L9: `* When `css_vars_json` is still `{}` after a package sync, `hydrateCmsThemeCssVarsFromR2` (called from`
  - L27: `/** Merge cms_themes.config into API variables (GET /api/settings/theme). Supports cssVars + css_vars. */`
  - L31: `const mergeCssVars = (obj) => {`
  - L39: `mergeCssVars(cfg.cssVars);`
  - L40: `mergeCssVars(cfg.css_vars);`
  - L85: `* Map cms_themes.config-derived CSS variables to dashboard tokens (`--bg-app`, `--text-main`, …).`
  - _...and 22 more matches_

**`src/core/cms-theme-create.js`**
  - L42: `const cssVars =`
  - L43: `p.cssVars && typeof p.cssVars === "object"`
  - L44: `? /** @type {Record<string, string>} */ (p.cssVars)`
  - L59: `cssVars,`
  - L130: `const css_vars_json = JSON.stringify(t.css_vars ?? t.cssVars ?? {});`
  - L136: `return { tokens_json, css_vars_json, brand_json, layout_json, typography_json, components_json, motion_json };`

**`src/core/cms-theme-hashing.js`**
  - L57: `const cssVars =`
  - L58: `cfg && typeof cfg === "object" && cfg.cssVars && typeof cfg.cssVars === "object"`
  - L59: `? /** @type {Record<string, unknown>} */ (cfg.cssVars)`
  - L69: `cssVars,`
  - L71: `css_vars_json: normalizeJsonField(row?.css_vars_json),`

**`src/core/cms-theme-package-files.js`**
  - L150: `| \`theme.css\` | Compiled CSS variables + selectors |`

**`src/core/cms-theme-preview-model.js`**
  - L63: `const css_vars_json = track("css_vars_json", row?.css_vars_json);`
  - L71: `const cssVarsFromConfig =`
  - L72: `configObj && typeof configObj === "object" && configObj.cssVars && typeof configObj.cssVars === "object"`
  - L73: `? /** @type {Record<string, string>} */ (configObj.cssVars)`
  - L76: `const cssVarsFlat = { ...cssVarsFromConfig };`
  - L77: `if (css_vars_json && typeof css_vars_json === "object") {`
  - L78: `for (const [k, v] of Object.entries(css_vars_json)) {`
  - L79: `if (v != null) cssVarsFlat[k.startsWith("--") ? k : `--${k.replace(/^-+/, "")}`] = String(v);`
  - _...and 3 more matches_

**`src/core/cms-theme-resolve.js`**
  - L572: `cssVars: payload.data,`

**`src/core/cms-theme-tokens.js`**
  - L9: `* @param {Record<string, string>} variables — merged CSS vars from cms-theme-active`

**`src/do/Collaboration.js`**
  - L77: `cssVars: payload.data,`

### recentFiles_prop

**`dashboard/App.tsx`**
  - L323: `const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);`
  - L650: `recentFiles: [] as RecentFileEntry[],`
  - L653: `idePersistRef.current = { ideWorkspace, gitBranch, recentFiles };`
  - L654: `}, [ideWorkspace, gitBranch, recentFiles]);`
  - L669: `recentFiles: s.recentFiles,`
  - L680: `setRecentFiles(b.recentFiles);`
  - L695: `recentFiles,`
  - L699: `}, [activeAgentConversationId, ideWorkspace, gitBranch, recentFiles]);`
  - _...and 8 more matches_

**`dashboard/components/UnifiedSearchBar.tsx`**
  - L218: `recentFiles?: { name: string; path: string; label?: string }[];`
  - L226: `recentFiles = [],`
  - L387: `recentFiles.slice(0, 5).forEach(f => {`
  - L392: `}, [q, rows, recentFiles, sourceFacets]);`

**`dashboard/components/WorkspaceDashboard.tsx`**
  - L30: `recentFiles: RecentFileEntry[];`
  - L73: `recentFiles,`
  - L462: `<h2 className="text-[11px] font-bold text-[var(--dashboard-muted)] uppercase tracking-widest">Recently Opened</h2>`
  - L466: `{recentFiles.length > 0 ? (`
  - L467: `recentFiles.slice(0, 6).map((file) => (`

**`dashboard/src/ideWorkspace.ts`**
  - L15: `export const MAX_RECENT_FILES = 24;`
  - L18: `export type RecentFileSource = 'local' | 'github' | 'r2' | 'drive' | 'buffer';`
  - L27: `source: RecentFileSource;`
  - L45: `recentFiles: RecentFileEntry[];`
  - L53: `recentFiles: [],`
  - L77: `function recentSource(f: ActiveFile): RecentFileSource {`
  - L113: `const rf = o.recentFiles;`
  - L114: `let recentFiles: RecentFileEntry[] = [];`
  - _...and 3 more matches_

**`src/api/workspace.js`**
  - L110: `recentFiles: Array.isArray(body.recentFiles) ? body.recentFiles.slice(0, 24) : [],`

### workspaceRows_prop

**`dashboard/App.tsx`**
  - L137: `interface WorkspaceRow {`
  - L405: `const [workspaceRows, setWorkspaceRows] = useState<WorkspaceRow[]>([]);`
  - L415: `if (id && workspaceRows.length > 0) {`
  - L416: `const row = workspaceRows.find((w) => w.id === id);`
  - L421: `}, [authWorkspaceId, workspaceRows, ideWorkspace]);`
  - L610: `setWorkspaceRows(`
  - L766: `workspaceRows.map((w) => ({`
  - L773: `[workspaceRows],`
  - _...and 3 more matches_

**`dashboard/components/UnifiedSearchBar.tsx`**
  - L36: `type WorkspaceRow = {`
  - L79: `| WorkspaceRow`

**`dashboard/components/WorkspaceDashboard.tsx`**
  - L31: `workspaceRows: Array<{ id: string; name: string }>;`
  - L74: `workspaceRows,`
  - L150: `const activeWorkspace = (workspaceRows || []).find(w => w.id === authWorkspaceId) || { name: 'Home', id: 'default' };`
  - L182: `{workspaceRows.map((ws) => (`

**`dashboard/components/WorkspaceLauncher.tsx`**
  - L16: `export type AgentsamWorkspaceRow = {`
  - L75: `const [rows, setRows] = useState<AgentsamWorkspaceRow[]>([]);`
  - L90: `const data = (await r.json()) as { workspaces?: AgentsamWorkspaceRow[] };`
  - L135: `const activateWorkspace = async (ws: AgentsamWorkspaceRow) => {`
  - L234: `workspace?: AgentsamWorkspaceRow;`
  - L236: `} & AgentsamWorkspaceRow;`
  - L243: `const ws: AgentsamWorkspaceRow = {`

**`src/api/settings.js`**
  - L153: `async function fetchWorkspaceRowsForSettingsApi(db) {`
  - L849: `fetchWorkspaceRowsForSettingsApi(env.DB),`

**`src/api/themes.js`**
  - L56: `async function fetchWorkspaceRow(env, workspaceId) {`
  - L477: `const wsRow = await fetchWorkspaceRow(env, workspaceId);`

### cloneRepo

**`dashboard/components/WorkspaceDashboard.tsx`**
  - L453: `<h3 className="text-sm font-bold text-[var(--dashboard-text)] mb-1">Clone Repository</h3>`

### inputValue_state

**`dashboard/components/BrowserView.tsx`**
  - L769: `const [inputVal,       setInputVal]       = useState(() => normalize(initialUrl || DEFAULT_URL));`
  - L854: `setInputVal(addressDisplay?.trim() && /^(blob:|data:)/i.test(n) ? addressDisplay : n);`
  - L879: `setInputVal(e.data.url);`
  - L1036: `setInputVal(n);`
  - L1211: `onChange={e => setInputVal(e.target.value)}`
  - L1384: `setInputVal(u);`

**`dashboard/components/DatabaseAgentChat.tsx`**
  - L54: `const [input, setInput] = useState('');`
  - L123: `const sql = input.trim();`
  - L125: `setInput('');`
  - L251: `onChange={(e) => setInput(e.target.value)}`
  - L266: `disabled={running || !input.trim()}`

**`dashboard/components/ImagesPage.tsx`**
  - L758: `if (!urlInput.trim() && !file) { setStatus('Enter a URL or choose a file.'); return; }`
  - L763: `if (urlInput.trim()) {`
  - L767: `body: JSON.stringify({ url: urlInput.trim() })`

**`dashboard/components/McpPage.tsx`**
  - L462: `const [input, setInput] = useState('');`
  - L505: `setInput('');`
  - L526: `if (!input.trim() || !agentId || sending || !config) return;`
  - L527: `const text = input.trim();`
  - L529: `setInput('');`
  - L789: `onChange={e => setInput(e.target.value)}`
  - L799: `disabled={sending || !input.trim()}`
  - L1110: `const prompt = commandInput.trim();`
  - _...and 1 more matches_

**`dashboard/components/MeetPage.tsx`**
  - L729: `const c = chatInput.trim(); if (!c || !roomId) return;`
  - L735: `const c = aiInput.trim(); if (!c || aiLoading) return;`
  - L1173: `<button type="button" className="chat-send" onClick={sendChat} disabled={!chatInput.trim()}>`
  - L1212: `<button className="chat-send" onClick={sendAiMessage} disabled={!aiInput.trim() || aiLoading}>`

**`dashboard/components/WorkspaceDashboard.tsx`**
  - L140: `if (!chatInput.trim()) return;`
  - L317: `className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${isAgentRunning ? 'bg-[var(--solar-red`

**`dashboard/features/agent-chat/ChatAssistant.tsx`**
  - L107: `const [input, setInput] = useState('');`
  - L642: `setInput(v);`
  - L676: `setInput(newValue);`
  - L912: `setInput('');`
  - L1109: `(input.trim().length > 0 || attachments.length > 0) &&`
  - L1166: `setInput('');`
  - L1968: `setInput(v);`
  - L1989: `setInput(v);`

**`src/api/agent.js`**
  - L6094: `userInput: message,`
  - L6244: `userInput: message,`

**`src/api/command-run-telemetry.js`**
  - L454: `*   userInput: string,`
  - L565: `p.userInput ?? '',`
  - L804: `const userInput = String(cmd.display_name || cmd.slug || 'command').slice(0, 2000);`
  - L831: `userInput,`

**`src/core/agentsam-task-executor.js`**
  - L137: `const userInput = String(task.title || 'Plan terminal').slice(0, 2000);`
  - L185: `userInput,`

### pills_shortcuts

**`dashboard/Finance.js`**
  - L64: `In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function p_(e,t){if(e){if(typeof e=`
  - L67: `::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}`),React.cr`

**`dashboard/Finance.jsx`**
  - L40: `pill:{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,textTransform:"uppercase",letterSpacing:"0.07em"},`
  - L221: `<span style={{...S.pill,background:`${CAT_COLORS[t.category]||"#475569"}22`,color:CAT_COLORS[t.category]||"#94a3b8",bord`

**`dashboard/components/ExcalidrawView.tsx`**
  - L148: `overflow:hidden prevents the shape list from spilling outside the pane.`

**`dashboard/components/StatusBar.tsx`**
  - L636: `{/* cursor pos, indent, encoding, eol, format, mode pill, notifications */}`

**`dashboard/components/WorkspaceDashboard.tsx`**
  - L327: `{/* ── Secondary Pill Buttons (NEW) ── */}`

**`dashboard/components/learn/components/LessonAssetsView.tsx`**
  - L35: `{a.mime_type ? <span className="learn-asset-pill">{a.mime_type}</span> : null}`
  - L36: `{a.file_size ? <span className="learn-asset-pill">{Math.round(a.file_size / 1024)}kb</span> : null}`

**`dashboard/components/overview/panels/BudgetCard.tsx`**
  - L4: `import { Card, CardHeader, Pill, Tip, Ico } from "../primitives";`
  - L15: `<CardHeader icon={Ico.cloud} title="Budget vs Spend" action={<Pill label="Last 7 Days" />} />`

**`dashboard/components/overview/panels/CostLatency.tsx`**
  - L5: `import { Card, CardHeader, Pill, Ico } from "../primitives";`
  - L78: `<CardHeader icon={Ico.route} title="Cost vs Latency" action={<Pill label="agentsam_routing_arms" />} />`

**`dashboard/components/overview/panels/DeploymentsTimeline.tsx`**
  - L5: `import { Card, CardHeader, Dot, Pill, Tip, Ico } from "../primitives";`
  - L59: `<CardHeader icon={Ico.deploy} title="Deployments Timeline" action={<Pill label="agentsam_webhook_events" />} />`

**`dashboard/components/overview/panels/ModelLeaderboard.tsx`**
  - L5: `import { Card, CardHeader, Pill, Ico } from "../primitives";`
  - L114: `<Pill label="agentsam_agent_run" />`

**`dashboard/components/overview/panels/RoutingDecisions.tsx`**
  - L5: `import { Card, CardHeader, Dot, Pill, Tip, Ico } from "../primitives";`
  - L62: `<CardHeader icon={Ico.route} title="Routing Decisions" action={<Pill label="agentsam_routing_arms" />} />`

**`dashboard/components/overview/panels/SpendChart.tsx`**
  - L4: `import { Card, CardHeader, Ico, Pill, Tip } from "../primitives";`
  - L19: `<CardHeader icon={Ico.flame} title="AI Spend Over Time" action={<Pill label="Last 7 Days" />} />`

**`dashboard/components/overview/panels/SystemHealth.tsx`**
  - L4: `import { Card, CardHeader, Pill, Tip, Ico } from "../primitives";`
  - L56: `<CardHeader icon={Ico.pulse} title="System Health" action={<Pill label="agentsam_cron_runs" />} />`

**`dashboard/components/overview/panels/TokensChart.tsx`**
  - L4: `import { Card, CardHeader, Dot, Pill, Tip, Ico } from "../primitives";`
  - L22: `<CardHeader icon={Ico.zap} title="Tokens Over Time" action={<Pill label="Last 7 Days" />} />`

**`dashboard/components/overview/panels/WorkflowRunsChart.tsx`**
  - L4: `import { Card, CardHeader, Dot, Pill, Tip, Ico } from "../primitives";`
  - L26: `<CardHeader icon={Ico.cpu} title="Workflow Runs Over Time" action={<Pill label="Last 7 Days" />} />`

**`dashboard/components/overview/primitives.tsx`**
  - L24: `export function Pill({ label }: { label: string }) {`

**`dashboard/components/settings/sections/ApiKeysSection.tsx`**
  - L65: `function StatusPill({ status }: { status: string }) {`
  - L77: `function ScopePill({ scope }: { scope: string }) {`
  - L379: `render: (r) => <ScopePill scope={r.scope} />,`
  - L385: `render: (r) => <StatusPill status={r.status} />,`

**`dashboard/pages/projects/ProjectManagement.tsx`**
  - L235: `function PriorityPill({ priority }: { priority: Priority }) {`
  - L251: `function StatusPill({ status }: { status: ProjectStatus | TaskStatus }) {`
  - L326: `<PriorityPill priority={project.priority} />`
  - L327: `<StatusPill status={project.status} />`
  - L392: `<div className="col-span-2"><StatusPill status={task.status} /></div>`
  - L393: `<div className="col-span-1"><PriorityPill priority={task.priority} /></div>`

**`src/api/calendar.js`**
  - L63: `// month: include spillover weeks (6-week grid)`
  - L66: `const spill = from.getDay(); // days before first of month`
  - L67: `from.setDate(from.getDate() - spill);`

### agentMode_label

**`dashboard/App.tsx`**
  - L342: `const [activeAgentChatTabId, setActiveAgentChatTabId] = useState(() => stableAgentChatTabId);`
  - L425: `const activeAgentConversationId = useMemo(`
  - L426: `() => agentChatTabs.find((t) => t.id === activeAgentChatTabId)?.conversationId?.trim() ?? '',`
  - L427: `[agentChatTabs, activeAgentChatTabId],`
  - L431: `const activeAgentChatTabIdRef = useRef(activeAgentChatTabId);`
  - L433: `activeAgentChatTabIdRef.current = activeAgentChatTabId;`
  - L659: `const id = activeAgentConversationId?.trim() || '';`
  - L685: `}, [activeAgentConversationId]);`
  - _...and 38 more matches_

**`dashboard/Finance.js`**
  - L1: `(()=>{var O_=Object.create;var Tc=Object.defineProperty;var A_=Object.getOwnPropertyDescriptor;var S_=Object.getOwnPrope`
  - L4: `A`).concat(a,",").concat(a,",0,1,1,").concat(u,",").concat(o),className:"recharts-legend-icon"});if(n.type==="rect")retu`
  - L17: `In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function sF(e,t){if(e){if(typeof e=`
  - L57: `In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function l$(e,t){if(e){if(typeof e=`
  - L61: `In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function S8(e,t){if(e){if(typeof e=`
  - L64: `In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function p_(e,t){if(e){if(typeof e=`
  - L67: `::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}`),React.cr`

**`dashboard/Finance.jsx`**
  - L112: `<div style={{display:"grid",gridTemplateColumns:"140px 1fr 160px 110px 160px auto",gap:10,alignItems:"end"}}>`
  - L130: `<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:20}}>`

**`dashboard/components/BrowserView.tsx`**
  - L237: `<span className="ml-auto text-[10px] font-normal opacity-70">saved to trust list</span>`
  - L246: `<span className="ml-auto text-[10px] text-[var(--text-muted)]">this session only</span>`
  - L345: `<div className="flex-1 overflow-y-auto min-h-0">`
  - L358: `.filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto')`
  - L561: `<div className="flex-1 overflow-y-auto font-mono text-[10px] min-h-0">`
  - L574: `<div className="p-2 overflow-y-auto min-h-0">`
  - L594: `<div className="flex-1 overflow-y-auto min-h-0">`
  - L631: `<div className="flex-1 overflow-y-auto min-h-0">`
  - _...and 9 more matches_

**`dashboard/components/CalendarPage.tsx`**
  - L154: `<div className="flex-1 min-h-0 overflow-auto rounded-xl border border-[var(--border-subtle)]">`
  - L188: `<div className="flex-1 min-h-0 overflow-auto rounded-xl border border-[var(--border-subtle)]">`

**`dashboard/components/DataGrid.tsx`**
  - L22: `<div className="w-full overflow-auto border border-[var(--border-subtle)] rounded-lg">`

**`dashboard/components/DatabaseAgentChat.tsx`**
  - L165: `<div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">`
  - L208: `<pre className="text-[10px] font-mono p-2 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] overflow-x-aut`
  - L213: `<div className="max-h-[min(60vh,28rem)] overflow-auto rounded-lg border border-[var(--border-subtle)]">`

**`dashboard/components/DatabaseBrowser.tsx`**
  - L348: `<div className="flex gap-1.5 items-center flex-wrap justify-end w-full sm:w-auto overflow-x-auto pb-0.5 sm:pb-0 -mx-1 px`
  - L414: `<div className="flex-1 overflow-y-auto p-1 py-2 custom-scrollbar">`
  - L441: `<div className="ml-auto opacity-0 group-hover:opacity-40">`
  - L588: `<div className="p-6 overflow-y-auto h-full">`
  - L589: `<div className="max-w-xl mx-auto flex flex-col gap-5">`

**`dashboard/components/DatabasePage.tsx`**
  - L187: `<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[var(--border-subtle)] bg-[var(--b`
  - L233: `<div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>`
  - L579: `const e = ev as CustomEvent<{ sql?: string; autorun?: boolean }>;`
  - L584: `if (e.detail?.autorun) {`
  - L735: `<Database size={34} className="mx-auto mb-3 text-[var(--text-muted)] opacity-40" />`
  - L848: `<div className="min-h-0 flex-1 overflow-auto py-1">`
  - L939: `<div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-pan`
  - L949: `autoFocus`
  - _...and 8 more matches_

**`dashboard/components/DesignStudioPage.tsx`**
  - L203: `<div className="w-[260px] min-w-[260px] h-full bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] flex flex-col`
  - L549: `<div className="mt-auto pt-3 flex-shrink-0">`
  - L769: `<div className="pointer-events-auto">`

**`dashboard/components/ExtensionsPanel.tsx`**
  - L81: `<div className="flex-1 overflow-y-auto mt-2 pb-4">`

**`dashboard/components/GLBViewer.tsx`**
  - L15: `auto-rotate`

**`dashboard/components/GitHubActionsPanel.tsx`**
  - L15: `<div className="flex-1 overflow-y-auto p-2 space-y-2">`

**`dashboard/components/GitHubExplorer.tsx`**
  - L496: `<div className="flex-1 overflow-y-auto p-2 min-h-0">`

**`dashboard/components/GoogleDriveExplorer.tsx`**
  - L390: `<div className="flex-1 overflow-y-auto p-2 min-h-0">`
  - L488: `<MoreVertical size={10} className="ml-auto opacity-0 group-hover:opacity-40 shrink-0" />`

**`dashboard/components/ImagesPage.tsx`**
  - L368: `<div style={{ flex: 1, overflow: 'auto', padding: 24 }}>`
  - L425: `gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',`
  - L625: `width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',`
  - L734: `<button onClick={onClose} style={{ ...actionBtnStyle('var(--bg-app)', 'var(--text-muted)'), marginLeft: 'auto' }}>`

**`dashboard/components/IntegrationsPage.deprecated.tsx`**
  - L94: `['shopify', 'Shopify', 'Commerce catalog and order automation.', 'automation'],`
  - L97: `['notion', 'Notion', 'Workspace docs, databases, and notes.', 'automation'],`
  - L98: `['linear', 'Linear', 'Issue tracking and sprint workflows.', 'automation'],`
  - L99: `['jira', 'Jira', 'Enterprise ticket and project sync.', 'automation'],`
  - L393: `<main className="flex-1 min-w-0 overflow-auto">`
  - L436: `<nav className="flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)]">`
  - L523: `className="mt-auto inline-flex items-center justify-center gap-2 text-[11px] font-bold px-3 py-2 rounded-lg border borde`
  - L588: `<aside className="w-full max-w-md border-l bg-[var(--bg-panel)] shadow-2xl overflow-auto">`
  - _...and 3 more matches_

**`dashboard/components/KnowledgeSearchPanel.tsx`**
  - L143: `<div className="flex-1 min-h-[80px] overflow-y-auto chat-hide-scroll">`
  - L204: `placeholder="Search indexed knowledge (autorag chunks)…"`
  - L226: `<div className="flex-1 min-h-0 overflow-y-auto p-3">`

**`dashboard/components/LocalExplorer.tsx`**
  - L169: `if (b === 'autorag') return 'AUTORAG_BUCKET';`
  - L788: `<div className="flex flex-col h-full bg-[var(--bg-panel)] overflow-hidden text-[var(--text-main)] overflow-y-auto align-`

**`dashboard/components/MCPPanel.tsx`**
  - L80: `<div className="flex-1 overflow-y-auto p-4 custom-scrollbar">`

**`dashboard/components/MailPage.tsx`**
  - L671: `<div style={{ padding: '6px 0', flex: '1 1 auto', overflowY: 'auto' }}>`
  - L771: `<div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>`
  - L857: `<div style={{ flex: '1 1 auto', overflowY: 'auto' }}>`
  - L909: `<div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{t.category || 'general'}</div>`
  - L988: `<div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>`
  - L1010: `marginLeft: 'auto',`
  - L1153: `<div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>`
  - L1337: `<div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>`
  - _...and 5 more matches_

**`dashboard/components/McpPage.tsx`**
  - L748: `<div className="ml-auto w-full max-w-xl flex flex-col" style={{ background: 'var(--bg-panel)', borderLeft: '1px solid va`
  - L764: `<div ref={messagesRef} className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0 custom-scrollbar">`
  - L825: `const [activeAgent, setActiveAgent] = useState<string | null>(null);`
  - L932: `setActiveAgent(id);`
  - L942: `setActiveAgent(null);`
  - L951: `if (id) setActiveAgent(id);`
  - L1116: `const selectedCfg = activeAgent`
  - L1117: `? list.find((a) => a.id === activeAgent)`
  - _...and 5 more matches_

**`dashboard/components/MeetPage.tsx`**
  - L95: `? <video ref={ref} autoPlay playsInline muted={isSelf} className="vtile-video" />`
  - L235: `/** When present on first paint, lobby form is skipped and join runs automatically. */`
  - L361: `const move = (e: MouseEvent) => { if (!dragging) return; el.style.left = `${e.clientX - ox}px`; el.style.top = `${e.clie`
  - L556: `const autoJoinStarted = useRef(false);`
  - L558: `// Auto-join when ?room= is present — no manual lobby step.`
  - L560: `if (!roomFromUrl || autoJoinStarted.current) return;`
  - L561: `autoJoinStarted.current = true;`
  - L754: `form.append('mode', 'auto');`
  - _...and 12 more matches_

**`dashboard/components/MeetShellPanel.tsx`**
  - L183: `.meet-shell-panel { display:flex; flex-direction:column; height:100%; overflow-y:auto; }`
  - L203: `.msp-ai-result { margin: 0 14px 8px; background: var(--bg-surface,#0d1e1c); border: 1px solid var(--border,#1a2e2c); bor`
  - L208: `.msp-tool-badge { margin-left:auto; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px; background:color`

**`dashboard/components/MonacoEditorView.tsx`**
  - L380: `<div className="h-9 flex items-center border-b border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] shrink-0 ove`

**`dashboard/components/ProblemsDebugPanel.tsx`**
  - L172: `<div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 chat-hide-scroll">`

**`dashboard/components/PromptModal.tsx`**
  - L104: `autoFocus`

**`dashboard/components/R2Explorer.tsx`**
  - L28: `if (b === 'autorag') return 'AUTORAG_BUCKET';`
  - L504: `<div className="flex flex-col gap-0.5 max-h-[min(30vh,200px)] overflow-y-auto">`
  - L591: `<div className="flex-1 min-h-0 overflow-y-auto p-2">`
  - L617: `<ChevronRight size={10} className="opacity-40 ml-auto shrink-0" />`

**`dashboard/components/SQLConsole.tsx`**
  - L245: `<div className="flex-1 overflow-auto p-4 min-h-0">`

**`dashboard/components/SourcePanel.tsx`**
  - L90: `<div className="flex-1 overflow-y-auto no-scrollbar p-0">`
  - L110: `<span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-panel)] text-[var(--text-muted)]" style={{ fontF`
  - L124: `<CheckCircle2 size={24} className="mx-auto mb-2 text-[var(--solar-green)] opacity-20" />`
  - L200: `<div className="ml-auto flex items-center gap-1 text-[9px] text-[var(--solar-cyan)] opacity-60">`

**`dashboard/components/StatusBar.tsx`**
  - L311: `<div className="overflow-y-auto flex-1 min-h-0">`
  - L441: `autoFocus`
  - L444: `<div className="py-1 overflow-y-auto flex-1 min-h-0">`
  - L561: `<div className="overflow-y-auto flex-1 min-h-0 py-1">`
  - L635: `<div className="flex items-stretch shrink-0 ml-auto">`
  - L678: `title="Format Document — run Prettier on the active file to auto-fix indentation, quotes, spacing."`

**`dashboard/components/StoragePage.tsx`**
  - L231: `.storage-root{height:100%;min-height:0;display:flex;background:var(--bg-app);color:var(--text-main)}.storage-root--embed`
  - L325: `<div className="storage-grid"><Stat label="Endpoint" value={<span style={{ fontSize: 12 }}>{s3?.endpoint || 'n/a'}</span`

**`dashboard/components/StudioSidebar.tsx`**
  - L154: `<div className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] flex flex-col p-5 z-20 overflow-`
  - L576: `<div className="mt-auto pt-4 space-y-2 flex-shrink-0">`

**`dashboard/components/TerminalSessionPane.tsx`**
  - L531: `.iam-terminal-pane-root .xterm-shell-viewport .xterm-viewport { overflow-y: auto !important; }`

**`dashboard/components/ToolLauncherBar.tsx`**
  - L68: `<div className="pointer-events-auto">`

**`dashboard/components/UIOverlay.tsx`**
  - L98: `<div className="flex flex-col gap-2 pointer-events-auto animate-in slide-in-from-left duration-500">`
  - L99: `<div className="flex items-center gap-2 bg-black/60 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl shadow-2xl `
  - L184: `<div className="flex gap-4 pointer-events-auto">`

**`dashboard/components/UnifiedSearchBar.tsx`**
  - L492: `<div className="flex-1 min-h-0 overflow-y-auto chat-hide-scroll">`

**`dashboard/components/WorkspaceDashboard.tsx`**
  - L42: `activeAgentSlug?: string | null;`
  - L83: `activeAgentSlug = null,`
  - L153: `<div className="flex-1 flex flex-col items-center justify-start bg-[var(--scene-bg)] overflow-y-auto py-12 px-6 no-scrol`
  - L270: `<span>{selectedModel?.name || 'Auto'}</span>`
  - L279: `<span className="text-[10px] text-[var(--dashboard-muted)]">Auto</span>`
  - L285: `<div className="max-h-[300px] overflow-y-auto no-scrollbar scroll-px-1">`
  - L359: `{(displayPlanTasks.length > 0 || activePlanId || workspaceActivity.length > 0 || workspaceVerificationCommands.length > `
  - L361: `{activeAgentSlug ? (`
  - _...and 1 more matches_

**`dashboard/components/WorkspaceLauncher.tsx`**
  - L394: `<div className="flex-1 overflow-y-auto p-4 space-y-2">`
  - L441: `<div className="flex-1 overflow-y-auto p-6 space-y-6">`

**`dashboard/components/XTermShell.tsx`**
  - L878: `<div className="absolute inset-0 overflow-y-auto custom-scrollbar px-4 py-3 font-mono text-[11px] leading-relaxed text-[`
  - L895: `<div className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 space-y-2 bg-[var(--terminal-surface)] z-[20]">`

**`dashboard/components/analytics/AnalyticsShell.tsx`**
  - L19: `<div className="flex-1 min-h-0 overflow-auto p-3">{children}</div>`

**`dashboard/components/analytics/tabs/AdvisorsTab.tsx`**
  - L172: `<div className="max-h-[min(70vh,520px)] overflow-auto">`
  - L231: `<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-slate-500">`
  - L239: `<pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-rose-200/70">`
  - L260: `<div className="space-y-2 max-h-[420px] overflow-auto">`
  - L272: `<div className="max-h-[420px] overflow-auto font-mono text-[10px] text-slate-400 space-y-1">`

**`dashboard/components/analytics/tabs/AgentTab.tsx`**
  - L189: `<div className="max-h-[420px] overflow-auto space-y-1">`
  - L296: `<div className="max-h-[280px] overflow-auto space-y-2 font-mono text-[10px] text-slate-400">`
  - L315: `<div className="max-h-[280px] overflow-auto font-mono text-[10px] text-slate-400 space-y-1">`
  - L330: `<div className="max-h-[260px] overflow-auto">`
  - L363: `<div className="max-h-[260px] overflow-auto font-mono text-[10px] text-slate-400 space-y-1">`

**`dashboard/components/analytics/tabs/CodebaseTab.tsx`**
  - L175: `<div className="mt-3 overflow-auto border border-[var(--border-subtle)] rounded">`
  - L217: `<div className="mt-3 overflow-auto border border-[var(--border-subtle)] rounded">`
  - L250: `<div className="overflow-auto border border-[var(--border-subtle)] rounded">`
  - L278: `<div className="overflow-auto border border-[var(--border-subtle)] rounded">`

**`dashboard/components/analytics/tabs/McpTab.tsx`**
  - L70: `<div className="max-h-[360px] overflow-auto">`
  - L119: `<div className="max-h-[220px] overflow-auto space-y-1 text-[10px] text-slate-400">`

**`dashboard/components/analytics/tabs/ModelsTab.tsx`**
  - L104: `<div className="max-h-[360px] overflow-auto">`
  - L134: `<div className="max-h-[220px] overflow-auto font-mono text-[10px] text-slate-400 space-y-1">`
  - L145: `<div className="max-h-[200px] overflow-auto font-mono text-[10px] text-slate-400 space-y-1">`
  - L186: `<div className="mt-2 max-h-[160px] overflow-auto text-[10px] text-slate-500 space-y-1">`
  - L196: `<div className="max-h-[200px] overflow-auto font-mono text-[10px] text-slate-400 space-y-1">`
  - L207: `<div className="max-h-[200px] overflow-auto font-mono text-[10px] text-slate-400 space-y-1">`

**`dashboard/components/analytics/tabs/OverviewTab.tsx`**
  - L487: `<div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 overflow-auto">`
  - L518: `<div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 overflow-auto">`
  - L714: `<div className="overflow-auto border border-[var(--border-subtle)] rounded max-h-56">`

**`dashboard/components/analytics/tabs/RagTab.tsx`**
  - L159: `<div className="mt-3 overflow-auto border border-[var(--border-subtle)] rounded">`
  - L190: `<div className="overflow-auto border border-[var(--border-subtle)] rounded">`
  - L220: `<div className="overflow-auto border border-[var(--border-subtle)] rounded">`

**`dashboard/components/analytics/tabs/WorkersTab.tsx`**
  - L89: `<div className="max-h-[240px] overflow-auto space-y-1 font-mono text-[10px] text-slate-400">`
  - L106: `<div className="max-h-[240px] overflow-auto space-y-1 font-mono text-[10px] text-slate-400">`
  - L133: `<div className="max-h-[200px] overflow-auto space-y-1 text-[11px] text-slate-400">`
  - L145: `<div className="max-h-[200px] overflow-auto space-y-1 text-[11px] text-slate-400">`
  - L159: `<div className="max-h-[200px] overflow-auto font-mono text-[10px] text-slate-400 space-y-1">`
  - L170: `<div className="mb-2 max-h-[120px] overflow-auto font-mono text-[10px] text-slate-500 space-y-1">`

**`dashboard/components/auth/AuthForgotPage.tsx`**
  - L83: `autoComplete="email"`

**`dashboard/components/auth/AuthResetPage.tsx`**
  - L95: `autoComplete="new-password"`
  - L114: `autoComplete="new-password"`

**`dashboard/components/auth/AuthSignInPage.tsx`**
  - L160: `autoComplete="email"`
  - L179: `autoComplete="current-password"`

**`dashboard/components/auth/AuthSignUpPage.tsx`**
  - L103: `autoComplete="name"`
  - L122: `autoComplete="email"`
  - L146: `autoComplete="new-password"`
  - L170: `autoComplete="new-password"`

**`dashboard/components/health/D1TelemetryTab.tsx`**
  - L48: `<div className="mt-2 overflow-x-auto max-h-[280px] overflow-y-auto rounded border border-[var(--border-subtle)]">`

**`dashboard/components/health/HealthShell.tsx`**
  - L53: `<div className="flex-1 min-h-0 overflow-auto p-3">{children}</div>`

**`dashboard/components/learn/AssignmentPanel.tsx`**
  - L130: `<span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>`

**`dashboard/components/learn/CourseNav.tsx`**
  - L140: `<div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>`

**`dashboard/components/learn/LearningOS.tsx`**
  - L76: `<div style={{ marginLeft: 'auto' }}>{right}</div>`
  - L221: `<ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--solar-cyan)' }} />`
  - L522: `<div style={{ marginLeft: 'auto' }}>`
  - L582: `<div style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>`
  - L768: `<div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>`

**`dashboard/components/learn/LessonView.tsx`**
  - L121: `<div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>`
  - L131: `<div style={{ flex: 1, overflowY: 'auto', padding: 32, maxWidth: 760 }}>`

**`dashboard/components/learn/MarkdownContent.tsx`**
  - L5: `import rehypeAutolinkHeadings from 'rehype-autolink-headings';`
  - L52: `<div style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{lang || '`
  - L62: `overflowX: 'auto',`
  - L81: `rehypeAutolinkHeadings,`
  - L137: `<div style={{ overflowX: 'auto', margin: '12px 0', border: '1px solid var(--border-subtle)', borderRadius: 10 }}>`

**`dashboard/components/learn/MarkdownLite.tsx`**
  - L147: `overflowX: 'auto',`

**`dashboard/components/library/ArtifactPreviewPanel.tsx`**
  - L48: `<div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-sm">`
  - L101: `<pre className="text-[11px] p-3 rounded-lg bg-[var(--dashboard-panel)] border border-[var(--dashboard-border)] overflow-`

**`dashboard/components/onboarding/OnboardingPage.tsx`**
  - L34: `margin: '0 auto',`
  - L436: `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>`

**`dashboard/components/overview/panels/ActiveProjects.tsx`**
  - L52: `<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 10 }}>`

**`dashboard/components/overview/panels/CostLatency.tsx`**
  - L98: `domain={["auto", "auto"]}`

**`dashboard/components/overview/panels/KpiStrip.tsx`**
  - L45: `<div style={{ display: "flex", gap: 8, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>`

**`dashboard/components/overview/panels/SystemHealth.tsx`**
  - L61: `<div style={{ overflowX: "auto", marginBottom: 10, maxWidth: "100%" }}>`

**`dashboard/components/overview/panels/TopServices.tsx`**
  - L15: `{ type: "Browser Auto", count: 9800 },`

**`dashboard/components/settings/SettingsPanel.tsx`**
  - L184: `<div className="flex-1 overflow-y-auto p-5 custom-scrollbar">`

**`dashboard/components/settings/components/IntegrationCard.tsx`**
  - L288: `autoComplete="off"`

**`dashboard/components/settings/components/RulesSkillsDrawers.tsx`**
  - L34: `<div className="p-4 flex-1 overflow-auto custom-scrollbar space-y-3">`
  - L136: `<div className="p-4 flex-1 overflow-auto custom-scrollbar space-y-3">`

**`dashboard/components/settings/components/SectionNav.tsx`**
  - L34: `<div className="flex-1 overflow-y-auto py-1 custom-scrollbar">`

**`dashboard/components/settings/components/rulesSkills/RulesSkillsCommandsTab.tsx`**
  - L69: `<pre className="mt-3 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] overflow-auto">`
  - L93: `<pre className="mt-3 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] overflow-auto">`
  - L98: `<pre className="mt-3 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] overflow-auto">`

**`dashboard/components/settings/hooks/useSettingsData.ts`**
  - L13: `auto_run_mode: 'allowlist',`
  - L20: `auto_clear_chat: 0,`
  - L24: `usage_summary_mode: 'auto',`
  - L25: `agent_autocomplete: 1,`
  - L27: `auto_accept_web_search: 0,`
  - L33: `auto_format_on_agent_finish: 0,`
  - L36: `auto_parse_links: 0,`
  - L40: `collapse_auto_run_commands: 1,`

**`dashboard/components/settings/sections/AIModelsSection.tsx`**
  - L345: `autoComplete="off"`
  - L368: `<div className="overflow-x-auto">`

**`dashboard/components/settings/sections/AgentsSection.tsx`**
  - L16: `{ key: 'auto_accept_web_search', label: 'Auto-accept web search', desc: 'Skip confirm step for web search' },`
  - L18: `{ key: 'agent_autocomplete', label: 'Agent autocomplete', desc: 'Autocomplete suggestions from the agent' },`
  - L19: `{ key: 'auto_clear_chat', label: 'Auto-clear chat', desc: 'Automatically clear chat between tasks' },`
  - L24: `{ key: 'jump_next_diff_on_accept', label: 'Jump next diff on accept', desc: 'Auto-jump diff cursor after accepting' },`
  - L25: `{ key: 'auto_format_on_agent_finish', label: 'Auto-format on finish', desc: 'Format files after agent completion' },`
  - L28: `{ key: 'auto_parse_links', label: 'Auto-parse links', desc: 'Parse links from text automatically' },`
  - L32: `{ key: 'collapse_auto_run_commands', label: 'Collapse auto-run commands', desc: 'Collapse auto-run command output' },`
  - L84: `<span className="text-[var(--text-muted)]">Auto-run mode</span>`
  - _...and 4 more matches_

**`dashboard/components/settings/sections/ApiKeysSection.tsx`**
  - L506: `<div className="p-4 flex-1 overflow-auto custom-scrollbar space-y-3">`
  - L538: `autoComplete="off"`
  - L605: `<div className="p-4 flex-1 overflow-auto custom-scrollbar space-y-3">`
  - L619: `autoComplete="off"`

**`dashboard/components/settings/sections/GeneralSection.tsx`**
  - L9: `autohide_editor: 'iam_pref_autohide_editor',`
  - L10: `autoinject_code: 'iam_pref_autoinject_code',`
  - L29: `const [autohideEditor, setAutohideEditor] = useState(false);`
  - L30: `const [autoinjectCode, setAutoinjectCode] = useState(true);`
  - L35: `setAutohideEditor(readStoredBool(PREF_KEYS.autohide_editor, false));`
  - L36: `setAutoinjectCode(readStoredBool(PREF_KEYS.autoinject_code, true));`
  - L89: `label: 'Auto-hide editor when empty',`
  - L91: `on: autohideEditor,`
  - _...and 9 more matches_

**`dashboard/components/settings/sections/IntegrationsSection.tsx`**
  - L301: `['agentsam', 'autodidact'].includes(slug);`

**`dashboard/components/settings/sections/PlanUsageSection.tsx`**
  - L126: `<div className="mt-auto pt-2 flex flex-wrap gap-2">`

**`dashboard/components/settings/sections/SecuritySection.tsx`**
  - L291: `'Update this key in Cloudflare Secrets, then add the new value here via Add key. This dashboard cannot push secrets to C`
  - L572: `autoComplete="off"`
  - L691: `autoComplete="current-password"`
  - L699: `autoComplete="new-password"`
  - L707: `autoComplete="new-password"`
  - L788: `autoComplete="email"`
  - L915: `autoComplete="off"`

**`dashboard/components/settings/types.ts`**
  - L32: `auto_run_mode: string;`
  - L39: `auto_clear_chat: number;`
  - L44: `agent_autocomplete: number;`
  - L46: `auto_accept_web_search: number;`
  - L52: `auto_format_on_agent_finish: number;`
  - L55: `auto_parse_links: number;`
  - L59: `collapse_auto_run_commands: number;`

**`dashboard/components/themes/ThemeJsonInspector.tsx`**
  - L38: `<pre className="text-[11px] leading-relaxed overflow-auto p-4 font-mono text-[var(--text-main)] whitespace-pre">`

**`dashboard/components/themes/ThemePreviewCanvas.tsx`**
  - L66: `className="mt-auto text-[8px] px-1.5 py-0.5 rounded inline-block self-start font-medium text-white"`

**`dashboard/features/agent-chat/ChatAssistant.tsx`**
  - L57: `AgentMode,`
  - L97: `activeAgentChatShellTabId,`
  - L131: `const [mode, setMode] = useState<AgentMode>('agent');`
  - L141: `/** Optional workflow run stream (`agent_universal_autonomous_run` / graph SSE). */`
  - L175: `const [mobileHubTab, setMobileHubTab] = useState<'agents' | 'automations' | 'dashboard'>('agents');`
  - L224: `const ar = String(agentsamPolicy.auto_run_mode || '').toLowerCase();`
  - L226: `else if (ar === 'allowlist' || ar === 'auto') setMode('agent');`
  - L578: `if (Number(agentsamPolicyRef.current?.agent_autocomplete) === 0) {`
  - _...and 19 more matches_

**`dashboard/features/agent-chat/components/AgentChatMarkdown.tsx`**
  - L34: `'[&_pre]:my-2 [&_pre]:p-3 [&_pre]:bg-[var(--scene-bg)] [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[var(--dashboard`
  - L37: `'[&_table]:text-[0.75rem] [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_table]:block [&_table]:max-w-full`
  - L84: `className="max-h-48 w-auto max-w-full object-contain block mx-auto"`

**`dashboard/features/agent-chat/components/AgentCodeFencePreview.tsx`**
  - L118: `className="m-0 px-3 py-2.5 text-[0.6875rem] font-mono leading-relaxed text-[var(--solar-cyan)] bg-[var(--bg-code-pre)] o`

**`dashboard/features/agent-chat/components/AgentMessageList.tsx`**
  - L154: `<pre className="text-[0.6875rem] font-mono text-[var(--solar-green)] bg-[var(--bg-code-pre)] rounded-lg p-3 overflow-x-a`
  - L219: `className="my-2 p-3 bg-[var(--scene-bg)] rounded-lg border border-[var(--dashboard-border)] overflow-x-auto max-w-full m`
  - L385: `className="order-4 flex flex-col flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain px-3 sm:px-4 pt-6 pb-4 space-`
  - L561: `<div style={{ overflowX: 'auto', padding: 8 }}>`
  - L612: `overflowY: 'auto',`

**`dashboard/features/agent-chat/components/WorkflowRunBoard.tsx`**
  - L281: `<div className="px-3 py-2 space-y-0.5 max-h-40 overflow-y-auto">`

**`dashboard/features/agent-chat/composerLayout.ts`**
  - L56: `right: 'auto',`
  - L58: `top: 'auto',`
  - L68: `right: 'auto',`
  - L70: `bottom: 'auto',`
  - L79: `el.style.height = 'auto';`
  - L82: `el.style.overflowY = sh > maxPx ? 'auto' : 'hidden';`

**`dashboard/features/agent-chat/streamDebug.ts`**
  - L3: `* Not a new page — window global only, devtools / automation safe read.`

**`dashboard/features/agent-chat/types.ts`**
  - L99: `activeAgentChatShellTabId?: string | null;`
  - L162: `export type AgentMode = 'ask' | 'plan' | 'agent' | 'debug' | 'multitask';`
  - L170: `] as const satisfies ReadonlyArray<{ id: AgentMode; label: string; description: string }>;`

**`dashboard/pages/HealthPage.tsx`**
  - L271: `<div className="max-h-[420px] overflow-auto border border-[var(--border-subtle)] rounded">`

**`dashboard/pages/library/LibraryPage.tsx`**
  - L262: `<div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">`
  - L273: `<div className="max-w-md py-16 text-center mx-auto">`

**`dashboard/pages/projects/ProjectManagement.tsx`**
  - L428: `<div className="mx-auto max-w-[1720px] space-y-5">`

**`dashboard/pages/tasks/TasksPage.tsx`**
  - L394: `<div className="flex-1 space-y-3 overflow-y-auto p-3">`
  - L570: `<div className="flex-1 overflow-auto p-4 sm:p-6">`
  - L571: `<div className="flex gap-4 overflow-x-auto pb-4">`
  - L599: `<div className="flex-1 space-y-3 overflow-y-auto p-3">`

**`dashboard/pages/workflows/WorkflowsPage.tsx`**
  - L37: `<div className="flex-1 min-h-0 overflow-y-auto">`
  - L38: `<div className="max-w-3xl mx-auto w-full px-4 py-4 space-y-4">`

**`dashboard/postcss.config.js`**
  - L4: `autoprefixer: {},`

**`dashboard/services/VoxelEngine.ts`**
  - L531: `const autoScale = entity.scale || (5 / Math.max(size.x, size.y, size.z));`
  - L532: `pivot.scale.set(autoScale, autoScale, autoScale);`
  - L538: `console.log(`Successfully spawned model: ${entity.name} at scale ${autoScale}`);`

**`dashboard/src/components/ToolApprovalModal.tsx`**
  - L520: `className="m-0 max-h-[min(40vh,280px)] overflow-auto px-3 pb-3 text-[0.6875rem] font-mono leading-relaxed"`

**`src/api/agent.js`**
  - L257: `VALUES (?, ?, ?, ?, 'auto', 1)`,`
  - L476: `const FALLBACK_CORE_SYSTEM = 'You are Agent Sam, an autonomous AI coding and operations assistant for Inner Animal Media`
  - L479: `const AGENT_SAM_PYTHON_PARALLEL_BLOCK = `You are a Python professional. When a task involves data processing, scripting,`
  - L720: `if (!t) return { taskType: 'chat', mode: 'auto' };`
  - L740: `/\b(orchestrate|multi[- ]?step|multi[- ]?agent|automate|end[- ]?to[- ]?end|full[- ]?stack|build[- ]?and[- ]?deploy|creat`
  - L750: `if (hasRecall) return { taskType: 'summary', mode: 'auto' };`
  - L1442: `{ agentMode: String(modeSlug || '').toLowerCase() === 'agent' },`
  - L1676: `const slug = (modeSlug || 'auto').toLowerCase();`
  - _...and 24 more matches_

**`src/api/agentsam.js`**
  - L617: `data.triggerMethod || 'auto',`

**`src/api/auth-hooks.js`**
  - L46: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">`

**`src/api/auth.js`**
  - L30: `import { autoStartWorkSession } from './oauth-login-callbacks.js';`
  - L513: `html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2>Welcome</h2><p>Verif`
  - L523: `autoStartWorkSession(env, authUserId, tid, url.pathname).catch(() => {});`
  - L1698: `.shell{max-width:520px;margin:0 auto;padding:32px 20px 48px;}`
  - L1972: `eventType: 'oauth_consent_auto_redirect',`

**`src/api/cms.js`**
  - L38: `const region = 'auto';`

**`src/api/deployments.js`**
  - L23: `).bind(deploymentId, environment || 'production', gitHash || 'unknown', description || 'Automated deploy', now, now).run`
  - L73: `// ── /api/internal/record-deploy ── (System/Automation Gate)`

**`src/api/designstudio/index.js`**
  - L123: `const credentialScope = `${dateStamp}/auto/s3/aws4_request`;`
  - L148: `const signingKey = await getSigningKey(secretKey, dateStamp, 'auto', 's3');`
  - L470: `const bucket = (url.searchParams.get('bucket') || '').trim() || 'autorag';`

**`src/api/draw.js`**
  - L219: `auto_load, agent_tags, description, item_count`

**`src/api/email.js`**
  - L3: `* Internal / scripted sends (deploy hooks, automation).`

**`src/api/git-status.js`**
  - L15: `* Requires INTERNAL_API_SECRET (automation) or authenticated user (workspace-scoped).`

**`src/api/integrations.js`**
  - L20: `['int_mcp', 'mcp_servers', 'MCP Servers', 'automation', 'api_key', 'disconnected', 40, null],`
  - L29: `['int_browser_rendering', 'browser_rendering', 'Browser Rendering', 'automation', 'worker_binding', 'disconnected', 130,`
  - L32: `['int_cursor', 'cursor', 'Cursor', 'automation', 'api_key', 'disconnected', 150, 'CURSOR_API_KEY'],`
  - L33: `['int_claude_code', 'claude_code', 'Claude Code', 'automation', 'api_key', 'disconnected', 160, 'CLAUDE_CODE_API_KEY'],`
  - L281: `category TEXT NOT NULL CHECK(category IN ('source_control','storage','ai_provider','communication','database','analytics`

**`src/api/integrations/connect.js`**
  - L273: `if (catSlug === 'iam_hosted' || ['agentsam', 'autodidact'].includes(slug)) {`

**`src/api/mcp.js`**
  - L50: `async function resolveAgentModel(env, preferredModelKey, tenantId) {`
  - L389: `const modelRow = await resolveAgentModel(env, profile.default_model_id, tenantId);`
  - L1001: `const agentName = names[agentId] || 'Builder';`
  - L1095: `agent_name: agentName,`

**`src/api/notify-deploy.js`**
  - L12: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#f8fafc;padding:28px`
  - L22: `<p style="font-size:12px;color:#64748b;margin:20px 0 0;">Inner Animal Media · inneranimalmedia.com · Auto-generated depl`

**`src/api/oauth-login-callbacks.js`**
  - L57: `/** Match worker.js autoStartWorkSession */`
  - L58: `export async function autoStartWorkSession(env, userId, tenantId, pageContext) {`
  - L64: `total_active_seconds, project_context, page_context, auto_paused)`
  - L124: `VALUES (?, ?, ?, ?, 'auto', ?, unixepoch(), unixepoch(), unixepoch())`,`
  - L326: `autoStartWorkSession(env, userId, tidGh, url.pathname).catch(() => {});`

**`src/api/provisioning.js`**
  - L2: `* InnerAutodidact / IAM — dynamic provisioning, billing plan resolution, BYOK, bridge keys.`

**`src/api/r2-api.js`**
  - L315: `autorag: env.AUTORAG_BUCKET,`
  - L329: `if (env.AUTORAG_BUCKET) names.push('autorag');`
  - L413: `const credentialScope = `${dateStamp}/auto/s3/aws4_request`;`
  - L428: `const signingKey = await getSigningKey(secretKey, dateStamp, 'auto', 's3');`
  - L451: `const credentialScope = `${dateStamp}/auto/s3/aws4_request`;`
  - L453: `const signingKey = await getSigningKey(secretKey, dateStamp, 'auto', 's3');`

**`src/api/rag.js`**
  - L115: `function r2AutoragBucketName(env) {`
  - L116: `return String(env.R2_AUTORAG_BUCKET_NAME || '').trim();`
  - L270: `function resolveAutoragFolder(env, metadata) {`
  - L271: `const prefixes = String(env.RAG_AUTORAG_FOLDER_PREFIXES || '')`
  - L297: `region: 'auto',`
  - L320: `const bucket = r2AutoragBucketName(env);`
  - L349: `const bucket = r2AutoragBucketName(env);`
  - L360: `const bucket = r2AutoragBucketName(env);`
  - _...and 1 more matches_

**`src/api/search.js`**
  - L2: `* API Service: Cloudflare AI Search (AutoRAG)`
  - L45: `: 'auto';`
  - L53: `mode: 'auto',`

**`src/api/settings-integrations.js`**
  - L205: `['agentsam', 'autodidact'].includes(slug),`

**`src/api/settings.js`**
  - L50: `'auto_run_mode',`
  - L57: `'auto_clear_chat',`
  - L62: `'agent_autocomplete',`
  - L64: `'auto_accept_web_search',`
  - L70: `'auto_format_on_agent_finish',`
  - L73: `'auto_parse_links',`
  - L77: `'collapse_auto_run_commands',`
  - L375: `'autohide_editor',`
  - _...and 2 more matches_

**`src/api/storage.js`**
  - L3: `* R2 bindings, analytics, Vectorize / AutoRAG, S3-compatible config, D1 preferences & access-key registry.`
  - L15: `{ binding: 'AUTORAG_BUCKET', storage_name: 'autorag', public: true, url: 'https://autorag.inneranimalmedia.com' },`
  - L66: `.map((b) => ({ ...b, storage_type: 'r2_bucket', storage_id: b.storage_name, region: 'auto' }));`
  - L138: `if (b === env.AUTORAG_BUCKET) return 'AUTORAG_BUCKET';`
  - L490: `// ── Vectors + AutoRAG registry ─────────────────────────────────`
  - L618: `VALUES (?, ?, 'r2_bucket', ?, ?, 'auto', 'active', ?, unixepoch(), unixepoch())`,`
  - L695: `const region = env.R2_REGION || 'auto';`

**`src/api/telemetry.js`**
  - L174: `id, tenant_id, workspace_id${uidMid}, session_id, agent_name, provider, model, model_key,`
  - L201: `id, tenant_id, workspace_id${uidMid}, session_id, agent_name, provider, model, model_key,`
  - L254: `tenant_id, workspace_id, session_id, agent_name, provider, model, model_key,`
  - L323: `id, tenant_id, workspace_id, agent_name, provider, model, model_key,`

**`src/api/test/code-execution-e2e.js`**
  - L284: `agent_name: 'agent-sam',`

**`src/api/themes.js`**
  - L499: `"Automatic upload to the platform R2 assets bucket is not enabled for this workspace. Enable it in Workspace settings (C`

**`src/api/vault.js`**
  - L253: `'POST /api/auth/agent-session/mint (Bearer) — mint short-lived browser session cookies for automation',`

**`src/core/agent-policy.js`**
  - L49: `auto_run_mode: 'allowlist',`
  - L72: `const fullSql = `SELECT auto_run_mode, mcp_tools_protection, file_deletion_protection, external_file_protection,`
  - L81: `const legacySql = `SELECT auto_run_mode, mcp_tools_protection, file_deletion_protection, external_file_protection`
  - L277: `if (opts.agentMode && AGENT_CHAT_ESSENTIAL_TOOL_KEYS.has(name)) {`

**`src/core/agentsam-ops-ledger.js`**
  - L9: `* Browser automation: use assertBrowserTrustedOrigin (this module) → agentsam_browser_trusted_origin.`

**`src/core/agentsam-task-executor.js`**
  - L446: `'[terminal] NOT EXECUTED: planner-linked tasks require an approved agentsam_approval_queue row (not catalog auto-run).',`
  - L857: `modelKey: params?.modelKey || 'auto',`

**`src/core/auth.js`**
  - L15: `/** Short-lived sessions minted for automation (POST /api/auth/agent-session/mint). */`
  - L649: `* Automation-only: mint short-lived browser sessions (see POST /api/auth/agent-session/mint).`

**`src/core/capability-router.js`**
  - L224: `'The following JSON was produced by a cheap classifier (gpt-5.4-nano or heuristic). It does NOT auto-run tools.',`
  - L232: `'- Terminal/scripts: when should_use_terminal is true, use terminal/script tools and honor approval gates (Playwright/e2`

**`src/core/email-templates.js`**
  - L10: `<div style="font-family:monospace;max-width:520px;margin:0 auto;padding:32px;`
  - L36: `<div style="font-family:monospace;max-width:520px;margin:0 auto;padding:32px;`
  - L56: `<div style="font-family:monospace;max-width:520px;margin:0 auto;padding:32px;`

**`src/core/identity.js`**
  - L21: `function envAllowsAutoProvision(env) {`
  - L86: `// Auto-provision tenant/workspace for authenticated users when allowed.`
  - L88: `if (envAllowsAutoProvision(env) && env?.DB && userId && !isSuperadmin) {`

**`src/core/mcp-authorization.js`**
  - L110: `const modeRequiresApproval = String(policy.auto_run_mode || '').toLowerCase() !== 'auto';`

**`src/core/provider.js`**
  - L67: `async function resolveAutoModelKey(env, params) {`
  - L70: `if (mk && mk.toLowerCase() !== 'auto') return modelKey;`
  - L81: `mode: params.mode || 'auto',`
  - L428: `const modelKey = await resolveAutoModelKey(env, params);`
  - L432: `error: 'No routable model for auto selection',`
  - L497: `const modelKey = await resolveAutoModelKey(env, params);`
  - L499: `throw new Error('No routable model for auto selection; configure agentsam_routing_arms or agentsam_model_catalog.');`

**`src/core/r2.js`**
  - L80: `const region = 'auto';`

**`src/core/resolveModel.js`**
  - L51: `auto:   { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash-lite' },`
  - L58: `auto:   { primary: 'gpt-5.4-mini',  fallback: 'gemini-2.5-flash' },`
  - L67: `auto:   { primary: 'gpt-5.4-mini',  fallback: 'claude-sonnet-4-6' },`
  - L70: `auto:   { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },`
  - L73: `auto:   { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },`
  - L76: `auto:   { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },`
  - L79: `auto:   { primary: 'gpt-5.4-nano',  fallback: 'gemini-2.5-flash-lite' },`
  - L103: `auto:   { primary: '@cf/baai/bge-m3', fallback: null },`
  - _...and 4 more matches_

**`src/core/routing.js`**
  - L270: `const m = q.mode != null && String(q.mode).trim() !== '' ? String(q.mode).trim() : 'auto';`
  - L513: `const slug = String(ctx.intentSlug ?? 'auto').toLowerCase().trim() || 'auto';`
  - L519: `auto: 'chat',`
  - L563: `const mode = ctx.mode != null && String(ctx.mode).trim() !== '' ? String(ctx.mode).trim() : 'auto';`
  - L908: `/** Alias for {@link getDefaultModelForTask} — Thompson arm pick for auto model. */`
  - L909: `export async function selectAutoModel(env, ctx = {}) {`

**`src/core/thompson.js`**
  - L39: `* Single-draw Thompson sample for command/auto flows.`
  - L46: `const m = mode != null && String(mode).trim() !== '' ? String(mode).trim() : 'auto';`
  - L233: `const mode = payload?.mode != null ? String(payload.mode).trim() : 'auto';`

**`src/core/usage-event-writer.js`**
  - L66: `agent_name, created_at`

**`src/core/workflow-executor.js`**
  - L167: `systemPrompt: 'You are Agent Sam, an autonomous AI developer for Inner Animal Media. Complete the task and return concis`

**`src/cron/jobs/archive-old-conversations.js`**
  - L113: `details, severity, automated, check_category, checked_at)`

**`src/cron/jobs/daily-digest.js`**
  - L109: `WHERE status IN ('fail', 'failed', 'warn', 'warning') AND automated = 1`

**`src/cron/jobs/daily-plan-email.js`**
  - L131: `[What to ask Agent Sam to do autonomously today — specific tool calls or queries.]`
  - L211: `.wrap{max-width:680px;margin:0 auto;background:#111;border:1px solid rgba(255,107,0,0.2);border-radius:12px;padding:40px`

**`src/cron/jobs/index-memory-vectorize.js`**
  - L95: `// DISABLED: manual Vectorize upsert corrupts AutoRAG index (same index used by AI Search)`

**`src/cron/jobs/overnight-progress.js`**
  - L122: `const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 a`
  - L152: `const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 a`
  - L177: `const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 a`

**`src/do/AgentChat.js`**
  - L119: `id INTEGER PRIMARY KEY AUTOINCREMENT,`

**`src/integrations/openai.js`**
  - L267: `...(oaiTools?.length ? { tools: oaiTools, tool_choice: 'auto' } : {}),`
  - L349: `...(oaiTools?.length ? { tools: oaiTools, tool_choice: 'auto' } : {}),`

**`src/tools/builtin/deploy.js`**
  - L3: `* Implements 5 tools for infrastructure management and pipeline automation.`

**`src/tools/builtin/imessage.js`**
  - L16: `// Auto-format for US numbers if no chatGuid is provided`

**`src/tools/builtin/python.js`**
  - L14: `Use this for: data analysis, automation scripts, file processing, API calls, math/statistics,`

**`src/tools/builtin/web.js`**
  - L3: `* Implements 31 tools for browser automation and intelligence.`

**`src/tools/builtin/workflow.js`**
  - L3: `* Implements 2 tools for project management and automation.`

### routingArms

**`dashboard/components/overview/index.tsx`**
  - L184: `<RoutingDecisions arms={bundle?.routing_arms} routingTimeseries={bundle?.routing_timeseries} />`

**`dashboard/components/overview/panels/CostLatency.tsx`**
  - L78: `<CardHeader icon={Ico.route} title="Cost vs Latency" action={<Pill label="agentsam_routing_arms" />} />`

**`dashboard/components/overview/panels/RoutingDecisions.tsx`**
  - L11: `arms?: DashboardBundle["routing_arms"];`
  - L44: `return [{ name: "routing_arms", v: 100, c: PC.other }];`
  - L62: `<CardHeader icon={Ico.route} title="Routing Decisions" action={<Pill label="agentsam_routing_arms" />} />`

**`dashboard/components/overview/types.ts`**
  - L129: `routing_arms?: Array<{`

**`dashboard/config/analyticsDataSources.ts`**
  - L90: `primaryTable: 'agentsam_routing_arms',`
  - L290: `primaryTable: 'agentsam_routing_decisions',`

**`dashboard/pages/HealthPage.tsx`**
  - L176: `hint="When Agent Sam streams complete, rows land in public.agentsam_stream_events, agentsam_routing_decisions, and agent`

**`src/api/agent.js`**
  - L21: `import { dispatchStream, OLLAMA_SKIP_MESSAGE, resolveModelMeta } from '../core/provider.js';`
  - L164: `* Restricts the candidate model chain to tiers allowed for this workspace (agentsam_model_tier).`
  - L170: ``SELECT cost_tier FROM agentsam_model_tier`
  - L1852: ``UPDATE agentsam_routing_arms SET`
  - L1947: ``SELECT workflow_agent, tools_json FROM agentsam_routing_arms`
  - L2033: `* Chat SSE tail of the model chain: `agentsam_routing_arms` (chat + mode + is_eligible, decayed_score),`
  - L2105: `// No-op: model tiers are managed and seeded in D1 (agentsam_model_tier).`
  - L2305: `const withArm = arm && cols.has('routing_arm_id');`
  - _...and 6 more matches_

**`src/api/analytics.js`**
  - L85: ``/rest/v1/agentsam_routing_decisions?select=model,model_key,provider,estimated_cost_usd,created_at&order=created_at.desc`

**`src/api/analytics/boards.js`**
  - L194: `if (!db || !(await tableExists(db, 'agentsam_routing_arms'))) {`
  - L205: `const cols = await pragmaTableInfo(db, 'agentsam_routing_arms');`
  - L220: `'routing_arms',`
  - L221: ``SELECT * FROM agentsam_routing_arms WHERE ${where.join(' AND ')} ORDER BY ${orderCol} DESC LIMIT 120`,`
  - L248: `FROM public.agentsam_routing_decisions`

**`src/api/analytics/overview.js`**
  - L798: ``SELECT 1 AS ok FROM agentsam_routing_arms`
  - L1022: `FROM public.agentsam_routing_decisions`
  - L1170: `['agentsam_usage_events', 'agentsam_workflow_runs', 'agentsam_routing_decisions (Supabase)'],`

**`src/api/analytics/source-health.js`**
  - L30: `{ key: 'agentsam_routing_decisions', table: 'agentsam_routing_decisions', backend: 'supabase' },`

**`src/api/command-run-telemetry.js`**
  - L8: `import { estimateCostUsdFromCatalog, resolveModelKeyFromProviderId } from '../core/model-catalog-cost.js';`
  - L507: `const { modelKey: canonMk, rawModelId } = await resolveModelKeyFromProviderId(`

**`src/api/health/queries.js`**
  - L36: `supabaseGetJson(env, `/rest/v1/agentsam_routing_decisions?${baseSel}`, 'public'),`
  - L241: `supabaseGetJson(env, `/rest/v1/agentsam_routing_decisions?select=*&order=created_at.desc.nullslast&${lim}`, 'public'),`

**`src/api/integrity.js`**
  - L46: `(SELECT COUNT(*) FROM agentsam_routing_arms) AS intents_total,`
  - L47: `(SELECT COUNT(*) FROM agentsam_routing_arms WHERE total_executions > 0) AS intents_wired,`
  - L48: `(SELECT COUNT(*) FROM agentsam_routing_arms WHERE is_active = 1) AS routing_rules_active,`
  - L49: `(SELECT COUNT(*) FROM agentsam_routing_arms WHERE is_active = 1 AND provider = 'google') AS routing_rules_with_google,`
  - L52: `SELECT intent_slug, total_executions FROM agentsam_routing_arms`

**`src/api/overview-bundle.js`**
  - L91: `routing_arms: [],`
  - L504: `// ── Model leaderboard: agentsam_agent_run + routing_arms + eval_runs ─────`
  - L524: `MAX(routing_arm_id) AS routing_arm_id`
  - L568: `routing_arm_id: null,`
  - L592: `const armIds = [...new Set(mergedLb.map((r) => r.routing_arm_id).filter(Boolean).map((x) => String(x)))];`
  - L600: `FROM agentsam_routing_arms`
  - L628: `const rid = r.routing_arm_id != null ? String(r.routing_arm_id) : '';`
  - L672: `FROM agentsam_routing_arms`
  - _...and 3 more matches_

**`src/api/settings.js`**
  - L1843: ``SELECT * FROM agentsam_model_tier WHERE workspace_id = ? ORDER BY tier_level`,`
  - L1848: `env.DB.prepare(`SELECT * FROM agentsam_routing_arms ORDER BY task_type, mode`)`
  - L1915: ``UPDATE agentsam_model_tier SET ${sets}, updated_at = datetime('now') WHERE id = ?`,`

**`src/api/telemetry.js`**
  - L9: `import { estimateCostUsdFromCatalog, resolveModelKeyFromProviderId } from '../core/model-catalog-cost.js';`
  - L107: `const { modelKey: resolved } = await resolveModelKeyFromProviderId(env.DB, provider, rawModel);`
  - L169: `usageCols.has('routing_arm_id');`
  - L176: `event_type, duration_ms, routing_arm_id,`

**`src/api/test/code-execution-e2e.js`**
  - L19: `import { estimateCostUsdFromCatalog, resolveModelKeyFromProviderId } from '../../core/model-catalog-cost.js';`
  - L52: `async function resolveModel(env, pref = 'sonnet', opusGated = false) {`
  - L55: `return resolveModel(env, 'sonnet', false);`
  - L539: `resolveModel(env, pref === 'opus' ? 'opus' : pref === 'haiku' ? 'haiku' : 'sonnet', body.opus_gated === true),`
  - L660: `const { modelKey: catalogKey, rawModelId: providerRaw } = await resolveModelKeyFromProviderId(`

**`src/api/webhooks/supabase.js`**
  - L79: `case 'agentsam_routing_decisions': {`
  - L83: ``UPDATE agentsam_routing_arms SET`

**`src/api/workflow/summary.js`**
  - L30: `// Fallback to agentsam_routing_arms`
  - L33: `SELECT model_key, provider FROM agentsam_routing_arms`

**`src/core/agent-costs.js`**
  - L93: `add('routing_arm_id', o.routingArmId != null ? String(o.routingArmId).slice(0, 120) : null);`

**`src/core/agent-run-routing.js`**
  - L58: `add('routing_arm_id', p.routingArmId != null ? String(p.routingArmId).slice(0, 120) : null);`
  - L157: `pushSet('routing_arm_id', p.routingArmId != null ? String(p.routingArmId).slice(0, 120) : null);`
  - L197: `add('routing_arm_id', p.routingArmId != null ? String(p.routingArmId).slice(0, 120) : null);`

**`src/core/capability-router.js`**
  - L5: `import { resolveModelApiKey } from '../integrations/tokens.js';`
  - L152: `const apiKey = await resolveModelApiKey(env, 'openai', NANO_MODEL, userId);`

**`src/core/gate.js`**
  - L41: `'SELECT reasoning_effort FROM agentsam_routing_arms WHERE task_type = ? AND is_active = 1 LIMIT 1'`

**`src/core/model-catalog-cost.js`**
  - L25: `export async function resolveModelKeyFromProviderId(db, provider, rawModelId) {`

**`src/core/provider.js`**
  - L97: `params.routing_arm_id = arm.id;`
  - L273: `export async function resolveModelMeta(env, modelKey) {`
  - L304: `'[provider] resolveModelMeta: using agentsam_ai fallback (no active agentsam_model_catalog row)',`
  - L433: `detail: 'Configure agentsam_routing_arms (and agentsam_model_catalog) or set model explicitly.',`
  - L439: `const meta = await resolveModelMeta(env, modelKey);`
  - L499: `throw new Error('No routable model for auto selection; configure agentsam_routing_arms or agentsam_model_catalog.');`
  - L502: `const meta = await resolveModelMeta(env, modelKey);`
  - L623: `const fbMeta = await resolveModelMeta(env, fbKey);`
  - _...and 1 more matches_

**`src/core/resolveModel.js`**
  - L3: `* src/core/resolveModel.js`
  - L7: `* terminal agents) must call resolveModelForTask() and consume the returned`
  - L113: `* @typedef {Object} ResolveModelInput`
  - L117: `* @property {string}  [routing_arm_id]         - use this arm directly`
  - L144: `* @property {string}  [routing_arm_id]`
  - L148: `export async function resolveModelForTask(env, {`
  - L152: `routing_arm_id = null,`
  - L166: `if (!row) throw new Error(`resolveModel: model_key "${model_key}" not found or inactive in catalog`);`
  - _...and 18 more matches_

**`src/core/retention.js`**
  - L384: `const rules = await pragmaTableInfo(env.DB, 'agentsam_routing_arms');`
  - L404: `UPDATE agentsam_routing_arms SET`
  - L410: `task_type = agentsam_routing_arms.task_type`
  - L913: `agentsam_routing_arms: await updateModelRoutingRulesFromScores(env),`

**`src/core/routing-cron.js`**
  - L18: `const armCols = await pragmaTableInfo(env.DB, 'agentsam_routing_arms');`
  - L63: ``UPDATE agentsam_routing_arms SET is_paused = 1, pause_reason = 'slo_breach', updated_at = unixepoch()`
  - L72: ``UPDATE agentsam_routing_arms SET is_paused = 1, updated_at = unixepoch()`
  - L86: `const armCols = await pragmaTableInfo(env.DB, 'agentsam_routing_arms');`
  - L87: `if (!runCols.size || !runCols.has('routing_arm_id') || !armCols.size) return;`
  - L90: `jobName: 'routing_arms_reconcile_agent_run',`
  - L105: `UPDATE agentsam_routing_arms SET`
  - L108: `WHERE r.routing_arm_id = agentsam_routing_arms.id`
  - _...and 12 more matches_

**`src/core/routing-decisions-writer.js`**
  - L2: `* Legacy routing_decisions writer (D1). Chat now persists `routing_arm_id` on `agentsam_agent_run``
  - L8: `const RULE_SOURCE = 'agentsam_routing_arms';`
  - L51: `add('routing_arm_id', o.routingArmId != null ? String(o.routingArmId).slice(0, 120) : null);`

**`src/core/routing.js`**
  - L3: `* Agent Sam model routing — Thompson sampling over agentsam_routing_arms (Beta bandit).`
  - L5: `* Schema is discovered via PRAGMA table_info(agentsam_routing_arms) before reads/writes.`
  - L21: `const TABLE = 'agentsam_routing_arms';`
  - L498: `* Map gate intent + request flags to `agentsam_routing_arms.task_type` (no tenant/workspace literals).`
  - L641: `* @param {string} [mode] agent mode slug (must match `agentsam_routing_arms.mode`)`
  - L666: `FROM   agentsam_routing_arms ra`
  - L812: `console.warn('[routing_arms] usage feedback', e?.message ?? e);`
  - L822: `* Execution + Thompson feedback on `agentsam_routing_arms` (fire-and-forget).`
  - _...and 2 more matches_

**`src/core/thompson.js`**
  - L2: `* Thompson/Beta bandit over agentsam_routing_arms + nightly updates from agentsam_execution_performance_metrics.`
  - L62: ``${projection} FROM agentsam_routing_arms ra WHERE ${baseWhere} AND ra.workspace_id = ? ORDER BY ${orderSql} LIMIT 40`;`
  - L68: ``${projection} FROM agentsam_routing_arms ra WHERE ${baseWhere} AND COALESCE(TRIM(ra.workspace_id), '') = '' ORDER BY ${`
  - L87: `SELECT routing_arm_id, model_key, workspace_id, execution_count, success_count, failure_count,`
  - L98: `const rid = m.routing_arm_id != null ? String(m.routing_arm_id).trim() : '';`
  - L104: `FROM agentsam_routing_arms WHERE id = ? LIMIT 1`
  - L118: `FROM agentsam_routing_arms`
  - L133: `FROM agentsam_routing_arms WHERE model_key = ? LIMIT 1`
  - _...and 5 more matches_

**`src/core/usage-event-writer.js`**
  - L18: `* @param {string} [params.routing_arm_id]`
  - L39: `routing_arm_id = null,`
  - L65: `ref_table, ref_id, routing_arm_id,`
  - L80: `ref_table, ref_id, routing_arm_id,`
  - L97: `model, model_key, provider, routing_arm_id,`
  - L105: `model, model_key, provider, routing_arm_id,`

**`src/cron/jobs/daily-plan-email.js`**
  - L70: `// Blocked providers from agentsam_routing_arms`
  - L73: `FROM agentsam_routing_arms`

**`src/integrations/openai.js`**
  - L4: `* Key resolved via resolveModelApiKey (BYOK / agentsam_ai.secret_key_name / env).`
  - L7: `import { resolveModelApiKey } from './tokens.js';`
  - L182: `const apiKey = await resolveModelApiKey(env, 'openai', modelKey, userId);`
  - L253: `const apiKey = await resolveModelApiKey(env, 'openai', modelKey, userId);`
  - L335: `const apiKey = await resolveModelApiKey(env, 'openai', modelKey, userId);`
  - L404: `const apiKey = await resolveModelApiKey(env, 'openai', modelKey, userId);`
  - L435: `const apiKey = await resolveModelApiKey(env, 'openai', modelKey, userId);`

**`src/integrations/tokens.js`**
  - L15: `export async function resolveModelApiKey(env, provider, modelKey, userId) {`

## cms_themes / Theme Wiring Audit

**`dashboard/App.tsx`**
  - L461 `[theme_slug]` → `slug: typeof msg.theme_slug === 'string' ? msg.theme_slug : undefined,`

**`dashboard/components/MonacoEditorView.tsx`**
  - L72 `[cms_themes]` → `/** Resolve :root CSS custom properties (cms_themes / inneranimalmedia.css) for Monaco. */`

**`dashboard/components/MonacoSurface.tsx`**
  - L78 `[cms_themes]` → `/** Only `data-monaco-bg` / explicit prop — no CSS-token guessing (Monaco mirrors `cms_themes.monaco`

**`dashboard/components/overview/constants.ts`**
  - L18 `[cms_themes]` → `* UI typography: cms_themes `fontFamily` → --font-family; Tailwind entry sets --font-sans (Nunito).`

**`dashboard/components/settings/sections/WorkspaceSection.tsx`**
  - L9 `[theme_slug]` → `default_theme_slug?: string;`
  - L209 `[theme_slug]` → `defaultValue={pipe.default_theme_slug || ''}`
  - L210 `[theme_slug]` → `key={pipe.default_theme_slug || ''}`
  - L215 `[theme_slug]` → `void patch({ default_theme_slug: v || undefined });`

**`dashboard/components/themes/ThemeBrowser.tsx`**
  - L76 `[applyTheme]` → `const applyTheme = useCallback(`
  - L252 `[applyTheme]` → `onApply={(t) => void applyTheme(t)}`

**`dashboard/features/agent-chat/ChatAssistant.tsx`**
  - L1453 `[cms_themes]` → `everywhere via your workspace <code className="text-[var(--solar-cyan)]">cms_themes</code> row.`

**`dashboard/src/applyCmsTheme.ts`**
  - L3 `[cms_themes]` → `* Source of truth for preview/edit is always D1 `cms_themes.config` merged server-side — not R2 `the`
  - L64 `[cms_themes]` → `/** From `cms_themes.monaco_theme` or `{slug}-monaco` derived server-side from the same row (never i`
  - L66 `[cms_themes]` → `/** From `cms_themes.monaco_bg`. */`
  - L68 `[cms_themes]` → `/** From `cms_themes.monaco_theme_data` (full `IStandaloneThemeData` JSON string). */`
  - L9 `[theme_slug]` → `export const INNERANIMALMEDIA_LS_THEME_SLUG = 'inneranimalmedia_theme_slug';`
  - L21 `[theme_slug]` → `return w ? `inneranimalmedia_theme_slug:${w}` : INNERANIMALMEDIA_LS_THEME_SLUG;`
  - L49 `[theme_slug]` → `const LEGACY_MCAD_SLUG = 'mcad_theme_slug';`

**`src/api/draw.js`**
  - L183 `[theme_slug]` → `const theme_slug = String(body.theme_slug || '').trim();`
  - L185 `[theme_slug]` → `if (!theme_slug) return jsonResponse({ error: 'theme_slug required' }, 400);`
  - L196 `[theme_slug]` → `.bind(String(userId), workspace_id, theme_slug)`
  - L212 `[theme_slug]` → `return jsonResponse({ success: true, theme: theme_slug });`

**`src/api/settings-sections.js`**
  - L616 `[cms_themes]` → `'cms_themes',`
  - L618 `[cms_themes]` → `FROM cms_themes ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 50`,`

**`src/api/themes.js`**
  - L77 `[cms_themes]` → `return await env.DB.prepare(`SELECT * FROM cms_themes WHERE slug = ? LIMIT 1`).bind(s).first();`
  - L120 `[cms_themes]` → `const row = await env.DB.prepare(`SELECT tokens_json FROM cms_themes WHERE id = ? LIMIT 1`)`
  - L134 `[cms_themes]` → `await env.DB.prepare(`UPDATE cms_themes SET tokens_json = ?, updated_at = unixepoch() WHERE id = ?`)`
  - L158 `[cms_themes]` → ``UPDATE cms_themes SET`
  - L290 `[cms_themes]` → `FROM cms_themes`
  - L332 `[cms_themes]` → ``SELECT * FROM cms_themes WHERE is_system = 1 AND slug = 'dark' LIMIT 1`,`
  - L405 `[cms_themes]` → `const existing = await env.DB.prepare(`SELECT id FROM cms_themes WHERE slug = ? LIMIT 1`)`
  - L416 `[cms_themes]` → ``INSERT INTO cms_themes (`
  - L469 `[cms_themes]` → `let fullRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE id = ?`).bind(rowId).first();`
  - L535 `[cms_themes]` → `fullRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE id = ?`).bind(rowId).first();`
  - L588 `[cms_themes]` → `outRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE slug = ?`).bind(slug).first();`
  - L630 `[cms_themes]` → `fullRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE id = ?`).bind(themeId).first();`
  - L680 `[cms_themes]` → `const refreshed = await env.DB.prepare(`SELECT * FROM cms_themes WHERE id = ?`)`
  - L729 `[cms_themes]` → `themeRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE id = ?`).bind(themeId).first();`
  - L732 `[cms_themes]` → `themeRow = await env.DB.prepare(`SELECT * FROM cms_themes WHERE slug = ?`)`
  - L846 `[cms_themes]` → ``SELECT * FROM cms_themes WHERE is_system = 1 AND slug = 'dark' LIMIT 1`,`
  - L74 `[fetchTheme]` → `async function fetchThemeRowBySlug(env, slug) {`
  - L471 `[fetchTheme]` → `fullRow = await fetchThemeRowBySlug(env, slug);`
  - L633 `[fetchTheme]` → `fullRow = await fetchThemeRowBySlug(env, slug);`
  - L419 `[css_vars_json]` → `tokens_json, css_vars_json, brand_json, layout_json, typography_json, components_json, motion_json,`
  - L438 `[css_vars_json]` → `css_vars_json = excluded.css_vars_json,`
  - L459 `[css_vars_json]` → `sidecars.css_vars_json,`
  - L722 `[theme_slug]` → `const themeSlugIn = body.theme_slug != null ? String(body.theme_slug).trim() : "";`

**`src/core/cms-theme-active.js`**
  - L2 `[cms_themes]` → `* Live theme resolution from `cms_themes` rows (D1 `config` JSON + `css_vars_json`).`
  - L27 `[cms_themes]` → `/** Merge cms_themes.config into API variables (GET /api/settings/theme). Supports cssVars + css_var`
  - L85 `[cms_themes]` → `* Map cms_themes.config-derived CSS variables to dashboard tokens (`--bg-app`, `--text-main`, …).`
  - L139 `[cms_themes]` → `* D1 `cms_themes.css_vars_json` — must match runtime apply (same as catalog `cssVarsMerged` in previ`
  - L278 `[cms_themes]` → `env.DB.prepare(`UPDATE cms_themes SET css_vars_json = ? WHERE slug = ?`)`
  - L302 `[cms_themes]` → `* @param {Record<string, unknown>} row — cms_themes row`
  - L318 `[cms_themes]` → `/** Align with D1 `cms_themes.monaco_theme`, R2 monaco.json id, and IAM_COLLAB — `{slug}-monaco`, ne`
  - L9 `[css_vars_json]` → `* When `css_vars_json` is still `{}` after a package sync, `hydrateCmsThemeCssVarsFromR2` (called fr`
  - L144 `[css_vars_json]` → `const obj = parseJsonObject(row?.css_vars_json);`
  - L235 `[css_vars_json]` → `* When D1 `css_vars_json` is empty `{}` but the compiled package exists on R2, read `theme.json`,`
  - L237 `[css_vars_json]` → `* Mutates `row.css_vars_json` when hydration succeeds.`
  - L245 `[css_vars_json]` → `const raw = row.css_vars_json;`
  - L276 `[css_vars_json]` → `row.css_vars_json = JSON.stringify(cssVars);`
  - L279 `[css_vars_json]` → `.bind(row.css_vars_json, slug)`

**`src/core/cms-theme-create.js`**
  - L2 `[cms_themes]` → `* Pure helpers for POST /api/themes/create — builds cms_themes columns from request palette/tokens.`
  - L124 `[cms_themes]` → `* Default JSON column payloads for cms_themes.`
  - L130 `[css_vars_json]` → `const css_vars_json = JSON.stringify(t.css_vars ?? t.cssVars ?? {});`
  - L136 `[css_vars_json]` → `return { tokens_json, css_vars_json, brand_json, layout_json, typography_json, components_json, moti`

**`src/core/cms-theme-hashing.js`**
  - L53 `[cms_themes]` → `* @param {Record<string, unknown>} row — cms_themes row`
  - L71 `[css_vars_json]` → `css_vars_json: normalizeJsonField(row?.css_vars_json),`

**`src/core/cms-theme-package-files.js`**
  - L158 `[cms_themes]` → `Realtime theming uses **D1** (\`cms_themes\`) via \`GET /api/themes/active\`.`
  - L172 `[theme_slug]` → `{ "theme_slug": "${slug}", "scope": "workspace", "workspace_id": "<id>" }`

**`src/core/cms-theme-preview-model.js`**
  - L2 `[cms_themes]` → `* Derives a stable preview_model for theme browser cards from cms_themes rows.`
  - L46 `[cms_themes]` → `* Parse all JSON-ish cms_themes columns for API responses.`
  - L241 `[cms_themes]` → `* Full normalization for one cms_themes row (for GET /api/themes).`
  - L63 `[css_vars_json]` → `const css_vars_json = track("css_vars_json", row?.css_vars_json);`
  - L77 `[css_vars_json]` → `if (css_vars_json && typeof css_vars_json === "object") {`
  - L78 `[css_vars_json]` → `for (const [k, v] of Object.entries(css_vars_json)) {`
  - L87 `[css_vars_json]` → `css_vars_json,`

**`src/core/cms-theme-registry.js`**
  - L7 `[cms_themes]` → `* Merge package_meta into cms_themes.tokens_json (compact metadata).`

**`src/core/cms-theme-resolve.js`**
  - L2 `[cms_themes]` → `* Resolve live `cms_themes` row from D1 using workspace/project/user/tenant fallbacks.`
  - L166 `[cms_themes]` → `let row = await db.prepare(`SELECT * FROM cms_themes WHERE slug = ? LIMIT 1`).bind(s).first();`
  - L168 `[cms_themes]` → `row = await db.prepare(`SELECT * FROM cms_themes WHERE id = ? LIMIT 1`).bind(s).first();`
  - L268 `[cms_themes]` → ``SELECT t.slug FROM cms_themes t`
  - L358 `[cms_themes]` → `.prepare(`SELECT * FROM cms_themes WHERE is_system = 1 AND slug = 'dark' LIMIT 1`)`
  - L362 `[cms_themes]` → `.prepare(`SELECT * FROM cms_themes WHERE is_system = 1 ORDER BY sort_order ASC LIMIT 1`)`
  - L411 `[cms_themes]` → `const t = await db.prepare(`SELECT id FROM cms_themes WHERE slug = ? LIMIT 1`).bind(slug).first();`
  - L176 `[theme_slug]` → ``SELECT theme_slug FROM cms_theme_preferences`
  - L190 `[theme_slug]` → ``SELECT theme_slug FROM cms_theme_preferences`
  - L204 `[theme_slug]` → ``SELECT theme_slug FROM cms_theme_preferences`
  - L311 `[theme_slug]` → `if (p?.theme_slug) {`
  - L312 `[theme_slug]` → `const hit = await trySlug(p.theme_slug, "cms_theme_preferences.project");`
  - L319 `[theme_slug]` → `if (p?.theme_slug) {`
  - L320 `[theme_slug]` → `const hit = await trySlug(p.theme_slug, "cms_theme_preferences.workspace");`
  - L339 `[theme_slug]` → `if (p?.theme_slug) {`
  - L340 `[theme_slug]` → `const hit = await trySlug(p.theme_slug, "cms_theme_preferences.user_global");`
  - L379 `[theme_slug]` → `* Insert tries `(…, theme_slug, theme_id, …)` first; on missing `theme_id` column, retries without i`
  - L528 `[theme_slug]` → ``INSERT INTO cms_theme_preferences (id, tenant_id, scope, workspace_id, project_id, user_id, theme_s`
  - L543 `[theme_slug]` → ``INSERT INTO cms_theme_preferences (id, tenant_id, scope, workspace_id, project_id, user_id, theme_s`
  - L571 `[theme_slug]` → `theme_slug: payload.slug,`

**`src/do/Collaboration.js`**
  - L67 `[cms_themes]` → `'SELECT * FROM cms_themes WHERE slug = ?'`
  - L65 `[theme_slug]` → `const { theme_slug } = await request.json();`
  - L68 `[theme_slug]` → `).bind(theme_slug).first();`
  - L69 `[theme_slug]` → `if (!row) return new Response(JSON.stringify({ error: 'unknown theme_slug' }), { status: 404, header`
  - L76 `[theme_slug]` → `theme_slug: payload.slug,`
  - L85 `[theme_slug]` → `return new Response(JSON.stringify({ ok: true, theme_slug: payload.slug }), { headers: { 'Content-Ty`

## WorkspaceDashboard Props Surface

```typescript
interface WorkspaceDashboardProps {
  onOpenFolder: () => void;
  onConnectWorkspace: () => void;
  onGithubSync: () => void;
  recentFiles: RecentFileEntry[];
  workspaceRows: Array<{ id: string; name: string 
```

## Current + Menu Items

  L24 in `dashboard/components/WorkspaceDashboard.tsx`: `import { usePlanTasksRealtime } from '../src/hooks/usePlanTasksRealtime';`
  L37 in `dashboard/components/WorkspaceDashboard.tsx`: `workspacePlanTasks?: unknown[];`
  L39 in `dashboard/components/WorkspaceDashboard.tsx`: `activePlanId?: string | null;`
  L79 in `dashboard/components/WorkspaceDashboard.tsx`: `workspacePlanTasks = [],`
  L80 in `dashboard/components/WorkspaceDashboard.tsx`: `activePlanId = null,`
  L85 in `dashboard/components/WorkspaceDashboard.tsx`: `const { tasks: realtimePlanTasks } = usePlanTasksRealtime(activePlanId ?? null);`
  L86 in `dashboard/components/WorkspaceDashboard.tsx`: `const displayPlanTasks: unknown[] = activePlanId ? (realtimePlanTasks as unknown[]) : workspacePlanTasks;`
  L219 in `dashboard/components/WorkspaceDashboard.tsx`: `placeholder="Plan, Build, / for commands, @ for context"`
  L239 in `dashboard/components/WorkspaceDashboard.tsx`: `{ icon: FileText, label: 'Plan', slug: 'plan' },`
  L330 in `dashboard/components/WorkspaceDashboard.tsx`: `<span>Plan New Idea</span>`
  L359 in `dashboard/components/WorkspaceDashboard.tsx`: `{(displayPlanTasks.length > 0 || activePlanId || workspaceActivity.length > 0 || workspaceVerificationCommands.length > `
  L367 in `dashboard/components/WorkspaceDashboard.tsx`: `{displayPlanTasks.length > 0 ? (`
  L371 in `dashboard/components/WorkspaceDashboard.tsx`: `{displayPlanTasks.slice(0, 12).map((t, i) => {`
  L240 in `dashboard/components/WorkspaceDashboard.tsx`: `{ icon: Bug, label: 'Debug', slug: 'debug' },`
  L241 in `dashboard/components/WorkspaceDashboard.tsx`: `{ icon: Target, label: 'Ask', slug: 'ask' },`
  L242 in `dashboard/components/WorkspaceDashboard.tsx`: `{ icon: Terminal, label: 'Image', action: () => fileInputRef.current?.click() },`
  L243 in `dashboard/components/WorkspaceDashboard.tsx`: `{ icon: Zap, label: 'Skills', action: () => window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail: { activ`
  L244 in `dashboard/components/WorkspaceDashboard.tsx`: `{ icon: Layers, label: 'MCP Servers', action: () => window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail:`
  L874 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `const wasPlanTerminal = !!tool.plan_terminal;`
  L882 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `content: `${last.content}\n\n[${wasPlanTerminal ? 'Terminal command' : 'Tool execution'} cancelled.]`,`
  L1923 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `{ icon: FileText, label: 'Plan', slug: 'plan' },`
  L69 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `import { initIamAgentStreamDebug, patchIamAgentStreamDebug } from './streamDebug';`
  L1010 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `const streamDebugId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dbg_${Date.now()}`;`
  L1011 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `initIamAgentStreamDebug(streamDebugId);`
  L1019 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `patchIamAgentStreamDebug({`
  L1025 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `patchIamAgentStreamDebug({`
  L1032 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `patchIamAgentStreamDebug({`
  L1072 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `patchIamAgentStreamDebug({ abort_at: Date.now() });`
  L1088 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `patchIamAgentStreamDebug({ error_at: Date.now() });`
  L1924 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `{ icon: Bug, label: 'Debug', slug: 'debug' },`
  L1925 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `{ icon: Target, label: 'Ask', slug: 'ask' },`
  L14 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `Image as ImageIconLucide,`
  L649 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `const addFilesFromList = (list: FileList | null, asImage: boolean) => {`
  L653 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `const isImg = asImage || file.type.startsWith('image/');`
  L728 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `const handleChatImagePreview = useCallback(`
  L1481 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `onImagePreview={handleChatImagePreview}`
  L1926 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `{ icon: ImageIconLucide, label: 'Image', action: () => imageInputRef.current?.click() },`
  L1927 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `{ icon: Zap, label: 'Skills', action: () => window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail: { activ`
  L1928 in `dashboard/features/agent-chat/ChatAssistant.tsx`: `{ icon: Layers, label: 'MCP Servers', action: () => window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail:`

## recentFiles / Recently Opened Wiring

**`dashboard/App.tsx`**
  L323: `const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);`
  L650: `recentFiles: [] as RecentFileEntry[],`
  L653: `idePersistRef.current = { ideWorkspace, gitBranch, recentFiles };`
  L654: `}, [ideWorkspace, gitBranch, recentFiles]);`
  L669: `recentFiles: s.recentFiles,`
  L680: `setRecentFiles(b.recentFiles);`

**`dashboard/components/UnifiedSearchBar.tsx`**
  L218: `recentFiles?: { name: string; path: string; label?: string }[];`
  L226: `recentFiles = [],`
  L387: `recentFiles.slice(0, 5).forEach(f => {`
  L392: `}, [q, rows, recentFiles, sourceFacets]);`

**`dashboard/components/WorkspaceDashboard.tsx`**
  L30: `recentFiles: RecentFileEntry[];`
  L73: `recentFiles,`
  L462: `<h2 className="text-[11px] font-bold text-[var(--dashboard-muted)] uppercase tracking-widest">Recently Opened</h2>`
  L466: `{recentFiles.length > 0 ? (`
  L467: `recentFiles.slice(0, 6).map((file) => (`

**`dashboard/src/ideWorkspace.ts`**
  L18: `export type RecentFileSource = 'local' | 'github' | 'r2' | 'drive' | 'buffer';`
  L27: `source: RecentFileSource;`
  L45: `recentFiles: RecentFileEntry[];`
  L53: `recentFiles: [],`
  L77: `function recentSource(f: ActiveFile): RecentFileSource {`
  L113: `const rf = o.recentFiles;`

**`src/api/workspace.js`**
  L110: `recentFiles: Array.isArray(body.recentFiles) ? body.recentFiles.slice(0, 24) : [],`

## Pre-Build Checklist

- ❌ Git working tree is clean
- ✅ WorkspaceDashboard.tsx exists
- ✅ ChatAssistant.tsx (features) exists
- ✅ App.tsx exists
- ✅ WorkflowsPage.tsx exists
- ✅ Theme wiring found somewhere