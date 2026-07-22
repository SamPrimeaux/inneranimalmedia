import React, { useCallback, useState } from 'react';
import { Mic, Radio } from 'lucide-react';
import { useComposerSpeechInput } from './useComposerSpeechInput';
import { useOpenAiRealtimeVoice } from './useOpenAiRealtimeVoice';

type AgentComposerMicButtonProps = {
  onTranscript: (text: string) => void;
  /** Optional: append Sam's spoken transcript into the thread caption surface. */
  onAssistantTranscript?: (text: string) => void;
  disabled?: boolean;
};

/**
 * Composer mic — prefers Agent Sam Realtime voice when flag openai_realtime_voice is on.
 * Falls back to browser Web Speech dictation ("Talk to type") when Realtime is unavailable.
 * Meet/RealtimeKit is intentionally not used here.
 */
export function AgentComposerMicButton({
  onTranscript,
  onAssistantTranscript,
  disabled,
}: AgentComposerMicButtonProps) {
  const [mode, setMode] = useState<'realtime' | 'dictation'>('realtime');
  const [hint, setHint] = useState<string | null>(null);

  const handleError = useCallback((msg: string) => {
    console.warn('[composer-mic]', msg);
    setHint(msg);
  }, []);

  const dictation = useComposerSpeechInput({
    onTranscript,
    onError: handleError,
  });

  const realtime = useOpenAiRealtimeVoice({
    onUserTranscript: onTranscript,
    onAssistantTranscript,
    onError: (msg) => {
      handleError(msg);
      // Soft-fallback to dictation when flag is off for this account.
      if (/not enabled|not available/i.test(msg)) {
        setMode('dictation');
      }
    },
  });

  const useRealtime = mode === 'realtime' && !realtime.unavailable;
  const listening = useRealtime ? realtime.listening || realtime.connecting : dictation.listening;
  const connecting = useRealtime && realtime.connecting;

  if (!useRealtime && !dictation.supported) return null;

  const title = useRealtime
    ? connecting
      ? 'Connecting voice…'
      : listening
        ? 'Stop voice with Sam'
        : 'Voice with Sam'
    : listening
      ? 'Stop dictation'
      : 'Talk to type';

  const onClick = () => {
    setHint(null);
    if (useRealtime) {
      realtime.toggle();
      return;
    }
    dictation.toggle();
  };

  return (
    <button
      type="button"
      className={`flex-shrink-0 p-1.5 rounded-lg transition-all ${
        listening
          ? connecting
            ? 'text-[var(--solar-cyan)] bg-[color-mix(in_srgb,var(--solar-cyan)_12%,transparent)]'
            : 'text-red-500 bg-red-500/10 animate-pulse'
          : 'text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)]'
      } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
      title={hint ? `${title} — ${hint}` : title}
      aria-label={title}
      aria-pressed={listening}
      aria-busy={connecting || undefined}
      disabled={disabled}
      onClick={onClick}
      data-voice-mode={useRealtime ? 'realtime' : 'dictation'}
    >
      {useRealtime ? <Radio size={14} strokeWidth={2} /> : <Mic size={14} strokeWidth={2} />}
    </button>
  );
}
