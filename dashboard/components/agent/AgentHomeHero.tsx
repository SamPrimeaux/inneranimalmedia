import { useState, useRef, type CSSProperties, type FormEvent } from 'react';
import { Paperclip, Mic, AudioWaveform, ArrowUp, ChevronDown } from 'lucide-react';
import { AGENT_MODE_PILLS, type AgentModeId } from '../../types/agentHomeScene';
import { ModePill } from './ModePill';
import './AgentHomeHero.css';

interface AgentHomeHeroProps {
  name: string;
  onSubmit: (prompt: string) => void;
  onModeSelect: (mode: AgentModeId) => void;
  glassOpacity?: number;
}

export function AgentHomeHero({
  name,
  onSubmit,
  onModeSelect,
  glassOpacity = 0.18,
}: AgentHomeHeroProps) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<'adaptive' | 'precise'>('adaptive');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const greeting = useTimeOfDayGreeting(name);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
    setValue('');
  }

  return (
    <div className="agent-hero">
      <div className="agent-hero__greeting-row">
        <MarkGlyph />
        <h1 className="agent-hero__greeting">{greeting}</h1>
      </div>

      <form
        className="agent-hero__bar"
        style={{ '--bar-glass-opacity': glassOpacity } as CSSProperties}
        onSubmit={handleSubmit}
      >
        <button
          type="button"
          className="agent-hero__icon-btn"
          aria-label="Attach a file"
        >
          <Paperclip size={18} strokeWidth={1.5} />
        </button>

        <textarea
          ref={inputRef}
          className="agent-hero__input"
          placeholder="Tell Agent Sam what to do"
          value={value}
          rows={1}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />

        <div className="agent-hero__bar-controls">
          <button
            type="button"
            className="agent-hero__mode-toggle"
            onClick={() =>
              setMode((m) => (m === 'adaptive' ? 'precise' : 'adaptive'))
            }
            aria-label="Toggle response mode"
          >
            {mode === 'adaptive' ? 'Adaptive' : 'Precise'}
            <ChevronDown size={14} strokeWidth={1.5} />
          </button>

          <span className="agent-hero__divider" />

          <button
            type="button"
            className="agent-hero__icon-btn"
            aria-label="Use voice input"
          >
            <Mic size={18} strokeWidth={1.5} />
          </button>

          <button
            type="button"
            className="agent-hero__icon-btn"
            aria-label="Voice waveform"
          >
            <AudioWaveform size={18} strokeWidth={1.5} />
          </button>

          <button
            type="submit"
            className="agent-hero__send"
            disabled={!value.trim()}
            aria-label="Send"
          >
            <ArrowUp size={18} strokeWidth={2} />
          </button>
        </div>
      </form>

      <div className="agent-hero__pills" role="group" aria-label="Quick modes">
        {AGENT_MODE_PILLS.map((pill) => (
          <ModePill key={pill.id} pill={pill} onSelect={onModeSelect} />
        ))}
      </div>
    </div>
  );
}

function MarkGlyph() {
  return (
    <svg
      className="agent-hero__mark"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="var(--agent-accent)" strokeWidth="1.1" strokeLinecap="round">
        <line x1="11" y1="1" x2="11" y2="6" />
        <line x1="11" y1="16" x2="11" y2="21" />
        <line x1="1" y1="11" x2="6" y2="11" />
        <line x1="16" y1="11" x2="21" y2="11" />
        <line x1="4.2" y1="4.2" x2="7.6" y2="7.6" />
        <line x1="14.4" y1="14.4" x2="17.8" y2="17.8" />
        <line x1="17.8" y1="4.2" x2="14.4" y2="7.6" />
        <line x1="7.6" y1="14.4" x2="4.2" y2="17.8" />
      </g>
      <circle cx="11" cy="11" r="3.4" fill="var(--agent-accent)" opacity="0.85" />
    </svg>
  );
}

function useTimeOfDayGreeting(name: string) {
  const hour = new Date().getHours();
  const part =
    hour < 5 ? 'Late night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  return `${part}, ${name}`;
}
