/**
 * Public 3D chess room — mounts on /games/room_* via static/pages/games/room.html
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
  let whiteSeconds = 180;
  let blackSeconds = 180;
  let timerHandle: ReturnType<typeof setInterval> | null = null;

  const overlay = document.getElementById('loading-overlay');
  const progressBar = document.getElementById('load-progress');
  const mount = document.getElementById('viewport');
  if (!mount) {
    setText('status-bar', 'Viewport missing.');
    return;
  }

  const updateTimers = () => {
    const whiteEl = document.getElementById('timer-white');
    const blackEl = document.getElementById('timer-black');
    if (whiteEl) {
      whiteEl.textContent = formatTime(whiteSeconds);
      whiteEl.classList.toggle('active', turn === 'white');
    }
    if (blackEl) {
      blackEl.textContent = formatTime(blackSeconds);
      blackEl.classList.toggle('active', turn === 'black');
    }
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
    pill.innerHTML = `<span class="turn-dot ${dotClass}"></span> Turn: ${turn}`;
  };

  const updatePlayerBar = () => {
    setText('player-you-label', myColor === 'spectator' ? 'Spectator' : 'You');
    setText('player-opponent-label', opponentConnected ? 'Opponent' : 'Waiting…');
    const youSide = document.getElementById('you-side-badge');
    if (youSide && myColor && myColor !== 'spectator') {
      youSide.textContent = myColor;
      youSide.className = `side-badge side-${myColor}`;
    }
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
    updatePlayerBar();
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
  connect();

  window.addEventListener('beforeunload', () => viewport.destroy());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
