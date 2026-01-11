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
  [PowerUpType.BOMB_UP]: { bg: '#4DB8FF', icon: '💣' }, // Bright sky blue
  [PowerUpType.FIRE_UP]: { bg: '#FF4757', icon: '🔥' }, // Bright red
  [PowerUpType.SPEED_UP]: { bg: '#7BED9F', icon: '⚡' }, // Bright green
  [PowerUpType.SHIELD]: { bg: '#00E5FF', icon: '🛡️' }, // Cyan
  [PowerUpType.KICK]: { bg: '#FFA502', icon: '👟' }, // Bright orange
  [PowerUpType.PUNCH]: { bg: '#C77DFF', icon: '👊' }, // Bright purple
  [PowerUpType.TELEPORT]: { bg: '#4ECDC4', icon: '✨' }, // Turquoise
  [PowerUpType.FIRE_BOMB]: { bg: '#FF6348', icon: '🌋' }, // Coral red
  [PowerUpType.ICE_BOMB]: { bg: '#70A1FF', icon: '❄️' }, // Ice blue
  [PowerUpType.PIERCING_BOMB]: { bg: '#A55EEA', icon: '💜' }, // Purple
  [PowerUpType.SKULL]: { bg: '#57606F', icon: '💀' } // Medium grey (not too dark)
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
    const bobOffset = Math.sin(this.bobTimer * 4) * 4; // Increased bob

    const colors = POWERUP_COLORS[this.type];
    const centerX = x + TILE_SIZE / 2;
    const centerY = y + TILE_SIZE / 2 + bobOffset;

    // Heartbeat pulse effect (more pronounced)
    const pulse = 1 + Math.sin(this.bobTimer * 8) * 0.15;
    const radius = (TILE_SIZE / 2 - 6) * pulse;

    // Outer glow ring (pulsing)
    const glowPulse = 1 + Math.sin(this.bobTimer * 6) * 0.2;
    ctx.shadowColor = colors.bg;
    ctx.shadowBlur = 20 * glowPulse;
    ctx.strokeStyle = colors.bg;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Strong glow effect
    ctx.shadowColor = colors.bg;
    ctx.shadowBlur = 25;

    // Background circle
    ctx.fillStyle = colors.bg;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Border (thick white outline)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner highlight for depth
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(centerX - 4, centerY - 4, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Draw sparkles around the powerup
    this.drawSparkles(ctx, centerX, centerY, radius + 8);

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

  private drawSparkles(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    // Draw 4 rotating sparkles around the powerup
    const sparkleCount = 4;
    const rotation = this.bobTimer * 2; // Rotate sparkles over time

    for (let i = 0; i < sparkleCount; i++) {
      const angle = (i / sparkleCount) * Math.PI * 2 + rotation;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;

      // Sparkle size pulses
      const sparklePulse = Math.abs(Math.sin(this.bobTimer * 10 + i));
      const size = 3 + sparklePulse * 2;

      ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.6 + sparklePulse * 0.4) + ')';
      ctx.beginPath();

      // Draw a simple cross/plus shape for sparkle
      ctx.fillRect(x - size, y - 0.5, size * 2, 1);
      ctx.fillRect(x - 0.5, y - size, 1, size * 2);

      // Add a small circle in the center
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
