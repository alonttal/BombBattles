import { TILE_SIZE } from '../constants';

export interface Position {
  gridX: number;
  gridY: number;
  pixelX: number;
  pixelY: number;
}

export abstract class Entity {
  public id: string;
  public position: Position;
  public prevPosition: Position;
  public isActive: boolean = true;

  constructor(gridX: number, gridY: number) {
    this.id = crypto.randomUUID();
    this.position = {
      gridX,
      gridY,
      pixelX: gridX * TILE_SIZE,
      pixelY: gridY * TILE_SIZE
    };
    this.prevPosition = { ...this.position };
  }

  abstract update(deltaTime: number): void;
  abstract render(ctx: CanvasRenderingContext2D, interpolation: number): void;

  savePreviousPosition(): void {
    this.prevPosition = { ...this.position };
  }

  destroy(): void {
    this.isActive = false;
  }

  getInterpolatedPosition(interpolation: number): { x: number; y: number } {
    return {
      x: this.prevPosition.pixelX + (this.position.pixelX - this.prevPosition.pixelX) * interpolation,
      y: this.prevPosition.pixelY + (this.position.pixelY - this.prevPosition.pixelY) * interpolation
    };
  }
}
