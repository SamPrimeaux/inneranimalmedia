/**
 * Public 3D chess room — mounts on /games/room_* via static/pages/games/room.html
 */
import { ChessViewport } from '../lib/ChessViewport';

function getRoomId(): string {
  return (location.pathname.match(/\/games\/(room_[^/]+)/i) || [])[1] || '';
}

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function boot() {
  const roomId = getRoomId();
  setText('room-id', roomId || 'unknown room');
  if (!roomId) {
    setText('status', 'Invalid room URL.');
    return;
  }

  let fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  let turn: 'white' | 'black' = 'white';
  let myColor: 'white' | 'black' | 'spectator' | null = null;
  let ws: WebSocket | null = null;

  const mount = document.getElementById('viewport');
  if (!mount) {
    setText('status', 'Viewport missing.');
    return;
  }

  const viewport = new ChessViewport({
    container: mount,
    onStatus: (msg) => setText('status', msg),
    onMove: (from, to) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'move', from, to }));
    },
  });

  const updateTurnLabel = () => {
    setText('turn-label', `Turn: ${turn}${myColor ? ` · You are ${myColor}` : ''}`);
  };

  const applyState = () => {
    viewport.setTurn(turn);
    viewport.setPlayerColor(myColor);
    void viewport.syncFromFen(fen);
    updateTurnLabel();
  };

  const connect = () => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/api/games/ws/${encodeURIComponent(roomId)}`);
    ws.onopen = () => setText('status', 'Connected — waiting for opponent…');
    ws.onclose = () => setText('status', 'Disconnected.');
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
      };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'state' || msg.type === 'joined') {
        if (msg.fen) fen = msg.fen;
        if (msg.turn) turn = msg.turn;
        if (msg.color) {
          myColor = msg.color;
          setText('player-color', msg.color);
        }
        applyState();
      } else if (msg.type === 'move') {
        if (msg.fen) fen = msg.fen;
        if (msg.turn) turn = msg.turn;
        if (msg.from && msg.to) viewport.movePieceOnBoard(msg.from, msg.to);
        else applyState();
        updateTurnLabel();
      } else if (msg.type === 'error') {
        setText('status', msg.message || 'Move rejected');
      } else if (msg.type === 'game_over') {
        setText('status', `Game over: ${msg.winner || 'draw'}`);
      }
    };
  };

  document.getElementById('resign-btn')?.addEventListener('click', () => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resign' }));
  });

  void viewport.syncFromFen(fen);
  updateTurnLabel();
  connect();

  window.addEventListener('beforeunload', () => viewport.destroy());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
