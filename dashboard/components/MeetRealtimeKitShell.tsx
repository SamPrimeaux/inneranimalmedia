/**
 * RealtimeKit Meet UI — lobby + @cloudflare/realtimekit-react-ui in-call shell.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
  useRealtimeKitMeeting,
} from '@cloudflare/realtimekit-react';
import { RtkMeeting } from '@cloudflare/realtimekit-react-ui';
import {
  Loader2, Radio, Video, ChevronDown, Copy, Send, Mail,
} from 'lucide-react';
import { MeetCtxValue } from '../src/MeetContext';

type Phase = 'lobby' | 'connecting' | 'in-call' | 'ended';

function apiV2(path: string, opts: RequestInit = {}) {
  return fetch(`/api/meet/v2${path}`, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}

function InviteModal({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const link = `${window.location.origin}/dashboard/meet?room=${roomId}`;

  const send = async () => {
    if (!email.trim()) return;
    setSending(true);
    await fetch(`/api/meet/room/${roomId}/invite`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), link }),
    }).catch(() => {});
    setSent(true);
    setSending(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title"><Mail size={15} /> Invite to meeting</h3>
        <p className="modal-sub">Share link or send email invite via Resend.</p>
        <div className="modal-link-row">
          <span className="modal-link-val">{link.replace('https://', '')}</span>
          <button type="button" className="modal-copy-btn" onClick={() => navigator.clipboard.writeText(link)}>
            <Copy size={12} /> Copy
          </button>
        </div>
        {!sent ? (
          <>
            <input className="modal-input" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com" onKeyDown={(e) => e.key === 'Enter' && void send()} />
            <button type="button" className="modal-send-btn" onClick={() => void send()} disabled={!email.trim() || sending}>
              {sending ? <><Loader2 size={13} className="spin" /> Sending…</> : <><Send size={13} /> Send invite</>}
            </button>
          </>
        ) : (
          <div className="modal-sent">✓ Invite sent to {email}</div>
        )}
        <button type="button" className="modal-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function RtkInCall({ onEnded }: { onEnded: () => void }) {
  const { meeting } = useRealtimeKitMeeting();

  useEffect(() => {
    if (!meeting) return;
    const onLeave = () => onEnded();
    try {
      meeting.self?.on?.('roomLeft', onLeave);
      meeting.self?.on?.('left', onLeave);
    } catch { /* SDK event shape may vary */ }
    return () => {
      try {
        meeting.self?.off?.('roomLeft', onLeave);
        meeting.self?.off?.('left', onLeave);
      } catch { /* ignore */ }
    };
  }, [meeting, onEnded]);

  if (!meeting) {
    return (
      <div className="lobby-wrap">
        <Loader2 size={24} className="spin" />
      </div>
    );
  }

  return (
    <div className="meet-rtk-stage">
      <RtkMeeting mode="fill" meeting={meeting} showSetupScreen />
    </div>
  );
}

export default function MeetRealtimeKitShell({
  onContextReady,
}: {
  onContextReady?: (ctx: MeetCtxValue) => void;
}) {
  const [roomFromUrl] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('room')?.trim() || '';
  });

  const [phase, setPhase] = useState<Phase>(() => (roomFromUrl ? 'connecting' : 'lobby'));
  const [roomId, setRoomId] = useState(roomFromUrl);
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showNewMeetingMenu, setShowNewMeetingMenu] = useState(false);
  const [newMeetLink, setNewMeetLink] = useState<string | null>(null);
  const [copyLinkFeedback, setCopyLinkFeedback] = useState(false);

  const [meeting, initMeeting] = useRealtimeKitClient();
  const newMeetingMenuRef = useRef<HTMLDivElement>(null);
  const autoJoinStarted = useRef(false);

  const noop = useCallback(() => {}, []);

  useEffect(() => {
    if (!onContextReady) return;
    onContextReady({
      phase,
      roomId,
      roomName,
      displayName,
      participants: [],
      audioOn: true,
      videoOn: true,
      screenOn: false,
      recording: false,
      setPhase,
      setRoomId,
      setRoomName,
      setDisplayName,
      setParticipants: noop as MeetCtxValue['setParticipants'],
      setAudioOn: noop as MeetCtxValue['setAudioOn'],
      setVideoOn: noop as MeetCtxValue['setVideoOn'],
      setScreenOn: noop as MeetCtxValue['setScreenOn'],
      setRecording: noop as MeetCtxValue['setRecording'],
      toggleAudio: noop,
      toggleVideo: noop,
      toggleScreen: noop,
      endCall: () => setPhase('ended'),
      showDraw: false,
      setShowDraw: noop as MeetCtxValue['setShowDraw'],
      drawOpacity: 70,
      setDrawOpacity: noop as MeetCtxValue['setDrawOpacity'],
      runAiStudio: noop as MeetCtxValue['runAiStudio'],
      aiStudioOpen: null,
      aiStudioResult: null,
      showInvite,
      setShowInvite,
    });
  }, [phase, roomId, roomName, displayName, showInvite, onContextReady, noop]);

  useEffect(() => {
    if (!showNewMeetingMenu) return;
    const onDown = (e: MouseEvent) => {
      const el = newMeetingMenuRef.current;
      if (el && !el.contains(e.target as Node)) setShowNewMeetingMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showNewMeetingMenu]);

  const connectWithToken = useCallback(async (opts: {
    rid: string;
    name: string;
    role: 'host' | 'participant' | 'guest';
    title?: string;
  }) => {
    setPhase('connecting');
    setError(null);
    try {
      let rid = opts.rid;
      if (!rid) {
        const startRes = await apiV2('/start', {
          method: 'POST',
          body: JSON.stringify({ name: opts.title || `${opts.name}'s Meeting` }),
        });
        const start = await startRes.json().catch(() => ({}));
        if (!startRes.ok || !start?.roomId) {
          throw new Error(start?.error || start?.message || `Start failed (${startRes.status})`);
        }
        rid = String(start.roomId);
        setRoomId(rid);
        setRoomName(String(start.meetingId ? opts.title || 'Meeting' : 'Meeting'));
      } else {
        setRoomId(rid);
      }

      const tokenRes = await apiV2('/token', {
        method: 'POST',
        body: JSON.stringify({
          roomId: rid,
          role: opts.role,
          displayName: opts.name,
        }),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData?.authToken) {
        throw new Error(tokenData?.error || tokenData?.message || `Token failed (${tokenRes.status})`);
      }

      await initMeeting({ authToken: String(tokenData.authToken) });
      setPhase('in-call');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to join');
      setPhase('lobby');
    }
  }, [initMeeting]);

  const startInstantMeeting = useCallback(async () => {
    if (!displayName.trim()) {
      setError('Enter your display name before starting a meeting.');
      setShowNewMeetingMenu(false);
      return;
    }
    setShowNewMeetingMenu(false);
    await connectWithToken({
      rid: '',
      name: displayName.trim(),
      role: 'host',
      title: 'Instant Meeting',
    });
    setShowInvite(true);
  }, [connectWithToken, displayName]);

  const createMeetingForLater = useCallback(async () => {
    setShowNewMeetingMenu(false);
    try {
      const res = await apiV2('/start', {
        method: 'POST',
        body: JSON.stringify({ name: `Meeting ${new Date().toLocaleDateString()}` }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.roomId) {
        setNewMeetLink(`${window.location.origin}/dashboard/meet?room=${json.roomId}`);
      } else {
        setError(typeof json?.error === 'string' ? json.error : 'Could not create meeting link');
      }
    } catch {
      setError('Could not create meeting link');
    }
  }, []);

  const copyNewMeetLink = useCallback(async () => {
    if (!newMeetLink) return;
    try {
      await navigator.clipboard.writeText(newMeetLink);
      setCopyLinkFeedback(true);
      window.setTimeout(() => setCopyLinkFeedback(false), 2000);
    } catch { /* ignore */ }
  }, [newMeetLink]);

  useEffect(() => {
    if (!roomFromUrl || autoJoinStarted.current) return;
    autoJoinStarted.current = true;
    let cancelled = false;
    (async () => {
      let dn = 'Guest';
      try {
        const r = await fetch('/api/settings/profile', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          const flat = (d as { flat?: { display_name?: string; name?: string; primary_email?: string } }).flat || {};
          dn = String(flat.display_name || flat.name || '').trim()
            || String(flat.primary_email || '').split('@')[0]?.trim()
            || 'Guest';
        }
      } catch { /* Guest */ }
      if (cancelled) return;
      setDisplayName(dn);
      await connectWithToken({ rid: roomFromUrl, name: dn, role: 'guest' });
    })();
    return () => { cancelled = true; };
  }, [roomFromUrl, connectWithToken]);

  if (phase === 'lobby' || phase === 'connecting') {
    return (
      <>
        <div className="lobby-wrap">
          <div className="lobby-card">
            <div className="lobby-preview">
              <div className="lobby-no-cam"><Video size={36} /><span>RealtimeKit — camera on in setup</span></div>
              <div className="lobby-preview-label">Lobby</div>
            </div>
            <div className="lobby-form">
              <div className="lobby-brand">
                <Radio size={16} />
                <span>InnerAnimalMedia</span>
                <span className="lobby-live-badge">MEET · RTK</span>
              </div>
              {roomFromUrl ? (
                <>
                  <h2 className="lobby-heading">Joining room…</h2>
                  {error && <div className="lobby-error">{error}</div>}
                  <button className="lobby-btn" type="button" disabled>
                    <Loader2 size={15} className="spin" /> Connecting…
                  </button>
                </>
              ) : (
                <>
                  <h2 className="lobby-heading">Start or join a meeting</h2>
                  {error && <div className="lobby-error">{error}</div>}
                  <label className="lobby-label">Your name</label>
                  <input className="lobby-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display name" onKeyDown={(e) => e.key === 'Enter' && void startInstantMeeting()} />
                  <div className="lobby-dropdown-wrap" ref={newMeetingMenuRef}>
                    <button type="button" className="lobby-btn" onClick={() => setShowNewMeetingMenu((v) => !v)}
                      disabled={phase === 'connecting'}>
                      New Meeting <ChevronDown size={15} />
                    </button>
                    {showNewMeetingMenu && (
                      <div className="lobby-dropdown-menu" role="menu">
                        <button type="button" className="lobby-dropdown-item" onClick={() => void createMeetingForLater()}>
                          Create a meeting for later
                        </button>
                        <button type="button" className="lobby-dropdown-item" onClick={() => void startInstantMeeting()}>
                          Start an instant meeting
                        </button>
                      </div>
                    )}
                  </div>
                  {newMeetLink && (
                    <div className="lobby-link-share">
                      <div className="lobby-label">Your meeting link:</div>
                      <div className="lobby-link-select">{newMeetLink}</div>
                      <button type="button" className="lobby-btn-secondary" onClick={() => void copyNewMeetLink()}>
                        {copyLinkFeedback ? 'Copied' : 'Copy link'}
                      </button>
                    </div>
                  )}
                  <button className="lobby-btn" type="button" onClick={() => void startInstantMeeting()}
                    disabled={!displayName.trim() || phase === 'connecting'}>
                    {phase === 'connecting'
                      ? <><Loader2 size={15} className="spin" /> Starting…</>
                      : <><Video size={15} /> Start meeting</>}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (phase === 'ended') {
    return (
      <>
        <div className="ended-wrap">
          <div className="ended-card">
            <h2>Call ended</h2>
            <button type="button" className="lobby-btn" onClick={() => { setPhase('lobby'); setRoomId(''); }}>
              <Video size={15} /> New call
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        .meet-rtk-root { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; background: var(--bg-app, #07100f); }
        .meet-rtk-stage { flex: 1; min-height: 0; width: 100%; }
      `}</style>
      {showInvite && roomId && <InviteModal roomId={roomId} onClose={() => setShowInvite(false)} />}
      <div className="meet-rtk-root">
        <RealtimeKitProvider value={meeting} fallback={<Loader2 className="spin" />}>
          <RtkInCall onEnded={() => setPhase('ended')} />
        </RealtimeKitProvider>
      </div>
    </>
  );
}
