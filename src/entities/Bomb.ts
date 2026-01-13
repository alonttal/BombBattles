import { Entity } from './Entity';
import { Player, BombType } from './Player';
import { TILE_SIZE, BOMB_FUSE_TIME, COLORS, Direction } from '../constants';
import { EventBus } from '../core/EventBus';

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

    // Pulsing effect based on timer (more dramatic)
    const urgency = 1 - (this.timer / BOMB_FUSE_TIME);
    const pulseSpeed = 8 + urgency * 16;
    const pulseScale = 1 + Math.sin(this.pulseTimer * pulseSpeed) * 0.15 * (1 + urgency * 0.5);
    const size = (TILE_SIZE - 12) * pulseScale;

    // Arc offset for punch animation
    let arcOffsetY = 0;
    if (this.isPunched) {
      // Parabolic arc - highest at middle of flight
      const t = this.punchProgress;
      arcOffsetY = -Math.sin(t * Math.PI) * 30; // Max height of 30 pixels
    }

    const centerX = x + TILE_SIZE / 2;
    const centerY = y + TILE_SIZE / 2 + arcOffsetY;

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

    // Bomb body with 3D gradient
    const bombRadius = size / 2;
    const bodyGradient = ctx.createRadialGradient(
      centerX - bombRadius * 0.3, centerY - bombRadius * 0.3, bombRadius * 0.1,
      centerX, centerY, bombRadius
    );

    const baseColor = this.getBombColor();
    // Lighter highlight at top-left
    bodyGradient.addColorStop(0, this.lightenColor(baseColor, 60));
    bodyGradient.addColorStop(0.3, this.lightenColor(baseColor, 20));
    bodyGradient.addColorStop(0.7, baseColor);
    bodyGradient.addColorStop(1, this.darkenColor(baseColor, 40));

    ctx.shadowColor = baseColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, bombRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Bold black outline for classic cartoon bomb
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Glossy highlight (main)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.ellipse(centerX - 5, centerY - 6, 6, 4, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // Small specular highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(centerX - 3, centerY - 9, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Flash white right before explosion
    if (this.timer < 0.5 && Math.sin(this.pulseTimer * 50) > 0.5) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

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

  // Color manipulation helpers for gradient effects
  private lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
  }

  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
  }
}
