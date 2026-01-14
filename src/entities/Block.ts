import { Entity } from './Entity';
import { RETRO_PALETTE } from '../constants';
import { EventBus } from '../core/EventBus';

// Pixel sprite for destructible block (wooden crate - 12x10 top + 2 front)
const WOOD_BLOCK_TOP = [
  'LLLLLLLLLLLL',
  'LHHHHHHHHHDL',
  'LHMMMMMMMMML',
  'LHMMMMMMMMML',
  'LHMMDDMMMMML',
  'LHMMMMMMMMML',
  'LHMMMMMMDDML',
  'LHMMMMMMMMML',
  'LDMMMMMMMMML',
  'DDDDDDDDDDDD',
];

const WOOD_BLOCK_FRONT = [
  'DDDDDDDDDDDD',
  'DDDDDDDDDDDD',
];

// Pixel sprite for indestructible wall (stone/metal - 12x10 top + 2 front)
const WALL_BLOCK_TOP = [
  'LLLLLLLLLLLL',
  'LHHHHHHHHHDL',
  'LHMMMMMMMMML',
  'LHMMLLMMMMML',
  'LHMMMMMMMMML',
  'LHMMMMMMLLML',
  'LHMMMMMMMMML',
  'LHMMMMMMMMML',
  'LDMMMMMMMMML',
  'DDDDDDDDDDDD',
];

const WALL_BLOCK_FRONT = [
  'SSSSSSSSSSSS',
  'SSSSSSSSSSSS',
];

// Destruction animation frames (4 frames of crumbling)
const DESTROY_FRAMES = [
  // Frame 0 - starting to crack
  [
    'LLLLLLLLLLLL',
    'LHHHH.HHHHDL',
    'LHMMM.MMMML',
    'LHM..MMMMML',
    'LHMMM.MMMML',
    'LHMMMMMMMML',
    'LHMMMMMMML',
    'LDMMMMMMMML',
    'DDDDDDDDDDDD',
  ],
  // Frame 1 - more cracks
  [
    'LL.LL..LLLLL',
    'LH.HH.HH.HDL',
    'LHM..M.MMML',
    'LH..M..MMML',
    'LHM...MMMML',
    'LH.MMMMM.ML',
    'LH..MMMM.L',
    'LD.MMMM..ML',
    'DD.DDDDD.DDD',
  ],
  // Frame 2 - breaking apart
  [
    '..LL...L.L..',
    '.H..H.H..H..',
    'L.M..M..M..',
    '..M..M..M..',
    '.HM...M..M.',
    '..M..MM....',
    '.H...M.M...',
    '....MM...M.',
    '..D...D..D.',
  ],
  // Frame 3 - almost gone
  [
    '....L.......',
    '..H.........',
    '.....M......',
    '............',
    '....M.......',
    '............',
    '.........M..',
    '............',
    '............',
  ],
];

export class Block extends Entity {
  public readonly isDestructible: boolean;
  private destroyAnimationProgress: number = 0;
  private isDestroying: boolean = false;
  private destroyFrame: number = 0;

  constructor(gridX: number, gridY: number, isDestructible: boolean) {
    super(gridX, gridY);
    this.isDestructible = isDestructible;
  }

  update(deltaTime: number): void {
    if (this.isDestroying) {
      this.destroyAnimationProgress += deltaTime * 6; // Faster animation
      this.destroyFrame = Math.min(3, Math.floor(this.destroyAnimationProgress * 4));
      if (this.destroyAnimationProgress >= 1) {
        this.isActive = false;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, _interpolation: number): void {
    const x = Math.floor(this.position.pixelX);
    const y = Math.floor(this.position.pixelY);
    const pixelSize = 4; // 12 pixels * 4 = 48 (TILE_SIZE)

    if (this.isDestroying) {
      this.renderDestroyAnimation(ctx, x, y, pixelSize);
    } else if (this.isDestructible) {
      this.renderWoodBlock(ctx, x, y, pixelSize);
    } else {
      this.renderWallBlock(ctx, x, y, pixelSize);
    }
  }

  private renderWoodBlock(ctx: CanvasRenderingContext2D, x: number, y: number, pixelSize: number): void {
    const palette: Record<string, string> = {
      'L': RETRO_PALETTE.woodLight,
      'H': RETRO_PALETTE.woodHighlight,
      'M': RETRO_PALETTE.woodMid,
      'D': RETRO_PALETTE.woodDark,
    };

    // Draw top face
    this.drawSprite(ctx, WOOD_BLOCK_TOP, x, y, pixelSize, palette);

    // Draw front face (at bottom)
    const frontPalette: Record<string, string> = {
      'D': RETRO_PALETTE.woodDark,
    };
    this.drawSprite(ctx, WOOD_BLOCK_FRONT, x, y + 10 * pixelSize, pixelSize, frontPalette);

    // Draw black outline
    this.drawBlockOutline(ctx, x, y, 12 * pixelSize, 12 * pixelSize);
  }

  private renderWallBlock(ctx: CanvasRenderingContext2D, x: number, y: number, pixelSize: number): void {
    const palette: Record<string, string> = {
      'L': RETRO_PALETTE.wallLight,
      'H': RETRO_PALETTE.wallHighlight,
      'M': RETRO_PALETTE.wallMid,
      'D': RETRO_PALETTE.wallDark,
      'S': '#3a3a4a', // Darker shadow for front
    };

    // Draw top face
    this.drawSprite(ctx, WALL_BLOCK_TOP, x, y, pixelSize, palette);

    // Draw front face
    this.drawSprite(ctx, WALL_BLOCK_FRONT, x, y + 10 * pixelSize, pixelSize, palette);

    // Draw black outline
    this.drawBlockOutline(ctx, x, y, 12 * pixelSize, 12 * pixelSize);
  }

  private renderDestroyAnimation(ctx: CanvasRenderingContext2D, x: number, y: number, pixelSize: number): void {
    const frame = DESTROY_FRAMES[this.destroyFrame];
    if (!frame) return;

    const palette: Record<string, string> = {
      'L': RETRO_PALETTE.woodLight,
      'H': RETRO_PALETTE.woodHighlight,
      'M': RETRO_PALETTE.woodMid,
      'D': RETRO_PALETTE.woodDark,
    };

    // Apply some random offset for shake effect
    const shakeX = (Math.random() - 0.5) * 4 * (1 - this.destroyAnimationProgress);
    const shakeY = (Math.random() - 0.5) * 4 * (1 - this.destroyAnimationProgress);

    // Fade out
    ctx.globalAlpha = 1 - this.destroyAnimationProgress * 0.5;

    this.drawSprite(ctx, frame, x + shakeX, y + shakeY, pixelSize, palette);

    ctx.globalAlpha = 1;
  }

  private drawSprite(
    ctx: CanvasRenderingContext2D,
    sprite: string[],
    x: number,
    y: number,
    pixelSize: number,
    palette: Record<string, string>
  ): void {
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
          Math.floor(y + py * pixelSize),
          pixelSize,
          pixelSize
        );
      }
    }
  }

  private drawBlockOutline(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    ctx.fillStyle = '#000000';
    // Top
    ctx.fillRect(x, y - 1, width, 1);
    // Bottom
    ctx.fillRect(x, y + height, width, 1);
    // Left
    ctx.fillRect(x - 1, y, 1, height);
    // Right
    ctx.fillRect(x + width, y, 1, height);
  }

  startDestroy(): void {
    if (!this.isDestructible) return;
    this.isDestroying = true;
    EventBus.emit('block-destroyed', {
      gridX: this.position.gridX,
      gridY: this.position.gridY
    });
  }
}
