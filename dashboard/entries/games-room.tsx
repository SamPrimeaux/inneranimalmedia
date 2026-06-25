/**
 * Public 3D chess room — baroque board, locked player camera, Agent Sam practice.
 */
import { ChessViewport } from '../lib/ChessViewport';
import { pickAgentSamMove, tryMove } from '../lib/chessEngine';
import { capturedPieceSvg } from '../lib/chessPieceIcons';

const AGENTSAM_AVATAR_URL =
  'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/b5557284-485e-4305-2c5a-49c6acf99a00/thumbnail';

function getRoomId(): string {
  return (location.pathname.match(/\/games\/(room_[^/]+)/i) || [])[1] || '';
}

function truncateRoom(id: string): string {
  return id.length > 8 ? id.slice(-8) : id;
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function sideLabel(color: 'white' | 'black'): string {
  return color === 'white' ? 'You are white' : 'You are orange';
}

function appendCaptureIcon(capturedBy: 'white' | 'black', piece: string, pieceColor: 'white' | 'black') {
  const rail = document.getElementById(capturedBy === 'white' ? 'captures-white' : 'captures-black');
  if (!rail) return;
  const span = document.createElement('span');
  span.innerHTML = capturedPieceSvg(piece, pieceColor);
  span.title = piece;
  rail.appendChild(span);
}

function boot() {
  const roomId = getRoomId();
  const params = new URLSearchParams(location.search);
  const vsAgentsam = params.get('vs') === 'agentsam';
  const opponentLabel = vsAgentsam
    ? 'Agent Sam'
    : decodeURIComponent(params.get('opponent') || '').trim() || 'Opponent';

  setText('room-id-short', truncateRoom(roomId));
  if (!roomId) {
    setText('status-bar', 'Invalid room URL.');
    return;
  }

  let fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  let turn: 'white' | 'black' = 'white';
  const vsAgentsamEarly = params.get('vs') === 'agentsam';
  let myColor: 'white' | 'black' | 'spectator' | null = vsAgentsamEarly ? 'white' : null;
  let opponentConnected = vsAgentsamEarly;
  let ws: WebSocket | null = null;
  let whiteSeconds = 600;
  let blackSeconds = 600;
  let timerHandle: ReturnType<typeof setInterval> | null = null;

  const overlay = document.getElementById('loading-overlay');
  const progressBar = document.getElementById('load-progress');
  const mount = document.getElementById('viewport');
  if (!mount) {
    setText('status-bar', 'Viewport missing.');
    return;
  }

  const applyTimerClasses = (el: HTMLElement | null, secs: number, active: boolean) => {
    if (!el) return;
    el.classList.toggle('running', active);
    el.classList.toggle('low', active && secs <= 30);
  };

  const updateTimers = () => {
    const whiteEl = document.getElementById('timer-white');
    const blackEl = document.getElementById('timer-black');
    if (whiteEl) whiteEl.textContent = formatTime(whiteSeconds);
    if (blackEl) blackEl.textContent = formatTime(blackSeconds);
    applyTimerClasses(whiteEl, whiteSeconds, turn === 'white');
    applyTimerClasses(blackEl, blackSeconds, turn === 'black');
  };

  const startClock = () => {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      if (turn === 'white' && whiteSeconds > 0) whiteSeconds -= 1;
      if (turn === 'black' && blackSeconds > 0) blackSeconds -= 1;
      updateTimers();
    }, 1000);
  };

  const updateTurnPill = () => {
    const pill = document.getElementById('turn-pill');
    if (!pill) return;
    const dotClass = turn === 'white' ? 'dot-white' : 'dot-orange';
    pill.innerHTML = `<span class="turn-dot ${dotClass}"></span> ${turn === 'white' ? 'White' : 'Orange'} to move`;
  };

  const updatePlayerCards = () => {
    const whiteCard = document.getElementById('card-white');
    const blackCard = document.getElementById('card-black');
    whiteCard?.classList.toggle('active-turn', turn === 'white');
    blackCard?.classList.toggle('active-turn', turn === 'black');

    const youAreWhite = myColor === 'white';
    const youAreBlack = myColor === 'black';

    setText('name-white', youAreWhite ? 'You' : opponentConnected ? 'Opponent' : 'Waiting');
    setText(
      'name-black',
      youAreBlack ? 'You' : vsAgentsam ? 'Agent Sam' : opponentConnected ? opponentLabel : 'Waiting',
    );

    const subWhite = document.getElementById('sub-white');
    const subBlack = document.getElementById('sub-black');
    if (subWhite) subWhite.textContent = youAreWhite ? sideLabel('white') : 'White';
    if (subBlack) {
      subBlack.textContent = youAreBlack
        ? sideLabel('black')
        : vsAgentsam
          ? 'Orange · Computer'
          : 'Orange';
    }

    const avWhite = document.getElementById('avatar-white');
    const avBlack = document.getElementById('avatar-black');
    const avBlackImg = document.getElementById('avatar-black-img') as HTMLImageElement | null;
    if (avWhite) avWhite.textContent = youAreWhite ? initials('You') : 'W';
    if (avBlack) {
      if (vsAgentsam && avBlackImg) {
        avBlack.textContent = '';
        avBlackImg.hidden = false;
        avBlackImg.src = AGENTSAM_AVATAR_URL;
        avBlackImg.alt = 'Agent Sam';
        avBlack.classList.add('avatar-squircle');
      } else {
        if (avBlackImg) avBlackImg.hidden = true;
        avBlack.classList.remove('avatar-squircle');
        avBlack.textContent = youAreBlack ? initials('You') : initials(opponentLabel);
      }
    }
  };

  const updateStatus = () => {
    if (vsAgentsam) {
      setText('status-bar', 'Practice vs Agent Sam — select a piece to see legal moves');
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setText('status-bar', 'Connecting…');
      return;
    }
    if (!opponentConnected) {
      setText('status-bar', 'Connected — waiting for opponent');
      return;
    }
    if (myColor && myColor !== 'spectator') {
      setText('status-bar', myColor === turn ? 'Your turn' : `${opponentLabel}'s turn`);
    } else {
      setText('status-bar', `Turn: ${turn}`);
    }
  };

  const viewport = new ChessViewport({
    container: mount,
    onLoading: (p) => {
      if (progressBar) progressBar.style.width = `${Math.round(p * 100)}%`;
    },
    onReady: () => {
      overlay?.classList.add('hidden');
      viewport.setFen(fen);
      viewport.setTurn(turn);
      viewport.setPlayerColor(myColor);
      void viewport.syncFromFen(fen);
    },
    onStatus: (msg) => setText('status-bar', msg),
    onCapture: (capturedBy, piece, pieceColor) => {
      appendCaptureIcon(capturedBy, piece, pieceColor);
    },
    onMove: (from, to) => {
      const result = tryMove(fen, from, to);
      if (!result.ok) {
        setText('status-bar', 'Illegal move');
        return;
      }

      if (vsAgentsam) {
        fen = result.fen;
        turn = result.turn;
        viewport.setFen(fen);
        viewport.setTurn(turn);
        viewport.movePieceOnBoard(from, to);
        updateTurnPill();
        updateTimers();
        updatePlayerCards();
        updateStatus();

        window.setTimeout(() => {
          const reply = pickAgentSamMove(fen);
          if (!reply) return;
          fen = reply.fen;
          turn = reply.turn;
          viewport.setFen(fen);
          viewport.setTurn(turn);
          viewport.movePieceOnBoard(reply.from, reply.to);
          updateTurnPill();
          updateTimers();
          updatePlayerCards();
          updateStatus();
        }, 450);
        return;
      }

      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'move', from, to, fen: result.fen }));
    },
  });

  const applyState = () => {
    viewport.setFen(fen);
    viewport.setTurn(turn);
    viewport.setPlayerColor(myColor);
    void viewport.syncFromFen(fen);
    updateTurnPill();
    updateTimers();
    updatePlayerCards();
    updateStatus();
  };

  const connect = () => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/api/games/ws/${encodeURIComponent(roomId)}`);
    ws.onopen = () => {
      updateStatus();
      startClock();
    };
    ws.onclose = () => {
      setText('status-bar', 'Disconnected.');
      if (timerHandle) clearInterval(timerHandle);
    };
    ws.onmessage = (ev) => {
      let msg: {
        type?: string;
        fen?: string;
        turn?: 'white' | 'black';
        color?: 'white' | 'black' | 'spectator';
        from?: string;
        to?: string;
        message?: string;
        winner?: string;
        players?: number;
        displayName?: string;
      };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'state' || msg.type === 'joined') {
        if (msg.fen) fen = msg.fen;
        if (msg.turn) turn = msg.turn;
        if (msg.color) myColor = msg.color;
        if (typeof msg.players === 'number') opponentConnected = msg.players >= 2;
        else if (msg.type === 'joined' && msg.color !== 'spectator') opponentConnected = true;
        applyState();
      } else if (msg.type === 'move') {
        if (msg.fen) fen = msg.fen;
        if (msg.turn) turn = msg.turn;
        viewport.setFen(fen);
        if (msg.from && msg.to) viewport.movePieceOnBoard(msg.from, msg.to);
        else applyState();
        updateTurnPill();
        updateTimers();
        updatePlayerCards();
        updateStatus();
      } else if (msg.type === 'error') {
        setText('status-bar', msg.message || 'Move rejected');
      } else if (msg.type === 'game_over') {
        setText('status-bar', `Game over — ${msg.winner || 'draw'}`);
        if (timerHandle) clearInterval(timerHandle);
      }
    };
  };

  document.getElementById('resign-btn')?.addEventListener('click', () => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resign' }));
  });

  updateTurnPill();
  updateTimers();
  updatePlayerCards();

  if (vsAgentsam) {
    startClock();
    updatePlayerCards();
    updateStatus();
  } else {
    connect();
  }

  window.addEventListener('beforeunload', () => viewport.destroy());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
