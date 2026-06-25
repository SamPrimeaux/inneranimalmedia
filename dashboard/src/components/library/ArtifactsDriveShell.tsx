import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLibraryWorkspace } from '../../lib/library/useLibraryWorkspace';
import type { LibraryItem, SourceFilter } from '../../lib/library/types';
import { NAV_RAIL_MAP } from '../../lib/library/types';
import { LibraryFileIcon, LibraryThumb, sourceLabel } from './LibraryThumb';
import '../../styles/library.css';

const CONTEXT_ACTIONS = ['Open', 'Share', 'Rename', 'Download', 'Move to trash'] as const;

const NEW_MENU_ITEMS = [
  'New folder',
  'File upload',
  'Folder upload',
  'Google Docs',
] as const;

const NAV_ITEMS = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'activity', label: 'Activity', icon: 'activity' },
  { key: 'projects', label: 'My artifacts', icon: 'projects' },
  { key: 'workspaces', label: 'R2 Storage', icon: 'workspaces' },
  { key: 'my-drive', label: 'Google Drive', icon: 'drive' },
  { key: 'shared', label: 'Shared drives', icon: 'shared' },
  { key: 'computers', label: 'Local folder', icon: 'computers' },
  { key: 'shared-with-me', label: 'Shared with me', icon: 'sharedWithMe' },
  { key: 'recent', label: 'Recent', icon: 'recent' },
  { key: 'starred', label: 'Starred', icon: 'starred' },
  { key: 'trash', label: 'Trash', icon: 'trash' },
] as const;

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, JSX.Element> = {
    home: <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />,
    activity: (
      <>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    projects: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    workspaces: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    drive: <path d="M3 7h7l2 2h9v10H3z" />,
    shared: (
      <>
        <path d="M3 7h7l2 2h9v10H3z" />
        <path d="M8 13h8" />
      </>
    ),
    computers: (
      <>
        <path d="M4 5h16v12H4zM8 21h8" />
      </>
    ),
    sharedWithMe: <path d="M16 11a4 4 0 1 0-8 0M4 20a8 8 0 0 1 16 0" />,
    recent: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    starred: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.8 6.4 21.2 7.5 15 3 10.6l6.2-.9Z" />,
    trash: (
      <>
        <path d="M4 7h16M9 7V5h6v2M6 7l1 14h10l1-14" />
      </>
    ),
    storage: <path d="M4 15a4 4 0 0 0 4 4h9a5 5 0 0 0 1-9.9A7 7 0 0 0 5.8 7.6 4.5 4.5 0 0 0 4 15Z" />,
  };
  return (
    <svg className="drive-icon" viewBox="0 0 24 24" aria-hidden>
      {paths[name]}
    </svg>
  );
}

function KebabButton() {
  return (
    <span className="kebab" role="presentation" aria-hidden>
      <svg className="drive-icon" viewBox="0 0 24 24">
        <path d="M12 6h.01M12 12h.01M12 18h.01" strokeWidth={3} />
      </svg>
    </span>
  );
}

function railForNavKey(key: string): string | undefined {
  return NAV_RAIL_MAP[key];
}

export function ArtifactsDriveShell() {
  const ws = useLibraryWorkspace();
  const [, setSearchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: LibraryItem } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sourceFilterOpen, setSourceFilterOpen] = useState(false);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const openFileDetails = useCallback(
    (item: LibraryItem) => {
      setSelected(item);
      setDrawerOpen(true);
      showToast(`${item.name} selected`);
    },
    [showToast],
  );

  const handleItemClick = useCallback(
    (item: LibraryItem) => {
      setSelected(item);
      if (item.kind === 'folder') {
        ws.navigateIntoFolder(item);
        return;
      }
      openFileDetails(item);
    },
    [openFileDetails, ws],
  );

  const clearSessionFilter = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('session_id');
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    const onDocClick = () => {
      setNewMenuOpen(false);
      setContextMenu(null);
      setSourceFilterOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const handleContextMenu = (e: MouseEvent, item: LibraryItem) => {
    e.preventDefault();
    setSelected(item);
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const openSelected = useCallback(
    (item: LibraryItem) => {
      if (item.kind === 'folder') {
        ws.navigateIntoFolder(item);
        return;
      }
      if (item.rawUrl) {
        window.open(item.rawUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      openFileDetails(item);
    },
    [openFileDetails, ws],
  );

  const driveNeedsConnect = ws.filters.rail === 'drive' && ws.driveConnected === false;
  const primaryError = ws.errors[0];

  return (
    <div className="artifacts-drive-shell flex-1 min-h-0 min-w-0">
      <div className="drive-app">
        <header className="topbar">
          <div className="brand">
            <button type="button" className="hamb" aria-label="Main menu">
              <svg className="drive-icon" viewBox="0 0 24 24">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <span className="drive-mark">
              <span className="drive-tri" />
            </span>
            <span className="label">Library</span>
          </div>

          <label className="search">
            <svg className="drive-icon" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              placeholder="Search files across sources"
              value={ws.filters.query}
              onChange={(e) => ws.setQuery(e.target.value)}
            />
            <button type="button" className="tune" aria-label="Search options" onClick={() => void ws.refresh()}>
              <svg className="drive-icon" viewBox="0 0 24 24">
                <path d="M4 7h10M18 7h2M4 17h2M10 17h10M7 5v4M15 15v4" />
              </svg>
            </button>
          </label>

          <div />

          <div className="top-actions">
            <button type="button" className="icon-btn" title="Refresh" onClick={() => void ws.refresh()}>
              <svg className="drive-icon" viewBox="0 0 24 24">
                <path d="M4 4v6h6M20 20v-6h-6" />
                <path d="M20 9a8 8 0 0 0-15-3M4 15a8 8 0 0 0 15 3" />
              </svg>
            </button>
            <button type="button" className="user-pill">
              <span className="iam-logo">IA</span>
            </button>
          </div>
        </header>

        <aside className="drive-side">
          <button
            type="button"
            className="new-btn"
            onClick={(e) => {
              e.stopPropagation();
              setNewMenuOpen((v) => !v);
            }}
          >
            <svg className="drive-icon" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>New</span>
          </button>

          <nav className="nav">
            {NAV_ITEMS.map((item) => {
              const rail = railForNavKey(item.key);
              const active = rail ? ws.filters.rail === rail : false;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`nav-item${active ? ' active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.key === 'computers') {
                      if (!ws.localFolderName) void ws.connectLocalFolder();
                      else ws.setNavKey(item.key);
                      return;
                    }
                    if (rail) ws.setNavKey(item.key);
                    else showToast(`${item.label} — coming soon`);
                  }}
                >
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <div className="storage">
              <NavIcon name="storage" />
              <div className="meter">
                <div className="bar" />
              </div>
              <small>{ws.storageLabel ?? (ws.r2Bucket ? `${ws.r2Bucket} · R2` : 'Storage')}</small>
            </div>
          </nav>
        </aside>

        <main className="drive-main">
          <div className="main-head">
            <div className="title">
              {ws.canNavigateUp ? (
                <button type="button" className="icon-btn title-back" onClick={ws.navigateUp} aria-label="Back">
                  ←
                </button>
              ) : null}
              {ws.pageTitle}{' '}
              <svg className="drive-icon title-chevron" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
            <div className="view-tools">
              <div className="segmented">
                <button
                  type="button"
                  className={viewMode === 'list' ? 'active' : ''}
                  title="List"
                  onClick={() => setViewMode('list')}
                >
                  <svg className="drive-icon" viewBox="0 0 24 24">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={viewMode === 'grid' ? 'active' : ''}
                  title="Grid"
                  onClick={() => setViewMode('grid')}
                >
                  <svg className="drive-icon" viewBox="0 0 24 24">
                    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
                  </svg>
                </button>
              </div>
              <button type="button" className="icon-btn" title="Details" onClick={() => setDrawerOpen((v) => !v)}>
                <svg className="drive-icon" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 10v6M12 7h.01" />
                </svg>
              </button>
            </div>
          </div>

          <div className="filters">
            <button type="button" className="filter disabled">
              <svg className="drive-icon" viewBox="0 0 24 24">
                <path d="M4 7h7l2 2h7v9H4z" />
              </svg>{' '}
              {ws.items.length} items
            </button>
            <span className="filter-divider">|</span>
            <button
              type="button"
              className="filter"
              onClick={(e) => {
                e.stopPropagation();
                setSourceFilterOpen((v) => !v);
              }}
            >
              Source: {ws.filters.source === 'all' ? 'All' : sourceLabel(ws.filters.source)}{' '}
              <svg className="drive-icon" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {sourceFilterOpen ? (
              <div className="new-menu open" style={{ left: 'auto', top: 'auto', position: 'absolute', zIndex: 35 }}>
                {(['all', 'artifacts', 'drive', 'r2', 'local'] as SourceFilter[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      ws.setSourceFilter(s);
                      setSourceFilterOpen(false);
                    }}
                  >
                    {s === 'all' ? 'All sources' : sourceLabel(s)}
                  </button>
                ))}
              </div>
            ) : null}
            <button type="button" className="filter" onClick={() => ws.setTypeFilter('all')}>
              Type: {ws.filters.type === 'all' ? 'All' : ws.filters.type}
            </button>
          </div>

          {ws.sessionId ? (
            <div className="lib-session-banner">
              <span>
                Chat session filter · <code>{ws.sessionId.slice(0, 12)}…</code>
              </span>
              <button type="button" className="close-x" onClick={clearSessionFilter} aria-label="Clear session filter">
                ×
              </button>
            </div>
          ) : null}

          {driveNeedsConnect && noticeVisible ? (
            <section className="notice">
              <div className="notice-icon">G</div>
              <div>
                <strong>Connect Google Drive</strong>
                <p>Authorize Drive to browse folders and files inside your library.</p>
              </div>
              <span className="spacer" />
              <button type="button" className="upgrade" onClick={ws.connectDrive}>
                Connect
              </button>
              <button type="button" className="close-x" onClick={() => setNoticeVisible(false)} aria-label="Dismiss">
                ×
              </button>
            </section>
          ) : null}

          {primaryError && !driveNeedsConnect ? (
            <div className="lib-error">
              {primaryError}
              {ws.filters.rail === 'local' ? (
                <button type="button" onClick={() => void ws.connectLocalFolder()}>
                  Choose local folder
                </button>
              ) : null}
            </div>
          ) : null}

          <section className={`drive-content${viewMode === 'list' ? ' list-view' : ''}`}>
            {ws.loading ? (
              <div className="lib-loading">Loading library…</div>
            ) : ws.folders.length === 0 && ws.files.length === 0 ? (
              <div className="lib-empty">
                No files found
                {ws.filters.rail === 'drive' && ws.driveConnected === false ? (
                  <>
                    {' '}
                    —{' '}
                    <button type="button" className="upgrade" style={{ display: 'inline', padding: '4px 12px' }} onClick={ws.connectDrive}>
                      Connect Drive
                    </button>
                  </>
                ) : null}
              </div>
            ) : (
              <>
                <div className="list-head">
                  <span>Name</span>
                  <span className="sort-dot">↓</span>
                </div>

                {ws.folders.length > 0 ? (
                  <div className="folder-grid">
                    {ws.folders.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`folder-card${selected?.id === item.id ? ' selected' : ''}`}
                        onClick={() => handleItemClick(item)}
                        onContextMenu={(e) => handleContextMenu(e, item)}
                      >
                        <LibraryFileIcon item={item} />
                        <span className="file-name">{item.name}</span>
                        <span className="lib-source-tag">{sourceLabel(item.source)}</span>
                        <KebabButton />
                      </button>
                    ))}
                  </div>
                ) : null}

                {ws.files.length > 0 ? (
                  <div className="file-grid">
                    {ws.files.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`file-card${selected?.id === item.id ? ' selected' : ''}`}
                        data-modified={`${item.modifiedLabel ?? 'Recently'} · ${sourceLabel(item.source)}`}
                        onClick={() => handleItemClick(item)}
                        onContextMenu={(e) => handleContextMenu(e, item)}
                      >
                        <div className="card-head">
                          <LibraryFileIcon item={item} />
                          <span className="file-name">{item.name}</span>
                          <KebabButton />
                        </div>
                        <LibraryThumb item={item} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </section>
        </main>

        <aside className="drive-rail">
          <button type="button" className="rbtn" title="Calendar">
            31
          </button>
          <button type="button" className="rbtn" title="Keep">
            💡
          </button>
          <button type="button" className="rbtn" title="Tasks">
            ✓
          </button>
          <button type="button" className="rbtn" title="Contacts">
            👤
          </button>
          <div className="plus">
            <button type="button" className="rbtn">
              +
            </button>
          </div>
        </aside>
      </div>

      <aside className={`drawer${drawerOpen ? ' open' : ''}`}>
        <div className="drawer-head">
          <strong>{selected?.name ?? 'Details'}</strong>
          <button type="button" className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Close">
            <svg className="drive-icon" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="drawer-body">
          {selected ? (
            <>
              <div className="preview-box">{selected.kind === 'file' ? <LibraryThumb item={selected} /> : <LibraryFileIcon item={selected} />}</div>
              <div className="meta">
                <div className="meta-row">
                  <span>Source</span>
                  <strong>{sourceLabel(selected.source)}</strong>
                </div>
                <div className="meta-row">
                  <span>Type</span>
                  <strong>{selected.kind === 'folder' ? 'Folder' : selected.displayKind.toUpperCase()}</strong>
                </div>
                <div className="meta-row">
                  <span>Owner</span>
                  <strong>{selected.ownerName ?? '—'}</strong>
                </div>
                <div className="meta-row">
                  <span>Modified</span>
                  <strong>{selected.modifiedLabel ?? '—'}</strong>
                </div>
                {selected.rawUrl ? (
                  <div className="meta-row">
                    <span>URL</span>
                    <strong style={{ fontSize: 11, wordBreak: 'break-all' }}>{selected.rawUrl}</strong>
                  </div>
                ) : null}
              </div>
              <button type="button" className="upgrade" style={{ marginTop: 16, width: '100%' }} onClick={() => openSelected(selected)}>
                Open
              </button>
            </>
          ) : null}
        </div>
      </aside>

      <div className={`new-menu${newMenuOpen ? ' open' : ''}`} onClick={(e) => e.stopPropagation()}>
        {NEW_MENU_ITEMS.map((label) => (
          <button
            key={label}
            type="button"
            className="menu-item"
            onClick={() => {
              setNewMenuOpen(false);
              showToast(`${label} — wire upload next`);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {contextMenu ? (
        <div
          className="context-menu open"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {CONTEXT_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              className="menu-item"
              onClick={() => {
                const item = contextMenu.item;
                setContextMenu(null);
                if (action === 'Open') openSelected(item);
                else if (action === 'Download' && item.rawUrl) window.open(item.rawUrl, '_blank');
                else showToast(action);
              }}
            >
              {action}
            </button>
          ))}
        </div>
      ) : null}

      <div className={`toast${toast ? ' show' : ''}`}>{toast ?? 'Selected'}</div>
    </div>
  );
}

export default ArtifactsDriveShell;
