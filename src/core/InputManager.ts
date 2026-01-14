import { Direction } from '../constants';

interface KeyBinding {
  up: string;
  down: string;
  left: string;
  right: string;
  bomb: string;
  special: string;
}

const DEFAULT_BINDINGS: Map<number, KeyBinding> = new Map([
  [0, { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', bomb: 'Slash', special: 'Period' }],
  [1, { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', bomb: 'Space', special: 'KeyE' }],
  [2, { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', bomb: 'KeyO', special: 'KeyU' }],
  [3, { up: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6', bomb: 'Numpad0', special: 'NumpadEnter' }]
]);

export class InputManager {
  private pressedKeys: Set<string> = new Set();
  private justPressed: Set<string> = new Set();
  private justReleased: Set<string> = new Set();
  private bindings: Map<number, KeyBinding>;

  constructor() {
    this.bindings = new Map(DEFAULT_BINDINGS);

    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Prevent default for game keys
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }

    if (!this.pressedKeys.has(event.code)) {
      this.justPressed.add(event.code);
    }
    this.pressedKeys.add(event.code);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.pressedKeys.delete(event.code);
    this.justReleased.add(event.code);
  }

  private isGameKey(code: string): boolean {
    for (const binding of this.bindings.values()) {
      if (Object.values(binding).includes(code)) {
        return true;
      }
    }
    return false;
  }

  // Call at end of each update tick
  clearFrameState(): void {
    this.justPressed.clear();
    this.justReleased.clear();
  }

  getMovementDirection(playerId: number): Direction | null {
    const binding = this.bindings.get(playerId);
    if (!binding) return null;

    if (this.pressedKeys.has(binding.up)) return Direction.UP;
    if (this.pressedKeys.has(binding.down)) return Direction.DOWN;
    if (this.pressedKeys.has(binding.left)) return Direction.LEFT;
    if (this.pressedKeys.has(binding.right)) return Direction.RIGHT;

    return null;
  }

  isBombPressed(playerId: number): boolean {
    const binding = this.bindings.get(playerId);
    if (!binding) return false;
    return this.justPressed.has(binding.bomb);
  }

  isSpecialPressed(playerId: number): boolean {
    const binding = this.bindings.get(playerId);
    if (!binding) return false;
    return this.justPressed.has(binding.special);
  }

  isKeyPressed(code: string): boolean {
    return this.pressedKeys.has(code);
  }

  isKeyJustPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  getBindings(playerId: number): KeyBinding | undefined {
    return this.bindings.get(playerId);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
  }
}
