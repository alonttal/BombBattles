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
export const EXPLOSION_KILL_DURATION = EXPLOSION_DURATION / 2; // seconds - how long flames can kill
export const FIRE_LINGER_DURATION = 2.0; // seconds - additional time FIRE bombs linger

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

// Retro Pixel Art Color Palette (inspired by classic 8/16-bit systems)
export const RETRO_PALETTE = {
  // Background greens
  grassLight: '#6abe30',
  grassMid: '#4b8a2b',
  grassDark: '#3f6731',
  grassShadow: '#2c4a22',
  grassHighlight: '#8cd93f',

  // Sky blues
  skyLight: '#99e5ff',
  skyMid: '#5fcde4',
  skyDark: '#639bff',

  // Warm explosion/fire colors
  fireWhite: '#ffffff',
  fireYellow: '#fbf236',
  fireOrange: '#f77622',
  fireRed: '#ac3232',
  fireDark: '#45283c',

  // Ice colors
  iceWhite: '#ffffff',
  iceCyan: '#99e5ff',
  iceBlue: '#5fcde4',
  iceDark: '#3f3f74',

  // Piercing/magic colors
  magicWhite: '#ffffff',
  magicPink: '#d77bba',
  magicPurple: '#76428a',
  magicDark: '#45283c',

  // Block/terrain colors
  wallLight: '#9badb7',
  wallMid: '#696a6a',
  wallDark: '#45444f',
  wallHighlight: '#cbdbfc',
  woodLight: '#d9a066',
  woodMid: '#ab7030',
  woodDark: '#663931',
  woodHighlight: '#eec39a',

  // Bomb colors
  bombBody: '#222222',
  bombHighlight: '#555555',
  bombFuse: '#8a6f30',
  bombSpark: '#fbf236',

  // UI colors
  uiBlack: '#222034',
  uiDark: '#45283c',
  uiMid: '#76428a',
  uiLight: '#9badb7',
  uiWhite: '#ffffff',
  uiGold: '#fbf236',
  uiRed: '#ac3232',
  uiGreen: '#6abe30',

  // Player colors (slightly desaturated for retro look)
  player1: '#e83b3b',    // Red
  player1Light: '#ff7777',
  player1Dark: '#a82020',
  player2: '#639bff',    // Blue
  player2Light: '#99c0ff',
  player2Dark: '#3b6ec0',
  player3: '#6abe30',    // Green
  player3Light: '#99e550',
  player3Dark: '#4b8a2b',
  player4: '#fbf236',    // Yellow
  player4Light: '#ffff88',
  player4Dark: '#c9b030',
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
