import { Player } from '../entities/Player';
import { Block } from '../entities/Block';
import { Bomb } from '../entities/Bomb';
import { PowerUp } from '../entities/PowerUp';
import { Explosion } from '../entities/Explosion';
import { Direction, GRID_WIDTH, GRID_HEIGHT } from '../constants';
import { Pathfinder } from './Pathfinder';

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
  currentPath: { x: number; y: number }[];
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
      bombChance: 0.4,      // chance to place bomb when appropriate
      avoidanceSkill: 0.95, // how well they avoid danger
      chaseSkill: 0.3,      // how well they chase players
      minBombDelay: 2000,   // minimum time between bombs
    },
    medium: {
      reactionTime: 300,
      bombChance: 0.55,
      avoidanceSkill: 0.98,
      chaseSkill: 0.5,
      minBombDelay: 1500,
    },
    hard: {
      reactionTime: 150,
      bombChance: 0.7,
      avoidanceSkill: 1.0,
      chaseSkill: 0.7,
      minBombDelay: 1200,
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
      lastPosition: { x: player.position.gridX, y: player.position.gridY },
      currentPath: []
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
    // Build grid understanding - we need this every frame for safety checks
    const grid = this.buildGrid(blocks, bombs, explosions, powerUps, players);

    // Only think at intervals based on difficulty, but always check safety
    const shouldThink = currentTime - this.lastThinkTime >= this.thinkInterval;
    if (!shouldThink) {
      // Between thinking intervals, stick to the current path if it's still valid
      if (this.state.currentPath && this.state.currentPath.length > 0) {
        const nextNode = this.state.currentPath[0];
        // Check if we reached the next node
        if (this.player.position.gridX === nextNode.x && this.player.position.gridY === nextNode.y) {
          this.state.currentPath.shift(); // Remove reached node
        }

        if (this.state.currentPath.length > 0) {
          const nextTarget = this.state.currentPath[0];
          const direction = this.getDirectionToNode(nextTarget);
          return { direction, placeBomb: false };
        }
      }
      return { direction: null, placeBomb: false };
    }
    this.lastThinkTime = currentTime;

    // Check if stuck
    this.checkIfStuck(deltaTime);

    // Decide goal priority
    const danger = this.assessDanger(grid);
    const settings = this.DIFFICULTY_SETTINGS[this.difficulty];

    let placeBomb = false;
    let targetX = this.player.position.gridX;
    let targetY = this.player.position.gridY;

    if (danger.isInDanger) {
      // Priority 1: Flee from danger - ALWAYS TOP PRIORITY
      this.state.currentGoal = 'flee';
      const safeSpot = this.findSafeSpot(grid);
      if (safeSpot) {
        targetX = safeSpot.x;
        targetY = safeSpot.y;
      }
      // NEVER place bombs while fleeing
      placeBomb = false;
    } else {
      // Not in immediate danger, consider other goals
      const nearbyPowerUp = this.findNearbyPowerUp(grid, powerUps);
      const nearbyEnemy = this.findNearbyEnemy(players);

      if (nearbyPowerUp && Math.random() < 0.7) {
        // Priority 2: Collect power-ups (but be safe)
        this.state.currentGoal = 'collect';
        targetX = nearbyPowerUp.x;
        targetY = nearbyPowerUp.y;
      } else if (nearbyEnemy && Math.random() < settings.chaseSkill) {
        // Priority 3: Attack enemies
        this.state.currentGoal = 'attack';
        targetX = nearbyEnemy.position.gridX;
        targetY = nearbyEnemy.position.gridY;

        // Consider placing bomb if close to enemy
        const distToEnemy = Math.abs(this.player.position.gridX - nearbyEnemy.position.gridX) +
          Math.abs(this.player.position.gridY - nearbyEnemy.position.gridY);

        const timeSinceLastBomb = currentTime - this.state.lastBombTime;

        if (distToEnemy >= 1 &&
          distToEnemy <= this.player.bombRange + 2 &&
          this.canPlaceBombSafely(grid) &&
          Math.random() < settings.bombChance &&
          timeSinceLastBomb > settings.minBombDelay) {
          placeBomb = true;
          this.state.lastBombTime = currentTime;
        }
      } else {
        // Priority 4: Wander and break blocks
        this.state.currentGoal = 'wander';

        // Pick new wander target if current one is reached or invalid
        if (this.isAtTarget() || this.state.stuckTimer > 1 || !this.isValidTarget(this.state.targetX, this.state.targetY, grid)) {
          const wanderTarget = this.findWanderTarget(grid);
          if (wanderTarget) {
            targetX = wanderTarget.x;
            targetY = wanderTarget.y;
          }
        } else {
          targetX = this.state.targetX;
          targetY = this.state.targetY;
        }

        // Consider breaking blocks while wandering
        const timeSinceLastBomb = currentTime - this.state.lastBombTime;

        if (this.isNearDestructibleBlock(grid) &&
          this.canPlaceBombSafely(grid) &&
          Math.random() < settings.bombChance * 0.7 &&
          timeSinceLastBomb > settings.minBombDelay) {
          placeBomb = true;
          this.state.lastBombTime = currentTime;
        }
      }
    }

    // Update state target
    this.state.targetX = targetX;
    this.state.targetY = targetY;

    // Calculate path to target using A*
    let path = Pathfinder.findPath(
      this.player.position.gridX,
      this.player.position.gridY,
      targetX,
      targetY,
      grid
    );

    // Fallback: If pathfinding failed (target unreachable) and we were trying to attack/collect,
    // switch to wander mode to break walls or find a better spot.
    if (!path && (this.state.currentGoal === 'attack' || this.state.currentGoal === 'collect')) {
      this.state.currentGoal = 'wander';
      const wanderTarget = this.findWanderTarget(grid);
      if (wanderTarget) {
        targetX = wanderTarget.x;
        targetY = wanderTarget.y;
        this.state.targetX = targetX;
        this.state.targetY = targetY;

        path = Pathfinder.findPath(
          this.player.position.gridX,
          this.player.position.gridY,
          targetX,
          targetY,
          grid
        );
      }
    }

    this.state.currentPath = path || [];

    let direction: Direction | null = null;

    if (this.state.currentPath.length > 0) {
      const nextNode = this.state.currentPath[0];
      // If we are already at the next node (overlapping), skip it
      if (this.player.position.gridX === nextNode.x && this.player.position.gridY === nextNode.y) {
        this.state.currentPath.shift();
        if (this.state.currentPath.length > 0) {
          direction = this.getDirectionToNode(this.state.currentPath[0]);
        }
      } else {
        direction = this.getDirectionToNode(nextNode);
      }
    }

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

    // Pass 2: Propagate chain reactions
    // If a bomb is hit by an explosion (from another bomb), its timer becomes the explosion time
    let changed = true;
    while (changed) {
      changed = false;
      for (const bomb of bombs) {
        if (!bomb.isActive) continue;

        const cell = grid[bomb.position.gridY][bomb.position.gridX];

        // If this bomb is in danger (hit by another), update its dangerTime
        if (cell.isDangerous && cell.dangerTime < bomb.timer) {
          const newTime = cell.dangerTime;

          const directions = [
            { dx: 0, dy: -1 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 }
          ];

          for (const { dx, dy } of directions) {
            for (let i = 1; i <= bomb.range; i++) {
              const tx = bomb.position.gridX + dx * i;
              const ty = bomb.position.gridY + dy * i;

              if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

              const targetCell = grid[ty][tx];
              if (!targetCell.isWalkable && !targetCell.hasBomb) break;

              if (!targetCell.isDangerous || targetCell.dangerTime > newTime) {
                targetCell.isDangerous = true;
                targetCell.dangerTime = newTime;
                changed = true;
              }
            }
          }
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

    // Check current position
    if (cell.isDangerous) {
      return { isInDanger: true, dangerLevel: cell.dangerTime < 1.5 ? 1 : 0.7 };
    }

    // Check adjacent cells for incoming danger
    const neighbors = [
      grid[py - 1]?.[px],
      grid[py + 1]?.[px],
      grid[py]?.[px - 1],
      grid[py]?.[px + 1]
    ];

    for (const neighbor of neighbors) {
      if (neighbor && neighbor.isDangerous && neighbor.dangerTime < 2) {
        return { isInDanger: true, dangerLevel: 0.5 };
      }
    }

    return { isInDanger: false, dangerLevel: 0 };
  }

  private findSafeSpot(grid: GridCell[][]): { x: number; y: number } | null {
    const px = this.player.position.gridX;
    const py = this.player.position.gridY;

    // BFS to find nearest safe spot with escape routes
    const visited = new Set<string>();
    const queue: { x: number; y: number; dist: number }[] = [{ x: px, y: py, dist: 0 }];
    const safespots: { x: number; y: number; dist: number; score: number }[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.x},${current.y}`;

      if (visited.has(key)) continue;
      visited.add(key);

      const cell = grid[current.y]?.[current.x];
      if (!cell) continue;

      // Found a safe, walkable spot
      if (cell.isWalkable && !cell.isDangerous && current.dist > 0) {
        // Score based on distance and safety (farther from danger = better)
        let score = 100 - current.dist; // Prefer closer spots

        // Check if this spot has good escape routes (multiple safe neighbors)
        const safeNeighbors = [
          grid[current.y - 1]?.[current.x],
          grid[current.y + 1]?.[current.x],
          grid[current.y]?.[current.x - 1],
          grid[current.y]?.[current.x + 1]
        ].filter(n => n && n.isWalkable && !n.isDangerous);

        score += safeNeighbors.length * 10; // Bonus for more escape routes

        safespots.push({ x: current.x, y: current.y, dist: current.dist, score });

        // If we found a good safe spot nearby, we can stop searching
        if (safespots.length >= 5) break;
      }

      // Don't search too far
      if (current.dist >= 10) continue;

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

    // Return the best safe spot
    if (safespots.length === 0) return null;

    safespots.sort((a, b) => b.score - a.score);
    return { x: safespots[0].x, y: safespots[0].y };
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
        if (dist < 1 || dist > 10) continue;

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
    const bombFuseTime = 3.0; // seconds until bomb explodes
    const playerSpeed = this.player.getEffectiveSpeed(); // tiles per second
    const safetyMargin = 1.05; // require 5% extra time for safety

    // Mark cells that would be dangerous
    const dangerousCells = new Set<string>();
    dangerousCells.add(`${px},${py}`);

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    // Calculate explosion zone
    for (const { dx, dy } of directions) {
      for (let i = 1; i <= bombRange; i++) {
        const tx = px + dx * i;
        const ty = py + dy * i;

        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

        const cell = grid[ty]?.[tx];
        if (!cell) break;

        // Stop at walls but mark the position as dangerous anyway
        if (!cell.isWalkable) {
          if (!cell.hasBomb) break; // Hard wall blocks explosion
        }

        dangerousCells.add(`${tx},${ty}`);
      }
    }

    // BFS to find escape route with time calculation
    const visited = new Set<string>();
    const queue: { x: number; y: number; dist: number }[] = [{ x: px, y: py, dist: 0 }];

    let bestSafeSpot: { x: number; y: number; dist: number } | null = null;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = `${current.x},${current.y}`;

      if (visited.has(key)) continue;
      visited.add(key);

      const cell = grid[current.y]?.[current.x];
      if (!cell) continue;

      // Check if this is a safe spot
      const isSafe = !dangerousCells.has(key) && !cell.isDangerous;

      if (isSafe && current.dist > 0) {
        // Calculate time needed to reach this spot
        const timeNeeded = current.dist / playerSpeed;
        const timeAvailable = bombFuseTime / safetyMargin;

        // Found a safe spot we can reach in time
        if (timeNeeded < timeAvailable) {
          if (!bestSafeSpot || current.dist < bestSafeSpot.dist) {
            bestSafeSpot = { x: current.x, y: current.y, dist: current.dist };
          }
        }
      }

      // Don't search too far
      if (current.dist >= 8) continue;

      // Continue searching
      for (const { dx, dy } of directions) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nKey = `${nx},${ny}`;
        const nCell = grid[ny]?.[nx];

        if (nCell && nCell.isWalkable && !nCell.isDangerous && !visited.has(nKey)) {
          queue.push({ x: nx, y: ny, dist: current.dist + 1 });
        }
      }
    }

    // Only place bomb if we found a safe escape route
    return bestSafeSpot !== null;
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

  private getDirectionToNode(node: { x: number; y: number }): Direction | null {
    const px = this.player.position.gridX;
    const py = this.player.position.gridY;
    const tx = node.x;
    const ty = node.y;

    const dx = tx - px;
    const dy = ty - py;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? Direction.RIGHT : Direction.LEFT;
    } else if (Math.abs(dy) > Math.abs(dx)) {
      return dy > 0 ? Direction.DOWN : Direction.UP;
    }

    return null;
  }

  private isValidTarget(x: number, y: number, grid: GridCell[][]): boolean {
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return false;
    const cell = grid[y][x];
    return cell && cell.isWalkable && !cell.isDangerous;
  }


  getState(): AIState {
    return this.state;
  }

  getDifficulty(): string {
    return this.difficulty;
  }
}
