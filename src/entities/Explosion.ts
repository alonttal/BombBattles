import { Entity } from './Entity';
import { Direction, TILE_SIZE, EXPLOSION_DURATION } from '../constants';
import { BombType } from './Player';

export interface ExplosionTile {
  gridX: number;
  gridY: number;
  direction: Direction | 'center';
  isEnd: boolean;
}

export class Explosion extends Entity {
  public readonly tiles: ExplosionTile[];
  public readonly bombType: BombType;
  private timer: number = EXPLOSION_DURATION;
  private maxTimer: number = EXPLOSION_DURATION;

  constructor(tiles: ExplosionTile[], bombType: BombType) {
    // Use the center tile as the entity position
    const center = tiles.find(t => t.direction === 'center') || tiles[0];
    super(center.gridX, center.gridY);
    this.tiles = tiles;
    this.bombType = bombType;
  }

  update(deltaTime: number): void {
    this.timer -= deltaTime;
    if (this.timer <= 0) {
      this.destroy();
    }
  }

  render(ctx: CanvasRenderingContext2D, _interpolation: number): void {
    const progress = 1 - (this.timer / this.maxTimer);
    const alpha = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2;

    ctx.globalAlpha = alpha;

    for (const tile of this.tiles) {
      this.renderTile(ctx, tile, progress);
    }

    ctx.globalAlpha = 1;
  }

  private renderTile(ctx: CanvasRenderingContext2D, tile: ExplosionTile, progress: number): void {
    const x = tile.gridX * TILE_SIZE;
    const y = tile.gridY * TILE_SIZE;

    // Get explosion colors based on bomb type
    const colors = this.getExplosionColors();

    // Explosion grows then shrinks
    const scale = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) * 0.3;
    const size = TILE_SIZE * scale;
    const offset = (TILE_SIZE - size) / 2;

    // Draw explosion
    if (tile.direction === 'center') {
      // Center is a circle
      const gradient = ctx.createRadialGradient(
        x + TILE_SIZE / 2, y + TILE_SIZE / 2, 0,
        x + TILE_SIZE / 2, y + TILE_SIZE / 2, size / 2
      );
      gradient.addColorStop(0, colors.inner);
      gradient.addColorStop(0.5, colors.middle);
      gradient.addColorStop(1, colors.outer);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Directional flames
      ctx.fillStyle = colors.middle;

      const isHorizontal = tile.direction === Direction.LEFT || tile.direction === Direction.RIGHT;

      if (isHorizontal) {
        ctx.fillRect(x, y + offset, TILE_SIZE, size);
        // Inner glow
        ctx.fillStyle = colors.inner;
        ctx.fillRect(x, y + offset + size * 0.25, TILE_SIZE, size * 0.5);
      } else {
        ctx.fillRect(x + offset, y, size, TILE_SIZE);
        // Inner glow
        ctx.fillStyle = colors.inner;
        ctx.fillRect(x + offset + size * 0.25, y, size * 0.5, TILE_SIZE);
      }

      // End cap
      if (tile.isEnd) {
        ctx.fillStyle = colors.outer;
        ctx.beginPath();
        if (tile.direction === Direction.UP) {
          ctx.arc(x + TILE_SIZE / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        } else if (tile.direction === Direction.DOWN) {
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE - size / 2, size / 2, 0, Math.PI * 2);
        } else if (tile.direction === Direction.LEFT) {
          ctx.arc(x + size / 2, y + TILE_SIZE / 2, size / 2, 0, Math.PI * 2);
        } else {
          ctx.arc(x + TILE_SIZE - size / 2, y + TILE_SIZE / 2, size / 2, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }
  }

  private getExplosionColors(): { inner: string; middle: string; outer: string } {
    switch (this.bombType) {
      case BombType.ICE:
        return { inner: '#ffffff', middle: '#00ffff', outer: '#0088ff' };
      case BombType.FIRE:
        return { inner: '#ffffff', middle: '#ff4400', outer: '#880000' };
      case BombType.PIERCING:
        return { inner: '#ffffff', middle: '#ff00ff', outer: '#8800ff' };
      default:
        return { inner: '#ffffff', middle: '#ff6600', outer: '#ff0000' };
    }
  }

  getProgress(): number {
    return 1 - (this.timer / this.maxTimer);
  }
}
