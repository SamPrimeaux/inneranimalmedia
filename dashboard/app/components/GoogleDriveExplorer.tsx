import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Cloud,
  Folder,
  File,
  ChevronDown,
  Plus,
  Upload,
  RefreshCw,
  MoreVertical,
  Settings,
  Lock,
  Loader2,
  ExternalLink,
  Trash2,
  Search,
  Download,
} from 'lucide-react';
import type { ActiveFile } from '../types';

type DriveFolderFrame = { id: string; name: string };

const TEXT_MIME_HINT = /^(text\/|application\/(json|javascript|xml)|image\/svg)/i;

function guessMimeFromFileName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    ts: 'text/typescript; charset=utf-8',
    tsx: 'text/typescript; charset=utf-8',
    jsx: 'text/javascript; charset=utf-8',
    svg: 'image/svg+xml',
    xml: 'application/xml; charset=utf-8',
    csv: 'text/csv; charset=utf-8',
  };
  return map[ext] || 'application/octet-stream';
}

export const GoogleDriveExplorer: React.FC<{
  onOpenInEditor?: (file: ActiveFile) => void;
}> = ({ onOpenInEditor }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHits, setSearchHits] = useState<any[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [folderStack, setFolderStack] = useState<DriveFolderFrame[]>([{ id: 'root', name: 'My Drive' }]);

  const currentFolderId = folderStack[folderStack.length - 1]?.id === 'root' ? 'root' : folderStack[folderStack.length - 1].id;

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    setActionMsg(null);
    try {
      const st = await fetch('/api/integrations/status', { credentials: 'same-origin' });
      const status = st.ok ? await st.json().catch(() => ({})) : {};
      if (st.ok && status && status.google === false) {
        setIsAuthenticated(false);
        setFiles([]);
        return;
      }
      const res = await fetch(
        `/api/integrations/gdrive/files?folderId=${encodeURIComponent(currentFolderId)}`,
        { credentials: 'same-origin' },
      );
      if (res.status === 401 || res.status === 400) {
        setIsAuthenticated(false);
        setFiles([]);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const list = Array.isArray(data.files) ? data.files : [];
      list.sort((a: any, b: any) => {
        const af = a.mimeType === 'application/vnd.google-apps.folder' ? 0 : 1;
        const bf = b.mimeType === 'application/vnd.google-apps.folder' ? 0 : 1;
        if (af !== bf) return af - bf;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      setFiles(list);
      setIsAuthenticated(true);
      setSearchHits(null);
    } catch (err) {
      setIsAuthenticated(false);
      setFiles([]);
      setActionMsg(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setIsLoading(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const handleConnect = () => {
    window.location.href = '/api/oauth/google/start?return_to=/dashboard/agent&connect=drive';
  };

  const isFolder = (mime: string | undefined) => mime === 'application/vnd.google-apps.folder';

  const openFolder = (id: string, name: string) => {
    setFolderStack((prev) => [...prev, { id, name }]);
  };

  const runSearch = async () => {
    const raw = searchQ.trim();
    if (raw.length < 2) {
      setActionMsg('Search: type at least 2 characters.');
      return;
    }
    const escaped = raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const driveQ = `name contains '${escaped}' and trashed=false`;
    setSearchBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/drive/search?q=${encodeURIComponent(driveQ)}`, { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) {
        setActionMsg(typeof data.error === 'string' ? data.error : 'Search failed');
        setSearchHits([]);
        return;
      }
      setSearchHits(Array.isArray(data.files) ? data.files : []);
    } catch {
      setSearchHits([]);
      setActionMsg('Search failed');
    } finally {
      setSearchBusy(false);
    }
  };

  const uploadFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setActionMsg(null);
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const buf = await f.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let j = 0; j < bytes.length; j += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(j, j + chunk) as unknown as number[]);
      }
      const base64 = btoa(binary);
      const mimeType = f.type && f.type.trim() ? f.type : guessMimeFromFileName(f.name);
      const body: Record<string, string> = {
        name: f.name,
        mimeType,
        base64,
      };
      if (currentFolderId && currentFolderId !== 'root') body.folderId = currentFolderId;
      const res = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionMsg(typeof data.error === 'string' ? data.error : `Upload failed: ${f.name}`);
        break;
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    void fetchFiles();
  };

  const createFolder = async () => {
    const name = window.prompt('New folder name');
    if (!name || !name.trim()) return;
    const res = await fetch('/api/drive/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        name: name.trim(),
        parentId: currentFolderId === 'root' ? 'root' : currentFolderId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionMsg(typeof data.error === 'string' ? data.error : JSON.stringify(data));
      return;
    }
    void fetchFiles();
  };

  const deleteDriveItem = async (id: string, label: string) => {
    if (!window.confirm(`Move to trash: ${label}?`)) return;
    const res = await fetch('/api/drive/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ fileId: id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setActionMsg(typeof data.error === 'string' ? data.error : 'Delete failed');
      return;
    }
    void fetchFiles();
  };

  const openDriveFile = async (f: { id: string; name: string; mimeType?: string }) => {
    if (!onOpenInEditor) return;
    const mime = f.mimeType || '';
    if (mime.startsWith('image/')) {
      onOpenInEditor({
        name: f.name,
        content: '',
        originalContent: '',
        driveFileId: f.id,
        isImage: true,
        previewUrl: `/api/integrations/gdrive/raw?fileId=${encodeURIComponent(f.id)}`,
      });
      return;
    }
    const isText = TEXT_MIME_HINT.test(mime) || mime === '' || mime.startsWith('text/');
    if (!isText) {
      window.open(`/api/integrations/gdrive/raw?fileId=${encodeURIComponent(f.id)}`, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const res = await fetch(`/api/integrations/gdrive/file?fileId=${encodeURIComponent(f.id)}`, {
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok || typeof data.content !== 'string') {
        window.open(`/api/integrations/gdrive/raw?fileId=${encodeURIComponent(f.id)}`, '_blank', 'noopener,noreferrer');
        return;
      }
      onOpenInEditor({
        name: f.name,
        content: data.content,
        originalContent: data.content,
        driveFileId: f.id,
      });
    } catch (e) {
      console.error(e);
      window.open(`/api/integrations/gdrive/raw?fileId=${encodeURIComponent(f.id)}`, '_blank', 'noopener,noreferrer');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col items-center justify-center p-6 text-center">
        <div className="p-10 bg-[var(--solar-blue)]/5 rounded-full mb-6 border border-dashed border-[var(--solar-blue)]/20 relative">
          <Cloud size={48} className="text-[var(--solar-blue)] animate-pulse" />
          <div className="absolute top-0 right-0 bg-[var(--bg-panel)] p-1 rounded-full border border-[var(--border-subtle)]">
            <Lock size={12} className="text-[var(--text-muted)]" />
          </div>
        </div>
        <h3 className="text-[14px] font-bold mb-2 uppercase tracking-widest text-[var(--text-heading)]">Google Drive</h3>
        <p className="text-[11px] font-mono text-[var(--text-muted)] mb-8 max-w-[220px]">
          Authorize Drive (read/write) to browse folders, upload, create folders, open files, save from the editor, and delete.
        </p>
        <button
          type="button"
          onClick={handleConnect}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--solar-blue)] border border-[var(--solar-blue)] hover:brightness-110 rounded text-[11px] font-bold text-[var(--solar-base03)] transition-all"
        >
          <ExternalLink size={14} /> Connect Google Drive
        </button>
        <div className="mt-8 p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg text-left w-full max-w-[280px]">
          <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--solar-yellow)] mb-1">
            <Settings size={12} /> Scopes
          </div>
          <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
            Uses Google OAuth with Drive file access configured on the worker (drive.file / drive.readonly as deployed).
          </p>
        </div>
      </div>
    );
  }

  const listSource = searchHits !== null ? searchHits : files;

  return (
    <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden min-h-0">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void uploadFiles(e.target.files)}
      />
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud size={14} className="text-[var(--solar-blue)]" />
            <span className="text-[11px] font-bold tracking-widest uppercase">Google Drive</span>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => void fetchFiles()}
              className="p-1 hover:bg-[var(--bg-hover)] rounded"
              title="Refresh"
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1 hover:bg-[var(--bg-hover)] rounded"
              title="Upload files to current folder"
            >
              <Upload size={12} />
            </button>
            <button type="button" onClick={() => void createFolder()} className="p-1 hover:bg-[var(--bg-hover)] rounded" title="New folder">
              <Plus size={12} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex flex-1 items-center gap-1 rounded border border-[var(--border-subtle)]/50 px-2 py-1 min-w-0">
            <Search size={12} className="text-[var(--text-muted)] shrink-0" />
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
              placeholder="Search Drive (Enter)"
              className="w-full bg-transparent text-[11px] outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
          <button
            type="button"
            disabled={searchBusy}
            onClick={() => void runSearch()}
            className="text-[10px] px-2 py-1 rounded bg-[var(--bg-hover)] hover:bg-[var(--border-subtle)] disabled:opacity-50"
          >
            Go
          </button>
          {searchHits !== null && (
            <button
              type="button"
              onClick={() => {
                setSearchHits(null);
                setSearchQ('');
                void fetchFiles();
              }}
              className="text-[10px] px-2 py-1 rounded text-[var(--solar-cyan)]"
            >
              Clear
            </button>
          )}
        </div>
        {actionMsg && <p className="text-[10px] text-[var(--solar-orange)] font-mono break-words">{actionMsg}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-hover)] cursor-pointer rounded group transition-colors"
        >
          {isExpanded ? <ChevronDown size={14} className="text-[var(--text-muted)]" /> : <ChevronDown size={14} className="text-[var(--text-muted)] rotate-[-90deg]" />}
          <Folder size={14} className="text-[var(--solar-yellow)]" />
          <span className="text-[12px] font-bold truncate">{searchHits !== null ? 'Search results' : 'Files'}</span>
          {isLoading && <Loader2 size={10} className="animate-spin ml-2 text-[var(--solar-blue)]" />}
        </div>

        {searchHits === null && folderStack.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 px-2 py-1 text-[9px] font-mono text-[var(--text-muted)] border-b border-[var(--border-subtle)]/30 mb-1">
            {folderStack.map((frame, idx) => (
              <span key={`${frame.id}-${idx}`} className="flex items-center gap-1">
                {idx > 0 && <span className="opacity-40">/</span>}
                <button
                  type="button"
                  className="hover:text-[var(--solar-cyan)] hover:underline truncate max-w-[120px]"
                  onClick={() => setFolderStack((prev) => prev.slice(0, idx + 1))}
                >
                  {frame.name}
                </button>
              </span>
            ))}
          </div>
        )}

        {isExpanded && (
          <div className="ml-2 mt-1 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-1">
            {listSource.length === 0 && !isLoading && (
              <div className="p-2 text-[10px] text-[var(--text-muted)] italic font-mono">Nothing here.</div>
            )}
            {listSource.map((f: any) => (
              <div key={f.id} className="flex items-center gap-1 group rounded hover:bg-[var(--bg-hover)] pr-1">
                <FileRow
                  name={f.name}
                  type={isFolder(f.mimeType) ? 'folder' : 'file'}
                  onOpen={
                    isFolder(f.mimeType)
                      ? () => {
                          setSearchHits(null);
                          openFolder(f.id, f.name);
                        }
                      : () => void openDriveFile(f)
                  }
                />
                <button
                  type="button"
                  className="p-1 opacity-50 hover:opacity-100 text-[var(--text-muted)] shrink-0"
                  title="Open raw (new tab)"
                  onClick={() =>
                    window.open(`/api/integrations/gdrive/raw?fileId=${encodeURIComponent(f.id)}`, '_blank', 'noopener,noreferrer')
                  }
                >
                  <Download size={11} />
                </button>
                <button
                  type="button"
                  className="p-1 opacity-50 hover:opacity-100 text-[var(--text-muted)] hover:text-[var(--solar-orange)] shrink-0"
                  title="Delete"
                  onClick={() => void deleteDriveItem(f.id, f.name)}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-[var(--border-subtle)] bg-[var(--bg-app)] text-[9px] text-[var(--text-muted)] shrink-0 leading-relaxed">
        Text and SVG open in Monaco; other types open as raw download. Save in the editor writes back via POST /api/drive/file.
      </div>
    </div>
  );
};

const FileRow = ({
  name,
  type,
  onOpen,
}: {
  name: string;
  type: 'file' | 'folder';
  onOpen?: () => void | Promise<void>;
}) => (
  <button
    type="button"
    onClick={() => {
      if (onOpen) void onOpen();
    }}
    className={`flex flex-1 min-w-0 items-center gap-2 px-2 py-1 rounded text-[11px] transition-all text-left ${
      onOpen ? 'hover:bg-[var(--bg-hover)] cursor-pointer' : ''
    }`}
  >
    {type === 'folder' ? <Folder size={12} className="text-[var(--solar-blue)] shrink-0" /> : <File size={12} className="text-[var(--text-muted)] shrink-0" />}
    <span className="truncate">{name}</span>
    <MoreVertical size={10} className="ml-auto opacity-0 group-hover:opacity-40 shrink-0" />
  </button>
);
