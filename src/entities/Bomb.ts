import { Entity } from './Entity';
import { Player, BombType } from './Player';
import { TILE_SIZE, BOMB_FUSE_TIME, RETRO_PALETTE, Direction } from '../constants';
import { EventBus } from '../core/EventBus';

// Pixel art bomb sprite (8x8 pixels)
const BOMB_SPRITE = [
  '..XXXX..',
  '.XXXXXX.',
  'XXXXXXXX',
  'XLXXXXXX',
  'XXXXXXXX',
  'XXXXXXXX',
  '.XXXXXX.',
  '..XXXX..',
];

// Fuse sprite
const FUSE_SPRITE = [
  '..F',
  '.F.',
  'F..',
];

// Bomb colors by type
const BOMB_TYPE_COLORS = {
  [BombType.NORMAL]: {
    main: RETRO_PALETTE.bombBody,
    light: RETRO_PALETTE.bombHighlight,
    dark: '#111111',
  },
  [BombType.FIRE]: {
    main: RETRO_PALETTE.fireOrange,
    light: RETRO_PALETTE.fireYellow,
    dark: RETRO_PALETTE.fireRed,
  },
  [BombType.ICE]: {
    main: RETRO_PALETTE.iceBlue,
    light: RETRO_PALETTE.iceCyan,
    dark: RETRO_PALETTE.iceDark,
  },
  [BombType.PIERCING]: {
    main: RETRO_PALETTE.magicPurple,
    light: RETRO_PALETTE.magicPink,
    dark: RETRO_PALETTE.magicDark,
  },
};

export class Bomb extends Entity {
  public readonly owner: Player;
  public readonly type: BombType;
  public readonly range: number;
  public timer: number;
  public isDetonating: boolean = false;

  // Kick ability properties
  public isSliding: boolean = false;
  public slideDirection: Direction | null = null;
  public slideSpeed: number = 4; // tiles per second

  // Punch ability properties
  public isPunched: boolean = false;
  public punchProgress: number = 0; // 0 to 1
  public punchStartX: number = 0;
  public punchStartY: number = 0;
  public punchTargetX: number = 0;
  public punchTargetY: number = 0;
  public punchDuration: number = 0.5; // seconds

  // Flag to track if the bomb owner has left the bomb's tile
  // Once true, the owner cannot walk back onto the bomb
  public ownerHasLeft: boolean = false;

  private pulseTimer: number = 0;

  constructor(gridX: number, gridY: number, owner: Player) {
    super(gridX, gridY);
    this.owner = owner;
    this.type = owner.bombType;
    this.range = owner.bombRange;
    this.timer = BOMB_FUSE_TIME;
  }

  update(deltaTime: number): void {
    this.timer -= deltaTime;
    this.pulseTimer += deltaTime;

    // Emit danger sparks when bomb is about to explode
    if (this.timer < 1.0 && Math.random() < 0.3) {
      EventBus.emit('bomb-danger-sparks', { bomb: this });
    }

    // Update punch animation
    if (this.isPunched) {
      this.punchProgress += deltaTime / this.punchDuration;

      if (this.punchProgress >= 1) {
        // Punch complete - land at target
        this.isPunched = false;
        this.punchProgress = 0;
        this.position.pixelX = this.punchTargetX;
        this.position.pixelY = this.punchTargetY;
        this.position.gridX = Math.round(this.punchTargetX / TILE_SIZE);
        this.position.gridY = Math.round(this.punchTargetY / TILE_SIZE);
        EventBus.emit('bomb-landed', { bomb: this, gridX: this.position.gridX, gridY: this.position.gridY });
      } else {
        // Update position along arc
        const t = this.punchProgress;
        // Smooth ease-out curve
        const easedT = 1 - Math.pow(1 - t, 3);

        this.position.pixelX = this.punchStartX + (this.punchTargetX - this.punchStartX) * easedT;
        this.position.pixelY = this.punchStartY + (this.punchTargetY - this.punchStartY) * easedT;
      }
    }

    if (this.timer <= 0 && !this.isDetonating) {
      this.detonate();
    }
  }

  render(ctx: CanvasRenderingContext2D, _interpolation: number): void {
    const x = this.position.pixelX;
    const y = this.position.pixelY;

    const pixelSize = 4; // Each sprite pixel = 4 screen pixels
    const colors = BOMB_TYPE_COLORS[this.type];

    // Pulsing effect - toggle between two discrete sizes instead of smooth
    const urgency = 1 - (this.timer / BOMB_FUSE_TIME);
    const pulseSpeed = 8 + urgency * 12;
    const isPulseBig = Math.sin(this.pulseTimer * pulseSpeed) > 0;
    const scale = isPulseBig ? 1.1 : 1.0;

    // Arc offset for punch animation
    let arcOffsetY = 0;
    if (this.isPunched) {
      const t = this.punchProgress;
      arcOffsetY = Math.floor(-Math.sin(t * Math.PI) * 30);
    }

    const centerX = Math.floor(x + TILE_SIZE / 2);
    const centerY = Math.floor(y + TILE_SIZE / 2 + arcOffsetY);

    // Draw pixel shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    const shadowY = y + TILE_SIZE - 6;
    for (let px = -3; px <= 3; px++) {
      const width = Math.abs(px) < 2 ? pixelSize : pixelSize - 2;
      ctx.fillRect(
        Math.floor(centerX + px * pixelSize - pixelSize / 2),
        Math.floor(shadowY),
        width,
        4
      );
    }

    // Danger indicator - flashing red outline when urgent
    const showDanger = urgency > 0.3 && Math.sin(this.pulseTimer * 12) > 0;

    // Draw bomb sprite
    const spriteWidth = 8 * pixelSize * scale;
    const spriteHeight = 8 * pixelSize * scale;
    const startX = centerX - spriteWidth / 2;
    const startY = centerY - spriteHeight / 2;

    const palette: Record<string, string> = {
      'X': showDanger ? RETRO_PALETTE.fireRed : colors.main,
      'L': colors.light,
      'D': colors.dark,
    };

    // Draw each pixel of the bomb sprite
    for (let py = 0; py < BOMB_SPRITE.length; py++) {
      const row = BOMB_SPRITE[py];
      for (let px = 0; px < row.length; px++) {
        const char = row[px];
        if (char === '.') continue;

        const color = palette[char];
        if (!color) continue;

        ctx.fillStyle = color;
        ctx.fillRect(
          Math.floor(startX + px * pixelSize * scale),
          Math.floor(startY + py * pixelSize * scale),
          Math.ceil(pixelSize * scale),
          Math.ceil(pixelSize * scale)
        );
      }
    }

    // Draw black outline around bomb
    this.drawBombOutline(ctx, startX, startY, pixelSize * scale);

    // Draw fuse
    const fuseX = centerX + 8 * scale;
    const fuseY = startY - 4 * scale;
    ctx.fillStyle = RETRO_PALETTE.bombFuse;
    for (let py = 0; py < FUSE_SPRITE.length; py++) {
      const row = FUSE_SPRITE[py];
      for (let px = 0; px < row.length; px++) {
        if (row[px] === 'F') {
          ctx.fillRect(
            Math.floor(fuseX + px * 3),
            Math.floor(fuseY + py * 3),
            3,
            3
          );
        }
      }
    }

    // Draw fuse spark (flickering pixel)
    const sparkOn = Math.sin(this.pulseTimer * 20) > 0;
    const sparkColor = sparkOn ? RETRO_PALETTE.fireYellow : RETRO_PALETTE.fireOrange;
    const sparkX = Math.floor(fuseX + 6);
    const sparkY = Math.floor(fuseY - 4);

    ctx.fillStyle = sparkColor;
    // Main spark (2x2 pixels)
    ctx.fillRect(sparkX, sparkY, 4, 4);

    // Extra spark pixels when urgent
    if (urgency > 0.5) {
      ctx.fillStyle = RETRO_PALETTE.fireWhite;
      ctx.fillRect(sparkX + 1, sparkY + 1, 2, 2);

      // Random spark particles
      if (Math.random() > 0.6) {
        ctx.fillStyle = sparkOn ? RETRO_PALETTE.fireYellow : RETRO_PALETTE.fireOrange;
        const offsets = [[-4, -2], [4, 0], [-2, 4], [2, -4]];
        const offset = offsets[Math.floor(Math.random() * offsets.length)];
        ctx.fillRect(sparkX + offset[0], sparkY + offset[1], 2, 2);
      }
    }

    // Flash white right before explosion (toggle on/off)
    if (this.timer < 0.5 && Math.sin(this.pulseTimer * 30) > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      for (let py = 0; py < BOMB_SPRITE.length; py++) {
        const row = BOMB_SPRITE[py];
        for (let px = 0; px < row.length; px++) {
          if (row[px] !== '.') {
            ctx.fillRect(
              Math.floor(startX + px * pixelSize * scale),
              Math.floor(startY + py * pixelSize * scale),
              Math.ceil(pixelSize * scale),
              Math.ceil(pixelSize * scale)
            );
          }
        }
      }
    }
  }

  private drawBombOutline(ctx: CanvasRenderingContext2D, startX: number, startY: number, pixelSize: number): void {
    ctx.fillStyle = '#000000';

    for (let py = 0; py < BOMB_SPRITE.length; py++) {
      const row = BOMB_SPRITE[py];
      for (let px = 0; px < row.length; px++) {
        if (row[px] !== '.') {
          const hasTop = py === 0 || BOMB_SPRITE[py - 1][px] === '.';
          const hasBottom = py === BOMB_SPRITE.length - 1 || BOMB_SPRITE[py + 1][px] === '.';
          const hasLeft = px === 0 || row[px - 1] === '.';
          const hasRight = px === row.length - 1 || row[px + 1] === '.';

          const drawX = Math.floor(startX + px * pixelSize);
          const drawY = Math.floor(startY + py * pixelSize);
          const size = Math.ceil(pixelSize);

          if (hasTop) ctx.fillRect(drawX - 1, drawY - 1, size + 2, 1);
          if (hasBottom) ctx.fillRect(drawX - 1, drawY + size, size + 2, 1);
          if (hasLeft) ctx.fillRect(drawX - 1, drawY, 1, size);
          if (hasRight) ctx.fillRect(drawX + size, drawY, 1, size);
        }
      }
    }
  }

  detonate(): void {
    if (this.isDetonating) return;
    this.isDetonating = true;
    this.owner.onBombExploded();
    EventBus.emit('bomb-explode', {
      bomb: this,
      gridX: this.position.gridX,
      gridY: this.position.gridY,
      range: this.range,
      type: this.type
    });
    this.destroy();
  }

  triggerChainReaction(): void {
    if (!this.isDetonating) {
      this.timer = 0;
    }
  }

  kick(direction: Direction): void {
    this.isSliding = true;
    this.slideDirection = direction;
    EventBus.emit('bomb-kicked', { bomb: this, direction });
  }

  stopSliding(): void {
    this.isSliding = false;
    this.slideDirection = null;
    // Snap to grid
    this.position.gridX = Math.round(this.position.pixelX / TILE_SIZE);
    this.position.gridY = Math.round(this.position.pixelY / TILE_SIZE);
    this.position.pixelX = this.position.gridX * TILE_SIZE;
    this.position.pixelY = this.position.gridY * TILE_SIZE;
  }

  punch(targetGridX: number, targetGridY: number): void {
    this.isPunched = true;
    this.punchProgress = 0;
    this.punchStartX = this.position.pixelX;
    this.punchStartY = this.position.pixelY;
    this.punchTargetX = targetGridX * TILE_SIZE;
    this.punchTargetY = targetGridY * TILE_SIZE;
    EventBus.emit('bomb-punched', {
      bomb: this,
      targetGridX,
      targetGridY
    });
  }

}
