import { Entity } from './Entity';
import { Direction, TILE_SIZE, EXPLOSION_DURATION, EXPLOSION_KILL_DURATION } from '../constants';
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

    // Explosion grows then shrinks (more dramatic)
    const scale = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) * 0.4;
    const size = TILE_SIZE * Math.max(0.3, scale);
    const offset = (TILE_SIZE - size) / 2;

    // Animated wave for jagged fire effect
    const waveOffset = Math.sin(progress * Math.PI * 6) * 3;

    // Outer glow
    ctx.shadowColor = colors.outer;
    ctx.shadowBlur = 20 * scale;

    // Draw explosion
    if (tile.direction === 'center') {
      // 1. Shockwave ring (fast expansion)
      if (progress < 0.4) {
        ctx.save();
        const swProgress = progress / 0.4;
        ctx.strokeStyle = colors.inner;
        ctx.lineWidth = 3 * (1 - swProgress);
        ctx.globalAlpha = (1 - swProgress) * 0.4;
        ctx.beginPath();
        ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TILE_SIZE * (0.5 + swProgress * 1.5), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 2. Multi-layered pulsing core
      const coreGradient = ctx.createRadialGradient(
        x + TILE_SIZE / 2, y + TILE_SIZE / 2, 0,
        x + TILE_SIZE / 2, y + TILE_SIZE / 2, size / 2 + 6
      );
      coreGradient.addColorStop(0, '#ffffff');
      coreGradient.addColorStop(0.15, colors.inner);
      coreGradient.addColorStop(0.4, colors.middle);
      coreGradient.addColorStop(0.7, colors.outer);
      coreGradient.addColorStop(1, 'transparent');

      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, size / 2 + 5, 0, Math.PI * 2);
      ctx.fill();

      // 3. Hot white center (jittering slightly)
      const jitterX = (Math.random() - 0.5) * 2;
      const jitterY = (Math.random() - 0.5) * 2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + TILE_SIZE / 2 + jitterX, y + TILE_SIZE / 2 + jitterY, size * 0.18, 0, Math.PI * 2);
      ctx.fill();

    } else {
      // Directional flames with jagged edges
      const isHorizontal = tile.direction === Direction.LEFT || tile.direction === Direction.RIGHT;

      // Create jagged flame path
      ctx.beginPath();

      if (isHorizontal) {
        const flameTop = y + offset - waveOffset;
        const flameBottom = y + TILE_SIZE - offset + waveOffset;
        const flameMid = y + TILE_SIZE / 2;

        ctx.moveTo(x, flameMid);
        for (let i = 0; i <= TILE_SIZE; i += 8) {
          const waveY = flameTop + Math.sin((i + progress * 200) * 0.4) * 4;
          ctx.lineTo(x + i, waveY);
        }
        for (let i = TILE_SIZE; i >= 0; i -= 8) {
          const waveY = flameBottom + Math.sin((i + progress * 200) * 0.4) * 4;
          ctx.lineTo(x + i, waveY);
        }
        ctx.closePath();

        // Gradient fill
        const gradient = ctx.createLinearGradient(x, flameTop, x, flameBottom);
        gradient.addColorStop(0, colors.outer);
        gradient.addColorStop(0.3, colors.middle);
        gradient.addColorStop(0.5, colors.inner);
        gradient.addColorStop(0.7, colors.middle);
        gradient.addColorStop(1, colors.outer);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Extra "Heat" layer in the middle
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(x, flameMid - size * 0.05, TILE_SIZE, size * 0.1);

      } else {
        const flameLeft = x + offset - waveOffset;
        const flameRight = x + TILE_SIZE - offset + waveOffset;
        const flameMid = x + TILE_SIZE / 2;

        ctx.moveTo(flameMid, y);
        for (let i = 0; i <= TILE_SIZE; i += 8) {
          const waveX = flameRight + Math.sin((i + progress * 200) * 0.4) * 4;
          ctx.lineTo(waveX, y + i);
        }
        for (let i = TILE_SIZE; i >= 0; i -= 8) {
          const waveX = flameLeft + Math.sin((i + progress * 200) * 0.4) * 4;
          ctx.lineTo(waveX, y + i);
        }
        ctx.closePath();

        const gradient = ctx.createLinearGradient(flameLeft, y, flameRight, y);
        gradient.addColorStop(0, colors.outer);
        gradient.addColorStop(0.3, colors.middle);
        gradient.addColorStop(0.5, colors.inner);
        gradient.addColorStop(0.7, colors.middle);
        gradient.addColorStop(1, colors.outer);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Extra "Heat" layer in the middle
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(flameMid - size * 0.05, y, size * 0.1, TILE_SIZE);
      }

      // End cap with glow
      if (tile.isEnd) {
        const capGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
        capGradient.addColorStop(0, colors.inner);
        capGradient.addColorStop(0.5, colors.middle);
        capGradient.addColorStop(1, 'transparent');

        ctx.save();
        if (tile.direction === Direction.UP) {
          ctx.translate(x + TILE_SIZE / 2, y + size / 2);
        } else if (tile.direction === Direction.DOWN) {
          ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE - size / 2);
        } else if (tile.direction === Direction.LEFT) {
          ctx.translate(x + size / 2, y + TILE_SIZE / 2);
        } else {
          ctx.translate(x + TILE_SIZE - size / 2, y + TILE_SIZE / 2);
        }

        ctx.fillStyle = capGradient;
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.shadowBlur = 0;
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

  canKill(): boolean {
    // The explosion can kill for EXPLOSION_KILL_DURATION seconds
    // Timer counts down from EXPLOSION_DURATION, so elapsed time = EXPLOSION_DURATION - timer
    const elapsedTime = this.maxTimer - this.timer;
    return elapsedTime < EXPLOSION_KILL_DURATION;
  }
}
