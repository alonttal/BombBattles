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

    if (this.isDestroying) {
      // Destruction animation - shrink and fade
      const scale = 1 - this.destroyAnimationProgress;
      const offset = (1 - scale) * TILE_SIZE / 2;
      ctx.globalAlpha = scale;
      ctx.fillStyle = this.isDestructible ? COLORS.softBlock : COLORS.wall;
      ctx.fillRect(x + offset, y + offset, TILE_SIZE * scale, TILE_SIZE * scale);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = this.isDestructible ? COLORS.softBlock : COLORS.wall;
      ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

      // Add some visual detail
      if (this.isDestructible) {
        // Brick pattern for soft blocks
        ctx.fillStyle = '#7a5c10';
        ctx.fillRect(x + 4, y + TILE_SIZE / 2 - 1, TILE_SIZE - 8, 2);
        ctx.fillRect(x + TILE_SIZE / 2 - 1, y + 4, 2, TILE_SIZE - 8);
      } else {
        // Solid pattern for walls
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
      }
    }
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
