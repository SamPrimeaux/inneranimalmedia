/**
 * MonacoEditorView — Production-grade multi-workspace code editor
 *
 * Split pane:   data-editor-split="true" on wrapper → CSS grid handles layout
 * Diff view:    DiffEditor with original/modified, toggled via GitCompare button
 * CMS theming:  fetches /api/themes/active, live-updates on iam-cms-theme-changed
 * File routing: .glb/.gltf → GLBViewer, images → <img>, everything else → Monaco
 * Copy:         clipboard copy with Check confirmation (1.5s)
 * Git:          branch+hash refresh, sync proposal queue
 * Completions:  /api/monaco/complete AI suggestions
 * Workspace:    per-workspace accent color on tabs, split pane file picker
 * Shortcuts:    Cmd+S save, Cmd+I agent refactor, format-document event
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Editor, { DiffEditor, useMonaco } from '@monaco-editor/react';
import {
  Save,
  GitCompare,
  Copy,
  Check,
  FileCode2,
  GitBranch,
  X,
  SplitSquareHorizontal,
  AlignJustify,
  Map,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import type { ActiveFile } from '../types';
import { useEditor } from '../src/EditorContext';
import { GLBViewer } from './GLBViewer';

// ── Constants ─────────────────────────────────────────────────────────────────
const MONACO_THEME_ID     = 'iam-editor';
const API_THEME_ACTIVE    = '/api/themes/active';
const API_COMPLETIONS     = '/api/monaco/complete';
const API_GIT_STATUS      = '/api/agent/git/status';
const API_GIT_SYNC        = '/api/agent/git/sync';
const EVENT_THEME_CHANGED = 'iam-cms-theme-changed';
const EVENT_FORMAT        = 'iam-format-document';
const EVENT_REFACTOR      = 'iam:agent-refactor';
const GIT_HINT_TTL_MS     = 12_000;
const COPY_RESET_MS       = 1_500;

// Workspace accent colors — deterministically hashed from workspaceId
const WS_ACCENTS = [
  'var(--solar-cyan)',
  'var(--solar-blue)',
  'var(--solar-green)',
  'var(--solar-yellow)',
  'var(--solar-violet)',
  'var(--solar-magenta)',
  'var(--solar-orange)',
];

function wsAccent(workspaceId?: string): string {
  if (!workspaceId) return WS_ACCENTS[0];
  let h = 0;
  for (let i = 0; i < workspaceId.length; i++)
    h = (h * 31 + workspaceId.charCodeAt(i)) >>> 0;
  return WS_ACCENTS[h % WS_ACCENTS.length];
}

// ── File type detection ───────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico','.avif']);
const GLB_EXTS   = new Set(['.glb', '.gltf']);

function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}
const isImage = (n: string) => IMAGE_EXTS.has(fileExt(n));
const isGlb   = (n: string) => GLB_EXTS.has(fileExt(n));

// Always route through worker proxy — never direct public bucket URLs
function r2Url(file: ActiveFile): string {
  if (file.r2Key && file.r2Bucket)
    return `/api/r2/object?bucket=${encodeURIComponent(file.r2Bucket)}&key=${encodeURIComponent(file.r2Key)}`;
  return file.content;
}

// ── Language map ──────────────────────────────────────────────────────────────
const LANG_MAP: Record<string, string> = {
  ts:'typescript',  tsx:'typescript',
  js:'javascript',  jsx:'javascript',  mjs:'javascript', cjs:'javascript',
  json:'json',      jsonc:'json',
  css:'css',        scss:'scss',       less:'less',
  html:'html',      htm:'html',
  md:'markdown',    mdx:'markdown',
  py:'python',
  sh:'shell',       bash:'shell',      zsh:'shell',
  toml:'toml',      yaml:'yaml',       yml:'yaml',
  go:'go',          rs:'rust',
  sql:'sql',        pgsql:'sql',
  graphql:'graphql',gql:'graphql',
  env:'plaintext',  txt:'plaintext',   text:'plaintext',
  tf:'hcl',         xml:'xml',         wrangler:'toml',
};

function langFor(name: string): string {
  return LANG_MAP[fileExt(name).replace('.', '')] ?? 'plaintext';
}

// ── CMS theme types ───────────────────────────────────────────────────────────
interface CmsTheme {
  monaco_theme:      string;
  monaco_bg:         string;
  monaco_theme_data: string | null;
  config?: { cssVars?: Record<string, string> };
}

// ── Runtime font resolution ───────────────────────────────────────────────────
function resolveMonoFont(): string {
  if (typeof window === 'undefined') return '"JetBrains Mono", monospace';
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-mono').trim();
  return v || '"JetBrains Mono", "Fira Code", Menlo, monospace';
}

// ── Monaco color derivation from cms_themes ───────────────────────────────────
function hexAlpha(hex: string, aa: string, fb: string): string {
  return /^#[0-9a-fA-F]{6}$/i.test(hex.trim())
    ? `${hex.trim()}${aa}` : fb;
}
function strip(hex: string) { return hex.replace('#', ''); }

function colorsFromTheme(t: CmsTheme): Record<string, string> {
  const v   = t.config?.cssVars ?? {};
  const g   = (k: string, fb: string) => v[k] || fb;
  const bg  = t.monaco_bg;
  const pri = g('--color-primary',   '#2dd4bf');
  const fg  = g('--color-text',      '#9cb5bc');
  const bdr = g('--color-border',    '#1e3e4a');
  const mut = g('--text-muted',      '#4a7a87');
  const ok  = g('--accent-success',  '#a3b800');
  const err = g('--accent-danger',   '#e63333');
  const wrn = g('--accent-warning',  '#e6ac00');
  return {
    'editor.background':                   bg,
    'editor.foreground':                   fg,
    'editor.lineHighlightBackground':      hexAlpha(pri, '12', `${bg}cc`),
    'editorCursor.foreground':             pri,
    'editorWhitespace.foreground':         bdr,
    'editorIndentGuide.background1':       bdr,
    'editorIndentGuide.activeBackground1': pri,
    'editor.selectionBackground':          hexAlpha(pri, '30', `${pri}30`),
    'editorGutter.background':             bg,
    'editorLineNumber.foreground':         mut,
    'editorLineNumber.activeForeground':   pri,
    'scrollbarSlider.background':          hexAlpha(bdr, '80', `${bdr}80`),
    'scrollbarSlider.hoverBackground':     hexAlpha(pri, '40', `${pri}40`),
    'minimap.background':                  bg,
    'editorOverviewRuler.addedForeground':    ok,
    'editorOverviewRuler.deletedForeground':  err,
    'editorOverviewRuler.modifiedForeground': wrn,
    'diffEditor.insertedTextBackground':   hexAlpha(ok,  '20', 'rgba(163,184,0,0.12)'),
    'diffEditor.removedTextBackground':    hexAlpha(err, '20', 'rgba(230,51,51,0.12)'),
    'diffEditor.insertedLineBackground':   hexAlpha(ok,  '10', 'rgba(163,184,0,0.06)'),
    'diffEditor.removedLineBackground':    hexAlpha(err, '10', 'rgba(230,51,51,0.06)'),
  };
}

function rulesFromTheme(t: CmsTheme) {
  const v   = t.config?.cssVars ?? {};
  const g   = (k: string, fb: string) => v[k] || fb;
  const pri = strip(g('--color-primary',  '#2dd4bf'));
  const wrn = strip(g('--accent-warning', '#e6ac00'));
  const mut = strip(g('--text-muted',     '#4a7a87'));
  return [
    { token: 'comment',   foreground: mut,     fontStyle: 'italic' },
    { token: 'keyword',   foreground: pri                          },
    { token: 'string',    foreground: '2aa198'                     },
    { token: 'number',    foreground: 'd33682'                     },
    { token: 'type',      foreground: wrn                          },
    { token: 'operator',  foreground: '93a1a1'                     },
    { token: 'delimiter', foreground: '657b83'                     },
  ];
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type EditorModelMeta = {
  tabSize:      number;
  insertSpaces: boolean;
  eol:          'LF' | 'CRLF';
  encoding:     string;
};

interface MonacoEditorViewProps {
  fileData?:               ActiveFile | null;
  onSave?:                 (content: string) => void;
  onCursorPositionChange?: (line: number, column: number) => void;
  onEditorModelMeta?:      (meta: EditorModelMeta) => void;
}

interface TabEntry {
  id:           string;
  name:         string;
  isDirty?:     boolean;
  workspaceId?: string;
}

// ── Toolbar button ────────────────────────────────────────────────────────────
const TBtn: React.FC<{
  onClick:   () => void;
  active?:   boolean;
  title:     string;
  disabled?: boolean;
  children:  React.ReactNode;
}> = ({ onClick, active, title, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold
      transition-all disabled:opacity-30 disabled:cursor-not-allowed
      ${active
        ? 'bg-[var(--solar-cyan)] text-black'
        : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-subtle)]'
      }
    `}
  >
    {children}
  </button>
);

// ── Tab bar ───────────────────────────────────────────────────────────────────
const TabBar: React.FC<{
  tabs:         TabEntry[];
  activeTabId:  string | null;
  secondTabId?: string | null;
  splitActive?: boolean;
  onSelect:     (id: string) => void;
  onClose:      (id: string) => void;
  onSetSecond?: (id: string) => void;
}> = ({ tabs, activeTabId, secondTabId, splitActive, onSelect, onClose, onSetSecond }) => (
  <div className="h-9 flex items-center border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] shrink-0 overflow-x-auto no-scrollbar">
    {tabs.map((tab) => {
      const active = tab.id === activeTabId;
      const second = splitActive && tab.id === secondTabId && !active;
      const accent = wsAccent(tab.workspaceId);
      return (
        <div
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          onContextMenu={(e) => { e.preventDefault(); onSetSecond?.(tab.id); }}
          title={`${tab.name}${tab.workspaceId ? ` · ${tab.workspaceId}` : ''}${splitActive ? '\nRight-click → open in split pane' : ''}`}
          className={`
            relative flex items-center gap-1.5 px-3 h-full shrink-0
            border-r border-[var(--border-subtle)]
            cursor-pointer select-none transition-all group
            min-w-[100px] max-w-[180px]
            ${active
              ? 'bg-[var(--scene-bg)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-app)]'
            }
          `}
          style={active ? { color: accent } : undefined}
        >
          {/* Active underline — workspace accent color */}
          {active && (
            <span
              className="absolute bottom-0 left-0 right-0 h-[2px]"
              style={{ background: accent }}
            />
          )}
          {/* Workspace dot */}
          {tab.workspaceId && (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0 transition-opacity"
              style={{ background: accent, opacity: active ? 1 : 0.35 }}
            />
          )}
          <FileCode2 size={11} className="shrink-0 opacity-60" />
          <span className="text-[11px] font-[var(--font-mono)] truncate flex-1">{tab.name}</span>
          {tab.isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--solar-yellow)] shrink-0" title="Unsaved changes" />
          )}
          {second && (
            <span className="text-[8px] font-black uppercase tracking-wider text-[var(--solar-blue)] shrink-0 opacity-70">R</span>
          )}
          <X
            size={11}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-[var(--solar-red)] transition-all shrink-0"
            onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
          />
        </div>
      );
    })}
  </div>
);

// ── Split pane file picker ────────────────────────────────────────────────────
const SplitPicker: React.FC<{
  tabs:     TabEntry[];
  value:    string | null;
  onChange: (id: string) => void;
}> = ({ tabs, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const active = tabs.find(t => t.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-[var(--font-mono)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] transition-all max-w-[160px]"
      >
        <span className="truncate">{active?.name ?? 'Pick file…'}</span>
        <ChevronDown size={10} className="shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 w-60 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-2xl z-50 py-1 overflow-hidden animate-slide-up">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => { onChange(t.id); setOpen(false); }}
              className={`
                w-full text-left px-3 py-1.5 text-[11px] font-[var(--font-mono)]
                hover:bg-[var(--bg-hover)] transition-colors truncate
                ${t.id === value ? 'text-[var(--solar-cyan)]' : 'text-[var(--text-main)]'}
              `}
            >
              {t.name}
              {t.workspaceId && (
                <span className="ml-2 text-[9px] text-[var(--text-muted)] opacity-50">{t.workspaceId}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const MonacoEditorView: React.FC<MonacoEditorViewProps> = ({
  fileData,
  onSave,
  onCursorPositionChange,
  onEditorModelMeta,
}) => {
  const { tabs, activeTabId, setActiveTab, closeFile, updateActiveContent } = useEditor();

  // fileData prop overrides context when provided
  const activeFile: ActiveFile | null =
    fileData ?? (tabs.find(t => t.id === activeTabId) ?? null);
  const isDirty = activeFile?.isDirty ?? false;

  const monaco     = useMonaco();
  const editorRef  = useRef<Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0] | null>(null);
  const splitRef   = useRef<typeof editorRef.current>(null);
  const themeReady = useRef(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showDiff,    setShowDiff]    = useState(false);
  const [splitActive, setSplitActive] = useState(false);
  const [secondTabId, setSecondTabId] = useState<string | null>(null);
  const [minimapOn,   setMinimapOn]   = useState(true);
  const [wordWrap,    setWordWrap]    = useState<'off'|'on'>('off');
  const [copied,      setCopied]      = useState(false);
  const [gitHint,     setGitHint]     = useState<string | null>(null);
  const [gitLoading,  setGitLoading]  = useState(false);
  const [cmsTheme,    setCmsTheme]    = useState<CmsTheme | null>(null);
  const [monoFont,    setMonoFont]    = useState('"JetBrains Mono", monospace');

  const secondFile = tabs.find(t => t.id === secondTabId) ?? null;

  // ── Derived diff availability ─────────────────────────────────────────────
  const hasDiffData = Boolean(
    activeFile?.originalContent !== undefined &&
    activeFile.originalContent !== activeFile.content
  );

  // ── Font resolution ──────────────────────────────────────────────────────
  useEffect(() => { setMonoFont(resolveMonoFont()); }, []);

  // ── CMS theme ────────────────────────────────────────────────────────────
  const loadCmsTheme = useCallback(async () => {
    try {
      const res = await fetch(API_THEME_ACTIVE, { credentials: 'same-origin' });
      if (res.ok) setCmsTheme(await res.json() as CmsTheme);
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => {
    void loadCmsTheme();
    const h = () => void loadCmsTheme();
    window.addEventListener(EVENT_THEME_CHANGED, h);
    return () => window.removeEventListener(EVENT_THEME_CHANGED, h);
  }, [loadCmsTheme]);

  // ── Apply Monaco theme ────────────────────────────────────────────────────
  useEffect(() => {
    if (!monaco || !cmsTheme) return;
    if (cmsTheme.monaco_theme_data) {
      try {
        const full = JSON.parse(cmsTheme.monaco_theme_data) as Parameters<typeof monaco.editor.defineTheme>[1];
        monaco.editor.defineTheme(MONACO_THEME_ID, full);
        monaco.editor.setTheme(MONACO_THEME_ID);
        themeReady.current = true;
        return;
      } catch { /* fall through */ }
    }
    monaco.editor.defineTheme(MONACO_THEME_ID, {
      base:    (cmsTheme.monaco_theme === 'vs' ? 'vs' : 'vs-dark') as 'vs' | 'vs-dark',
      inherit: true,
      rules:   rulesFromTheme(cmsTheme),
      colors:  colorsFromTheme(cmsTheme),
    });
    monaco.editor.setTheme(MONACO_THEME_ID);
    themeReady.current = true;
  }, [monaco, cmsTheme]);

  // ── Model meta ───────────────────────────────────────────────────────────
  const pushModelMeta = useCallback((ed: typeof editorRef.current) => {
    if (!onEditorModelMeta || !ed) return;
    const m = ed.getModel();
    if (!m) return;
    const o = m.getOptions();
    onEditorModelMeta({
      tabSize:      o.tabSize,
      insertSpaces: o.insertSpaces,
      eol:          m.getEOL() === '\r\n' ? 'CRLF' : 'LF',
      encoding:     'UTF-8',
    });
  }, [onEditorModelMeta]);

  // ── Format document ──────────────────────────────────────────────────────
  useEffect(() => {
    const h = () => void editorRef.current?.getAction('editor.action.formatDocument')?.run();
    window.addEventListener(EVENT_FORMAT, h);
    return () => window.removeEventListener(EVENT_FORMAT, h);
  }, []);

  // ── Cmd+S ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (activeFile && onSave) onSave(activeFile.content);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [activeFile, onSave]);

  // ── Cmd+I → agent refactor ───────────────────────────────────────────────
  useEffect(() => {
    if (!monaco || !editorRef.current || !activeFile) return;
    const ed = editorRef.current;
    const d = ed.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI,
      () => {
        const sel  = ed.getSelection();
        if (!sel) return;
        const text = ed.getModel()?.getValueInRange(sel);
        if (!text) return;
        window.dispatchEvent(new CustomEvent(EVENT_REFACTOR, {
          detail: { selection: text, path: activeFile.id, content: activeFile.content },
        }));
      }
    );
    return () => d?.dispose();
  }, [monaco, activeFile]);

  // ── Reset diff when file changes ─────────────────────────────────────────
  useEffect(() => { setShowDiff(false); }, [activeFile?.name]);

  // ── Push meta on file switch ─────────────────────────────────────────────
  useEffect(() => { pushModelMeta(editorRef.current); }, [activeFile?.id, pushModelMeta]);

  // ── AI completions ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!monaco || !activeFile) return;
    const lang = langFor(activeFile.name);
    const d = monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.', '(', '[', '{', ' ', ':', '='],
      provideCompletionItems: async (model, position) => {
        const context = model.getValueInRange({
          startLineNumber: Math.max(1, position.lineNumber - 120),
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        }).slice(-4000);
        try {
          const res = await fetch(API_COMPLETIONS, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context, language: lang, mode: 'explain' }),
          });
          if (!res.ok) return { suggestions: [] };
          const j = (await res.json()) as { text?: string };
          const line = (j.text ?? '').trim().split('\n')[0] ?? '';
          if (!line) return { suggestions: [] };
          return {
            suggestions: [{
              label: line.length > 72 ? `${line.slice(0, 69)}…` : line,
              kind:  monaco.languages.CompletionItemKind.Text,
              insertText: line,
              range: {
                startLineNumber: position.lineNumber, startColumn: position.column,
                endLineNumber:   position.lineNumber, endColumn:   position.column,
              },
            }],
          };
        } catch { return { suggestions: [] }; }
      },
    });
    return () => d.dispose();
  }, [monaco, activeFile?.id]);

  // ── Clipboard copy ───────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!activeFile?.content) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_RESET_MS);
  }, [activeFile]);

  // ── Git status ───────────────────────────────────────────────────────────
  const refreshGitStatus = useCallback(async () => {
    setGitLoading(true);
    setGitHint(null);
    try {
      const res = await fetch(API_GIT_STATUS, { credentials: 'same-origin' });
      const j   = (await res.json().catch(() => ({}))) as { branch?: string; git_hash?: string | null; error?: string };
      setGitHint(
        res.ok && j.branch
          ? `${j.branch} @ ${(j.git_hash ?? '').slice(0, 7) || '—'}`
          : (j.error ?? `status ${res.status}`)
      );
    } catch (e) {
      setGitHint(e instanceof Error ? e.message : 'git status failed');
    } finally {
      setGitLoading(false);
      setTimeout(() => setGitHint(null), GIT_HINT_TTL_MS);
    }
  }, []);

  // ── Git sync proposal ────────────────────────────────────────────────────
  const requestGitSync = useCallback(async () => {
    setGitLoading(true);
    setGitHint(null);
    try {
      const res = await fetch(API_GIT_SYNC, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as { proposal_id?: string; error?: string };
      setGitHint(
        res.ok && j.proposal_id
          ? `Sync queued · ${j.proposal_id}`
          : (j.error ?? `sync failed ${res.status}`)
      );
    } catch (e) {
      setGitHint(e instanceof Error ? e.message : 'git sync failed');
    } finally {
      setGitLoading(false);
      setTimeout(() => setGitHint(null), GIT_HINT_TTL_MS);
    }
  }, []);

  // ── Editor options (built at render time so minimap/wordWrap are live) ───
  const editorOptions = {
    minimap:                    { enabled: minimapOn, renderCharacters: false, scale: 0.75 },
    fontSize:                   13,
    fontFamily:                 monoFont,
    fontLigatures:              true,
    lineHeight:                 22,
    padding:                    { top: 12 },
    scrollBeyondLastLine:       false,
    smoothScrolling:            true,
    cursorBlinking:             'smooth'  as const,
    cursorSmoothCaretAnimation: 'on'      as const,
    renderLineHighlight:        'gutter'  as const,
    bracketPairColorization:    { enabled: true },
    guides:                     { bracketPairs: true, indentation: true },
    wordWrap,
    tabSize:                    2,
    insertSpaces:               true,
    folding:                    true,
    suggest:                    { showSnippets: true },
    quickSuggestions:           { other: true, comments: true, strings: false },
    formatOnPaste:              true,
    formatOnType:               false,
  } as const;

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!activeFile) {
    return (
      <div className="flex-1 bg-[var(--scene-bg)] flex items-center justify-center select-none h-full">
        <div className="flex flex-col items-center gap-4 text-[var(--text-muted)] text-center px-8">
          <FileCode2 size={40} className="opacity-20" />
          <p className="text-[13px] font-medium">No files open</p>
          <p className="text-[11px] opacity-60 max-w-xs leading-relaxed">
            Open a file from the Explorer panel to begin. Multi-tab editing enabled.
          </p>
        </div>
      </div>
    );
  }

  // ── Single pane render ───────────────────────────────────────────────────
  function renderPane(file: ActiveFile, isPrimary: boolean) {
    if (isGlb(file.name)) {
      return <GLBViewer url={r2Url(file)} />;
    }
    if (isImage(file.name)) {
      return (
        <div className="flex-1 flex items-center justify-center overflow-auto p-6 bg-[var(--scene-bg)]">
          <img
            src={r2Url(file)}
            alt={file.name}
            className="max-w-full max-h-full object-contain rounded shadow-lg"
          />
        </div>
      );
    }
    const lang    = langFor(file.name);
    const hasDiff = isPrimary && showDiff && hasDiffData;
    if (hasDiff) {
      return (
        <DiffEditor
          height="100%"
          language={lang}
          theme={MONACO_THEME_ID}
          original={file.originalContent ?? ''}
          modified={file.content}
          options={{ ...editorOptions, readOnly: false }}
        />
      );
    }
    return (
      <Editor
        height="100%"
        language={lang}
        theme={MONACO_THEME_ID}
        value={file.content}
        onChange={isPrimary ? (v) => updateActiveContent(v ?? '') : undefined}
        onMount={(editor) => {
          if (isPrimary) {
            editorRef.current = editor;
            editor.onDidChangeCursorPosition(() => {
              const p = editor.getPosition();
              if (p) onCursorPositionChange?.(p.lineNumber, p.column);
            });
            pushModelMeta(editor);
          } else {
            (splitRef as React.MutableRefObject<typeof editor>).current = editor;
          }
        }}
        options={editorOptions}
      />
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full bg-[var(--scene-bg)] overflow-hidden">

      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        secondTabId={secondTabId}
        splitActive={splitActive}
        onSelect={setActiveTab}
        onClose={closeFile}
        onSetSecond={setSecondTabId}
      />

      {/* Toolbar */}
      <div className="h-8 flex items-center justify-between px-3 bg-[var(--scene-bg)] border-b border-[var(--border-subtle)] shrink-0 gap-2">
        {/* Left: language + git hint */}
        <div className="flex items-center gap-2 min-w-0 text-[10px] font-[var(--font-ui)] text-[var(--text-muted)]">
          <span className="uppercase tracking-widest font-bold shrink-0">
            {langFor(activeFile.name)}
          </span>
          <span className="opacity-40 shrink-0">UTF-8</span>
          {gitHint && (
            <span className="text-[var(--solar-cyan)] animate-pulse truncate">{gitHint}</span>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Git branch / status */}
          <TBtn onClick={() => void refreshGitStatus()} title="Show git branch + hash" disabled={gitLoading}>
            <GitBranch size={12} className={gitLoading ? 'animate-spin' : ''} />
          </TBtn>

          {/* Git sync proposal */}
          <TBtn onClick={() => void requestGitSync()} title="Queue git sync proposal" disabled={gitLoading}>
            <RefreshCw size={12} />
          </TBtn>

          {/* Copy file */}
          <TBtn onClick={handleCopy} title="Copy file contents to clipboard" disabled={!activeFile.content}>
            {copied
              ? <Check size={12} className="text-[var(--solar-green)]" />
              : <Copy size={12} />
            }
          </TBtn>

          {/* Word wrap */}
          <TBtn
            onClick={() => setWordWrap(v => v === 'off' ? 'on' : 'off')}
            active={wordWrap === 'on'}
            title="Toggle word wrap"
          >
            <AlignJustify size={12} />
          </TBtn>

          {/* Minimap */}
          <TBtn
            onClick={() => setMinimapOn(v => !v)}
            active={minimapOn}
            title="Toggle minimap"
          >
            <Map size={12} />
          </TBtn>

          {/* Diff — only enabled when there is original content to diff against */}
          <TBtn
            onClick={() => setShowDiff(v => !v)}
            active={showDiff}
            title={hasDiffData ? 'Toggle diff view' : 'No diff available — file has no saved original'}
            disabled={!hasDiffData}
          >
            <GitCompare size={12} />
            <span className="text-[9px]">Diff</span>
          </TBtn>

          {/* Split pane */}
          <TBtn
            onClick={() => {
              const next = !splitActive;
              setSplitActive(next);
              if (next && !secondTabId) {
                const other = tabs.find(t => t.id !== activeTabId);
                if (other) setSecondTabId(other.id);
              }
            }}
            active={splitActive}
            title="Toggle split pane · Right-click a tab to set right pane"
          >
            <SplitSquareHorizontal size={12} />
          </TBtn>

          {/* Save */}
          {isDirty && (
            <button
              type="button"
              onClick={() => onSave?.(activeFile.content)}
              className="flex items-center gap-1 px-2 py-0.5 bg-[var(--solar-cyan)] text-black rounded font-bold text-[10px] shadow-[0_0_8px_rgba(45,212,191,0.25)] hover:brightness-110 transition-all"
            >
              <Save size={11} /> Save
            </button>
          )}
        </div>
      </div>

      {/* Editor area
          data-editor-split="true" → CSS grid in index.css takes over:
            grid-template-columns: 1fr 1fr
            gap: 1px
            background: var(--border-subtle)   ← the 1px divider line
          When split is false the attribute is absent → normal flex-1 block layout */}
      <div
        data-editor-split={splitActive ? 'true' : undefined}
        className={`flex-1 overflow-hidden min-h-0 ${!splitActive ? 'flex flex-col' : ''}`}
      >
        {/* Primary pane */}
        <div className="overflow-hidden h-full flex flex-col bg-[var(--bg-app)]">
          {renderPane(activeFile, true)}
        </div>

        {/* Split pane — only rendered when split is active */}
        {splitActive && (
          <div className="overflow-hidden h-full flex flex-col bg-[var(--bg-app)]">
            {/* Split pane header */}
            <div className="h-7 flex items-center justify-between px-3 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/60 shrink-0">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">
                Split
              </span>
              <SplitPicker
                tabs={tabs}
                value={secondTabId}
                onChange={setSecondTabId}
              />
            </div>
            <div className="flex-1 overflow-hidden">
              {secondFile
                ? renderPane(secondFile, false)
                : (
                  <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                    <p className="text-[11px] opacity-60">
                      Right-click a tab or pick a file above
                    </p>
                  </div>
                )
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
