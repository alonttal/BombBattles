import { Player } from '../entities/Player';
import { Direction, GRID_WIDTH, GRID_HEIGHT } from '../constants';

interface PlayerState {
  pixelX: number;
  pixelY: number;
  gridX: number;
  gridY: number;
  timestamp: number;
}

interface HaltEvent {
  playerIndex: number;
  timestamp: number;
  duration: number;
  position: { pixelX: number; pixelY: number; gridX: number; gridY: number };
  isInDanger: boolean;
  currentStrategy: string | null;
  targetCommitment: { x: number; y: number; type: string } | null;
  cachedPath: { targetX: number; targetY: number; pathLength: number } | null;
  adjacentTiles: Array<{
    direction: string;
    gridX: number;
    gridY: number;
    isWalkable: boolean;
    isDangerous: boolean;
  }>;
  aiDecision: { direction: Direction | null; placeBomb: boolean } | null;
}

interface GridCell {
  isWalkable: boolean;
  isDangerous: boolean;
}

export class HaltDetector {
  private lastPositions: Map<number, PlayerState[]> = new Map();
  private haltEvents: HaltEvent[] = [];
  private isTracking: boolean = false;
  private startTime: number = 0;

  // Configuration
  private haltThresholdMs: number = 400; // Consider halted after 400ms without movement
  private positionHistorySize: number = 30; // Keep last 30 position records

  // Callback to get AI internal state
  private aiStateCallback: ((playerIndex: number) => {
    strategy: string | null;
    targetCommitment: { x: number; y: number; type: string } | null;
    cachedPath: { targetX: number; targetY: number; pathLength: number } | null;
    grid: GridCell[][];
    lastDecision: { direction: Direction | null; placeBomb: boolean } | null;
  } | null) | null = null;

  start(): void {
    this.lastPositions.clear();
    this.haltEvents = [];
    this.startTime = Date.now();
    this.isTracking = true;
    console.log('[HaltDetector] Started tracking');
  }

  stop(): void {
    this.isTracking = false;
    console.log(`[HaltDetector] Stopped. Detected ${this.haltEvents.length} halt events`);
  }

  setAIStateCallback(callback: typeof this.aiStateCallback): void {
    this.aiStateCallback = callback;
  }

  trackPosition(player: Player, isAI: boolean): void {
    if (!this.isTracking || !isAI) return;

    const timestamp = Date.now() - this.startTime;
    const playerIndex = player.playerIndex;

    const currentState: PlayerState = {
      pixelX: Math.round(player.position.pixelX),
      pixelY: Math.round(player.position.pixelY),
      gridX: player.position.gridX,
      gridY: player.position.gridY,
      timestamp
    };

    // Get or create position history for this player
    let history = this.lastPositions.get(playerIndex);
    if (!history) {
      history = [];
      this.lastPositions.set(playerIndex, history);
    }

    // Add current position
    history.push(currentState);

    // Trim history to max size
    while (history.length > this.positionHistorySize) {
      history.shift();
    }

    // Check for halt condition
    this.checkForHalt(player, history);
  }

  private checkForHalt(player: Player, history: PlayerState[]): void {
    if (history.length < 5) return; // Need some history

    const current = history[history.length - 1];

    // Find how long player has been at same pixel position
    let haltStartIndex = history.length - 1;
    for (let i = history.length - 2; i >= 0; i--) {
      const pos = history[i];
      if (pos.pixelX === current.pixelX && pos.pixelY === current.pixelY) {
        haltStartIndex = i;
      } else {
        break;
      }
    }

    const haltStart = history[haltStartIndex];
    const haltDuration = current.timestamp - haltStart.timestamp;

    // Only report if halted longer than threshold
    if (haltDuration < this.haltThresholdMs) return;

    // Check if we already logged this halt (within last 500ms)
    const recentHalt = this.haltEvents.find(
      e => e.playerIndex === player.playerIndex &&
           Math.abs(e.timestamp - haltStart.timestamp) < 500
    );
    if (recentHalt) return;

    // Get AI state if callback is available
    let aiState = this.aiStateCallback?.(player.playerIndex);

    // Build halt event
    const haltEvent: HaltEvent = {
      playerIndex: player.playerIndex,
      timestamp: haltStart.timestamp,
      duration: haltDuration,
      position: {
        pixelX: current.pixelX,
        pixelY: current.pixelY,
        gridX: current.gridX,
        gridY: current.gridY
      },
      isInDanger: false,
      currentStrategy: null,
      targetCommitment: null,
      cachedPath: null,
      adjacentTiles: [],
      aiDecision: null
    };

    if (aiState) {
      haltEvent.currentStrategy = aiState.strategy;
      haltEvent.targetCommitment = aiState.targetCommitment;
      haltEvent.cachedPath = aiState.cachedPath;
      haltEvent.aiDecision = aiState.lastDecision;

      // Check if in danger
      const grid = aiState.grid;
      if (grid && grid[current.gridY]?.[current.gridX]) {
        haltEvent.isInDanger = grid[current.gridY][current.gridX].isDangerous;
      }

      // Get adjacent tile info
      const directions = [
        { name: 'UP', dx: 0, dy: -1 },
        { name: 'DOWN', dx: 0, dy: 1 },
        { name: 'LEFT', dx: -1, dy: 0 },
        { name: 'RIGHT', dx: 1, dy: 0 }
      ];

      for (const { name, dx, dy } of directions) {
        const nx = current.gridX + dx;
        const ny = current.gridY + dy;

        if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT && grid) {
          const cell = grid[ny]?.[nx];
          haltEvent.adjacentTiles.push({
            direction: name,
            gridX: nx,
            gridY: ny,
            isWalkable: cell?.isWalkable ?? false,
            isDangerous: cell?.isDangerous ?? false
          });
        }
      }
    }

    this.haltEvents.push(haltEvent);

    // Log immediately for debugging
    console.log(`[HaltDetector] ⚠️ HALT DETECTED - Player ${player.playerIndex}`);
    console.log(`  Position: pixel(${current.pixelX}, ${current.pixelY}) grid(${current.gridX}, ${current.gridY})`);
    console.log(`  Duration: ${haltDuration}ms`);
    console.log(`  In danger: ${haltEvent.isInDanger}`);
    console.log(`  Strategy: ${haltEvent.currentStrategy || 'none'}`);
    console.log(`  Target commitment: ${haltEvent.targetCommitment ? `(${haltEvent.targetCommitment.x}, ${haltEvent.targetCommitment.y}) type=${haltEvent.targetCommitment.type}` : 'none'}`);
    console.log(`  Cached path: ${haltEvent.cachedPath ? `to (${haltEvent.cachedPath.targetX}, ${haltEvent.cachedPath.targetY}) len=${haltEvent.cachedPath.pathLength}` : 'none'}`);
    console.log(`  AI decision: ${haltEvent.aiDecision ? `dir=${haltEvent.aiDecision.direction} bomb=${haltEvent.aiDecision.placeBomb}` : 'none'}`);
    console.log(`  Adjacent tiles:`);
    for (const tile of haltEvent.adjacentTiles) {
      const status = tile.isWalkable ? (tile.isDangerous ? '⚠️ dangerous' : '✅ safe') : '🧱 blocked';
      console.log(`    ${tile.direction}: (${tile.gridX}, ${tile.gridY}) ${status}`);
    }
  }

  getHaltEvents(): HaltEvent[] {
    return [...this.haltEvents];
  }

  printReport(): void {
    console.log('\n========== HALT DETECTOR REPORT ==========\n');
    console.log(`Total halt events: ${this.haltEvents.length}`);

    if (this.haltEvents.length === 0) {
      console.log('✅ No unexpected halts detected!');
      console.log('\n==========================================\n');
      return;
    }

    // Group by cause
    const noStrategy = this.haltEvents.filter(e => !e.currentStrategy);
    const hasStrategy = this.haltEvents.filter(e => e.currentStrategy);
    const inDanger = this.haltEvents.filter(e => e.isInDanger);
    const noWalkableTiles = this.haltEvents.filter(e =>
      e.adjacentTiles.every(t => !t.isWalkable || t.isDangerous)
    );
    const hasWalkableSafeTiles = this.haltEvents.filter(e =>
      e.adjacentTiles.some(t => t.isWalkable && !t.isDangerous)
    );
    const nullDirection = this.haltEvents.filter(e =>
      e.aiDecision && e.aiDecision.direction === null
    );

    console.log('\n--- Halt Analysis ---');
    console.log(`  No strategy set: ${noStrategy.length}`);
    console.log(`  Has strategy but halted: ${hasStrategy.length}`);
    console.log(`  While in danger: ${inDanger.length}`);
    console.log(`  No walkable safe tiles available: ${noWalkableTiles.length}`);
    console.log(`  Had walkable safe tiles but didn't move: ${hasWalkableSafeTiles.length} ⚠️`);
    console.log(`  AI returned null direction: ${nullDirection.length}`);

    // Show problematic halts (had options but didn't move)
    if (hasWalkableSafeTiles.length > 0) {
      console.log('\n--- Problematic Halts (had safe options) ---');
      for (const halt of hasWalkableSafeTiles.slice(0, 10)) {
        console.log(`\n  Player ${halt.playerIndex} at t=${halt.timestamp}ms:`);
        console.log(`    Grid position: (${halt.position.gridX}, ${halt.position.gridY})`);
        console.log(`    Strategy: ${halt.currentStrategy || 'none'}`);
        console.log(`    Target: ${halt.targetCommitment ? `(${halt.targetCommitment.x}, ${halt.targetCommitment.y})` : 'none'}`);
        console.log(`    Path: ${halt.cachedPath ? `${halt.cachedPath.pathLength} steps to (${halt.cachedPath.targetX}, ${halt.cachedPath.targetY})` : 'none'}`);
        console.log(`    Decision: dir=${halt.aiDecision?.direction ?? 'null'}`);
        console.log(`    Safe tiles available:`);
        for (const tile of halt.adjacentTiles) {
          if (tile.isWalkable && !tile.isDangerous) {
            console.log(`      ${tile.direction}: (${tile.gridX}, ${tile.gridY})`);
          }
        }
      }
    }

    console.log('\n==========================================\n');
  }

  exportData(): string {
    return JSON.stringify({
      haltEvents: this.haltEvents,
      summary: {
        total: this.haltEvents.length,
        noStrategy: this.haltEvents.filter(e => !e.currentStrategy).length,
        inDanger: this.haltEvents.filter(e => e.isInDanger).length,
        hadSafeOptions: this.haltEvents.filter(e =>
          e.adjacentTiles.some(t => t.isWalkable && !t.isDangerous)
        ).length
      }
    }, null, 2);
  }
}

// Global instance
export const haltDetector = new HaltDetector();
