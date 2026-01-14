import { Entity } from './Entity';
import { TILE_SIZE, RETRO_PALETTE } from '../constants';

export enum PowerUpType {
  BOMB_UP = 'bomb_up',
  FIRE_UP = 'fire_up',
  SPEED_UP = 'speed_up',
  SHIELD = 'shield',
  KICK = 'kick',
  PUNCH = 'punch',
  TELEPORT = 'teleport',
  FIRE_BOMB = 'fire_bomb',
  ICE_BOMB = 'ice_bomb',
  PIERCING_BOMB = 'piercing_bomb',
  SKULL = 'skull'
}

// Retro pixel colors for power-ups
const POWERUP_COLORS: Record<PowerUpType, { bg: string; light: string; dark: string }> = {
  [PowerUpType.BOMB_UP]: { bg: '#639bff', light: '#99c0ff', dark: '#3b6ec0' },
  [PowerUpType.FIRE_UP]: { bg: RETRO_PALETTE.fireOrange, light: RETRO_PALETTE.fireYellow, dark: RETRO_PALETTE.fireRed },
  [PowerUpType.SPEED_UP]: { bg: RETRO_PALETTE.uiGreen, light: '#99e550', dark: '#4b8a2b' },
  [PowerUpType.SHIELD]: { bg: RETRO_PALETTE.iceCyan, light: RETRO_PALETTE.iceWhite, dark: RETRO_PALETTE.iceBlue },
  [PowerUpType.KICK]: { bg: '#f77622', light: '#fbf236', dark: '#ab7030' },
  [PowerUpType.PUNCH]: { bg: RETRO_PALETTE.magicPink, light: RETRO_PALETTE.magicWhite, dark: RETRO_PALETTE.magicPurple },
  [PowerUpType.TELEPORT]: { bg: '#5fcde4', light: '#99e5ff', dark: '#3f3f74' },
  [PowerUpType.FIRE_BOMB]: { bg: RETRO_PALETTE.fireRed, light: RETRO_PALETTE.fireOrange, dark: RETRO_PALETTE.fireDark },
  [PowerUpType.ICE_BOMB]: { bg: RETRO_PALETTE.iceBlue, light: RETRO_PALETTE.iceCyan, dark: RETRO_PALETTE.iceDark },
  [PowerUpType.PIERCING_BOMB]: { bg: RETRO_PALETTE.magicPurple, light: RETRO_PALETTE.magicPink, dark: RETRO_PALETTE.magicDark },
  [PowerUpType.SKULL]: { bg: '#696a6a', light: '#9badb7', dark: '#45444f' }
};

// 8x8 pixel icon sprites for each power-up type
const POWERUP_ICONS: Record<PowerUpType, string[]> = {
  [PowerUpType.BOMB_UP]: [
    '...XX...',
    '...XX...',
    '.XXXXXX.',
    '.XXXXXX.',
    'XXXXXXXX',
    'XXXXXXXX',
    '.XXXXXX.',
    '...XX...',
  ],
  [PowerUpType.FIRE_UP]: [
    '...XX...',
    '..XXXX..',
    '.XXXXXX.',
    '.XXXXXX.',
    'XXXXXXXX',
    '.XX..XX.',
    '.X....X.',
    '........',
  ],
  [PowerUpType.SPEED_UP]: [
    '....XX..',
    '...XX...',
    '..XXXX..',
    '.XXXXXX.',
    '..XXXX..',
    '...XX...',
    '..XX....',
    '.XX.....',
  ],
  [PowerUpType.SHIELD]: [
    '.XXXXXX.',
    'XXXXXXXX',
    'XXXXXXXX',
    'XXXXXXXX',
    '.XXXXXX.',
    '..XXXX..',
    '...XX...',
    '........',
  ],
  [PowerUpType.KICK]: [
    '........',
    '.XXXXX..',
    'XXXXXXX.',
    'XXXXXXXX',
    '.XXXXXX.',
    '..XXXX..',
    '..XXXX..',
    '........',
  ],
  [PowerUpType.PUNCH]: [
    '........',
    '..XXXX..',
    '.XXXXXX.',
    'XXXXXXXX',
    'XXXXXXXX',
    '.XXXXXX.',
    '..XX.XX.',
    '........',
  ],
  [PowerUpType.TELEPORT]: [
    '...X....',
    '..XXX...',
    '.X.X.X..',
    'XXXXXXX.',
    '.X.X.X..',
    '..XXX...',
    '...X....',
    '........',
  ],
  [PowerUpType.FIRE_BOMB]: [
    '..XX....',
    '..X.X...',
    '.XXXXX..',
    '.XXXXXX.',
    'XXXXXXXX',
    'XXXXXXXX',
    '.XXXXXX.',
    '..XXXX..',
  ],
  [PowerUpType.ICE_BOMB]: [
    '...X....',
    '.X.X.X..',
    '..XXX...',
    'XXXXXXX.',
    '..XXX...',
    '.X.X.X..',
    '...X....',
    '........',
  ],
  [PowerUpType.PIERCING_BOMB]: [
    '...XX...',
    '..XXXX..',
    '.XXXXXX.',
    'XXXXXXXX',
    'XXXXXXXX',
    '.XXXXXX.',
    '..XXXX..',
    '...XX...',
  ],
  [PowerUpType.SKULL]: [
    '..XXXX..',
    '.XXXXXX.',
    'X.XX.XX.',
    'XXXXXXXX',
    'XXXXXXXX',
    '.XXXXXX.',
    '.X.XX.X.',
    '........',
  ],
};

export class PowerUp extends Entity {
  public readonly type: PowerUpType;
  private bobTimer: number = 0;

  constructor(gridX: number, gridY: number, type: PowerUpType) {
    super(gridX, gridY);
    this.type = type;
  }

  update(deltaTime: number): void {
    this.bobTimer += deltaTime;
  }

  render(ctx: CanvasRenderingContext2D, _interpolation: number): void {
    const x = Math.floor(this.position.pixelX);
    const y = Math.floor(this.position.pixelY);

    // Discrete bobbing - snap to 3 positions
    const bobPhase = Math.floor((this.bobTimer * 4) % 3);
    const bobOffsets = [0, -3, -6];
    const bobOffset = bobOffsets[bobPhase];

    const colors = POWERUP_COLORS[this.type];
    const size = 32; // 32x32 pixel power-up
    const offsetX = x + (TILE_SIZE - size) / 2;
    const offsetY = y + (TILE_SIZE - size) / 2 + bobOffset;

    // Discrete pulse - 2 sizes
    const isPulsed = Math.floor(this.bobTimer * 6) % 2 === 0;
    const scale = isPulsed ? 1.0 : 0.9;
    const scaledSize = Math.floor(size * scale);
    const scaleOffset = (size - scaledSize) / 2;

    const drawX = Math.floor(offsetX + scaleOffset);
    const drawY = Math.floor(offsetY + scaleOffset);

    // Draw alternating border (2 colors)
    const borderColor = Math.floor(this.bobTimer * 8) % 2 === 0 ? '#ffffff' : colors.light;
    ctx.fillStyle = borderColor;
    ctx.fillRect(drawX - 2, drawY - 2, scaledSize + 4, scaledSize + 4);

    // Main background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(drawX, drawY, scaledSize, scaledSize);

    // Inner dark border
    ctx.fillStyle = colors.dark;
    ctx.fillRect(drawX + 2, drawY + scaledSize - 4, scaledSize - 4, 2);
    ctx.fillRect(drawX + scaledSize - 4, drawY + 2, 2, scaledSize - 4);

    // Inner light highlight
    ctx.fillStyle = colors.light;
    ctx.fillRect(drawX + 2, drawY + 2, scaledSize - 6, 2);
    ctx.fillRect(drawX + 2, drawY + 2, 2, scaledSize - 6);

    // Draw the icon sprite
    this.drawPixelIcon(ctx, drawX + 4, drawY + 4, scaledSize - 8);

    // Draw pixel sparkles
    this.drawPixelSparkles(ctx, drawX + scaledSize / 2, drawY + scaledSize / 2, scaledSize / 2 + 8);
  }

  private drawPixelIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const icon = POWERUP_ICONS[this.type];
    const pixelSize = Math.floor(size / 8);

    ctx.fillStyle = '#ffffff';

    for (let py = 0; py < icon.length; py++) {
      const row = icon[py];
      for (let px = 0; px < row.length; px++) {
        if (row[px] === 'X') {
          ctx.fillRect(
            Math.floor(x + px * pixelSize),
            Math.floor(y + py * pixelSize),
            pixelSize,
            pixelSize
          );
        }
      }
    }
  }

  private drawPixelSparkles(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    // 4 pixel sparkles that appear/disappear
    const sparkleCount = 4;
    const rotation = Math.floor(this.bobTimer * 3) * (Math.PI / 4);

    for (let i = 0; i < sparkleCount; i++) {
      // Each sparkle has its own phase - appears and disappears
      const sparklePhase = Math.floor(this.bobTimer * 8 + i * 2) % 4;
      if (sparklePhase === 0) continue; // Hidden this frame

      const angle = (i / sparkleCount) * Math.PI * 2 + rotation;
      const x = Math.floor(cx + Math.cos(angle) * radius);
      const y = Math.floor(cy + Math.sin(angle) * radius);

      // Discrete sparkle sizes
      const sparkleSize = sparklePhase === 2 ? 3 : 2;

      ctx.fillStyle = sparklePhase === 2 ? '#ffffff' : '#ffffaa';

      // Simple cross sparkle
      ctx.fillRect(x - sparkleSize, y, sparkleSize * 2 + 1, 1);
      ctx.fillRect(x, y - sparkleSize, 1, sparkleSize * 2 + 1);
    }
  }
}
