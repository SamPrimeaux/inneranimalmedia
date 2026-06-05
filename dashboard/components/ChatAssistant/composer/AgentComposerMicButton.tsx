import React, { useCallback } from 'react';
import { Mic } from 'lucide-react';
import { useComposerSpeechInput } from './useComposerSpeechInput';

type AgentComposerMicButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

export function AgentComposerMicButton({ onTranscript, disabled }: AgentComposerMicButtonProps) {
  const handleError = useCallback((msg: string) => {
    console.warn('[composer-mic]', msg);
  }, []);

  const { supported, listening, toggle } = useComposerSpeechInput({
    onTranscript,
    onError: handleError,
  });

  if (!supported) return null;

  return (
    <button
      type="button"
      className={`flex-shrink-0 p-1.5 rounded-lg transition-all ${
        listening
          ? 'text-red-500 bg-red-500/10 animate-pulse'
          : 'text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)]'
      } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      title={listening ? 'Stop dictation' : 'Talk to type'}
      aria-label={listening ? 'Stop dictation' : 'Talk to type'}
      aria-pressed={listening}
      disabled={disabled}
      onClick={toggle}
    >
      <Mic size={14} strokeWidth={2} />
    </button>
  );
}
