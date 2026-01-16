import { RenderState } from '../../rendering/Renderer';
import { ParticleSystem } from '../../rendering/ParticleSystem';
import { Camera } from '../../rendering/Camera';
import { MapData } from '../../map/TileTypes';

export class MockRenderer {
  private particleSystem: ParticleSystem;
  private camera: Camera;

  constructor() {
    this.particleSystem = new ParticleSystem();
    this.camera = new Camera();
  }

  render(state: RenderState, interpolation: number, mapData: MapData): void {
  }

  getParticleSystem(): ParticleSystem {
    return this.particleSystem;
  }

  getCamera(): Camera {
    return this.camera;
  }

  flashColor(color: string, duration: number): void {
  }

  resize(): void {
  }

  cleanup(): void {
  }

  getCanvas(): any {
    return null;
  }
}
