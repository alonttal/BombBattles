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

    // Pulsing effect based on timer (more dramatic)
    const urgency = 1 - (this.timer / BOMB_FUSE_TIME);
    const pulseSpeed = 8 + urgency * 16;
    const pulseScale = 1 + Math.sin(this.pulseTimer * pulseSpeed) * 0.15 * (1 + urgency * 0.5);
    const size = (TILE_SIZE - 12) * pulseScale;

    const centerX = x + TILE_SIZE / 2;
    const centerY = y + TILE_SIZE / 2;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(centerX, y + TILE_SIZE - 4, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Danger glow (increases with urgency)
    if (urgency > 0.3) {
      const glowIntensity = urgency * 30;
      const glowColor = this.type === BombType.NORMAL ? '#FF0000' : this.getBombColor();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glowIntensity;

      // Pulsing danger ring
      ctx.strokeStyle = glowColor;
      ctx.globalAlpha = 0.3 + urgency * 0.3;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, size / 2 + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Bomb body with outline
    ctx.shadowColor = this.getBombColor();
    ctx.shadowBlur = 10;
    ctx.fillStyle = this.getBombColor();
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Black outline for classic bomb look
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Highlight (shiny surface)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(centerX - 6, centerY - 6, 7, 0, Math.PI * 2);
    ctx.fill();

    // Smaller highlight for extra shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(centerX - 4, centerY - 8, 3, 0, Math.PI * 2);
    ctx.fill();

    // Fuse (thicker and more visible)
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - size / 2);
    ctx.lineTo(centerX + 10, centerY - size / 2 - 10);
    ctx.stroke();

    // Fuse outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5.5;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - size / 2);
    ctx.lineTo(centerX + 10, centerY - size / 2 - 10);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // Fuse spark (more dramatic)
    const sparkIntensity = Math.sin(this.pulseTimer * 20);
    if (sparkIntensity > -0.3) {
      const sparkSize = 4 + urgency * 3 + Math.max(0, sparkIntensity) * 2;

      // Spark glow
      ctx.shadowColor = '#FF6600';
      ctx.shadowBlur = 15;

      ctx.fillStyle = sparkIntensity > 0 ? '#FFF700' : '#FF6600';
      ctx.beginPath();
      ctx.arc(centerX + 10, centerY - size / 2 - 10, sparkSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Spark particles (when urgent)
      if (urgency > 0.5 && Math.random() > 0.7) {
        ctx.fillStyle = '#FF8800';
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 3; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 5 + Math.random() * 8;
          ctx.beginPath();
          ctx.arc(
            centerX + 10 + Math.cos(angle) * dist,
            centerY - size / 2 - 10 + Math.sin(angle) * dist,
            1 + Math.random() * 2,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
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
