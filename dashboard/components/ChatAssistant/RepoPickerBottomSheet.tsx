import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderGit2, Loader2 } from 'lucide-react';
import { readGhReposCache, writeGhReposCache, type GhRepoRow } from './repoPickerCache';

const HEIGHT_KEY = 'iam-repo-drawer-height-vh';
const MIN_VH = 28;
const MAX_VH = 92;
const DEFAULT_VH = 52;

function readStoredHeightVh(): number {
  try {
    const n = Number(sessionStorage.getItem(HEIGHT_KEY));
    if (Number.isFinite(n) && n >= MIN_VH && n <= MAX_VH) return n;
  } catch {
    /* ignore */
  }
  return DEFAULT_VH;
}

type RepoPickerBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null | undefined;
  githubRepoContext: string | null;
  onSelectRepo: (fullName: string) => void;
  onBrowseFiles: (fullName: string) => void;
};

export function RepoPickerBottomSheet({
  open,
  onClose,
  workspaceId,
  githubRepoContext,
  onSelectRepo,
  onBrowseFiles,
}: RepoPickerBottomSheetProps) {
  const [ghRepos, setGhRepos] = useState<GhRepoRow[]>([]);
  const [ghReposLoading, setGhReposLoading] = useState(false);
  const [ghReposAuthed, setGhReposAuthed] = useState(true);
  const [repoSearch, setRepoSearch] = useState('');
  const [heightVh, setHeightVh] = useState(readStoredHeightVh);
  const heightVhRef = useRef(heightVh);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    heightVhRef.current = heightVh;
  }, [heightVh]);

  const loadGhRepos = useCallback(async () => {
    const cached = readGhReposCache();
    if (cached?.length) setGhRepos(cached);

    setGhReposLoading(true);
    try {
      const hdr: Record<string, string> = {};
      if (workspaceId?.trim()) hdr['X-IAM-Workspace-Id'] = workspaceId.trim();
      const res = await fetch('/api/integrations/github/repos', {
        credentials: 'same-origin',
        headers: hdr,
      });
      if (!res.ok) {
        setGhReposAuthed(false);
        if (!cached?.length) setGhRepos([]);
        return;
      }
      setGhReposAuthed(true);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.repos || [];
      const rows = (Array.isArray(list) ? list : []) as GhRepoRow[];
      setGhRepos(rows);
      if (rows.length) writeGhReposCache(rows);
    } catch {
      setGhReposAuthed(false);
      if (!cached?.length) setGhRepos([]);
    } finally {
      setGhReposLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) void loadGhRepos();
  }, [open, loadGhRepos]);

  const filteredGhRepos = ghRepos.filter((r) => {
    const q = repoSearch.trim().toLowerCase();
    if (!q) return true;
    return String(r.full_name || r.name || '')
      .toLowerCase()
      .includes(q);
  });

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startH: heightVh };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onResizePointerMove = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const dy = resizeRef.current.startY - e.clientY;
    const deltaVh = (dy / window.innerHeight) * 100;
    const next = Math.min(MAX_VH, Math.max(MIN_VH, resizeRef.current.startH + deltaVh));
    setHeightVh(next);
  };

  const onResizePointerUp = (e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    try {
      const h = heightVhRef.current;
      sessionStorage.setItem(HEIGHT_KEY, String(Math.round(h * 10) / 10));
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  const showLoadingOverlay = ghReposLoading && ghRepos.length === 0;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[70] bg-black/45"
        aria-label="Close repository picker"
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[80] flex flex-col rounded-t-2xl border-t border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] shadow-[0_-8px_32px_rgba(0,0,0,0.35)] touch-none"
        style={{
          height: `min(${heightVh}dvh, calc(100dvh - 2.5rem))`,
          maxHeight: 'calc(100dvh - 2.5rem)',
        }}
      >
        <div
          className="flex shrink-0 flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
          role="separator"
          aria-label="Drag to resize repository drawer"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        >
          <div className="h-1.5 w-10 rounded-full bg-[var(--dashboard-border)]" aria-hidden />
        </div>
        <div className="shrink-0 border-b border-[var(--dashboard-border)] px-4 py-3">
          <h3 className="text-[14px] font-semibold text-[var(--dashboard-text)]">Repositories</h3>
          <input
            type="search"
            value={repoSearch}
            onChange={(e) => setRepoSearch(e.target.value)}
            placeholder="Search repos"
            className="mt-2 w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--scene-bg)] py-2 px-3 text-[13px] text-[var(--dashboard-text)] placeholder:text-[var(--text-placeholder-strong)] outline-none focus:border-[var(--solar-cyan)]"
          />
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto chat-hide-scroll p-2">
          {showLoadingOverlay ? (
            <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 bg-[var(--dashboard-panel)]/85">
              <Loader2 className="animate-spin text-[var(--dashboard-muted)]" size={22} aria-hidden />
              <p className="text-[11px] text-[var(--dashboard-muted)]">Loading repositories…</p>
            </div>
          ) : null}
          {!ghReposAuthed && !ghReposLoading ? (
            <div className="space-y-3 px-2 py-6 text-center">
              <p className="text-[12px] text-[var(--dashboard-muted)]">Connect GitHub to list repositories.</p>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/api/oauth/github/start?return_to=/dashboard/agent';
                }}
                className="rounded-lg border border-[var(--dashboard-border)] bg-[var(--scene-bg)] px-4 py-2 text-[12px] font-medium text-[var(--dashboard-text)]"
              >
                Connect GitHub
              </button>
            </div>
          ) : filteredGhRepos.length === 0 && !ghReposLoading ? (
            <p className="px-3 py-6 text-center text-[12px] text-[var(--dashboard-muted)]">No repositories match.</p>
          ) : (
            filteredGhRepos.map((repo) => {
              const full = String(repo.full_name || '');
              const selected = githubRepoContext === full;
              return (
                <div key={String(repo.id)} className="mb-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectRepo(full);
                      onClose();
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] ${
                      selected ? 'bg-[var(--scene-bg)] ring-1 ring-[var(--solar-cyan)]/40' : ''
                    }`}
                  >
                    <FolderGit2 size={14} className="shrink-0 text-[var(--solar-cyan)] opacity-80" />
                    <span className="truncate font-medium text-[var(--dashboard-text)]">{full}</span>
                    {repo.default_branch ? (
                      <span className="shrink-0 text-[10px] text-[var(--dashboard-muted)]">{repo.default_branch}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    title="Browse files in Deploy tab"
                    onClick={() => {
                      onSelectRepo(full);
                      onClose();
                      onBrowseFiles(full);
                    }}
                    className="shrink-0 rounded-lg border border-[var(--dashboard-border)] px-2 py-2 text-[11px] text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)]"
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
            className="mt-2 w-full rounded-lg border border-dashed border-[var(--dashboard-border)] py-3 text-[12px] font-medium text-[var(--dashboard-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--dashboard-text)]"
          >
            Create new repository on GitHub
          </button>
        </div>
      </div>
    </>
  );
}
