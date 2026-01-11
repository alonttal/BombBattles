import { TICK_DURATION } from '../constants';

export class GameLoop {
  private lastTime = 0;
  private accumulator = 0;
  private isRunning = false;
  private animationFrameId: number | null = null;

  constructor(
    private update: (deltaTime: number) => void,
    private render: (interpolation: number) => void
  ) {}

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private loop(currentTime: number): void {
    if (!this.isRunning) return;

    // Cap frame time to prevent spiral of death
    const frameTime = Math.min(currentTime - this.lastTime, 250);
    this.lastTime = currentTime;
    this.accumulator += frameTime;

    // Fixed timestep updates
    while (this.accumulator >= TICK_DURATION) {
      this.update(TICK_DURATION / 1000); // Pass delta in seconds
      this.accumulator -= TICK_DURATION;
    }

    // Render with interpolation for smooth visuals
    const interpolation = this.accumulator / TICK_DURATION;
    this.render(interpolation);

    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
