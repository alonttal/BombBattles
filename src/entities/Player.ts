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
    } else {
      this.animationFrame = 0;
    }
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

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2 - 4 + bobOffset, 16, 0, Math.PI * 2);
    ctx.fill();

    // Face
    ctx.fillStyle = '#ffffff';
    const eyeOffsetX = this.direction === Direction.LEFT ? -3 : this.direction === Direction.RIGHT ? 3 : 0;
    const eyeOffsetY = this.direction === Direction.UP ? -3 : this.direction === Direction.DOWN ? 3 : 0;
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE / 2 - 5 + eyeOffsetX, y + TILE_SIZE / 2 - 6 + eyeOffsetY + bobOffset, 4, 0, Math.PI * 2);
    ctx.arc(x + TILE_SIZE / 2 + 5 + eyeOffsetX, y + TILE_SIZE / 2 - 6 + eyeOffsetY + bobOffset, 4, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE / 2 - 5 + eyeOffsetX * 1.5, y + TILE_SIZE / 2 - 6 + eyeOffsetY * 1.5 + bobOffset, 2, 0, Math.PI * 2);
    ctx.arc(x + TILE_SIZE / 2 + 5 + eyeOffsetX * 1.5, y + TILE_SIZE / 2 - 6 + eyeOffsetY * 1.5 + bobOffset, 2, 0, Math.PI * 2);
    ctx.fill();

    // Player number
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.playerIndex + 1}`, x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 6 + bobOffset);
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
