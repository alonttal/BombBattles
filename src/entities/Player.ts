import { Entity } from './Entity';
import {
  TILE_SIZE,
  COLORS,
  Direction,
  DEFAULT_PLAYER_SPEED,
  DEFAULT_BOMB_COUNT,
  DEFAULT_BOMB_RANGE,
  MAX_BOMB_COUNT,
  MAX_BOMB_RANGE,
  MAX_SPEED
} from '../constants';
import { EventBus } from '../core/EventBus';

export enum BombType {
  NORMAL = 'normal',
  FIRE = 'fire',
  ICE = 'ice',
  PIERCING = 'piercing'
}

const PLAYER_COLORS = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];

export class Player extends Entity {
  public readonly playerIndex: number;
  public speed: number = DEFAULT_PLAYER_SPEED;
  public maxBombs: number = DEFAULT_BOMB_COUNT;
  public activeBombs: number = 0;
  public bombRange: number = DEFAULT_BOMB_RANGE;
  public bombType: BombType = BombType.NORMAL;

  public abilities: Set<string> = new Set();
  private shieldActive: boolean = false;
  public teleportCharges: number = 0;

  private isAlive: boolean = true;
  private deathAnimationProgress: number = 0;
  private direction: Direction = Direction.DOWN;
  private isMoving: boolean = false;
  private animationFrame: number = 0;
  private animationTimer: number = 0;

  // Juice
  private blinkTimer: number = 0;
  private isBlinking: boolean = false;
  private nextBlinkTime: number = Math.random() * 3 + 2;
  private squashX: number = 1;
  private squashY: number = 1;
  private targetSquashX: number = 1;
  private targetSquashY: number = 1;
  private hitFlashTimer: number = 0;

  // Punch animation
  private isPunching: boolean = false;
  private punchAnimationTimer: number = 0;
  private punchAnimationDuration: number = 0.3;

  // Victory animation
  public isVictory: boolean = false;
  private victoryTimer: number = 0;

  // Teleport animation
  public isTeleporting: boolean = false;
  public teleportPhase: 'out' | 'in' = 'out';
  public teleportProgress: number = 0;
  public teleportTarget: { gridX: number, gridY: number } | null = null;
  private readonly teleportDuration: number = 0.4; // 0.4s out, 0.4s in

  // For debuffs
  private debuffs: Map<string, number> = new Map();

  // Bomb pushback (juicy collision response)
  private pushbackVelocityX: number = 0;
  private pushbackVelocityY: number = 0;
  private pushbackDecay: number = 12; // How fast pushback decays
  private pushbackSquashTimer: number = 0;

  constructor(gridX: number, gridY: number, playerIndex: number) {
    super(gridX, gridY);
    this.playerIndex = playerIndex;
  }

  update(deltaTime: number): void {
    if (!this.isAlive) {
      this.deathAnimationProgress += deltaTime * 2;
      if (this.deathAnimationProgress >= 1) {
        this.isActive = false;
      }
      return;
    }

    // Update debuff timers
    for (const [debuff, time] of this.debuffs) {
      const newTime = time - deltaTime;
      if (newTime <= 0) {
        this.debuffs.delete(debuff);
      } else {
        this.debuffs.set(debuff, newTime);
      }
    }

    // Apply pushback velocity (bomb collision response)
    if (Math.abs(this.pushbackVelocityX) > 0.1 || Math.abs(this.pushbackVelocityY) > 0.1) {
      this.position.pixelX += this.pushbackVelocityX * deltaTime;
      this.position.pixelY += this.pushbackVelocityY * deltaTime;

      // Update grid position
      this.position.gridX = Math.round(this.position.pixelX / TILE_SIZE);
      this.position.gridY = Math.round(this.position.pixelY / TILE_SIZE);

      // Decay pushback with easing
      this.pushbackVelocityX *= Math.exp(-this.pushbackDecay * deltaTime);
      this.pushbackVelocityY *= Math.exp(-this.pushbackDecay * deltaTime);
    } else {
      this.pushbackVelocityX = 0;
      this.pushbackVelocityY = 0;
    }

    // Pushback squash timer
    if (this.pushbackSquashTimer > 0) {
      this.pushbackSquashTimer -= deltaTime;
    }

    // --- Juicy Animation Logic ---
    let baseSquashX = 1;
    let baseSquashY = 1;

    if (this.isMoving) {
      this.animationTimer += deltaTime;
      const stepDuration = 0.1;
      if (this.animationTimer >= stepDuration) {
        this.animationTimer = 0;
        this.animationFrame = (this.animationFrame + 1) % 4;
        if (this.animationFrame === 0 || this.animationFrame === 2) {
          EventBus.emit('player-step', { player: this });
        }
      }

      // Continuous movement wobble
      const wobbleAmount = 0.08 + (this.speed / MAX_SPEED) * 0.05;
      const wobble = Math.sin(performance.now() * 0.015) * wobbleAmount;
      baseSquashX = 1 + wobble;
      baseSquashY = 1 - wobble;

      // Speed trail
      if (this.speed > DEFAULT_PLAYER_SPEED && Math.random() < 0.3) {
        EventBus.emit('player-trail', { player: this });
      }
    } else {
      this.animationFrame = 0;
      // Idle breathing
      const breatheSpeed = 0.003;
      const breatheAmount = 0.03;
      const breathe = Math.sin(performance.now() * breatheSpeed) * breatheAmount;
      baseSquashX = 1 + breathe;
      baseSquashY = 1 - breathe;
    }

    this.targetSquashX = baseSquashX;
    this.targetSquashY = baseSquashY;

    // Apply pushback squash (overrides base)
    if (this.pushbackSquashTimer > 0) {
      this.pushbackSquashTimer -= deltaTime;
      const t = this.pushbackSquashTimer / 0.15;
      const squash = Math.sin(t * Math.PI) * 0.3;
      this.targetSquashX = 1 + squash;
      this.targetSquashY = 1 - squash * 0.5;
    }

    // Lerp towards target squash
    const squashLerpSpeed = 15;
    this.squashX += (this.targetSquashX - this.squashX) * deltaTime * squashLerpSpeed;
    this.squashY += (this.targetSquashY - this.squashY) * deltaTime * squashLerpSpeed;

    // Update Hit Flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= deltaTime;
    }

    // Blinking
    this.blinkTimer += deltaTime;
    if (this.isBlinking) {
      if (this.blinkTimer > 0.1) {
        this.isBlinking = false;
        this.blinkTimer = 0;
        this.nextBlinkTime = Math.random() * 3 + 2;
      }
    } else {
      if (this.blinkTimer > this.nextBlinkTime) {
        this.isBlinking = true;
        this.blinkTimer = 0;
      }
    }

    // Punch animation
    if (this.isPunching) {
      this.punchAnimationTimer += deltaTime;
      if (this.punchAnimationTimer >= this.punchAnimationDuration) {
        this.isPunching = false;
        this.punchAnimationTimer = 0;
      }
    }

    // Victory animation
    if (this.isVictory) {
      this.victoryTimer += deltaTime * 5;
    }

    // Teleport animation
    if (this.isTeleporting) {
      if (this.teleportPhase === 'out') {
        this.teleportProgress += deltaTime / this.teleportDuration;
        if (this.teleportProgress >= 1) {
          this.teleportPhase = 'in';
          this.teleportProgress = 0;
          if (this.teleportTarget) {
            this.position.gridX = this.teleportTarget.gridX;
            this.position.gridY = this.teleportTarget.gridY;
            this.position.pixelX = this.teleportTarget.gridX * TILE_SIZE;
            this.position.pixelY = this.teleportTarget.gridY * TILE_SIZE;
            EventBus.emit('teleport-arrived', { player: this });
          }
        }
      } else {
        this.teleportProgress += deltaTime / this.teleportDuration;
        if (this.teleportProgress >= 1) {
          this.isTeleporting = false;
          this.teleportProgress = 0;
          this.teleportTarget = null;
        }
      }
    }
  }

  startPunchAnimation(): void {
    this.isPunching = true;
    this.punchAnimationTimer = 0;
  }

  setVictory(): void {
    this.isVictory = true;
    this.stopMoving();
  }

  applyPushback(directionX: number, directionY: number, strength: number = 200): void {
    // Only apply new pushback if not already being pushed back significantly
    const currentPushbackMagnitude = Math.sqrt(
      this.pushbackVelocityX * this.pushbackVelocityX +
      this.pushbackVelocityY * this.pushbackVelocityY
    );
    if (currentPushbackMagnitude > strength * 0.3) {
      return; // Already being pushed, don't stack
    }

    // Normalize direction
    const length = Math.sqrt(directionX * directionX + directionY * directionY);
    if (length > 0) {
      this.pushbackVelocityX = (directionX / length) * strength;
      this.pushbackVelocityY = (directionY / length) * strength;
      this.pushbackSquashTimer = 0.15; // Trigger squash effect
      EventBus.emit('player-pushback', { player: this });
    }
  }

  render(ctx: CanvasRenderingContext2D, interpolation: number): void {
    const pos = this.getInterpolatedPosition(interpolation);
    const x = pos.x;
    const y = pos.y;
    const color = PLAYER_COLORS[this.playerIndex];

    if (!this.isAlive) {
      // Death animation: Spin and shrink
      const progress = this.deathAnimationProgress;
      const scale = 1 - progress;
      const rotation = progress * Math.PI * 4; // 2 spins

      ctx.save();
      ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);
      ctx.translate(-(x + TILE_SIZE / 2), -(y + TILE_SIZE / 2));

      ctx.globalAlpha = Math.max(0, 1 - progress);
      this.drawPlayer(ctx, x, y, color);
      ctx.globalAlpha = 1;

      ctx.restore();
      return;
    }

    // Teleport effect
    if (this.isTeleporting) {
      const progress = this.teleportProgress;
      let scale = 1;
      let rotation = 0;
      let alpha = 1;

      if (this.teleportPhase === 'out') {
        scale = 1 - progress;
        rotation = progress * Math.PI * 4; // 720 degrees
        alpha = 1 - progress;
      } else {
        scale = progress;
        rotation = (1 - progress) * Math.PI * -4;
        alpha = progress;
      }

      ctx.save();
      ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);
      ctx.translate(-(x + TILE_SIZE / 2), -(y + TILE_SIZE / 2));

      ctx.globalAlpha = alpha;
      this.drawPlayer(ctx, x, y, color);
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    // Draw shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x + TILE_SIZE / 2, y + TILE_SIZE - 6, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw player
    this.drawPlayer(ctx, x, y, color);

    // Hit Flash Overlay
    if (this.hitFlashTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, this.hitFlashTimer / 0.2) * 0.6;
      this.drawPlayer(ctx, x, y, '#ffffff'); // Draw purely white version
      ctx.restore();
    }

    // Shield effect
    if (this.shieldActive) {
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TILE_SIZE / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    const bobOffset = this.isMoving ? Math.sin(this.animationFrame * Math.PI / 2) * 2 : 0;
    const victoryOffset = this.isVictory ? Math.sin(this.victoryTimer) * 5 - 5 : 0;

    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2 + bobOffset + victoryOffset;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this.squashX, this.squashY);

    // Helpers
    const drawHand = (xOffset: number, yOffset: number, isRightHand: boolean) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();

      let bx = xOffset;
      let by = yOffset;

      // Punch logic
      if (this.isPunching) {
        let isPunchingHand = false;
        if (this.direction === Direction.RIGHT && isRightHand) isPunchingHand = true;
        if (this.direction === Direction.LEFT && !isRightHand) isPunchingHand = true;
        if (this.direction === Direction.DOWN && isRightHand) isPunchingHand = true;
        if (this.direction === Direction.UP && !isRightHand) isPunchingHand = true;

        if (isPunchingHand) {
          const punchProgress = this.punchAnimationTimer / this.punchAnimationDuration;
          const punchExtend = Math.sin(punchProgress * Math.PI) * 12;

          switch (this.direction) {
            case Direction.RIGHT: bx += punchExtend; break;
            case Direction.LEFT: bx -= punchExtend; break;
            case Direction.UP: by -= punchExtend; break;
            case Direction.DOWN: by += punchExtend; break;
          }
        }
      }

      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    const drawBody = () => {
      // Outer glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;

      // Main body with gradient shading
      const bodyGradient = ctx.createRadialGradient(-4, -10, 2, 0, 0, 20);
      bodyGradient.addColorStop(0, this.lightenColor(color, 30)); // Highlight
      bodyGradient.addColorStop(0.5, color); // Mid
      bodyGradient.addColorStop(1, this.darkenColor(color, 20)); // Shadow

      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.arc(0, -4, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Bold outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Rim light (edge highlight)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -4, 14, -Math.PI * 0.7, -Math.PI * 0.2);
      ctx.stroke();

      // Top shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.ellipse(-4, -12, 6, 4, -0.3, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawFeet = () => {
      const footOffset = this.isMoving ? Math.cos(this.animationFrame * Math.PI) * 6 : 0;
      ctx.fillStyle = color;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;

      // Left Foot
      ctx.beginPath();
      ctx.ellipse(-8, 12 + footOffset, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Right Foot
      ctx.beginPath();
      ctx.ellipse(8, 12 - footOffset, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };

    // --- Z-Sorting Logic ---

    // Base hand offsets (vertical oscillation)
    // handOffset was `sin(frame) * 6`
    // Left uses +offset, Right uses -offset (or vice versa) in previous logic.
    // Let's use that for standard vertical swing.
    const swingAmount = this.isMoving ? Math.sin(this.animationFrame * Math.PI) * 6 : 0;
    let leftHandY = swingAmount;
    let rightHandY = -swingAmount;

    if (this.isVictory) {
      leftHandY = -8;
      rightHandY = -8;
    }

    // Determine Z-Depth
    // Higher Z = Drawn Later (On Top). Body is Z=0.

    let leftHandZ = 0;
    let rightHandZ = 0;
    const bodyZ = 0;

    if (this.direction === Direction.UP) {
      // Walking Away: Generally back, but if we want "interchanging",
      // we can let the "forward-swinging" arm come in front?
      // No, for walking away, arms in front of body looks weird. Keep them back.
      leftHandZ = -1;
      rightHandZ = -1;
    } else if (this.direction === Direction.DOWN) {
      // Walking Towards: Generally front.
      leftHandZ = 1;
      rightHandZ = 1;
    } else {
      // Side view (Left/Right)
      // This is where we interchange depth!

      // Determine which arm is swinging "Forward" (into the screen / front of body)
      // Usually "Front" arm (closest to camera) is Z=1. "Back" arm is Z=-1.
      // But user wants them to switch.

      const swingPhase = Math.sin(this.animationFrame * Math.PI);

      if (this.direction === Direction.RIGHT) {
        // Facing Right.
        // Right Arm is "Front" (14px). Left Arm is "Back" (-14px).
        // Standard: Right=1, Left=-1.
        // Interchange: If swing > 0, Right=1. If swing < 0, Right=-1.
        //              If swing < 0, Left=1.  If swing > 0, Left=-1.

        rightHandZ = swingPhase > 0 ? 1 : -1;
        leftHandZ = swingPhase < 0 ? 1 : -1;

      } else { // LEFT
        // Facing Left.
        // Left Arm is "Front" (-14px). Right Arm is "Back" (14px).

        leftHandZ = swingPhase > 0 ? 1 : -1;
        rightHandZ = swingPhase < 0 ? 1 : -1;
      }
    }

    if (!this.isMoving) {
      // Reset to standard idle layering
      if (this.direction === Direction.UP) { leftHandZ = -1; rightHandZ = -1; }
      else if (this.direction === Direction.DOWN) { leftHandZ = 1; rightHandZ = 1; }
      else if (this.direction === Direction.RIGHT) { leftHandZ = -1; rightHandZ = 1; }
      else { leftHandZ = 1; rightHandZ = -1; }

      leftHandY = 0;
      rightHandY = 0;
    }

    // Sort and Draw
    drawFeet(); // Feet always bottom-most layer?

    const entities = [
      { id: 'body', z: bodyZ, draw: drawBody },
      // X offsets: If Facing Right, Right Hand is at +14, Left at -14.
      // If Facing Left, Left Hand is at -14, Right at +14.
      // So offsets are constant regardless of facing? Yes, -14 is always Left, +14 is Right relative to sprite center.
      { id: 'left', z: leftHandZ, draw: () => drawHand(-14, leftHandY, false) },
      { id: 'right', z: rightHandZ, draw: () => drawHand(14, rightHandY, true) }
    ];

    entities.sort((a, b) => a.z - b.z);
    entities.forEach(e => e.draw());

    // Face
    ctx.fillStyle = '#ffffff';
    const eyeOffsetX = this.direction === Direction.LEFT ? -4 : this.direction === Direction.RIGHT ? 4 : 0;
    const eyeOffsetY = this.direction === Direction.UP ? -3 : this.direction === Direction.DOWN ? 2 : 0;

    if (this.direction !== Direction.UP) {
      this.drawEye(ctx, -5 + eyeOffsetX, -6 + eyeOffsetY);
      this.drawEye(ctx, 5 + eyeOffsetX, -6 + eyeOffsetY);
    }



    ctx.restore();
  }

  private drawEye(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (this.isBlinking) {
      ctx.beginPath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x + 3, y);
      ctx.stroke();
    } else {
      // Eye white with outline
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pupil - shifts based on direction for eye tracking effect
      let pupilOffsetX = 0;
      let pupilOffsetY = 0;

      if (this.isMoving) {
        switch (this.direction) {
          case Direction.LEFT: pupilOffsetX = -1.5; break;
          case Direction.RIGHT: pupilOffsetX = 1.5; break;
          case Direction.UP: pupilOffsetY = -1; break;
          case Direction.DOWN: pupilOffsetY = 1; break;
        }
      }

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(x + pupilOffsetX, y + pupilOffsetY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Eye shine (makes it look alive!) - also shifts with pupil
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(x + pupilOffsetX - 0.5, y + pupilOffsetY - 1, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  move(direction: Direction, deltaTime: number): void {
    this.direction = direction;
    this.isMoving = true;

    const effectiveSpeed = this.getEffectiveSpeed();
    const moveAmount = effectiveSpeed * TILE_SIZE * deltaTime;

    switch (direction) {
      case Direction.UP:
        this.position.pixelY -= moveAmount;
        break;
      case Direction.DOWN:
        this.position.pixelY += moveAmount;
        break;
      case Direction.LEFT:
        this.position.pixelX -= moveAmount;
        break;
      case Direction.RIGHT:
        this.position.pixelX += moveAmount;
        break;
    }

    // Update grid position
    this.position.gridX = Math.round(this.position.pixelX / TILE_SIZE);
    this.position.gridY = Math.round(this.position.pixelY / TILE_SIZE);
  }

  stopMoving(): void {
    this.isMoving = false;
  }

  getEffectiveSpeed(): number {
    if (this.debuffs.has('slow')) {
      return this.speed * 0.5;
    }
    return this.speed;
  }

  canPlaceBomb(): boolean {
    return this.isAlive && this.activeBombs < this.maxBombs;
  }

  placeBomb(): void {
    if (this.canPlaceBomb()) {
      this.activeBombs++;
      // Juice: Small squash on place
      this.triggerSquash(0.2, 0.1);
      EventBus.emit('bomb-placed', {
        gridX: this.position.gridX,
        gridY: this.position.gridY,
        owner: this
      });
    }
  }

  onBombExploded(): void {
    this.activeBombs = Math.max(0, this.activeBombs - 1);
  }

  die(): void {
    if (this.shieldActive) {
      this.shieldActive = false;
      this.hitFlashTimer = 0.3; // White flash on shield break
      EventBus.emit('shield-consumed', { player: this });
      return;
    }
    this.isAlive = false;
    console.log(`[DEBUG] Player ${this.playerIndex} died at (${this.position.gridX}, ${this.position.gridY})`);
    EventBus.emit('player-died', { player: this });
  }

  isPlayerAlive(): boolean {
    return this.isAlive;
  }

  // Power-up methods
  addBomb(): void {
    this.maxBombs = Math.min(this.maxBombs + 1, MAX_BOMB_COUNT);
  }

  addRange(): void {
    this.bombRange = Math.min(this.bombRange + 1, MAX_BOMB_RANGE);
  }

  addSpeed(): void {
    this.speed = Math.min(this.speed + 0.5, MAX_SPEED);
  }

  grantShield(): void {
    this.shieldActive = true;
  }

  hasShield(): boolean {
    return this.shieldActive;
  }

  addAbility(ability: string): void {
    this.abilities.add(ability);
    if (ability === 'teleport' && this.teleportCharges < 3) {
      this.teleportCharges = 3; // Give initial charges
    }
  }

  hasAbility(ability: string): boolean {
    return this.abilities.has(ability);
  }

  addTeleportCharge(): void {
    this.teleportCharges = Math.min(this.teleportCharges + 1, 3);
  }

  applyDebuff(debuff: string, duration: number): void {
    this.debuffs.set(debuff, duration);
    this.hitFlashTimer = 0.2; // Feedback for getting debuffed (e.g. skull)
  }

  setBombType(type: BombType): void {
    this.bombType = type;
  }

  getDirection(): Direction {
    return this.direction;
  }

  useTeleport(targetGridX: number, targetGridY: number): void {
    if (this.teleportCharges > 0 && !this.isTeleporting) {
      this.isTeleporting = true;
      this.teleportPhase = 'out';
      this.teleportProgress = 0;
      this.teleportTarget = { gridX: targetGridX, gridY: targetGridY };
      this.teleportCharges--;
      // Juice: squash on teleport out
      this.triggerSquash(0.4, 0.2);
      EventBus.emit('teleport-start', { player: this });
    }
  }

  triggerSquash(_amount: number, duration: number): void {
    this.pushbackSquashTimer = duration;
    // We reuse this logic but can be more specific if needed
  }

  canTeleport(): boolean {
    return this.hasAbility('teleport') && this.teleportCharges > 0 && !this.isTeleporting;
  }

  // Color manipulation helpers
  private lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
  }

  private darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
  }
}
