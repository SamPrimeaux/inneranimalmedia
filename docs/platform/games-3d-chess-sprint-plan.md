# Games 3D Chess — Sprint Plan (2026-06-15)

## Problem

[inneranimalmedia.com/games](https://inneranimalmedia.com/games) advertises **3D Chess**, but `/games/room_*` was a **2D Unicode** board. Design Studio **Meaaux Games** mode already has Three.js + GLB pieces — the public route never used them.

## Today (shipped in this deploy)

| Item | Status |
|------|--------|
| `ChessViewport` (`dashboard/lib/ChessViewport.ts`) | Shared Three.js viewport: `board_main.glb` + 12 piece GLBs |
| `games-room.js` Vite entry | Bundled for public room pages |
| `static/pages/games/room.html` | 3D canvas + WS bridge (replaces Unicode grid) |
| `chessBoardGlbPath()` | Canonical `/assets/glb/chess/v1/board/board_main.glb` |
| Design Studio `VoxelEngine` | Board tries GLB first, voxel fallback |
| CAD Design Studio remaster | CadToolDock, hooks, backend `cad_glb_ready`, scene 581 cols |

### Asset catalog (R2)

All paths under `glb/chess/v1/` per [manifest.json](../../glb/chess/v1/manifest.json):

- `board/board_main.glb`
- `pieces/{white,black}/{king,queen,rook,bishop,knight,pawn}.glb`

Served at `https://inneranimalmedia.com/assets/glb/chess/v1/...`

## Tomorrow — make it epic + guest-safe

### Phase A — Public API auth (½ day)

**Blocker:** `/api/games/*` requires dashboard session; guests see lobby but room WS may 401.

1. Add guest-safe routes in `src/core/public-oauth-paths.js`:
   - `GET /api/games/rooms`
   - `GET /api/games/ws/*` (upgrade already proxied)
2. Split `POST /api/games/rooms`:
   - Authenticated → workspace-scoped (current)
   - Guest → `guest_*` player id cookie, no workspace required
3. Smoke: anonymous create room → open two tabs → both see 3D board

### Phase B — Server move validation (½ day)

`ChessRoom` DO (`src/do/Legacy.js`) trusts client moves.

1. Add `chess.js` helper: FEN apply `from`/`to`, legality check (use `chess.js` npm or minimal validator)
2. On illegal move → `{ type: 'error', message }` + no FEN change
3. Broadcast authoritative FEN on every accepted move

### Phase C — Polish 3D room (1 day)

1. **Highlight squares** — selected piece + legal targets (reuse `chess.js` moves)
2. **Animations** — lerp piece between squares (300ms)
3. **Captured tray** — side columns for taken pieces
4. **Sound + haptics** (optional) — move/capture/check
5. **Mobile** — touch orbit limits, larger hit targets
6. **Lobby** — room list refresh, copy invite link, “Open in Design Studio” deep link:
   `/dashboard/designstudio?room=room_xxx`

### Phase D — Unify with Design Studio (1 day)

1. Extract shared module `dashboard/lib/chessShared.ts` — FEN, colors, WS protocol types
2. Design Studio Games mode: auto-connect when `?room=` query present
3. `syncBoardFromFen` on Games tab enter + starting position without clicking Multiplayer
4. Fix `MEAAUX_GAMES` typo in display only OR one-time D1 `UPDATE scene_snapshots SET project_type='MEAUX_GAMES' WHERE project_type='MEAAUX_GAMES'`

### Phase E — Dedicated shell (optional)

Per [E2E-COMPLETE-PLAN-2026-06.md](../inneranimalmedia/product/designstudio/E2E-COMPLETE-PLAN-2026-06.md):

- Route `/dashboard/meauxgames` → Design Studio with `ProjectType.CHESS` locked
- Lower priority if public `/games` is already 3D

## Deploy checklist

```bash
# Full production (dashboard bundle + games-room.js + worker)
npm run deploy:full

# Games HTML only (if worker unchanged)
./scripts/upload-games-pages.sh
```

## Manual E2E (tomorrow morning)

1. [https://inneranimalmedia.com/games](https://inneranimalmedia.com/games) → Create Room
2. Room loads **3D board** + GLB pieces (not Unicode)
3. Second browser/incognito joins same room URL
4. White moves e2→e4 — both clients update in 3D
5. Design Studio → Games → Multiplayer — same room id, same FEN
6. Save scene as `MEAAUX_GAMES` — reload preserves board + linked GLBs

## Definition of Done (public games)

- [ ] `/games/room_*` is 3D GLB chess (not 2D Unicode)
- [ ] Guest can create/join without login
- [ ] Server validates moves; FEN is authoritative
- [ ] Design Studio and public room share WS + assets
- [ ] Playwright: lobby create + room 3D canvas visible

## Risk notes

- **GLB scale** — board/piece normalization differs; tune `ChessViewport` scale if pieces float
- **Runner not needed** for chess — only CAD OpenSCAD jobs
- **CORS** — GLBs must load via `/assets/glb/...` (Worker passthrough), not external R2 URLs
