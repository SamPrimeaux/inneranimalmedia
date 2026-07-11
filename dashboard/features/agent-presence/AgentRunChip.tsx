/**
 * Minimal run chip — provider-colored model + live tool + elapsed time.
 */
import React, { useEffect, useState } from 'react';
import { deriveModelRunChipStyle, formatRunElapsed } from './modelRunChipStyle';

export type AgentRunChipProps = {
  isLoading: boolean;
  modelKey?: string | null;
  toolName?: string | null;
  startedAt?: number | null;
  className?: string;
};

export const AgentRunChip: React.FC<AgentRunChipProps> = ({
  isLoading,
  modelKey,
  toolName,
  startedAt = null,
  className = '',
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);

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

  if (!isLoading) return null;

  const style = deriveModelRunChipStyle(modelKey);
  const tool = toolName?.trim() || null;
  const elapsed = startedAt ? formatRunElapsed(elapsedSec) : null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 max-w-full min-w-0 rounded-md border bg-[var(--scene-bg)]/80 px-2 py-0.5 text-[10px] font-mono ${className}`}
      style={{ borderColor: style.borderColor, color: style.textColor }}
      role="status"
      aria-live="polite"
      data-agent-run-chip="1"
      data-provider={style.provider}
      title={[style.shortLabel, tool, elapsed].filter(Boolean).join(' · ')}
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full agent-send-pulse"
        style={{ backgroundColor: style.dotColor }}
        aria-hidden
      />
      <span className="truncate opacity-95">{style.shortLabel}</span>
      {tool ? (
        <>
          <span className="opacity-40 shrink-0">·</span>
          <span className="truncate opacity-90 max-w-[5rem]">{tool}</span>
        </>
      ) : (
        <>
          <span className="opacity-40 shrink-0">·</span>
          <span className="truncate opacity-70">running</span>
        </>
      )}
      {elapsed ? (
        <>
          <span className="opacity-40 shrink-0">·</span>
          <span className="shrink-0 opacity-75 tabular-nums">{elapsed}</span>
        </>
      ) : null}
    </div>
  );
};
