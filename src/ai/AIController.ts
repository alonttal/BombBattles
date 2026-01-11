import { Player } from '../entities/Player';
import { Block } from '../entities/Block';
import { Bomb } from '../entities/Bomb';
import { PowerUp } from '../entities/PowerUp';
import { Explosion } from '../entities/Explosion';
import { Direction, TILE_SIZE, GRID_WIDTH, GRID_HEIGHT } from '../constants';

interface GridCell {
  x: number;
  y: number;
  isWalkable: boolean;
  isDangerous: boolean;
  dangerTime: number; // Time until explosion reaches this cell
  hasPowerUp: boolean;
  hasPlayer: boolean;
  hasBomb: boolean;
}

interface AIState {
  currentGoal: 'flee' | 'attack' | 'collect' | 'wander';
  targetX: number;
  targetY: number;
  lastBombTime: number;
  stuckTimer: number;
  lastPosition: { x: number; y: number };
}

export class AIController {
  private player: Player;
  private state: AIState;
  private difficulty: 'easy' | 'medium' | 'hard';
  private thinkInterval: number;
  private lastThinkTime: number = 0;

  // Difficulty settings
  private readonly DIFFICULTY_SETTINGS = {
    easy: {
      reactionTime: 500,    // ms between decisions
      bombChance: 0.3,      // chance to place bomb when appropriate
      avoidanceSkill: 0.6,  // how well they avoid danger
      chaseSkill: 0.4,      // how well they chase players
    },
    medium: {
      reactionTime: 300,
      bombChance: 0.5,
      avoidanceSkill: 0.8,
      chaseSkill: 0.6,
    },
    hard: {
      reactionTime: 150,
      bombChance: 0.7,
      avoidanceSkill: 0.95,
      chaseSkill: 0.8,
    }
  };

  constructor(player: Player, difficulty: 'easy' | 'medium' | 'hard' = 'medium') {
    this.player = player;
    this.difficulty = difficulty;
    this.thinkInterval = this.DIFFICULTY_SETTINGS[difficulty].reactionTime;
    this.state = {
      currentGoal: 'wander',
      targetX: player.position.gridX,
      targetY: player.position.gridY,
      lastBombTime: 0,
      stuckTimer: 0,
      lastPosition: { x: player.position.gridX, y: player.position.gridY }
    };
  }

  update(
    deltaTime: number,
    currentTime: number,
    blocks: Block[],
    bombs: Bomb[],
    explosions: Explosion[],
    powerUps: PowerUp[],
    players: Player[]
  ): { direction: Direction | null; placeBomb: boolean } {
    // Only think at intervals based on difficulty
    if (currentTime - this.lastThinkTime < this.thinkInterval) {
      return { direction: this.getDirectionToTarget(), placeBomb: false };
    }
    this.lastThinkTime = currentTime;

    // Build grid understanding
    const grid = this.buildGrid(blocks, bombs, explosions, powerUps, players);

    // Check if stuck
    this.checkIfStuck(deltaTime);

    // Decide goal priority
    const danger = this.assessDanger(grid);
    const settings = this.DIFFICULTY_SETTINGS[this.difficulty];

    let placeBomb = false;

    if (danger.isInDanger && Math.random() < settings.avoidanceSkill) {
      // Priority 1: Flee from danger
      this.state.currentGoal = 'flee';
      const safeSpot = this.findSafeSpot(grid);
      if (safeSpot) {
        this.state.targetX = safeSpot.x;
        this.state.targetY = safeSpot.y;
      }
    } else {
      // Not in immediate danger, consider other goals
      const nearbyPowerUp = this.findNearbyPowerUp(grid, powerUps);
      const nearbyEnemy = this.findNearbyEnemy(players);

      if (nearbyPowerUp && Math.random() < 0.7) {
        // Priority 2: Collect power-ups
        this.state.currentGoal = 'collect';
        this.state.targetX = nearbyPowerUp.x;
        this.state.targetY = nearbyPowerUp.y;
      } else if (nearbyEnemy && Math.random() < settings.chaseSkill) {
        // Priority 3: Attack enemies
        this.state.currentGoal = 'attack';
        this.state.targetX = nearbyEnemy.position.gridX;
        this.state.targetY = nearbyEnemy.position.gridY;

        // Consider placing bomb if close to enemy
        const distToEnemy = Math.abs(this.player.position.gridX - nearbyEnemy.position.gridX) +
                           Math.abs(this.player.position.gridY - nearbyEnemy.position.gridY);

        if (distToEnemy <= this.player.bombRange + 1 &&
            this.canPlaceBombSafely(grid) &&
            Math.random() < settings.bombChance &&
            currentTime - this.state.lastBombTime > 1000) {
          placeBomb = true;
          this.state.lastBombTime = currentTime;
        }
      } else {
        // Priority 4: Wander and break blocks
        this.state.currentGoal = 'wander';
        if (this.isAtTarget() || this.state.stuckTimer > 1) {
          const wanderTarget = this.findWanderTarget(grid);
          if (wanderTarget) {
            this.state.targetX = wanderTarget.x;
            this.state.targetY = wanderTarget.y;
          }
        }

        // Consider breaking blocks while wandering
        if (this.isNearDestructibleBlock(grid) &&
            this.canPlaceBombSafely(grid) &&
            Math.random() < settings.bombChance * 0.5 &&
            currentTime - this.state.lastBombTime > 2000) {
          placeBomb = true;
          this.state.lastBombTime = currentTime;
        }
      }
    }

    const direction = this.getDirectionToTarget();

    return { direction, placeBomb };
  }

  private buildGrid(
    blocks: Block[],
    bombs: Bomb[],
    explosions: Explosion[],
    powerUps: PowerUp[],
    players: Player[]
  ): GridCell[][] {
    const grid: GridCell[][] = [];

    // Initialize grid
    for (let y = 0; y < GRID_HEIGHT; y++) {
      grid[y] = [];
      for (let x = 0; x < GRID_WIDTH; x++) {
        grid[y][x] = {
          x,
          y,
          isWalkable: true,
          isDangerous: false,
          dangerTime: Infinity,
          hasPowerUp: false,
          hasPlayer: false,
          hasBomb: false
        };
      }
    }

    // Mark blocks
    for (const block of blocks) {
      if (block.isActive) {
        const cell = grid[block.position.gridY]?.[block.position.gridX];
        if (cell) {
          cell.isWalkable = false;
        }
      }
    }

    // Mark bombs and their explosion paths
    for (const bomb of bombs) {
      if (!bomb.isActive) continue;

      const bx = bomb.position.gridX;
      const by = bomb.position.gridY;

      if (grid[by]?.[bx]) {
        grid[by][bx].isWalkable = false;
        grid[by][bx].hasBomb = true;
        grid[by][bx].isDangerous = true;
        grid[by][bx].dangerTime = Math.min(grid[by][bx].dangerTime, bomb.timer);
      }

      // Mark explosion paths
      const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 }
      ];

      for (const { dx, dy } of directions) {
        for (let i = 1; i <= bomb.range; i++) {
          const tx = bx + dx * i;
          const ty = by + dy * i;

          if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

          const cell = grid[ty][tx];
          if (!cell.isWalkable && !cell.hasBomb) break; // Hit a wall

          cell.isDangerous = true;
          cell.dangerTime = Math.min(cell.dangerTime, bomb.timer);
        }
      }
    }

    // Mark active explosions as dangerous
    for (const explosion of explosions) {
      if (!explosion.isActive) continue;

      for (const tile of explosion.tiles) {
        const cell = grid[tile.gridY]?.[tile.gridX];
        if (cell) {
          cell.isDangerous = true;
          cell.dangerTime = 0;
        }
      }
    }

    // Mark power-ups
    for (const powerUp of powerUps) {
      if (powerUp.isActive) {
        const cell = grid[powerUp.position.gridY]?.[powerUp.position.gridX];
        if (cell) {
          cell.hasPowerUp = true;
        }
      }
    }

    // Mark other players
    for (const p of players) {
      if (p.isPlayerAlive() && p !== this.player) {
        const cell = grid[p.position.gridY]?.[p.position.gridX];
        if (cell) {
          cell.hasPlayer = true;
        }
      }
    }

    return grid;
  }

  private assessDanger(grid: GridCell[][]): { isInDanger: boolean; dangerLevel: number } {
    const px = this.player.position.gridX;
    const py = this.player.position.gridY;

    const cell = grid[py]?.[px];
    if (!cell) return { isInDanger: false, dangerLevel: 0 };

    if (cell.isDangerous) {
      return { isInDanger: true, dangerLevel: cell.dangerTime < 1 ? 1 : 0.5 };
    }

    return { isInDanger: false, dangerLevel: 0 };
  }

  private findSafeSpot(grid: GridCell[][]): { x: number; y: number } | null {
    const px = this.player.position.gridX;
    const py = this.player.position.gridY;

    // BFS to find nearest safe spot
    const visited = new Set<string>();
    const queue: { x: number; y: number; dist: number }[] = [{ x: px, y: py, dist: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.x},${current.y}`;

      if (visited.has(key)) continue;
      visited.add(key);

      const cell = grid[current.y]?.[current.x];
      if (!cell) continue;

      // Found a safe, walkable spot
      if (cell.isWalkable && !cell.isDangerous && current.dist > 0) {
        return { x: current.x, y: current.y };
      }

      // Explore neighbors
      const neighbors = [
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 },
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y }
      ];

      for (const n of neighbors) {
        const nCell = grid[n.y]?.[n.x];
        if (nCell && nCell.isWalkable && !visited.has(`${n.x},${n.y}`)) {
          queue.push({ x: n.x, y: n.y, dist: current.dist + 1 });
        }
      }
    }

    return null;
  }

  private findNearbyPowerUp(grid: GridCell[][], powerUps: PowerUp[]): { x: number; y: number } | null {
    const px = this.player.position.gridX;
    const py = this.player.position.gridY;

    let nearest: { x: number; y: number; dist: number } | null = null;

    for (const powerUp of powerUps) {
      if (!powerUp.isActive) continue;

      const dist = Math.abs(powerUp.position.gridX - px) + Math.abs(powerUp.position.gridY - py);

      if (dist < 8 && (!nearest || dist < nearest.dist)) {
        // Check if path is safe
        const cell = grid[powerUp.position.gridY]?.[powerUp.position.gridX];
        if (cell && !cell.isDangerous) {
          nearest = { x: powerUp.position.gridX, y: powerUp.position.gridY, dist };
        }
      }
    }

    return nearest ? { x: nearest.x, y: nearest.y } : null;
  }

  private findNearbyEnemy(players: Player[]): Player | null {
    const px = this.player.position.gridX;
    const py = this.player.position.gridY;

    let nearest: { player: Player; dist: number } | null = null;

    for (const p of players) {
      if (p === this.player || !p.isPlayerAlive()) continue;

      const dist = Math.abs(p.position.gridX - px) + Math.abs(p.position.gridY - py);

      if (!nearest || dist < nearest.dist) {
        nearest = { player: p, dist };
      }
    }

    return nearest?.player || null;
  }

  private findWanderTarget(grid: GridCell[][]): { x: number; y: number } | null {
    const px = this.player.position.gridX;
    const py = this.player.position.gridY;

    // Look for interesting targets: destructible blocks nearby or open areas
    const candidates: { x: number; y: number; score: number }[] = [];

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = grid[y][x];
        if (!cell.isWalkable || cell.isDangerous) continue;

        const dist = Math.abs(x - px) + Math.abs(y - py);
        if (dist < 2 || dist > 10) continue;

        let score = 10 - dist;

        // Bonus for cells near destructible blocks
        const neighbors = [
          grid[y - 1]?.[x],
          grid[y + 1]?.[x],
          grid[y]?.[x - 1],
          grid[y]?.[x + 1]
        ];

        for (const n of neighbors) {
          if (n && !n.isWalkable) {
            score += 2; // Near a block we might want to destroy
          }
        }

        candidates.push({ x, y, score });
      }
    }

    if (candidates.length === 0) return null;

    // Sort by score and pick randomly from top candidates
    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, Math.min(5, candidates.length));
    return topCandidates[Math.floor(Math.random() * topCandidates.length)];
  }

  private isNearDestructibleBlock(grid: GridCell[][]): boolean {
    const px = this.player.position.gridX;
    const py = this.player.position.gridY;

    const neighbors = [
      grid[py - 1]?.[px],
      grid[py + 1]?.[px],
      grid[py]?.[px - 1],
      grid[py]?.[px + 1]
    ];

    return neighbors.some(n => n && !n.isWalkable && !n.hasBomb);
  }

  private canPlaceBombSafely(grid: GridCell[][]): boolean {
    if (!this.player.canPlaceBomb()) return false;

    const px = this.player.position.gridX;
    const py = this.player.position.gridY;

    // Simulate bomb placement and check if there's an escape route
    const bombRange = this.player.bombRange;

    // Mark cells that would be dangerous
    const dangerousCells = new Set<string>();
    dangerousCells.add(`${px},${py}`);

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    for (const { dx, dy } of directions) {
      for (let i = 1; i <= bombRange; i++) {
        const tx = px + dx * i;
        const ty = py + dy * i;

        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

        const cell = grid[ty]?.[tx];
        if (!cell || !cell.isWalkable) break;

        dangerousCells.add(`${tx},${ty}`);
      }
    }

    // BFS to find escape route
    const visited = new Set<string>();
    const queue: { x: number; y: number; dist: number }[] = [];

    // Start from adjacent cells
    for (const { dx, dy } of directions) {
      const nx = px + dx;
      const ny = py + dy;
      const cell = grid[ny]?.[nx];
      if (cell && cell.isWalkable && !cell.isDangerous) {
        queue.push({ x: nx, y: ny, dist: 1 });
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.x},${current.y}`;

      if (visited.has(key)) continue;
      visited.add(key);

      // Found a safe spot outside the bomb range
      if (!dangerousCells.has(key)) {
        return true;
      }

      // Continue searching
      for (const { dx, dy } of directions) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nKey = `${nx},${ny}`;
        const cell = grid[ny]?.[nx];

        if (cell && cell.isWalkable && !cell.isDangerous && !visited.has(nKey)) {
          queue.push({ x: nx, y: ny, dist: current.dist + 1 });
        }
      }
    }

    return false;
  }

  private isAtTarget(): boolean {
    return this.player.position.gridX === this.state.targetX &&
           this.player.position.gridY === this.state.targetY;
  }

  private checkIfStuck(deltaTime: number): void {
    const currentPos = {
      x: this.player.position.gridX,
      y: this.player.position.gridY
    };

    if (currentPos.x === this.state.lastPosition.x &&
        currentPos.y === this.state.lastPosition.y) {
      this.state.stuckTimer += deltaTime;
    } else {
      this.state.stuckTimer = 0;
    }

    this.state.lastPosition = currentPos;
  }

  private getDirectionToTarget(): Direction | null {
    const px = this.player.position.gridX;
    const py = this.player.position.gridY;
    const tx = this.state.targetX;
    const ty = this.state.targetY;

    const dx = tx - px;
    const dy = ty - py;

    if (dx === 0 && dy === 0) return null;

    // Prefer the axis with larger distance, with some randomness
    if (Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && Math.random() > 0.5)) {
      return dx > 0 ? Direction.RIGHT : Direction.LEFT;
    } else {
      return dy > 0 ? Direction.DOWN : Direction.UP;
    }
  }

  getState(): AIState {
    return this.state;
  }

  getDifficulty(): string {
    return this.difficulty;
  }
}
