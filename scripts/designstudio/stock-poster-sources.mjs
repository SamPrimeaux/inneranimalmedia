/**
 * Stock asset poster sources — maps cms_assets.id → GLB for capture + poster R2 key.
 * Posters: glb/posters/{id}.webp → /assets/glb/posters/{id}.webp
 */
export const STOCK_POSTER_R2_PREFIX = 'glb/posters';

export const STOCK_POSTER_SOURCES = [
  {
    id: 'ds_stock_astronaut_rig',
    label: 'Astronaut',
    glbPath: 'public/assets/glb/astronaut/astronaut_rig_animations_opt.glb',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/astronaut/astronaut_rig_animations_opt.glb',
  },
  {
    id: 'ds_stock_game_robot',
    label: 'Game Robot',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/game_assets/game-character-robot.glb',
  },
  {
    id: 'ds_stock_game_collectible',
    label: 'Game Collectible',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/game_assets/game-collectible.glb',
  },
  {
    id: 'ds_stock_game_platform',
    label: 'Game Platform',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/game_assets/game-platform.glb',
  },
  {
    id: 'ds_stock_game_powerup',
    label: 'Game Power-Up',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/game_assets/game-power-up.glb',
  },
  {
    id: 'ds_stock_chess_king',
    label: 'Chess King',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/chess/chess_king_white_opt.glb',
  },
  {
    id: 'ds_stock_chess_queen',
    label: 'Chess Queen',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/chess/chess_queen_white_opt.glb',
  },
  {
    id: 'ds_stock_chess_bishop',
    label: 'Chess Bishop',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/chess/chess_bishop_white_opt.glb',
  },
  {
    id: 'ds_stock_chess_knight',
    label: 'Chess Knight',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/chess/chess_knight_white_opt.glb',
  },
  {
    id: 'ds_stock_chess_rook',
    label: 'Chess Rook',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/chess/chess_rook_white_opt.glb',
  },
  {
    id: 'ds_stock_chess_pawn',
    label: 'Chess Pawn',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/chess/chess_pawn_white_opt.glb',
  },
  {
    id: 'ds_stock_meshy_rook',
    label: 'Meshy Rook',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/misc/Meshy_rook.glb',
  },
  {
    id: 'ds_stock_rocket_chart',
    label: 'Rocket Chart',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/misc/Rocket_Growth_Chart.glb',
  },
];

export function posterR2Key(assetId) {
  return `${STOCK_POSTER_R2_PREFIX}/${assetId}.webp`;
}

export function posterPublicPath(assetId) {
  return `/assets/${posterR2Key(assetId)}`;
}
