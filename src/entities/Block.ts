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
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + 4, y + height + 4, TILE_SIZE - 4, TILE_SIZE - height);

      // Front Face (Darker)
      ctx.fillStyle = this.getDarkerColor(this.isDestructible ? COLORS.softBlock : COLORS.wall);
      ctx.fillRect(x, y + height, TILE_SIZE, TILE_SIZE - height);

      // Top Face (Base Color)
      ctx.fillStyle = this.isDestructible ? COLORS.softBlock : COLORS.wall;
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE - height);

      // Top Highlight (Bevel)
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x, y, TILE_SIZE, 4);
      ctx.fillRect(x, y, 4, TILE_SIZE - height);

      // Details
      if (this.isDestructible) {
        // Crate pattern (X box or planks)
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        // Plank lines
        ctx.fillRect(x, y + (TILE_SIZE - height) / 3, TILE_SIZE, 2);
        ctx.fillRect(x, y + (TILE_SIZE - height) * 2 / 3, TILE_SIZE, 2);
        // Nails
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 4, y + 4, 2, 2);
        ctx.fillRect(x + TILE_SIZE - 6, y + 4, 2, 2);
        ctx.fillRect(x + 4, y + TILE_SIZE - height - 6, 2, 2);
        ctx.fillRect(x + TILE_SIZE - 6, y + TILE_SIZE - height - 6, 2, 2);
      } else {
        // Wall rivets/metal plates
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(x + 6, y + 6, TILE_SIZE - 12, TILE_SIZE - height - 12); // Inner plate

        ctx.fillStyle = '#2c3e50'; // Dark rivet
        ctx.beginPath();
        ctx.arc(x + 6, y + 6, 2, 0, Math.PI * 2);
        ctx.arc(x + TILE_SIZE - 6, y + 6, 2, 0, Math.PI * 2);
        ctx.arc(x + 6, y + TILE_SIZE - height - 6, 2, 0, Math.PI * 2);
        ctx.arc(x + TILE_SIZE - 6, y + TILE_SIZE - height - 6, 2, 0, Math.PI * 2);
        ctx.fill();
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
}
