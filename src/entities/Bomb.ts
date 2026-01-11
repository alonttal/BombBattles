import { Entity } from './Entity';
import { Player, BombType } from './Player';
import { TILE_SIZE, BOMB_FUSE_TIME, COLORS } from '../constants';
import { EventBus } from '../core/EventBus';

export class Bomb extends Entity {
  public readonly owner: Player;
  public readonly type: BombType;
  public readonly range: number;
  public timer: number;
  public isDetonating: boolean = false;

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

    if (this.timer <= 0 && !this.isDetonating) {
      this.detonate();
    }
  }

  render(ctx: CanvasRenderingContext2D, _interpolation: number): void {
    const x = this.position.pixelX;
    const y = this.position.pixelY;

    // Pulsing effect based on timer
    const urgency = 1 - (this.timer / BOMB_FUSE_TIME);
    const pulseSpeed = 8 + urgency * 12;
    const pulseScale = 1 + Math.sin(this.pulseTimer * pulseSpeed) * 0.1 * (1 + urgency);
    const size = (TILE_SIZE - 12) * pulseScale;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x + TILE_SIZE / 2, y + TILE_SIZE - 4, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bomb body
    ctx.fillStyle = this.getBombColor();
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE / 2 - 6, y + TILE_SIZE / 2 - 6, 6, 0, Math.PI * 2);
    ctx.fill();

    // Fuse
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + TILE_SIZE / 2, y + TILE_SIZE / 2 - size / 2);
    ctx.lineTo(x + TILE_SIZE / 2 + 8, y + TILE_SIZE / 2 - size / 2 - 8);
    ctx.stroke();

    // Fuse spark
    if (Math.sin(this.pulseTimer * 20) > 0) {
      ctx.fillStyle = '#FFA500';
      ctx.beginPath();
      ctx.arc(x + TILE_SIZE / 2 + 8, y + TILE_SIZE / 2 - size / 2 - 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private getBombColor(): string {
    switch (this.type) {
      case BombType.FIRE:
        return '#FF4500';
      case BombType.ICE:
        return '#00CED1';
      case BombType.PIERCING:
        return '#9400D3';
      default:
        return COLORS.bomb;
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
}
