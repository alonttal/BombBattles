import { Direction } from '../../constants';

export class MockInputManager {
  private simulatedInputs: Map<number, { direction: Direction | null; bomb: boolean; special: boolean }> = new Map();

  constructor() {
  }

  setSimulatedInput(playerId: number, direction: Direction | null, bomb: boolean = false, special: boolean = false): void {
    this.simulatedInputs.set(playerId, { direction, bomb, special });
  }

  clearSimulatedInput(playerId: number): void {
    this.simulatedInputs.delete(playerId);
  }

  clearAllSimulatedInputs(): void {
    this.simulatedInputs.clear();
  }

  getDirection(playerId: number): Direction | null {
    return this.simulatedInputs.get(playerId)?.direction || null;
  }

  isBombPressed(playerId: number): boolean {
    return this.simulatedInputs.get(playerId)?.bomb || false;
  }

  isSpecialPressed(playerId: number): boolean {
    return this.simulatedInputs.get(playerId)?.special || false;
  }

  isKeyPressed(key: string): boolean {
    return false;
  }

  isKeyJustPressed(key: string): boolean {
    return false;
  }

  isKeyJustReleased(key: string): boolean {
    return false;
  }

  update(): void {
  }

  cleanup(): void {
  }
}
