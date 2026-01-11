import { Entity } from './Entity';
import { TILE_SIZE } from '../constants';

export enum PowerUpType {
  BOMB_UP = 'bomb_up',
  FIRE_UP = 'fire_up',
  SPEED_UP = 'speed_up',
  SHIELD = 'shield',
  KICK = 'kick',
  PUNCH = 'punch',
  TELEPORT = 'teleport',
  FIRE_BOMB = 'fire_bomb',
  ICE_BOMB = 'ice_bomb',
  PIERCING_BOMB = 'piercing_bomb',
  SKULL = 'skull'
}

const POWERUP_COLORS: Record<PowerUpType, { bg: string; icon: string }> = {
  [PowerUpType.BOMB_UP]: { bg: '#3498db', icon: '💣' },
  [PowerUpType.FIRE_UP]: { bg: '#e74c3c', icon: '🔥' },
  [PowerUpType.SPEED_UP]: { bg: '#2ecc71', icon: '⚡' },
  [PowerUpType.SHIELD]: { bg: '#00ffff', icon: '🛡️' },
  [PowerUpType.KICK]: { bg: '#f39c12', icon: '👟' },
  [PowerUpType.PUNCH]: { bg: '#9b59b6', icon: '👊' },
  [PowerUpType.TELEPORT]: { bg: '#1abc9c', icon: '✨' },
  [PowerUpType.FIRE_BOMB]: { bg: '#ff4500', icon: '🌋' },
  [PowerUpType.ICE_BOMB]: { bg: '#00ced1', icon: '❄️' },
  [PowerUpType.PIERCING_BOMB]: { bg: '#8b00ff', icon: '💜' },
  [PowerUpType.SKULL]: { bg: '#2c3e50', icon: '💀' }
};

export class PowerUp extends Entity {
  public readonly type: PowerUpType;
  private bobTimer: number = 0;

  constructor(gridX: number, gridY: number, type: PowerUpType) {
    super(gridX, gridY);
    this.type = type;
  }

  update(deltaTime: number): void {
    this.bobTimer += deltaTime;
  }

  render(ctx: CanvasRenderingContext2D, _interpolation: number): void {
    const x = this.position.pixelX;
    const y = this.position.pixelY;
    const bobOffset = Math.sin(this.bobTimer * 4) * 3;

    const colors = POWERUP_COLORS[this.type];
    const centerX = x + TILE_SIZE / 2;
    const centerY = y + TILE_SIZE / 2 + bobOffset;
    const radius = TILE_SIZE / 2 - 6;

    // Glow effect
    ctx.shadowColor = colors.bg;
    ctx.shadowBlur = 10;

    // Background circle
    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Icon (using simple shapes instead of emoji for consistency)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw simplified icons
    this.drawIcon(ctx, centerX, centerY);
  }

  private drawIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    switch (this.type) {
      case PowerUpType.BOMB_UP:
        // Plus sign
        ctx.fillRect(x - 8, y - 2, 16, 4);
        ctx.fillRect(x - 2, y - 8, 4, 16);
        break;

      case PowerUpType.FIRE_UP:
        // Flame shape
        ctx.beginPath();
        ctx.moveTo(x, y - 10);
        ctx.quadraticCurveTo(x + 8, y - 4, x + 6, y + 6);
        ctx.quadraticCurveTo(x, y + 2, x - 6, y + 6);
        ctx.quadraticCurveTo(x - 8, y - 4, x, y - 10);
        ctx.fill();
        break;

      case PowerUpType.SPEED_UP:
        // Lightning bolt
        ctx.beginPath();
        ctx.moveTo(x + 4, y - 10);
        ctx.lineTo(x - 2, y);
        ctx.lineTo(x + 2, y);
        ctx.lineTo(x - 4, y + 10);
        ctx.lineTo(x + 2, y + 2);
        ctx.lineTo(x - 2, y + 2);
        ctx.closePath();
        ctx.fill();
        break;

      case PowerUpType.SHIELD:
        // Shield shape
        ctx.beginPath();
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x + 10, y - 5);
        ctx.lineTo(x + 8, y + 5);
        ctx.lineTo(x, y + 10);
        ctx.lineTo(x - 8, y + 5);
        ctx.lineTo(x - 10, y - 5);
        ctx.closePath();
        ctx.stroke();
        break;

      case PowerUpType.KICK:
        // Boot shape
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - 2, y, 10, 6);
        break;

      case PowerUpType.TELEPORT:
        // Star
        this.drawStar(ctx, x, y, 5, 10, 5);
        break;

      case PowerUpType.SKULL:
        // Skull
        ctx.beginPath();
        ctx.arc(x, y - 2, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = POWERUP_COLORS[this.type].bg;
        ctx.beginPath();
        ctx.arc(x - 3, y - 3, 2, 0, Math.PI * 2);
        ctx.arc(x + 3, y - 3, 2, 0, Math.PI * 2);
        ctx.fill();
        break;

      default:
        // Default: circle with letter
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.type[0].toUpperCase(), x, y);
    }
  }

  private drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number): void {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fill();
  }
}
