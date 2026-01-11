export interface ShakeConfig {
  intensity: number;  // Max pixel offset
  duration: number;   // Seconds
  frequency?: number; // Shakes per second (default 30)
  decay?: boolean;    // Whether intensity decays over time (default true)
}

interface ActiveShake {
  intensity: number;
  duration: number;
  elapsed: number;
  frequency: number;
  decay: boolean;
}

export class Camera {
  private zoom: number = 1;
  private targetZoom: number = 1;
  private zoomSpeed: number = 2; // Units per second

  private shakes: ActiveShake[] = [];
  private offsetX: number = 0;
  private offsetY: number = 0;

  static readonly PRESETS = {
    bombExplode: {
      intensity: 8,
      duration: 0.3,
      frequency: 35,
      decay: true
    },
    bigExplosion: {
      intensity: 15,
      duration: 0.5,
      frequency: 40,
      decay: true
    },
    chainReaction: {
      intensity: 12,
      duration: 0.4,
      frequency: 35,
      decay: true
    },
    playerDeath: {
      intensity: 6,
      duration: 0.25,
      frequency: 30,
      decay: true
    },
    subtle: {
      intensity: 3,
      duration: 0.15,
      frequency: 25,
      decay: true
    }
  };

  zoomTo(scale: number, duration: number = 0.5): void {
    this.targetZoom = scale;
    if (duration > 0) {
      this.zoomSpeed = Math.abs(this.targetZoom - this.zoom) / duration;
    } else {
      this.zoom = this.targetZoom;
    }
  }

  shake(config: ShakeConfig): void {
    this.shakes.push({
      intensity: config.intensity,
      duration: config.duration,
      elapsed: 0,
      frequency: config.frequency ?? 30,
      decay: config.decay ?? true
    });
  }

  shakePreset(preset: keyof typeof Camera.PRESETS): void {
    this.shake(Camera.PRESETS[preset]);
  }

  update(deltaTime: number): void {
    // Update zoom
    if (this.zoom !== this.targetZoom) {
      if (this.zoom < this.targetZoom) {
        this.zoom = Math.min(this.targetZoom, this.zoom + this.zoomSpeed * deltaTime);
      } else {
        this.zoom = Math.max(this.targetZoom, this.zoom - this.zoomSpeed * deltaTime);
      }
      // Safety clamp
      this.zoom = Math.max(0.5, Math.min(3.0, this.zoom));
    }

    this.offsetX = 0;
    this.offsetY = 0;

    // Update and combine all active shakes
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const shake = this.shakes[i];
      shake.elapsed += deltaTime;

      if (shake.elapsed >= shake.duration) {
        this.shakes.splice(i, 1);
        continue;
      }

      // Calculate intensity (with optional decay)
      let currentIntensity = shake.intensity;
      if (shake.decay) {
        const progress = shake.elapsed / shake.duration;
        // Use exponential decay for natural feel
        currentIntensity = shake.intensity * Math.pow(1 - progress, 2);
      }

      // Calculate shake offset using sine waves at the specified frequency
      const time = shake.elapsed * shake.frequency * Math.PI * 2;
      const shakeX = Math.sin(time) * currentIntensity;
      const shakeY = Math.sin(time * 1.3 + 0.5) * currentIntensity;

      // Add some random jitter for more organic feel
      const jitter = currentIntensity * 0.3;
      this.offsetX += shakeX + (Math.random() - 0.5) * jitter;
      this.offsetY += shakeY + (Math.random() - 0.5) * jitter;
    }

    // Clamp offsets
    const maxOffset = 20;
    this.offsetX = Math.max(-maxOffset, Math.min(maxOffset, this.offsetX));
    this.offsetY = Math.max(-maxOffset, Math.min(maxOffset, this.offsetY));
  }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    // Basic transform (zoom top-left relative to center if handled externally, or just scale)
    // Deprecated in favor of applyCenteredTransform for main view
    ctx.scale(this.zoom, this.zoom);
    if (this.offsetX !== 0 || this.offsetY !== 0) {
      ctx.translate(Math.round(this.offsetX), Math.round(this.offsetY));
    }
  }

  applyCenteredTransform(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Translate to center
    ctx.translate(width / 2, height / 2);
    // Scale
    ctx.scale(this.zoom, this.zoom);
    // Shake
    if (this.offsetX !== 0 || this.offsetY !== 0) {
      ctx.translate(this.offsetX, this.offsetY);
    }
    // Translate back
    ctx.translate(-width / 2, -height / 2);
  }

  getOffset(): { x: number; y: number } {
    return { x: this.offsetX, y: this.offsetY };
  }

  isShaking(): boolean {
    return this.shakes.length > 0;
  }

  stopAllShakes(): void {
    this.shakes = [];
    this.offsetX = 0;
    this.offsetY = 0;
  }
}
