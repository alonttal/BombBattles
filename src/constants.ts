// Tile and grid settings
export const TILE_SIZE = 48;
export const GRID_WIDTH = 15;
export const GRID_HEIGHT = 13;

// Canvas dimensions
export const CANVAS_WIDTH = GRID_WIDTH * TILE_SIZE;
export const CANVAS_HEIGHT = GRID_HEIGHT * TILE_SIZE;

// Game settings
export const TICK_RATE = 60;
export const TICK_DURATION = 1000 / TICK_RATE;

// Player settings
export const DEFAULT_PLAYER_SPEED = 3; // tiles per second
export const DEFAULT_BOMB_COUNT = 1;
export const DEFAULT_BOMB_RANGE = 2;
export const MAX_BOMB_COUNT = 8;
export const MAX_BOMB_RANGE = 10;
export const MAX_SPEED = 6;

// Bomb settings
export const BOMB_FUSE_TIME = 3.0; // seconds
export const EXPLOSION_DURATION = 0.5; // seconds

// Power-up spawn chance when block is destroyed
export const POWERUP_SPAWN_CHANCE = 0.35;

// Round settings
export const ROUND_TIME = 180; // 3 minutes
export const COUNTDOWN_TIME = 3; // seconds before round starts

// Colors (for placeholder graphics) - Bright and Happy!
export const COLORS = {
  background: '#6BBF59', // Vibrant Grass Green
  wall: '#B0C4DE',       // Light Steel Blue (cheerful)
  softBlock: '#FF9F40',  // Bright Orange/Wood
  player1: '#FF3366',    // Hot Pink-Red (more vibrant)
  player2: '#3399FF',    // Sky Blue (brighter)
  player3: '#33FF99',    // Mint Green (more electric)
  player4: '#FFD700',    // Gold Yellow (more radiant)
  bomb: '#2C2C2C',       // Charcoal Black (classic cartoon bomb)
  explosion: '#FF6B35',  // Bright Orange-Red
  powerUp: '#FF1493'     // Deep Pink (exciting)
};

// Direction enum
export enum Direction {
  UP = 'up',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right'
}

// Game phases
export enum GamePhase {
  LOADING = 'loading',
  MAIN_MENU = 'main_menu',
  PLAYER_SELECT = 'player_select',
  COUNTDOWN = 'countdown',
  PLAYING = 'playing',
  PAUSED = 'paused',
  ROUND_END = 'round_end',
  GAME_OVER = 'game_over'
}
