import React, { useState, useEffect, useRef } from 'react';
import { Check, X, AlertTriangle, Lock, ChevronDown } from 'lucide-react';
import type { AgentMode } from '../../components/ChatAssistant/types';
import { ChatPresenceIcon } from '../../features/mode-presence/ChatPresenceIcon';

export type ThinkingStepStatus = 'running' | 'done' | 'error' | 'blocked';

export interface ThinkingStep {
  id: string;
  name: string;
  status: ThinkingStepStatus;
  preview?: string;
}

export type ThinkingCardStatus = 'thinking' | 'working' | 'blocked' | 'done' | 'error';

export interface ThinkingCardState {
  steps: ThinkingStep[];
  thinkingText: string;
  status: ThinkingCardStatus;
  startedAt: number;
}

export interface ThinkingCardProps extends ThinkingCardState {
  className?: string;
  mode?: AgentMode;
  presenceState?: string | null;
}

function stepPresenceState(step: ThinkingStep): string {
  const hay = `${step.name} ${step.preview || ''}`.toLowerCase();
  if (/terminal|wrangler|npm|python|shell|command|deploy|smoke/.test(hay)) return 'terminal';
  if (/browser|screenshot|playwright|navigate|dom/.test(hay)) return 'browser';
  if (/d1|sql|database|query|migration|supabase/.test(hay)) return 'database';
  if (/edit|patch|file|monaco|write|diff/.test(hay)) return 'writing';
  if (/diagram|excalidraw|draw|canvas/.test(hay)) return 'drawing';
  if (/image|thumbnail|r2|upload/.test(hay)) return 'imaging';
  if (/search|read|scan|grep|fetch/.test(hay)) return 'reading';
  return 'tool_routing';
}

export function ThinkingCard({
  steps,
  thinkingText,
  status,
  startedAt,
  className = '',
  mode = 'agent',
  presenceState,
}: ThinkingCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDone = status === 'done';
  const isError = status === 'error';
  const isBlocked = status === 'blocked';
  const isActive = !isDone && !isError;

  useEffect(() => {
    if (isDone || isError) {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(Date.now() - startedAt);
      const t = setTimeout(() => setExpanded(false), 2000);
      return () => clearTimeout(t);
    }
    timerRef.current = setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, startedAt, isDone, isError]);

  const elapsedStr = (elapsed / 1000).toFixed(1) + 's';

  const headerLabel = isError
    ? 'Stopped — something needs attention.'
    : isBlocked
      ? 'Waiting for your approval.'
      : isDone
        ? 'Done.'
        : thinkingText
          ? thinkingText.length > 90
            ? thinkingText.slice(0, 87) + '…'
            : thinkingText
          : 'Working…';

  const headerColor = isError
    ? 'var(--error, #f87171)'
    : isBlocked
      ? 'var(--warning, #fbbf24)'
      : isDone
        ? 'var(--text-tertiary, #4e4e62)'
        : 'var(--text-secondary, #8a8a9e)';

  const headerState =
    presenceState ||
    (isBlocked ? 'approval_required' : isDone ? 'complete' : isError ? 'failed' : 'thinking');

  return (
    <div
      className={className}
      style={{
        border: '0.5px solid var(--border-default, rgba(255,255,255,0.08))',
        borderRadius: 8,
        background: 'var(--bg-surface, rgba(255,255,255,0.03))',
        overflow: 'hidden',
        marginBottom: 8,
        maxWidth: '100%',
        width: '100%',
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {isError ? (
          <AlertTriangle size={13} style={{ color: 'var(--error, #f87171)', flexShrink: 0 }} />
        ) : isBlocked ? (
          <Lock size={13} style={{ color: 'var(--warning, #fbbf24)', flexShrink: 0 }} />
        ) : (
          <ChatPresenceIcon
            mode={mode}
            state={headerState}
            cardStatus={status}
            size={16}
            className="shrink-0"
          />
        )}

        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: isDone ? 400 : 500,
            color: headerColor,
          }}
        >
          {headerLabel}
        </span>
        {isActive && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary, #4e4e62)',
              marginLeft: 4,
              flexShrink: 0,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            {elapsedStr}
          </span>
        )}

        <ChevronDown
          size={13}
          style={{
            color: 'var(--text-tertiary, #4e4e62)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        />
      </button>

      {expanded && (
        <div
          style={{
            borderTop: '0.5px solid var(--border-subtle, rgba(255,255,255,0.05))',
            paddingTop: 4,
            paddingBottom: 4,
          }}
        >
          {thinkingText && (
            <div
              style={{
                padding: '5px 12px 4px',
                fontSize: 11,
                color: 'var(--text-tertiary, #4e4e62)',
                fontStyle: 'italic',
                lineHeight: 1.5,
                borderBottom: '0.5px solid var(--border-subtle, rgba(255,255,255,0.05))',
                marginBottom: 4,
              }}
            >
              {thinkingText.length > 200 ? thinkingText.slice(0, 200) + '…' : thinkingText}
            </div>
          )}

          {steps.map((step) => (
            <div
              key={step.id}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 12px' }}
            >
              {step.status === 'done' ? (
                <Check size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--success, #34d399)' }} />
              ) : step.status === 'error' ? (
                <X size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--error, #f87171)' }} />
              ) : step.status === 'blocked' ? (
                <AlertTriangle
                  size={13}
                  style={{ flexShrink: 0, marginTop: 1, color: 'var(--warning, #fbbf24)' }}
                />
              ) : (
                <ChatPresenceIcon
                  mode={mode}
                  state={stepPresenceState(step)}
                  size={13}
                  className="shrink-0 mt-px"
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                    color: 'var(--text-primary, #e6e6f0)',
                    lineHeight: 1.4,
                  }}
                >
                  {step.name}
                </div>
                {step.preview && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-tertiary, #4e4e62)',
                      marginTop: 1,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 380,
                    }}
                  >
                    {step.preview}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isActive && steps.length === 0 && (
            <div
              style={{
                padding: '4px 12px',
                fontSize: 11,
                color: 'var(--text-tertiary, #4e4e62)',
              }}
            >
              Starting...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
