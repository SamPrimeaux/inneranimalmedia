/**
 * ideWorkspace.ts
 *
 * Persisted IDE workspace context — drives the status bar, recent files,
 * and Git/terminal wiring. Syncs to D1 via GET/PUT /api/agent/workspace/:conversationId
 * when a chat thread is active. No hardcoded values, no legacy keys.
 */

import type { ActiveFile } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IdeWorkspaceSnapshot =
  | { source: 'none' }
  | { source: 'local';  folderName: string }
  | { source: 'pinned'; name: string; pathHint: string };

export type RecentFileSource = 'local' | 'github' | 'r2' | 'drive' | 'buffer';

export type RecentFileEntry = {
  id:               string;
  name:             string;
  openedAt:         number;
  label:            string;
  source:           RecentFileSource;
  previewOneLine:   string;
  snapshotOriginal: string | null;
  snapshotWorking:  string;
  githubRepo?:      string;
  githubPath?:      string;
  githubBranch?:    string;
  r2Key?:           string;
  r2Bucket?:        string;
  driveFileId?:     string;
  workspacePath?:   string;
};

export type IdePersistedBundle = {
  v:            number;
  ideWorkspace: IdeWorkspaceSnapshot;
  gitBranch:    string;
  recentFiles:  RecentFileEntry[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const IDE_PERSIST_VERSION = 1;
export const MAX_RECENT_FILES    = 24;
const SNAPSHOT_CAP               = 12_000;

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultIdeBundle(): IdePersistedBundle {
  return {
    v:            IDE_PERSIST_VERSION,
    ideWorkspace: { source: 'none' },
    gitBranch:    'main',
    recentFiles:  [],
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function truncateSnapshot(s: string, max = SNAPSHOT_CAP): string {
  return s.length <= max ? s : s.slice(0, max) + '\n/* … truncated … */';
}

function minifyOneLine(s: string, maxLen: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  if (one.length <= maxLen) return one || '(empty)';
  return one.slice(0, maxLen - 1) + '…';
}

function recentFileId(f: ActiveFile): string {
  if (f.githubRepo && f.githubPath) return `gh:${f.githubRepo}:${f.githubPath}`;
  if (f.r2Bucket   && f.r2Key)      return `r2:${f.r2Bucket}:${f.r2Key}`;
  if (f.driveFileId)                 return `gdrive:${f.driveFileId}`;
  if (f.workspacePath)               return `local:${f.workspacePath}`;
  return `name:${f.name}`;
}

function recentFileLabel(f: ActiveFile): string {
  if (f.githubRepo && f.githubPath) return `${f.githubRepo}/${f.githubPath}`;
  if (f.r2Bucket   && f.r2Key)      return `${f.r2Bucket}/${f.r2Key}`;
  if (f.workspacePath)               return f.workspacePath;
  return f.name;
}

function recentSource(f: ActiveFile): RecentFileSource {
  if (f.githubRepo)              return 'github';
  if (f.r2Key)                   return 'r2';
  if (f.driveFileId)             return 'drive';
  if (f.workspacePath || f.handle) return 'local';
  return 'buffer';
}

function safeParseWorkspace(raw: unknown): IdeWorkspaceSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as IdeWorkspaceSnapshot;
  if (o.source === 'none' || o.source === 'local' || o.source === 'pinned') return o;
  return null;
}

function isRecentEntry(x: unknown): x is RecentFileEntry {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof (x as RecentFileEntry).id       === 'string' &&
    typeof (x as RecentFileEntry).name     === 'string' &&
    typeof (x as RecentFileEntry).openedAt === 'number'
  );
}

// ─── Bundle parse ─────────────────────────────────────────────────────────────

export function parsePersistedBundle(raw: unknown): IdePersistedBundle | null {
  if (!raw || typeof raw !== 'object') return null;
  const o            = raw as Record<string, unknown>;
  const ideWorkspace = safeParseWorkspace(o.ideWorkspace);
  const gitBranch    = typeof o.gitBranch === 'string' && o.gitBranch.trim()
    ? o.gitBranch.trim() : null;
  const recentFiles: RecentFileEntry[] = Array.isArray(o.recentFiles)
    ? o.recentFiles.filter(isRecentEntry).slice(0, MAX_RECENT_FILES)
    : [];
  if (!ideWorkspace || !gitBranch) return null;
  return {
    v: typeof o.v === 'number' ? o.v : IDE_PERSIST_VERSION,
    ideWorkspace,
    gitBranch,
    recentFiles,
  };
}

// ─── Fetch headers ────────────────────────────────────────────────────────────

export function workspaceFetchHeaders(sessionId?: string | null): HeadersInit {
  const h: Record<string, string> = { Accept: 'application/json' };
  const sid = sessionId?.trim();
  if (sid) h['x-session-id'] = sid;
  return h;
}

// ─── API: hydrate ─────────────────────────────────────────────────────────────

export async function hydrateIdeFromApi(
  conversationId: string,
  init?: { sessionId?: string | null; signal?: AbortSignal },
): Promise<IdePersistedBundle> {
  const defaults = defaultIdeBundle();
  const id       = conversationId?.trim();
  if (!id) return defaults;

  try {
    const r = await fetch(`/api/agent/workspace/${encodeURIComponent(id)}`, {
      method:      'GET',
      credentials: 'same-origin',
      headers:     workspaceFetchHeaders(init?.sessionId),
      signal:      init?.signal,
    });
    if (r.status === 401 || r.status === 403) return defaults;
    if (!r.ok) return defaults;

    const row    = await r.json() as { state_json?: string };
    const rawStr = row?.state_json;
    if (typeof rawStr !== 'string' || !rawStr.trim()) return defaults;

    let parsed: unknown;
    try { parsed = JSON.parse(rawStr); }
    catch { return defaults; }

    return parsePersistedBundle(parsed) ?? defaults;
  } catch {
    return defaults;
  }
}

// ─── API: persist ─────────────────────────────────────────────────────────────

export async function persistIdeToApi(
  conversationId: string,
  bundle: IdePersistedBundle,
  init?: { sessionId?: string | null; signal?: AbortSignal },
): Promise<void> {
  const id = conversationId?.trim();
  if (!id) return;

  try {
    await fetch(`/api/agent/workspace/${encodeURIComponent(id)}`, {
      method:      'PUT',
      credentials: 'same-origin',
      headers:     {
        ...workspaceFetchHeaders(init?.sessionId),
        'Content-Type': 'application/json',
      },
      body:   JSON.stringify({ state: bundle }),
      signal: init?.signal,
    });
  } catch {
    /* offline / aborted — non-fatal */
  }
}

// ─── Recent files ─────────────────────────────────────────────────────────────

export function buildRecentEntryFromActiveFile(file: ActiveFile): RecentFileEntry {
  return {
    id:               recentFileId(file),
    name:             file.name,
    openedAt:         Date.now(),
    label:            recentFileLabel(file),
    source:           recentSource(file),
    previewOneLine:   minifyOneLine(file.content, 160),
    snapshotOriginal: file.originalContent !== undefined
      ? truncateSnapshot(file.originalContent) : null,
    snapshotWorking:  truncateSnapshot(file.content),
    githubRepo:       file.githubRepo,
    githubPath:       file.githubPath,
    githubBranch:     file.githubBranch,
    r2Key:            file.r2Key,
    r2Bucket:         file.r2Bucket,
    driveFileId:      file.driveFileId,
    workspacePath:    file.workspacePath,
  };
}

export function mergeRecentFromActiveFile(
  prev:  RecentFileEntry[],
  file:  ActiveFile,
): RecentFileEntry[] {
  const entry = buildRecentEntryFromActiveFile(file);
  return [entry, ...prev.filter(e => e.id !== entry.id)].slice(0, MAX_RECENT_FILES);
}

// ─── Diff stats ───────────────────────────────────────────────────────────────

export function diffLineStats(a: string, b: string): { added: number; removed: number } {
  const la   = a.split('\n');
  const lb   = b.split('\n');
  const setB = new Set(lb);
  const setA = new Set(la);
  return {
    removed: la.filter(l => !setB.has(l)).length,
    added:   lb.filter(l => !setA.has(l)).length,
  };
}

// ─── Status line ──────────────────────────────────────────────────────────────

export function formatWorkspaceStatusLine(ws: IdeWorkspaceSnapshot): string {
  if (ws.source === 'none')   return 'No workspace';
  if (ws.source === 'local')  return `${ws.folderName} (local disk)`;
  return `${ws.name} — ${ws.pathHint}`;
}
