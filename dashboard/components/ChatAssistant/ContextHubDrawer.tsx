import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  Check,
  ChevronRight,
  ExternalLink,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { ConnectableIntegration } from './composer/useComposerIntegrations';
import type { ChatComposerSource } from './composer/types';
import { WEB_SEARCH_SOURCE, WEB_SEARCH_SOURCE_ID, SANDBOX_AGENT_SOURCE_ID } from './composer/types';
import { GithubContextLane } from './GithubContextLane';
import type { ExecLane } from '../../src/lib/execLane';
import { EXEC_LANE_LABELS } from '../../src/lib/execLane';
import { openIntegrationOAuthPopup } from '../../src/lib/integrationOAuthPopup';

export type ContextHubLane = 'hub' | 'github' | 'connectors' | 'tool_access';

export type ContextHubDrawerProps = {
  open: boolean;
  onClose: () => void;
  initialLane?: ContextHubLane;
  workspaceId: string | null | undefined;
  githubRepoContext: string | null;
  githubFilePath?: string | null;
  pinnedLabel?: string;
  onClearPinned?: () => void;
  onSelectRepo: (fullName: string) => void;
  onSelectFile?: (
    repo: string,
    path: string,
    branch: string,
    meta?: { content?: string | null; contentSha?: string | null; contentTruncated?: boolean },
  ) => void;
  onBrowseFiles?: (fullName: string) => void;
  connectables: ConnectableIntegration[];
  connectablesLoading: boolean;
  activeSourceIds: Set<string>;
  webSearchAllowed: boolean;
  sandboxAgentAllowed?: boolean;
  onUploadFile: () => void;
  onUploadImage: () => void;
  onToggleWebSearch: () => void;
  onToggleSandboxAgent?: () => void;
  onToggleSource: (source: ChatComposerSource, enabled: boolean) => void;
  sourceFromIntegration: (item: ConnectableIntegration) => ChatComposerSource;
  execLane: ExecLane;
  onExecLaneChange: (lane: ExecLane) => void;
  onIntegrationsRefresh?: () => void | Promise<void>;
};

const SOURCE_TILES = [
  {
    id: 'local',
    label: 'Local',
    icon: HardDrive,
    accent: 'var(--solar-cyan)',
    lane: 'hub' as const,
    action: 'files' as const,
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    iconSrc: '/assets/integrations/cloudflare.svg',
    lane: 'connectors' as const,
    focusProvider: 'cloudflare_oauth',
  },
  {
    id: 'github',
    label: 'GitHub',
    iconSrc: '/assets/integrations/github.svg',
    lane: 'github' as const,
  },
  {
    id: 'drive',
    label: 'Drive',
    iconSrc: '/assets/integrations/google.svg',
    lane: 'connectors' as const,
    focusProvider: 'google_drive',
  },
] as const;

function oauthReturnTo(): string {
  return encodeURIComponent(
    typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/dashboard/agent',
  );
}

export function ContextHubDrawer({
  open,
  onClose,
  initialLane = 'hub',
  workspaceId,
  githubRepoContext,
  githubFilePath = null,
  pinnedLabel,
  onClearPinned,
  onSelectRepo,
  onSelectFile,
  onBrowseFiles,
  connectables,
  connectablesLoading,
  activeSourceIds,
  webSearchAllowed,
  sandboxAgentAllowed = true,
  onUploadFile,
  onUploadImage,
  onToggleWebSearch,
  onToggleSandboxAgent,
  onToggleSource,
  sourceFromIntegration,
  execLane,
  onExecLaneChange,
  onIntegrationsRefresh,
}: ContextHubDrawerProps) {
  const [lane, setLane] = useState<ContextHubLane>(initialLane);
  const [connectorFilter, setConnectorFilter] = useState('');
  const [connectBusy, setConnectBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) setLane(initialLane);
  }, [open, initialLane]);

  useEffect(() => {
    if (!open) {
      setLane('hub');
      setConnectorFilter('');
    }
  }, [open]);

  const filteredConnectables = useMemo(() => {
    const q = connectorFilter.trim().toLowerCase();
    if (!q) return connectables;
    return connectables.filter(
      (c) => c.label.toLowerCase().includes(q) || c.providerKey.toLowerCase().includes(q),
    );
  }, [connectables, connectorFilter]);

  if (!open || typeof document === 'undefined') return null;

  const closeAll = () => onClose();

  const runOAuthConnect = async (item: ConnectableIntegration) => {
    if (item.connected) return;
    if (!item.connectUrl.startsWith('/')) {
      window.open(item.connectUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setConnectBusy(item.providerKey);
    try {
      const result = await openIntegrationOAuthPopup(item.connectUrl, item.providerKey);
      if (result.ok) await onIntegrationsRefresh?.();
    } finally {
      setConnectBusy(null);
    }
  };

  const hubHeaderTitle =
    lane === 'github'
      ? 'GitHub'
      : lane === 'connectors'
        ? 'Connectors'
        : lane === 'tool_access'
          ? 'Tool access'
          : 'Add to context';

  const sheet = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[118] bg-black/45"
        aria-label="Close context hub"
        onClick={closeAll}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[119] flex flex-col rounded-t-2xl border-t border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] shadow-[0_-8px_32px_rgba(0,0,0,0.35)]"
        style={{
          height: 'min(92dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 1.5rem))',
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 1.5rem)',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Context hub"
      >
        <div className="flex shrink-0 flex-col items-center pt-2 pb-1">
          <div className="h-1.5 w-10 rounded-full bg-[var(--dashboard-border)]" aria-hidden />
        </div>

        {lane !== 'github' ? (
          <div className="shrink-0 flex items-center justify-between gap-2 border-b border-[var(--dashboard-border)] px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-[var(--dashboard-text)]">{hubHeaderTitle}</h2>
              {lane === 'hub' ? (
                <p className="text-[11px] text-[var(--dashboard-muted)]">Files, sources, and execution lane</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={closeAll}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--dashboard-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--dashboard-text)]"
            >
              <X size={18} />
            </button>
          </div>
        ) : null}

        {lane === 'hub' ? (
          <div className="min-h-0 flex-1 overflow-y-auto chat-hide-scroll px-4 pb-4">
            {pinnedLabel ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--solar-cyan)]/30 bg-[var(--scene-bg)] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--dashboard-text)]">{pinnedLabel}</span>
                {onClearPinned ? (
                  <button
                    type="button"
                    aria-label="Clear pinned context"
                    onClick={onClearPinned}
                    className="shrink-0 rounded-md p-1 text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onUploadFile();
                  closeAll();
                }}
                className="flex items-center gap-2 rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] px-3 py-3 text-left text-[13px] text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)]"
              >
                <Paperclip size={16} className="shrink-0 text-[var(--dashboard-muted)]" />
                Add files
              </button>
              <button
                type="button"
                onClick={() => {
                  onUploadImage();
                  closeAll();
                }}
                className="flex items-center gap-2 rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] px-3 py-3 text-left text-[13px] text-[var(--dashboard-text)] hover:bg-[var(--bg-hover)]"
              >
                <ImageIcon size={16} className="shrink-0 text-[var(--dashboard-muted)]" />
                Image
              </button>
            </div>

            <p className="mt-5 mb-2 text-[9px] font-bold uppercase tracking-widest text-[var(--dashboard-muted)]">
              Sources
            </p>
            <div className="grid grid-cols-4 gap-2">
              {SOURCE_TILES.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => {
                    if ('action' in tile && tile.action === 'files') {
                      onUploadFile();
                      closeAll();
                      return;
                    }
                    if (tile.lane === 'github') {
                      setLane('github');
                      return;
                    }
                    setLane('connectors');
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] px-1 py-3 hover:bg-[var(--bg-hover)]"
                >
                  {'iconSrc' in tile && tile.iconSrc ? (
                    <img src={tile.iconSrc} alt="" className="h-6 w-6 object-contain" />
                  ) : (
                    <HardDrive size={22} style={{ color: 'var(--solar-cyan)' }} />
                  )}
                  <span className="text-[10px] font-medium text-[var(--dashboard-text)]">{tile.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-1 rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] p-1">
              {webSearchAllowed ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-[var(--bg-hover)]"
                  onClick={onToggleWebSearch}
                >
                  <span className="inline-flex items-center gap-2 text-[var(--dashboard-text)]">
                    <Globe size={15} className="text-[var(--dashboard-muted)]" />
                    Web search
                  </span>
                  {activeSourceIds.has(WEB_SEARCH_SOURCE_ID) ? (
                    <Check size={15} className="text-[var(--solar-cyan)]" />
                  ) : null}
                </button>
              ) : null}
              {sandboxAgentAllowed && onToggleSandboxAgent ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-[var(--bg-hover)]"
                  onClick={onToggleSandboxAgent}
                >
                  <span className="inline-flex items-center gap-2 text-[var(--dashboard-text)]">
                    <Box size={15} className="text-[var(--dashboard-muted)]" />
                    Remote sandbox
                  </span>
                  {activeSourceIds.has(SANDBOX_AGENT_SOURCE_ID) ? (
                    <Check size={15} className="text-[var(--solar-cyan)]" />
                  ) : null}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setLane('tool_access')}
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] px-3 py-3 text-left hover:bg-[var(--bg-hover)]"
            >
              <span className="text-[13px] text-[var(--dashboard-text)]">
                Run on: <span className="font-medium text-[var(--solar-cyan)]">{EXEC_LANE_LABELS[execLane]}</span>
              </span>
              <ChevronRight size={16} className="text-[var(--dashboard-muted)]" />
            </button>

            <button
              type="button"
              onClick={() => setLane('connectors')}
              className="mt-2 flex w-full items-center justify-between rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] px-3 py-3 text-left hover:bg-[var(--bg-hover)]"
            >
              <span className="text-[13px] text-[var(--dashboard-text)]">Connectors &amp; apps</span>
              <ChevronRight size={16} className="text-[var(--dashboard-muted)]" />
            </button>
          </div>
        ) : null}

        {lane === 'github' ? (
          <GithubContextLane
            embedded
            workspaceId={workspaceId}
            githubRepoContext={githubRepoContext}
            onSelectRepo={onSelectRepo}
            onSelectFile={onSelectFile}
            onBrowseFiles={onBrowseFiles}
            onClose={closeAll}
            onBackToHub={() => setLane('hub')}
            onOAuthConnected={() => void onIntegrationsRefresh?.()}
          />
        ) : null}

        {lane === 'tool_access' ? (
          <div className="min-h-0 flex-1 overflow-y-auto chat-hide-scroll px-4 py-3">
            <p className="mb-3 text-[12px] text-[var(--dashboard-muted)]">
              On mobile, Cloud desk keeps working when your Mac is asleep. Local Mac uses your desk tunnel only.
            </p>
            <div className="space-y-2">
              {(['auto', 'remote', 'local', 'sandbox'] as ExecLane[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onExecLaneChange(opt);
                    setLane('hub');
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-[13px] ${
                    execLane === opt
                      ? 'border-[var(--solar-cyan)]/50 bg-[var(--scene-bg)] ring-1 ring-[var(--solar-cyan)]/30'
                      : 'border-[var(--dashboard-border)] bg-[var(--scene-bg)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span className="text-[var(--dashboard-text)]">{EXEC_LANE_LABELS[opt]}</span>
                  {execLane === opt ? <Check size={15} className="text-[var(--solar-cyan)]" /> : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLane('hub')}
              className="mt-4 w-full rounded-xl border border-[var(--dashboard-border)] py-2.5 text-[12px] text-[var(--dashboard-muted)]"
            >
              Back
            </button>
          </div>
        ) : null}

        {lane === 'connectors' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-4 pb-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dashboard-muted)]" />
                <input
                  type="search"
                  value={connectorFilter}
                  onChange={(e) => setConnectorFilter(e.target.value)}
                  placeholder="Search connections"
                  className="w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--scene-bg)] py-2 pl-8 pr-3 text-[13px] outline-none focus:border-[var(--solar-cyan)]"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto chat-hide-scroll px-2 pb-2">
              {connectablesLoading ? (
                <p className="px-3 py-4 text-[12px] text-[var(--dashboard-muted)]">Loading connections…</p>
              ) : filteredConnectables.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-[var(--dashboard-muted)]">No matches</p>
              ) : (
                filteredConnectables.map((item) => {
                  const src = sourceFromIntegration(item);
                  const active = activeSourceIds.has(src.id);
                  const busy = connectBusy === item.providerKey;
                  return (
                    <div
                      key={item.providerKey}
                      className="flex items-center gap-1 rounded-lg px-2 py-0.5 hover:bg-[var(--bg-hover)]/60"
                    >
                      <button
                        type="button"
                        disabled={busy}
                        className="flex flex-1 min-w-0 items-center justify-between gap-2 px-1 py-2 text-left text-[13px] disabled:opacity-60"
                        onClick={() => {
                          if (item.connected) {
                            onToggleSource(src, !active);
                            return;
                          }
                          void runOAuthConnect(item);
                        }}
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          {busy ? (
                            <Loader2 size={14} className="shrink-0 animate-spin text-[var(--solar-cyan)]" />
                          ) : (
                            <Link2 size={14} className="shrink-0 text-[var(--dashboard-muted)]" />
                          )}
                          <span className="truncate text-[var(--dashboard-text)]">{item.label}</span>
                        </span>
                        {item.connected ? (
                          active ? (
                            <Check size={14} className="text-[var(--solar-cyan)] shrink-0" />
                          ) : (
                            <span className="text-[10px] text-[var(--dashboard-muted)] shrink-0">off</span>
                          )
                        ) : (
                          <span className="text-[10px] text-amber-300/90 shrink-0">
                            {busy ? 'connecting…' : 'connect'}
                          </span>
                        )}
                      </button>
                      {!item.connected && item.connectUrl.startsWith('/') ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="p-1.5 text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] disabled:opacity-50"
                          title="Connect in popup"
                          onClick={(e) => {
                            e.stopPropagation();
                            void runOAuthConnect(item);
                          }}
                        >
                          <ExternalLink size={13} />
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
              <button
                type="button"
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] text-[var(--dashboard-muted)] hover:bg-[var(--bg-hover)]"
                onClick={() => {
                  window.location.href = '/dashboard/settings?section=integrations';
                }}
              >
                <Plus size={14} />
                Connect more
              </button>
              <button
                type="button"
                onClick={() => setLane('hub')}
                className="mt-2 w-full rounded-xl border border-[var(--dashboard-border)] py-2.5 text-[12px] text-[var(--dashboard-muted)]"
              >
                Back
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
