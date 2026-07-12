/**
 * Minimal run chip — provider-colored model + live tool + elapsed time.
 * Stays visible briefly after the stream ends so Auto → resolved model is readable.
 */
import React, { useEffect, useState } from 'react';
import { deriveModelRunChipStyle, formatRunElapsed } from './modelRunChipStyle';

const AFTERGLOW_MS = 8000;

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

  if (!isLoading && !afterglow) return null;

  const style = deriveModelRunChipStyle(heldModel || modelKey);
  const tool = (isLoading ? toolName : heldTool)?.trim() || null;
  const elapsed = isLoading && startedAt ? formatRunElapsed(elapsedSec) : null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 max-w-full min-w-0 rounded-md border bg-[var(--scene-bg)]/80 px-2 py-0.5 text-[10px] font-mono ${className}`}
      style={{ borderColor: style.borderColor, color: style.textColor, opacity: isLoading ? 1 : 0.85 }}
      role="status"
      aria-live="polite"
      data-agent-run-chip="1"
      data-provider={style.provider}
      title={[style.shortLabel, tool, elapsed].filter(Boolean).join(' · ')}
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${isLoading ? 'agent-send-pulse' : ''}`}
        style={{ backgroundColor: style.dotColor }}
        aria-hidden
      />
      <span className="truncate opacity-95">{style.shortLabel}</span>
      {tool ? (
        <>
          <span className="opacity-40 shrink-0">·</span>
          <span className="truncate opacity-90 max-w-[6.5rem]">{tool}</span>
        </>
      ) : isLoading ? (
        <>
          <span className="opacity-40 shrink-0">·</span>
          <span className="truncate opacity-70">running</span>
        </>
      ) : null}
      {elapsed ? (
        <>
          <span className="opacity-40 shrink-0">·</span>
          <span className="shrink-0 opacity-75 tabular-nums">{elapsed}</span>
        </>
      ) : null}
    </div>
  );
};
