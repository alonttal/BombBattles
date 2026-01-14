import { Entity } from './Entity';
import { Direction, TILE_SIZE, EXPLOSION_DURATION, EXPLOSION_KILL_DURATION, FIRE_LINGER_DURATION, RETRO_PALETTE } from '../constants';
import { BombType } from './Player';

export interface ExplosionTile {
  gridX: number;
  gridY: number;
  direction: Direction | 'center';
  isEnd: boolean;
}

// Explosion colors by type (stepped, no gradients)
const EXPLOSION_COLORS = {
  [BombType.NORMAL]: [
    RETRO_PALETTE.fireWhite,
    RETRO_PALETTE.fireYellow,
    RETRO_PALETTE.fireOrange,
    RETRO_PALETTE.fireRed,
  ],
  [BombType.FIRE]: [
    RETRO_PALETTE.fireWhite,
    RETRO_PALETTE.fireYellow,
    RETRO_PALETTE.fireOrange,
    RETRO_PALETTE.fireRed,
  ],
  [BombType.ICE]: [
    RETRO_PALETTE.iceWhite,
    RETRO_PALETTE.iceCyan,
    RETRO_PALETTE.iceBlue,
    RETRO_PALETTE.iceDark,
  ],
  [BombType.PIERCING]: [
    RETRO_PALETTE.magicWhite,
    RETRO_PALETTE.magicPink,
    RETRO_PALETTE.magicPurple,
    RETRO_PALETTE.magicDark,
  ],
};

// Center explosion sprite (12x12 pixels)
const CENTER_SPRITE = [
  '....WWWW....',
  '..WWYYYYWW..',
  '.WYYOOOOYYYW',
  '.WYOORRROOYYW',
  'WYOORRRRROOYW',
  'WYOORRRRROOYW',
  'WYOORRRRROOYW',
  'WYOORRRRROOYW',
  '.WYOORRROOYYW',
  '.WYYOOOOYYYW',
  '..WWYYYYWW..',
  '....WWWW....',
];

// Horizontal flame sprite (12x6 pixels, stretched across tile)
const FLAME_H_SPRITE = [
  'WWWWWWWWWWWW',
  'YYYYYYYYYYYW',
  'OOOOOOOOOOYYW',
  'OOOOOOOOOOYYW',
  'YYYYYYYYYYYW',
  'WWWWWWWWWWWW',
];

// Vertical flame sprite (6x12 pixels)
const FLAME_V_SPRITE = [
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
];

// End cap sprites (triangular)
const END_UP = [
  '..WW..',
  '.WYYAW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
];

const END_DOWN = [
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  'WYOOYW',
  '.WYYAW',
  '..WW..',
];

const END_LEFT = [
  '..WWWW',
  '.WYYYY',
  'WYOOOO',
  'WYOOOO',
  '.WYYYY',
  '..WWWW',
];

const END_RIGHT = [
  'WWWW..',
  'YYYYW.',
  'OOOOWY',
  'OOOOWY',
  'YYYYW.',
  'WWWW..',
];

export class Explosion extends Entity {
  public readonly tiles: ExplosionTile[];
  public readonly bombType: BombType;
  private timer: number = EXPLOSION_DURATION;
  private maxTimer: number = EXPLOSION_DURATION;
  private animFrame: number = 0;

  // Lingering fire support for FIRE bombs
  private isLingering: boolean = false;
  private lingerTimer: number = 0;

  constructor(tiles: ExplosionTile[], bombType: BombType) {
    const center = tiles.find(t => t.direction === 'center') || tiles[0];
    super(center.gridX, center.gridY);
    this.tiles = tiles;
    this.bombType = bombType;

    // FIRE bombs have extended duration with lingering flames
    if (bombType === BombType.FIRE) {
      this.lingerTimer = FIRE_LINGER_DURATION;
    }
  }

  update(deltaTime: number): void {
    if (this.isLingering) {
      // In lingering phase - count down linger timer
      this.lingerTimer -= deltaTime;
      // Slower animation during linger
      this.animFrame = Math.floor((this.lingerTimer * 2) % 4);
      if (this.lingerTimer <= 0) {
        this.destroy();
      }
    } else {
      // Normal explosion phase
      this.timer -= deltaTime;
      // 4-frame animation cycling
      this.animFrame = Math.floor((1 - this.timer / this.maxTimer) * 8) % 4;
      if (this.timer <= 0) {
        // Check if we should enter lingering phase
        if (this.bombType === BombType.FIRE && this.lingerTimer > 0) {
          this.isLingering = true;
        } else {
          this.destroy();
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, _interpolation: number): void {
    let progress: number;
    let alpha: number;

    if (this.isLingering) {
      // Lingering phase - fade out over linger duration
      const lingerProgress = 1 - (this.lingerTimer / FIRE_LINGER_DURATION);
      progress = 0.5 + lingerProgress * 0.5; // Start at 50% scale, go to 100%
      alpha = 0.5 - lingerProgress * 0.4; // Start at 50% alpha, fade to 10%
    } else {
      progress = 1 - (this.timer / this.maxTimer);
      // Stepped alpha fade (3 levels instead of smooth)
      alpha = 1;
      if (progress > 0.7) alpha = 0.6;
      if (progress > 0.85) alpha = 0.3;
    }

    ctx.globalAlpha = alpha;

    for (const tile of this.tiles) {
      this.renderPixelTile(ctx, tile, progress);
    }

    ctx.globalAlpha = 1;
  }

  private renderPixelTile(ctx: CanvasRenderingContext2D, tile: ExplosionTile, progress: number): void {
    const x = Math.floor(tile.gridX * TILE_SIZE);
    const y = Math.floor(tile.gridY * TILE_SIZE);
    const pixelSize = 4;

    const colors = EXPLOSION_COLORS[this.bombType];
    // Cycle through colors based on animation frame for flicker effect
    const colorShift = this.animFrame;

    const palette: Record<string, string> = {
      'W': colors[(0 + colorShift) % 4], // White/brightest
      'Y': colors[(1 + colorShift) % 4], // Yellow/secondary
      'O': colors[(2 + colorShift) % 4], // Orange/tertiary
      'R': colors[(3 + colorShift) % 4], // Red/darkest
      'A': colors[(0 + colorShift) % 4], // Accent (same as white)
    };

    // Scale based on progress (grows then shrinks in discrete steps)
    let scale = 1.0;
    if (progress < 0.15) scale = 0.6;
    else if (progress < 0.3) scale = 0.85;
    else if (progress > 0.8) scale = 0.7;

    if (tile.direction === 'center') {
      this.drawCenterExplosion(ctx, x, y, pixelSize, scale, palette);
    } else if (tile.isEnd) {
      this.drawEndCap(ctx, x, y, pixelSize, scale, palette, tile.direction as Direction);
    } else {
      this.drawFlame(ctx, x, y, pixelSize, scale, palette, tile.direction as Direction);
    }
  }

  private drawCenterExplosion(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    pixelSize: number,
    scale: number,
    palette: Record<string, string>
  ): void {
    const sprite = CENTER_SPRITE;
    const spriteSize = 12 * pixelSize * scale;
    const offsetX = x + (TILE_SIZE - spriteSize) / 2;
    const offsetY = y + (TILE_SIZE - spriteSize) / 2;

    for (let py = 0; py < sprite.length; py++) {
      const row = sprite[py];
      for (let px = 0; px < row.length; px++) {
        const char = row[px];
        if (char === '.') continue;
        const color = palette[char];
        if (!color) continue;

        ctx.fillStyle = color;
        ctx.fillRect(
          Math.floor(offsetX + px * pixelSize * scale),
          Math.floor(offsetY + py * pixelSize * scale),
          Math.ceil(pixelSize * scale),
          Math.ceil(pixelSize * scale)
        );
      }
    }
  }

  private drawFlame(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    pixelSize: number,
    scale: number,
    palette: Record<string, string>,
    direction: Direction
  ): void {
    const isHorizontal = direction === Direction.LEFT || direction === Direction.RIGHT;
    const sprite = isHorizontal ? FLAME_H_SPRITE : FLAME_V_SPRITE;

    if (isHorizontal) {
      // Stretch horizontally to fill tile
      const spriteH = 6 * pixelSize * scale;
      const offsetY = y + (TILE_SIZE - spriteH) / 2;

      for (let py = 0; py < sprite.length; py++) {
        const row = sprite[py];
        for (let px = 0; px < row.length; px++) {
          const char = row[px];
          if (char === '.') continue;
          const color = palette[char];
          if (!color) continue;

          ctx.fillStyle = color;
          ctx.fillRect(
            Math.floor(x + px * pixelSize),
            Math.floor(offsetY + py * pixelSize * scale),
            pixelSize,
            Math.ceil(pixelSize * scale)
          );
        }
      }
    } else {
      // Stretch vertically to fill tile
      const spriteW = 6 * pixelSize * scale;
      const offsetX = x + (TILE_SIZE - spriteW) / 2;

      for (let py = 0; py < sprite.length; py++) {
        const row = sprite[py];
        for (let px = 0; px < row.length; px++) {
          const char = row[px];
          if (char === '.') continue;
          const color = palette[char];
          if (!color) continue;

          ctx.fillStyle = color;
          ctx.fillRect(
            Math.floor(offsetX + px * pixelSize * scale),
            Math.floor(y + py * pixelSize),
            Math.ceil(pixelSize * scale),
            pixelSize
          );
        }
      }
    }
  }

  private drawEndCap(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    pixelSize: number,
    scale: number,
    palette: Record<string, string>,
    direction: Direction
  ): void {
    let sprite: string[];
    let offsetX = x;
    let offsetY = y;

    switch (direction) {
      case Direction.UP:
        sprite = END_UP;
        offsetX = x + (TILE_SIZE - 6 * pixelSize * scale) / 2;
        offsetY = y;
        break;
      case Direction.DOWN:
        sprite = END_DOWN;
        offsetX = x + (TILE_SIZE - 6 * pixelSize * scale) / 2;
        offsetY = y + TILE_SIZE - 6 * pixelSize * scale;
        break;
      case Direction.LEFT:
        sprite = END_LEFT;
        offsetX = x;
        offsetY = y + (TILE_SIZE - 6 * pixelSize * scale) / 2;
        break;
      case Direction.RIGHT:
        sprite = END_RIGHT;
        offsetX = x + TILE_SIZE - 6 * pixelSize * scale;
        offsetY = y + (TILE_SIZE - 6 * pixelSize * scale) / 2;
        break;
      default:
        return;
    }

    for (let py = 0; py < sprite.length; py++) {
      const row = sprite[py];
      for (let px = 0; px < row.length; px++) {
        const char = row[px];
        if (char === '.') continue;
        const color = palette[char];
        if (!color) continue;

        ctx.fillStyle = color;
        ctx.fillRect(
          Math.floor(offsetX + px * pixelSize * scale),
          Math.floor(offsetY + py * pixelSize * scale),
          Math.ceil(pixelSize * scale),
          Math.ceil(pixelSize * scale)
        );
      }
    }

    // Also draw the flame body leading up to the end cap
    this.drawFlame(ctx, x, y, pixelSize, scale, palette, direction);
  }

  getProgress(): number {
    return 1 - (this.timer / this.maxTimer);
  }

  canKill(): boolean {
    // Lingering fire can always kill
    if (this.isLingering) {
      return true;
    }
    // The explosion can kill for EXPLOSION_KILL_DURATION seconds
    // Timer counts down from EXPLOSION_DURATION, so elapsed time = EXPLOSION_DURATION - timer
    const elapsedTime = this.maxTimer - this.timer;
    return elapsedTime < EXPLOSION_KILL_DURATION;
  }
}
