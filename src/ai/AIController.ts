import { Player } from '../entities/Player';
import { Block } from '../entities/Block';
import { Bomb } from '../entities/Bomb';
import { PowerUp } from '../entities/PowerUp';
import { Explosion } from '../entities/Explosion';
import { Direction, GRID_WIDTH, GRID_HEIGHT, BOMB_FUSE_TIME, TILE_SIZE } from '../constants';

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
  escapePath: { x: number; y: number }[]; // NEW: Store the actual escape path
  moveToSpotPath?: { x: number; y: number }[]; // NEW: Path from player to bomb spot
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

  // NEW: Anti-oscillation tracking
  private lastDirection: Direction | null = null;
  private lastPosition: { x: number; y: number } | null = null;
  private stuckCounter: number = 0;
  private escapePathIndex: number = 0;
  private moveToSpotPathIndex: number = 0; // NEW: Index for moving to bomb spot
  private emergencyEscapePath: { x: number; y: number }[] | null = null;
  private emergencyEscapePathIndex: number = 0;

  // NEW: Persistence tracking
  private persistenceTimer: number = 0;
  private persistentDirection: Direction | null = null;
  private readonly DIRECTION_PERSISTENCE_TIME: number = 0.4; // Reduced for responsiveness

  private collectingPath: { x: number; y: number }[] | null = null;
  private collectingPathIndex: number = 0;

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

    // Track if we're stuck (same position for multiple updates)
    if (this.lastPosition && this.lastPosition.x === myX && this.lastPosition.y === myY) {
      this.stuckCounter++;
    } else {
      this.stuckCounter = 0;
    }
    this.lastPosition = { x: myX, y: myY };

    // Update persistence timer
    if (this.persistenceTimer > 0) {
      this.persistenceTimer -= _deltaTime;
    }

    // If stuck for too long, reset state
    if (this.stuckCounter > 10) {
      this.state = 'FINDING_BOMB_SPOT';
      this.currentPlan = null;
      this.stuckCounter = 0;
      this.lastDirection = null;
    }

    // ALWAYS check if we're in danger - override everything else
    const isInDanger = myCell && myCell.dangerTime < Infinity;

    // Also consider it "danger" if we are in the middle of escaping and not yet centered in a safe cell
    const isEscapingButNotSafe = this.state === 'ESCAPING' && (!myCell || myCell.dangerTime < Infinity || !this.isAtGridCenter(myX, myY));

    if (isInDanger || isEscapingButNotSafe) {
      // Emergency escape - find safest direction immediately
      this.state = 'ESCAPING';

      // 1. Try to follow pre-planned bomb escape path first
      if (this.currentPlan?.escapePath && this.escapePathIndex < this.currentPlan.escapePath.length) {
        const nextStep = this.currentPlan.escapePath[this.escapePathIndex];
        // Check if we've reached this step
        if (this.isAtStep(nextStep)) {
          this.escapePathIndex++;
          if (this.escapePathIndex < this.currentPlan.escapePath.length) {
            const dir = this.getDirectionTo(myX, myY, this.currentPlan.escapePath[this.escapePathIndex]);
            if (dir && this.canMove(dir, myX, myY, grid, false)) {
              this.lastDirection = dir;
              return { direction: dir, placeBomb: false };
            }
          }
        } else {
          const dir = this.getDirectionTo(myX, myY, nextStep);
          if (dir && this.canMove(dir, myX, myY, grid, false)) {
            this.lastDirection = dir;
            return { direction: dir, placeBomb: false };
          }
        }
      }

      // 2. Try to follow existing emergency escape path if it's still safe
      if (this.emergencyEscapePath && this.emergencyEscapePathIndex < this.emergencyEscapePath.length) {
        const nextStep = this.emergencyEscapePath[this.emergencyEscapePathIndex];
        const targetCell = this.emergencyEscapePath[this.emergencyEscapePath.length - 1];

        // Is the final destination still safe? (The "good enough" check)
        const targetGridCell = grid[targetCell.y]?.[targetCell.x];
        const isDestinationStillSafe = targetGridCell && targetGridCell.dangerTime === Infinity;

        if (isDestinationStillSafe) {
          if (myX === nextStep.x && myY === nextStep.y) {
            this.emergencyEscapePathIndex++;
            if (this.emergencyEscapePathIndex < this.emergencyEscapePath.length) {
              const dir = this.getDirectionTo(myX, myY, this.emergencyEscapePath[this.emergencyEscapePathIndex]);
              if (dir && this.canMove(dir, myX, myY, grid)) {
                this.lastDirection = dir;
                return { direction: dir, placeBomb: false };
              }
            }
          } else {
            const dir = this.getDirectionTo(myX, myY, nextStep);
            if (dir && this.canMove(dir, myX, myY, grid)) {
              this.lastDirection = dir;
              return { direction: dir, placeBomb: false };
            }
          }
        }
      }

      // 3. Fallback: calculate new emergency escape path
      const escapePath = this.findEmergencyEscapePathBFS(grid, myX, myY);
      if (escapePath && escapePath.length > 0) {
        this.emergencyEscapePath = escapePath;
        this.emergencyEscapePathIndex = 0;
        const nextStep = escapePath[0];
        const dir = this.getDirectionTo(myX, myY, nextStep);
        if (dir) {
          this.lastDirection = dir;
          return { direction: dir, placeBomb: false };
        }
      }

      // 4. Absolute fallback: use the old BFS direction finding if pathfinding fails
      const escapeDir = this.findBestEscapeDirectionBFS(grid, myX, myY);
      if (escapeDir) {
        this.lastDirection = escapeDir;
      }
      return { direction: escapeDir, placeBomb: false };
    }

    // If we were escaping and are now safe, go back to finding next bomb spot
    if (this.state === 'ESCAPING') {
      this.state = 'FINDING_BOMB_SPOT';
      this.currentPlan = null;
      this.escapePathIndex = 0;
      this.emergencyEscapePath = null;
      this.emergencyEscapePathIndex = 0;
    }

    // Follow existing paths IF NOT in danger (Emergency escape handled above)
    if (this.state === 'MOVING_TO_BOMB_SPOT' || this.state === 'COLLECTING') {
      const pathResult = this.continueCurrentAction(grid, myX, myY);
      if (pathResult.direction) {
        // Clear persistence when following a path
        this.persistenceTimer = 0;
        this.persistentDirection = null;
        return pathResult;
      }
    }

    // Rate limit decisions (ALWAYS - except when in immediate emergency danger)
    const shouldThink = currentTime - this.lastDecisionTime >= this.settings.reactionTime;

    // Smart Persistence: Only applies if we aren't "thinking" and don't have a path
    if (this.persistenceTimer > 0 && this.persistentDirection) {
      if (this.canMove(this.persistentDirection, myX, myY, grid, true)) {
        return { direction: this.persistentDirection, placeBomb: false };
      } else {
        // Blocked or unsafe, clear persistence
        this.persistenceTimer = 0;
        this.persistentDirection = null;
      }
    }

    if (!shouldThink) {
      return { direction: null, placeBomb: false };
    }
    this.lastDecisionTime = currentTime;

    // Check for nearby power-ups first (quick detour)
    const nearbyPowerUp = this.findNearbyPowerUp(grid, powerUps, myX, myY);
    if (nearbyPowerUp && this.state === 'FINDING_BOMB_SPOT') {
      this.state = 'COLLECTING';
      this.collectingPath = nearbyPowerUp.path;
      this.collectingPathIndex = 0;

      if (this.collectingPath.length > 0) {
        const nextStep = this.collectingPath[0];
        const dir = this.getDirectionTo(myX, myY, nextStep);
        if (dir) {
          this.lastDirection = dir;
          this.persistentDirection = dir;
          this.persistenceTimer = this.DIRECTION_PERSISTENCE_TIME;
          return { direction: dir, placeBomb: false };
        }
      }
    }

    // State machine
    let result: { direction: Direction | null; placeBomb: boolean };
    switch (this.state) {
      case 'FINDING_BOMB_SPOT':
        result = this.handleFindingBombSpot(grid, myX, myY, players, currentTime);
        break;

      case 'MOVING_TO_BOMB_SPOT':
        result = this.handleMovingToBombSpot(grid, myX, myY, currentTime);
        break;

      case 'COLLECTING':
        // If we reached the power-up or it's gone, or path is broken, go back to bombing
        let stillCollecting = false;
        if (nearbyPowerUp && this.collectingPath) {
          // If the power-up is still there, keep collecting
          if (myX !== nearbyPowerUp.x || myY !== nearbyPowerUp.y) {
            stillCollecting = true;
          }
        }

        if (!stillCollecting) {
          this.state = 'FINDING_BOMB_SPOT';
          this.collectingPath = null;
          this.collectingPathIndex = 0;
          result = this.handleFindingBombSpot(grid, myX, myY, players, currentTime);
        } else {
          // Continue following collecting path
          if (this.collectingPath && this.collectingPathIndex < this.collectingPath.length) {
            const nextStep = this.collectingPath[this.collectingPathIndex];
            if (this.isAtStep(nextStep)) {
              this.collectingPathIndex++;
            }
            if (this.collectingPathIndex < this.collectingPath.length) {
              const dir = this.getDirectionTo(myX, myY, this.collectingPath[this.collectingPathIndex]);
              if (dir && this.canMove(dir, myX, myY, grid, true)) {
                this.lastDirection = dir;
                result = { direction: dir, placeBomb: false };
              } else {
                result = { direction: null, placeBomb: false };
              }
            } else {
              result = { direction: null, placeBomb: false };
            }
          } else {
            result = { direction: null, placeBomb: false };
          }
        }
        break;

      default:
        this.state = 'FINDING_BOMB_SPOT';
        result = { direction: null, placeBomb: false };
    }

    // Set persistence for new decisions
    if (result.direction && result.direction !== this.persistentDirection) {
      this.persistentDirection = result.direction;
      this.persistenceTimer = this.DIRECTION_PERSISTENCE_TIME;
    }

    return result;
  }

  private isAtStep(step: { x: number; y: number }): boolean {
    const targetX = step.x * TILE_SIZE;
    const targetY = step.y * TILE_SIZE;
    const dx = Math.abs(this.player.position.pixelX - targetX);
    const dy = Math.abs(this.player.position.pixelY - targetY);
    // Be slightly more lenient with threshold to handle higher speeds
    const threshold = Math.max(2, this.player.speed * 0.05);
    return dx < threshold && dy < threshold;
  }

  private isAtGridCenter(gx: number, gy: number): boolean {
    return this.isAtStep({ x: gx, y: gy });
  }

  // Helper to get direction from one cell to adjacent cell
  private getDirectionTo(fromX: number, fromY: number, to: { x: number; y: number }): Direction | null {
    if (to.x < fromX) return Direction.LEFT;
    if (to.x > fromX) return Direction.RIGHT;
    if (to.y < fromY) return Direction.UP;
    if (to.y > fromY) return Direction.DOWN;
    return null;
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
      if (wanderDir) this.lastDirection = wanderDir;
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
      if (wanderDir) this.lastDirection = wanderDir;
      return { direction: wanderDir, placeBomb: false };
    }

    this.currentPlan = plan;
    this.escapePathIndex = 0;
    this.moveToSpotPathIndex = 0;

    // Are we already at the bomb spot?
    if (myX === plan.bombX && myY === plan.bombY) {
      // STEP 2: Place bomb and immediately start escaping
      this.lastBombTime = currentTime;
      this.state = 'ESCAPING';

      // Start moving toward escape immediately using the pre-calculated path
      if (plan.escapePath && plan.escapePath.length > 0) {
        const nextStep = plan.escapePath[0];
        const escapeDir = this.getDirectionTo(myX, myY, nextStep);
        if (escapeDir) this.lastDirection = escapeDir;
        return { direction: escapeDir, placeBomb: true };
      }

      return { direction: null, placeBomb: true };
    }

    // Need to move to bomb spot first
    this.state = 'MOVING_TO_BOMB_SPOT';
    const moveDir = this.moveToward(plan.bombX, plan.bombY, myX, myY, grid);
    if (moveDir) {
      this.lastDirection = moveDir;
      this.persistentDirection = moveDir;
      this.persistenceTimer = this.DIRECTION_PERSISTENCE_TIME;
    }
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
      // Re-verify escape route is still valid before placing bomb
      const newEscapePath = this.findEscapePathBFS(grid, myX, myY);

      if (!newEscapePath || newEscapePath.length === 0) {
        // Can't escape safely, abort and find new plan
        this.state = 'FINDING_BOMB_SPOT';
        this.currentPlan = null;
        return { direction: null, placeBomb: false };
      }

      // Update escape path with fresh calculation
      plan.escapePath = newEscapePath;
      plan.escapeX = newEscapePath[newEscapePath.length - 1].x;
      plan.escapeY = newEscapePath[newEscapePath.length - 1].y;
      this.escapePathIndex = 0;

      // Place bomb and escape!
      this.lastBombTime = currentTime;
      this.state = 'ESCAPING';

      const nextStep = newEscapePath[0];
      const escapeDir = this.getDirectionTo(myX, myY, nextStep);
      if (escapeDir) this.lastDirection = escapeDir;
      return { direction: escapeDir, placeBomb: true };
    }

    // Keep moving to bomb spot using planned path if available
    if (plan.moveToSpotPath && this.moveToSpotPathIndex < plan.moveToSpotPath.length) {
      const nextStep = plan.moveToSpotPath[this.moveToSpotPathIndex];

      // If we've reached this step, move to next
      if (this.isAtStep(nextStep)) {
        this.moveToSpotPathIndex++;
        if (this.moveToSpotPathIndex < plan.moveToSpotPath.length) {
          const moveDirInRange = this.getDirectionTo(myX, myY, plan.moveToSpotPath[this.moveToSpotPathIndex]);
          if (moveDirInRange && this.canMove(moveDirInRange, myX, myY, grid, true)) {
            this.lastDirection = moveDirInRange;
            return { direction: moveDirInRange, placeBomb: false };
          }
        }
      } else {
        const moveDirInRange = this.getDirectionTo(myX, myY, nextStep);
        if (moveDirInRange && this.canMove(moveDirInRange, myX, myY, grid, true)) {
          this.lastDirection = moveDirInRange;
          this.persistentDirection = moveDirInRange;
          this.persistenceTimer = this.DIRECTION_PERSISTENCE_TIME;
          return { direction: moveDirInRange, placeBomb: false };
        }
      }
    }

    // Fallback: moveToward
    const moveDir = this.moveToward(plan.bombX, plan.bombY, myX, myY, grid);

    // If we can't move, recalculate
    if (!moveDir) {
      this.state = 'FINDING_BOMB_SPOT';
      this.currentPlan = null;
    } else {
      this.lastDirection = moveDir;
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
      // Check if spot is still safe and walkable
      const plan = this.currentPlan;
      const cell = grid[plan.bombY]?.[plan.bombX];
      if (!cell || !cell.isWalkable || cell.dangerTime < Infinity) {
        // Plan no longer valid
        this.currentPlan = null;
        this.state = 'FINDING_BOMB_SPOT';
        return { direction: null, placeBomb: false };
      }

      // If we have a path, use it
      if (plan.moveToSpotPath && this.moveToSpotPathIndex < plan.moveToSpotPath.length) {
        const nextStep = plan.moveToSpotPath[this.moveToSpotPathIndex];
        if (this.isAtStep(nextStep)) {
          this.moveToSpotPathIndex++;
        }
        if (this.moveToSpotPathIndex < plan.moveToSpotPath.length) {
          const dir = this.getDirectionTo(myX, myY, plan.moveToSpotPath[this.moveToSpotPathIndex]);
          if (dir && this.canMove(dir, myX, myY, grid, true)) {
            this.lastDirection = dir;
            return { direction: dir, placeBomb: false };
          }
        }
      }

      // Fallback
      const dir = this.moveToward(plan.bombX, plan.bombY, myX, myY, grid);
      if (dir) this.lastDirection = dir;
      return { direction: dir, placeBomb: false };
    }

    if (this.state === 'ESCAPING' && this.currentPlan?.escapePath) {
      // Follow the pre-calculated escape path
      if (this.escapePathIndex < this.currentPlan.escapePath.length) {
        const nextStep = this.currentPlan.escapePath[this.escapePathIndex];
        if (this.isAtStep(nextStep)) {
          this.escapePathIndex++;
        }
        if (this.escapePathIndex < this.currentPlan.escapePath.length) {
          const dir = this.getDirectionTo(myX, myY, this.currentPlan.escapePath[this.escapePathIndex]);
          if (dir && this.canMove(dir, myX, myY, grid, false)) {
            this.lastDirection = dir;
            return { direction: dir, placeBomb: false };
          }
        }
      }
    }

    if (this.state === 'ESCAPING' && this.emergencyEscapePath) {
      if (this.emergencyEscapePathIndex < this.emergencyEscapePath.length) {
        const nextStep = this.emergencyEscapePath[this.emergencyEscapePathIndex];
        if (this.isAtStep(nextStep)) {
          this.emergencyEscapePathIndex++;
        }
        if (this.emergencyEscapePathIndex < this.emergencyEscapePath.length) {
          const dir = this.getDirectionTo(myX, myY, this.emergencyEscapePath[this.emergencyEscapePathIndex]);
          if (dir && this.canMove(dir, myX, myY, grid, false)) {
            this.lastDirection = dir;
            return { direction: dir, placeBomb: false };
          }
        }
      }
    }

    if (this.state === 'COLLECTING' && this.collectingPath) {
      if (this.collectingPathIndex < this.collectingPath.length) {
        const nextStep = this.collectingPath[this.collectingPathIndex];
        if (this.isAtStep(nextStep)) {
          this.collectingPathIndex++;
        }
        if (this.collectingPathIndex < this.collectingPath.length) {
          const dir = this.getDirectionTo(myX, myY, this.collectingPath[this.collectingPathIndex]);
          if (dir && this.canMove(dir, myX, myY, grid, true)) {
            this.lastDirection = dir;
            return { direction: dir, placeBomb: false };
          }
        }
      }
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
    const candidates: { bombX: number; bombY: number; escapePath: { x: number; y: number }[]; moveToSpotPath: { x: number; y: number }[]; dist: number }[] = [];

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

        // NEW: Check if we can actually get to this bomb spot safely
        const pathToSpot = this.findPathToBFS(grid, myX, myY, bombX, bombY, true);
        if (!pathToSpot) continue;

        // Find escape route using BFS (proper pathfinding)
        const escapePath = this.findEscapePathBFS(grid, bombX, bombY);
        if (!escapePath || escapePath.length === 0) continue;

        const distToMe = pathToSpot.length;
        candidates.push({ bombX, bombY, escapePath, moveToSpotPath: pathToSpot, dist: distToMe });
      }
    }

    if (candidates.length === 0) return null;

    // Pick closest valid spot
    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];
    const lastStep = best.escapePath[best.escapePath.length - 1];
    return {
      bombX: best.bombX,
      bombY: best.bombY,
      escapeX: lastStep.x,
      escapeY: lastStep.y,
      escapePath: best.escapePath,
      moveToSpotPath: best.moveToSpotPath
    };
  }

  // Find a spot to bomb near destructible blocks
  private findBlockBombSpot(
    grid: DangerCell[][],
    myX: number,
    myY: number
  ): BombPlan | null {
    const candidates: { bombX: number; bombY: number; escapePath: { x: number; y: number }[]; moveToSpotPath: { x: number; y: number }[]; score: number }[] = [];

    // Search for good bomb spots near blocks
    for (let y = 1; y < GRID_HEIGHT - 1; y++) {
      for (let x = 1; x < GRID_WIDTH - 1; x++) {
        if (!this.isValidBombSpot(grid, x, y)) continue;

        // Count adjacent destructible blocks
        const blockCount = this.countAdjacentBlocks(grid, x, y);
        if (blockCount === 0) continue;

        // NEW: Check if we can actually get to this bomb spot safely
        const pathToSpot = this.findPathToBFS(grid, myX, myY, x, y, true);
        if (!pathToSpot) continue;

        // Find escape route using BFS
        const escapePath = this.findEscapePathBFS(grid, x, y);
        if (!escapePath || escapePath.length === 0) continue;

        const dist = pathToSpot.length;
        // Score: more blocks = better, closer = better
        const score = blockCount * 10 - dist;

        candidates.push({ bombX: x, bombY: y, escapePath, moveToSpotPath: pathToSpot, score });
      }
    }

    if (candidates.length === 0) return null;

    // Sort by score (higher is better)
    candidates.sort((a, b) => b.score - a.score);

    // Pick from top candidates with some randomness
    const topN = Math.min(3, candidates.length);
    const pick = Math.floor(Math.random() * topN);
    const best = candidates[pick];
    const lastStep = best.escapePath[best.escapePath.length - 1];

    return {
      bombX: best.bombX,
      bombY: best.bombY,
      escapeX: lastStep.x,
      escapeY: lastStep.y,
      escapePath: best.escapePath,
      moveToSpotPath: best.moveToSpotPath
    };
  }

  // BFS to find path to a specific target
  private findPathToBFS(
    grid: DangerCell[][],
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    safeOnly: boolean = true
  ): { x: number; y: number }[] | null {
    if (startX === targetX && startY === targetY) return [];

    const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [];
    const visited = new Set<string>();

    visited.add(`${startX},${startY}`);
    queue.push({ x: startX, y: startY, path: [] });

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const { dx, dy } of directions) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = `${nx},${ny}`;

        if (visited.has(key)) continue;
        visited.add(key);

        const cell = grid[ny]?.[nx];
        if (!cell || !cell.isWalkable) continue;
        if (safeOnly && cell.dangerTime < Infinity) continue;

        const newPath = [...current.path, { x: nx, y: ny }];

        if (nx === targetX && ny === targetY) {
          return newPath;
        }

        queue.push({ x: nx, y: ny, path: newPath });
      }
    }

    return null;
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

  // NEW: BFS-based escape path finding - guarantees a valid cardinal-direction path
  private findEscapePathBFS(grid: DangerCell[][], bombX: number, bombY: number): { x: number; y: number }[] | null {
    const bombRange = this.player.bombRange;
    const playerSpeed = this.player.getEffectiveSpeed();
    const maxEscapeTime = BOMB_FUSE_TIME - 0.3; // Safety margin

    // Create a danger grid that includes the bomb we're about to place
    const simulatedDanger = this.simulateBombDanger(grid, bombX, bombY, bombRange);

    // BFS to find nearest safe cell
    const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [];
    const visited = new Set<string>();

    queue.push({ x: bombX, y: bombY, path: [] });
    visited.add(`${bombX},${bombY}`);

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const { dx, dy } of directions) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = `${nx},${ny}`;

        if (visited.has(key)) continue;
        visited.add(key);

        const cell = grid[ny]?.[nx];
        if (!cell || !cell.isWalkable) continue;

        const newPath = [...current.path, { x: nx, y: ny }];

        // Check if we can reach this cell in time
        const timeToReach = newPath.length / playerSpeed;
        if (timeToReach >= maxEscapeTime) continue;

        // Check if this cell is safe from the new bomb
        if (!simulatedDanger.has(key) && cell.dangerTime === Infinity) {
          // Found a safe cell!
          return newPath;
        }

        // Continue searching
        queue.push({ x: nx, y: ny, path: newPath });
      }
    }

    return null; // No escape path found
  }

  // Simulate which cells will be dangerous after placing a bomb
  private simulateBombDanger(grid: DangerCell[][], bombX: number, bombY: number, range: number): Set<string> {
    const danger = new Set<string>();
    danger.add(`${bombX},${bombY}`);

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    for (const { dx, dy } of directions) {
      for (let i = 1; i <= range; i++) {
        const tx = bombX + dx * i;
        const ty = bombY + dy * i;

        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

        const cell = grid[ty]?.[tx];
        if (!cell || (!cell.isWalkable && !cell.hasBomb)) break;

        danger.add(`${tx},${ty}`);

        // Stop at destructible blocks (they block the blast but get destroyed)
        if (!cell.isWalkable && cell.hasDestructibleBlock) break;
      }
    }

    return danger;
  }

  // NEW: BFS-based emergency escape path finding. Finds full path to safety.
  private findEmergencyEscapePathBFS(grid: DangerCell[][], myX: number, myY: number): { x: number; y: number }[] | null {
    const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [];
    const visited = new Set<string>();

    visited.add(`${myX},${myY}`);

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    queue.push({ x: myX, y: myY, path: [] });

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const { dx, dy } of directions) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = `${nx},${ny}`;

        if (visited.has(key)) continue;
        visited.add(key);

        const cell = grid[ny]?.[nx];
        if (!cell || !cell.isWalkable) continue;

        const newPath = [...current.path, { x: nx, y: ny }];

        // Found safety!
        if (cell.dangerTime === Infinity) {
          return newPath;
        }

        queue.push({ x: nx, y: ny, path: newPath });
      }
    }

    return null;
  }

  // NEW: BFS-based escape direction finding for emergency situations
  private findBestEscapeDirectionBFS(grid: DangerCell[][], myX: number, myY: number): Direction | null {
    // BFS to find nearest safe cell
    const queue: { x: number; y: number; firstDir: Direction }[] = [];
    const visited = new Set<string>();

    visited.add(`${myX},${myY}`);

    const directions = [
      { dir: Direction.UP, dx: 0, dy: -1 },
      { dir: Direction.DOWN, dx: 0, dy: 1 },
      { dir: Direction.LEFT, dx: -1, dy: 0 },
      { dir: Direction.RIGHT, dx: 1, dy: 0 }
    ];

    // Add initial moves
    for (const { dir, dx, dy } of directions) {
      const nx = myX + dx;
      const ny = myY + dy;
      const key = `${nx},${ny}`;

      const cell = grid[ny]?.[nx];
      if (!cell || !cell.isWalkable) continue;

      visited.add(key);

      // If immediate neighbor is safe, go there!
      if (cell.dangerTime === Infinity) {
        return dir;
      }

      queue.push({ x: nx, y: ny, firstDir: dir });
    }

    // BFS to find path to safety
    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const { dx, dy } of directions) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = `${nx},${ny}`;

        if (visited.has(key)) continue;
        visited.add(key);

        const cell = grid[ny]?.[nx];
        if (!cell || !cell.isWalkable) continue;

        // Found safety!
        if (cell.dangerTime === Infinity) {
          return current.firstDir;
        }

        queue.push({ x: nx, y: ny, firstDir: current.firstDir });
      }
    }

    // No safe path found - try to move to cell with most time remaining
    let bestDir: Direction | null = null;
    let bestTime = -Infinity;

    for (const { dir, dx, dy } of directions) {
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

    // Determine opposite of last direction to avoid oscillation
    const oppositeDir = this.getOppositeDirection(this.lastDirection);

    for (const { dir, dx, dy } of directions) {
      const nx = myX + dx;
      const ny = myY + dy;

      const cell = grid[ny]?.[nx];
      if (!cell || !cell.isWalkable || !this.canMove(dir, myX, myY, grid, true)) continue;

      let score = 0;

      // ANTI-OSCILLATION: Penalize going back the way we came
      if (dir === oppositeDir) {
        score -= 100;
      }

      // Bonus for cells near blocks
      const blockNeighbors = this.countAdjacentBlocks(grid, nx, ny);
      score += blockNeighbors * 20;

      // Bonus for cells with power-ups nearby
      if (cell.hasPowerUp) score += 50;

      // Small random factor (but not enough to override anti-oscillation)
      score += Math.random() * 5;

      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return bestDir;
  }

  private getOppositeDirection(dir: Direction | null): Direction | null {
    if (!dir) return null;
    switch (dir) {
      case Direction.UP: return Direction.DOWN;
      case Direction.DOWN: return Direction.UP;
      case Direction.LEFT: return Direction.RIGHT;
      case Direction.RIGHT: return Direction.LEFT;
    }
  }

  private findNearbyPowerUp(
    grid: DangerCell[][],
    powerUps: PowerUp[],
    myX: number,
    myY: number
  ): { x: number; y: number; path: { x: number; y: number }[] } | null {
    let nearest: { x: number; y: number; dist: number; path: { x: number; y: number }[] } | null = null;

    for (const powerUp of powerUps) {
      if (!powerUp.isActive) continue;

      const px = powerUp.position.gridX;
      const py = powerUp.position.gridY;

      const cell = grid[py]?.[px];
      if (!cell || cell.dangerTime < Infinity) continue;

      // Find path to power-up
      const path = this.findPathToBFS(grid, myX, myY, px, py, true);
      if (!path) continue;

      const dist = path.length;

      // Only pick up close power-ups
      if (dist <= 5 && (!nearest || dist < nearest.dist)) {
        nearest = { x: px, y: py, dist, path };
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

    // Try other directions, but avoid going back the way we came
    const oppositeDir = this.getOppositeDirection(this.lastDirection);
    const allDirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];

    // First try non-opposite directions
    for (const dir of allDirs) {
      if (dir !== oppositeDir && !preferredDirs.includes(dir) && this.canMove(dir, myX, myY, grid, true)) {
        return dir;
      }
    }

    // Last resort: go backwards
    if (oppositeDir && this.canMove(oppositeDir, myX, myY, grid, true)) {
      return oppositeDir;
    }

    return null;
  }

  private canMove(dir: Direction, myX: number, myY: number, grid: DangerCell[][], safeOnly: boolean = true): boolean {
    let nx = myX;
    let ny = myY;

    switch (dir) {
      case Direction.UP: ny--; break;
      case Direction.DOWN: ny++; break;
      case Direction.LEFT: nx--; break;
      case Direction.RIGHT: nx++; break;
    }

    const cell = grid[ny]?.[nx];
    if (!cell || !cell.isWalkable) return false;

    // Safety check: don't walk into danger unless explicitly allowed
    if (safeOnly && cell.dangerTime < Infinity) return false;

    return true;
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
