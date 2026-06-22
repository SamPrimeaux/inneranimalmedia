/**
 * Public 3D chess room — SparkChess-style HUD + locked camera viewport.
 */
import { ChessViewport } from '../lib/ChessViewport';

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

function boot() {
  const roomId = getRoomId();
  setText('room-id-short', truncateRoom(roomId));
  if (!roomId) {
    setText('status-bar', 'Invalid room URL.');
    return;
  }

  let fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  let turn: 'white' | 'black' = 'white';
  let myColor: 'white' | 'black' | 'spectator' | null = null;
  let opponentConnected = false;
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
    setText('name-black', youAreBlack ? 'You' : opponentConnected ? 'Opponent' : 'Waiting');

    const subWhite = document.getElementById('sub-white');
    const subBlack = document.getElementById('sub-black');
    if (subWhite) subWhite.textContent = youAreWhite ? sideLabel('white') : 'White';
    if (subBlack) subBlack.textContent = youAreBlack ? sideLabel('black') : 'Orange';

    const avWhite = document.getElementById('avatar-white');
    const avBlack = document.getElementById('avatar-black');
    if (avWhite) avWhite.textContent = youAreWhite ? initials('You') : 'W';
    if (avBlack) avBlack.textContent = youAreBlack ? initials('You') : 'O';
  };

  const updateStatus = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setText('status-bar', 'Connecting…');
      return;
    }
    if (!opponentConnected) {
      setText('status-bar', 'Connected — waiting for opponent');
      return;
    }
    if (myColor && myColor !== 'spectator') {
      setText('status-bar', myColor === turn ? 'Your turn' : "Opponent's turn");
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
      void viewport.syncFromFen(fen);
    },
    onStatus: (msg) => setText('status-bar', msg),
    onMove: (from, to) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'move', from, to }));
    },
  });

  const applyState = () => {
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
  connect();

  window.addEventListener('beforeunload', () => viewport.destroy());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
