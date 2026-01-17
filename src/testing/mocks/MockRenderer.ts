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

  render(_state: RenderState, _interpolation: number, _mapData: MapData): void {
  }

  getParticleSystem(): ParticleSystem {
    return this.particleSystem;
  }

  getCamera(): Camera {
    return this.camera;
  }

  flashColor(_color: string, _duration: number): void {
  }

  resize(): void {
  }

  cleanup(): void {
  }

  getCanvas(): any {
    return null;
  }
}
