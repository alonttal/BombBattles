import { Entity } from './Entity';
import {
  TILE_SIZE,
  COLORS,
  RETRO_PALETTE,
  Direction,
  DEFAULT_PLAYER_SPEED,
  DEFAULT_BOMB_COUNT,
  DEFAULT_BOMB_RANGE,
  MAX_BOMB_COUNT,
  MAX_BOMB_RANGE,
  MAX_SPEED
} from '../constants';
import { EventBus } from '../core/EventBus';
import { PixelArt } from '../rendering/PixelArt';

export enum BombType {
  NORMAL = 'normal',
  FIRE = 'fire',
  ICE = 'ice',
  PIERCING = 'piercing'
}

const PLAYER_COLORS = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];

// Retro player colors with light/dark variants
const RETRO_PLAYER_COLORS = [
  { main: RETRO_PALETTE.player1, light: RETRO_PALETTE.player1Light, dark: RETRO_PALETTE.player1Dark },
  { main: RETRO_PALETTE.player2, light: RETRO_PALETTE.player2Light, dark: RETRO_PALETTE.player2Dark },
  { main: RETRO_PALETTE.player3, light: RETRO_PALETTE.player3Light, dark: RETRO_PALETTE.player3Dark },
  { main: RETRO_PALETTE.player4, light: RETRO_PALETTE.player4Light, dark: RETRO_PALETTE.player4Dark },
];

// Pixel sprite patterns for player (10x12 pixels, will be scaled)
// Legend: . = transparent, X = main color, L = light, D = dark, W = white, B = black, E = eye white, P = pupil
const PLAYER_SPRITES = {
  // Body only (no eyes) - eyes drawn separately for blinking
  body: [
    '...XXXX...',
    '..XXXXXX..',
    '.XXXXXXXX.',
    '.XLXXXXLX.',
    '.XXXXXXXX.',
    '.XXXXXXXX.',
    '..XXXXXX..',
    '...XXXX...',
  ],
  // Feet patterns for walk animation
  feet: {
    idle: [
      '.DDD..DDD.',
      '.DDD..DDD.',
    ],
    walk1: [
      '..DDD.DDD.',
      '..DDD.DDD.',
    ],
    walk2: [
      '.DDD...DDD',
      '.DDD...DDD',
    ],
    walk3: [
      '.DDD.DDD..',
      '.DDD.DDD..',
    ],
    walk4: [
      'DDD...DDD.',
      'DDD...DDD.',
    ],
  },
  // Hand positions (relative offsets)
  hand: [
    'XX',
    'XX',
  ],
  // Victory pose - arms up
  victoryArms: [
    'XX......XX',
    'XX......XX',
  ],
  // Shield ring pattern
  shield: [
    '...XXXX...',
    '.XX....XX.',
    'X........X',
    'X........X',
    'X........X',
    'X........X',
    '.XX....XX.',
    '...XXXX...',
  ],
};

export class Player extends Entity {
  public readonly playerIndex: number;
  public speed: number = DEFAULT_PLAYER_SPEED;
  public maxBombs: number = DEFAULT_BOMB_COUNT;
  public activeBombs: number = 0;
  public bombRange: number = DEFAULT_BOMB_RANGE;
  public bombType: BombType = BombType.NORMAL;

  public abilities: Set<string> = new Set();
  private shieldActive: boolean = false;
  public teleportCharges: number = 0;

  private isAlive: boolean = true;
  private deathAnimationProgress: number = 0;
  private direction: Direction = Direction.DOWN;
  private isMoving: boolean = false;
  private animationFrame: number = 0;
  private animationTimer: number = 0;

  // Juice
  private blinkTimer: number = 0;
  private isBlinking: boolean = false;
  private nextBlinkTime: number = Math.random() * 3 + 2;
  private squashX: number = 1;
  private squashY: number = 1;
  private targetSquashX: number = 1;
  private targetSquashY: number = 1;
  private hitFlashTimer: number = 0;

  // Punch animation
  private isPunching: boolean = false;
  private punchAnimationTimer: number = 0;
  private punchAnimationDuration: number = 0.3;

  // Victory animation
  public isVictory: boolean = false;
  private victoryTimer: number = 0;

  // Teleport animation
  public isTeleporting: boolean = false;
  public teleportPhase: 'out' | 'in' = 'out';
  public teleportProgress: number = 0;
  public teleportTarget: { gridX: number, gridY: number } | null = null;
  private readonly teleportDuration: number = 0.4; // 0.4s out, 0.4s in

  // For debuffs
  private debuffs: Map<string, number> = new Map();

  // Bomb pushback (juicy collision response)
  private pushbackVelocityX: number = 0;
  private pushbackVelocityY: number = 0;
  private pushbackDecay: number = 12; // How fast pushback decays
  private pushbackSquashTimer: number = 0;

  constructor(gridX: number, gridY: number, playerIndex: number) {
    super(gridX, gridY);
    this.playerIndex = playerIndex;
  }

  update(deltaTime: number): void {
    if (!this.isAlive) {
      this.deathAnimationProgress += deltaTime * 2;
      if (this.deathAnimationProgress >= 1) {
        this.isActive = false;
      }
      return;
    }

    // Update debuff timers
    for (const [debuff, time] of this.debuffs) {
      const newTime = time - deltaTime;
      if (newTime <= 0) {
        this.debuffs.delete(debuff);
      } else {
        this.debuffs.set(debuff, newTime);
      }
    }

    // Apply pushback velocity (bomb collision response)
    if (Math.abs(this.pushbackVelocityX) > 0.1 || Math.abs(this.pushbackVelocityY) > 0.1) {
      this.position.pixelX += this.pushbackVelocityX * deltaTime;
      this.position.pixelY += this.pushbackVelocityY * deltaTime;

      // Update grid position
      this.position.gridX = Math.round(this.position.pixelX / TILE_SIZE);
      this.position.gridY = Math.round(this.position.pixelY / TILE_SIZE);

      // Decay pushback with easing
      this.pushbackVelocityX *= Math.exp(-this.pushbackDecay * deltaTime);
      this.pushbackVelocityY *= Math.exp(-this.pushbackDecay * deltaTime);
    } else {
      this.pushbackVelocityX = 0;
      this.pushbackVelocityY = 0;
    }

    // Pushback squash timer
    if (this.pushbackSquashTimer > 0) {
      this.pushbackSquashTimer -= deltaTime;
    }

    // --- Juicy Animation Logic ---
    let baseSquashX = 1;
    let baseSquashY = 1;

    if (this.isMoving) {
      this.animationTimer += deltaTime;
      const stepDuration = 0.1;
      if (this.animationTimer >= stepDuration) {
        this.animationTimer = 0;
        this.animationFrame = (this.animationFrame + 1) % 4;
        if (this.animationFrame === 0 || this.animationFrame === 2) {
          EventBus.emit('player-step', { player: this });
        }
      }

      // Continuous movement wobble
      const wobbleAmount = 0.08 + (this.speed / MAX_SPEED) * 0.05;
      const wobble = Math.sin(performance.now() * 0.015) * wobbleAmount;
      baseSquashX = 1 + wobble;
      baseSquashY = 1 - wobble;

      // NEW: Dust clouds while running (emit continuously)
      if (Math.random() < 0.15) { // 15% chance each frame
        EventBus.emit('player-dust-cloud', { player: this, direction: this.direction });
      }

      // NEW: Speed lines when moving fast
      if (this.speed > DEFAULT_PLAYER_SPEED && Math.random() < 0.4) {
        EventBus.emit('player-speed-lines', { player: this, direction: this.direction });
      }

      // Speed trail (keep existing)
      if (this.speed > DEFAULT_PLAYER_SPEED && Math.random() < 0.3) {
        EventBus.emit('player-trail', { player: this });
      }
    } else {
      this.animationFrame = 0;
      // Idle breathing
      const breatheSpeed = 0.003;
      const breatheAmount = 0.03;
      const breathe = Math.sin(performance.now() * breatheSpeed) * breatheAmount;
      baseSquashX = 1 + breathe;
      baseSquashY = 1 - breathe;
    }

    this.targetSquashX = baseSquashX;
    this.targetSquashY = baseSquashY;

    // Apply pushback squash (overrides base)
    if (this.pushbackSquashTimer > 0) {
      this.pushbackSquashTimer -= deltaTime;
      const t = this.pushbackSquashTimer / 0.15;
      const squash = Math.sin(t * Math.PI) * 0.3;
      this.targetSquashX = 1 + squash;
      this.targetSquashY = 1 - squash * 0.5;
    }

    // Lerp towards target squash
    const squashLerpSpeed = 15;
    this.squashX += (this.targetSquashX - this.squashX) * deltaTime * squashLerpSpeed;
    this.squashY += (this.targetSquashY - this.squashY) * deltaTime * squashLerpSpeed;

    // Update Hit Flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= deltaTime;
    }

    // Blinking
    this.blinkTimer += deltaTime;
    if (this.isBlinking) {
      if (this.blinkTimer > 0.1) {
        this.isBlinking = false;
        this.blinkTimer = 0;
        this.nextBlinkTime = Math.random() * 3 + 2;
      }
    } else {
      if (this.blinkTimer > this.nextBlinkTime) {
        this.isBlinking = true;
        this.blinkTimer = 0;
      }
    }

    // Punch animation
    if (this.isPunching) {
      this.punchAnimationTimer += deltaTime;
      if (this.punchAnimationTimer >= this.punchAnimationDuration) {
        this.isPunching = false;
        this.punchAnimationTimer = 0;
      }
    }

    // Victory animation
    if (this.isVictory) {
      this.victoryTimer += deltaTime * 5;
    }

    // Teleport animation
    if (this.isTeleporting) {
      if (this.teleportPhase === 'out') {
        this.teleportProgress += deltaTime / this.teleportDuration;
        if (this.teleportProgress >= 1) {
          this.teleportPhase = 'in';
          this.teleportProgress = 0;
          if (this.teleportTarget) {
            this.position.gridX = this.teleportTarget.gridX;
            this.position.gridY = this.teleportTarget.gridY;
            this.position.pixelX = this.teleportTarget.gridX * TILE_SIZE;
            this.position.pixelY = this.teleportTarget.gridY * TILE_SIZE;
            EventBus.emit('teleport-arrived', { player: this });
          }
        }
      } else {
        this.teleportProgress += deltaTime / this.teleportDuration;
        if (this.teleportProgress >= 1) {
          this.isTeleporting = false;
          this.teleportProgress = 0;
          this.teleportTarget = null;
        }
      }
    }
  }

  startPunchAnimation(): void {
    this.isPunching = true;
    this.punchAnimationTimer = 0;
  }

  setVictory(): void {
    this.isVictory = true;
    this.stopMoving();
  }

  applyPushback(directionX: number, directionY: number, strength: number = 200): void {
    // Only apply new pushback if not already being pushed back significantly
    const currentPushbackMagnitude = Math.sqrt(
      this.pushbackVelocityX * this.pushbackVelocityX +
      this.pushbackVelocityY * this.pushbackVelocityY
    );
    if (currentPushbackMagnitude > strength * 0.3) {
      return; // Already being pushed, don't stack
    }

    // Normalize direction
    const length = Math.sqrt(directionX * directionX + directionY * directionY);
    if (length > 0) {
      this.pushbackVelocityX = (directionX / length) * strength;
      this.pushbackVelocityY = (directionY / length) * strength;
      this.pushbackSquashTimer = 0.15; // Trigger squash effect
      EventBus.emit('player-pushback', { player: this });
    }
  }

  render(ctx: CanvasRenderingContext2D, interpolation: number): void {
    const pos = this.getInterpolatedPosition(interpolation);
    const x = pos.x;
    const y = pos.y;
    const color = PLAYER_COLORS[this.playerIndex];

    if (!this.isAlive) {
      // Death animation: Spin and shrink
      const progress = this.deathAnimationProgress;
      const scale = 1 - progress;
      const rotation = progress * Math.PI * 4; // 2 spins

      ctx.save();
      ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);
      ctx.translate(-(x + TILE_SIZE / 2), -(y + TILE_SIZE / 2));

      ctx.globalAlpha = Math.max(0, 1 - progress);
      this.drawPlayer(ctx, x, y, color);
      ctx.globalAlpha = 1;

      ctx.restore();
      return;
    }

    // Teleport effect
    if (this.isTeleporting) {
      const progress = this.teleportProgress;
      let scale = 1;
      let rotation = 0;
      let alpha = 1;

      if (this.teleportPhase === 'out') {
        scale = 1 - progress;
        rotation = progress * Math.PI * 4; // 720 degrees
        alpha = 1 - progress;
      } else {
        scale = progress;
        rotation = (1 - progress) * Math.PI * -4;
        alpha = progress;
      }

      ctx.save();
      ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);
      ctx.translate(-(x + TILE_SIZE / 2), -(y + TILE_SIZE / 2));

      ctx.globalAlpha = alpha;
      this.drawPlayer(ctx, x, y, color);
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    // Draw shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x + TILE_SIZE / 2, y + TILE_SIZE - 6, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw player
    this.drawPlayer(ctx, x, y, color);

    // Hit Flash Overlay
    if (this.hitFlashTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, this.hitFlashTimer / 0.2) * 0.6;
      this.drawPlayer(ctx, x, y, '#ffffff'); // Draw purely white version
      ctx.restore();
    }

    // Shield effect
    if (this.shieldActive) {
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TILE_SIZE / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, _color: string): void {
    const colors = RETRO_PLAYER_COLORS[this.playerIndex];
    const pixelSize = 4; // Each pixel is 4x4 screen pixels

    const bobOffset = this.isMoving ? Math.floor(Math.sin(this.animationFrame * Math.PI / 2) * 2) : 0;
    const victoryOffset = this.isVictory ? Math.floor(Math.sin(this.victoryTimer) * 4) - 4 : 0;

    const cx = Math.floor(x + TILE_SIZE / 2);
    const cy = Math.floor(y + TILE_SIZE / 2 + bobOffset + victoryOffset);

    // Color palette for sprites
    const palette: Record<string, string> = {
      'X': colors.main,
      'L': colors.light,
      'D': colors.dark,
      'W': '#ffffff',
      'B': '#000000',
    };

    ctx.save();

    // Draw shadow (simple pixel ellipse)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    const shadowY = y + TILE_SIZE - 8;
    for (let py = 0; py < 2; py++) {
      for (let px = -3; px <= 3; px++) {
        if (Math.abs(px) < 3 || py === 0) {
          ctx.fillRect(
            Math.floor(cx + px * pixelSize - pixelSize),
            Math.floor(shadowY + py * 2),
            pixelSize,
            2
          );
        }
      }
    }

    // Draw feet first (behind body)
    const feetPattern = this.getFeetPattern();
    PixelArt.drawSpriteScaled(
      ctx,
      cx,
      cy + 16 * this.squashY,
      feetPattern,
      palette,
      pixelSize,
      this.squashX,
      this.squashY
    );

    // Draw hands (some behind, some in front based on direction)
    const handY = this.isVictory ? -12 : (this.isMoving ? Math.floor(Math.sin(this.animationFrame * Math.PI) * 4) : 0);
    const leftHandY = handY;
    const rightHandY = this.isVictory ? -12 : -handY;

    // Punch offset
    let punchOffsetX = 0;
    let punchOffsetY = 0;
    if (this.isPunching) {
      const punchProgress = this.punchAnimationTimer / this.punchAnimationDuration;
      const punchExtend = Math.floor(Math.sin(punchProgress * Math.PI) * 8);
      switch (this.direction) {
        case Direction.RIGHT: punchOffsetX = punchExtend; break;
        case Direction.LEFT: punchOffsetX = -punchExtend; break;
        case Direction.UP: punchOffsetY = -punchExtend; break;
        case Direction.DOWN: punchOffsetY = punchExtend; break;
      }
    }

    const drawHand = (offsetX: number, offsetY: number, isPunchHand: boolean) => {
      const px = isPunchHand ? punchOffsetX : 0;
      const py = isPunchHand ? punchOffsetY : 0;
      ctx.fillStyle = colors.main;
      ctx.fillRect(
        Math.floor(cx + (offsetX + px) * this.squashX - pixelSize),
        Math.floor(cy + (offsetY + py) * this.squashY - pixelSize),
        pixelSize * 2,
        pixelSize * 2
      );
      // Black outline
      ctx.fillStyle = '#000000';
      ctx.fillRect(Math.floor(cx + (offsetX + px) * this.squashX - pixelSize - 1), Math.floor(cy + (offsetY + py) * this.squashY - pixelSize - 1), pixelSize * 2 + 2, 1);
      ctx.fillRect(Math.floor(cx + (offsetX + px) * this.squashX - pixelSize - 1), Math.floor(cy + (offsetY + py) * this.squashY + pixelSize), pixelSize * 2 + 2, 1);
      ctx.fillRect(Math.floor(cx + (offsetX + px) * this.squashX - pixelSize - 1), Math.floor(cy + (offsetY + py) * this.squashY - pixelSize), 1, pixelSize * 2);
      ctx.fillRect(Math.floor(cx + (offsetX + px) * this.squashX + pixelSize), Math.floor(cy + (offsetY + py) * this.squashY - pixelSize), 1, pixelSize * 2);
    };

    // Determine which hand is punching
    const rightPunches = (this.direction === Direction.RIGHT || this.direction === Direction.DOWN);
    const leftPunches = (this.direction === Direction.LEFT || this.direction === Direction.UP);

    // Draw back hands first
    if (this.direction === Direction.LEFT || this.direction === Direction.UP) {
      drawHand(14, rightHandY, rightPunches && this.isPunching);
    }
    if (this.direction === Direction.RIGHT || this.direction === Direction.UP) {
      drawHand(-14, leftHandY, leftPunches && this.isPunching);
    }

    // Draw body
    PixelArt.drawSpriteScaled(
      ctx,
      cx,
      cy - 4 * this.squashY,
      PLAYER_SPRITES.body,
      palette,
      pixelSize,
      this.squashX,
      this.squashY
    );

    // Draw 1px black outline around body
    this.drawBodyOutline(ctx, cx, cy - 4 * this.squashY, pixelSize, this.squashX, this.squashY);

    // Draw front hands
    if (this.direction === Direction.RIGHT || this.direction === Direction.DOWN) {
      drawHand(14, rightHandY, rightPunches && this.isPunching);
    }
    if (this.direction === Direction.LEFT || this.direction === Direction.DOWN) {
      drawHand(-14, leftHandY, leftPunches && this.isPunching);
    }

    // Draw face (eyes) - not when facing up
    if (this.direction !== Direction.UP) {
      const eyeOffsetX = this.direction === Direction.LEFT ? -4 : this.direction === Direction.RIGHT ? 4 : 0;
      const eyeOffsetY = this.direction === Direction.DOWN ? 4 : 0;
      this.drawPixelEye(ctx, cx - 6 + eyeOffsetX, cy - 8 + eyeOffsetY, pixelSize);
      this.drawPixelEye(ctx, cx + 6 + eyeOffsetX, cy - 8 + eyeOffsetY, pixelSize);
    }

    ctx.restore();
  }

  private getFeetPattern(): string[] {
    if (!this.isMoving) return PLAYER_SPRITES.feet.idle;
    const frame = this.animationFrame % 4;
    switch (frame) {
      case 0: return PLAYER_SPRITES.feet.walk1;
      case 1: return PLAYER_SPRITES.feet.walk2;
      case 2: return PLAYER_SPRITES.feet.walk3;
      case 3: return PLAYER_SPRITES.feet.walk4;
      default: return PLAYER_SPRITES.feet.idle;
    }
  }

  private drawBodyOutline(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    pixelSize: number,
    scaleX: number,
    scaleY: number
  ): void {
    // Draw a simple 1px black outline around the body shape
    const pattern = PLAYER_SPRITES.body;
    const height = pattern.length;
    const width = pattern[0].length;
    const totalW = width * pixelSize * scaleX;
    const totalH = height * pixelSize * scaleY;
    const startX = cx - totalW / 2;
    const startY = cy - totalH / 2;

    ctx.fillStyle = '#000000';

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        if (pattern[py][px] !== '.') {
          // Check if this pixel is on the edge (has a transparent neighbor)
          const hasTopEdge = py === 0 || pattern[py - 1][px] === '.';
          const hasBottomEdge = py === height - 1 || pattern[py + 1][px] === '.';
          const hasLeftEdge = px === 0 || pattern[py][px - 1] === '.';
          const hasRightEdge = px === width - 1 || pattern[py][px + 1] === '.';

          const drawX = Math.floor(startX + px * pixelSize * scaleX);
          const drawY = Math.floor(startY + py * pixelSize * scaleY);
          const drawW = Math.ceil(pixelSize * scaleX);
          const drawH = Math.ceil(pixelSize * scaleY);

          if (hasTopEdge) ctx.fillRect(drawX - 1, drawY - 1, drawW + 2, 1);
          if (hasBottomEdge) ctx.fillRect(drawX - 1, drawY + drawH, drawW + 2, 1);
          if (hasLeftEdge) ctx.fillRect(drawX - 1, drawY, 1, drawH);
          if (hasRightEdge) ctx.fillRect(drawX + drawW, drawY, 1, drawH);
        }
      }
    }
  }

  private drawPixelEye(ctx: CanvasRenderingContext2D, x: number, y: number, pixelSize: number): void {
    const px = Math.floor(x);
    const py = Math.floor(y);
    const size = Math.floor(pixelSize * 0.75);

    if (this.isBlinking) {
      // Closed eye - horizontal line
      ctx.fillStyle = '#000000';
      ctx.fillRect(px - size, py, size * 2, 2);
    } else {
      // Eye white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - size, py - size, size * 2, size * 2);

      // Pupil - shifts based on direction
      let pupilOffsetX = 0;
      let pupilOffsetY = 0;
      if (this.isMoving) {
        switch (this.direction) {
          case Direction.LEFT: pupilOffsetX = -2; break;
          case Direction.RIGHT: pupilOffsetX = 2; break;
          case Direction.DOWN: pupilOffsetY = 2; break;
        }
      }

      ctx.fillStyle = '#000000';
      ctx.fillRect(
        px - Math.floor(size / 2) + pupilOffsetX,
        py - Math.floor(size / 2) + pupilOffsetY,
        size,
        size
      );

      // Eye shine (small white pixel)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(
        px - Math.floor(size / 2) + pupilOffsetX - 1,
        py - Math.floor(size / 2) + pupilOffsetY - 1,
        2,
        2
      );
    }
  }

  move(direction: Direction, deltaTime: number): void {
    this.direction = direction;
    this.isMoving = true;

    const effectiveSpeed = this.getEffectiveSpeed();
    const moveAmount = effectiveSpeed * TILE_SIZE * deltaTime;

    switch (direction) {
      case Direction.UP:
        this.position.pixelY -= moveAmount;
        break;
      case Direction.DOWN:
        this.position.pixelY += moveAmount;
        break;
      case Direction.LEFT:
        this.position.pixelX -= moveAmount;
        break;
      case Direction.RIGHT:
        this.position.pixelX += moveAmount;
        break;
    }

    // Update grid position
    this.position.gridX = Math.round(this.position.pixelX / TILE_SIZE);
    this.position.gridY = Math.round(this.position.pixelY / TILE_SIZE);
  }

  stopMoving(): void {
    this.isMoving = false;
  }

  getEffectiveSpeed(): number {
    if (this.debuffs.has('slow')) {
      return this.speed * 0.5;
    }
    return this.speed;
  }

  canPlaceBomb(): boolean {
    return this.isAlive && this.activeBombs < this.maxBombs;
  }

  placeBomb(): void {
    if (this.canPlaceBomb()) {
      this.activeBombs++;
      // Juice: Small squash on place
      this.triggerSquash(0.2, 0.1);
      EventBus.emit('bomb-placed', {
        gridX: this.position.gridX,
        gridY: this.position.gridY,
        owner: this
      });
    }
  }

  onBombExploded(): void {
    this.activeBombs = Math.max(0, this.activeBombs - 1);
  }

  die(): void {
    if (this.shieldActive) {
      this.shieldActive = false;
      this.hitFlashTimer = 0.3; // White flash on shield break
      EventBus.emit('shield-consumed', { player: this });
      return;
    }
    this.isAlive = false;
    console.log(`[DEBUG] Player ${this.playerIndex} died at (${this.position.gridX}, ${this.position.gridY})`);
    EventBus.emit('player-died', { player: this });
  }

  isPlayerAlive(): boolean {
    return this.isAlive;
  }

  // Power-up methods
  addBomb(): void {
    this.maxBombs = Math.min(this.maxBombs + 1, MAX_BOMB_COUNT);
  }

  addRange(): void {
    this.bombRange = Math.min(this.bombRange + 1, MAX_BOMB_RANGE);
  }

  addSpeed(): void {
    this.speed = Math.min(this.speed + 0.5, MAX_SPEED);
  }

  grantShield(): void {
    this.shieldActive = true;
  }

  hasShield(): boolean {
    return this.shieldActive;
  }

  addAbility(ability: string): void {
    this.abilities.add(ability);
    if (ability === 'teleport' && this.teleportCharges < 3) {
      this.teleportCharges = 3; // Give initial charges
    }
  }

  hasAbility(ability: string): boolean {
    return this.abilities.has(ability);
  }

  addTeleportCharge(): void {
    this.teleportCharges = Math.min(this.teleportCharges + 1, 3);
  }

  applyDebuff(debuff: string, duration: number): void {
    this.debuffs.set(debuff, duration);
    this.hitFlashTimer = 0.2; // Feedback for getting debuffed (e.g. skull)
  }

  setBombType(type: BombType): void {
    this.bombType = type;
  }

  getDirection(): Direction {
    return this.direction;
  }

  useTeleport(targetGridX: number, targetGridY: number): void {
    if (this.teleportCharges > 0 && !this.isTeleporting) {
      this.isTeleporting = true;
      this.teleportPhase = 'out';
      this.teleportProgress = 0;
      this.teleportTarget = { gridX: targetGridX, gridY: targetGridY };
      this.teleportCharges--;
      // Juice: squash on teleport out
      this.triggerSquash(0.4, 0.2);
      EventBus.emit('teleport-start', { player: this });
    }
  }

  triggerSquash(_amount: number, duration: number): void {
    this.pushbackSquashTimer = duration;
    // We reuse this logic but can be more specific if needed
  }

  canTeleport(): boolean {
    return this.hasAbility('teleport') && this.teleportCharges > 0 && !this.isTeleporting;
  }
}
