import { Player } from '../entities/Player';
import { Block } from '../entities/Block';
import { Bomb } from '../entities/Bomb';
import { PowerUp } from '../entities/PowerUp';
import { Explosion } from '../entities/Explosion';
import { Direction, GRID_WIDTH, GRID_HEIGHT, BOMB_FUSE_TIME } from '../constants';

interface DangerCell {
  x: number;
  y: number;
  isWalkable: boolean;
  dangerTime: number;
  hasBomb: boolean;
  hasPowerUp: boolean;
  hasDestructibleBlock: boolean;
}

// Clear state machine
type AIState =
  | 'FINDING_BOMB_SPOT'    // Step 1: Find where to place bomb
  | 'MOVING_TO_BOMB_SPOT'  // Step 2: Move to bomb placement location
  | 'ESCAPING'             // Step 3-4: Run to safety after placing bomb
  | 'COLLECTING';          // Bonus: Pick up power-ups when safe

interface BombPlan {
  bombX: number;
  bombY: number;
  escapeX: number;
  escapeY: number;
}

interface DifficultySettings {
  reactionTime: number;
  aggressiveness: number; // 0-1, how much to prioritize chasing players vs breaking blocks
  minBombCooldown: number;
}

const DIFFICULTY_PRESETS: Record<string, DifficultySettings> = {
  easy: {
    reactionTime: 0.3,
    aggressiveness: 0.2,
    minBombCooldown: 2.5,
  },
  medium: {
    reactionTime: 0.15,
    aggressiveness: 0.5,
    minBombCooldown: 1.5,
  },
  hard: {
    reactionTime: 0.08,
    aggressiveness: 0.8,
    minBombCooldown: 0.8,
  }
};

export class AIController {
  private player: Player;
  private difficulty: 'easy' | 'medium' | 'hard';
  private settings: DifficultySettings;

  private state: AIState = 'FINDING_BOMB_SPOT';
  private currentPlan: BombPlan | null = null;
  private lastDecisionTime: number = 0;
  private lastBombTime: number = -10;

  constructor(player: Player, difficulty: 'easy' | 'medium' | 'hard' = 'medium') {
    this.player = player;
    this.difficulty = difficulty;
    this.settings = DIFFICULTY_PRESETS[difficulty];
  }

  update(
    _deltaTime: number,
    currentTime: number,
    blocks: Block[],
    bombs: Bomb[],
    explosions: Explosion[],
    powerUps: PowerUp[],
    players: Player[]
  ): { direction: Direction | null; placeBomb: boolean } {
    const grid = this.buildDangerGrid(blocks, bombs, explosions, powerUps);
    const myX = this.player.position.gridX;
    const myY = this.player.position.gridY;
    const myCell = grid[myY]?.[myX];

    // ALWAYS check if we're in danger - override everything else
    const isInDanger = myCell && myCell.dangerTime < Infinity;

    if (isInDanger) {
      // Emergency escape - find safest direction immediately
      this.state = 'ESCAPING';
      const escapeDir = this.findBestEscapeDirection(grid, myX, myY);
      return { direction: escapeDir, placeBomb: false };
    }

    // If we were escaping and are now safe, go back to finding next bomb spot
    if (this.state === 'ESCAPING') {
      this.state = 'FINDING_BOMB_SPOT';
      this.currentPlan = null;
    }

    // Rate limit decisions (except when escaping)
    const shouldThink = currentTime - this.lastDecisionTime >= this.settings.reactionTime;
    if (!shouldThink && this.state !== 'FINDING_BOMB_SPOT') {
      return this.continueCurrentAction(grid, myX, myY);
    }
    this.lastDecisionTime = currentTime;

    // Check for nearby power-ups first (quick detour)
    const nearbyPowerUp = this.findNearbyPowerUp(grid, powerUps, myX, myY);
    if (nearbyPowerUp && this.state === 'FINDING_BOMB_SPOT') {
      this.state = 'COLLECTING';
      const dir = this.moveToward(nearbyPowerUp.x, nearbyPowerUp.y, myX, myY, grid);
      return { direction: dir, placeBomb: false };
    }

    // State machine
    switch (this.state) {
      case 'FINDING_BOMB_SPOT':
        return this.handleFindingBombSpot(grid, myX, myY, players, currentTime);

      case 'MOVING_TO_BOMB_SPOT':
        return this.handleMovingToBombSpot(grid, myX, myY, currentTime);

      case 'COLLECTING':
        // If we reached the power-up or it's gone, go back to bombing
        if (!nearbyPowerUp || (myX === nearbyPowerUp.x && myY === nearbyPowerUp.y)) {
          this.state = 'FINDING_BOMB_SPOT';
        }
        return { direction: nearbyPowerUp ? this.moveToward(nearbyPowerUp.x, nearbyPowerUp.y, myX, myY, grid) : null, placeBomb: false };

      default:
        this.state = 'FINDING_BOMB_SPOT';
        return { direction: null, placeBomb: false };
    }
  }

  // STEP 1: Find a good bomb placement location with escape route
  private handleFindingBombSpot(
    grid: DangerCell[][],
    myX: number,
    myY: number,
    players: Player[],
    currentTime: number
  ): { direction: Direction | null; placeBomb: boolean } {

    const canPlaceBomb = this.player.canPlaceBomb() &&
                         (currentTime - this.lastBombTime) > this.settings.minBombCooldown;

    if (!canPlaceBomb) {
      // Can't place bombs yet, just wander safely
      const wanderDir = this.findWanderDirection(grid, myX, myY);
      return { direction: wanderDir, placeBomb: false };
    }

    // Try to find a bomb spot - prioritize based on aggressiveness
    let plan: BombPlan | null = null;

    // Higher aggressiveness = try to attack players first
    if (Math.random() < this.settings.aggressiveness) {
      plan = this.findAttackBombSpot(grid, myX, myY, players);
    }

    // If no attack opportunity or low aggressiveness, find blocks to destroy
    if (!plan) {
      plan = this.findBlockBombSpot(grid, myX, myY);
    }

    // Fallback to attack if no blocks nearby
    if (!plan) {
      plan = this.findAttackBombSpot(grid, myX, myY, players);
    }

    if (!plan) {
      // No good bomb spots, just wander
      const wanderDir = this.findWanderDirection(grid, myX, myY);
      return { direction: wanderDir, placeBomb: false };
    }

    this.currentPlan = plan;

    // Are we already at the bomb spot?
    if (myX === plan.bombX && myY === plan.bombY) {
      // STEP 2: Place bomb and immediately start escaping
      this.lastBombTime = currentTime;
      this.state = 'ESCAPING';

      // Start moving toward escape immediately
      const escapeDir = this.moveToward(plan.escapeX, plan.escapeY, myX, myY, grid);
      return { direction: escapeDir, placeBomb: true };
    }

    // Need to move to bomb spot first
    this.state = 'MOVING_TO_BOMB_SPOT';
    const moveDir = this.moveToward(plan.bombX, plan.bombY, myX, myY, grid);
    return { direction: moveDir, placeBomb: false };
  }

  // STEP 2: Move to the bomb placement location
  private handleMovingToBombSpot(
    grid: DangerCell[][],
    myX: number,
    myY: number,
    currentTime: number
  ): { direction: Direction | null; placeBomb: boolean } {

    if (!this.currentPlan) {
      this.state = 'FINDING_BOMB_SPOT';
      return { direction: null, placeBomb: false };
    }

    const plan = this.currentPlan;

    // Reached the bomb spot?
    if (myX === plan.bombX && myY === plan.bombY) {
      // Verify escape route is still valid
      const escapeStillValid = this.verifyEscapeRoute(grid, myX, myY, plan.escapeX, plan.escapeY);

      if (!escapeStillValid) {
        // Recalculate escape or abort
        const newEscape = this.findEscapeFrom(grid, myX, myY);
        if (newEscape) {
          plan.escapeX = newEscape.x;
          plan.escapeY = newEscape.y;
        } else {
          // Can't escape safely, abort and find new plan
          this.state = 'FINDING_BOMB_SPOT';
          this.currentPlan = null;
          return { direction: null, placeBomb: false };
        }
      }

      // Place bomb and escape!
      this.lastBombTime = currentTime;
      this.state = 'ESCAPING';
      const escapeDir = this.moveToward(plan.escapeX, plan.escapeY, myX, myY, grid);
      return { direction: escapeDir, placeBomb: true };
    }

    // Keep moving to bomb spot
    const moveDir = this.moveToward(plan.bombX, plan.bombY, myX, myY, grid);

    // If we can't move, recalculate
    if (!moveDir) {
      this.state = 'FINDING_BOMB_SPOT';
      this.currentPlan = null;
    }

    return { direction: moveDir, placeBomb: false };
  }

  // Continue current action without full recalculation
  private continueCurrentAction(
    grid: DangerCell[][],
    myX: number,
    myY: number
  ): { direction: Direction | null; placeBomb: boolean } {

    if (this.state === 'MOVING_TO_BOMB_SPOT' && this.currentPlan) {
      const dir = this.moveToward(this.currentPlan.bombX, this.currentPlan.bombY, myX, myY, grid);
      return { direction: dir, placeBomb: false };
    }

    if (this.state === 'ESCAPING' && this.currentPlan) {
      const dir = this.moveToward(this.currentPlan.escapeX, this.currentPlan.escapeY, myX, myY, grid);
      return { direction: dir, placeBomb: false };
    }

    return { direction: null, placeBomb: false };
  }

  // Find a spot to bomb near a player
  private findAttackBombSpot(
    grid: DangerCell[][],
    myX: number,
    myY: number,
    players: Player[]
  ): BombPlan | null {
    const enemies = players.filter(p => p !== this.player && p.isPlayerAlive());
    if (enemies.length === 0) return null;

    // Find closest enemy
    let closestEnemy: Player | null = null;
    let closestDist = Infinity;

    for (const enemy of enemies) {
      const dist = Math.abs(enemy.position.gridX - myX) + Math.abs(enemy.position.gridY - myY);
      if (dist < closestDist) {
        closestDist = dist;
        closestEnemy = enemy;
      }
    }

    if (!closestEnemy) return null;

    const enemyX = closestEnemy.position.gridX;
    const enemyY = closestEnemy.position.gridY;
    const bombRange = this.player.bombRange;

    // Find positions where we could bomb the enemy
    const candidates: { bombX: number; bombY: number; escapeX: number; escapeY: number; dist: number }[] = [];

    // Check positions in line with enemy
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    for (const { dx, dy } of directions) {
      for (let i = 1; i <= bombRange; i++) {
        const bombX = enemyX + dx * i;
        const bombY = enemyY + dy * i;

        if (!this.isValidBombSpot(grid, bombX, bombY)) continue;

        // Find escape route from this bomb position
        const escape = this.findEscapeFrom(grid, bombX, bombY);
        if (!escape) continue;

        const distToMe = Math.abs(bombX - myX) + Math.abs(bombY - myY);
        candidates.push({ bombX, bombY, escapeX: escape.x, escapeY: escape.y, dist: distToMe });
      }
    }

    if (candidates.length === 0) return null;

    // Pick closest valid spot
    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];
    return { bombX: best.bombX, bombY: best.bombY, escapeX: best.escapeX, escapeY: best.escapeY };
  }

  // Find a spot to bomb near destructible blocks
  private findBlockBombSpot(
    grid: DangerCell[][],
    myX: number,
    myY: number
  ): BombPlan | null {
    const candidates: { bombX: number; bombY: number; escapeX: number; escapeY: number; score: number }[] = [];

    // Search for good bomb spots near blocks
    for (let y = 1; y < GRID_HEIGHT - 1; y++) {
      for (let x = 1; x < GRID_WIDTH - 1; x++) {
        if (!this.isValidBombSpot(grid, x, y)) continue;

        // Count adjacent destructible blocks
        const blockCount = this.countAdjacentBlocks(grid, x, y);
        if (blockCount === 0) continue;

        // Find escape route
        const escape = this.findEscapeFrom(grid, x, y);
        if (!escape) continue;

        const dist = Math.abs(x - myX) + Math.abs(y - myY);
        // Score: more blocks = better, closer = better
        const score = blockCount * 10 - dist;

        candidates.push({ bombX: x, bombY: y, escapeX: escape.x, escapeY: escape.y, score });
      }
    }

    if (candidates.length === 0) return null;

    // Sort by score (higher is better)
    candidates.sort((a, b) => b.score - a.score);

    // Pick from top candidates with some randomness
    const topN = Math.min(3, candidates.length);
    const pick = Math.floor(Math.random() * topN);
    const best = candidates[pick];

    return { bombX: best.bombX, bombY: best.bombY, escapeX: best.escapeX, escapeY: best.escapeY };
  }

  private isValidBombSpot(grid: DangerCell[][], x: number, y: number): boolean {
    if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) return false;
    const cell = grid[y]?.[x];
    return cell !== undefined && cell.isWalkable && cell.dangerTime === Infinity;
  }

  private countAdjacentBlocks(grid: DangerCell[][], x: number, y: number): number {
    let count = 0;
    const neighbors = [
      grid[y - 1]?.[x],
      grid[y + 1]?.[x],
      grid[y]?.[x - 1],
      grid[y]?.[x + 1]
    ];

    for (const n of neighbors) {
      if (n && !n.isWalkable && n.hasDestructibleBlock) {
        count++;
      }
    }
    return count;
  }

  // Find escape route from a position after placing bomb there
  private findEscapeFrom(grid: DangerCell[][], bombX: number, bombY: number): { x: number; y: number } | null {
    const bombRange = this.player.bombRange;
    const playerSpeed = this.player.getEffectiveSpeed();
    const maxEscapeTime = BOMB_FUSE_TIME - 0.5; // Safety margin

    const escapeOptions: { x: number; y: number; dist: number; safety: number }[] = [];

    // Check each cardinal direction
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    for (const { dx, dy } of directions) {
      // Walk along this direction looking for escape
      for (let i = 1; i <= bombRange + 3; i++) {
        const checkX = bombX + dx * i;
        const checkY = bombY + dy * i;

        const cell = grid[checkY]?.[checkX];
        if (!cell || !cell.isWalkable) break; // Hit a wall

        // Check perpendicular directions for escape (blast doesn't turn corners!)
        const perpDirs = dx === 0
          ? [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }]
          : [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }];

        for (const perp of perpDirs) {
          const escapeX = checkX + perp.dx;
          const escapeY = checkY + perp.dy;
          const escapeCell = grid[escapeY]?.[escapeX];

          if (escapeCell && escapeCell.isWalkable && escapeCell.dangerTime === Infinity) {
            // This is a safe escape spot!
            const dist = i + 1; // Distance to reach this spot
            const timeNeeded = dist / playerSpeed;

            if (timeNeeded < maxEscapeTime) {
              escapeOptions.push({ x: escapeX, y: escapeY, dist, safety: 100 });
            }
          }
        }

        // Also check if we can escape by going past the bomb range in this direction
        if (i > bombRange) {
          const timeNeeded = i / playerSpeed;
          if (timeNeeded < maxEscapeTime && cell.dangerTime === Infinity) {
            escapeOptions.push({ x: checkX, y: checkY, dist: i, safety: 90 });
          }
        }
      }
    }

    if (escapeOptions.length === 0) return null;

    // Sort by distance (shorter is better since we want to escape quickly)
    escapeOptions.sort((a, b) => a.dist - b.dist);
    return { x: escapeOptions[0].x, y: escapeOptions[0].y };
  }

  private verifyEscapeRoute(
    grid: DangerCell[][],
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): boolean {
    // Simple check: is the escape target still safe and reachable?
    const targetCell = grid[toY]?.[toX];
    if (!targetCell || !targetCell.isWalkable || targetCell.dangerTime < Infinity) {
      return false;
    }

    // Check if path exists (simple line check)
    const dx = Math.sign(toX - fromX);
    const dy = Math.sign(toY - fromY);

    let x = fromX;
    let y = fromY;

    while (x !== toX || y !== toY) {
      if (x !== toX) x += dx;
      if (y !== toY) y += dy;

      const cell = grid[y]?.[x];
      if (!cell || !cell.isWalkable) return false;
    }

    return true;
  }

  // Find best escape direction when in danger
  private findBestEscapeDirection(grid: DangerCell[][], myX: number, myY: number): Direction | null {
    const directions = [
      { dir: Direction.UP, dx: 0, dy: -1 },
      { dir: Direction.DOWN, dx: 0, dy: 1 },
      { dir: Direction.LEFT, dx: -1, dy: 0 },
      { dir: Direction.RIGHT, dx: 1, dy: 0 }
    ];

    let bestDir: Direction | null = null;
    let bestScore = -Infinity;

    for (const { dir, dx, dy } of directions) {
      const nx = myX + dx;
      const ny = myY + dy;

      const cell = grid[ny]?.[nx];
      if (!cell || !cell.isWalkable) continue;

      let score = 0;

      // Strongly prefer completely safe cells
      if (cell.dangerTime === Infinity) {
        score += 10000;
      } else {
        // Prefer cells with more time
        score += cell.dangerTime * 100;
      }

      // Bonus for leading to more safe cells
      const safeNeighbors = this.countSafeNeighbors(grid, nx, ny);
      score += safeNeighbors * 500;

      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return bestDir;
  }

  private countSafeNeighbors(grid: DangerCell[][], x: number, y: number): number {
    let count = 0;
    const neighbors = [
      grid[y - 1]?.[x],
      grid[y + 1]?.[x],
      grid[y]?.[x - 1],
      grid[y]?.[x + 1]
    ];

    for (const n of neighbors) {
      if (n && n.isWalkable && n.dangerTime === Infinity) {
        count++;
      }
    }
    return count;
  }

  private findWanderDirection(grid: DangerCell[][], myX: number, myY: number): Direction | null {
    // Find direction toward nearest destructible block
    let bestDir: Direction | null = null;
    let bestScore = -Infinity;

    const directions = [
      { dir: Direction.UP, dx: 0, dy: -1 },
      { dir: Direction.DOWN, dx: 0, dy: 1 },
      { dir: Direction.LEFT, dx: -1, dy: 0 },
      { dir: Direction.RIGHT, dx: 1, dy: 0 }
    ];

    for (const { dir, dx, dy } of directions) {
      const nx = myX + dx;
      const ny = myY + dy;

      const cell = grid[ny]?.[nx];
      if (!cell || !cell.isWalkable || cell.dangerTime < Infinity) continue;

      let score = Math.random() * 10; // Base randomness

      // Bonus for cells near blocks
      const blockNeighbors = this.countAdjacentBlocks(grid, nx, ny);
      score += blockNeighbors * 20;

      // Bonus for cells with power-ups nearby
      if (cell.hasPowerUp) score += 50;

      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return bestDir;
  }

  private findNearbyPowerUp(
    grid: DangerCell[][],
    powerUps: PowerUp[],
    myX: number,
    myY: number
  ): { x: number; y: number } | null {
    let nearest: { x: number; y: number; dist: number } | null = null;

    for (const powerUp of powerUps) {
      if (!powerUp.isActive) continue;

      const px = powerUp.position.gridX;
      const py = powerUp.position.gridY;

      const cell = grid[py]?.[px];
      if (!cell || cell.dangerTime < Infinity) continue;

      const dist = Math.abs(px - myX) + Math.abs(py - myY);

      // Only pick up very close power-ups
      if (dist <= 3 && (!nearest || dist < nearest.dist)) {
        nearest = { x: px, y: py, dist };
      }
    }

    return nearest;
  }

  private moveToward(
    targetX: number,
    targetY: number,
    myX: number,
    myY: number,
    grid: DangerCell[][]
  ): Direction | null {
    const dx = targetX - myX;
    const dy = targetY - myY;

    // Determine preferred directions
    const preferredDirs: Direction[] = [];

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) preferredDirs.push(Direction.RIGHT);
      else if (dx < 0) preferredDirs.push(Direction.LEFT);
      if (dy > 0) preferredDirs.push(Direction.DOWN);
      else if (dy < 0) preferredDirs.push(Direction.UP);
    } else {
      if (dy > 0) preferredDirs.push(Direction.DOWN);
      else if (dy < 0) preferredDirs.push(Direction.UP);
      if (dx > 0) preferredDirs.push(Direction.RIGHT);
      else if (dx < 0) preferredDirs.push(Direction.LEFT);
    }

    // Try preferred directions first
    for (const dir of preferredDirs) {
      if (this.canMove(dir, myX, myY, grid)) {
        return dir;
      }
    }

    // Try any valid direction
    const allDirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
    for (const dir of allDirs) {
      if (this.canMove(dir, myX, myY, grid)) {
        return dir;
      }
    }

    return null;
  }

  private canMove(dir: Direction, myX: number, myY: number, grid: DangerCell[][]): boolean {
    let nx = myX;
    let ny = myY;

    switch (dir) {
      case Direction.UP: ny--; break;
      case Direction.DOWN: ny++; break;
      case Direction.LEFT: nx--; break;
      case Direction.RIGHT: nx++; break;
    }

    const cell = grid[ny]?.[nx];
    return cell !== undefined && cell.isWalkable;
  }

  private buildDangerGrid(
    blocks: Block[],
    bombs: Bomb[],
    explosions: Explosion[],
    powerUps: PowerUp[]
  ): DangerCell[][] {
    const grid: DangerCell[][] = [];

    // Initialize grid
    for (let y = 0; y < GRID_HEIGHT; y++) {
      grid[y] = [];
      for (let x = 0; x < GRID_WIDTH; x++) {
        grid[y][x] = {
          x,
          y,
          isWalkable: true,
          dangerTime: Infinity,
          hasBomb: false,
          hasPowerUp: false,
          hasDestructibleBlock: false
        };
      }
    }

    // Mark blocks
    for (const block of blocks) {
      if (!block.isActive) continue;
      const cell = grid[block.position.gridY]?.[block.position.gridX];
      if (cell) {
        cell.isWalkable = false;
        cell.hasDestructibleBlock = block.isDestructible;
      }
    }

    // Mark bombs and danger zones
    for (const bomb of bombs) {
      if (!bomb.isActive) continue;

      const bx = bomb.position.gridX;
      const by = bomb.position.gridY;
      const explodeTime = bomb.timer;

      if (grid[by]?.[bx]) {
        grid[by][bx].isWalkable = false;
        grid[by][bx].hasBomb = true;
        grid[by][bx].dangerTime = Math.min(grid[by][bx].dangerTime, explodeTime);
      }

      // Mark blast zones
      this.markBlastZone(grid, bx, by, bomb.range, explodeTime);
    }

    // Handle chain reactions
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 10) {
      changed = false;
      iterations++;

      for (const bomb of bombs) {
        if (!bomb.isActive) continue;

        const bombCell = grid[bomb.position.gridY]?.[bomb.position.gridX];
        if (!bombCell) continue;

        if (bombCell.dangerTime < bomb.timer) {
          const wasChanged = this.markBlastZone(grid, bomb.position.gridX, bomb.position.gridY, bomb.range, bombCell.dangerTime);
          if (wasChanged) changed = true;
        }
      }
    }

    // Mark active explosions
    for (const explosion of explosions) {
      if (!explosion.isActive) continue;

      for (const tile of explosion.tiles) {
        const cell = grid[tile.gridY]?.[tile.gridX];
        if (cell) {
          cell.dangerTime = 0;
        }
      }
    }

    // Mark power-ups
    for (const powerUp of powerUps) {
      if (!powerUp.isActive) continue;
      const cell = grid[powerUp.position.gridY]?.[powerUp.position.gridX];
      if (cell) {
        cell.hasPowerUp = true;
      }
    }

    return grid;
  }

  private markBlastZone(grid: DangerCell[][], bx: number, by: number, range: number, dangerTime: number): boolean {
    let changed = false;
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    for (const { dx, dy } of directions) {
      for (let i = 1; i <= range; i++) {
        const tx = bx + dx * i;
        const ty = by + dy * i;

        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

        const cell = grid[ty][tx];

        if (!cell.isWalkable && !cell.hasBomb) {
          if (cell.hasDestructibleBlock && cell.dangerTime > dangerTime) {
            cell.dangerTime = dangerTime;
            changed = true;
          }
          break;
        }

        if (cell.dangerTime > dangerTime) {
          cell.dangerTime = dangerTime;
          changed = true;
        }
      }
    }

    return changed;
  }

  getState(): { currentGoal: string; targetX: number; targetY: number } {
    return {
      currentGoal: this.state,
      targetX: this.currentPlan?.bombX ?? 0,
      targetY: this.currentPlan?.bombY ?? 0
    };
  }

  getDifficulty(): string {
    return this.difficulty;
  }
}
