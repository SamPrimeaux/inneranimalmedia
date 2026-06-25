/**
 * Stock asset poster sources — maps cms_assets.id → GLB for capture + poster R2 key.
 * Posters: glb/posters/{id}.webp → /assets/glb/posters/{id}.webp
 */
export const STOCK_POSTER_R2_PREFIX = 'glb/posters';

export const STOCK_POSTER_SOURCES = [
  {
    id: 'asset_iam_footer_glb',
    label: 'IAM Footer',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/inneranimalmediafooterglb.glb',
  },
  {
    id: 'ds_stock_kinetic_symmetry',
    label: 'Kinetic Symmetry',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/Kinetic_Symmetry_0831084700_generate%20(1).glb',
  },
  {
    id: 'ds_stock_meshy_jet',
    label: 'Meshy Jet',
    glbUrl: 'https://inneranimalmedia.com/assets/glb/Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
  },
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
    label: 'Chess King (White)',
    glbUrl: 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_king_white_opt.glb',
  },
  {
    id: 'ds_stock_chess_queen',
    label: 'Chess Queen (White)',
    glbUrl: 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_queen_white_opt.glb',
  },
  {
    id: 'ds_stock_chess_bishop',
    label: 'Chess Bishop (White)',
    glbUrl: 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_bishop_white_opt.glb',
  },
  {
    id: 'ds_stock_chess_knight',
    label: 'Chess Knight (White)',
    glbUrl: 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_knight_white_opt.glb',
  },
  {
    id: 'ds_stock_chess_rook',
    label: 'Chess Rook (White)',
    glbUrl: 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_rook_white_opt.glb',
  },
  {
    id: 'ds_stock_chess_pawn',
    label: 'Chess Pawn (White)',
    glbUrl: 'https://assets.inneranimalmedia.com/glb/chess/baroque/baroque_pawn_white_opt.glb',
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
