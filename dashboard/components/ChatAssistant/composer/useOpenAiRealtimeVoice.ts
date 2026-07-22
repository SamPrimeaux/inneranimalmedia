import { useCallback, useEffect, useRef, useState } from 'react';

const CLIENT_SECRET_URL = '/api/openai/realtime/client-secret';
const OPENAI_REALTIME_CALLS = 'https://api.openai.com/v1/realtime/calls';

export type RealtimeVoiceStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'error'
  | 'unavailable';

type RealtimeServerEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  error?: { message?: string };
  item?: {
    type?: string;
    role?: string;
    content?: Array<{ type?: string; transcript?: string; text?: string }>;
  };
};

function extractEphemeralKey(payload: Record<string, unknown> | null): string {
  if (!payload || typeof payload !== 'object') return '';
  const top = typeof payload.value === 'string' ? payload.value.trim() : '';
  if (top) return top;
  const nested = payload.client_secret;
  if (nested && typeof nested === 'object' && nested !== null) {
    const v = (nested as { value?: unknown }).value;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function transcriptFromEvent(ev: RealtimeServerEvent): { role: 'user' | 'assistant'; text: string } | null {
  const t = String(ev.type || '');
  if (t === 'conversation.item.input_audio_transcription.completed' && ev.transcript?.trim()) {
    return { role: 'user', text: ev.transcript.trim() };
  }
  if (
    (t === 'response.output_audio_transcript.done' || t === 'response.audio_transcript.done') &&
    ev.transcript?.trim()
  ) {
    return { role: 'assistant', text: ev.transcript.trim() };
  }
  if (t === 'conversation.item.done' && ev.item?.role === 'assistant') {
    const parts = ev.item.content || [];
    const text = parts
      .map((p) => p.transcript || p.text || '')
      .join('')
      .trim();
    if (text) return { role: 'assistant', text };
  }
  return null;
}

/**
 * Agent Sam Voice — OpenAI Realtime over WebRTC (not Meet/RealtimeKit).
 * Fetches ephemeral secret from IAM, then POSTs SDP to OpenAI /v1/realtime/calls.
 */
export function useOpenAiRealtimeVoice(options: {
  onUserTranscript?: (text: string) => void;
  onAssistantTranscript?: (text: string) => void;
  onError?: (message: string) => void;
  instructions?: string;
  voice?: string;
} = {}) {
  const { onUserTranscript, onAssistantTranscript, onError, instructions, voice } = options;
  const [status, setStatus] = useState<RealtimeVoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const startingRef = useRef(false);

  const cleanup = useCallback(() => {
    try {
      dcRef.current?.close();
    } catch {
      /* ignore */
    }
    dcRef.current = null;
    try {
      pcRef.current?.close();
    } catch {
      /* ignore */
    }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
      audioElRef.current = null;
    }
    startingRef.current = false;
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setStatus('idle');
    setError(null);
  }, [cleanup]);

  const start = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (startingRef.current || status === 'connecting' || status === 'listening') return;
    startingRef.current = true;
    setError(null);
    setStatus('connecting');

    try {
      const tokenRes = await fetch(CLIENT_SECRET_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(voice ? { voice } : {}),
          ...(instructions ? { instructions } : {}),
        }),
      });

      if (tokenRes.status === 403) {
        const body = (await tokenRes.json().catch(() => ({}))) as { code?: string };
        setEnabled(false);
        setStatus('unavailable');
        startingRef.current = false;
        if (body?.code === 'flag_off') {
          onError?.('Voice is not enabled for this account.');
        } else {
          onError?.('Voice is not available.');
        }
        return;
      }

      if (tokenRes.status === 401) {
        setStatus('error');
        startingRef.current = false;
        const msg = 'Sign in required for voice.';
        setError(msg);
        onError?.(msg);
        return;
      }

      if (!tokenRes.ok) {
        const body = (await tokenRes.json().catch(() => ({}))) as { error?: string; detail?: string };
        const msg = body.detail || body.error || `Voice secret failed (${tokenRes.status})`;
        setStatus('error');
        setError(msg);
        onError?.(msg);
        startingRef.current = false;
        return;
      }

      setEnabled(true);
      const tokenPayload = (await tokenRes.json()) as Record<string, unknown>;
      const ephemeralKey = extractEphemeralKey(tokenPayload);
      if (!ephemeralKey) {
        const msg = 'Voice secret missing value.';
        setStatus('error');
        setError(msg);
        onError?.(msg);
        startingRef.current = false;
        return;
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0] ?? null;
        void audioEl.play().catch(() => {});
      };

      const ms = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      localStreamRef.current = ms;
      for (const track of ms.getTracks()) {
        pc.addTrack(track, ms);
      }

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.addEventListener('message', (e) => {
        try {
          const ev = JSON.parse(String(e.data)) as RealtimeServerEvent;
          if (ev.type === 'error' || ev.error?.message) {
            const msg = ev.error?.message || 'Realtime session error';
            setError(msg);
            onError?.(msg);
            return;
          }
          const hit = transcriptFromEvent(ev);
          if (!hit) return;
          if (hit.role === 'user') onUserTranscript?.(hit.text);
          else onAssistantTranscript?.(hit.text);
        } catch {
          /* ignore malformed */
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(OPENAI_REALTIME_CALLS, {
        method: 'POST',
        body: offer.sdp ?? '',
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text().catch(() => '');
        const msg = `OpenAI Realtime call failed (${sdpResponse.status})${errText ? `: ${errText.slice(0, 200)}` : ''}`;
        cleanup();
        setStatus('error');
        setError(msg);
        onError?.(msg);
        return;
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setStatus('listening');
      startingRef.current = false;
    } catch (e) {
      cleanup();
      const msg =
        e instanceof Error
          ? e.message
          : 'Could not start voice — check microphone permissions.';
      setStatus('error');
      setError(msg);
      onError?.(msg);
      startingRef.current = false;
    }
  }, [
    cleanup,
    instructions,
    onAssistantTranscript,
    onError,
    onUserTranscript,
    status,
    voice,
  ]);

  const toggle = useCallback(() => {
    if (status === 'listening' || status === 'connecting') {
      stop();
      return;
    }
    void start();
  }, [start, status, stop]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    status,
    error,
    enabled,
    active: status === 'listening' || status === 'connecting',
    connecting: status === 'connecting',
    listening: status === 'listening',
    unavailable: status === 'unavailable' || enabled === false,
    toggle,
    start,
    stop,
  };
}
