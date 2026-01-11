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

// Colors (for placeholder graphics)
export const COLORS = {
  background: '#2d5a27',
  wall: '#4a4a4a',
  softBlock: '#8b6914',
  player1: '#e74c3c',
  player2: '#3498db',
  player3: '#2ecc71',
  player4: '#f1c40f',
  bomb: '#1a1a1a',
  explosion: '#ff6b35',
  powerUp: '#9b59b6'
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
