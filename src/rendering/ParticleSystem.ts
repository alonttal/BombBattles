import { RETRO_PALETTE } from '../constants';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  friction: number;
  rotation: number;
  rotationSpeed: number;
  shape: 'circle' | 'square' | 'spark' | 'text' | 'ring' | 'pixel' | 'pixelStar' | 'pixelCross';
  text?: string;
}

export interface ParticleConfig {
  x: number;
  y: number;
  count: number;
  spread: number;
  speed: { min: number; max: number };
  angle?: { min: number; max: number }; // In radians, defaults to all directions
  lifetime: { min: number; max: number };
  size: { min: number; max: number };
  colors: string[];
  gravity?: number;
  friction?: number;
  shape?: 'circle' | 'square' | 'spark' | 'text' | 'ring' | 'pixel' | 'pixelStar' | 'pixelCross';
  text?: string;
}

// Preset configurations (using RETRO_PALETTE colors and pixel shapes)
export const PARTICLE_PRESETS = {
  explosion: {
    count: 30,
    spread: 8,
    speed: { min: 100, max: 300 },
    lifetime: { min: 0.3, max: 0.8 },
    size: { min: 4, max: 8 },
    colors: [RETRO_PALETTE.fireWhite, RETRO_PALETTE.fireYellow, RETRO_PALETTE.fireOrange, RETRO_PALETTE.fireRed],
    gravity: 200,
    friction: 0.95,
    shape: 'pixel' as const
  },

  explosionSparks: {
    count: 15,
    spread: 4,
    speed: { min: 200, max: 400 },
    lifetime: { min: 0.2, max: 0.5 },
    size: { min: 4, max: 6 },
    colors: [RETRO_PALETTE.fireYellow, RETRO_PALETTE.fireWhite, RETRO_PALETTE.fireOrange],
    gravity: 100,
    friction: 0.98,
    shape: 'pixelCross' as const
  },

  iceExplosion: {
    count: 25,
    spread: 8,
    speed: { min: 80, max: 250 },
    lifetime: { min: 0.4, max: 1.0 },
    size: { min: 4, max: 8 },
    colors: [RETRO_PALETTE.iceWhite, RETRO_PALETTE.iceCyan, RETRO_PALETTE.iceBlue],
    gravity: 50,
    friction: 0.92,
    shape: 'pixel' as const
  },

  fireExplosion: {
    count: 35,
    spread: 10,
    speed: { min: 60, max: 200 },
    lifetime: { min: 0.5, max: 1.2 },
    size: { min: 4, max: 10 },
    colors: [RETRO_PALETTE.fireRed, RETRO_PALETTE.fireOrange, RETRO_PALETTE.fireYellow],
    gravity: -50, // Fire rises
    friction: 0.94,
    shape: 'pixel' as const
  },

  debris: {
    count: 10,
    spread: 4,
    speed: { min: 150, max: 350 },
    angle: { min: -Math.PI * 0.8, max: -Math.PI * 0.2 }, // Mostly upward
    lifetime: { min: 0.4, max: 0.8 },
    size: { min: 4, max: 8 },
    colors: [RETRO_PALETTE.woodLight, RETRO_PALETTE.woodMid, RETRO_PALETTE.woodDark],
    gravity: 600,
    friction: 0.99,
    shape: 'pixel' as const
  },

  powerUpCollect: {
    count: 12,
    spread: 2,
    speed: { min: 50, max: 150 },
    angle: { min: -Math.PI, max: 0 }, // Upward
    lifetime: { min: 0.3, max: 0.6 },
    size: { min: 4, max: 8 },
    colors: [RETRO_PALETTE.uiWhite, RETRO_PALETTE.uiGold, RETRO_PALETTE.uiGreen],
    gravity: -100,
    friction: 0.95,
    shape: 'pixelStar' as const
  },

  death: {
    count: 25,
    spread: 10,
    speed: { min: 100, max: 250 },
    lifetime: { min: 0.5, max: 1.0 },
    size: { min: 4, max: 10 },
    colors: [RETRO_PALETTE.fireRed, RETRO_PALETTE.uiRed, RETRO_PALETTE.uiWhite],
    gravity: 150,
    friction: 0.96,
    shape: 'pixel' as const
  },

  ashes: {
    count: 40,
    spread: 20,
    speed: { min: 30, max: 80 },
    angle: { min: -Math.PI * 0.8, max: -Math.PI * 0.2 }, // Mostly upward initially
    lifetime: { min: 1.0, max: 2.0 },
    size: { min: 2, max: 6 },
    colors: ['#1a1a1a', '#2d2d2d', '#404040', '#333333'],
    gravity: 80, // Falls slowly like ash
    friction: 0.98,
    shape: 'pixel' as const
  },

  smoke: {
    count: 8,
    spread: 6,
    speed: { min: 20, max: 60 },
    lifetime: { min: 0.8, max: 1.5 },
    size: { min: 8, max: 16 },
    colors: ['#444444', '#666666', '#888888'],
    gravity: -30,
    friction: 0.98,
    shape: 'circle' as const
  },

  flash: {
    count: 1,
    spread: 0,
    speed: { min: 0, max: 0 },
    lifetime: { min: 0.1, max: 0.15 },
    size: { min: 200, max: 300 },
    colors: ['#ffffff'],
    shape: 'circle' as const
  },

  shockwave: {
    count: 1,
    spread: 0,
    speed: { min: 0, max: 0 },
    lifetime: { min: 0.3, max: 0.5 },
    size: { min: 100, max: 200 },
    colors: ['#ffffff'],
    shape: 'ring' as const
  },

  kickTrail: {
    count: 3,
    spread: 8,
    speed: { min: 10, max: 30 },
    lifetime: { min: 0.2, max: 0.4 },
    size: { min: 3, max: 6 },
    colors: ['#ffffff', '#ffcc00', '#ff8800'],
    gravity: 0,
    friction: 0.95,
    shape: 'circle' as const
  },

  teleportOut: {
    count: 20,
    spread: 10,
    speed: { min: 20, max: 50 },
    angle: { min: 0, max: Math.PI * 2 }, // Inward? Use negative speed? Particle system uses speed as magnitude.
    // To do inward spiral we need update logic or negative velocity?
    // Let's just do explosion outwards for now or simple cloud
    lifetime: { min: 0.5, max: 0.8 },
    size: { min: 2, max: 5 },
    colors: ['#cc00ff', '#ff00ff', '#ffffff'],
    gravity: -20,
    shape: 'square' as const
  },

  teleportIn: {
    count: 20,
    spread: 10,
    speed: { min: 50, max: 100 },
    lifetime: { min: 0.4, max: 0.7 },
    size: { min: 3, max: 6 },
    colors: ['#00ffff', '#ffffff', '#0088ff'],
    gravity: -20,
    shape: 'square' as const
  },

  punchImpact: {
    count: 12,
    spread: 5,
    speed: { min: 100, max: 200 },
    lifetime: { min: 0.2, max: 0.4 },
    size: { min: 3, max: 6 },
    colors: ['#ffffff', '#ffff00'],
    gravity: 50,
    shape: 'spark' as const
  },

  footstep: {
    count: 2,
    spread: 4,
    speed: { min: 10, max: 30 },
    angle: { min: -Math.PI, max: 0 }, // Upward
    lifetime: { min: 0.3, max: 0.6 },
    size: { min: 2, max: 4 },
    colors: ['#aaaaaa', '#dddddd'],
    gravity: -10,
    friction: 0.9,
    shape: 'circle' as const
  },

  shieldBreak: {
    count: 20,
    spread: 0,
    speed: { min: 100, max: 300 },
    lifetime: { min: 0.4, max: 0.8 },
    size: { min: 3, max: 8 },
    colors: ['#00ffff', '#ccffff', '#ffffff'],
    gravity: 200,
    friction: 0.95,
    shape: 'square' as const
  },

  charge: {
    count: 1, // Emitted continuously
    spread: 16,
    speed: { min: -20, max: -50 }, // Inward
    lifetime: { min: 0.5, max: 1.0 },
    size: { min: 2, max: 4 },
    colors: ['#ffffff', '#ffff00'],
    gravity: 0,
    shape: 'square' as const
  },

  speedTrail: {
    count: 1,
    spread: 2,
    speed: { min: 0, max: 0 },
    lifetime: { min: 0.1, max: 0.3 },
    size: { min: 3, max: 5 },
    colors: ['#ffffff', '#ffff00'], // Override with player color
    gravity: 0,
    shape: 'circle' as const
  },

  // NEW: Lingering embers that float upward after explosions
  embers: {
    count: 18,
    spread: 20,
    speed: { min: 10, max: 40 },
    angle: { min: -Math.PI * 0.75, max: -Math.PI * 0.25 }, // Mostly upward
    lifetime: { min: 1.0, max: 2.0 },
    size: { min: 2, max: 5 },
    colors: ['#ff6600', '#ff9933', '#ffcc66', '#ffffff'],
    gravity: -15, // Slow upward drift
    friction: 0.98,
    shape: 'circle' as const
  },

  // NEW: Expanding smoke clouds with rotation
  expandingSmoke: {
    count: 10,
    spread: 12,
    speed: { min: 15, max: 35 },
    lifetime: { min: 1.2, max: 1.8 },
    size: { min: 12, max: 24 },
    colors: ['#555555', '#777777', '#999999'],
    gravity: -20, // Rises slowly
    friction: 0.97,
    shape: 'circle' as const
  },

  // NEW: Dust clouds for running players
  dustCloud: {
    count: 2,
    spread: 6,
    speed: { min: 5, max: 15 },
    lifetime: { min: 0.3, max: 0.6 },
    size: { min: 4, max: 8 },
    colors: ['#999999', '#aaaaaa', '#bbbbbb'],
    gravity: 0,
    friction: 0.92,
    shape: 'circle' as const
  },

  // NEW: Speed lines for fast movement
  speedLines: {
    count: 3,
    spread: 8,
    speed: { min: 0, max: 5 },
    lifetime: { min: 0.15, max: 0.3 },
    size: { min: 2, max: 4 },
    colors: ['#ffffff', '#eeeeee'],
    gravity: 0,
    friction: 1.0,
    shape: 'spark' as const // Elongated lines
  },

  // NEW: Ambient wind particles (leaves, petals)
  windParticles: {
    count: 1,
    spread: 0,
    speed: { min: 30, max: 50 },
    angle: { min: Math.PI * 0.1, max: Math.PI * 0.3 }, // Diagonal drift
    lifetime: { min: 3.0, max: 5.0 },
    size: { min: 3, max: 6 },
    colors: ['#7FD957', '#FFFFFF', '#FFC0CB'], // Green, white, pink
    gravity: 5, // Slight downward drift
    friction: 0.995,
    shape: 'square' as const
  },

  // NEW: Impact burst when landing
  impactBurst: {
    count: 8,
    spread: 0,
    speed: { min: 40, max: 80 },
    lifetime: { min: 0.2, max: 0.4 },
    size: { min: 2, max: 5 },
    colors: ['#cccccc', '#999999', '#ffffff'],
    gravity: 100,
    friction: 0.9,
    shape: 'circle' as const
  },

  // NEW: Danger sparks emanating from bombs
  dangerSparks: {
    count: 4,
    spread: 0,
    speed: { min: 30, max: 60 },
    lifetime: { min: 0.3, max: 0.6 },
    size: { min: 2, max: 4 },
    colors: ['#ff0000', '#ff4444', '#ff8888', '#ffff00'],
    gravity: 80,
    friction: 0.95,
    shape: 'spark' as const
  },

  // NEW: Wall collision bump stars
  wallBump: {
    count: 6,
    spread: 10,
    speed: { min: 20, max: 50 },
    lifetime: { min: 0.2, max: 0.4 },
    size: { min: 4, max: 8 },
    colors: ['#ffff00', '#ffffff', '#ffcc00'],
    gravity: 100,
    friction: 0.92,
    shape: 'square' as const
  },

  // NEW: Sky beam for power-up appearance
  skyBeam: {
    count: 15,
    spread: 6,
    speed: { min: 50, max: 100 },
    angle: { min: Math.PI * 0.25, max: Math.PI * 0.75 }, // Downward
    lifetime: { min: 0.5, max: 0.8 },
    size: { min: 3, max: 6 },
    colors: ['#ffff00', '#ffffff', '#ffcc88'],
    gravity: 100,
    friction: 0.97,
    shape: 'spark' as const
  },

  // NEW: Confetti for victory celebration
  confetti: {
    count: 30,
    spread: 30,
    speed: { min: 80, max: 150 },
    angle: { min: -Math.PI * 0.3, max: -Math.PI * 0.7 }, // Upward spray
    lifetime: { min: 1.5, max: 2.5 },
    size: { min: 3, max: 7 },
    colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff6600', '#ff0099'],
    gravity: 120,
    friction: 0.98,
    shape: 'square' as const
  }
};

export class ParticleSystem {
  private particles: Particle[] = [];
  private readonly MAX_PARTICLES = 1000;

  emit(config: ParticleConfig): void {
    const {
      x,
      y,
      count,
      spread,
      speed,
      angle,
      lifetime,
      size,
      colors,
      gravity = 0,
      friction = 1,
      shape = 'circle',
      text
    } = config;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX_PARTICLES) {
        // Remove oldest particles
        this.particles.shift();
      }

      // Random angle
      let particleAngle: number;
      if (angle) {
        particleAngle = this.randomRange(angle.min, angle.max);
      } else {
        particleAngle = Math.random() * Math.PI * 2;
      }

      const particleSpeed = this.randomRange(speed.min, speed.max);
      const particleLife = this.randomRange(lifetime.min, lifetime.max);
      const particleSize = this.randomRange(size.min, size.max);
      const particleColor = colors[Math.floor(Math.random() * colors.length)];

      this.particles.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        vx: Math.cos(particleAngle) * particleSpeed,
        vy: Math.sin(particleAngle) * particleSpeed,
        life: particleLife,
        maxLife: particleLife,
        size: particleSize,
        color: particleColor,
        gravity,
        friction,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 10,
        shape,
        text
      });
    }
  }

  emitPreset(preset: keyof typeof PARTICLE_PRESETS, x: number, y: number, colorOverride?: string[]): void {
    const config = { ...PARTICLE_PRESETS[preset], x, y };
    if (colorOverride) {
      config.colors = colorOverride;
    }
    this.emit(config);
  }

  update(deltaTime: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Apply physics
      p.vy += p.gravity * deltaTime;
      p.vx *= p.friction;
      p.vy *= p.friction;

      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;

      p.rotation += p.rotationSpeed * deltaTime;
      p.life -= deltaTime;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    for (const p of this.particles) {
      const lifeRatio = p.life / p.maxLife;

      // Discrete alpha levels (3 steps instead of smooth)
      let alpha: number;
      if (lifeRatio > 0.66) alpha = 1.0;
      else if (lifeRatio > 0.33) alpha = 0.6;
      else alpha = 0.3;

      // Discrete size scaling (2 steps)
      const scale = lifeRatio > 0.5 ? 1.0 : 0.7;
      const size = Math.floor(p.size * scale);

      // Snap positions to integers for pixel-perfect rendering
      const px = Math.floor(p.x);
      const py = Math.floor(p.y);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      switch (p.shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(px, py, size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'square':
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.rotation);
          ctx.fillRect(-size / 2, -size / 2, size, size);
          ctx.restore();
          break;

        case 'spark':
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.fillRect(-size, -size / 4, size * 2, size / 2);
          ctx.restore();
          break;

        case 'text':
          if (p.text) {
            ctx.font = `bold ${Math.round(size)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.strokeText(p.text, px, py);
            ctx.fillText(p.text, px, py);
          }
          break;

        case 'ring':
          ctx.beginPath();
          // Expanding ring effect (discrete steps)
          const ringStep = lifeRatio > 0.5 ? 1.0 : 1.5;
          const ringSize = size * ringStep;
          ctx.arc(px, py, ringSize / 2, 0, Math.PI * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.floor(8 * alpha);
          ctx.stroke();
          break;

        case 'pixel':
          // Simple 2x2 or 3x3 pixel square
          const pixelSize = Math.max(2, Math.floor(size / 2)) * 2;
          ctx.fillRect(px - pixelSize / 2, py - pixelSize / 2, pixelSize, pixelSize);
          break;

        case 'pixelStar':
          // 5-point pixel star (simple cross + corners)
          const starSize = Math.max(2, Math.floor(size / 2));
          // Center
          ctx.fillRect(px - starSize / 2, py - starSize / 2, starSize, starSize);
          // Arms
          ctx.fillRect(px - starSize * 1.5, py - 1, starSize, 2);
          ctx.fillRect(px + starSize / 2, py - 1, starSize, 2);
          ctx.fillRect(px - 1, py - starSize * 1.5, 2, starSize);
          ctx.fillRect(px - 1, py + starSize / 2, 2, starSize);
          break;

        case 'pixelCross':
          // Simple + shape
          const crossSize = Math.max(2, Math.floor(size / 2));
          ctx.fillRect(px - crossSize, py - 1, crossSize * 2, 2);
          ctx.fillRect(px - 1, py - crossSize, 2, crossSize * 2);
          break;
      }
    }

    ctx.restore();
  }

  clear(): void {
    this.particles = [];
  }

  getParticleCount(): number {
    return this.particles.length;
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
