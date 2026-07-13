/**
 * Composer status line — model + run state under the glass, never inside the toolbar.
 * One row, one job: no pill chrome competing with the model picker.
 */
import React, { useEffect, useState } from 'react';
import { deriveModelRunChipStyle, formatRunElapsed } from './modelRunChipStyle';

const AFTERGLOW_MS = 8000;

export type AgentRunChipProps = {
  isLoading: boolean;
  modelKey?: string | null;
  /** Idle / Auto label when no resolved stream model yet */
  idleLabel?: string | null;
  toolName?: string | null;
  startedAt?: number | null;
  className?: string;
};

export const AgentRunChip: React.FC<AgentRunChipProps> = ({
  isLoading,
  modelKey,
  idleLabel = null,
  toolName,
  startedAt = null,
  className = '',
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [afterglow, setAfterglow] = useState(false);
  const [heldModel, setHeldModel] = useState<string | null>(null);
  const [heldTool, setHeldTool] = useState<string | null>(null);

  useEffect(() => {
    const mk = modelKey?.trim() || null;
    if (mk) setHeldModel(mk);
  }, [modelKey]);

  useEffect(() => {
    const tn = toolName?.trim() || null;
    if (tn) setHeldTool(tn);
  }, [toolName]);

  useEffect(() => {
    if (!isLoading || !startedAt) {
      setElapsedSec(0);
      return;
    }
    const tick = () => setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isLoading, startedAt]);

  useEffect(() => {
    if (isLoading) {
      setAfterglow(false);
      return;
    }
    if (!heldModel) return;
    setAfterglow(true);
    const t = window.setTimeout(() => setAfterglow(false), AFTERGLOW_MS);
    return () => window.clearTimeout(t);
  }, [isLoading, heldModel]);

  const active = isLoading || afterglow;
  const resolvedKey = (heldModel || modelKey || '').trim();
  const style = deriveModelRunChipStyle(resolvedKey || null);
  const label =
    resolvedKey
      ? style.shortLabel
      : (idleLabel?.trim() || 'Auto');
  const tool = (isLoading ? toolName : heldTool)?.trim() || null;
  const elapsed = isLoading && startedAt ? formatRunElapsed(elapsedSec) : null;

  return (
    <div
      className={`iam-composer-status-row ${active ? 'iam-composer-status-row--active' : ''} ${className}`}
      role="status"
      aria-live="polite"
      data-agent-run-chip="1"
      data-provider={style.provider}
      data-loading={isLoading ? '1' : '0'}
      title={[label, tool, elapsed].filter(Boolean).join(' · ')}
    >
      <span
        className={`iam-composer-status-dot ${isLoading ? 'agent-send-pulse' : ''}`}
        style={{
          backgroundColor: active ? style.dotColor : 'transparent',
          opacity: active ? 1 : 0,
        }}
        aria-hidden
      />
      <span
        className="iam-composer-status-model truncate"
        style={{ color: active ? style.textColor : undefined }}
      >
        {label}
      </span>
      {isLoading && !tool ? (
        <>
          <span className="iam-composer-status-sep" aria-hidden>
            ·
          </span>
          <span className="iam-composer-status-meta truncate">running</span>
        </>
      ) : null}
      {tool ? (
        <>
          <span className="iam-composer-status-sep" aria-hidden>
            ·
          </span>
          <span className="iam-composer-status-meta truncate">{tool}</span>
        </>
      ) : null}
      {elapsed ? (
        <>
          <span className="iam-composer-status-sep" aria-hidden>
            ·
          </span>
          <span className="iam-composer-status-elapsed tabular-nums">{elapsed}</span>
        </>
      ) : null}
    </div>
  );
};
