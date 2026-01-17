import {Player} from '../entities/Player';
import {Block} from '../entities/Block';
import {Bomb} from '../entities/Bomb';
import {PowerUp, PowerUpType} from '../entities/PowerUp';
import {Explosion} from '../entities/Explosion';
import {Direction, GRID_HEIGHT, GRID_WIDTH, TILE_SIZE} from '../constants';

// Power-ups that the AI should avoid
const BAD_POWERUPS = new Set([PowerUpType.SKULL]);

/**
 * Grid-based AI with periodic decision making
 * - Every X ms: analyze full grid state and choose strategy
 * - Strategy 1: If in danger → BFS to closest safe tile
 * - Strategy 2: If safe → DFS to find targets (blocks/powerups/players) → move toward target
 */

interface GridCell {
  x: number;
  y: number;
  isWalkable: boolean;
  isDangerous: boolean;
  dangerTime: number;  // Time until danger (Infinity = safe, bomb.timer = seconds remaining)
  hasBreakableBlock: boolean;
  hasPowerUp: boolean;
  hasBadPowerUp: boolean;  // Track SKULL power-ups separately
  hasPlayer: boolean;
  hasBomb: boolean;
}

interface AIStrategy {
  type: 'escape' | 'seek_target';
  targetX: number;
  targetY: number;
  targetType?: 'block' | 'powerup' | 'player';
  placeBombAtTarget?: boolean;
  path?: Array<{x: number; y: number}>; // Full BFS path for escapes
}

export class SimpleAI {
  private player: Player;
  private lastDecisionTime: number = 0;
  private decisionInterval: number = 0.3; // 300ms
  private currentStrategy: AIStrategy | null = null;
  private grid: GridCell[][] = [];

  // Escape commitment tracking to prevent flip-flopping
  private escapeCommitment: {
    direction: Direction;
    targetX: number;
    targetY: number;
    startTime: number;
    startPixelX: number;
    startPixelY: number;
  } | null = null;

  // Cached path for movement optimization
  private cachedPath: {
    targetX: number;
    targetY: number;
    path: Array<{x: number; y: number}>;
    ignoreDanger: boolean;
  } | null = null;

  // Target commitment to prevent oscillation between targets
  private targetCommitment: {
    targetX: number;
    targetY: number;
    targetType: 'block' | 'powerup' | 'player';
    commitTime: number;
  } | null = null;

  // Cached aggression decision to prevent random switching
  private aggressionDecision: {
    prioritizePlayers: boolean;
    decisionTime: number;
  } | null = null;

  // Track last decision for debugging
  private lastDecision: { direction: Direction | null; placeBomb: boolean } | null = null;

  constructor(player: Player) {
    this.player = player;
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
    // ALWAYS rebuild grid every frame when in danger for quick response
    const myX = this.player.position.gridX;
    const myY = this.player.position.gridY;

    // Build grid
    this.buildGridStatus(blocks, bombs, explosions, powerUps, players);

    const currentCell = this.grid[myY][myX];

    // If in danger, ALWAYS re-evaluate immediately
    if (currentCell.isDangerous) {
      this.currentStrategy = this.chooseStrategy();
      this.lastDecisionTime = currentTime;
    }
    // Otherwise, adjust decision interval based on danger urgency nearby
    else {
      // Calculate effective interval based on nearby danger
      let effectiveInterval = this.decisionInterval;
      const dangerTime = currentCell.dangerTime;

      if (dangerTime < 1.0) {
        effectiveInterval = 0.1;  // 100ms - imminent danger
      } else if (dangerTime < 2.0) {
        effectiveInterval = 0.2;  // 200ms - moderate danger
      }
      // else use default 300ms

      if (currentTime - this.lastDecisionTime >= effectiveInterval) {
        this.lastDecisionTime = currentTime;
        this.currentStrategy = this.chooseStrategy();
      }
    }

    // Execute current strategy
    if (this.currentStrategy) {
      const result = this.executeStrategy(blocks);

      // Safety check: if we're about to move into danger while NOT escaping, reconsider
      if (result.direction !== null && this.currentStrategy.type !== 'escape') {
        const dx = result.direction === Direction.LEFT ? -1 : result.direction === Direction.RIGHT ? 1 : 0;
        const dy = result.direction === Direction.UP ? -1 : result.direction === Direction.DOWN ? 1 : 0;
        const nextX = myX + dx;
        const nextY = myY + dy;

        if (this.isValidCell(nextX, nextY) && this.grid[nextY][nextX].isDangerous) {
          // Don't walk into danger - stop and reconsider
          this.currentStrategy = null;
          this.lastDecision = {direction: null, placeBomb: false};
          return this.lastDecision;
        }
      }

      this.lastDecision = result;
      return result;
    }

    this.lastDecision = {direction: null, placeBomb: false};
    return this.lastDecision;
  }

  private buildGridStatus(
    blocks: Block[],
    bombs: Bomb[],
    explosions: Explosion[],
    powerUps: PowerUp[],
    players: Player[]
  ): void {
    // Initialize empty grid
    this.grid = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      this.grid[y] = [];
      for (let x = 0; x < GRID_WIDTH; x++) {
        this.grid[y][x] = {
          x,
          y,
          isWalkable: true,
          isDangerous: false,
          dangerTime: Infinity,  // Safe by default
          hasBreakableBlock: false,
          hasPowerUp: false,
          hasBadPowerUp: false,
          hasPlayer: false,
          hasBomb: false,
        };
      }
    }

    // Mark blocks
    for (const block of blocks) {
      if (!block.isActive) continue;
      const x = block.position.gridX;
      const y = block.position.gridY;
      if (this.isValidCell(x, y)) {
        this.grid[y][x].isWalkable = false;
        if (block.isDestructible) {
          this.grid[y][x].hasBreakableBlock = true;
        }
      }
    }

    // Mark bombs and their blast zones as dangerous with time tracking
    for (const bomb of bombs) {
      if (!bomb.isActive) continue;
      const bx = bomb.position.gridX;
      const by = bomb.position.gridY;
      const bombTimer = bomb.timer;

      if (this.isValidCell(bx, by)) {
        this.grid[by][bx].hasBomb = true;
        this.grid[by][bx].isDangerous = true;
        // Track shortest danger time (multiple bombs may overlap)
        this.grid[by][bx].dangerTime = Math.min(this.grid[by][bx].dangerTime, bombTimer);
      }

      // Mark blast zone (stops at blocks/walls)
      const range = bomb.range;

      // Horizontal blast - LEFT
      for (let dx = 1; dx <= range; dx++) {
        const xLeft = bx - dx;
        if (!this.isValidCell(xLeft, by)) break;
        if (!this.grid[by][xLeft].isWalkable) break; // Hit wall/block
        this.grid[by][xLeft].isDangerous = true;
        this.grid[by][xLeft].dangerTime = Math.min(this.grid[by][xLeft].dangerTime, bombTimer);
      }

      // Horizontal blast - RIGHT
      for (let dx = 1; dx <= range; dx++) {
        const xRight = bx + dx;
        if (!this.isValidCell(xRight, by)) break;
        if (!this.grid[by][xRight].isWalkable) break; // Hit wall/block
        this.grid[by][xRight].isDangerous = true;
        this.grid[by][xRight].dangerTime = Math.min(this.grid[by][xRight].dangerTime, bombTimer);
      }

      // Vertical blast - UP
      for (let dy = 1; dy <= range; dy++) {
        const yUp = by - dy;
        if (!this.isValidCell(bx, yUp)) break;
        if (!this.grid[yUp][bx].isWalkable) break; // Hit wall/block
        this.grid[yUp][bx].isDangerous = true;
        this.grid[yUp][bx].dangerTime = Math.min(this.grid[yUp][bx].dangerTime, bombTimer);
      }

      // Vertical blast - DOWN
      for (let dy = 1; dy <= range; dy++) {
        const yDown = by + dy;
        if (!this.isValidCell(bx, yDown)) break;
        if (!this.grid[yDown][bx].isWalkable) break; // Hit wall/block
        this.grid[yDown][bx].isDangerous = true;
        this.grid[yDown][bx].dangerTime = Math.min(this.grid[yDown][bx].dangerTime, bombTimer);
      }
    }

    // Mark active explosions as dangerous (immediate danger - time = 0)
    for (const explosion of explosions) {
      if (!explosion.isActive) continue;
      for (const tile of explosion.tiles) {
        const x = tile.gridX;
        const y = tile.gridY;
        if (this.isValidCell(x, y)) {
          this.grid[y][x].isDangerous = true;
          this.grid[y][x].dangerTime = 0;  // Immediate danger
        }
      }
    }

    // Mark power-ups (track bad ones separately)
    for (const powerUp of powerUps) {
      if (!powerUp.isActive) continue;
      const x = powerUp.position.gridX;
      const y = powerUp.position.gridY;
      if (this.isValidCell(x, y)) {
        this.grid[y][x].hasPowerUp = true;
        if (BAD_POWERUPS.has(powerUp.type)) {
          this.grid[y][x].hasBadPowerUp = true;
        }
      }
    }

    // Mark players
    for (const player of players) {
      if (!player.isPlayerAlive() || player === this.player) continue;
      const x = player.position.gridX;
      const y = player.position.gridY;
      if (this.isValidCell(x, y)) {
        this.grid[y][x].hasPlayer = true;
      }
    }
  }

  private chooseStrategy(): AIStrategy | null {
    const myX = this.player.position.gridX;
    const myY = this.player.position.gridY;

    // STRATEGY 1: If in danger, escape to closest safe tile
    if (this.grid[myY][myX].isDangerous) {

      // If we have an active escape commitment, verify target is still safe
      if (this.escapeCommitment && !this.isStuck()) {
        const targetCell = this.grid[this.escapeCommitment.targetY]?.[this.escapeCommitment.targetX];
        // If target is still safe, keep following commitment
        if (targetCell && !targetCell.isDangerous && targetCell.isWalkable) {
          return {
            type: 'escape',
            targetX: this.escapeCommitment.targetX,
            targetY: this.escapeCommitment.targetY,
          };
        }
        // Target is no longer safe, clear commitment and recalculate
        this.escapeCommitment = null;
      }

      // Otherwise, calculate new escape path
      const safeTile = this.findClosestSafeTile(myX, myY);
      if (safeTile) {
        // Commit to this escape direction
        const direction = this.getDirectionToward(myX, myY, safeTile.x, safeTile.y, true);
        if (direction !== null) {
          this.escapeCommitment = {
            direction,
            targetX: safeTile.x,
            targetY: safeTile.y,
            startTime: Date.now(),
            startPixelX: this.player.position.pixelX,
            startPixelY: this.player.position.pixelY,
          };
        }

        return {
          type: 'escape',
          targetX: safeTile.x,
          targetY: safeTile.y,
        };
      } else {
        // No safe tile found! Try to move to any tile that's not an active explosion
        const emergencyDir = this.getEmergencyEscapeDirection(myX, myY);
        if (emergencyDir) {
          const dx = emergencyDir === Direction.LEFT ? -1 : emergencyDir === Direction.RIGHT ? 1 : 0;
          const dy = emergencyDir === Direction.UP ? -1 : emergencyDir === Direction.DOWN ? 1 : 0;
          return {
            type: 'escape',
            targetX: myX + dx,
            targetY: myY + dy,
          };
        }
      }
    }

    // Clear commitment when safe
    if (!this.grid[myY][myX].isDangerous) {
      this.escapeCommitment = null;
    }

    // STRATEGY 2: If safe, find a target (block, powerup, or player)
    const target = this.findTargetWithBFS(myX, myY);
    if (target) {
      return {
        type: 'seek_target',
        targetX: target.x,
        targetY: target.y,
        targetType: target.type,
        placeBombAtTarget: target.type === 'block' || target.type === 'player',
      };
    }

    // No strategy - just wander
    return null;
  }

  private isStuck(): boolean {
    if (!this.escapeCommitment) return false;

    const timeSinceCommit = Date.now() - this.escapeCommitment.startTime;

    // Check if we've been committed for at least 500ms
    if (timeSinceCommit > 500) {
      const pixelMoved = Math.sqrt(
        Math.pow(this.player.position.pixelX - this.escapeCommitment.startPixelX, 2) +
        Math.pow(this.player.position.pixelY - this.escapeCommitment.startPixelY, 2)
      );

      // If moved less than 30% of a tile in 500ms, we're stuck
      return pixelMoved < TILE_SIZE * 0.3;
    }

    return false;
  }

  private getTimeToTraverseTiles(numTiles: number): number {
    // Calculate time needed to traverse N tiles based on player speed
    const speed = this.player.getEffectiveSpeed(); // tiles per second
    if (speed <= 0) return Infinity;
    return numTiles / speed;
  }

  private findClosestSafeTile(startX: number, startY: number): {x: number; y: number} | null {
    // BFS to find closest safe tile WITH SAFETY MARGIN
    const queue: Array<{x: number; y: number; dist: number}> = [];
    const visited = new Set<string>();
    visited.add(`${startX},${startY}`);

    // Calculate minimum safe time - need enough time to cross tiles plus safety margin
    const timePerTile = this.getTimeToTraverseTiles(1);
    const safetyMargin = 0.3; // Extra buffer for pixel misalignment

    // Initialize with immediate neighbors as first steps
    const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of directions) {
      const nx = startX + dx;
      const ny = startY + dy;
      const key = `${nx},${ny}`;

      if (this.isValidCell(nx, ny) && this.grid[ny][nx].isWalkable && !visited.has(key)) {
        const dangerTime = this.grid[ny][nx].dangerTime;
        // Only walk through if we have enough time to cross (1 tile + safety margin)
        const minTimeNeeded = timePerTile + safetyMargin;
        if (!this.grid[ny][nx].isDangerous || dangerTime > minTimeNeeded) {
          visited.add(key);
          queue.push({x: nx, y: ny, dist: 1});
        }
      }
    }

    const safeTiles: Array<{x: number; y: number; dist: number; adjustedDist: number}> = [];
    let minAdjustedDist = Infinity;

    while (queue.length > 0) {
      const {x, y, dist} = queue.shift()!;

      // Is this tile safe?
      if (!this.grid[y][x].isDangerous && this.grid[y][x].isWalkable) {
        // Prefer tiles with safety margin, but accept any safe tile
        const hasMargin = this.checkSafetyMargin(x, y);

        // Prefer tiles aligned with current position (easier to reach without diagonal drift)
        const isAligned = (x === startX || y === startY);
        const alignmentBonus = isAligned ? -5 : 0;  // Negative = closer (better)

        const adjustedDist = hasMargin ? dist + alignmentBonus : dist + 100;  // Prefer tiles with margin

        if (adjustedDist < minAdjustedDist) {
          minAdjustedDist = adjustedDist;
          safeTiles.length = 0;
          safeTiles.push({x, y, dist, adjustedDist});
        } else if (adjustedDist === minAdjustedDist) {
          safeTiles.push({x, y, dist, adjustedDist});
        }
        continue; // Don't explore beyond safe tiles
      }

      // If we've already found safe tiles and current dist is greater, stop
      if (dist > minAdjustedDist) continue;

      // Explore neighbors - but avoid paths through active explosions
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;

        if (this.isValidCell(nx, ny) && this.grid[ny][nx].isWalkable && !visited.has(key)) {
          const dangerTime = this.grid[ny][nx].dangerTime;
          // Calculate time needed to reach this tile (dist+1 tiles from start)
          const timeToReach = this.getTimeToTraverseTiles(dist + 1);
          // Only allow if we have enough time to reach AND cross this tile
          const minTimeNeeded = timeToReach + timePerTile + safetyMargin;
          if (!this.grid[ny][nx].isDangerous || dangerTime > minTimeNeeded) {
            visited.add(key);
            queue.push({x: nx, y: ny, dist: dist + 1});
          }
        }
      }
    }

    // Choose randomly among safe tiles
    if (safeTiles.length > 0) {
      const chosen = safeTiles[Math.floor(Math.random() * safeTiles.length)];
      return {x: chosen.x, y: chosen.y};
    }

    return null;
  }

  private checkSafetyMargin(x: number, y: number): boolean {
    // Check if at least 2 adjacent tiles are also safe (gives pixel-level margin)
    const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    let safeCount = 0;

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (this.isValidCell(nx, ny) && !this.grid[ny][nx].isDangerous) {
        safeCount++;
      }
    }

    return safeCount >= 2;
  }

  private findTargetWithBFS(startX: number, startY: number): {x: number; y: number; type: 'block' | 'powerup' | 'player'} | null {
    const currentTime = Date.now();

    // Check if we have a valid target commitment
    if (this.targetCommitment) {
      const timeSinceCommit = currentTime - this.targetCommitment.commitTime;
      const commitDuration = 3000; // Commit to target for 3 seconds

      if (timeSinceCommit < commitDuration) {
        // Verify target still exists
        const targetCell = this.grid[this.targetCommitment.targetY]?.[this.targetCommitment.targetX];
        if (targetCell) {
          const stillValid =
            (this.targetCommitment.targetType === 'block' && targetCell.hasBreakableBlock) ||
            (this.targetCommitment.targetType === 'powerup' && targetCell.hasPowerUp && !targetCell.hasBadPowerUp) ||
            (this.targetCommitment.targetType === 'player' && targetCell.hasPlayer);

          // Also check we haven't reached it yet
          const atTarget = startX === this.targetCommitment.targetX && startY === this.targetCommitment.targetY;

          if (stillValid && !atTarget && !targetCell.isDangerous) {
            return {
              x: this.targetCommitment.targetX,
              y: this.targetCommitment.targetY,
              type: this.targetCommitment.targetType
            };
          }
        }
      }
      // Target invalid or reached, clear commitment
      this.targetCommitment = null;
    }

    // Count remaining breakable blocks to determine aggression level
    let blockCount = 0;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (this.grid[y][x].hasBreakableBlock) blockCount++;
      }
    }

    // Cache aggression decision for 2 seconds to prevent oscillation
    const aggressionCacheDuration = 2000;
    let prioritizePlayers: boolean;

    if (this.aggressionDecision && currentTime - this.aggressionDecision.decisionTime < aggressionCacheDuration) {
      prioritizePlayers = this.aggressionDecision.prioritizePlayers;
    } else {
      // More aggressive when fewer blocks remain (60% base + up to 40% based on blocks cleared)
      const aggressionChance = 0.6 + (0.4 * (1 - Math.min(blockCount, 40) / 40));
      prioritizePlayers = Math.random() < aggressionChance;
      this.aggressionDecision = { prioritizePlayers, decisionTime: currentTime };
    }

    // BFS to find NEAREST targets (ordered by distance)
    const queue: Array<{x: number; y: number; dist: number}> = [{x: startX, y: startY, dist: 0}];
    const visited = new Set<string>();
    visited.add(`${startX},${startY}`);

    // Keep track of best targets found with distances
    let nearestBlock: {x: number; y: number; dist: number} | null = null;
    let nearestPlayer: {x: number; y: number; playerX: number; playerY: number; dist: number} | null = null;
    let nearestPowerUp: {x: number; y: number; dist: number} | null = null;

    while (queue.length > 0) {
      const {x, y, dist} = queue.shift()!;

      // If we've found all targets, can stop early
      if (nearestBlock && nearestPlayer && nearestPowerUp) break;

      // Check adjacent cells for targets
      const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;

        if (!this.isValidCell(nx, ny)) continue;

        const cell = this.grid[ny][nx];

        // Found a breakable block - record position (current position to bomb from)
        if (cell.hasBreakableBlock && !nearestBlock) {
          nearestBlock = {x, y, dist};
        }

        // Found a good power-up - record position
        if (cell.hasPowerUp && !cell.hasBadPowerUp && cell.isWalkable && !cell.isDangerous && !nearestPowerUp) {
          nearestPowerUp = {x: nx, y: ny, dist: dist + 1};
        }

        // Found another player - record position
        if (cell.hasPlayer && !cell.isDangerous && !nearestPlayer) {
          nearestPlayer = {x, y, playerX: nx, playerY: ny, dist};
        }
      }

      // Continue BFS on walkable, non-dangerous tiles
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;

        if (this.isValidCell(nx, ny) && this.grid[ny][nx].isWalkable && !this.grid[ny][nx].isDangerous && !visited.has(key)) {
          visited.add(key);
          queue.push({x: nx, y: ny, dist: dist + 1});
        }
      }
    }

    // Helper to commit and return target
    const commitTarget = (x: number, y: number, type: 'block' | 'powerup' | 'player') => {
      this.targetCommitment = { targetX: x, targetY: y, targetType: type, commitTime: currentTime };
      return { x, y, type };
    };

    // Choose target based on aggression and distance
    // Prefer closer targets, but aggression influences player vs block priority
    if (prioritizePlayers && nearestPlayer) {
      // Aggressive: attack player if they're reasonably close (within 10 tiles)
      if (nearestPlayer.dist <= 10 || !nearestBlock) {
        // Use consistent position (where we found the path to player) instead of random
        return commitTarget(nearestPlayer.x, nearestPlayer.y, 'player');
      }
    }

    // Power-ups are always good to collect if close
    if (nearestPowerUp && (!nearestBlock || nearestPowerUp.dist <= nearestBlock.dist)) {
      return commitTarget(nearestPowerUp.x, nearestPowerUp.y, 'powerup');
    }

    // Destroy blocks to open paths
    if (nearestBlock) {
      return commitTarget(nearestBlock.x, nearestBlock.y, 'block');
    }

    // Last resort: attack any reachable player
    if (nearestPlayer) {
      return commitTarget(nearestPlayer.x, nearestPlayer.y, 'player');
    }

    return null;
  }

  private executeStrategy(_blocks: Block[]): {direction: Direction | null; placeBomb: boolean} {
    if (!this.currentStrategy) {
      return {direction: null, placeBomb: false};
    }

    const myX = this.player.position.gridX;
    const myY = this.player.position.gridY;
    const {targetX, targetY, placeBombAtTarget, type} = this.currentStrategy;

    // Are we at the target grid position?
    const atTarget = myX === targetX && myY === targetY;

    // If escaping and at target grid position, ensure we're properly centered on the tile
    if (atTarget && type === 'escape') {
      const centerDirection = this.getDirectionTowardTileCenter();
      if (centerDirection) {
        // Keep moving toward center until properly aligned
        return {direction: centerDirection, placeBomb: false};
      }
      // Properly centered and safe - clear escape commitment
      this.escapeCommitment = null;
      return {direction: null, placeBomb: false};
    }

    // If seeking a target and at target, place bomb if allowed
    if (atTarget && placeBombAtTarget && this.player.canPlaceBomb()) {
      // Check if there's a safe escape BEFORE placing the bomb
      const escapeAfterBomb = this.findBFSEscapeAfterBomb(myX, myY);
      if (!escapeAfterBomb) {
        // No escape route - don't place bomb
        // Don't place bomb if no escape - find another target
        this.currentStrategy = null;
        return {direction: null, placeBomb: false};
      }

      // Place bomb AND move toward the safe escape tile immediately (ignore danger - we must escape!)
      const moveDir = this.getDirectionToward(myX, myY, escapeAfterBomb.x, escapeAfterBomb.y, true);

      // Set up escape commitment to the safe tile
      if (moveDir !== null) {
        this.escapeCommitment = {
          direction: moveDir,
          targetX: escapeAfterBomb.x,
          targetY: escapeAfterBomb.y,
          startTime: Date.now(),
          startPixelX: this.player.position.pixelX,
          startPixelY: this.player.position.pixelY,
        };
      }

      // Force immediate re-evaluation to continue escaping
      this.lastDecisionTime = 0;
      return {direction: moveDir, placeBomb: true};
    }

    // Move toward target using simple pathfinding
    // When escaping, we need to move but should still avoid active explosions if possible
    const direction = this.getDirectionToward(myX, myY, targetX, targetY, false);

    // If no safe direction found and we're escaping, try ignoring danger as last resort
    if (direction === null && type === 'escape') {
      const urgentDirection = this.getDirectionToward(myX, myY, targetX, targetY, true);
      return {direction: urgentDirection, placeBomb: false};
    }

    return {direction, placeBomb: false};
  }

  private getDirectionTowardTileCenter(): Direction | null {
    const pixelX = this.player.position.pixelX;
    const pixelY = this.player.position.pixelY;
    const gridX = this.player.position.gridX;
    const gridY = this.player.position.gridY;

    // Calculate center of current grid cell
    const centerX = gridX * TILE_SIZE;
    const centerY = gridY * TILE_SIZE;

    const offsetX = pixelX - centerX;
    const offsetY = pixelY - centerY;

    // Threshold for "close enough" to center (within 4 pixels)
    const threshold = 4;

    // If significantly off-center, return direction to move toward center
    if (Math.abs(offsetX) > threshold) {
      return offsetX > 0 ? Direction.LEFT : Direction.RIGHT;
    }
    if (Math.abs(offsetY) > threshold) {
      return offsetY > 0 ? Direction.UP : Direction.DOWN;
    }

    // Already centered enough
    return null;
  }

  private findBFSEscapeAfterBomb(bombX: number, bombY: number): {x: number; y: number} | null {
    // Simulate bomb blast zone
    const bombRange = this.player.bombRange;
    const blastZone = new Set<string>();

    // Mark bomb position
    blastZone.add(`${bombX},${bombY}`);

    // Mark horizontal blast (stops at walls/blocks)
    for (let dx = 1; dx <= bombRange; dx++) {
      const xLeft = bombX - dx;
      if (this.isValidCell(xLeft, bombY)) {
        if (!this.grid[bombY][xLeft].isWalkable) break; // Hit a wall/block
        blastZone.add(`${xLeft},${bombY}`);
      } else break;
    }
    for (let dx = 1; dx <= bombRange; dx++) {
      const xRight = bombX + dx;
      if (this.isValidCell(xRight, bombY)) {
        if (!this.grid[bombY][xRight].isWalkable) break; // Hit a wall/block
        blastZone.add(`${xRight},${bombY}`);
      } else break;
    }

    // Mark vertical blast (stops at walls/blocks)
    for (let dy = 1; dy <= bombRange; dy++) {
      const yUp = bombY - dy;
      if (this.isValidCell(bombX, yUp)) {
        if (!this.grid[yUp][bombX].isWalkable) break; // Hit a wall/block
        blastZone.add(`${bombX},${yUp}`);
      } else break;
    }
    for (let dy = 1; dy <= bombRange; dy++) {
      const yDown = bombY + dy;
      if (this.isValidCell(bombX, yDown)) {
        if (!this.grid[yDown][bombX].isWalkable) break; // Hit a wall/block
        blastZone.add(`${bombX},${yDown}`);
      } else break;
    }

    // BFS to find reachable safe tiles
    const queue: Array<{x: number; y: number; dist: number}> = [{x: bombX, y: bombY, dist: 0}];
    const visited = new Set<string>();
    visited.add(`${bombX},${bombY}`);

    const safeTiles: Array<{x: number; y: number; dist: number}> = [];
    let minDist = Infinity;

    while (queue.length > 0) {
      const {x, y, dist} = queue.shift()!;

      // Is this tile safe from the simulated bomb AND from existing dangers?
      const key = `${x},${y}`;
      const inBlastZone = blastZone.has(key);
      const inExistingDanger = this.grid[y][x].isDangerous;

      if (!inBlastZone && !inExistingDanger && this.grid[y][x].isWalkable) {
        // Found a safe tile!
        if (dist < minDist) {
          minDist = dist;
          safeTiles.length = 0;
          safeTiles.push({x, y, dist});
        } else if (dist === minDist) {
          safeTiles.push({x, y, dist});
        }
        continue; // Don't explore beyond safe tiles
      }

      // Don't search too far
      if (dist >= 10) continue;

      // Explore neighbors
      const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        const nkey = `${nx},${ny}`;

        if (this.isValidCell(nx, ny) && this.grid[ny][nx].isWalkable && !visited.has(nkey)) {
          visited.add(nkey);
          queue.push({x: nx, y: ny, dist: dist + 1});
        }
      }
    }

    // Choose randomly among safe tiles at minimum distance
    if (safeTiles.length > 0) {
      return safeTiles[Math.floor(Math.random() * safeTiles.length)];
    }

    return null;
  }

  private getEmergencyEscapeDirection(x: number, y: number): Direction | null {
    // Emergency escape: prefer tiles with more time before danger, avoid active explosions
    const directions = [
      {dir: Direction.UP, dx: 0, dy: -1},
      {dir: Direction.DOWN, dx: 0, dy: 1},
      {dir: Direction.LEFT, dx: -1, dy: 0},
      {dir: Direction.RIGHT, dx: 1, dy: 0},
    ];

    let bestDir: Direction | null = null;
    let bestDangerTime = -1;

    for (const {dir, dx, dy} of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (!this.isValidCell(nx, ny) || !this.grid[ny][nx].isWalkable) continue;

      const cell = this.grid[ny][nx];

      // If tile is safe, use it immediately
      if (!cell.isDangerous) {
        return dir;
      }

      // Otherwise, prefer tiles with more time before explosion
      if (cell.dangerTime > bestDangerTime) {
        bestDangerTime = cell.dangerTime;
        bestDir = dir;
      }
    }

    // Only return if we found a tile that's not an active explosion (dangerTime > 0)
    return bestDangerTime > 0 ? bestDir : null;
  }

  private getDirectionToward(fromX: number, fromY: number, toX: number, toY: number, ignoreDanger: boolean = false): Direction | null {
    const canMove = (nx: number, ny: number) => {
      if (!this.isValidCell(nx, ny) || !this.grid[ny][nx].isWalkable) return false;
      return ignoreDanger || !this.grid[ny][nx].isDangerous;
    };

    // Already at target
    if (fromX === toX && fromY === toY) {
      this.cachedPath = null;
      return null;
    }

    // Check if we have a valid cached path
    if (this.cachedPath &&
        this.cachedPath.targetX === toX &&
        this.cachedPath.targetY === toY &&
        this.cachedPath.path.length > 0) {

      const nextStep = this.cachedPath.path[0];

      // ALWAYS check for danger before using cached path!
      // Only use cache if: walkable AND (ignoreDanger OR not dangerous)
      const isWalkable = this.isValidCell(nextStep.x, nextStep.y) && this.grid[nextStep.y][nextStep.x].isWalkable;
      const isSafe = ignoreDanger || !this.grid[nextStep.y][nextStep.x].isDangerous;

      if (isWalkable && isSafe) {
        // Check if next step is adjacent to current position
        const dx = nextStep.x - fromX;
        const dy = nextStep.y - fromY;

        if (Math.abs(dx) + Math.abs(dy) === 1) {
          // Remove this step from path
          this.cachedPath.path.shift();

          // Return direction to next step
          if (dx === 1) return Direction.RIGHT;
          if (dx === -1) return Direction.LEFT;
          if (dy === 1) return Direction.DOWN;
          if (dy === -1) return Direction.UP;
        }
      }

      // Path is invalid, recalculate
      this.cachedPath = null;
    }

    // BFS to find shortest path(s) to target
    const directions: [number, number, Direction][] = [
      [0, -1, Direction.UP],
      [0, 1, Direction.DOWN],
      [-1, 0, Direction.LEFT],
      [1, 0, Direction.RIGHT]
    ];

    // Track parent for path reconstruction
    const visited = new Map<string, {parentX: number, parentY: number, dist: number}>();
    const queue: {x: number, y: number, dist: number}[] = [{x: fromX, y: fromY, dist: 0}];
    visited.set(`${fromX},${fromY}`, {parentX: -1, parentY: -1, dist: 0});

    let targetReached = false;

    while (queue.length > 0 && !targetReached) {
      const {x, y, dist} = queue.shift()!;

      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;

        if (!canMove(nx, ny)) continue;
        if (visited.has(key)) continue;

        visited.set(key, {parentX: x, parentY: y, dist: dist + 1});
        queue.push({x: nx, y: ny, dist: dist + 1});

        if (nx === toX && ny === toY) {
          targetReached = true;
          break;
        }
      }
    }

    if (!targetReached) return null;

    // Reconstruct path from target to source
    const path: Array<{x: number; y: number}> = [];
    let cx = toX, cy = toY;

    while (cx !== fromX || cy !== fromY) {
      path.unshift({x: cx, y: cy});
      const info = visited.get(`${cx},${cy}`)!;
      cx = info.parentX;
      cy = info.parentY;
    }

    if (path.length === 0) return null;

    const firstStep = path[0];

    // Cache the path (excluding first step which we'll return now)
    this.cachedPath = {
      targetX: toX,
      targetY: toY,
      path: path.slice(1),
      ignoreDanger
    };

    // Return direction to first step (deterministic - no random selection)
    const dx = firstStep.x - fromX;
    const dy = firstStep.y - fromY;
    if (dx === 1) return Direction.RIGHT;
    if (dx === -1) return Direction.LEFT;
    if (dy === 1) return Direction.DOWN;
    if (dy === -1) return Direction.UP;

    return null;
  }

  private isValidCell(x: number, y: number): boolean {
    return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
  }

  getState() {
    return {
      currentGoal: this.currentStrategy?.type || 'idle',
      targetX: this.currentStrategy?.targetX || 0,
      targetY: this.currentStrategy?.targetY || 0
    };
  }

  getDifficulty(): string {
    return 'easy';
  }

  // Debug method for halt detection
  getDebugState(): {
    strategy: string | null;
    targetCommitment: { x: number; y: number; type: string } | null;
    cachedPath: { targetX: number; targetY: number; pathLength: number } | null;
    grid: Array<Array<{ isWalkable: boolean; isDangerous: boolean }>>;
    lastDecision: { direction: Direction | null; placeBomb: boolean } | null;
  } {
    return {
      strategy: this.currentStrategy?.type || null,
      targetCommitment: this.targetCommitment ? {
        x: this.targetCommitment.targetX,
        y: this.targetCommitment.targetY,
        type: this.targetCommitment.targetType
      } : null,
      cachedPath: this.cachedPath ? {
        targetX: this.cachedPath.targetX,
        targetY: this.cachedPath.targetY,
        pathLength: this.cachedPath.path.length
      } : null,
      grid: this.grid.map(row => row.map(cell => ({
        isWalkable: cell.isWalkable,
        isDangerous: cell.isDangerous
      }))),
      lastDecision: this.lastDecision
    };
  }
}
