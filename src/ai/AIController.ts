import {Player, BombType} from '../entities/Player';
import {Block} from '../entities/Block';
import {Bomb} from '../entities/Bomb';
import {PowerUp, PowerUpType} from '../entities/PowerUp';
import {Explosion} from '../entities/Explosion';
import {Direction, GRID_HEIGHT, GRID_WIDTH, EXPLOSION_DURATION, BOMB_FUSE_TIME, FIRE_LINGER_DURATION, MAX_BOMB_COUNT, MAX_BOMB_RANGE, MAX_SPEED} from '../constants';
import {Pathfinder, GridCell} from './Pathfinder';

interface DangerCell {
  x: number;
  y: number;
  isWalkable: boolean;
  dangerTime: number;
  dangerEndTime: number;      // When danger ends (for fire bomb lingering)
  bombType: BombType | null;  // Track bomb type causing danger
  hasBomb: boolean;
  hasPowerUp: boolean;
  hasDestructibleBlock: boolean;
}

// Cache of enemy abilities for tactical decisions
interface EnemyAbilityCache {
  hasKick: boolean;
  hasPunch: boolean;
  hasShield: boolean;
  hasTeleport: boolean;
  bombType: BombType;
}

interface DifficultySettings {
  reactionTime: number;
  minBombCooldown: number;
  attackRange: number; // How close to enemy before placing bomb
  // Strategic settings
  usePathfinding: boolean;
  usePrediction: boolean;
  strategicBlockSelection: boolean;
  trapLayingEnabled: boolean;
  areaControlEnabled: boolean;
  predictionAccuracy: number; // 0-1, how accurate enemy predictions are
}

const DIFFICULTY_PRESETS: Record<string, DifficultySettings> = {
  easy: {
    reactionTime: 0.3,
    minBombCooldown: 2.5,
    attackRange: 3,
    usePathfinding: false,
    usePrediction: false,
    strategicBlockSelection: false,
    trapLayingEnabled: false,
    areaControlEnabled: false,
    predictionAccuracy: 0,
  },
  medium: {
    reactionTime: 0.15,
    minBombCooldown: 1.5,
    attackRange: 4,
    usePathfinding: true,
    usePrediction: true,
    strategicBlockSelection: true,
    trapLayingEnabled: false,
    areaControlEnabled: false,
    predictionAccuracy: 0.6,
  },
  hard: {
    reactionTime: 0.08,
    minBombCooldown: 0.8,
    attackRange: 5,
    usePathfinding: true,
    usePrediction: true,
    strategicBlockSelection: true,
    trapLayingEnabled: true,
    areaControlEnabled: true,
    predictionAccuracy: 0.9,
  }
};

// Power-up priority scores for smart collection
const POWERUP_PRIORITIES: Record<PowerUpType, number> = {
  // HIGH (100+) - survival and core power
  [PowerUpType.SHIELD]: 150,
  [PowerUpType.FIRE_UP]: 120,
  [PowerUpType.BOMB_UP]: 110,

  // MEDIUM (50-99) - useful abilities
  [PowerUpType.SPEED_UP]: 80,
  [PowerUpType.KICK]: 70,
  [PowerUpType.PUNCH]: 65,
  [PowerUpType.FIRE_BOMB]: 60,
  [PowerUpType.ICE_BOMB]: 55,
  [PowerUpType.PIERCING_BOMB]: 50,

  // LOW (1-49)
  [PowerUpType.TELEPORT]: 30,

  // AVOID - harmful
  [PowerUpType.SKULL]: -100,
};

export class AIController {
  private player: Player;
  private difficulty: 'easy' | 'medium' | 'hard';
  private settings: DifficultySettings;
  private lastDecisionTime: number = 0;
  private lastBombTime: number = -10;
  private lastDirection: Direction | null = null;
  private committedEscapeDirection: Direction | null = null; // Direction committed to after placing bomb
  private escapeCommitTime: number = -10; // When we committed to escape direction

  // Enemy ability tracking
  private enemyAbilities: Map<number, EnemyAbilityCache> = new Map();

  // Pathfinding state
  private currentPath: { x: number; y: number }[] | null = null;
  private pathTargetX: number = -1;
  private pathTargetY: number = -1;
  private pathRecalculateTime: number = 0;

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
    // Rate limit decisions
    const shouldThink = currentTime - this.lastDecisionTime >= this.settings.reactionTime;
    if (!shouldThink) {
      // Continue moving in the last decided direction for smooth movement
      return {direction: this.lastDirection, placeBomb: false};
    }
    this.lastDecisionTime = currentTime;

    // Update enemy ability tracking for tactical decisions
    this.updateEnemyAbilities(players);

    const grid = this.buildDangerGrid(blocks, bombs, explosions, powerUps);

    // Get kick/punch threat zones for medium/hard difficulty
    let kickThreats: Set<string> = new Set();
    let punchThreats: Set<string> = new Set();
    if (this.difficulty === 'hard' || this.difficulty === 'medium') {
      kickThreats = this.getKickThreatZones(bombs, players, grid);
      punchThreats = this.getPunchThreatZones(bombs, players, grid);
    }
    const myX = this.player.position.gridX;
    const myY = this.player.position.gridY;
    const myCell = grid[myY]?.[myX];

    // Check if we're in a kick/punch threat zone (enemies might send bombs our way)
    const myKey = `${myX},${myY}`;
    const inKickThreat = kickThreats.has(myKey);
    const inPunchThreat = punchThreats.has(myKey);

    // PRIORITY 1: Escape from danger (check FIRST, even during commitment!)
    // If we're in danger, we MUST escape - commitment can't block this
    // Also escape if in kick/punch threat zones (medium/hard difficulty)
    if (myCell && (myCell.dangerTime < Infinity || inKickThreat || inPunchThreat)) {
      const escapeDir = this.findSafeDirection(grid, myX, myY);
      this.lastDirection = escapeDir;

      // If we were committed but still in danger, the commitment was wrong - clear it
      if (this.committedEscapeDirection !== null) {
        this.committedEscapeDirection = null;
      }

      return {direction: escapeDir, placeBomb: false};
    }

    // PRIORITY 2: If we're committed to an escape direction and NOW SAFE, continue escaping
    // This prevents flip-flopping after successfully escaping the immediate danger
    const escapeCommitDuration = 3.5 / (this.player.getEffectiveSpeed() / 3); // Scale with speed
    if (this.committedEscapeDirection !== null &&
        currentTime - this.escapeCommitTime < escapeCommitDuration) {
      // We're safe now, but continue moving away to avoid re-entering danger
      this.lastDirection = this.committedEscapeDirection;
      return {direction: this.committedEscapeDirection, placeBomb: false};
    }

    // If commitment expired, clear it
    if (this.committedEscapeDirection !== null &&
        currentTime - this.escapeCommitTime >= escapeCommitDuration) {
      this.committedEscapeDirection = null;
    }

    // PRIORITY 3: Collect HIGH-VALUE power-ups (SHIELD, FIRE_UP, BOMB_UP) before attacking
    // These are valuable enough to prioritize over combat
    const highPriorityPowerUp = this.findHighPriorityPowerUp(grid, powerUps, myX, myY);
    if (highPriorityPowerUp) {
      const dir = this.getMoveTowardDirection(highPriorityPowerUp.x, highPriorityPowerUp.y, myX, myY, grid, currentTime);
      this.lastDirection = dir;
      return {direction: dir, placeBomb: false};
    }

    // PRIORITY 4: Try to attack nearby enemies
    const nearestEnemy = this.findNearestEnemy(players, myX, myY);
    const canPlaceBomb = this.player.canPlaceBomb() &&
      (currentTime - this.lastBombTime) > this.settings.minBombCooldown;
    const hasPathToEnemy = this.hasPathToEnemy(grid, nearestEnemy, myX, myY);

    // CRITICAL: Only consider placing bombs if we're currently in a safe location
    const isCurrentlySafe = myCell && myCell.dangerTime === Infinity;

    if (nearestEnemy && canPlaceBomb && hasPathToEnemy && isCurrentlySafe) {
      // Determine target position (current or predicted)
      let targetX = nearestEnemy.position.gridX;
      let targetY = nearestEnemy.position.gridY;

      // For medium/hard: predict where enemy will be when bomb explodes
      if (this.settings.usePrediction && Math.random() < this.settings.predictionAccuracy) {
        const prediction = this.predictEnemyPosition(nearestEnemy, BOMB_FUSE_TIME, grid);
        targetX = prediction.x;
        targetY = prediction.y;
      }

      // Check if target position is in blast line
      const targetInBlastLine = this.isTargetInBlastLine(
        myX,
        myY,
        targetX,
        targetY,
        this.player.bombRange,
        grid
      );

      // If target is in blast line and we can escape after placing bomb
      if (targetInBlastLine) {
        const escapeDir = this.findEscapeDirectionAfterBomb(grid, myX, myY);
        if (escapeDir !== null) {
          this.lastBombTime = currentTime;
          this.lastDirection = escapeDir;
          this.committedEscapeDirection = escapeDir;
          this.escapeCommitTime = currentTime;
          return {direction: escapeDir, placeBomb: true};
        }
      }

      // For hard mode: try to set a trap by moving to cut off escape routes
      if (this.settings.trapLayingEnabled && !targetInBlastLine) {
        const trapPos = this.findTrapPosition(nearestEnemy, grid, myX, myY);
        if (trapPos) {
          const dir = this.getMoveTowardDirection(trapPos.x, trapPos.y, myX, myY, grid, currentTime);
          if (dir !== null) {
            this.lastDirection = dir;
            return {direction: dir, placeBomb: false};
          }
        }
      }
    }

    // PRIORITY 4: Look for destructible blocks to bomb
    if (canPlaceBomb && isCurrentlySafe) {
      const nearbyBlocks = this.countNearbyDestructibleBlocks(grid, myX, myY);
      if (nearbyBlocks > 0) {
        // First check if we can find a valid escape direction
        const escapeDir = this.findEscapeDirectionAfterBomb(grid, myX, myY);
        // Only place bomb if we found a valid escape route
        if (escapeDir !== null) {
          this.lastBombTime = currentTime;
          this.lastDirection = escapeDir;
          // COMMIT to this escape direction - don't reconsider until safe!
          this.committedEscapeDirection = escapeDir;
          this.escapeCommitTime = currentTime;
          console.log(this.player.playerIndex + ", bomb placed, escape direction: " + escapeDir)
          return {direction: escapeDir, placeBomb: true};
        }
      }
    }

    // PRIORITY 5: Move toward power-ups
    const nearbyPowerUp = this.findNearbyPowerUp(grid, powerUps, myX, myY);
    if (nearbyPowerUp) {
      const dir = this.getMoveTowardDirection(nearbyPowerUp.x, nearbyPowerUp.y, myX, myY, grid, currentTime);
      this.lastDirection = dir;
      return {direction: dir, placeBomb: false};
    }

    // PRIORITY 6: Move toward enemies or blocks
    if (nearestEnemy) {
      const dir = this.getMoveTowardDirection(
        nearestEnemy.position.gridX,
        nearestEnemy.position.gridY,
        myX, myY, grid, currentTime
      );
      this.lastDirection = dir;
      return {direction: dir, placeBomb: false};
    }

    // PRIORITY 7: Move toward best strategic block (or nearest for easy mode)
    const targetBlock = this.settings.strategicBlockSelection
      ? this.findBestStrategicBlock(blocks, myX, myY, grid, players)
      : this.findNearestDestructibleBlock(blocks, myX, myY);
    if (targetBlock) {
      const dir = this.getMoveTowardDirection(
        targetBlock.position.gridX,
        targetBlock.position.gridY,
        myX, myY, grid, currentTime
      );
      this.lastDirection = dir;
      return {direction: dir, placeBomb: false};
    }

    // PRIORITY 8: Wander randomly (avoid going back)
    const wanderDir = this.getRandomSafeDirection(grid, myX, myY);
    this.lastDirection = wanderDir;
    return {direction: wanderDir, placeBomb: false};
  }

  // Check if a target position is in the blast line of a bomb placed at (bombX, bombY)
  // Bombs only explode in straight lines (4 cardinal directions), not diagonally
  private isTargetInBlastLine(
    bombX: number,
    bombY: number,
    targetX: number,
    targetY: number,
    bombRange: number,
    grid: DangerCell[][]
  ): boolean {
    // Target must be on same row OR same column (not diagonal)
    const sameRow = bombY === targetY;
    const sameCol = bombX === targetX;

    if (!sameRow && !sameCol) {
      return false; // Diagonal - not in blast line
    }

    const directions = [
      {dx: 0, dy: -1},  // UP
      {dx: 0, dy: 1},   // DOWN
      {dx: -1, dy: 0},  // LEFT
      {dx: 1, dy: 0}    // RIGHT
    ];

    // Check each direction
    for (const {dx, dy} of directions) {
      for (let i = 1; i <= bombRange; i++) {
        const tx = bombX + dx * i;
        const ty = bombY + dy * i;

        // Found the target!
        if (tx === targetX && ty === targetY) {
          return true;
        }

        // Hit a wall or obstacle - blast stops here
        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;
        const cell = grid[ty]?.[tx];
        if (!cell || !cell.isWalkable) break;
      }
    }

    return false;
  }

  // Find nearest alive enemy
  private findNearestEnemy(players: Player[], myX: number, myY: number): Player | null {
    let nearest: Player | null = null;
    let minDist = Infinity;

    for (const player of players) {
      if (player === this.player || !player.isPlayerAlive()) continue;

      const dist = Math.abs(player.position.gridX - myX) +
        Math.abs(player.position.gridY - myY);
      if (dist < minDist) {
        minDist = dist;
        nearest = player;
      }
    }

    return nearest;
  }

  private hasPathToEnemy(grid: DangerCell[][], enemy: Player | null, myX: number, myY: number): boolean {
    if (!enemy) return false;

    const queue: DangerCell[] = [grid[myY][myX]];
    const marked = new Set<string>();
    marked.add(`${myX},${myY}`);
    const directions = [
      {dx: 0, dy: -1},
      {dx: 0, dy: 1},
      {dx: -1, dy: 0},
      {dx: 1, dy: 0}
    ];

    while (queue.length > 0) {
      // Mark all cells that will be dangerous
      const cell = queue.pop();
      if (!cell) continue;
      for (const {dx, dy} of directions) {
        const tx = cell.x + dx;
        const ty = cell.y + dy;
        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) continue;
        if (tx === enemy.position.gridX && ty === enemy.position.gridY) {
          return true;
        }
        const nextCell = grid[ty]?.[tx];
        if (!nextCell || !nextCell.isWalkable) continue;
        if (!marked.has(`${tx},${ty}`)) {
          queue.push(nextCell);
          marked.add(`${tx},${ty}`);
        }
      }
    }
    return false;
  }

  // Find direction that leads to safety (away from danger)
  private findSafeDirection(grid: DangerCell[][], myX: number, myY: number): Direction | null {
    const directions = [
      {dir: Direction.UP, dx: 0, dy: -1},
      {dir: Direction.DOWN, dx: 0, dy: 1},
      {dir: Direction.LEFT, dx: -1, dy: 0},
      {dir: Direction.RIGHT, dx: 1, dy: 0}
    ];

    // IMPORTANT: Prefer continuing in the current direction to avoid flip-flopping
    // Check if lastDirection is still safe AND doesn't lead to dead-end
    if (this.lastDirection !== null) {
      const lastDirInfo = directions.find(d => d.dir === this.lastDirection);
      if (lastDirInfo) {
        const nx = myX + lastDirInfo.dx;
        const ny = myY + lastDirInfo.dy;
        const cell = grid[ny]?.[nx];

        // If current direction is still safe and leads to open space, commit to it
        if (cell && cell.isWalkable) {
          console.log(this.player.playerIndex + " checking direction " + lastDirInfo.dir + " safety")
          if (this.directionLeadsToSafety(grid, nx, ny)) {
            console.log(this.player.playerIndex + " direction " + lastDirInfo.dir + " still lead to safety");
            return this.lastDirection;
          }
        }
      }
    }

    // Otherwise, try to find a completely safe direction that doesn't lead to dead-end
    for (const {dir, dx, dy} of directions) {
      const nx = myX + dx;
      const ny = myY + dy;
      const cell = grid[ny]?.[nx];

      if (cell && cell.isWalkable && cell.dangerTime === Infinity) {
        // Verify this direction leads to open space, not a dead-end
        console.log(this.player.playerIndex + " want to go to: " + nx + "," + ny + " checking if safe")
        if (this.directionLeadsToSafety(grid, nx, ny)) {
          console.log(this.player.playerIndex + " direction " + this.lastDirection + " does not lead to safety, changed direction to: " + dir);
          return dir;
        }
      }
    }

    // If no direction leads to sustained safety, try any safe immediate cell
    // (maybe we can still escape even from a tight spot)
    for (const {dir, dx, dy} of directions) {
      const nx = myX + dx;
      const ny = myY + dy;
      const cell = grid[ny]?.[nx];

      if (cell && cell.isWalkable && cell.dangerTime === Infinity) {
        return dir;
      }
    }

    // If no safe direction, find the one with most time remaining
    let bestDir: Direction | null = null;
    let bestTime = -Infinity;

    for (const {dir, dx, dy} of directions) {
      const nx = myX + dx;
      const ny = myY + dy;
      const cell = grid[ny]?.[nx];

      if (cell && cell.isWalkable && cell.dangerTime > bestTime) {
        bestTime = cell.dangerTime;
        bestDir = dir;
      }
    }

    return bestDir;
  }

  // Find the best escape direction AFTER placing a bomb at current position
  // Uses BFS to match the logic in canEscapeAfterBomb
  private findEscapeDirectionAfterBomb(grid: DangerCell[][], bombX: number, bombY: number): Direction | null {
    const bombRange = this.player.bombRange;

    // Simulate bomb danger zone (same as canEscapeAfterBomb)
    const dangerZone = new Set<string>();
    dangerZone.add(`${bombX},${bombY}`);

    const directions = [
      {dir: Direction.UP, dx: 0, dy: -1},
      {dir: Direction.DOWN, dx: 0, dy: 1},
      {dir: Direction.LEFT, dx: -1, dy: 0},
      {dir: Direction.RIGHT, dx: 1, dy: 0}
    ];

    // Mark all cells in blast range as dangerous
    for (const {dx, dy} of directions) {
      for (let i = 1; i <= bombRange; i++) {
        const tx = bombX + dx * i;
        const ty = bombY + dy * i;

        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

        const cell = grid[ty]?.[tx];
        if (!cell || !cell.isWalkable) break;
        dangerZone.add(`${tx},${ty}`);
      }
    }

    // For each of the 4 initial directions, use BFS to see how many safe cells are reachable
    let bestDir: Direction | null = null;
    let bestSafeCells = 0;
    let bestX = 0;
    let bestY = 0;

    for (const {dir, dx, dy} of directions) {
      const firstX = bombX + dx;
      const firstY = bombY + dy;

      // Check if we can even move in this direction
      if (firstX < 0 || firstX >= GRID_WIDTH || firstY < 0 || firstY >= GRID_HEIGHT) continue;
      const firstCell = grid[firstY]?.[firstX];
      if (!firstCell || !firstCell.isWalkable) continue;

      // Use BFS starting from this first cell to count reachable safe cells
      // The first cell CAN be in the danger zone - we just need to reach safety eventually
      const safeCellsReachable = this.countReachableSafeCellsFromDirection(
        grid,
        firstX,
        firstY,
        dangerZone,
        bombX,
        bombY
      );

      // Pick the direction that leads to the most safe cells
      // CRITICAL: Only consider directions that actually lead to at least 1 safe cell
      if (safeCellsReachable > 0 && safeCellsReachable > bestSafeCells) {
        bestSafeCells = safeCellsReachable;
        bestDir = dir;
        bestX = firstX;
        bestY = firstY;
      }
    }

    console.log(this.player.playerIndex + " chose escape direction " + bestDir + ", cords: " + bestX + "," + bestY);
    // Return null if no direction leads to safety
    return bestDir;
  }

  // Count how many safe cells are reachable via BFS from a starting position
  // FIXED: Now accounts for time - only considers cells reachable before bomb explodes
  private countReachableSafeCellsFromDirection(
    grid: DangerCell[][],
    startX: number,
    startY: number,
    dangerZone: Set<string>,
    bombX: number,
    bombY: number
  ): number {
    const directions = [
      {dx: 0, dy: -1},
      {dx: 0, dy: 1},
      {dx: -1, dy: 0},
      {dx: 1, dy: 0}
    ];

    // FIXED: Calculate maximum reachable distance based on player speed and bomb timer
    // Bomb explodes in 3 seconds, use 2.5 second safety margin
    const safetyTime = 2.5;
    const playerSpeed = this.player.getEffectiveSpeed(); // tiles per second
    const maxReachableDistance = Math.floor(playerSpeed * safetyTime);

    const queue: {x: number; y: number; dist: number}[] = [{x: startX, y: startY, dist: 0}];
    const visited = new Set<string>();
    visited.add(`${startX},${startY}`);
    let safeCellsFound = 0;

    // BFS to explore reachable cells within time constraint
    while (queue.length > 0 && visited.size < 150) {
      const {x, y, dist} = queue.shift()!;

      for (const {dx, dy} of directions) {
        const nx = x + dx;
        const ny = y + dy;
        const newDist = dist + 1;

        if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;

        const cell = grid[ny]?.[nx];
        if (!cell || !cell.isWalkable) continue;
        if (visited.has(`${nx},${ny}`)) continue;

        // CRITICAL: Don't path through the bomb location itself!
        if (nx === bombX && ny === bombY) continue;

        // FIXED: Only consider cells we can actually reach in time
        if (newDist > maxReachableDistance) continue;

        visited.add(`${nx},${ny}`);

        // Check if this cell is safe
        const isSafeFromNewBomb = !dangerZone.has(`${nx},${ny}`);
        const isSafeFromExisting = cell.dangerTime === Infinity;

        if (isSafeFromNewBomb && isSafeFromExisting) {
          safeCellsFound++;
          // Found enough safe cells to be confident this is a good escape route
          if (safeCellsFound >= 3) {
            return safeCellsFound;
          }
        }

        // Continue searching through walkable cells (even if dangerous)
        // to find all reachable safe areas
        queue.push({x: nx, y: ny, dist: newDist});
      }
    }

    return safeCellsFound;
  }

  // Check if there is a path from the given position to a safe cell
  // The starting cell itself might be dangerous, but as long as we can reach safety, return true
  // Even dead-end cells can be safe - we just need to verify safety is reachable
  private directionLeadsToSafety(grid: DangerCell[][], startX: number, startY: number): boolean {
    const cell = grid[startY]?.[startX];
    if (!cell || !cell.isWalkable) {
      return false; // Can't path through non-walkable cells
    }

    // If the current cell is already safe, great!
    if (cell.dangerTime === Infinity) {
      return true;
    }

    // Current cell is dangerous, but check if we can reach a safe cell from here
    const directions = [
      {dx: 0, dy: -1},
      {dx: 0, dy: 1},
      {dx: -1, dy: 0},
      {dx: 1, dy: 0}
    ];

    const queue: {x: number; y: number; dist: number}[] = [{x: startX, y: startY, dist: 0}];
    const visited = new Set<string>();
    visited.add(`${startX},${startY}`);

    // Search for any safe cell reachable within reasonable distance
    const maxSearchDepth = 8; // Search up to 8 tiles away

    while (queue.length > 0) {
      const {x, y, dist} = queue.shift()!;

      // Don't search too far
      if (dist >= maxSearchDepth) continue;

      for (const {dx, dy} of directions) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;

        const nextCell = grid[ny]?.[nx];
        if (!nextCell || !nextCell.isWalkable) continue;
        if (visited.has(`${nx},${ny}`)) continue;

        visited.add(`${nx},${ny}`);

        // Found a safe cell! This direction leads to safety
        if (nextCell.dangerTime === Infinity) {
          console.log(this.player.playerIndex + " safe cell found: " + nextCell.x + "," + nextCell.y);
          return true;
        }

        // Continue searching through dangerous cells to find safe ones
        queue.push({x: nx, y: ny, dist: dist + 1});
      }
    }

    console.log(this.player.playerIndex + " safe cell not found");
    // Couldn't find any safe cell reachable from this position
    return false;
  }

  // Count destructible blocks near a position
  private countNearbyDestructibleBlocks(grid: DangerCell[][], x: number, y: number): number {
    let count = 0;
    const range = this.player.bombRange;

    const directions = [
      {dx: 0, dy: -1},
      {dx: 0, dy: 1},
      {dx: -1, dy: 0},
      {dx: 1, dy: 0}
    ];

    for (const {dx, dy} of directions) {
      for (let i = 1; i <= range; i++) {
        const tx = x + dx * i;
        const ty = y + dy * i;

        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

        const cell = grid[ty]?.[tx];
        if (!cell) break;

        if (!cell.isWalkable) {
          if (cell.hasDestructibleBlock) count++;
          break;
        }
      }
    }

    return count;
  }

  // Get direction to move toward a target
  private getMoveTowardDirection(
    targetX: number,
    targetY: number,
    myX: number,
    myY: number,
    grid: DangerCell[][],
    currentTime: number = 0
  ): Direction | null {
    // For medium/hard difficulty: use A* pathfinding
    if (this.settings.usePathfinding && this.needsNewPath(targetX, targetY, currentTime)) {
      const pathGrid = this.convertToPathfinderGrid(grid);
      this.currentPath = Pathfinder.findPath(myX, myY, targetX, targetY, pathGrid);
      this.pathTargetX = targetX;
      this.pathTargetY = targetY;
      this.pathRecalculateTime = currentTime;
    }

    // Try to follow the path if we have one
    if (this.settings.usePathfinding && this.currentPath && this.currentPath.length > 0) {
      const pathDir = this.followPath(myX, myY);
      if (pathDir !== null && this.canMoveSafely(pathDir, myX, myY, grid)) {
        return pathDir;
      }
      // Path is blocked, clear it and fall back to greedy
      this.currentPath = null;
    }

    // Greedy fallback (always used for easy, fallback for medium/hard)
    return this.greedyMoveToward(targetX, targetY, myX, myY, grid);
  }

  // Greedy movement toward target (original logic)
  private greedyMoveToward(
    targetX: number,
    targetY: number,
    myX: number,
    myY: number,
    grid: DangerCell[][]
  ): Direction | null {
    const dx = targetX - myX;
    const dy = targetY - myY;

    // Try horizontal first if further horizontally
    const directions: Direction[] = [];

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) directions.push(Direction.RIGHT);
      else if (dx < 0) directions.push(Direction.LEFT);

      if (dy > 0) directions.push(Direction.DOWN);
      else if (dy < 0) directions.push(Direction.UP);
    } else {
      if (dy > 0) directions.push(Direction.DOWN);
      else if (dy < 0) directions.push(Direction.UP);

      if (dx > 0) directions.push(Direction.RIGHT);
      else if (dx < 0) directions.push(Direction.LEFT);
    }

    // Try preferred directions
    for (const dir of directions) {
      if (this.canMoveSafely(dir, myX, myY, grid)) {
        return dir;
      }
    }

    // Try any safe direction (avoid being stuck)
    const allDirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
    for (const dir of allDirs) {
      if (this.canMoveSafely(dir, myX, myY, grid)) {
        return dir;
      }
    }

    return null;
  }

  // Get a random safe direction (for wandering)
  private getRandomSafeDirection(grid: DangerCell[][], myX: number, myY: number): Direction | null {
    const allDirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
    const safeDirs: Direction[] = [];

    const oppositeDir = this.getOppositeDirection(this.lastDirection);

    for (const dir of allDirs) {
      if (this.canMoveSafely(dir, myX, myY, grid)) {
        // Prefer not going back where we came from
        if (dir === oppositeDir) {
          safeDirs.push(dir); // Add once
        } else {
          safeDirs.push(dir);
          safeDirs.push(dir); // Add twice (higher weight)
        }
      }
    }

    if (safeDirs.length === 0) return null;

    return safeDirs[Math.floor(Math.random() * safeDirs.length)];
  }

  private getOppositeDirection(dir: Direction | null): Direction | null {
    if (!dir) return null;
    switch (dir) {
      case Direction.UP:
        return Direction.DOWN;
      case Direction.DOWN:
        return Direction.UP;
      case Direction.LEFT:
        return Direction.RIGHT;
      case Direction.RIGHT:
        return Direction.LEFT;
    }
  }

  // Check if we can move in a direction safely
  private canMoveSafely(dir: Direction, myX: number, myY: number, grid: DangerCell[][]): boolean {
    let nx = myX;
    let ny = myY;

    switch (dir) {
      case Direction.UP:
        ny--;
        break;
      case Direction.DOWN:
        ny++;
        break;
      case Direction.LEFT:
        nx--;
        break;
      case Direction.RIGHT:
        nx++;
        break;
    }

    const cell = grid[ny]?.[nx];
    return cell !== undefined && cell.isWalkable && cell.dangerTime === Infinity;
  }

  // Find nearest destructible block
  private findNearestDestructibleBlock(blocks: Block[], myX: number, myY: number): Block | null {
    let nearest: Block | null = null;
    let minDist = Infinity;

    for (const block of blocks) {
      if (!block.isActive || !block.isDestructible) continue;

      const dist = Math.abs(block.position.gridX - myX) +
        Math.abs(block.position.gridY - myY);
      if (dist < minDist) {
        minDist = dist;
        nearest = block;
      }
    }

    return nearest;
  }


  private findNearbyPowerUp(
    grid: DangerCell[][],
    powerUps: PowerUp[],
    myX: number,
    myY: number
  ): { x: number; y: number } | null {
    let bestPowerUp: { x: number; y: number; score: number } | null = null;

    for (const powerUp of powerUps) {
      if (!powerUp.isActive) continue;

      const px = powerUp.position.gridX;
      const py = powerUp.position.gridY;

      // Skip if in danger
      const cell = grid[py]?.[px];
      if (!cell || cell.dangerTime < Infinity) continue;

      const dist = Math.abs(px - myX) + Math.abs(py - myY);

      // Get base priority for this power-up type
      const basePriority = POWERUP_PRIORITIES[powerUp.type] ?? 0;

      // Skip SKULL power-ups entirely (negative priority)
      if (basePriority < 0) continue;

      // Extend search range for high priority items
      const maxRange = basePriority >= 100 ? 10 : 6;
      if (dist > maxRange) continue;

      // Calculate score: priority / distance (with minimum distance of 1)
      let score = basePriority / Math.max(1, dist);

      // Context-aware adjustments
      // If we already have shield, deprioritize another
      if (powerUp.type === PowerUpType.SHIELD && this.player.hasShield()) {
        score *= 0.3;
      }

      // If we already have kick, deprioritize another
      if (powerUp.type === PowerUpType.KICK && this.player.hasAbility('kick')) {
        score *= 0.2;
      }

      // If we already have punch, deprioritize another
      if (powerUp.type === PowerUpType.PUNCH && this.player.hasAbility('punch')) {
        score *= 0.2;
      }

      // If we already have teleport, deprioritize another
      if (powerUp.type === PowerUpType.TELEPORT && this.player.hasAbility('teleport')) {
        score *= 0.3;
      }

      // At no shield, heavily prioritize getting one
      if (powerUp.type === PowerUpType.SHIELD && !this.player.hasShield()) {
        score *= 1.5;
      }

      // If at max bombs, deprioritize BOMB_UP
      if (powerUp.type === PowerUpType.BOMB_UP && this.player.maxBombs >= MAX_BOMB_COUNT) {
        score *= 0.1;
      }

      // If at max range, deprioritize FIRE_UP
      if (powerUp.type === PowerUpType.FIRE_UP && this.player.bombRange >= MAX_BOMB_RANGE) {
        score *= 0.1;
      }

      // If at max speed, deprioritize SPEED_UP
      if (powerUp.type === PowerUpType.SPEED_UP && this.player.speed >= MAX_SPEED) {
        score *= 0.1;
      }

      if (!bestPowerUp || score > bestPowerUp.score) {
        bestPowerUp = { x: px, y: py, score };
      }
    }

    return bestPowerUp;
  }

  // Find high-priority power-ups that are worth prioritizing over combat
  private findHighPriorityPowerUp(
    grid: DangerCell[][],
    powerUps: PowerUp[],
    myX: number,
    myY: number
  ): { x: number; y: number } | null {
    const HIGH_PRIORITY_THRESHOLD = 100; // SHIELD=150, FIRE_UP=120, BOMB_UP=110
    const MAX_RANGE = 4; // Only go for nearby high-priority items

    let bestPowerUp: { x: number; y: number; score: number } | null = null;

    for (const powerUp of powerUps) {
      if (!powerUp.isActive) continue;

      const px = powerUp.position.gridX;
      const py = powerUp.position.gridY;

      // Skip if in danger
      const cell = grid[py]?.[px];
      if (!cell || cell.dangerTime < Infinity) continue;

      const dist = Math.abs(px - myX) + Math.abs(py - myY);
      if (dist > MAX_RANGE) continue;

      // Get base priority for this power-up type
      const basePriority = POWERUP_PRIORITIES[powerUp.type] ?? 0;

      // Only consider high-priority power-ups
      if (basePriority < HIGH_PRIORITY_THRESHOLD) continue;

      // Calculate score with context awareness
      let score = basePriority / Math.max(1, dist);

      // Skip if we already have this at max
      if (powerUp.type === PowerUpType.SHIELD && this.player.hasShield()) {
        continue; // Already have shield, don't prioritize another
      }
      if (powerUp.type === PowerUpType.BOMB_UP && this.player.maxBombs >= MAX_BOMB_COUNT) {
        continue;
      }
      if (powerUp.type === PowerUpType.FIRE_UP && this.player.bombRange >= MAX_BOMB_RANGE) {
        continue;
      }

      // Extra priority for SHIELD when we don't have one
      if (powerUp.type === PowerUpType.SHIELD && !this.player.hasShield()) {
        score *= 2.0;
      }

      if (!bestPowerUp || score > bestPowerUp.score) {
        bestPowerUp = { x: px, y: py, score };
      }
    }

    return bestPowerUp;
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
          dangerEndTime: Infinity,
          bombType: null,
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
      const bombType = bomb.type;

      // Calculate danger duration based on bomb type
      let dangerDuration = EXPLOSION_DURATION;
      if (bombType === BombType.FIRE) {
        dangerDuration += FIRE_LINGER_DURATION; // Fire bombs linger 2.5s total
      }

      if (grid[by]?.[bx]) {
        grid[by][bx].isWalkable = false;
        grid[by][bx].hasBomb = true;
        grid[by][bx].bombType = bombType;
        grid[by][bx].dangerTime = Math.min(grid[by][bx].dangerTime, explodeTime);
        grid[by][bx].dangerEndTime = Math.min(grid[by][bx].dangerEndTime, explodeTime + dangerDuration);
      }

      // Mark blast zones with bomb type awareness
      this.markBlastZone(grid, bx, by, bomb.range, explodeTime, bombType);
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
          const wasChanged = this.markBlastZone(grid, bomb.position.gridX, bomb.position.gridY, bomb.range, bombCell.dangerTime, bomb.type);
          if (wasChanged) changed = true;
        }
      }
    }

    // Mark active explosions with their remaining duration
    for (const explosion of explosions) {
      if (!explosion.isActive) continue;

      // Calculate remaining explosion time (how long flames will last)
      const explosionProgress = explosion.getProgress(); // 0 to 1 (0 = just started, 1 = finished)
      const remainingTime = 0.05 + EXPLOSION_DURATION * (1 - explosionProgress);

      for (const tile of explosion.tiles) {
        const cell = grid[tile.gridY]?.[tile.gridX];
        if (cell) {
          // Mark as dangerous for the remaining duration of the explosion
          cell.dangerTime = Math.min(cell.dangerTime, remainingTime);
        }
      }
    }

    // Mark power-ups (and avoid SKULL - treat as dangerous!)
    for (const powerUp of powerUps) {
      if (!powerUp.isActive) continue;
      const cell = grid[powerUp.position.gridY]?.[powerUp.position.gridX];
      if (cell) {
        cell.hasPowerUp = true;

        // SKULL power-ups are dangerous - AI should avoid them!
        if (powerUp.type === PowerUpType.SKULL) {
          cell.dangerTime = 0; // Mark as immediately dangerous
          cell.dangerEndTime = Infinity; // Stays dangerous forever (until collected)
        }
      }
    }

    return grid;
  }

  private markBlastZone(
    grid: DangerCell[][],
    bx: number,
    by: number,
    range: number,
    dangerTime: number,
    bombType: BombType = BombType.NORMAL
  ): boolean {
    let changed = false;
    const directions = [
      {dx: 0, dy: -1},
      {dx: 0, dy: 1},
      {dx: -1, dy: 0},
      {dx: 1, dy: 0}
    ];

    // Calculate danger end time based on bomb type
    let dangerDuration = EXPLOSION_DURATION;
    if (bombType === BombType.FIRE) {
      dangerDuration += FIRE_LINGER_DURATION; // Fire bombs linger 2.5s total
    }
    const dangerEndTime = dangerTime + dangerDuration;

    for (const {dx, dy} of directions) {
      for (let i = 1; i <= range; i++) {
        const tx = bx + dx * i;
        const ty = by + dy * i;

        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

        const cell = grid[ty][tx];

        if (!cell.isWalkable && !cell.hasBomb) {
          if (cell.hasDestructibleBlock) {
            // Mark destructible block as dangerous
            if (cell.dangerTime > dangerTime) {
              cell.dangerTime = dangerTime;
              cell.dangerEndTime = Math.min(cell.dangerEndTime, dangerEndTime);
              cell.bombType = bombType;
              changed = true;
            }
            // PIERCING bombs continue through destructible blocks!
            if (bombType !== BombType.PIERCING) {
              break;
            }
            // For piercing, continue to next tile
          } else {
            // Indestructible wall - always stops
            break;
          }
        } else {
          // Walkable cell or bomb cell
          if (cell.dangerTime > dangerTime) {
            cell.dangerTime = dangerTime;
            cell.dangerEndTime = Math.min(cell.dangerEndTime, dangerEndTime);
            cell.bombType = bombType;
            changed = true;
          }
        }
      }
    }

    return changed;
  }

  // Update cache of enemy abilities for tactical decisions
  private updateEnemyAbilities(players: Player[]): void {
    for (const player of players) {
      if (player === this.player || !player.isPlayerAlive()) continue;

      this.enemyAbilities.set(player.playerIndex, {
        hasKick: player.hasAbility('kick'),
        hasPunch: player.hasAbility('punch'),
        hasShield: player.hasShield(),
        hasTeleport: player.hasAbility('teleport'),
        bombType: player.bombType
      });
    }
  }

  // Get tiles threatened by enemies with kick ability
  private getKickThreatZones(bombs: Bomb[], players: Player[], grid: DangerCell[][]): Set<string> {
    const threatZones = new Set<string>();

    for (const player of players) {
      if (player === this.player || !player.isPlayerAlive()) continue;

      const abilities = this.enemyAbilities.get(player.playerIndex);
      if (!abilities?.hasKick) continue;

      const px = player.position.gridX;
      const py = player.position.gridY;

      // Find bombs adjacent to this player
      for (const bomb of bombs) {
        if (!bomb.isActive) continue;

        const bx = bomb.position.gridX;
        const by = bomb.position.gridY;
        const dist = Math.abs(bx - px) + Math.abs(by - py);

        if (dist === 1) {
          // Player is adjacent to bomb - could kick it!
          // Calculate kick direction (away from player)
          const kickDx = bx - px;
          const kickDy = by - py;

          // Mark all tiles in kick direction as potential threats
          for (let i = 0; i < 8; i++) {
            const tx = bx + kickDx * i;
            const ty = by + kickDy * i;

            if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

            const cell = grid[ty]?.[tx];
            if (!cell?.isWalkable && !cell?.hasBomb) break;

            threatZones.add(`${tx},${ty}`);
          }
        }
      }
    }

    return threatZones;
  }

  // Get tiles threatened by enemies with punch ability
  private getPunchThreatZones(bombs: Bomb[], players: Player[], grid: DangerCell[][]): Set<string> {
    const threatZones = new Set<string>();
    const PUNCH_RANGE = 3;

    for (const player of players) {
      if (player === this.player || !player.isPlayerAlive()) continue;

      const abilities = this.enemyAbilities.get(player.playerIndex);
      if (!abilities?.hasPunch) continue;

      const px = player.position.gridX;
      const py = player.position.gridY;

      // Find bombs near this player
      for (const bomb of bombs) {
        if (!bomb.isActive) continue;

        const bx = bomb.position.gridX;
        const by = bomb.position.gridY;
        const dist = Math.abs(bx - px) + Math.abs(by - py);

        if (dist === 1) {
          // Player can punch this bomb in an arc
          // Mark a ~3 tile radius around the bomb as threat zone
          for (let dx = -PUNCH_RANGE; dx <= PUNCH_RANGE; dx++) {
            for (let dy = -PUNCH_RANGE; dy <= PUNCH_RANGE; dy++) {
              const tx = bx + dx;
              const ty = by + dy;

              if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) continue;

              const cell = grid[ty]?.[tx];
              if (!cell?.isWalkable) continue;

              threatZones.add(`${tx},${ty}`);
            }
          }
        }
      }
    }

    return threatZones;
  }

  // Convert DangerCell grid to GridCell for Pathfinder
  private convertToPathfinderGrid(dangerGrid: DangerCell[][]): GridCell[][] {
    return dangerGrid.map(row => row.map(cell => ({
      x: cell.x,
      y: cell.y,
      isWalkable: cell.isWalkable,
      isDangerous: cell.dangerTime < Infinity
    })));
  }

  // Check if we need to recalculate the path
  private needsNewPath(targetX: number, targetY: number, currentTime: number): boolean {
    // Recalculate if target changed
    if (targetX !== this.pathTargetX || targetY !== this.pathTargetY) {
      return true;
    }
    // Recalculate every 0.5 seconds to adapt to changing dangers
    if (currentTime - this.pathRecalculateTime > 0.5) {
      return true;
    }
    // Recalculate if path is empty or null
    if (!this.currentPath || this.currentPath.length === 0) {
      return true;
    }
    return false;
  }

  // Follow the current path and return the direction to move
  private followPath(myX: number, myY: number): Direction | null {
    if (!this.currentPath || this.currentPath.length === 0) {
      return null;
    }

    const nextStep = this.currentPath[0];

    // Check if we reached this step
    if (myX === nextStep.x && myY === nextStep.y) {
      this.currentPath.shift();
      if (this.currentPath.length === 0) return null;
      return this.followPath(myX, myY);
    }

    // Convert next step to direction
    const dx = nextStep.x - myX;
    const dy = nextStep.y - myY;

    if (dy < 0) return Direction.UP;
    if (dy > 0) return Direction.DOWN;
    if (dx < 0) return Direction.LEFT;
    if (dx > 0) return Direction.RIGHT;

    return null;
  }

  // Predict where an enemy will be after a certain time
  private predictEnemyPosition(
    enemy: Player,
    timeAhead: number,
    grid: DangerCell[][]
  ): { x: number; y: number } {
    const enemyX = enemy.position.gridX;
    const enemyY = enemy.position.gridY;
    const speed = enemy.getEffectiveSpeed();
    const maxTiles = Math.floor(speed * timeAhead);

    // Get enemy's current movement direction
    const currentDir = enemy.getDirection();

    // Evaluate escape options for the enemy
    const escapeOptions = this.evaluateEnemyEscapeOptions(enemyX, enemyY, grid, maxTiles, currentDir);

    if (escapeOptions.length === 0) {
      return { x: enemyX, y: enemyY };
    }

    // Pick the most likely option (weighted by direction continuity)
    const best = escapeOptions.reduce((a, b) => a.weight > b.weight ? a : b);
    return { x: best.x, y: best.y };
  }

  // Evaluate escape options for an enemy
  private evaluateEnemyEscapeOptions(
    startX: number,
    startY: number,
    grid: DangerCell[][],
    maxDist: number,
    currentDir: Direction | null
  ): { x: number; y: number; weight: number; direction: Direction }[] {
    const directions = [
      { dir: Direction.UP, dx: 0, dy: -1 },
      { dir: Direction.DOWN, dx: 0, dy: 1 },
      { dir: Direction.LEFT, dx: -1, dy: 0 },
      { dir: Direction.RIGHT, dx: 1, dy: 0 }
    ];

    const options: { x: number; y: number; weight: number; direction: Direction }[] = [];

    for (const { dir, dx, dy } of directions) {
      let x = startX;
      let y = startY;
      let dist = 0;

      // Walk in this direction until blocked or max distance
      while (dist < maxDist) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) break;

        const cell = grid[ny]?.[nx];
        if (!cell || !cell.isWalkable) break;

        x = nx;
        y = ny;
        dist++;

        // Stop if we find a safe cell
        if (cell.dangerTime === Infinity) break;
      }

      if (dist > 0) {
        // Weight by safety and direction continuity
        const cell = grid[y]?.[x];
        let weight = dist;

        // Prefer continuing current direction
        if (dir === currentDir) {
          weight *= 1.5;
        }

        // Prefer safe cells
        if (cell && cell.dangerTime === Infinity) {
          weight *= 2;
        }

        options.push({ x, y, weight, direction: dir });
      }
    }

    return options;
  }

  // Evaluate strategic value of a block for destruction
  private evaluateBlockStrategicValue(
    blockX: number,
    blockY: number,
    grid: DangerCell[][],
    enemies: Player[]
  ): number {
    let score = 10; // Base value

    // 1. Chokepoint detection - blocks adjacent to walls/indestructible
    const adjacentWalls = this.countAdjacentIndestructible(blockX, blockY, grid);
    score += adjacentWalls * 15;

    // 2. Center control - blocks near map center are more valuable
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);
    const distFromCenter = Math.abs(blockX - centerX) + Math.abs(blockY - centerY);
    score += Math.max(0, 10 - distFromCenter);

    // 3. Path opening - blocks that would create paths to enemies
    if (this.opensPathToEnemy(blockX, blockY, grid, enemies)) {
      score += 25;
    }

    // 4. Corner trap potential
    if (this.isCornerTrapBlock(blockX, blockY, grid)) {
      score += 20;
    }

    return score;
  }

  // Count adjacent indestructible/wall cells
  private countAdjacentIndestructible(x: number, y: number, grid: DangerCell[][]): number {
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    let count = 0;
    for (const { dx, dy } of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) {
        count++; // Edge of map counts as wall
        continue;
      }

      const cell = grid[ny]?.[nx];
      if (cell && !cell.isWalkable && !cell.hasDestructibleBlock) {
        count++;
      }
    }

    return count;
  }

  // Check if destroying this block would open a path to an enemy
  private opensPathToEnemy(blockX: number, blockY: number, grid: DangerCell[][], enemies: Player[]): boolean {
    // Check if there's an enemy on the other side of this block
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    for (const enemy of enemies) {
      if (enemy === this.player || !enemy.isPlayerAlive()) continue;

      const enemyX = enemy.position.gridX;
      const enemyY = enemy.position.gridY;

      // Check if enemy is roughly in line with this block
      for (const { dx, dy } of directions) {
        let x = blockX + dx;
        let y = blockY + dy;

        for (let i = 0; i < 5; i++) {
          if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) break;

          if (x === enemyX && y === enemyY) {
            return true;
          }

          const cell = grid[y]?.[x];
          if (cell && !cell.isWalkable) break;

          x += dx;
          y += dy;
        }
      }
    }

    return false;
  }

  // Check if this block could be used for corner trapping
  private isCornerTrapBlock(blockX: number, blockY: number, grid: DangerCell[][]): boolean {
    // A corner trap block is one that, when destroyed, creates a corner
    // where an enemy could be trapped
    const adjacentWalls = this.countAdjacentIndestructible(blockX, blockY, grid);
    return adjacentWalls >= 2;
  }

  // Find the best strategic block to destroy
  private findBestStrategicBlock(
    blocks: Block[],
    myX: number,
    myY: number,
    grid: DangerCell[][],
    enemies: Player[]
  ): Block | null {
    let bestBlock: Block | null = null;
    let bestScore = -Infinity;

    for (const block of blocks) {
      if (!block.isActive || !block.isDestructible) continue;

      const blockX = block.position.gridX;
      const blockY = block.position.gridY;

      const distance = Math.abs(blockX - myX) + Math.abs(blockY - myY);

      // Only consider blocks within reasonable range
      if (distance > this.settings.attackRange + 3) continue;

      const strategicValue = this.evaluateBlockStrategicValue(blockX, blockY, grid, enemies);

      // Score = strategic value - distance penalty
      const distancePenalty = this.settings.areaControlEnabled ? distance * 2 : distance * 5;
      const score = strategicValue - distancePenalty;

      if (score > bestScore) {
        bestScore = score;
        bestBlock = block;
      }
    }

    return bestBlock;
  }

  // Find a position to trap an enemy
  private findTrapPosition(
    enemy: Player,
    grid: DangerCell[][],
    myX: number,
    myY: number
  ): { x: number; y: number } | null {
    const enemyX = enemy.position.gridX;
    const enemyY = enemy.position.gridY;

    // Get enemy's likely escape routes
    const escapeRoutes = this.evaluateEnemyEscapeOptions(enemyX, enemyY, grid, 3, enemy.getDirection());

    if (escapeRoutes.length === 0) return null;

    // Find chokepoints that would block the best escape routes
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    let bestTrap: { x: number; y: number; value: number } | null = null;

    for (const route of escapeRoutes) {
      // Check positions along the escape route that we could reach
      for (const { dx, dy } of directions) {
        const trapX = route.x + dx;
        const trapY = route.y + dy;

        if (trapX < 0 || trapX >= GRID_WIDTH || trapY < 0 || trapY >= GRID_HEIGHT) continue;

        const cell = grid[trapY]?.[trapX];
        if (!cell || !cell.isWalkable || cell.dangerTime < Infinity) continue;

        // Calculate if we can reach this position
        const distToTrap = Math.abs(trapX - myX) + Math.abs(trapY - myY);
        if (distToTrap > this.settings.attackRange) continue;

        // Value based on how much this blocks the enemy
        const value = route.weight * 10 - distToTrap;

        if (!bestTrap || value > bestTrap.value) {
          bestTrap = { x: trapX, y: trapY, value };
        }
      }
    }

    return bestTrap;
  }

  getState(): { currentGoal: string; targetX: number; targetY: number } {
    return {
      currentGoal: 'simple_ai',
      targetX: 0,
      targetY: 0
    };
  }

  getDifficulty(): string {
    return this.difficulty;
  }
}
