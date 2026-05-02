// src/api/games.js
import { jsonResponse } from '../core/responses.js';

export async function handleGamesApi(request, url, env, _ctx, authUser) {
  const path = url.pathname.toLowerCase();
  const method = request.method;

  // GET /api/games/pieces — returns all chess pieces from cms_assets
  if (path === '/api/games/pieces' && method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT id, filename, public_url, metadata, tags
      FROM cms_assets
      WHERE category = 'chess' AND is_live = 1
      ORDER BY id
    `).all();
    return jsonResponse({ results });
  }

  // POST /api/games/rooms — create a room
  if (path === '/api/games/rooms' && method === 'POST') {
    const roomId = `room_${crypto.randomUUID().replace(/-/g,'').slice(0,12)}`;
    await env.DB.prepare(`
      INSERT INTO game_rooms (id, game_type, status, host_player_id, host_display_name, workspace_id)
      VALUES (?, 'chess', 'open', ?, ?, 'ws_inneranimalmedia')
    `).bind(roomId, authUser?.id ?? 'guest', authUser?.name ?? 'Guest').run();
    return jsonResponse({ roomId });
  }

  // GET /api/games/rooms — list open rooms
  if (path === '/api/games/rooms' && method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT * FROM game_rooms WHERE status = 'open' ORDER BY created_at DESC LIMIT 20
    `).all();
    return jsonResponse({ results });
  }

  // GET /api/games/rooms/:roomId
  if (path.startsWith('/api/games/rooms/') && method === 'GET') {
    const roomId = path.split('/').pop();
    const room = await env.DB.prepare(`SELECT * FROM game_rooms WHERE id = ?`).bind(roomId).first();
    if (!room) return jsonResponse({ error: 'Room not found' }, 404);
    const game = room.current_game_id
      ? await env.DB.prepare(`SELECT * FROM games WHERE id = ?`).bind(room.current_game_id).first()
      : null;
    return jsonResponse({ room, game });
  }

  // GET /api/games/:gameId/moves
  if (path.match(/^\/api\/games\/[^/]+\/moves$/) && method === 'GET') {
    const gameId = path.split('/')[3];
    const { results } = await env.DB.prepare(`
      SELECT * FROM game_moves WHERE game_id = ? ORDER BY move_number ASC
    `).bind(gameId).all();
    return jsonResponse({ results });
  }

  // GET /api/games/ws/:roomId — WebSocket upgrade to ChessRoom DO
  if (path.startsWith('/api/games/ws/')) {
    const roomId = path.split('/').pop();
    const doId = env.CHESS_SESSION.idFromName(roomId);
    const stub = env.CHESS_SESSION.get(doId);
    return stub.fetch(request);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
