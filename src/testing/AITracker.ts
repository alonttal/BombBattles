import { Player } from '../entities/Player';
import { Bomb } from '../entities/Bomb';
import { Direction } from '../constants';

interface MovementEntry {
  timestamp: number;
  playerIndex: number;
  pixelX: number;
  pixelY: number;
  gridX: number;
  gridY: number;
  direction: Direction | null;
  isAI: boolean;
}

interface BombEntry {
  timestamp: number;
  playerIndex: number;
  gridX: number;
  gridY: number;
  range: number;
}

interface AnalysisResult {
  oscillations: Array<{
    playerIndex: number;
    startTime: number;
    endTime: number;
    positions: Array<{x: number; y: number}>;
  }>;
  stuckPeriods: Array<{
    playerIndex: number;
    startTime: number;
    duration: number;
    position: {pixelX: number; pixelY: number; gridX: number; gridY: number};
  }>;
  rapidDirectionChanges: Array<{
    playerIndex: number;
    timestamp: number;
    changes: Direction[];
  }>;
  suicidalBombs: Array<{
    playerIndex: number;
    timestamp: number;
    bombPosition: {x: number; y: number};
    playerDiedAt: number | null;
  }>;
}

export class AITracker {
  private movements: MovementEntry[] = [];
  private bombs: BombEntry[] = [];
  private lastPositions: Map<number, {pixelX: number; pixelY: number; timestamp: number}> = new Map();
  private lastDirections: Map<number, {dir: Direction; timestamp: number}[]> = new Map();
  private playerDeaths: Map<number, number> = new Map(); // playerIndex -> death timestamp
  private startTime: number = 0;
  private isTracking: boolean = false;

  start(): void {
    this.movements = [];
    this.bombs = [];
    this.lastPositions.clear();
    this.lastDirections.clear();
    this.playerDeaths.clear();
    this.startTime = Date.now();
    this.isTracking = true;
    console.log('[AITracker] Started tracking');
  }

  stop(): void {
    this.isTracking = false;
    console.log(`[AITracker] Stopped tracking. Recorded ${this.movements.length} movements, ${this.bombs.length} bombs`);
  }

  trackMovement(player: Player, direction: Direction | null, isAI: boolean): void {
    if (!this.isTracking) return;

    const timestamp = Date.now() - this.startTime;
    const entry: MovementEntry = {
      timestamp,
      playerIndex: player.playerIndex,
      pixelX: Math.round(player.position.pixelX),
      pixelY: Math.round(player.position.pixelY),
      gridX: player.position.gridX,
      gridY: player.position.gridY,
      direction,
      isAI
    };

    this.movements.push(entry);

    // Track direction changes for rapid change detection
    if (direction !== null) {
      const dirHistory = this.lastDirections.get(player.playerIndex) || [];
      dirHistory.push({dir: direction, timestamp});
      // Keep last 10 direction changes
      if (dirHistory.length > 10) dirHistory.shift();
      this.lastDirections.set(player.playerIndex, dirHistory);
    }

    // Update last position
    this.lastPositions.set(player.playerIndex, {
      pixelX: entry.pixelX,
      pixelY: entry.pixelY,
      timestamp
    });
  }

  trackBomb(player: Player, bomb: Bomb): void {
    if (!this.isTracking) return;

    const timestamp = Date.now() - this.startTime;
    const entry: BombEntry = {
      timestamp,
      playerIndex: player.playerIndex,
      gridX: bomb.position.gridX,
      gridY: bomb.position.gridY,
      range: bomb.range
    };

    this.bombs.push(entry);
    console.log(`[AITracker] Player ${player.playerIndex} placed bomb at (${entry.gridX}, ${entry.gridY}) range=${entry.range} t=${timestamp}ms`);
  }

  trackDeath(player: Player): void {
    if (!this.isTracking) return;

    const timestamp = Date.now() - this.startTime;
    this.playerDeaths.set(player.playerIndex, timestamp);
    console.log(`[AITracker] Player ${player.playerIndex} died at t=${timestamp}ms`);
  }

  analyze(): AnalysisResult {
    const result: AnalysisResult = {
      oscillations: [],
      stuckPeriods: [],
      rapidDirectionChanges: [],
      suicidalBombs: []
    };

    // Group movements by player
    const playerMovements = new Map<number, MovementEntry[]>();
    for (const m of this.movements) {
      const list = playerMovements.get(m.playerIndex) || [];
      list.push(m);
      playerMovements.set(m.playerIndex, list);
    }

    // Analyze each player
    for (const [playerIndex, moves] of playerMovements) {
      // Detect oscillations (back and forth between same positions)
      this.detectOscillations(playerIndex, moves, result);

      // Detect stuck periods (no pixel movement for extended time)
      this.detectStuckPeriods(playerIndex, moves, result);

      // Detect rapid direction changes
      this.detectRapidDirectionChanges(playerIndex, moves, result);
    }

    // Detect suicidal bombs (player dies shortly after placing bomb)
    this.detectSuicidalBombs(result);

    return result;
  }

  private detectOscillations(playerIndex: number, moves: MovementEntry[], result: AnalysisResult): void {
    // Look for patterns where player visits same grid cells repeatedly in short time
    const windowSize = 20; // Look at last 20 movements
    const minOscillations = 4; // At least 4 back-and-forth

    for (let i = windowSize; i < moves.length; i++) {
      const window = moves.slice(i - windowSize, i);
      const gridPositions = window.map(m => `${m.gridX},${m.gridY}`);

      // Count position frequencies
      const freq = new Map<string, number>();
      for (const pos of gridPositions) {
        freq.set(pos, (freq.get(pos) || 0) + 1);
      }

      // Check for oscillation pattern (2 positions with high frequency)
      const highFreq = [...freq.entries()].filter(([_, count]) => count >= minOscillations);
      if (highFreq.length >= 2) {
        const positions = highFreq.map(([pos]) => {
          const [x, y] = pos.split(',').map(Number);
          return {x, y};
        });

        result.oscillations.push({
          playerIndex,
          startTime: window[0].timestamp,
          endTime: window[window.length - 1].timestamp,
          positions
        });
      }
    }
  }

  private detectStuckPeriods(playerIndex: number, moves: MovementEntry[], result: AnalysisResult): void {
    const stuckThreshold = 500; // 500ms without pixel movement = stuck

    let stuckStart: MovementEntry | null = null;
    let lastPixelPos = {x: -1, y: -1};

    for (const move of moves) {
      const samePixel = move.pixelX === lastPixelPos.x && move.pixelY === lastPixelPos.y;

      if (samePixel) {
        if (!stuckStart) {
          stuckStart = move;
        }
      } else {
        if (stuckStart) {
          const duration = move.timestamp - stuckStart.timestamp;
          if (duration >= stuckThreshold) {
            result.stuckPeriods.push({
              playerIndex,
              startTime: stuckStart.timestamp,
              duration,
              position: {
                pixelX: stuckStart.pixelX,
                pixelY: stuckStart.pixelY,
                gridX: stuckStart.gridX,
                gridY: stuckStart.gridY
              }
            });
          }
        }
        stuckStart = null;
      }

      lastPixelPos = {x: move.pixelX, y: move.pixelY};
    }
  }

  private detectRapidDirectionChanges(playerIndex: number, moves: MovementEntry[], result: AnalysisResult): void {
    const timeWindow = 300; // 300ms window
    const minChanges = 4; // 4 direction changes in window = rapid

    for (let i = 0; i < moves.length; i++) {
      const windowEnd = moves[i].timestamp + timeWindow;
      const windowMoves = moves.slice(i).filter(m => m.timestamp <= windowEnd && m.direction !== null);

      if (windowMoves.length < minChanges) continue;

      // Check for direction changes
      const directions: Direction[] = [];
      let lastDir: Direction | null = null;
      for (const m of windowMoves) {
        if (m.direction !== null && m.direction !== lastDir) {
          directions.push(m.direction);
          lastDir = m.direction;
        }
      }

      if (directions.length >= minChanges) {
        result.rapidDirectionChanges.push({
          playerIndex,
          timestamp: moves[i].timestamp,
          changes: directions
        });
        // Skip ahead to avoid duplicate detections
        i += windowMoves.length - 1;
      }
    }
  }

  private detectSuicidalBombs(result: AnalysisResult): void {
    const suicideWindow = 4000; // 4 seconds (bomb fuse time + buffer)

    for (const bomb of this.bombs) {
      const deathTime = this.playerDeaths.get(bomb.playerIndex);
      if (deathTime !== undefined) {
        const timeToDeath = deathTime - bomb.timestamp;
        if (timeToDeath > 0 && timeToDeath <= suicideWindow) {
          result.suicidalBombs.push({
            playerIndex: bomb.playerIndex,
            timestamp: bomb.timestamp,
            bombPosition: {x: bomb.gridX, y: bomb.gridY},
            playerDiedAt: deathTime
          });
        }
      }
    }
  }

  printReport(): void {
    const analysis = this.analyze();

    console.log('\n========== AI TRACKER REPORT ==========\n');

    console.log(`Total movements tracked: ${this.movements.length}`);
    console.log(`Total bombs tracked: ${this.bombs.length}`);
    console.log(`Total deaths tracked: ${this.playerDeaths.size}`);

    if (analysis.oscillations.length > 0) {
      console.log(`\n⚠️  OSCILLATIONS DETECTED: ${analysis.oscillations.length}`);
      for (const osc of analysis.oscillations.slice(0, 5)) {
        console.log(`  Player ${osc.playerIndex}: ${osc.startTime}ms - ${osc.endTime}ms between positions: ${osc.positions.map(p => `(${p.x},${p.y})`).join(' <-> ')}`);
      }
    }

    if (analysis.stuckPeriods.length > 0) {
      console.log(`\n⚠️  STUCK PERIODS DETECTED: ${analysis.stuckPeriods.length}`);
      for (const stuck of analysis.stuckPeriods.slice(0, 5)) {
        console.log(`  Player ${stuck.playerIndex}: stuck at pixel(${stuck.position.pixelX},${stuck.position.pixelY}) grid(${stuck.position.gridX},${stuck.position.gridY}) for ${stuck.duration}ms at t=${stuck.startTime}ms`);
      }
    }

    if (analysis.rapidDirectionChanges.length > 0) {
      console.log(`\n⚠️  RAPID DIRECTION CHANGES: ${analysis.rapidDirectionChanges.length}`);
      for (const rapid of analysis.rapidDirectionChanges.slice(0, 5)) {
        console.log(`  Player ${rapid.playerIndex}: at t=${rapid.timestamp}ms: ${rapid.changes.join(' -> ')}`);
      }
    }

    if (analysis.suicidalBombs.length > 0) {
      console.log(`\n💀 SUICIDAL BOMBS: ${analysis.suicidalBombs.length}`);
      for (const suicide of analysis.suicidalBombs) {
        const timeToDeath = suicide.playerDiedAt! - suicide.timestamp;
        console.log(`  Player ${suicide.playerIndex}: placed bomb at (${suicide.bombPosition.x},${suicide.bombPosition.y}) at t=${suicide.timestamp}ms, died ${timeToDeath}ms later`);
      }
    }

    if (analysis.oscillations.length === 0 &&
        analysis.stuckPeriods.length === 0 &&
        analysis.rapidDirectionChanges.length === 0 &&
        analysis.suicidalBombs.length === 0) {
      console.log('\n✅ No issues detected!');
    }

    console.log('\n========================================\n');
  }

  // Get recent movements for a player (for debugging)
  getRecentMovements(playerIndex: number, count: number = 10): MovementEntry[] {
    return this.movements
      .filter(m => m.playerIndex === playerIndex)
      .slice(-count);
  }

  // Export data as JSON for external analysis
  exportData(): string {
    return JSON.stringify({
      movements: this.movements,
      bombs: this.bombs,
      deaths: Object.fromEntries(this.playerDeaths),
      analysis: this.analyze()
    }, null, 2);
  }
}

// Global instance for easy access
export const aiTracker = new AITracker();
