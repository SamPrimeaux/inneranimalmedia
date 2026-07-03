import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Cloud, FolderOpen, Network, Play } from 'lucide-react';
import {
  fetchTerminalSplashStatus,
  type SplashLaneTone,
  type SplashStatusLane,
  type TerminalSplashStatus,
} from '../src/lib/terminalSplashStatus';
import { listTerminalWorkspaceSessions } from '../src/lib/terminalWorkspacePrefs';

export type SplashAction = 'local' | 'cloud' | 'sandbox' | 'sdk';

const SPLASH_IMG = `${import.meta.env.BASE_URL}terminal/gorilla-splash.png`;

const LANE_OPTIONS: { action: SplashAction; label: string }[] = [
  { action: 'local', label: 'Local' },
  { action: 'cloud', label: 'VM' },
  { action: 'sandbox', label: 'Container' },
  { action: 'sdk', label: 'SDK' },
];

function laneToneColor(tone: SplashLaneTone): string {
  switch (tone) {
    case 'ok':
      return 'var(--solar-green, #859900)';
    case 'warn':
      return 'var(--solar-yellow, #b58900)';
    case 'loading':
      return 'var(--solar-cyan, #2aa198)';
    default:
      return 'var(--text-muted)';
  }
}

function StatusCell({
  icon: Icon,
  lane,
  variant = 'default',
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  lane: SplashStatusLane;
  variant?: 'default' | 'workspace';
}) {
  const isWorkspace = variant === 'workspace';
  const primary = isWorkspace && lane.name ? lane.name : lane.value;
  const secondary = isWorkspace
    ? lane.value
    : lane.cwd
      ? lane.cwd
      : lane.detail;

  return (
    <div
      className="iam-terminal-splash-status-cell"
      style={{
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 12px',
        borderRight: '1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent)',
      }}
    >
      <Icon size={14} strokeWidth={1.75} style={{ color: 'var(--solar-cyan)', flexShrink: 0 }} />
      <div style={{ minWidth: 0, lineHeight: 1.25 }}>
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {lane.label}
        </div>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: isWorkspace ? 'var(--text-main)' : laneToneColor(lane.tone),
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={lane.name || lane.value}
        >
          {primary}
        </div>
        {secondary ? (
          <div
            style={{
              fontSize: '10px',
              color: laneToneColor(lane.tone),
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              opacity: 0.92,
            }}
            title={secondary}
          >
            {secondary}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface TerminalWelcomeSplashProps {
  workspaceId?: string;
  workspaceLabel?: string;
  onAction: (action: SplashAction) => void;
}

export function TerminalWelcomeSplash({
  workspaceId,
  workspaceLabel = '',
  onAction,
}: TerminalWelcomeSplashProps) {
  const [status, setStatus] = useState<TerminalSplashStatus | null>(null);
  const [showLanes, setShowLanes] = useState(false);
  const [loading, setLoading] = useState(true);

  const [otherSessions, setOtherSessions] = useState(() =>
    listTerminalWorkspaceSessions(workspaceId),
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchTerminalSplashStatus(workspaceId, workspaceLabel);
      setStatus(next);
      setOtherSessions(listTerminalWorkspaceSessions(workspaceId));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, workspaceLabel]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const handleStart = useCallback(() => {
    const preferred = status?.preferredLane;
    if (preferred === 'local' || preferred === 'cloud' || preferred === 'sandbox') {
      onAction(preferred);
      return;
    }
    setShowLanes(true);
  }, [onAction, status?.preferredLane]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !showLanes) {
        e.preventDefault();
        handleStart();
        return;
      }
      if (showLanes) {
        const idx = Number.parseInt(e.key, 10);
        if (idx >= 1 && idx <= LANE_OPTIONS.length) {
          onAction(LANE_OPTIONS[idx - 1].action);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleStart, onAction, showLanes]);

  const lanes = status ?? {
    workspace: { label: 'Workspace', value: loading ? '…' : '—', tone: 'loading' as const },
    runtime: { label: 'Runtime', value: loading ? '…' : '—', tone: 'loading' as const },
    tunnel: { label: 'Tunnel', value: loading ? '…' : '—', tone: 'loading' as const },
    agent: { label: 'Agent', value: loading ? '…' : '—', tone: 'loading' as const },
    preferredLane: null,
    targets: null,
  };

  return (
    <div
      className="iam-terminal-welcome-splash"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        background: 'var(--terminal-surface, #060e14)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 16px 12px',
          gap: '20px',
        }}
      >
        <img
          src={SPLASH_IMG}
          alt="Inner Animal Media"
          style={{
            width: 'min(520px, 100%)',
            height: 'auto',
            maxHeight: 'min(42vh, 280px)',
            objectFit: 'contain',
            imageRendering: 'pixelated',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
          draggable={false}
        />

        {!showLanes ? (
          <button
            type="button"
            onClick={handleStart}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
              fontSize: 'clamp(22px, 4vw, 32px)',
              fontWeight: 700,
              color: 'var(--solar-yellow, #b58900)',
              letterSpacing: '0.02em',
              padding: '8px 12px',
              borderRadius: '6px',
            }}
            className="hover:bg-[var(--bg-hover)]/30 transition-colors"
          >
            Start
            <Play size={22} fill="currentColor" strokeWidth={0} style={{ color: 'var(--solar-cyan)' }} />
          </button>
        ) : (
          <div style={{ width: 'min(320px, 100%)' }}>
            <div
              style={{
                fontSize: '10px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '10px',
                textAlign: 'center',
              }}
            >
              Choose lane
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {LANE_OPTIONS.map(({ action, label }, index) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => onAction(action)}
                  style={{
                    cursor: 'pointer',
                    background: 'color-mix(in srgb, var(--bg-panel) 80%, transparent)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    color: 'var(--text-main)',
                    padding: '10px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  className="hover:border-[var(--solar-cyan)]/50 transition-colors"
                >
                  <span style={{ color: 'var(--solar-yellow)', fontWeight: 700, minWidth: '16px' }}>
                    {index + 1}
                  </span>
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowLanes(false)}
              style={{
                marginTop: '12px',
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '11px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← back
            </button>
          </div>
        )}

        {!showLanes && (
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              color: 'var(--text-muted)',
              opacity: 0.65,
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            Enter to start ·{' '}
            <button
              type="button"
              onClick={() => setShowLanes(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--solar-cyan)',
                cursor: 'pointer',
                font: 'inherit',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              pick lane
            </button>
          </p>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--border-subtle)',
          background: 'color-mix(in srgb, var(--terminal-surface) 92%, #000)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            minHeight: '52px',
            fontFamily: '"JetBrains Mono", monospace',
          }}
        >
          <StatusCell icon={FolderOpen} lane={lanes.workspace} variant="workspace" />
          <StatusCell icon={Cloud} lane={lanes.runtime} />
          <StatusCell icon={Network} lane={lanes.tunnel} />
          <div style={{ flex: '1 1 0', minWidth: 0, borderRight: 'none' }}>
            <StatusCell icon={Bot} lane={lanes.agent} />
          </div>
        </div>
        {otherSessions.length > 0 ? (
          <div
            style={{
              padding: '6px 14px 0',
              fontSize: '10px',
              color: 'var(--text-muted)',
              fontFamily: '"JetBrains Mono", monospace',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={otherSessions.map((s) => s.workspaceName || 'workspace').join(', ')}
          >
            Also open:{' '}
            {otherSessions
              .slice(0, 4)
              .map((s) => s.workspaceName?.trim() || 'workspace')
              .join(' · ')}
          </div>
        ) : null}
        <div
          style={{
            padding: '8px 14px 10px',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '12px',
            color: 'var(--solar-cyan)',
            borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 50%, transparent)',
          }}
        >
          <span style={{ opacity: 0.85 }}>&gt;</span>
          <span
            className="iam-terminal-splash-cursor"
            style={{
              display: 'inline-block',
              width: '8px',
              height: '14px',
              marginLeft: '6px',
              background: 'var(--solar-cyan)',
              verticalAlign: 'text-bottom',
              animation: 'iam-splash-blink 1.1s step-end infinite',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes iam-splash-blink {
          50% { opacity: 0; }
        }
        .iam-terminal-splash-status-cell:last-child > div {
          border-right: none;
        }
      `}</style>
    </div>
  );
}
