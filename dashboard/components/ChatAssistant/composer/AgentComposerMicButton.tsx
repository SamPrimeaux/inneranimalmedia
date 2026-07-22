import React, { useCallback, useState } from 'react';
import { Mic, AudioLines } from 'lucide-react';
import { useComposerSpeechInput } from './useComposerSpeechInput';
import { useOpenAiRealtimeVoice } from './useOpenAiRealtimeVoice';

type AgentComposerMicButtonProps = {
  onTranscript: (text: string) => void;
  onAssistantTranscript?: (text: string) => void;
  disabled?: boolean;
};

/**
 * Composer voice controls:
 * - Voice = Agent Sam Realtime (WebRTC) — flag openai_realtime_voice
 * - Mic  = browser dictation ("Talk to type")
 * Meet/RealtimeKit is intentionally not used here.
 */
export function AgentComposerMicButton({
  onTranscript,
  onAssistantTranscript,
  disabled,
}: AgentComposerMicButtonProps) {
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [dictationHint, setDictationHint] = useState<string | null>(null);

  const dictation = useComposerSpeechInput({
    onTranscript,
    onError: (msg) => {
      console.warn('[composer-mic]', msg);
      setDictationHint(msg);
    },
  });

  const realtime = useOpenAiRealtimeVoice({
    onUserTranscript: onTranscript,
    onAssistantTranscript,
    onError: (msg) => {
      console.warn('[composer-voice]', msg);
      setVoiceHint(msg);
    },
  });

  const onVoiceClick = useCallback(() => {
    setVoiceHint(null);
    realtime.toggle();
  }, [realtime]);

  const onDictationClick = useCallback(() => {
    setDictationHint(null);
    // Don't run dictation while Realtime voice is live.
    if (realtime.active) realtime.stop();
    dictation.toggle();
  }, [dictation, realtime]);

  const voiceTitle = realtime.connecting
    ? 'Connecting voice…'
    : realtime.listening
      ? 'Stop voice with Sam'
      : voiceHint
        ? `Voice with Sam — ${voiceHint}`
        : 'Voice with Sam (Realtime)';

  const dictationTitle = dictation.listening
    ? 'Stop dictation'
    : dictationHint
      ? `Talk to type — ${dictationHint}`
      : 'Talk to type';

  // Hide Realtime control only after an explicit flag_off / unavailable result.
  const showVoice = realtime.enabled !== false && realtime.status !== 'unavailable';

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {showVoice ? (
        <button
          type="button"
          className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
            realtime.listening || realtime.connecting
              ? realtime.connecting
                ? 'text-[var(--solar-cyan)] bg-[color-mix(in_srgb,var(--solar-cyan)_12%,transparent)]'
                : 'text-red-500 bg-red-500/10 animate-pulse'
              : 'text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)]'
          } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
          title={voiceTitle}
          aria-label={voiceTitle}
          aria-pressed={realtime.listening || realtime.connecting}
          aria-busy={realtime.connecting || undefined}
          disabled={disabled}
          onClick={onVoiceClick}
          data-voice-mode="realtime"
          data-testid="composer-voice-realtime"
        >
          <AudioLines size={14} strokeWidth={2} />
          <span className="hidden sm:inline">Voice</span>
        </button>
      ) : null}

      {dictation.supported ? (
        <button
          type="button"
          className={`flex-shrink-0 p-1.5 rounded-lg transition-all ${
            dictation.listening
              ? 'text-red-500 bg-red-500/10 animate-pulse'
              : 'text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)]'
          } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
          title={dictationTitle}
          aria-label={dictationTitle}
          aria-pressed={dictation.listening}
          disabled={disabled}
          onClick={onDictationClick}
          data-voice-mode="dictation"
          data-testid="composer-mic-dictation"
        >
          <Mic size={14} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
