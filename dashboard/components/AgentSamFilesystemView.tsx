import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Cloud,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Github,
  GripVertical,
  HardDrive,
  Loader2,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ActiveFile } from '../types';
import { GitHubExplorer } from './GitHubExplorer';
import { GoogleDriveExplorer } from './GoogleDriveExplorer';
import { VirtualizedFileTree } from './VirtualizedFileTree';
import { SetiFileIcon } from '../src/components/SetiFileIcon';
import {
  AGENT_SAM_FS_SOURCES,
  loadPersistedAgentSamFsSource,
  persistAgentSamFsSource,
  type AgentSamFsSource,
} from '../src/lib/agentSamFilesystemTypes';
import type { LocalFileTreeRow } from '../src/lib/localFileTree';
import type { R2ObjectRow } from '../src/lib/r2Listing';

export type AgentSamFilesystemViewProps = {
  onClose?: () => void;
  onOpenInEditor?: (file: ActiveFile) => void;
  workspace_id?: string | null;
  googleDriveOAuthRefresh?: number;

  rootDir: { name: string } | null;
  localResumeHint: { workspaceId: string | null; folderName: string } | null;
  localTreeRows: LocalFileTreeRow[];
  onLocalTreeRowClick: (row: LocalFileTreeRow) => void;
  handleOpenFolder: () => void;
  handleReconnectPersistedFolder: () => void;
  disconnectNativeFolder: () => void;
  handleCreateLocalFile: () => void;
  handleCreateLocalFolder: () => void;

  displayR2Buckets: string[];
  selectedR2Bucket: string;
  setSelectedR2Bucket: (b: string) => void;
  setR2PrefixByBucket: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setR2SearchMode: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  r2PrefixByBucket: Record<string, string>;
  r2PrefixesByBucket: Record<string, string[]>;
  r2ObjectsByBucket: Record<string, R2ObjectRow[]>;
  r2ListCursorByBucket: Record<string, string | null>;
  r2ListTruncatedByBucket: Record<string, boolean>;
  r2Loading: boolean;
  r2Err: string | null;
  r2SearchQ: Record<string, string>;
  r2SearchMode: Record<string, boolean>;
  setR2SearchQ: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setR2Prefix: (bucket: string, prefix: string) => void;
  parentR2Prefix: (prefix: string) => string;
  loadR2List: (bucket: string) => void;
  loadMoreR2List: (bucket: string) => void;
  runR2Search: (bucket: string) => void;
  clearR2Search: (bucket: string) => void;
  openR2Key: (bucket: string, key: string) => void;
  deleteR2Key: (bucket: string, key: string) => void;
  createR2Folder: (bucket: string) => void;
  uploadToR2: (bucket: string, files: FileList | null) => void;
  r2AddOpen: boolean;
  setR2AddOpen: React.Dispatch<React.SetStateAction<boolean>>;
  r2AddMode: 'connect' | 'create' | null;
  setR2AddMode: React.Dispatch<React.SetStateAction<'connect' | 'create' | null>>;
  r2AddName: string;
  setR2AddName: React.Dispatch<React.SetStateAction<string>>;
  r2AddBusy: boolean;
  connectR2Bucket: () => void;
  createR2Bucket: () => void;
  r2UploadRef: React.RefObject<HTMLInputElement>;
  setR2UploadTargetBucket: React.Dispatch<React.SetStateAction<string | null>>;
  onSourceActivated?: (source: AgentSamFsSource) => void;
};

const SOURCE_ICON: Record<AgentSamFsSource, React.ReactNode> = {
  local: <HardDrive size={13} className="shrink-0" />,
  r2: <Cloud size={13} className="shrink-0" />,
  github: <Github size={13} className="shrink-0" />,
  drive: <FolderOpen size={13} className="shrink-0" />,
};

export const AgentSamFilesystemView: React.FC<AgentSamFilesystemViewProps> = (props) => {
  const {
    onClose,
    onOpenInEditor,
    workspace_id,
    googleDriveOAuthRefresh = 0,
    rootDir,
    localResumeHint,
    localTreeRows,
    onLocalTreeRowClick,
    handleOpenFolder,
    handleReconnectPersistedFolder,
    disconnectNativeFolder,
    handleCreateLocalFile,
    handleCreateLocalFolder,
    displayR2Buckets,
    selectedR2Bucket,
    setSelectedR2Bucket,
    setR2PrefixByBucket,
    setR2SearchMode,
    r2PrefixByBucket,
    r2PrefixesByBucket,
    r2ObjectsByBucket,
    r2ListCursorByBucket,
    r2ListTruncatedByBucket,
    r2Loading,
    r2Err,
    r2SearchQ,
    r2SearchMode,
    setR2SearchQ,
    setR2Prefix,
    parentR2Prefix,
    loadR2List,
    loadMoreR2List,
    runR2Search,
    clearR2Search,
    openR2Key,
    deleteR2Key,
    createR2Folder,
    uploadToR2,
    r2AddOpen,
    setR2AddOpen,
    r2AddMode,
    setR2AddMode,
    r2AddName,
    setR2AddName,
    r2AddBusy,
    connectR2Bucket,
    createR2Bucket,
    r2UploadRef,
    setR2UploadTargetBucket,
    onSourceActivated,
  } = props;

  const [activeSource, setActiveSource] = useState<AgentSamFsSource>(
    () => loadPersistedAgentSamFsSource() ?? 'local',
  );

  const selectSource = useCallback(
    (source: AgentSamFsSource) => {
      setActiveSource(source);
      persistAgentSamFsSource(source);
      onSourceActivated?.(source);
    },
    [onSourceActivated],
  );

  useEffect(() => {
    onSourceActivated?.(activeSource);
  }, [activeSource, onSourceActivated]);

  const breadcrumb = useMemo(() => {
    if (activeSource === 'local') {
      return rootDir?.name ?? 'Local workspace';
    }
    if (activeSource === 'r2' && selectedR2Bucket) {
      const prefix = r2PrefixByBucket[selectedR2Bucket] ?? '';
      return prefix ? `${selectedR2Bucket} / ${prefix}` : selectedR2Bucket;
    }
    if (activeSource === 'github') return 'GitHub repositories';
    if (activeSource === 'drive') return 'Google Drive';
    return 'Files';
  }, [activeSource, rootDir, selectedR2Bucket, r2PrefixByBucket]);

  const r2Bucket = selectedR2Bucket;
  const r2Prefix = r2Bucket ? (r2PrefixByBucket[r2Bucket] ?? '') : '';
  const r2Prefs = r2Bucket ? (r2PrefixesByBucket[r2Bucket] || []) : [];
  const r2Objs = r2Bucket ? (r2ObjectsByBucket[r2Bucket] || []) : [];
  const r2SearchOn = r2Bucket ? !!r2SearchMode[r2Bucket] : false;

  const shortR2Name = (full: string) =>
    r2Prefix && full.startsWith(r2Prefix) ? full.slice(r2Prefix.length) : full;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg-panel)] overflow-hidden text-main">
      <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-[var(--border-subtle)]/40 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical size={12} className="text-muted/50 shrink-0 hidden md:block" aria-hidden />
          <span className="text-[11px] font-semibold tracking-wide text-main truncate">Files</span>
        </div>
        {onClose ? (
          <button
            type="button"
            className="shrink-0 p-1.5 rounded-md text-muted hover:text-main hover:bg-[var(--bg-hover)] transition-colors"
            title="Close Files (⌘B)"
            aria-label="Close Files"
            onClick={onClose}
          >
            <PanelLeftClose size={14} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <div
        className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-b border-[var(--border-subtle)]/30 overflow-x-auto"
        role="tablist"
        aria-label="File sources"
      >
        {AGENT_SAM_FS_SOURCES.map(({ id, label }) => {
          const active = activeSource === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectSource(id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[var(--bg-hover)] text-[var(--solar-cyan)] shadow-sm'
                  : 'text-muted hover:text-main hover:bg-[var(--bg-hover)]/60'
              }`}
            >
              {SOURCE_ICON[id]}
              {label}
            </button>
          );
        })}
      </div>

      <div className="shrink-0 px-3 py-1.5 border-b border-[var(--border-subtle)]/20 flex items-center gap-2 min-h-[32px]">
        <span className="text-[10px] text-muted truncate flex-1 font-mono" title={breadcrumb}>
          {breadcrumb}
        </span>
        {activeSource === 'local' && rootDir ? (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              title="New file"
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-muted hover:text-main"
              onClick={() => void handleCreateLocalFile()}
            >
              <FilePlus size={12} />
            </button>
            <button
              type="button"
              title="New folder"
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-muted hover:text-main"
              onClick={() => void handleCreateLocalFolder()}
            >
              <FolderPlus size={12} />
            </button>
            <button
              type="button"
              title="Disconnect folder"
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-muted hover:text-[var(--solar-orange)] text-[10px] px-1"
              onClick={() => void disconnectNativeFolder()}
            >
              Disconnect
            </button>
          </div>
        ) : null}
        {activeSource === 'r2' && r2Bucket ? (
          <div className="flex items-center gap-0.5 shrink-0">
            {r2Prefix ? (
              <button
                type="button"
                className="text-[10px] text-[var(--solar-cyan)] hover:underline px-1"
                onClick={() => setR2Prefix(r2Bucket, parentR2Prefix(r2Prefix))}
              >
                Up
              </button>
            ) : null}
            <button
              type="button"
              title="Refresh"
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-muted"
              onClick={() => void loadR2List(r2Bucket)}
            >
              <RefreshCw size={12} className={r2Loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              title="Upload"
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-muted"
              onClick={() => {
                setR2UploadTargetBucket(r2Bucket);
                r2UploadRef.current?.click();
              }}
            >
              <Upload size={12} />
            </button>
            <button
              type="button"
              title="New folder"
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-muted"
              onClick={() => void createR2Folder(r2Bucket)}
            >
              <FolderPlus size={12} />
            </button>
            <button
              type="button"
              title="Add bucket"
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-muted"
              onClick={() => {
                setR2AddOpen((v) => !v);
                setR2AddMode(null);
                setR2AddName('');
              }}
            >
              <Plus size={12} />
            </button>
          </div>
        ) : null}
      </div>

      <input
        ref={r2UploadRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (r2Bucket) void uploadToR2(r2Bucket, e.target.files);
        }}
      />

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeSource === 'local' ? (
          <div className="flex-1 min-h-0 flex flex-col px-1 py-1 font-mono">
            {!rootDir ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-6">
                {localResumeHint ? (
                  <div className="w-full max-w-[240px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)]/80 p-3">
                    <p className="text-[10px] text-main leading-snug text-center">
                      You last had{' '}
                      <span className="font-semibold text-[var(--solar-cyan)]">{localResumeHint.folderName}</span>{' '}
                      open. Reconnect to grant access again.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleReconnectPersistedFolder()}
                      className="mt-2 w-full text-[10px] font-semibold py-1.5 rounded border border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/10"
                    >
                      Reconnect folder
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenFolder()}
                      className="mt-1 w-full text-[9px] py-1 rounded text-muted hover:text-main"
                    >
                      Choose a different folder
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleOpenFolder()}
                  className="text-[11px] text-[var(--solar-blue)] hover:text-white hover:underline font-medium py-2 px-4 border border-[var(--solar-blue)]/30 rounded-lg"
                >
                  Connect native folder
                </button>
                <p className="text-[9px] text-muted text-center max-w-[220px] leading-relaxed">
                  Chromium File System Access — folder name only is stored locally.
                </p>
              </div>
            ) : (
              <VirtualizedFileTree
                rows={localTreeRows}
                fillHeight
                ariaLabel="Local files"
                onRowClick={(row) => void onLocalTreeRowClick(row)}
              />
            )}
          </div>
        ) : null}

        {activeSource === 'r2' ? (
          <div className="flex-1 min-h-0 flex flex-col px-2 py-1 font-mono text-[11px] overflow-hidden">
            {r2AddOpen ? (
              <div className="shrink-0 mb-2 rounded border border-[var(--border-subtle)]/50 bg-[var(--bg-app)]/80 p-2 flex flex-col gap-2 text-[10px]">
                {!r2AddMode ? (
                  <>
                    <button
                      type="button"
                      className="text-left px-2 py-1 rounded hover:bg-[var(--bg-hover)]"
                      onClick={() => setR2AddMode('connect')}
                    >
                      Connect existing bucket
                    </button>
                    <button
                      type="button"
                      className="text-left px-2 py-1 rounded hover:bg-[var(--bg-hover)]"
                      onClick={() => setR2AddMode('create')}
                    >
                      Create new bucket
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <input
                      value={r2AddName}
                      onChange={(e) => setR2AddName(e.target.value)}
                      placeholder={r2AddMode === 'create' ? 'new-bucket-name' : 'bucket-name'}
                      className="bg-[var(--bg-app)] border border-[var(--border-subtle)]/50 rounded px-2 py-1 text-[10px] outline-none"
                    />
                    <button
                      type="button"
                      disabled={r2AddBusy || !r2AddName.trim()}
                      className="py-1 rounded bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] disabled:opacity-50"
                      onClick={() => void (r2AddMode === 'create' ? createR2Bucket() : connectR2Bucket())}
                    >
                      {r2AddBusy ? 'Working…' : r2AddMode === 'create' ? 'Create' : 'Connect'}
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {displayR2Buckets.length > 0 ? (
              <label className="shrink-0 flex items-center gap-2 text-[10px] text-muted mb-1">
                <span className="uppercase shrink-0">Bucket</span>
                <select
                  value={selectedR2Bucket}
                  onChange={(e) => {
                    const b = e.target.value;
                    setSelectedR2Bucket(b);
                    setR2PrefixByBucket((prev) => ({ ...prev, [b]: prev[b] ?? '' }));
                    setR2SearchMode((m) => ({ ...m, [b]: false }));
                  }}
                  className="flex-1 min-w-0 bg-[var(--bg-app)] border border-[var(--border-subtle)]/50 rounded px-1 py-0.5 text-[10px] text-main"
                >
                  {displayR2Buckets.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-[10px] text-muted px-1 py-4">No R2 buckets connected. Use + to add one.</p>
            )}

            {r2Err ? <p className="shrink-0 text-[10px] text-[var(--solar-orange)] px-1">{r2Err}</p> : null}

            {r2Bucket ? (
              <>
                <div className="shrink-0 flex items-center gap-1 mb-1 px-1">
                  <Search size={10} className="text-muted shrink-0" />
                  <input
                    type="search"
                    value={r2SearchQ[r2Bucket] || ''}
                    onChange={(e) => setR2SearchQ((prev) => ({ ...prev, [r2Bucket]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && void runR2Search(r2Bucket)}
                    placeholder="Search keys…"
                    className="flex-1 min-w-0 bg-[var(--bg-app)] border border-[var(--border-subtle)]/50 rounded px-1.5 py-0.5 text-[10px] outline-none"
                  />
                  <button
                    type="button"
                    className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)]"
                    onClick={() => void runR2Search(r2Bucket)}
                  >
                    Go
                  </button>
                  {r2SearchOn ? (
                    <button
                      type="button"
                      className="text-[9px] text-[var(--solar-cyan)]"
                      onClick={() => clearR2Search(r2Bucket)}
                    >
                      List
                    </button>
                  ) : null}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                  {r2Loading && r2Objs.length === 0 && r2Prefs.length === 0 ? (
                    <div className="flex items-center gap-1 py-2 text-[10px] text-muted px-1">
                      <Loader2 size={12} className="animate-spin" /> Loading…
                    </div>
                  ) : null}

                  {!r2SearchOn &&
                    r2Prefs.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setR2Prefix(r2Bucket, p)}
                        className="flex items-center gap-1.5 w-full px-2 py-1 hover:bg-[var(--bg-hover)] rounded text-left"
                      >
                        <Folder size={13} className="text-[var(--solar-blue)] shrink-0" />
                        <span className="truncate">{shortR2Name(p)}</span>
                        <ChevronRight size={11} className="ml-auto text-muted shrink-0" />
                      </button>
                    ))}

                  {r2Objs.map((o) => (
                    <div
                      key={o.key}
                      className="flex items-center gap-0.5 px-2 py-1 hover:bg-[var(--bg-hover)] rounded group"
                    >
                      <button
                        type="button"
                        className="flex flex-1 min-w-0 items-center gap-1.5 text-left"
                        onClick={() => onOpenInEditor && void openR2Key(r2Bucket, o.key)}
                      >
                        <SetiFileIcon filename={o.key} size={13} />
                        <span className="truncate">{r2SearchOn ? o.key : shortR2Name(o.key)}</span>
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        className="p-0.5 opacity-0 group-hover:opacity-100 text-muted hover:text-[var(--solar-orange)] shrink-0"
                        onClick={() => void deleteR2Key(r2Bucket, o.key)}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}

                  {!r2Loading && !r2SearchOn && r2Prefs.length === 0 && r2Objs.length === 0 ? (
                    <p className="text-[10px] italic text-muted px-2 py-2">No objects at this prefix.</p>
                  ) : null}

                  {!r2SearchOn && r2ListTruncatedByBucket[r2Bucket] && r2ListCursorByBucket[r2Bucket] ? (
                    <button
                      type="button"
                      className="mt-1 w-full text-[10px] py-1.5 rounded bg-[var(--bg-hover)] text-[var(--solar-cyan)]"
                      onClick={() => loadMoreR2List(r2Bucket)}
                      disabled={r2Loading}
                    >
                      Load more…
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {activeSource === 'github' ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <GitHubExplorer embedded workspace_id={workspace_id} onOpenInEditor={onOpenInEditor} />
          </div>
        ) : null}

        {activeSource === 'drive' ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <GoogleDriveExplorer
              key={googleDriveOAuthRefresh}
              embedded
              onOpenInEditor={onOpenInEditor}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AgentSamFilesystemView;
