import { Entity } from './Entity';
import {
  TILE_SIZE,
  COLORS,
  Direction,
  DEFAULT_PLAYER_SPEED,
  DEFAULT_BOMB_COUNT,
  DEFAULT_BOMB_RANGE,
  MAX_BOMB_COUNT,
  MAX_BOMB_RANGE,
  MAX_SPEED
} from '../constants';
import { EventBus } from '../core/EventBus';

export enum BombType {
  NORMAL = 'normal',
  FIRE = 'fire',
  ICE = 'ice',
  PIERCING = 'piercing'
}

const PLAYER_COLORS = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];

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

  // Punch animation
  private isPunching: boolean = false;
  private punchAnimationTimer: number = 0;
  private punchAnimationDuration: number = 0.3;

  // For debuffs
  private debuffs: Map<string, number> = new Map();

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

    // Animation
    if (this.isMoving) {
      this.animationTimer += deltaTime;
      if (this.animationTimer >= 0.1) {
        this.animationTimer = 0;
        this.animationFrame = (this.animationFrame + 1) % 4;
      }

      // Bounce effect (Squash & Stretch)
      this.squashX = 1 + Math.sin(this.animationFrame * Math.PI) * 0.1;
      this.squashY = 1 - Math.sin(this.animationFrame * Math.PI) * 0.1;

    } else {
      this.animationFrame = 0;
      // Recover to normal shape
      this.squashX += (1 - this.squashX) * deltaTime * 10;
      this.squashY += (1 - this.squashY) * deltaTime * 10;
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
  }

  startPunchAnimation(): void {
    this.isPunching = true;
    this.punchAnimationTimer = 0;
  }

  render(ctx: CanvasRenderingContext2D, interpolation: number): void {
    const pos = this.getInterpolatedPosition(interpolation);
    const x = pos.x;
    const y = pos.y;
    const color = PLAYER_COLORS[this.playerIndex];

    if (!this.isAlive) {
      // Death animation
      const scale = 1 - this.deathAnimationProgress;
      ctx.globalAlpha = scale;
      this.drawPlayer(ctx, x, y, color);
      ctx.globalAlpha = 1;
      return;
    }

    // Draw shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x + TILE_SIZE / 2, y + TILE_SIZE - 6, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw player
    this.drawPlayer(ctx, x, y, color);

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

  private drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    const bobOffset = this.isMoving ? Math.sin(this.animationFrame * Math.PI / 2) * 2 : 0;

    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2 + bobOffset;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this.squashX, this.squashY);

    // Hands & Feet (drawn relative to center)
    let handOffset = this.isMoving ? Math.sin(this.animationFrame * Math.PI) * 6 : 0;
    const footOffset = this.isMoving ? Math.cos(this.animationFrame * Math.PI) * 6 : 0;

    // Punch animation - extend arm forward
    let punchExtend = 0;
    if (this.isPunching) {
      const punchProgress = this.punchAnimationTimer / this.punchAnimationDuration;
      // Punch out and back
      punchExtend = Math.sin(punchProgress * Math.PI) * 12;
    }

    ctx.fillStyle = color;

    // Left Foot - with outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-8, 12 + footOffset, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Right Foot - with outline
    ctx.beginPath();
    ctx.ellipse(8, 12 - footOffset, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hands
    // Back hand - with outline
    ctx.beginPath();
    ctx.arc(this.direction === Direction.RIGHT ? -14 : 14, 0 - handOffset, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Body - with glow and outline
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -4, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Body outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Body highlight (to make it look shiny)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(-4, -8, 6, 0, Math.PI * 2);
    ctx.fill();

    // Front hand - with outline (includes punch extension)
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();

    let frontHandX = this.direction === Direction.RIGHT ? 14 : -14;
    let frontHandY = 0 + handOffset;

    // Apply punch extension
    if (this.isPunching) {
      switch (this.direction) {
        case Direction.RIGHT:
          frontHandX += punchExtend;
          break;
        case Direction.LEFT:
          frontHandX -= punchExtend;
          break;
        case Direction.UP:
          frontHandY -= punchExtend;
          break;
        case Direction.DOWN:
          frontHandY += punchExtend;
          break;
      }
    }

    ctx.arc(frontHandX, frontHandY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Face
    ctx.fillStyle = '#ffffff';
    const eyeOffsetX = this.direction === Direction.LEFT ? -4 : this.direction === Direction.RIGHT ? 4 : 0;
    const eyeOffsetY = this.direction === Direction.UP ? -3 : this.direction === Direction.DOWN ? 2 : 0;

    if (this.direction !== Direction.UP) {
      // Left Eye
      this.drawEye(ctx, -5 + eyeOffsetX, -6 + eyeOffsetY);
      // Right Eye
      this.drawEye(ctx, 5 + eyeOffsetX, -6 + eyeOffsetY);
    }

    // Player number badge with background
    const badgeY = -24;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, badgeY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.playerIndex + 1}`, 0, badgeY);

    ctx.restore();
  }

  private drawEye(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (this.isBlinking) {
      ctx.beginPath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x + 3, y);
      ctx.stroke();
    } else {
      // Eye white with outline
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pupil
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Eye shine (makes it look alive!)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(x - 1, y - 1, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Eyebrow for expression
      ctx.beginPath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.moveTo(x - 4, y - 6);
      ctx.lineTo(x + 3, y - 4);
      ctx.stroke();
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
      EventBus.emit('shield-consumed', { player: this });
      return;
    }
    this.isAlive = false;
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
  }

  hasAbility(ability: string): boolean {
    return this.abilities.has(ability);
  }

  addTeleportCharge(): void {
    this.teleportCharges = Math.min(this.teleportCharges + 1, 3);
  }

  applyDebuff(debuff: string, duration: number): void {
    this.debuffs.set(debuff, duration);
  }

  setBombType(type: BombType): void {
    this.bombType = type;
  }

  getDirection(): Direction {
    return this.direction;
  }
}
