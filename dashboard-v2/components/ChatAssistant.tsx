
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Send,
  User,
  Bot,
  Loader2,
  ChevronRight,
  Paperclip,
  Image as ImageIconLucide,
  AtSign,
  Slash,
  FileText,
  FileCode,
  X,
  ChevronDown,
  ChevronLeft,
  MoreHorizontal,
  GitBranch,
  LayoutDashboard,
  Zap,
  ExternalLink,
  FolderGit2,
  PenTool,
  Bug,
  Target,
  Sparkles,
  Layers,
  Cpu
} from 'lucide-react';
import { ProjectType } from '../types';
import type { ActiveFile } from '../types';
import { IAM_AGENT_CHAT_CONVERSATION_CHANGE, LS_AGENT_CHAT_CONVERSATION_ID } from '../agentChatConstants';
import type { AgentSessionRow } from '../agentSessionsCatalog';

export { IAM_AGENT_CHAT_CONVERSATION_CHANGE } from '../agentChatConstants';

type MessageAttachmentPreview = {
  previewUrl: string | null;
  type: 'image' | 'file';
  name: string;
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Blob URLs kept after send so image previews stay visible in history (not revoked with composer clear). */
  attachmentPreviews?: MessageAttachmentPreview[];
}

interface ChatAssistantProps {
  activeProject: ProjectType;
  activeFileContent?: string;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onFileSelect?: (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile>) => void;
  onRunInTerminal?: (cmd: string) => void;
  activeFileName?: string;
  /** Full open-file metadata so @file / @monaco can include tool routing (r2_read, r2_write, github_file). */
  activeFile?: ActiveFile | null;
  /** Current editor cursor (for @monaco injection only). */
  editorCursorLine?: number;
  editorCursorColumn?: number;
  /** SSE: agent tool `r2_write` emits `r2_file_updated` for Monaco sync */
  onR2FileUpdated?: (event: { type: 'r2_file_updated'; bucket: string; key: string }) => void;
  /** SSE: `browser_navigate` opens the Browser tab (e.g. after HTML write or preview_in_browser) */
  onBrowserNavigate?: (event: { type: 'browser_navigate'; url: string }) => void;
  /** Dropped or attached .glb: parent uses a blob URL and should open the Voxel (engine) tab. */
  onGlbFileSelect?: (file: File) => void;
  /** Mobile: open GitHub repos panel (`actions` activity); optional repo to expand. */
  onOpenGitHubIntegration?: (opts?: { expandRepoFullName?: string }) => void;
  /** Mobile: leave full-screen chat and show the main editor / welcome workspace. */
  onMobileOpenDashboard?: () => void;
  /** Open the code editor tab from chat (e.g. mobile Context tab). */
  onOpenCodeTab?: () => void;
  /** Open the Search sidebar (knowledge + chat history). */
  onOpenChatHistory?: () => void;
}

type StagedAttachment = {
  id: string;
  file: File;
  type: 'image' | 'file';
  previewUrl: string | null;
};

type PickerItem = { id: string; label: string; kind: string };
type SlashCmd = { slug: string; description: string | null };

type ToolApprovalPayload = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  preview?: string;
};

type ChatModelRow = {
  id: string;
  name: string;
  provider: string;
  model_key: string;
  api_platform: string;
};

/** Matches App.tsx `buildAgentSamGreeting` — hide this bubble when no real thread content yet. */
function isAgentSamEmptyThreadGreeting(content: string): boolean {
  const t = content.trim();
  return t.startsWith("Hi! I'm Agent Sam.") || t.startsWith('Agent Sam: pick a workspace');
}

const MODEL_PLATFORM_ORDER = ['anthropic_api', 'gemini_api', 'vertex_ai', 'openai', 'workers_ai', 'cursor'] as const;
const MODEL_PLATFORM_LABEL: Record<string, string> = {
  anthropic_api: 'Anthropic',
  gemini_api: 'Google',
  openai: 'OpenAI',
  workers_ai: 'Workers AI',
  cursor: 'Cursor',
};

function formatFileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Portal menu position: clamp horizontal (16px inset), prefer above anchor, else below.
 * @param menuWidthForClamp — use for `left` clamp (e.g. slash menu max-w 320); defaults to minW.
 */
function measureAboveAnchor(
  el: HTMLElement | null,
  minW: number,
  maxHeightCap = 280,
  menuWidthForClamp?: number
): React.CSSProperties | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const gap = 8;
  const hPad = 16;
  const mw = menuWidthForClamp ?? minW;
  const maxMenuW = Math.max(160, window.innerWidth - 2 * hPad);
  const effClampW = Math.min(mw, maxMenuW);
  const effMinW = Math.min(minW, maxMenuW);
  const left = Math.max(hPad, Math.min(r.left, window.innerWidth - effClampW - hPad));

  const spaceAbove = Math.max(0, r.top - gap - 8);
  const spaceBelow = Math.max(0, window.innerHeight - r.bottom - gap - 8);
  const minMenu = 100;
  const placeAbove =
    spaceAbove >= minMenu ? true : spaceBelow > spaceAbove ? false : true;

  const sizeStyle: React.CSSProperties = {
    minWidth: effMinW,
    maxWidth: maxMenuW,
    boxSizing: 'border-box',
    overflowX: 'hidden',
  };

  if (placeAbove) {
    return {
      position: 'fixed',
      left,
      right: 'auto',
      bottom: window.innerHeight - r.top + gap,
      top: 'auto',
      zIndex: 9999,
      maxHeight: Math.min(maxHeightCap, Math.max(64, spaceAbove)),
      ...sizeStyle,
    };
  }

  return {
    position: 'fixed',
    left,
    right: 'auto',
    top: r.bottom + gap,
    bottom: 'auto',
    zIndex: 9999,
    maxHeight: Math.min(maxHeightCap, Math.max(64, spaceBelow)),
    ...sizeStyle,
  };
}

function extractSseAssistantDelta(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return '';
  const o = parsed as Record<string, unknown>;
  if (typeof o.text === 'string') return o.text;
  const choices = o.choices as Array<{ delta?: { content?: string } }> | undefined;
  if (Array.isArray(choices) && choices[0]?.delta?.content != null) {
    return String(choices[0].delta.content);
  }
  if (o.type === 'content_block_delta') {
    const delta = o.delta as Record<string, unknown> | undefined;
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') return delta.text;
  }
  const candidates = o.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  if (Array.isArray(candidates) && candidates[0]?.content?.parts) {
    return candidates[0].content.parts.map((p) => (p.text != null ? String(p.text) : '')).join('');
  }
  return '';
}

function isStreamErrorPayload(
  parsed: unknown
): parsed is { error: string; detail?: string; provider?: string; model?: string } {
  return !!(
    parsed &&
    typeof parsed === 'object' &&
    'error' in parsed &&
    typeof (parsed as { error: unknown }).error === 'string'
  );
}

/** Decode minimal XML entities inside `<parameter>` bodies from streamed tool XML. */
function decodeMonacoParameterText(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseMonacoInvokeParameterBlock(inner: string): Record<string, string> {
  const params: Record<string, string> = {};
  const paramRe = /<parameter\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/parameter>/gi;
  let m: RegExpExecArray | null;
  while ((m = paramRe.exec(inner)) !== null) {
    const k = m[1].trim().toLowerCase();
    params[k] = decodeMonacoParameterText(m[2].trim());
  }
  return params;
}

/**
 * Remove complete `<invoke name="...">...</invoke>` blocks (any tool name) from streamed assistant text.
 * For `name="monaco"`, parse filename/content and return files to open in the editor.
 * Handles both `<invoke>` / `<antml:invoke>` and matching closing tags (streamed model output varies).
 */
function extractMonacoInvokesFromBuffer(text: string): { text: string; files: Array<{ name: string; content: string }> } {
  const files: Array<{ name: string; content: string }> = [];
  let out = text;
  const blockRe = /<(?:antml:)?invoke\b([^>]*)>([\s\S]*?)<\/(?:antml:)?invoke>/i;
  for (let guard = 0; guard < 64; guard++) {
    const m = out.match(blockRe);
    if (!m || m.index === undefined) break;
    const attrs = m[1] || '';
    const inner = m[2] || '';
    const nameMatch = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i);
    const toolName = (nameMatch?.[1] || '').trim().toLowerCase();
    if (toolName === 'monaco') {
      const params = parseMonacoInvokeParameterBlock(inner);
      const nameRaw = params.filename || params.file || params.path || '';
      const filename = (nameRaw || 'snippet.txt').trim() || 'snippet.txt';
      const content = params.content ?? '';
      if (content.length > 0) {
        files.push({ name: filename, content });
      } else {
        console.warn('[ChatAssistant] monaco invoke skipped: missing or empty content parameter', {
          filename,
          paramKeys: Object.keys(params),
        });
      }
    }
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
  }
  const fcRe = /<function_calls\b[^>]*>[\s\S]*?<\/function_calls>/i;
  for (let guard = 0; guard < 64; guard++) {
    const m = out.match(fcRe);
    if (!m || m.index === undefined) break;
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
  }
  return { text: out, files };
}

/** While the model is still streaming tool XML, hide partial `<function_calls>` / `<invoke>` tails from the bubble. */
function hideIncompleteMonacoInvokeTail(text: string): string {
  let lastFc = -1;
  const fcOpenRe = /<function_calls\b/gi;
  let fm: RegExpExecArray | null;
  while ((fm = fcOpenRe.exec(text)) !== null) {
    lastFc = fm.index;
  }
  if (lastFc >= 0) {
    const tailFc = text.slice(lastFc);
    if (!/<\/function_calls>/i.test(tailFc)) {
      return text.slice(0, lastFc);
    }
  }
  const openRe = /<(?:antml:)?invoke\b[^>]*>/gi;
  let lastOpen = -1;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(text)) !== null) {
    lastOpen = m.index;
  }
  if (lastOpen < 0) return text;
  const tail = text.slice(lastOpen);
  if (/<\/(?:antml:)?invoke>/i.test(tail)) return text;
  return text.slice(0, lastOpen);
}

/** True when streamed text has clearly entered raw HTML/CSS/SVG body (before r2_file_updated). */
function looksLikeEmbeddedFileDumpStart(full: string): boolean {
  const tail = full.slice(-14000);
  if (/<!DOCTYPE\s+html/i.test(tail)) return true;
  if (/<\s*html[\s>]/i.test(tail)) return true;
  if (/<\s*head[\s>]/i.test(tail) && /<\s*body[\s>]/i.test(tail)) return true;
  if (/<\s*meta\s+[^>]*charset/i.test(tail)) return true;
  if (/<\s*style[\s>]/i.test(tail) && tail.includes('{') && tail.includes('}')) return true;
  if (/<svg[\s>]/i.test(tail) && tail.length > 400) return true;
  if (/^\s*@(?:charset|import|layer)\s+/im.test(tail.slice(-2500))) return true;
  const m = tail.match(/\{[^{}]*\}/g);
  if (m && m.length >= 18 && /[#.][a-zA-Z0-9_-]+\s*\{/.test(tail)) return true;
  return false;
}

function formatHttpErrorMessage(status: number, bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as { error?: string; detail?: string; status?: number; model?: string };
    const parts = [j.error, j.detail, j.model ? `model: ${j.model}` : '', status ? `HTTP ${status}` : ''].filter(
      Boolean
    );
    if (parts.length) return parts.join(' — ');
  } catch {
    /* use body */
  }
  return bodyText.trim() || `HTTP ${status}`;
}

const MENTION_CONTEXT_HEADER = '\n\n--- On-demand context (this message only) ---\n';
const MENTION_FILE_MAX_CHARS = 8000;
const MENTION_R2_LIST_MAX_ROWS = 250;
/** Worker request body cap (inform UI); combined files rejected above CHAT_ATTACH_MAX_TOTAL_BYTES in worker.js */
const CHAT_REQUEST_MAX_BYTES = 100 * 1024 * 1024;
const CHAT_ATTACH_MAX_TOTAL_BYTES = 90 * 1024 * 1024;

/**
 * App.tsx mobile shell: fixed tab bar z-[90] with `bottom: 1.5rem + safe-area` (~52px row) + status strip.
 * Chat panel is max-md:fixed z-[45], so the composer must pad above that stack or it sits underneath.
 */
const MOBILE_CHAT_COMPOSER_BOTTOM_PAD =
  'calc(56px + 1.5rem + env(safe-area-inset-bottom, 0px) + 24px)';

/** Mobile: keep composer short so flex-1 message list does not jump on every keystroke; scroll inside textarea instead. */
const COMPOSER_TEXTAREA_MAX_PX_NARROW = 104;
const COMPOSER_TEXTAREA_MAX_PX_WIDE = 200;

function syncComposerTextareaHeight(el: HTMLTextAreaElement | null, maxPx: number) {
  if (!el) return;
  el.style.height = 'auto';
  const sh = el.scrollHeight;
  el.style.height = `${Math.min(sh, maxPx)}px`;
  el.style.overflowY = sh > maxPx ? 'auto' : 'hidden';
}

function hasWordMention(text: string, tag: string): boolean {
  return new RegExp(`@${tag}\\b`).test(text);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mention picker inserts `@${label}` (e.g. `@cms.html`), not literal `@file` — match those too. */
function fileNameMentionedInMessage(userMessage: string, activeFileName?: string): boolean {
  if (!activeFileName?.trim()) return false;
  const t = activeFileName.trim();
  const variants = new Set<string>([t]);
  const base = t.includes('/') ? t.split('/').pop() || t : t;
  if (base && base !== t) variants.add(base);
  for (const v of variants) {
    const re = new RegExp(`@${escapeRegExp(v)}(?:\\s|$|[,;:!?])`);
    if (re.test(userMessage)) return true;
  }
  return false;
}

/** Path-like id for lightweight injection (no buffer), similar to Cursor open-file metadata. */
function getEditorLightweightPath(af: ActiveFile | null | undefined): string | null {
  if (!af) return null;
  if (af.workspacePath?.trim()) return af.workspacePath.trim();
  if (af.r2Key?.trim()) return `r2:${af.r2Bucket || 'DASHBOARD'}/${af.r2Key}`;
  if (af.githubRepo && af.githubPath) return `${af.githubRepo}/${af.githubPath}`;
  if (af.driveFileId?.trim()) return `drive:${af.driveFileId}`;
  return null;
}

/** Display path for always-on editor line (lightweight path, else filename). */
function getEditorDisplayPath(af: ActiveFile, activeFileName?: string): string {
  const light = getEditorLightweightPath(af);
  if (light) return light;
  if (af.name?.trim()) return af.name.trim();
  if (activeFileName?.trim()) return activeFileName.trim();
  return '(unnamed)';
}

function languageFromFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() || fileName;
  const ext = (base.includes('.') ? base.split('.').pop() : '')?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    mdx: 'mdx',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    svg: 'svg',
    py: 'python',
    rs: 'rust',
    go: 'go',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    xml: 'xml',
  };
  return map[ext] || (ext || 'text');
}

const CHAT_TEXT_CODE_EXT = new Set(['js', 'ts', 'tsx', 'jsx', 'css', 'html', 'htm', 'sql', 'md', 'json', 'py', 'sh']);

function isChatTextCodeFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return CHAT_TEXT_CODE_EXT.has(ext);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '');
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file);
  });
}

/**
 * Append @-mention snippets, always-on open-file buffer + tool routing when a file is open,
 * and optional R2/D1 context. @ tokens still gate @monaco list and @r2 bucket lists.
 */
async function buildMentionContext(
  userMessage: string,
  opts: {
    activeFileName?: string;
    activeFileContent?: string | null;
    activeFile?: ActiveFile | null;
    editorCursorLine?: number;
    editorCursorColumn?: number;
    /** Text/code attachments: same injection shape as @file for the active buffer. */
    attachContextFiles?: Array<{ name: string; content: string }>;
  }
): Promise<string> {
  const { activeFileName, activeFileContent, activeFile, editorCursorLine, editorCursorColumn, attachContextFiles } =
    opts;
  const parts: string[] = [];
  const injectFileSnippet =
    (hasWordMention(userMessage, 'file') || fileNameMentionedInMessage(userMessage, activeFileName)) &&
    activeFileContent != null &&
    activeFileContent !== '';

  if (injectFileSnippet) {
    parts.push(
      `### @file\n${activeFileName || 'untitled'}\n\n${activeFileContent.slice(0, MENTION_FILE_MAX_CHARS)}`
    );
  }

  if (attachContextFiles?.length) {
    for (const f of attachContextFiles) {
      parts.push(`### @${f.name}\n\n${f.content.slice(0, MENTION_FILE_MAX_CHARS)}`);
    }
  }

  if (hasWordMention(userMessage, 'monaco')) {
    const totalLines =
      activeFileContent != null && activeFileContent !== '' ? activeFileContent.split('\n').length : 0;
    const cl = editorCursorLine ?? 1;
    const cc = editorCursorColumn ?? 1;
    parts.push(
      `### @monaco\nFile: ${activeFileName || '(none)'}\nTotal lines: ${totalLines}\nCursor: line ${cl}, column ${cc}`
    );
  }

  if (activeFile) {
    parts.push(formatAgentToolRouting(activeFile));
  }

  const r2Re = /@r2:([^\s]+)/g;
  const seenBuckets = new Set<string>();
  const r2Buckets: string[] = [];
  let rm: RegExpExecArray | null;
  while ((rm = r2Re.exec(userMessage)) !== null) {
    const b = rm[1];
    if (b && !seenBuckets.has(b)) {
      seenBuckets.add(b);
      r2Buckets.push(b);
    }
  }
  for (const bucket of r2Buckets) {
    try {
      const res = await fetch(`/api/r2/list?${new URLSearchParams({ bucket, prefix: '' })}`, {
        credentials: 'same-origin',
      });
      const data = (await res.json()) as { objects?: Array<{ key?: string; size?: number }> };
      if (!res.ok) {
        parts.push(`### @r2:${bucket}\n(list failed: HTTP ${res.status})`);
        continue;
      }
      const objects = Array.isArray(data.objects) ? data.objects : [];
      const body = objects
        .slice(0, MENTION_R2_LIST_MAX_ROWS)
        .map((o) => `${o.key ?? ''}\t${String(o.size ?? '')}`)
        .join('\n');
      parts.push(`### @r2:${bucket}\n${body || '(empty)'}`);
    } catch (e) {
      parts.push(`### @r2:${bucket}\n(${String(e instanceof Error ? e.message : e)})`);
    }
  }

  if (hasWordMention(userMessage, 'd1')) {
    let d1 = '';
    try {
      d1 = sessionStorage.getItem('iam_d1_last_result') || '';
    } catch {
      /* sessionStorage unavailable */
    }
    parts.push(
      `### @d1\n${
        d1 ||
        '(No stored D1 result in this session. SQL explorer can set sessionStorage key iam_d1_last_result.)'
      }`
    );
  }

  if (activeFile && activeFileContent != null && activeFileContent !== '' && !injectFileSnippet) {
    parts.push(
      `### Open file (editor)\n${activeFileName || activeFile.name || 'untitled'}\n\n${activeFileContent.slice(0, MENTION_FILE_MAX_CHARS)}`
    );
  } else if (activeFile && !injectFileSnippet) {
    const path = getEditorDisplayPath(activeFile, activeFileName);
    const n =
      activeFileContent != null && activeFileContent !== '' ? activeFileContent.split('\n').length : 0;
    const lang = languageFromFileName(activeFile.name || activeFileName || '');
    parts.push(`### Editor context\nCurrently open: ${path} (${n} lines) [${lang}]`);
  }

  if (parts.length === 0) return userMessage;
  return `${userMessage}${MENTION_CONTEXT_HEADER}${parts.join('\n\n')}`;
}

/** Tells the model exactly which tools and parameters map to the open editor buffer (must match worker tool loop). */
function formatAgentToolRouting(activeFile: ActiveFile | null | undefined): string {
  const lines: string[] = [
    '### Agent tool targets (read/write this buffer)',
    'If the user asks to change, save, or sync this file, call the matching tool with the exact ids below — do not only paste code in chat when persistence is requested.',
  ];
  if (!activeFile) {
    lines.push(
      '- No file is open in the editor. Open a file from R2, GitHub, Drive, or the local folder, then use @file, @monaco, or @YourFileName (mention picker uses the file label).'
    );
    return lines.join('\n');
  }
  if (activeFile.r2Key) {
    const b = activeFile.r2Bucket || 'DASHBOARD';
    lines.push(
      `- R2: r2_read({ bucket: "${b}", key: "${activeFile.r2Key}" }) before large edits; r2_write({ bucket: "${b}", key: "${activeFile.r2Key}", body: <full file text>, content_type: as appropriate e.g. application/javascript, text/html }). To delete this object: r2_delete({ bucket: "${b}", key: "${activeFile.r2Key}" }) — destructive; ask mode may require user approval before execution. Bucket may be DASHBOARD (agent-sam) or logical names like agent-sam — both resolve. After r2_write the dashboard reloads this key.`
    );
  }
  if (activeFile.githubRepo && activeFile.githubPath) {
    lines.push(
      `- GitHub: github_file with repo="${activeFile.githubRepo}" path="${activeFile.githubPath}" for read. Commits may require a separate flow or user action if write is not available.`
    );
  }
  if (activeFile.driveFileId) {
    lines.push(
      `- Google Drive: use gdrive_fetch / gdrive_list with this file id where applicable: ${activeFile.driveFileId}`
    );
  }
  if (activeFile.handle) {
    lines.push(
      '- Local file (File System Access in the browser): the worker cannot write to this path directly. Use terminal_execute if the repo exists in the user PTY, or ask the user to save in the editor.'
    );
  }
  if (!activeFile.r2Key && !activeFile.githubPath && !activeFile.driveFileId && !activeFile.handle) {
    lines.push(
      '- New buffer with no storage binding. To persist, use r2_write with an explicit bucket and key the user names, or ask where to save.'
    );
  }
  return lines.join('\n');
}

const getLangMeta = (lang: string) => {
  const map: Record<string, { ext: string; icon: React.ReactNode }> = {
    tsx: { ext: 'tsx', icon: <FileCode size={15} /> },
    jsx: { ext: 'jsx', icon: <FileCode size={15} /> },
    ts: { ext: 'ts', icon: <FileCode size={15} /> },
    js: { ext: 'js', icon: <FileCode size={15} /> },
    css: { ext: 'css', icon: <FileText size={15} /> },
    html: { ext: 'html', icon: <FileText size={15} /> },
    json: { ext: 'json', icon: <FileText size={15} /> },
    py: { ext: 'py', icon: <FileText size={15} /> },
    sh: { ext: 'sh', icon: <FileText size={15} /> },
  };
  return map[lang] ?? { ext: lang || 'txt', icon: <FileText size={15} /> };
};

const LS_GH_REPO = 'iam-chat-github-repo-context';

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  activeProject,
  activeFileContent,
  activeFileName,
  activeFile,
  editorCursorLine,
  editorCursorColumn,
  messages,
  setMessages,
  onFileSelect,
  onRunInTerminal,
  onR2FileUpdated,
  onBrowserNavigate,
  onGlbFileSelect,
  onOpenGitHubIntegration,
  onMobileOpenDashboard,
  onOpenCodeTab,
  onOpenChatHistory,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachMenuStyle, setAttachMenuStyle] = useState<React.CSSProperties | null>(null);
  const [modeMenuStyle, setModeMenuStyle] = useState<React.CSSProperties | null>(null);

  const [modes, setModes] = useState<{ slug: string; label: string }[]>([]);
  const [mode, setMode] = useState<string>('agent');
  const [isModeOpen, setIsModeOpen] = useState(false);

  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const totalStagedBytes = useMemo(
    () => attachments.reduce((sum, a) => sum + (a.file.size || 0), 0),
    [attachments]
  );
  const [composerDragging, setComposerDragging] = useState(false);
  const composerDragDepthRef = useRef(0);
  const [conversationId, setConversationId] = useState<string>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID) || '' : ''
  );
  const [threadTitle, setThreadTitle] = useState<string>('');

  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  const [mobileHubTab, setMobileHubTab] = useState<'agents' | 'automations' | 'dashboard'>('agents');
  const [mobileThreadTab, setMobileThreadTab] = useState<'chat' | 'context'>('chat');
  const [repoDrawerOpen, setRepoDrawerOpen] = useState(false);
  const [ghRepos, setGhRepos] = useState<Array<{ id: string | number; full_name: string; name: string; default_branch?: string }>>(
    []
  );
  const [ghReposLoading, setGhReposLoading] = useState(false);
  const [ghReposAuthed, setGhReposAuthed] = useState(true);
  const [githubRepoContext, setGithubRepoContext] = useState<string | null>(() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(LS_GH_REPO) : null;
    } catch {
      return null;
    }
  });
  const [repoSearch, setRepoSearch] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const u = () => setIsNarrow(mq.matches);
    mq.addEventListener('change', u);
    return () => mq.removeEventListener('change', u);
  }, []);

  useEffect(() => {
    syncComposerTextareaHeight(
      textareaRef.current,
      isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
    );
  }, [isNarrow]);

  const loadGhRepos = useCallback(async () => {
    setGhReposLoading(true);
    try {
      const res = await fetch('/api/integrations/github/repos', { credentials: 'same-origin' });
      if (!res.ok) {
        setGhReposAuthed(false);
        setGhRepos([]);
        return;
      }
      setGhReposAuthed(true);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.repos || [];
      setGhRepos(Array.isArray(list) ? list : []);
    } catch {
      setGhReposAuthed(false);
      setGhRepos([]);
    } finally {
      setGhReposLoading(false);
    }
  }, []);

  useEffect(() => {
    if (repoDrawerOpen) void loadGhRepos();
  }, [repoDrawerOpen, loadGhRepos]);

  const [sessions, setSessions] = useState<AgentSessionRow[]>([]);
  const hydratedFromLsRef = useRef(false);

  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch('/api/agent/sessions', { credentials: 'same-origin' });
      const data = r.ok ? await r.json() : [];
      setSessions(Array.isArray(data) ? (data as AgentSessionRow[]) : []);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions, conversationId]);

  useEffect(() => {
    if (typeof window === 'undefined' || hydratedFromLsRef.current) return;
    hydratedFromLsRef.current = true;
    const id = localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID)?.trim();
    if (id) {
      queueMicrotask(() => {
        window.dispatchEvent(
          new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id } })
        );
      });
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setMobileThreadTab('chat');
    setThreadTitle('New Chat');
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
    setConversationId('');
    window.dispatchEvent(new CustomEvent(IAM_AGENT_CHAT_CONVERSATION_CHANGE, { detail: { id: null } }));
  }, []);

  useEffect(() => {
    const onExternal = (e: Event) => {
      const raw = (e as CustomEvent<{ id?: string | null }>).detail?.id;
      if (raw === null || raw === undefined) {
        setMobileThreadTab('chat');
        setThreadTitle('New Chat');
        if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_AGENT_CHAT_CONVERSATION_ID);
        setConversationId('');
        return;
      }
      if (typeof raw === 'string' && raw.trim()) {
        const id = raw.trim();
        setMobileThreadTab('chat');
        try {
          localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id);
        } catch {
          /* ignore */
        }
        setConversationId(id);
      }
    };
    window.addEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onExternal);
    
    const onExternalSend = (e: Event) => {
      const msg = (e as CustomEvent<{ message?: string }>).detail?.message;
      if (msg) handleSend(msg);
    };
    window.addEventListener('iam-agent-external-send', onExternalSend);

    return () => {
      window.removeEventListener(IAM_AGENT_CHAT_CONVERSATION_CHANGE, onExternal);
      window.removeEventListener('iam-agent-external-send', onExternalSend);
    };
  }, [handleSend]);

  const [pendingToolApproval, setPendingToolApproval] = useState<{
    tool: ToolApprovalPayload;
  } | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);

  const [chatModels, setChatModels] = useState<ChatModelRow[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState<string>('');

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionItems, setMentionItems] = useState<PickerItem[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStyle, setMentionStyle] = useState<React.CSSProperties | null>(null);
  const mentionQueryRef = useRef<{ start: number; end: number } | null>(null);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashItems, setSlashItems] = useState<SlashCmd[]>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashStyle, setSlashStyle] = useState<React.CSSProperties | null>(null);
  const slashQueryRef = useRef<{ start: number; end: number } | null>(null);

  const catalogCacheRef = useRef<{ at: number; items: PickerItem[] } | null>(null);
  const commandsCacheRef = useRef<{ at: number; items: SlashCmd[] } | null>(null);

  const measureAttachMenu = useCallback(() => {
    setAttachMenuStyle(measureAboveAnchor(attachButtonRef.current, 240, 420));
  }, []);

  const measureModeMenu = useCallback(() => {
    setModeMenuStyle(measureAboveAnchor(modeButtonRef.current, 120));
  }, []);

  useLayoutEffect(() => {
    if (!attachMenuOpen) {
      setAttachMenuStyle(null);
      return;
    }
    measureAttachMenu();
    const h = () => measureAttachMenu();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [attachMenuOpen, measureAttachMenu]);

  useLayoutEffect(() => {
    if (!isModeOpen) {
      setModeMenuStyle(null);
      return;
    }
    measureModeMenu();
    const h = () => measureModeMenu();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [isModeOpen, measureModeMenu]);

  useLayoutEffect(() => {
    if (!mentionOpen && !slashOpen) return;
    const clampW = slashOpen ? 320 : 280;
    const st = measureAboveAnchor(textareaRef.current, 220, 280, clampW);
    if (mentionOpen) setMentionStyle(st);
    if (slashOpen) setSlashStyle(st);
    const h = () => {
      const s = measureAboveAnchor(textareaRef.current, 220, 280, clampW);
      if (mentionOpen) setMentionStyle(s);
      if (slashOpen) setSlashStyle(s);
    };
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [mentionOpen, slashOpen, input]);

  useEffect(() => {
    fetch('/api/agent/modes')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setModes(data.map((row: { slug: string; label: string }) => ({ slug: row.slug, label: row.label })));
          const preferred = data.find((row: { slug: string }) => row.slug === 'agent' || row.slug === 'auto');
          setMode(preferred ? preferred.slug : data[0].slug);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/agent/models?show_in_picker=1')
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const rows = data as ChatModelRow[];
        setChatModels(rows);
        setSelectedModelKey((prev) => {
          if (prev && rows.some((m) => m.model_key === prev)) return prev;
          return rows[0]?.model_key || '';
        });
      })
      .catch(() => {});
  }, []);

  const modeLabel = modes.find((m) => m.slug === mode)?.label ?? mode;

  const selectedModelDisplayName = useMemo(() => {
    const row = chatModels.find((m) => m.model_key === selectedModelKey);
    return row?.name || selectedModelKey || 'No model';
  }, [chatModels, selectedModelKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('iam-chat-mode', { detail: { label: modeLabel, slug: mode } }));
  }, [modeLabel, mode]);

  async function loadCatalog(): Promise<PickerItem[]> {
    const now = Date.now();
    if (catalogCacheRef.current && now - catalogCacheRef.current.at < 60000) {
      return catalogCacheRef.current.items;
    }
    const res = await fetch('/api/agent/context-picker/catalog');
    if (!res.ok) return [];
    const data = await res.json();
    const items: PickerItem[] = [];
    (data.tables || []).forEach((t: string) => {
      items.push({ id: `table:${t}`, label: t, kind: 'table' });
    });
    (data.workflows || []).forEach((w: { id?: string; name?: string }) => {
      items.push({ id: `wf:${w.id}`, label: w.name || w.id || '', kind: 'workflow' });
    });
    (data.commands || []).forEach((c: { slug?: string; name?: string }) => {
      items.push({ id: `cmd:${c.slug}`, label: c.name || c.slug || '', kind: 'command' });
    });
    (data.memory_keys || []).forEach((k: string) => {
      items.push({ id: `mem:${k}`, label: k, kind: 'memory' });
    });
    (data.workspaces || []).forEach((w: { id?: string; name?: string }) => {
      items.push({ id: `ws:${w.id}`, label: w.name || w.id || '', kind: 'workspace' });
    });
    catalogCacheRef.current = { at: now, items };
    return items;
  }

  async function loadCommands(): Promise<SlashCmd[]> {
    const now = Date.now();
    if (commandsCacheRef.current && now - commandsCacheRef.current.at < 60000) {
      return commandsCacheRef.current.items;
    }
    const res = await fetch('/api/agent/commands');
    if (!res.ok) return [];
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];
    const items = arr.map((r: { slug: string; description?: string }) => ({
      slug: r.slug,
      description: r.description ?? null,
    }));
    commandsCacheRef.current = { at: now, items };
    return items;
  }

  const syncPickers = useCallback(
    async (value: string, cursor: number) => {
      const before = value.slice(0, cursor);
      const atMatch = before.match(/@([^\s@]*)$/);
      if (atMatch) {
        const q = atMatch[1];
        const start = cursor - atMatch[0].length;
        mentionQueryRef.current = { start, end: cursor };
        const all = await loadCatalog();
        const f = all.filter((it) => it.label.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
        setMentionItems(f);
        setMentionIndex(0);
        setMentionOpen(f.length > 0);
        setSlashOpen(false);
        return;
      }
      setMentionOpen(false);
      mentionQueryRef.current = null;

      const slashMatch = before.match(/(?:^|\s)(\/[\w-]*)$/);
      if (slashMatch) {
        const full = slashMatch[1];
        const q = full.slice(1);
        const start = cursor - full.length;
        slashQueryRef.current = { start, end: cursor };
        const all = await loadCommands();
        const f = all
          .filter((c) => c.slug.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 40);
        setSlashItems(f);
        setSlashIndex(0);
        setSlashOpen(f.length > 0);
        return;
      }
      setSlashOpen(false);
      slashQueryRef.current = null;
    },
    []
  );

  const displayMessages = useMemo(() => messages, [messages]);

  const showEmptyThreadPlaceholder = useMemo(() => {
    if (displayMessages.length === 0) return true;
    return displayMessages.every(
      (m) => m.role === 'assistant' && isAgentSamEmptyThreadGreeting(m.content)
    );
  }, [displayMessages]);

  useEffect(() => {
    if (!conversationId.trim()) return;
    const row = sessions.find((s) => s.id === conversationId);
    const n = row?.name && String(row.name).replace(/\s+/g, ' ').trim();
    if (n) setThreadTitle(n);
  }, [conversationId, sessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayMessages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInput(v);
    const el = e.target;
    const maxPx = isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE;
    syncComposerTextareaHeight(el, maxPx);
    syncPickers(v, el.selectionStart);
  };

  const addFilesFromList = (list: FileList | null, asImage: boolean) => {
    if (!list?.length) return;
    Array.from(list).forEach((file) => {
      const id = crypto.randomUUID();
      const isImg = asImage || file.type.startsWith('image/');
      const previewUrl = isImg ? URL.createObjectURL(file) : null;
      setAttachments((prev) => [
        ...prev,
        { id, file, type: isImg ? 'image' : 'file', previewUrl },
      ]);
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const a = prev.find((x) => x.id === id);
      if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  /** Clears the composer only. Do not revoke blob URLs here — after send they are kept on the user message (`attachmentPreviews`) for history thumbnails. */
  const clearAttachments = () => {
    setAttachments([]);
  };

  const insertAtCursor = (newValue: string, selStart: number, selEnd: number) => {
    setInput(newValue);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(selStart, selEnd);
        syncComposerTextareaHeight(
          el,
          isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
        );
      }
    });
  };

  const applyMention = (item: PickerItem) => {
    const el = textareaRef.current;
    const q = mentionQueryRef.current;
    if (!el || !q) return;
    const v = input;
    const before = v.slice(0, q.start);
    const after = v.slice(q.end);
    const insert = `@${item.label} `;
    const next = before + insert + after;
    const pos = before.length + insert.length;
    setMentionOpen(false);
    mentionQueryRef.current = null;
    insertAtCursor(next, pos, pos);
  };

  const applySlash = (cmd: SlashCmd) => {
    const el = textareaRef.current;
    const q = slashQueryRef.current;
    if (!el || !q) return;
    const v = input;
    const before = v.slice(0, q.start);
    const after = v.slice(q.end);
    const insert = `/${cmd.slug} `;
    const next = before + insert + after;
    const pos = before.length + insert.length;
    setSlashOpen(false);
    slashQueryRef.current = null;
    insertAtCursor(next, pos, pos);
  };

  const stripEmptyAssistantTail = useCallback((prev: Message[]) => {
    const next = [...prev];
    const last = next[next.length - 1];
    if (last?.role === 'assistant' && last.content === '') next.pop();
    return next;
  }, []);

  const handleApprovePendingTool = useCallback(async () => {
    if (!pendingToolApproval) return;
    const { tool } = pendingToolApproval;
    setApprovalBusy(true);
    try {
      const res = await fetch('/api/agent/chat/execute-approved-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: tool.name,
          tool_input: tool.parameters ?? {},
          conversation_id: conversationId || undefined,
        }),
      });
      const j = (await res.json()) as { success?: boolean; error?: string; result?: unknown };
      setPendingToolApproval(null);
      const resultStr =
        typeof j.result === 'string' ? j.result : JSON.stringify(j.result ?? null, null, 2);
      const suffix = j.success
        ? `\n\n---\nTool **${tool.name}** completed.\n\`\`\`\n${resultStr.slice(0, 12000)}\n\`\`\``
        : `\n\n---\nTool **${tool.name}** failed: ${j.error ?? 'unknown error'}`;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: last.content + suffix };
        }
        return next;
      });
    } catch (e) {
      console.error('[ChatAssistant] execute-approved-tool', e);
      setPendingToolApproval(null);
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: `${last.content}\n\n[Approve request failed: ${msg}]` };
        }
        return next;
      });
    } finally {
      setApprovalBusy(false);
    }
  }, [pendingToolApproval, conversationId, setMessages]);

  const handleDenyPendingTool = useCallback(() => {
    setPendingToolApproval(null);
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === 'assistant') {
        next[next.length - 1] = { ...last, content: `${last.content}\n\n[Tool execution cancelled.]` };
      }
      return next;
    });
  }, [setMessages]);

  const handleSend = async (overrideMessage?: string) => {
    const text = overrideMessage ?? input;
    if ((!text && attachments.length === 0) || (isLoading && !overrideMessage) || !selectedModelKey) return;
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    if (totalStagedBytes > CHAT_ATTACH_MAX_TOTAL_BYTES) return;

    const userMessage = text || '(attachment)';
    setPendingToolApproval(null);
    setInput('');
    requestAnimationFrame(() => {
      syncComposerTextareaHeight(
        textareaRef.current,
        isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
      );
    });
    const attachmentPreviews: MessageAttachmentPreview[] = attachments.map((a) => ({
      previewUrl: a.previewUrl,
      type: a.type,
      name: a.file.name,
    }));
    const newMessages: Message[] = [
      ...messages,
      {
        role: 'user',
        content: userMessage,
        ...(attachmentPreviews.length ? { attachmentPreviews } : {}),
      },
    ];
    setMessages(newMessages);
    setIsLoading(true);
    setMentionOpen(false);
    setSlashOpen(false);

    const attachContextFiles: Array<{ name: string; content: string }> = [];
    for (const a of attachments) {
      if (a.type !== 'file') continue;
      const lower = a.file.name.toLowerCase();
      if (lower.endsWith('.glb')) {
        onGlbFileSelect?.(a.file);
        continue;
      }
      if (isChatTextCodeFile(a.file)) {
        try {
          const text = await readFileAsText(a.file);
          onFileSelect?.({ name: a.file.name, content: text, originalContent: text });
          attachContextFiles.push({ name: a.file.name, content: text });
        } catch {
          /* skip unreadable */
        }
      }
    }

    const skipMentionContext =
      userMessage.startsWith('/run ') || userMessage.startsWith('/claude ');
    let messageForApi = skipMentionContext
      ? userMessage
      : await buildMentionContext(userMessage, {
          activeFileName,
          activeFileContent: activeFileContent ?? null,
          activeFile: activeFile ?? null,
          editorCursorLine,
          editorCursorColumn,
          attachContextFiles: attachContextFiles.length ? attachContextFiles : undefined,
        });
    const ghCtx = githubRepoContext?.trim();
    if (ghCtx) {
      messageForApi += `${MENTION_CONTEXT_HEADER}### Selected GitHub repository\nThe user chose **${ghCtx}** as the active repo in the dashboard. Prefer \`github_file\` with repo="${ghCtx}" when reading files, and direct them to the Deploy/GitHub panel to browse or open files.`;
    }

    const effectiveConvId = conversationId || (() => { const id = crypto.randomUUID(); setConversationId(id); try { localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, id); } catch (_) {} return id; })();
    const form = new FormData();
    form.append('message', messageForApi);
    form.append('mode', mode);
    form.append('model', selectedModelKey);
    form.append('conversationId', effectiveConvId);
    form.append('contextMode', String(activeProject));
    attachments.forEach((a) => form.append('files', a.file));

    const applyAssistantError = (msg: string) => {
      setMessages((prev) => [...stripEmptyAssistantTail(prev), { role: 'assistant', content: msg }]);
    };

    try {
      const response = await fetch('/api/agent/chat', { method: 'POST', body: form });

      if (!response.ok) {
        const errText = await response.text();
        applyAssistantError(formatHttpErrorMessage(response.status, errText));
        return;
      }
      if (!response.body) {
        applyAssistantError('Empty response body from chat endpoint');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let assistantStreamBuf = '';
      let sseCarry = '';
      let fileEchoSuppress = false;

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseCarry += decoder.decode(value, { stream: true });
        const parts = sseCarry.split('\n\n');
        sseCarry = parts.pop() || '';

        for (const block of parts) {
          for (const rawLine of block.split('\n')) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const dataStr = line.slice(5).trim();
            if (dataStr === '[DONE]') continue;
            let data: unknown;
            try {
              data = JSON.parse(dataStr);
            } catch {
              continue;
            }
            if (isStreamErrorPayload(data)) {
              const partsErr = [data.error, data.detail, data.provider, data.model].filter(Boolean);
              throw new Error(partsErr.join(' — '));
            }
            if (
              data &&
              typeof data === 'object' &&
              (data as { type?: string }).type === 'tool_approval_request'
            ) {
              const t = data as { type: string; tool?: ToolApprovalPayload };
              if (t.tool && typeof t.tool.name === 'string') {
                setPendingToolApproval({ tool: t.tool });
                setIsLoading(false);
        abortControllerRef.current = null;
        if (messageQueue.length > 0) {
          const next = messageQueue[0];
          setMessageQueue((prev) => prev.slice(1));
          handleSend(next);
        }
              }
              continue;
            }
            if (
              data &&
              typeof data === 'object' &&
              (data as { type?: string }).type === 'r2_file_updated' &&
              typeof (data as { bucket?: string }).bucket === 'string' &&
              typeof (data as { key?: string }).key === 'string'
            ) {
              const r2evt = data as { type: 'r2_file_updated'; bucket: string; key: string };
              onR2FileUpdated?.(r2evt);
              fileEchoSuppress = false;
              assistantStreamBuf += `\n[FILE_CREATED:${r2evt.key}]\n`;
              assistantContent = assistantStreamBuf;
              setMessages((prev) => {
                const last = [...prev];
                last[last.length - 1] = { role: 'assistant', content: assistantContent };
                return last;
              });
              continue;
            }
            if (
              data &&
              typeof data === 'object' &&
              (data as { type?: string }).type === 'browser_navigate' &&
              typeof (data as { url?: string }).url === 'string'
            ) {
              onBrowserNavigate?.(data as { type: 'browser_navigate'; url: string });
            }
            if (data && typeof data === 'object' && 'conversation_id' in data) {
              const cid = (data as { conversation_id?: string }).conversation_id;
              if (typeof cid === 'string' && cid) {
                setConversationId(cid);
                localStorage.setItem(LS_AGENT_CHAT_CONVERSATION_ID, cid);
                void loadSessions();
              }
            }
            const delta = extractSseAssistantDelta(data);
            if (delta && !fileEchoSuppress) {
              const trialBuf = assistantStreamBuf + delta;
              const extracted = extractMonacoInvokesFromBuffer(trialBuf);
              const nextBuf = extracted.text;
              const nextVisible = hideIncompleteMonacoInvokeTail(nextBuf);
              if (looksLikeEmbeddedFileDumpStart(nextVisible)) {
                fileEchoSuppress = true;
              } else {
                assistantStreamBuf = nextBuf;
                for (const f of extracted.files) {
                  try {
                    onFileSelect?.({ name: f.name, content: f.content, originalContent: '' });
                  } catch (e) {
                    console.warn('[ChatAssistant] onFileSelect failed for monaco invoke', e);
                  }
                }
                assistantContent = nextVisible;
                setMessages((prev) => {
                  const last = [...prev];
                  last[last.length - 1] = { role: 'assistant', content: assistantContent };
                  return last;
                });
              }
            }
            if (data && typeof data === 'object' && typeof (data as { text?: string }).text === 'string') {
              const legacy = (data as { text: string }).text;
              if (legacy && !delta && !fileEchoSuppress) {
                const trialBuf = assistantStreamBuf + legacy;
                const extracted = extractMonacoInvokesFromBuffer(trialBuf);
                const nextBuf = extracted.text;
                const nextVisible = hideIncompleteMonacoInvokeTail(nextBuf);
                if (looksLikeEmbeddedFileDumpStart(nextVisible)) {
                  fileEchoSuppress = true;
                } else {
                  assistantStreamBuf = nextBuf;
                  for (const f of extracted.files) {
                    try {
                      onFileSelect?.({ name: f.name, content: f.content, originalContent: '' });
                    } catch (e) {
                      console.warn('[ChatAssistant] onFileSelect failed for monaco invoke', e);
                    }
                  }
                  assistantContent = nextVisible;
                  setMessages((prev) => {
                    const last = [...prev];
                    last[last.length - 1] = { role: 'assistant', content: assistantContent };
                    return last;
                  });
                }
              }
            }
          }
        }
      }

      const codeBlockRegex2 = /```(\w+)?\n([\s\S]*?)\n```/g;
      let firstMatch = codeBlockRegex2.exec(assistantContent);
      if (firstMatch) {
        const lang = firstMatch[1] || 'txt';
        const code = firstMatch[2];
        const isShell = ['sh', 'bash', 'zsh', 'shell'].includes(lang);
        if (!isShell && (code.split('\n').length > 5 || code.length > 200) && onFileSelect) {
          const { ext } = getLangMeta(lang);
          onFileSelect({ name: `agent_output.${ext}`, content: code });
        }
      }
    } catch (error) {
      console.error('Chat request failed:', error);
      const msg = error instanceof Error ? error.message : String(error);
      setMessages((prev) => [...stripEmptyAssistantTail(prev), { role: 'assistant', content: msg }]);
    } finally {
      setIsLoading(false);
      clearAttachments();
      abortControllerRef.current = null;
      if (messageQueue.length > 0) {
        const next = messageQueue[0];
        setMessageQueue((prev) => prev.slice(1));
        void handleSend(next);
      }
    }
  };

  const renderMessageContent = (content: string, msgIndex: number) => {
    let display = content
      .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '')
      .replace(/<antml:invoke[\s\S]*?<\/antml:invoke>/gi, '')
      .replace(/<invoke[\s\S]*?<\/antml:invoke>/gi, '')
      .replace(/<invoke[\s\S]*?<\/invoke>/gi, '')
      .trim();
    display = display.replace(
      /\[FILE_CREATED:(.+?)\]/g,
      (_, key: string) => `Created ${key} — opened in editor`
    );

    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let codeCount = 0;

    while ((match = codeBlockRegex.exec(display)) !== null) {
      if (match.index > lastIndex) {
        const text = display.substring(lastIndex, match.index);
        parts.push(
          <span
            key={`text-${lastIndex}`}
            className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full"
          >
            {text}
          </span>,
        );
      }

      const lang = match[1] || 'text';
      const code = match[2];
      const { ext, icon } = getLangMeta(lang);
      const isShell = ['sh', 'bash', 'zsh', 'shell'].includes(lang);
      codeCount++;

      if (code.split('\n').length > 5 || code.length > 200) {
        if (isShell) {
          parts.push(
            <div
              key={`code-${match.index}`}
              className="my-3 p-3 bg-[var(--scene-bg)] border border-[var(--border-subtle)] rounded-xl group hover:border-[var(--solar-green)]/50 transition-all max-w-full min-w-0"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg flex items-center justify-center text-[var(--solar-green)]">
                  <span className="text-[0.6875rem] font-bold font-mono">$_</span>
                </div>
                <div>
                  <span className="text-[0.75rem] font-bold text-[var(--text-heading)] tracking-tight">Shell Script</span>
                  <span className="text-[0.625rem] text-[var(--text-muted)] ml-2">
                    {code.split('\n').length} lines · {lang}
                  </span>
                </div>
              </div>
              <pre className="text-[0.6875rem] font-mono text-[var(--solar-green)] bg-[var(--bg-code-pre)] rounded-lg p-3 overflow-x-auto overflow-y-hidden whitespace-pre border border-[var(--border-subtle)] max-w-full min-w-0">
                {code}
              </pre>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => onRunInTerminal?.(code)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--solar-green)]/10 hover:bg-[var(--solar-green)]/20 border border-[var(--solar-green)]/30 text-[var(--solar-green)] rounded-lg text-[0.6875rem] font-bold transition-colors"
                >
                  <span className="font-mono">$</span> Run in Terminal
                </button>
                <button
                  type="button"
                  onClick={() => onFileSelect?.({ name: `script_${msgIndex}_${codeCount}.${ext}`, content: code })}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/40 text-[var(--text-muted)] hover:text-[var(--solar-cyan)] rounded-lg text-[0.6875rem] transition-colors"
                >
                  Open in Monaco
                </button>
              </div>
            </div>
          );
        } else {
          parts.push(
            <div
              key={`code-${match.index}`}
              className="my-3 p-3 bg-[var(--scene-bg)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between group hover:border-[var(--solar-cyan)] transition-all cursor-pointer shadow-inner max-w-full min-w-0"
              onClick={() => onFileSelect?.({ name: `agent_output_${msgIndex}_${codeCount}.${ext}`, content: code })}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg flex items-center justify-center text-[var(--solar-cyan)]">
                  {icon}
                </div>
                <div className="flex flex-col">
                  <span className="text-[0.75rem] font-bold text-[var(--text-heading)] tracking-tight">agent_output.{ext}</span>
                  <span className="text-[0.625rem] text-[var(--text-muted)] mt-0.5">
                    {code.split('\n').length} lines · {lang}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.625rem] text-[var(--solar-cyan)] opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase tracking-wider">
                  Open in Monaco
                </span>
                <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors" />
              </div>
            </div>
          );
        }
      } else {
        parts.push(
          <pre
            key={`code-${match.index}`}
            className="my-2 p-3 bg-[var(--scene-bg)] rounded-lg border border-[var(--border-subtle)] overflow-x-auto max-w-full min-w-0 text-[0.75rem] font-mono whitespace-pre text-[var(--solar-cyan)]"
          >
            <code>{code}</code>
          </pre>
        );
      }

      lastIndex = codeBlockRegex.lastIndex;
    }

    if (lastIndex < display.length) {
      parts.push(
        <span key="text-end" className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">
          {display.substring(lastIndex)}
        </span>,
      );
    }

    return parts.length > 0 ? (
      <>{parts}</>
    ) : (
      <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">{display}</span>
    );
  };

  const canSend =
    !!selectedModelKey &&
    (input.trim().length > 0 || attachments.length > 0) &&
    !isLoading &&
    totalStagedBytes <= CHAT_ATTACH_MAX_TOTAL_BYTES;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionItems.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applyMention(mentionItems[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (slashOpen && slashItems.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, slashItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applySlash(slashItems[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isLoading) {
        setMessageQueue((prev) => [...prev, input]);
        setInput('');
      } else {
        handleSend();
      }
    }
  };

  const mobileAgentsThread = isNarrow && mobileHubTab === 'agents';
  const hubBodyVisible = isNarrow && mobileHubTab !== 'agents';
  const messagesVisible =
    !isNarrow || (mobileHubTab === 'agents' && mobileThreadTab === 'chat');
  const contextTabVisible =
    isNarrow && mobileHubTab === 'agents' && mobileThreadTab === 'context';
  const composerVisible =
    !isNarrow || (mobileHubTab === 'agents' && mobileThreadTab === 'chat');
  const composerFlexOrder = 'order-5';

  const filteredGhRepos = useMemo(() => {
    const q = repoSearch.trim().toLowerCase();
    if (!q) return ghRepos;
    return ghRepos.filter((r) => (r.full_name || '').toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q));
  }, [ghRepos, repoSearch]);

  return (
    <>
      <div className="flex flex-col h-full min-h-0 max-w-[100vw] overflow-x-hidden overflow-y-hidden bg-[var(--bg-panel)] w-full min-w-0">
        <style>{`
        .agent-content strong { color: var(--solar-cyan); font-weight: 700; }
        .agent-content h1, .agent-content h2, .agent-content h3 { color: var(--text-heading); font-weight: 700; margin-bottom: 0.75rem; }
        .agent-content ul, .agent-content ol { padding-left: 1.5rem; margin-bottom: 1rem; }
        .agent-content li { margin-bottom: 0.4rem; }
        .agent-content p + p { margin-top: 0.75rem; }
        .agent-content pre, .agent-content code { max-width: 100%; }
        .chat-hide-scroll::-webkit-scrollbar { display: none; }
      `}</style>

        {isNarrow && (
          <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-panel)] z-10">
            <img
              src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail"
              alt=""
              className="w-6 h-6 rounded object-cover shrink-0"
            />
            <nav className="flex items-center justify-center gap-2 sm:gap-3 min-w-0 max-w-full overflow-x-auto chat-hide-scroll [scrollbar-width:none]">
              {(['agents', 'automations', 'dashboard'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setMobileHubTab(tab)}
                  className={`shrink-0 text-[13px] font-medium transition-colors whitespace-nowrap ${
                    mobileHubTab === tab ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {tab === 'agents' ? 'Agents' : tab === 'automations' ? 'Automations' : 'Dashboard'}
                </button>
              ))}
            </nav>
            <div
              className="w-7 h-7 rounded-full bg-[var(--bg-hover)] border border-[var(--border-subtle)] flex items-center justify-center text-[9px] text-[var(--text-muted)] shrink-0"
              aria-hidden
            >
              ·
            </div>
          </header>
        )}

        {isNarrow && mobileAgentsThread && (
          <div className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] z-10">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  onOpenChatHistory?.();
                  setMobileThreadTab('chat');
                }}
                className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                aria-label="Open chat history"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="flex-1 text-[14px] font-semibold text-[var(--text-main)] truncate">{threadTitle}</span>
              <button
                type="button"
                onClick={handleNewChat}
                className="shrink-0 text-[0.625rem] font-semibold uppercase tracking-wide text-[var(--solar-cyan)] px-2 py-1 rounded-md hover:bg-[var(--bg-hover)]"
              >
                New
              </button>
              <button
                type="button"
                className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                aria-label="More options"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
            <div className="flex gap-2 px-3 pb-2">
              <button
                type="button"
                onClick={() => setMobileThreadTab('chat')}
                className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                  mobileThreadTab === 'chat'
                    ? 'bg-[var(--scene-bg)] text-[var(--text-main)] border border-[var(--border-subtle)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setMobileThreadTab('context')}
                className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                  mobileThreadTab === 'context'
                    ? 'bg-[var(--scene-bg)] text-[var(--text-main)] border border-[var(--border-subtle)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Context
              </button>
            </div>
          </div>
        )}

        {!isNarrow && (
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] shrink-0">
              Agent Sam
            </span>
            <span className="flex-1 text-[13px] font-semibold text-[var(--text-main)] truncate min-w-0">
              {threadTitle || 'Chat'}
            </span>
            {onOpenChatHistory && (
              <button
                type="button"
                onClick={() => onOpenChatHistory()}
                className="shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)] hover:text-[var(--solar-cyan)] px-2 py-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
              >
                Chats
              </button>
            )}
            <button
              type="button"
              onClick={handleNewChat}
              className="shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--solar-cyan)] hover:brightness-110 px-2 py-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors"
            >
              New chat
            </button>
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-[var(--text-muted)]"
              aria-label="More options"
            >
              <MoreHorizontal size={15} />
            </button>
          </div>
        )}

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {hubBodyVisible && (
          <div className="order-1 flex-1 min-h-0 overflow-y-auto chat-hide-scroll px-4 py-4 space-y-4">
            {mobileHubTab === 'automations' ? (
              <>
                <h2 className="text-[16px] font-semibold text-[var(--text-heading)]">Automations and GitHub</h2>
                <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                  Open the full GitHub repository browser (same as the Deploy tab) to work in any connected repo, browse
                  files, and open them in the editor.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenGitHubIntegration?.()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--scene-bg)] text-[13px] font-medium text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
                >
                  <FolderGit2 size={18} className="text-[var(--solar-cyan)]" />
                  Open GitHub repos
                </button>
                <button
                  type="button"
                  onClick={() => window.open('https://github.com/new', '_blank', 'noopener,noreferrer')}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[13px] font-medium text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
                >
                  <Zap size={18} className="text-[var(--solar-yellow)]" />
                  Create new repository on GitHub
                </button>
              </>
            ) : (
              <>
                <h2 className="text-[16px] font-semibold text-[var(--text-heading)]">Workspace</h2>
                <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                  Return to the main editor, welcome screen, and tabs. Inner Animal Media themes from Settings still apply
                  everywhere via your workspace <code className="text-[var(--solar-cyan)]">cms_themes</code> row.
                </p>
                <button
                  type="button"
                  onClick={() => onMobileOpenDashboard?.()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--scene-bg)] text-[13px] font-medium text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
                >
                  <LayoutDashboard size={18} className="text-[var(--solar-cyan)]" />
                  Open dashboard / editor
                </button>
              </>
            )}
          </div>
        )}

        {messagesVisible && (
        <div
          ref={scrollRef}
          className="order-4 flex flex-col flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain px-3 sm:px-4 pt-6 pb-4 space-y-6 w-full max-w-full chat-hide-scroll"
        >
          {showEmptyThreadPlaceholder ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6">
              <div className="w-10 h-10 rounded-xl bg-[var(--solar-cyan)]/15 border border-[var(--solar-cyan)]/25 flex items-center justify-center">
                <Bot size={18} className="text-[var(--solar-cyan)]" />
              </div>
              <p className="text-[13px] font-semibold text-[var(--text-main)]">What should we work on?</p>
              <p className="text-[11px] text-[var(--text-muted)] text-center leading-relaxed">
                Type below to start a conversation with Agent Sam.
              </p>
            </div>
          ) : (
            displayMessages.map((msg, i) => (
              <div key={i} className={`flex w-full min-w-0 max-w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`flex gap-2.5 min-w-0 ${
                    msg.role === 'user' ? 'flex-row-reverse max-w-[min(85%,100%)]' : 'max-w-full w-full'
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-1 ${
                      msg.role === 'user'
                        ? 'bg-[var(--border-subtle)]'
                        : 'bg-[var(--solar-cyan)]/20 border border-[var(--solar-cyan)]/30'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <User size={11} className="text-[var(--text-muted)]" />
                    ) : (
                      <Bot size={11} className="text-[var(--solar-cyan)]" />
                    )}
                  </div>
                  <div
                    className={`agent-content text-[0.8125rem] leading-relaxed min-w-0 break-words [overflow-wrap:anywhere] ${
                      msg.role === 'user'
                        ? 'bg-[var(--scene-bg)] border border-[var(--border-subtle)] px-4 py-3 rounded-2xl rounded-tr-sm text-[var(--text-main)]'
                        : 'text-[var(--text-main)] w-full'
                    }`}
                  >
                    {msg.role === 'user' && msg.attachmentPreviews && msg.attachmentPreviews.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.attachmentPreviews.map((ap, j) =>
                          ap.type === 'image' && ap.previewUrl ? (
                            <img
                              key={j}
                              src={ap.previewUrl}
                              alt=""
                              className="max-h-40 max-w-full rounded-lg border border-[var(--border-subtle)] object-contain"
                            />
                          ) : (
                            <span
                              key={j}
                              className="text-[0.6875rem] text-[var(--text-muted)] px-2 py-1 rounded border border-[var(--border-subtle)]/60"
                            >
                              {ap.name}
                            </span>
                          )
                        )}
                      </div>
                    ) : null}
                    {renderMessageContent(msg.content, i)}
                  </div>
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-2.5">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-[var(--solar-cyan)]/20 border border-[var(--solar-cyan)]/30 flex items-center justify-center">
                  <Loader2 size={11} className="text-[var(--solar-cyan)] animate-spin" />
                </div>
                <div className="px-4 py-3 bg-[var(--scene-bg)] border border-[var(--border-subtle)] rounded-2xl rounded-tl-sm">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 bg-[var(--solar-cyan)] rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-[var(--solar-cyan)] rounded-full animate-bounce [animation-delay:0.15s]" />
                    <div className="w-1.5 h-1.5 bg-[var(--solar-cyan)] rounded-full animate-bounce [animation-delay:0.3s]" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {contextTabVisible && (
          <div className="order-4 flex-1 min-h-0 overflow-y-auto chat-hide-scroll px-4 py-4 space-y-4 border-t border-[var(--border-subtle)]">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--scene-bg)] p-4 space-y-3">
              <h3 className="text-[12px] font-semibold text-[var(--text-heading)] uppercase tracking-wide">Editor</h3>
              <p className="text-[12px] text-[var(--text-muted)] font-mono break-all">
                {activeFile ? getEditorDisplayPath(activeFile, activeFileName) : 'No file open'}
              </p>
              <button
                type="button"
                onClick={() => onOpenCodeTab?.()}
                className="w-full py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[13px] font-medium text-[var(--text-main)] hover:bg-[var(--bg-hover)]"
              >
                Open code editor
              </button>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--scene-bg)] p-4 space-y-3">
              <h3 className="text-[12px] font-semibold text-[var(--text-heading)] uppercase tracking-wide">GitHub</h3>
              <p className="text-[12px] text-[var(--text-muted)]">
                {githubRepoContext?.trim()
                  ? `Selected repo: ${githubRepoContext}`
                  : 'Pick a repository from the Agents home screen (repo button below the composer).'}
              </p>
              <button
                type="button"
                onClick={() => onOpenGitHubIntegration?.(githubRepoContext?.trim() ? { expandRepoFullName: githubRepoContext.trim() } : undefined)}
                className="w-full py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[13px] font-medium text-[var(--text-main)] hover:bg-[var(--bg-hover)] flex items-center justify-center gap-2"
              >
                <GitBranch size={16} className="text-[var(--solar-cyan)]" />
                Open GitHub browser
              </button>
              <button
                type="button"
                onClick={() => window.open('https://github.com/new', '_blank', 'noopener,noreferrer')}
                className="w-full py-2.5 rounded-lg border border-[var(--border-subtle)] text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] flex items-center justify-center gap-2"
              >
                <ExternalLink size={16} />
                Create new repo on GitHub
              </button>
            </div>
          </div>
        )}

        {composerVisible && (
        <div
          className={`${composerFlexOrder} flex-shrink-0 w-full min-w-0 max-w-full px-3 pt-2 bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] space-y-2`}
          style={{
            paddingBottom: isNarrow ? MOBILE_CHAT_COMPOSER_BOTTOM_PAD : 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          }}
        >
          {pendingToolApproval && (
            <div
              role="region"
              aria-label="Tool approval"
              className="rounded-lg border border-[var(--solar-cyan)]/35 bg-[var(--scene-bg)] p-3 space-y-2"
            >
              <div className="text-[0.6875rem] font-semibold text-[var(--text-heading)]">Tool approval required</div>
              <div className="text-[0.6875rem] font-mono text-[var(--solar-cyan)]">{pendingToolApproval.tool.name}</div>
              {pendingToolApproval.tool.preview ? (
                <div className="text-[0.6875rem] text-[var(--text-main)] whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                  {pendingToolApproval.tool.preview}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={approvalBusy}
                  onClick={() => void handleApprovePendingTool()}
                  className="px-3 py-1.5 rounded-lg text-[0.6875rem] font-semibold bg-[var(--solar-green)]/20 border border-[var(--solar-green)]/40 text-[var(--solar-green)] hover:bg-[var(--solar-green)]/30 disabled:opacity-50"
                >
                  {approvalBusy ? 'Running…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  disabled={approvalBusy}
                  onClick={handleDenyPendingTool}
                  className="px-3 py-1.5 rounded-lg text-[0.6875rem] font-semibold bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--solar-red)]/50 hover:text-[var(--solar-red)] disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            </div>
          )}
          {attachments.length > 0 && (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1 chat-hide-scroll">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="relative flex-shrink-0 flex items-center gap-2 bg-[var(--scene-bg)] border border-[var(--border-subtle)] rounded-lg pl-1 pr-7 py-1"
                  >
                    {a.type === 'image' && a.previewUrl ? (
                      <img
                        src={a.previewUrl}
                        alt=""
                        className="w-12 h-12 rounded-md object-cover"
                        style={{ width: 48, height: 48, borderRadius: 6 }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-[var(--bg-panel)] flex items-center justify-center border border-[var(--border-subtle)]">
                        <FileText size={18} className="text-[var(--text-muted)]" />
                      </div>
                    )}
                    {a.type === 'file' && (
                      <div className="min-w-0 max-w-[140px]">
                        <div className="text-[0.625rem] font-mono text-[var(--text-main)] truncate">
                          {a.file.name.length > 24 ? `${a.file.name.slice(0, 21)}...` : a.file.name}
                        </div>
                        <div className="text-[0.6875rem] text-[var(--text-muted)]">{formatFileSize(a.file.size)}</div>
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      className="absolute top-0.5 right-0.5 p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--solar-red)] hover:bg-[var(--bg-hover)]"
                      onClick={() => removeAttachment(a.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.625rem] font-mono px-0.5 -mt-0.5 pb-0.5">
                <span
                  className={
                    totalStagedBytes > CHAT_ATTACH_MAX_TOTAL_BYTES ? 'text-[var(--solar-red)]' : 'text-[var(--text-muted)]'
                  }
                >
                  Total: {(totalStagedBytes / (1024 * 1024)).toFixed(2)} MB / {(CHAT_REQUEST_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB
                </span>
                {totalStagedBytes > CHAT_ATTACH_MAX_TOTAL_BYTES ? (
                  <span className="text-[var(--solar-red)]">
                    Over {(CHAT_ATTACH_MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)} MB combined — remove files before send
                  </span>
                ) : null}
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="*/*"
            className="hidden"
            onChange={(e) => {
              addFilesFromList(e.target.files, false);
              e.target.value = '';
            }}
          />
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              addFilesFromList(e.target.files, true);
              e.target.value = '';
            }}
          />

          <div
            className={`flex flex-col bg-[var(--scene-bg)] border rounded-xl transition-all shadow-inner overflow-visible ${
              composerDragging
                ? 'border-[var(--solar-cyan)]/70 ring-1 ring-[var(--solar-cyan)]/35'
                : 'border-[var(--border-subtle)] focus-within:border-[var(--solar-cyan)]/60'
            }`}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              composerDragDepthRef.current += 1;
              setComposerDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              composerDragDepthRef.current = Math.max(0, composerDragDepthRef.current - 1);
              if (composerDragDepthRef.current === 0) setComposerDragging(false);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              composerDragDepthRef.current = 0;
              setComposerDragging(false);
              addFilesFromList(e.dataTransfer.files, false);
            }}
          >
            <div className="flex items-end gap-1.5 px-2 pt-2 pb-2">
              <button
                type="button"
                ref={attachButtonRef}
                className="flex-shrink-0 p-2 text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] rounded-lg transition-all"
                title={`Attach — model: ${selectedModelDisplayName}`}
                onClick={() => {
                  setAttachMenuOpen((o) => !o);
                  setIsModeOpen(false);
                }}
              >
                <Paperclip size={16} strokeWidth={2} />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={onKeyDown}
                onSelect={(ev) => syncPickers(ev.currentTarget.value, ev.currentTarget.selectionStart)}
                onClick={(ev) => syncPickers(ev.currentTarget.value, ev.currentTarget.selectionStart)}
                placeholder="Message Agent Sam..."
                rows={1}
                className={`flex-1 min-w-0 bg-transparent px-1 py-2 focus:outline-none text-[var(--text-main)] placeholder:text-[var(--text-placeholder-strong)] resize-none font-sans leading-relaxed rounded-lg ${
                  isNarrow ? 'text-base' : 'text-[0.8125rem]'
                }`}
                style={{
                  minHeight: '44px',
                  maxHeight: isNarrow ? COMPOSER_TEXTAREA_MAX_PX_NARROW : COMPOSER_TEXTAREA_MAX_PX_WIDE,
                }}
              />
              <button
                type="button"
                ref={modeButtonRef}
                onClick={() => {
                  setIsModeOpen((o) => !o);
                  setAttachMenuOpen(false);
                }}
                className="flex-shrink-0 flex items-center gap-0.5 px-2 py-1.5 text-[0.6875rem] font-mono font-bold tracking-tight text-[var(--solar-cyan)] hover:brightness-110 transition-all uppercase border border-[var(--border-subtle)] rounded-lg"
              >
                {modeLabel} <ChevronDown size={8} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isLoading) {
                    abortControllerRef.current?.abort();
                    setIsLoading(false);
                  } else {
                    handleSend();
                  }
                }}
                disabled={!isLoading && !canSend}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-[0.6875rem] font-bold transition-all relative ${
                  canSend || isLoading
                    ? 'bg-[var(--solar-cyan)] text-[var(--solar-base03)] shadow-[0_0_16px_color-mix(in_srgb,var(--solar-cyan)_25%,transparent)] hover:brightness-110'
                    : 'text-[var(--text-chrome-muted)] bg-[var(--bg-disabled)] cursor-not-allowed'
                }`}
                title={isLoading ? 'Stop' : 'Send'}
              >
                {isLoading ? (
                  <>
                    <X size={12} className="text-red-600" />
                    {messageQueue.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold border border-[var(--bg-panel)]">
                        {messageQueue.length}
                      </span>
                    )}
                  </>
                ) : (
                  <Send size={12} />
                )}
              </button>
            </div>
          </div>
          {mobileAgentsThread && mobileThreadTab === 'chat' && (
            <button
              type="button"
              onClick={() => setRepoDrawerOpen(true)}
              className="flex w-full items-center gap-1.5 text-left text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)] py-2 px-1 rounded-lg hover:bg-[var(--bg-hover)]"
            >
              <FolderGit2 size={14} className="shrink-0 text-[var(--solar-cyan)]" />
              <span className="min-w-0 flex-1 truncate">
                {githubRepoContext?.trim() || 'Select GitHub repository'}
              </span>
              <ChevronDown size={14} className="shrink-0 opacity-60" />
            </button>
          )}
        </div>
        )}

        </div>

      </div>

      {repoDrawerOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] bg-[var(--text-main)]/50"
            aria-label="Close repository picker"
            onClick={() => setRepoDrawerOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[80] flex max-h-[min(72dvh,520px)] flex-col rounded-t-2xl border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-[0_-8px_32px_color-mix(in_srgb,var(--text-main)_12%,transparent)]">
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[var(--border-subtle)]" aria-hidden />
            <div className="shrink-0 border-b border-[var(--border-subtle)] px-4 py-3">
              <h3 className="text-[14px] font-semibold text-[var(--text-main)]">Repositories</h3>
              <input
                type="search"
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                placeholder="Search repos"
                className="mt-2 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--scene-bg)] py-2 px-3 text-[13px] text-[var(--text-main)] placeholder:text-[var(--text-placeholder-strong)] outline-none focus:border-[var(--solar-cyan)]"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto chat-hide-scroll p-2">
              {!ghReposAuthed && !ghReposLoading ? (
                <div className="space-y-3 px-2 py-6 text-center">
                  <p className="text-[12px] text-[var(--text-muted)]">Connect GitHub to list repositories.</p>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = '/api/oauth/github/start?return_to=/dashboard/agent';
                    }}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--scene-bg)] px-4 py-2 text-[12px] font-medium text-[var(--text-main)]"
                  >
                    Connect GitHub
                  </button>
                </div>
              ) : ghReposLoading ? (
                <div className="flex justify-center py-8 text-[var(--text-muted)]">
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : filteredGhRepos.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">No repositories match.</p>
              ) : (
                filteredGhRepos.map((repo) => {
                  const full = String(repo.full_name || '');
                  const selected = githubRepoContext === full;
                  return (
                    <div key={String(repo.id)} className="mb-1 flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            localStorage.setItem(LS_GH_REPO, full);
                          } catch {
                            /* ignore */
                          }
                          setGithubRepoContext(full);
                          setRepoDrawerOpen(false);
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] ${
                          selected ? 'bg-[var(--scene-bg)] ring-1 ring-[var(--solar-cyan)]/40' : ''
                        }`}
                      >
                        <span className="truncate font-medium text-[var(--text-main)]">{full}</span>
                        {repo.default_branch ? (
                          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{repo.default_branch}</span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        title="Browse files in Deploy tab"
                        onClick={() => {
                          try {
                            localStorage.setItem(LS_GH_REPO, full);
                          } catch {
                            /* ignore */
                          }
                          setGithubRepoContext(full);
                          setRepoDrawerOpen(false);
                          onOpenGitHubIntegration?.({ expandRepoFullName: full });
                        }}
                        className="shrink-0 rounded-lg border border-[var(--border-subtle)] px-2 py-2 text-[11px] text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)]"
                      >
                        Files
                      </button>
                    </div>
                  );
                })
              )}
              <button
                type="button"
                onClick={() => window.open('https://github.com/new', '_blank', 'noopener,noreferrer')}
                className="mt-2 w-full rounded-lg border border-dashed border-[var(--border-subtle)] py-3 text-[12px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]"
              >
                Create new repository on GitHub
              </button>
            </div>
          </div>
        </>
      )}

      {typeof document !== 'undefined' &&
        attachMenuOpen &&
        attachMenuStyle &&
        createPortal(
          <div
            className="bg-[var(--scene-bg)] border border-[var(--border-subtle)] rounded-xl shadow-2xl flex flex-col text-[0.6875rem] overflow-y-auto overflow-x-hidden py-1 min-w-0"
            style={attachMenuStyle}
            role="menu"
          >
            {[
              { icon: FileText, label: 'Plan', slug: 'plan' },
              { icon: Bug, label: 'Debug', slug: 'debug' },
              { icon: Target, label: 'Ask', slug: 'ask' },
              { icon: ImageIconLucide, label: 'Image', action: () => imageInputRef.current?.click() },
              { icon: Zap, label: 'Skills', action: () => window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail: { activity: 'mcps' } })) },
              { icon: Layers, label: 'MCP Servers', action: () => window.dispatchEvent(new CustomEvent('iam-sidebar-toggle', { detail: { activity: 'mcps' } })) },
            ].map((item, i) => {
              const Icon = item.icon || Paperclip;
              return (
                <button
                  key={i}
                  type="button"
                  className="flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--bg-panel)] text-[var(--text-main)] transition-colors"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    if ('action' in item) item.action?.();
                  }}
                >
                  <Icon size={14} className="text-[var(--text-muted)] shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <div className="border-t border-[var(--border-subtle)] my-1 mx-2" role="separator" />
            <button
              type="button"
              className="flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--bg-panel)] text-[var(--text-main)] transition-colors"
              onClick={() => {
                setAttachMenuOpen(false);
                fileInputRef.current?.click();
              }}
            >
              <Paperclip size={14} className="text-[var(--text-muted)] shrink-0" />
              <span>Upload File</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-panel)] text-[var(--text-main)]"
              onClick={() => {
                setAttachMenuOpen(false);
                const el = textareaRef.current;
                if (!el) return;
                const start = el.selectionStart;
                const v = input.slice(0, start) + '@' + input.slice(start);
                const pos = start + 1;
                setInput(v);
                requestAnimationFrame(() => {
                  el.focus();
                  el.setSelectionRange(pos, pos);
                  syncPickers(v, pos);
                });
              }}
            >
              <AtSign size={14} className="text-[var(--text-muted)] shrink-0" />
              <span>Mention</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-panel)] text-[var(--text-main)]"
              onClick={() => {
                setAttachMenuOpen(false);
                const el = textareaRef.current;
                if (!el) return;
                const start = el.selectionStart;
                const v = input.slice(0, start) + '/' + input.slice(start);
                const pos = start + 1;
                setInput(v);
                requestAnimationFrame(() => {
                  el.focus();
                  el.setSelectionRange(pos, pos);
                  syncPickers(v, pos);
                });
              }}
            >
              <Slash size={14} className="text-[var(--text-muted)] shrink-0" />
              <span>Command</span>
            </button>
            <div className="border-t border-[var(--border-subtle)] my-1 mx-2" role="separator" />
            <div className="px-3 py-1 text-[0.6875rem] uppercase tracking-wider text-[var(--text-muted)]">
              Models
            </div>
            {MODEL_PLATFORM_ORDER.map((plat) => {
              const list = chatModels.filter((m) => m.api_platform === plat);
              if (!list.length) return null;
              return (
                <div key={plat} className="pb-1">
                  <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-60">
                    {MODEL_PLATFORM_LABEL[plat] || plat}
                  </div>
                  {list.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`w-full min-w-0 flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--bg-panel)] rounded-lg mx-1 transition-all ${
                        selectedModelKey === m.model_key
                          ? 'text-[var(--solar-cyan)] bg-[var(--bg-panel)]/80'
                          : 'text-[var(--text-main)]'
                      }`}
                      onClick={() => {
                        setSelectedModelKey(m.model_key);
                        setAttachMenuOpen(false);
                      }}
                    >
                      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                        <span className="truncate text-[11px] font-bold tracking-tight">{m.name}</span>
                        {m.provider && <span className="text-[9px] opacity-40 uppercase tracking-widest">{m.provider}</span>}
                      </div>
                      {selectedModelKey === m.model_key && <Sparkles size={10} className="animate-pulse" />}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        isModeOpen &&
        modeMenuStyle &&
        createPortal(
          <div
            className="bg-[var(--scene-bg)] border border-[var(--border-subtle)] rounded-xl shadow-2xl p-1 flex flex-col text-[0.6875rem] overflow-y-auto overflow-x-hidden min-w-0"
            style={modeMenuStyle}
          >
            {modes.map((m) => (
              <button
                key={m.slug}
                type="button"
                className={`px-3 py-1.5 text-left hover:bg-[var(--bg-panel)] cursor-pointer rounded-lg transition-colors ${
                  mode === m.slug ? 'text-[var(--solar-cyan)] bg-[var(--bg-panel)]' : 'text-[var(--text-muted)]'
                }`}
                onClick={() => {
                  setMode(m.slug);
                  setIsModeOpen(false);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        mentionOpen &&
        mentionStyle &&
        mentionItems.length > 0 &&
        createPortal(
          <div
            className="bg-[var(--scene-bg)] border border-[var(--border-subtle)] rounded-xl shadow-2xl flex flex-col text-[0.6875rem] overflow-y-auto overflow-x-hidden p-1 min-w-0"
            style={mentionStyle}
          >
            {mentionItems.map((it, i) => (
              <button
                key={it.id}
                type="button"
                className={`px-3 py-1.5 text-left rounded-lg truncate ${
                  i === mentionIndex ? 'bg-[var(--bg-panel)] text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-panel)]'
                }`}
                onMouseEnter={() => setMentionIndex(i)}
                onClick={() => applyMention(it)}
              >
                <span className="text-[0.6875rem] uppercase text-[var(--text-muted)] mr-2">{it.kind}</span>
                {it.label}
              </button>
            ))}
          </div>,
          document.body
        )}

      {typeof document !== 'undefined' &&
        slashOpen &&
        slashStyle &&
        slashItems.length > 0 &&
        createPortal(
          <div
            className="bg-[var(--scene-bg)] border border-[var(--border-subtle)] rounded-xl shadow-2xl flex flex-col text-[0.6875rem] overflow-y-auto overflow-x-hidden p-1 max-w-[min(320px,calc(100vw-2rem))] min-w-0"
            style={slashStyle}
          >
            {slashItems.map((c, i) => (
              <button
                key={c.slug}
                type="button"
                className={`px-3 py-1.5 text-left rounded-lg ${
                  i === slashIndex ? 'bg-[var(--bg-panel)] text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-panel)]'
                }`}
                onMouseEnter={() => setSlashIndex(i)}
                onClick={() => applySlash(c)}
              >
                <div className="font-mono font-bold">/{c.slug}</div>
                {c.description && (
                  <div className="text-[0.625rem] text-[var(--text-muted)] truncate">{c.description}</div>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};
