import { Entity } from './Entity';
import { TILE_SIZE, COLORS } from '../constants';
import { EventBus } from '../core/EventBus';

export class Block extends Entity {
  public readonly isDestructible: boolean;
  private destroyAnimationProgress: number = 0;
  private isDestroying: boolean = false;

  constructor(gridX: number, gridY: number, isDestructible: boolean) {
    super(gridX, gridY);
    this.isDestructible = isDestructible;
  }

  update(deltaTime: number): void {
    if (this.isDestroying) {
      this.destroyAnimationProgress += deltaTime * 4;
      if (this.destroyAnimationProgress >= 1) {
        this.isActive = false;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, _interpolation: number): void {
    const x = this.position.pixelX;
    const y = this.position.pixelY;

    // Pseudo-3D effect: The block "base" is at y+10. The top face is shifted up.
    // Actually, TILE_SIZE is the footprint. Let's say walls are tall.
    // We draw the front face (darker) at the bottom, and top face (lighter) above.
    const height = 8;

    if (this.isDestroying) {
      // Destruction animation - crumble and fade
      const scale = 1 - this.destroyAnimationProgress;
      const offset = (1 - scale) * TILE_SIZE / 2;

      ctx.save();
      ctx.globalAlpha = scale;

      // Draw crumbling debris
      ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      ctx.rotate(this.destroyAnimationProgress * Math.PI);
      ctx.scale(scale, scale);

      ctx.fillStyle = this.isDestructible ? COLORS.softBlock : COLORS.wall;
      ctx.fillRect(-TILE_SIZE / 2 + offset, -TILE_SIZE / 2 + offset, TILE_SIZE * scale, TILE_SIZE * scale);

      ctx.restore();
      ctx.globalAlpha = 1;

    } else {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 4, y + height + 4, TILE_SIZE - 4, TILE_SIZE - height);

      // Front Face (Darker) with gradient
      const frontGradient = ctx.createLinearGradient(x, y + height, x, y + TILE_SIZE);
      const baseColor = this.isDestructible ? COLORS.softBlock : COLORS.wall;
      frontGradient.addColorStop(0, this.getDarkerColor(baseColor));
      frontGradient.addColorStop(1, this.getDarkerColor(this.getDarkerColor(baseColor)));
      ctx.fillStyle = frontGradient;
      ctx.fillRect(x, y + height, TILE_SIZE, TILE_SIZE - height);

      // Top Face with subtle gradient (lighter at top-left)
      const topGradient = ctx.createLinearGradient(x, y, x + TILE_SIZE, y + TILE_SIZE - height);
      topGradient.addColorStop(0, this.getLighterColor(baseColor));
      topGradient.addColorStop(0.5, baseColor);
      topGradient.addColorStop(1, this.getDarkerColor(baseColor));
      ctx.fillStyle = topGradient;
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE - height);

      // Top Highlight (Bevel) - brighter
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, y, TILE_SIZE, 3);
      ctx.fillRect(x, y, 3, TILE_SIZE - height);

      // Bottom/Right shadow edge
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x + TILE_SIZE - 2, y, 2, TILE_SIZE - height);
      ctx.fillRect(x, y + TILE_SIZE - height - 2, TILE_SIZE, 2);

      // Details
      if (this.isDestructible) {
        // Wood grain horizontal lines
        ctx.strokeStyle = 'rgba(139, 90, 43, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          const lineY = y + (TILE_SIZE - height) * i / 4;
          ctx.beginPath();
          ctx.moveTo(x + 2, lineY);
          ctx.lineTo(x + TILE_SIZE - 2, lineY);
          ctx.stroke();
        }

        // Darker plank separators
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(x, y + (TILE_SIZE - height) / 2 - 1, TILE_SIZE, 2);

        // Corner bolts (metallic look)
        this.drawBolt(ctx, x + 5, y + 5);
        this.drawBolt(ctx, x + TILE_SIZE - 7, y + 5);
        this.drawBolt(ctx, x + 5, y + TILE_SIZE - height - 7);
        this.drawBolt(ctx, x + TILE_SIZE - 7, y + TILE_SIZE - height - 7);

      } else {
        // Wall - metal plate look
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(x + 8, y + 8, TILE_SIZE - 16, TILE_SIZE - height - 16);

        // Cross pattern for wall
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 4);
        ctx.lineTo(x + TILE_SIZE - 4, y + TILE_SIZE - height - 4);
        ctx.moveTo(x + TILE_SIZE - 4, y + 4);
        ctx.lineTo(x + 4, y + TILE_SIZE - height - 4);
        ctx.stroke();

        // Corner rivets (darker, metallic)
        this.drawBolt(ctx, x + 5, y + 5);
        this.drawBolt(ctx, x + TILE_SIZE - 7, y + 5);
        this.drawBolt(ctx, x + 5, y + TILE_SIZE - height - 7);
        this.drawBolt(ctx, x + TILE_SIZE - 7, y + TILE_SIZE - height - 7);
      }
    }
  }

  private getDarkerColor(hex: string): string {
    // Simple hex darken
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);

    r = Math.floor(r * 0.7);
    g = Math.floor(g * 0.7);
    b = Math.floor(b * 0.7);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  startDestroy(): void {
    if (!this.isDestructible) return;
    this.isDestroying = true;
    EventBus.emit('block-destroyed', {
      gridX: this.position.gridX,
      gridY: this.position.gridY
    });
  }

  private getLighterColor(hex: string): string {
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);

    r = Math.min(255, Math.floor(r * 1.2));
    g = Math.min(255, Math.floor(g * 1.2));
    b = Math.min(255, Math.floor(b * 1.2));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  private drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Metallic bolt with shine
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Bolt highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(x + 1, y + 1, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Bolt shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(x + 3, y + 3, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}
