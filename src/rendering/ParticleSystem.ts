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
  shape: 'circle' | 'square' | 'spark';
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
  shape?: 'circle' | 'square' | 'spark';
}

// Preset configurations
export const PARTICLE_PRESETS = {
  explosion: {
    count: 40,
    spread: 8,
    speed: { min: 100, max: 300 },
    lifetime: { min: 0.3, max: 0.8 },
    size: { min: 3, max: 8 },
    colors: ['#ff4400', '#ff8800', '#ffcc00', '#ffffff'],
    gravity: 200,
    friction: 0.95,
    shape: 'circle' as const
  },

  explosionSparks: {
    count: 20,
    spread: 4,
    speed: { min: 200, max: 400 },
    lifetime: { min: 0.2, max: 0.5 },
    size: { min: 2, max: 4 },
    colors: ['#ffff00', '#ffffff', '#ff8800'],
    gravity: 100,
    friction: 0.98,
    shape: 'spark' as const
  },

  iceExplosion: {
    count: 35,
    spread: 8,
    speed: { min: 80, max: 250 },
    lifetime: { min: 0.4, max: 1.0 },
    size: { min: 3, max: 7 },
    colors: ['#00ffff', '#88ffff', '#ffffff', '#0088ff'],
    gravity: 50,
    friction: 0.92,
    shape: 'square' as const
  },

  fireExplosion: {
    count: 50,
    spread: 10,
    speed: { min: 60, max: 200 },
    lifetime: { min: 0.5, max: 1.2 },
    size: { min: 4, max: 10 },
    colors: ['#ff0000', '#ff4400', '#ff8800', '#ffcc00'],
    gravity: -50, // Fire rises
    friction: 0.94,
    shape: 'circle' as const
  },

  debris: {
    count: 12,
    spread: 4,
    speed: { min: 150, max: 350 },
    angle: { min: -Math.PI * 0.8, max: -Math.PI * 0.2 }, // Mostly upward
    lifetime: { min: 0.4, max: 0.8 },
    size: { min: 4, max: 8 },
    colors: ['#8B4513', '#A0522D', '#654321', '#D2691E'],
    gravity: 600,
    friction: 0.99,
    shape: 'square' as const
  },

  powerUpCollect: {
    count: 15,
    spread: 2,
    speed: { min: 50, max: 150 },
    angle: { min: -Math.PI, max: 0 }, // Upward
    lifetime: { min: 0.3, max: 0.6 },
    size: { min: 3, max: 6 },
    colors: ['#ffffff', '#ffff00', '#00ff00'],
    gravity: -100,
    friction: 0.95,
    shape: 'circle' as const
  },

  death: {
    count: 30,
    spread: 10,
    speed: { min: 100, max: 250 },
    lifetime: { min: 0.5, max: 1.0 },
    size: { min: 4, max: 10 },
    colors: ['#ff0000', '#880000', '#440000', '#ffffff'],
    gravity: 150,
    friction: 0.96,
    shape: 'circle' as const
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
      shape = 'circle'
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
        shape
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
      const alpha = Math.max(0, p.life / p.maxLife);
      const scale = 0.5 + (p.life / p.maxLife) * 0.5;
      const size = p.size * scale;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      switch (p.shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'square':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillRect(-size / 2, -size / 2, size, size);
          ctx.restore();
          break;

        case 'spark':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.fillRect(-size, -size / 4, size * 2, size / 2);
          ctx.restore();
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
