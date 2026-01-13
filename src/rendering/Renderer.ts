import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE, GRID_WIDTH, GRID_HEIGHT, COLORS } from '../constants';
import { Player, BombType } from '../entities/Player';
import { Bomb } from '../entities/Bomb';
import { Block } from '../entities/Block';
import { Explosion } from '../entities/Explosion';
import { PowerUp } from '../entities/PowerUp';
import { FloatingText } from './FloatingText';
import { ScoreManager } from '../core/ScoreManager';
import { ParticleSystem } from './ParticleSystem';
import { Camera } from './Camera';

export interface RenderState {
  players: Player[];
  bombs: Bomb[];
  blocks: Block[];
  explosions: Explosion[];
  powerUps: PowerUp[];
  floatingTexts: FloatingText[];
  scores: ScoreManager;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particleSystem: ParticleSystem;
  private camera: Camera;
  private baseWidth: number = CANVAS_WIDTH;
  private baseHeight: number = CANVAS_HEIGHT;
  private scale: number = 1;
  private lightingCanvas: HTMLCanvasElement;
  private lightingCtx: CanvasRenderingContext2D;

  // Screen juice
  private colorOverlay: string | null = null;
  private colorOverlayAlpha: number = 0;
  private colorOverlayDuration: number = 0;
  private colorOverlayTimer: number = 0;
  private hitStopTimer: number = 0;
  private hudAnimationTimer: number = 0;
  private lastScores: number[] = [0, 0, 0, 0];
  private cardScorePulse: number[] = [0, 0, 0, 0];

  // NEW: Animated background elements
  private clouds: { x: number; y: number; size: number; speed: number }[] = [];
  private grassWaveTime: number = 0;
  private windParticleTimer: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.particleSystem = new ParticleSystem();
    this.camera = new Camera();

    // Setup lighting canvas
    this.lightingCanvas = document.createElement('canvas');
    this.lightingCanvas.width = CANVAS_WIDTH;
    this.lightingCanvas.height = CANVAS_HEIGHT;
    this.lightingCtx = this.lightingCanvas.getContext('2d')!;

    // Set initial canvas size
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    // Pixel-perfect rendering
    this.ctx.imageSmoothingEnabled = false;

    // NEW: Initialize clouds
    for (let i = 0; i < 4; i++) {
      this.clouds.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT * 0.4, // Top 40% of screen
        size: 40 + Math.random() * 30,
        speed: 5 + Math.random() * 10
      });
    }

    // Setup resize handler
    this.setupResize();
    this.resize();
  }

  private setupResize(): void {
    const resizeHandler = () => {
      this.resize();
    };

    window.addEventListener('resize', resizeHandler);

    // Also handle orientation changes on mobile
    window.addEventListener('orientationchange', () => {
      setTimeout(resizeHandler, 100);
    });
  }

  private resize(): void {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Calculate aspect ratio
    const gameAspect = this.baseWidth / this.baseHeight;
    const windowAspect = windowWidth / windowHeight;

    let scale: number;

    // Determine scale to fit window while maintaining aspect ratio
    if (windowAspect > gameAspect) {
      // Window is wider than game - fit to height
      scale = windowHeight / this.baseHeight;
    } else {
      // Window is taller than game - fit to width
      scale = windowWidth / this.baseWidth;
    }

    // Use exact scale to fill the window
    // scale = Math.floor(scale * 2) / 2; 

    this.scale = scale;

    // Calculate final dimensions
    const displayWidth = Math.ceil(this.baseWidth * scale);
    const displayHeight = Math.ceil(this.baseHeight * scale);

    // Set canvas display size
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;

    // Set internal resolution to match display size for crisp text
    this.canvas.width = displayWidth;
    this.canvas.width = displayWidth;
    this.canvas.height = displayHeight;

    // Resize lighting canvas (match internal game resolution)
    this.lightingCanvas.width = CANVAS_WIDTH;
    this.lightingCanvas.height = CANVAS_HEIGHT;

    // Reapply rendering settings
    this.ctx.imageSmoothingEnabled = false;
  }

  update(deltaTime: number): void {
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= deltaTime;
      return;
    }

    this.hudAnimationTimer += deltaTime;
    this.particleSystem.update(deltaTime);
    this.camera.update(deltaTime);

    // NEW: Update clouds (drift slowly to the right)
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * deltaTime;
      // Wraparound
      if (cloud.x > CANVAS_WIDTH + cloud.size) {
        cloud.x = -cloud.size;
        cloud.y = Math.random() * CANVAS_HEIGHT * 0.4;
      }
    }

    // NEW: Update grass wave animation
    this.grassWaveTime += deltaTime;

    // NEW: Spawn ambient wind particles occasionally
    this.windParticleTimer += deltaTime;
    if (this.windParticleTimer > 2.0) { // Every 2 seconds
      this.windParticleTimer = 0;
      this.particleSystem.emitPreset(
        'windParticles',
        -10, // Start off-screen left
        Math.random() * CANVAS_HEIGHT
      );
    }

    // Update card pulses
    for (let i = 0; i < 4; i++) {
      if (this.cardScorePulse[i] > 0) {
        this.cardScorePulse[i] -= deltaTime;
      }
    }

    // Update color overlay
    if (this.colorOverlay) {
      this.colorOverlayTimer += deltaTime;
      if (this.colorOverlayTimer >= this.colorOverlayDuration) {
        this.colorOverlay = null;
        this.colorOverlayAlpha = 0;
      } else {
        // Fade out
        this.colorOverlayAlpha = 1 - (this.colorOverlayTimer / this.colorOverlayDuration);
      }
    }
  }

  freeze(duration: number): void {
    this.hitStopTimer = duration;
  }

  isFrozen(): boolean {
    return this.hitStopTimer > 0;
  }

  triggerColorFlash(color: string, duration: number): void {
    this.colorOverlay = color;
    this.colorOverlayDuration = duration;
    this.colorOverlayTimer = 0;
    this.colorOverlayAlpha = 1;
  }

  render(state: RenderState, interpolation: number): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);

    // Clear canvas with bright gradient background
    const gradient = this.ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, Math.max(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.7
    );
    gradient.addColorStop(0, '#87CEEB'); // Sky blue center
    gradient.addColorStop(0.5, '#6BB6D6'); // Medium blue
    gradient.addColorStop(1, '#4A9EC1'); // Deeper blue edge
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Apply camera transform
    this.ctx.save();
    this.camera.applyCenteredTransform(this.ctx, CANVAS_WIDTH, CANVAS_HEIGHT);

    // NEW: Draw drifting clouds (behind ground)
    this.renderClouds();

    // Draw ground
    this.renderGround();

    // Draw blocks
    for (const block of state.blocks) {
      if (block.isActive) {
        block.render(this.ctx, interpolation);
      }
    }

    // Draw power-ups
    for (const powerUp of state.powerUps) {
      if (powerUp.isActive) {
        powerUp.render(this.ctx, interpolation);
      }
    }

    // Draw bombs
    for (const bomb of state.bombs) {
      if (bomb.isActive) {
        bomb.render(this.ctx, interpolation);
      }
    }

    // Draw players (sorted by Y for proper overlap)
    const sortedPlayers = [...state.players]
      .filter(p => p.isActive)
      .sort((a, b) => a.position.pixelY - b.position.pixelY);

    for (const player of sortedPlayers) {
      player.render(this.ctx, interpolation);
    }

    // Draw explosions (on top of everything except UI)
    for (const explosion of state.explosions) {
      if (explosion.isActive) {
        explosion.render(this.ctx, interpolation);
      }
    }

    // Draw particles (on top of explosions)
    this.particleSystem.render(this.ctx);

    // Draw floating texts
    for (const text of state.floatingTexts) {
      text.render(this.ctx);
    }

    // Draw lighting overlay (Re-enabled with fix)
    this.renderLighting(state);

    // Restore camera transform
    this.ctx.restore();
    // Restore scale translation
    this.ctx.restore();

    // Draw color overlay (fullscreen, unaffected by camera)
    if (this.colorOverlay) {
      this.ctx.save();
      this.ctx.fillStyle = this.colorOverlay;
      this.ctx.globalAlpha = this.colorOverlayAlpha * 0.3; // Max 30% opacity
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }
  }

  getParticleSystem(): ParticleSystem {
    return this.particleSystem;
  }

  getCamera(): Camera {
    return this.camera;
  }

  // NEW: Render drifting clouds
  private renderClouds(): void {
    const ctx = this.ctx;
    ctx.save();

    for (const cloud of this.clouds) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      // Draw cloud as multiple overlapping circles
      ctx.arc(cloud.x, cloud.y, cloud.size * 0.6, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.size * 0.5, cloud.y, cloud.size * 0.5, 0, Math.PI * 2);
      ctx.arc(cloud.x - cloud.size * 0.5, cloud.y, cloud.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private renderGround(): void {
    const ctx = this.ctx;
    // Draw enhanced grass tiles with depth and organic texture
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const isLight = (x + y) % 2 === 0;
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        // Base gradient for 3D depth
        const gradient = ctx.createLinearGradient(px, py, px + TILE_SIZE, py + TILE_SIZE);
        if (isLight) {
          gradient.addColorStop(0, '#8AE35F'); // Lighter green
          gradient.addColorStop(0.5, '#7FD957');
          gradient.addColorStop(1, '#6DC94D'); // Slightly darker
        } else {
          gradient.addColorStop(0, '#75CF52');
          gradient.addColorStop(0.5, '#6BBF59');
          gradient.addColorStop(1, '#5DAF4B');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Seeded random based on tile position for consistent patterns
        const seed = x * 17 + y * 31;

        // Grass blade details (small vertical strokes) - NEW: with wave animation
        ctx.strokeStyle = 'rgba(0, 80, 0, 0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const bladeX = px + ((seed * (i + 1) * 7) % (TILE_SIZE - 4)) + 2;
          const bladeY = py + ((seed * (i + 2) * 11) % (TILE_SIZE - 8)) + 4;

          // NEW: Add wave animation (different speed for each blade for organic feel)
          const waveSpeed = 1.5 + (seed % 3) * 0.5; // Vary wave speed
          const waveOffset = Math.sin(this.grassWaveTime * waveSpeed + seed * 0.1) * 1.5;

          ctx.beginPath();
          ctx.moveTo(bladeX, bladeY + 4);
          ctx.lineTo(bladeX + ((i % 2) ? 1 : -1) + waveOffset, bladeY);
          ctx.stroke();
        }

        // Light patches (sun spots)
        if (seed % 7 === 0) {
          ctx.fillStyle = 'rgba(255, 255, 200, 0.08)';
          ctx.beginPath();
          ctx.ellipse(px + 20 + (seed % 15), py + 15 + (seed % 12), 8, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Small flowers/clovers (rare)
        if (seed % 13 === 0) {
          const flowerX = px + 10 + (seed % 25);
          const flowerY = py + 10 + ((seed * 3) % 25);
          // Flower center
          ctx.fillStyle = seed % 2 === 0 ? '#FFE066' : '#FF9999';
          ctx.beginPath();
          ctx.arc(flowerX, flowerY, 2, 0, Math.PI * 2);
          ctx.fill();
          // Petals (simple dots around)
          ctx.fillStyle = '#ffffff';
          for (let p = 0; p < 4; p++) {
            const angle = (p / 4) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(flowerX + Math.cos(angle) * 3, flowerY + Math.sin(angle) * 3, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Subtle tile border shadow
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }
  }

  // UI Layout Constants (Compact)
  private readonly CARD_WIDTH = 130;
  private readonly CARD_HEIGHT = 40;
  private readonly AVATAR_RADIUS = 18;
  private readonly UI_PADDING = 8;

  renderUI(alivePlayers: Player[], roundTime: number, scoreManager?: ScoreManager): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);

    // No full-width HUD gradient (it obscures the game)

    // --- TIMER PANEL (Top Center, Compact) ---
    const centerX = CANVAS_WIDTH / 2;
    const timerWidth = 70;
    const timerHeight = 28;
    const timerX = centerX - timerWidth / 2;
    const timerY = 5;

    // Glass Panel Background
    this.ctx.fillStyle = 'rgba(30, 30, 30, 0.6)';
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect(timerX, timerY, timerWidth, timerHeight, 12);
    this.ctx.fill();
    this.ctx.stroke();

    // Timer Text (Digital Style)
    const minutes = Math.floor(roundTime / 60);
    const seconds = Math.floor(roundTime % 60);
    const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    this.ctx.font = '700 16px "Courier New", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Warning Glow & Wobble
    if (roundTime <= 30) {
      const wobble = Math.sin(this.hudAnimationTimer * 20) * 1.5;
      this.ctx.save();
      this.ctx.translate(wobble, 0);
      this.ctx.shadowColor = '#ff2222';
      this.ctx.shadowBlur = 15;
      this.ctx.fillStyle = '#ff5555';
    } else {
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = '#ffffff';
    }
    this.ctx.fillText(timeText, centerX, timerY + timerHeight / 2 - 2);
    this.ctx.shadowBlur = 0;
    if (roundTime <= 30) {
      this.ctx.restore();
    }

    // Progress Bar (Bottom of Timer)
    const totalTime = 180; // Assuming 3 mins default round
    const progress = Math.max(0, roundTime / totalTime);
    const barWidth = (timerWidth - 20) * progress;
    this.ctx.fillStyle = roundTime <= 30 ? '#ff5555' : '#44aaff';
    this.ctx.fillRect(timerX + 10, timerY + timerHeight - 6, barWidth, 3);


    // --- PLAYER CARDS (4 Corners) ---
    const slots = [
      { x: this.UI_PADDING, y: 5, align: 'left' as const }, // P1 Top-Left
      { x: CANVAS_WIDTH - this.UI_PADDING - this.CARD_WIDTH, y: 5, align: 'right' as const }, // P2 Top-Right
      { x: this.UI_PADDING, y: CANVAS_HEIGHT - this.CARD_HEIGHT - 5, align: 'left' as const }, // P3 Bottom-Left
      { x: CANVAS_WIDTH - this.UI_PADDING - this.CARD_WIDTH, y: CANVAS_HEIGHT - this.CARD_HEIGHT - 5, align: 'right' as const } // P4 Bottom-Right
    ];

    for (const player of alivePlayers) {
      const i = player.playerIndex;
      if (i >= 4) continue;

      const slot = slots[i];
      const isAlive = player.isPlayerAlive();
      const cardX = slot.x;
      const cardY = slot.y;

      this.drawPlayerCard(cardX, cardY, player, i, isAlive, scoreManager);
    }

    this.ctx.restore();
  }

  private drawPlayerCard(x: number, y: number, player: Player, index: number, isAlive: boolean, scoreManager?: ScoreManager): void {
    const score = scoreManager ? scoreManager.getScore(index) : 0;
    if (score !== this.lastScores[index]) {
      this.cardScorePulse[index] = 0.5; // Trigger pulse for 0.5s
      this.lastScores[index] = score;
    }

    const pulse = Math.sin(this.hudAnimationTimer * 3) * 0.015;
    const scorePulse = this.cardScorePulse[index] > 0 ? Math.sin((this.cardScorePulse[index] / 0.5) * Math.PI) * 0.1 : 0;
    const scale = 1 + pulse + scorePulse;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x + this.CARD_WIDTH / 2, y + this.CARD_HEIGHT / 2);
    ctx.scale(scale, scale);
    ctx.translate(-this.CARD_WIDTH / 2, -this.CARD_HEIGHT / 2);

    const colors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];
    const playerColor = colors[index];
    const borderColor = isAlive ? playerColor : '#555555';

    // 1. Card Background (Gradient)
    const gradient = ctx.createLinearGradient(x, y, x + this.CARD_WIDTH, y);
    if (index % 2 === 0) { // Left aligned
      gradient.addColorStop(0, 'rgba(40, 40, 40, 0.9)');
      gradient.addColorStop(1, 'rgba(40, 40, 40, 0.6)');
    } else { // Right aligned
      gradient.addColorStop(0, 'rgba(40, 40, 40, 0.6)');
      gradient.addColorStop(1, 'rgba(40, 40, 40, 0.9)');
    }

    ctx.fillStyle = gradient;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2; // Thicker border for visibility

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    ctx.beginPath();
    ctx.roundRect(x, y, this.CARD_WIDTH, this.CARD_HEIGHT, 10);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Inner glow effect
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, this.CARD_WIDTH - 4, this.CARD_HEIGHT - 4, 8);
    ctx.stroke();

    // 2. Avatar (Inside card, not overlapping edge)
    const isLeft = (index % 2 === 0);
    // Avatar is now inside the card with padding
    const avatarX = isLeft ? x + this.AVATAR_RADIUS + 4 : x + this.CARD_WIDTH - this.AVATAR_RADIUS - 4;
    const avatarY = y + this.CARD_HEIGHT / 2;

    this.drawAvatar(avatarX, avatarY, this.AVATAR_RADIUS, playerColor, isAlive, false);

    // 3. Content Layout - Simplified for compact cards
    // Content starts after avatar
    const contentX = isLeft ? x + this.AVATAR_RADIUS * 2 + 8 : x + 5;
    const contentWidth = this.CARD_WIDTH - this.AVATAR_RADIUS * 2 - 12;

    if (isAlive) {
      // Single Row Layout: P# | Score | Bomb/Range

      // Player ID
      ctx.fillStyle = playerColor;
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`P${index + 1}`, contentX, y + 12);

      // Star icon for score
      ctx.fillStyle = '#FFD700';
      ctx.font = '10px Arial';
      ctx.fillText('★', contentX + 15, y + 12);

      // Score (Gold, prominent)
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'left';
      const score = scoreManager ? scoreManager.getScore(index) : 0;
      ctx.fillText(`${score}`, contentX + 26, y + 12);

      // Stats Row: Bomb icon + count, Blast icon + range
      const statsY = y + 28;

      // Bomb: Icon + Count
      this.drawBombIcon(contentX + 2, statsY, 5, player.bombType);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`${player.maxBombs}`, contentX + 12, statsY);

      // Blast: Icon + Range
      this.drawBlastIcon(contentX + 35, statsY, 5);
      ctx.fillStyle = '#ffaa00';
      ctx.fillText(`${player.bombRange}`, contentX + 45, statsY);

      // Ability indicator (Improved with actual icons)
      const abilityX = contentX + 65;
      if (player.hasShield()) {
        this.drawAbilityIcon(abilityX, statsY, 'shield');
      } else if (player.canTeleport()) {
        this.drawAbilityIcon(abilityX, statsY, 'teleport');
      } else if (player.hasAbility('kick')) {
        this.drawAbilityIcon(abilityX, statsY, 'kick');
      } else if (player.hasAbility('punch')) {
        this.drawAbilityIcon(abilityX, statsY, 'punch');
      }
    } else {
      // Dead State
      ctx.fillStyle = '#666666';
      ctx.font = 'italic 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("OUT", contentX + contentWidth / 2, y + this.CARD_HEIGHT / 2);
    }
    ctx.restore();
  }



  private drawAvatar(x: number, y: number, radius: number, color: string, isAlive: boolean, isWinner: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    // Sticker Outline (White stroke outside)
    ctx.beginPath();
    ctx.arc(0, 0, radius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Background
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = isAlive ? color : '#333333';
    ctx.fill();

    // Inner Shadow (Simulated with gradient)
    const grad = ctx.createRadialGradient(-5, -5, 2, 0, 0, radius);
    grad.addColorStop(0, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Face Drawing
    if (!isAlive) {
      // Dead Eyes (X)
      ctx.strokeStyle = '#dddddd';
      ctx.lineWidth = 3;
      ctx.beginPath();
      // Left X
      ctx.moveTo(-10, -6); ctx.lineTo(-4, 0);
      ctx.moveTo(-4, -6); ctx.lineTo(-10, 0);
      // Right X
      ctx.moveTo(4, -6); ctx.lineTo(10, 0);
      ctx.moveTo(10, -6); ctx.lineTo(4, 0);
      ctx.stroke();

      // Dead Line Mouth
      ctx.beginPath();
      ctx.moveTo(-8, 8);
      ctx.lineTo(8, 8);
      ctx.stroke();
    } else {
      // Alive Faces
      ctx.fillStyle = '#ffffff';

      if (isWinner) {
        // Happy Arches
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-6, -2, 4, Math.PI, 0); // Arch
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(6, -2, 4, Math.PI, 0); // Arch
        ctx.stroke();

        // Big Grin
        ctx.beginPath();
        ctx.arc(0, 2, 8, 0.1, Math.PI - 0.1);
        ctx.stroke();

        // Crown
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-12, -radius + 5);
        ctx.lineTo(-6, -radius - 8);
        ctx.lineTo(0, -radius - 2);
        ctx.lineTo(6, -radius - 8);
        ctx.lineTo(12, -radius + 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

      } else {
        // Normal Eyes (Dots)
        ctx.beginPath();
        ctx.arc(-6, -3, 3, 0, Math.PI * 2);
        ctx.arc(6, -3, 3, 0, Math.PI * 2);
        ctx.fill();

        // Simple Smile
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 4, 6, 0.3, Math.PI - 0.3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawBombIcon(x: number, y: number, radius: number, type: BombType): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    // Bomb body
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);

    // Color based on type
    switch (type) {
      case BombType.FIRE: ctx.fillStyle = '#FF4500'; break;
      case BombType.ICE: ctx.fillStyle = '#00CED1'; break;
      case BombType.PIERCING: ctx.fillStyle = '#9400D3'; break;
      default: ctx.fillStyle = '#444444'; break;
    }
    ctx.fill();

    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(-radius * 0.3, -radius * 0.3, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Fuse
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius * 0.5, -radius * 1.5);
    ctx.stroke();

    ctx.restore();
  }

  private drawBlastIcon(x: number, y: number, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#FF4400';

    // Draw a "blast" star shape
    ctx.beginPath();
    const spikes = 8;
    const outerRadius = size;
    const innerRadius = size * 0.5;

    for (let i = 0; i < spikes; i++) {
      let angle = (Math.PI / spikes) * 2 * i;
      const ox = Math.cos(angle) * outerRadius;
      const oy = Math.sin(angle) * outerRadius;
      ctx.lineTo(ox, oy);

      angle += Math.PI / spikes;
      const ix = Math.cos(angle) * innerRadius;
      const iy = Math.sin(angle) * innerRadius;
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawAbilityIcon(x: number, y: number, type: 'kick' | 'punch' | 'shield' | 'teleport'): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    // Background circle
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 10px Arial';

    switch (type) {
      case 'kick':
        ctx.fillText('👞', 0, 1); // Unicode shoe
        break;
      case 'punch':
        ctx.fillText('🥊', 0, 1); // Unicode glove
        break;
      case 'shield':
        ctx.fillText('🛡️', 0, 1); // Unicode shield
        break;
      case 'teleport':
        ctx.fillText('🌀', 0, 1); // Unicode swirl
        break;
    }
    ctx.restore();
  }

  renderCountdown(count: number): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Animated scale effect based on count value
    const scale = 1 + Math.sin(Date.now() / 150) * 0.1;

    this.ctx.save();
    this.ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    this.ctx.scale(scale, scale);

    // Outer glow
    this.ctx.shadowColor = '#ff6b35';
    this.ctx.shadowBlur = 50;
    this.ctx.fillStyle = '#ff6b35';
    this.ctx.font = 'bold 140px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(count.toString(), 0, 0);

    // Main text
    this.ctx.shadowBlur = 20;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText(count.toString(), 0, 0);

    this.ctx.restore();
    this.ctx.shadowBlur = 0;
    this.ctx.restore();
  }

  renderGameOver(winner: Player | null): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Animated pulse effect
    const pulse = 1 + Math.sin(Date.now() / 300) * 0.05;

    if (winner) {
      const colors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];
      const winnerColor = colors[winner.playerIndex];

      // Winner text with massive glow
      this.ctx.save();
      this.ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);
      this.ctx.scale(pulse, pulse);

      this.ctx.shadowColor = winnerColor;
      this.ctx.shadowBlur = 60;
      this.ctx.fillStyle = winnerColor;
      this.ctx.font = 'bold 72px Arial';
      this.ctx.fillText(`PLAYER ${winner.playerIndex + 1}`, 0, -20);

      this.ctx.shadowBlur = 40;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 64px Arial';
      this.ctx.fillText('WINS!', 0, 50);

      this.ctx.restore();
    } else {
      this.ctx.save();
      this.ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
      this.ctx.scale(pulse, pulse);

      this.ctx.shadowColor = '#888888';
      this.ctx.shadowBlur = 40;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 64px Arial';
      this.ctx.fillText('DRAW!', 0, 0);

      this.ctx.restore();
    }

    this.ctx.shadowBlur = 0;

    // Instruction text with subtle glow
    this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    this.ctx.shadowBlur = 10;
    this.ctx.fillStyle = '#cccccc';
    this.ctx.font = '28px Arial';
    this.ctx.fillText('Press SPACE to play again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
    this.ctx.shadowBlur = 0;
    this.ctx.restore();
  }

  renderMainMenu(playerCount: number = 2, isSinglePlayer: boolean = false, aiDifficulty: 'easy' | 'medium' | 'hard' = 'medium'): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);
    const time = Date.now();

    // Animated gradient background
    const bgGradient = this.ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGradient.addColorStop(0, '#1a1a2e');
    bgGradient.addColorStop(0.5, '#16213e');
    bgGradient.addColorStop(1, '#0f3460');
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw animated background elements
    this.drawMenuBackground(time);

    // Draw floating bombs
    this.drawFloatingBombs(time);

    // Draw bouncing characters
    this.drawMenuCharacters(time, playerCount, isSinglePlayer);

    // Animated title with bouncy letters
    this.drawBouncyTitle(time);

    // Mode selection panel
    this.drawMenuPanel(time, playerCount, isSinglePlayer, aiDifficulty);

    // Start instruction with bouncy animation
    const bounceY = Math.sin(time / 300) * 5;
    const instructionPulse = 0.8 + Math.sin(time / 400) * 0.2;
    this.ctx.shadowColor = `rgba(255, 200, 100, ${instructionPulse})`;
    this.ctx.shadowBlur = 25;
    this.ctx.font = 'bold 28px Arial';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Press SPACE to start', CANVAS_WIDTH / 2, 540 + bounceY);
    this.ctx.shadowBlur = 0;

    // Controls at bottom
    this.drawMenuControls(isSinglePlayer, playerCount);

    this.ctx.restore();
  }

  private drawMenuBackground(time: number): void {
    const ctx = this.ctx;

    // 1. Base Gradient
    const bgGradient = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.8
    );
    bgGradient.addColorStop(0, '#1a1a1a');
    bgGradient.addColorStop(1, '#050505');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Decorative grid pattern (subtle)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // 3. Floating particles (enhanced)
    for (let i = 0; i < 30; i++) {
      const x = ((time / 60 + i * 120) % (CANVAS_WIDTH + 100)) - 50;
      const y = (Math.sin(time / 1200 + i * 0.7) * 40) + (i * 25) % CANVAS_HEIGHT;
      const size = 1.5 + Math.sin(time / 600 + i) * 1;
      const alpha = 0.2 + Math.sin(time / 400 + i * 0.8) * 0.15;

      ctx.fillStyle = `rgba(255, 180, 80, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      // Subtle glow for some particles
      if (i % 5 === 0) {
        ctx.shadowColor = '#ff9632';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // 4. Subtle Scanlines
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#000000';
    for (let y = 0; y < CANVAS_HEIGHT; y += 4) {
      ctx.fillRect(0, y, CANVAS_WIDTH, 2);
    }
    ctx.restore();

    // 5. Vignette Effect
    const vignette = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.4,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.8
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  private drawFloatingBombs(time: number): void {
    const ctx = this.ctx;
    const bombs = [
      { x: 80, y: 150, size: 20, speed: 1.2, phase: 0 },
      { x: CANVAS_WIDTH - 80, y: 180, size: 22, speed: 1.0, phase: 1 },
      { x: 120, y: 450, size: 18, speed: 1.4, phase: 2 },
      { x: CANVAS_WIDTH - 100, y: 480, size: 16, speed: 1.1, phase: 3 },
      { x: 60, y: 320, size: 14, speed: 0.9, phase: 4 },
      { x: CANVAS_WIDTH - 60, y: 350, size: 15, speed: 1.3, phase: 5 },
    ];

    bombs.forEach(bomb => {
      const floatY = Math.sin(time / 600 * bomb.speed + bomb.phase) * 15;
      const rotate = Math.sin(time / 800 + bomb.phase) * 0.2;
      const pulse = 1 + Math.sin(time / 400 + bomb.phase) * 0.1;

      ctx.save();
      ctx.translate(bomb.x, bomb.y + floatY);
      ctx.rotate(rotate);
      ctx.scale(pulse, pulse);

      // Bomb glow
      ctx.shadowColor = '#ff6b35';
      ctx.shadowBlur = 20;

      // Bomb body
      ctx.fillStyle = '#2c2c2c';
      ctx.beginPath();
      ctx.arc(0, 0, bomb.size, 0, Math.PI * 2);
      ctx.fill();

      // Bomb highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(-bomb.size * 0.3, -bomb.size * 0.3, bomb.size * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Fuse
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -bomb.size);
      ctx.quadraticCurveTo(bomb.size * 0.5, -bomb.size * 1.3, bomb.size * 0.3, -bomb.size * 1.5);
      ctx.stroke();

      // Fuse spark
      const sparkFlicker = Math.sin(time / 50 + bomb.phase * 10) > 0;
      if (sparkFlicker) {
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.arc(bomb.size * 0.3, -bomb.size * 1.5, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bomb.size * 0.3, -bomb.size * 1.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    });
  }

  private drawMenuCharacters(time: number, playerCount: number, isSinglePlayer: boolean): void {
    const ctx = this.ctx;
    const playerColors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];
    const numPlayers = isSinglePlayer ? 4 : playerCount;

    const positions = [
      { x: 100, baseY: 280 },
      { x: CANVAS_WIDTH - 100, baseY: 290 },
      { x: 130, baseY: 420 },
      { x: CANVAS_WIDTH - 130, baseY: 410 },
    ];

    for (let i = 0; i < numPlayers; i++) {
      const pos = positions[i];
      const bouncePhase = i * 0.8;
      const bounceY = Math.abs(Math.sin(time / 400 + bouncePhase)) * 20;
      const squash = 1 - Math.abs(Math.sin(time / 400 + bouncePhase)) * 0.15;
      const stretch = 1 + Math.abs(Math.sin(time / 400 + bouncePhase)) * 0.1;

      const y = pos.baseY - bounceY;

      ctx.save();
      ctx.translate(pos.x, y);
      ctx.scale(squash, stretch);

      this.drawMenuCharacter(ctx, 0, 0, playerColors[i], time, i);

      ctx.restore();
    }
  }

  private drawMenuCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, time: number, index: number): void {
    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 25, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;

    // Body
    const bodyGradient = ctx.createRadialGradient(-5, -8, 2, 0, 0, 22);
    bodyGradient.addColorStop(0, this.lightenColor(color, 40));
    bodyGradient.addColorStop(0.5, color);
    bodyGradient.addColorStop(1, this.darkenColor(color, 30));
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Body outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(-6, -10, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    const blinkPhase = Math.floor(time / 3000 + index) % 4 === 0 && (time % 3000) < 150;
    const eyeY = -4;

    if (blinkPhase) {
      // Blink - closed eyes
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, eyeY);
      ctx.lineTo(-2, eyeY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2, eyeY);
      ctx.lineTo(8, eyeY);
      ctx.stroke();
    } else {
      // Open eyes
      [-5, 5].forEach(ex => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex, eyeY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Pupil - looking around
        const lookX = Math.sin(time / 1000 + index) * 1.5;
        const lookY = Math.cos(time / 800 + index) * 1;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(ex + lookX, eyeY + lookY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Feet
    const footOffset = Math.sin(time / 200 + index) * 3;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.ellipse(-9, 18 + footOffset, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(9, 18 - footOffset, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hands waving
    const waveAngle = Math.sin(time / 300 + index * 2) * 0.5;
    ctx.save();
    ctx.translate(-18, -5);
    ctx.rotate(-0.5 + waveAngle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(18, -5);
    ctx.rotate(0.5 - waveAngle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  private drawBouncyTitle(time: number): void {
    const ctx = this.ctx;
    const title = 'BOMB BATTLES';
    const baseY = 80;

    ctx.font = 'bold 62px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Measure for centering
    const totalWidth = ctx.measureText(title).width;
    let currentX = CANVAS_WIDTH / 2 - totalWidth / 2;

    // Draw each letter with individual bounce
    for (let i = 0; i < title.length; i++) {
      const char = title[i];
      const charWidth = ctx.measureText(char).width;
      const bounceOffset = Math.sin(time / 200 + i * 0.3) * 6;
      const rotateOffset = Math.sin(time / 300 + i * 0.4) * 0.05;

      ctx.save();
      ctx.translate(currentX + charWidth / 2, baseY + bounceOffset);
      ctx.rotate(rotateOffset);

      // Glow layers
      ctx.shadowColor = '#ff6b35';
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#ff6b35';
      ctx.fillText(char, 0, 0);

      ctx.shadowBlur = 15;
      ctx.fillStyle = '#ffaa55';
      ctx.fillText(char, 0, 0);

      ctx.shadowBlur = 5;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(char, 0, 0);

      ctx.restore();

      currentX += charWidth;
    }
  }

  private drawMenuPanel(time: number, playerCount: number, isSinglePlayer: boolean, aiDifficulty: 'easy' | 'medium' | 'hard'): void {
    const ctx = this.ctx;
    const panelX = CANVAS_WIDTH / 2 - 200;
    const panelY = 170;
    const panelWidth = 400;
    const panelHeight = 340;

    // Panel background with glass effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 20);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner glow
    ctx.strokeStyle = 'rgba(255, 150, 50, 0.1)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(panelX + 4, panelY + 4, panelWidth - 8, panelHeight - 8, 16);
    ctx.stroke();

    // Mode selection header
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Game Mode', CANVAS_WIDTH / 2, panelY + 40);

    // Mode buttons
    const modeY = panelY + 90;
    this.drawMenuButton(ctx, CANVAS_WIDTH / 2 - 100, modeY, 90, 45, 'Single', 'S', isSinglePlayer, time, 0);
    this.drawMenuButton(ctx, CANVAS_WIDTH / 2 + 10, modeY, 90, 45, 'Multi', 'M', !isSinglePlayer, time, 1);

    // Options section
    const optionsY = panelY + 160;

    if (isSinglePlayer) {
      ctx.font = 'bold 20px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('AI Difficulty', CANVAS_WIDTH / 2, optionsY);

      const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
      const diffLabels = ['Easy', 'Medium', 'Hard'];
      const diffY = optionsY + 45;
      const spacing = 110;
      const startX = CANVAS_WIDTH / 2 - spacing;

      for (let i = 0; i < 3; i++) {
        const isSelected = aiDifficulty === difficulties[i];
        this.drawMenuButton(ctx, startX + i * spacing - 45, diffY, 90, 38, diffLabels[i], String(i + 1), isSelected, time, i + 2);
      }
    } else {
      ctx.font = 'bold 20px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Players', CANVAS_WIDTH / 2, optionsY);

      const buttonY = optionsY + 50;
      const spacing = 70;
      const startX = CANVAS_WIDTH / 2 - spacing;

      for (let i = 2; i <= 4; i++) {
        const isSelected = playerCount === i;
        const bounce = isSelected ? Math.sin(time / 200 + i) * 3 : 0;

        ctx.save();
        ctx.translate(startX + (i - 2) * spacing, buttonY + bounce);

        // Button circle
        if (isSelected) {
          ctx.shadowColor = '#ff6b35';
          ctx.shadowBlur = 20;
        }
        ctx.fillStyle = isSelected ? '#ff6b35' : 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i), 0, 0);

        ctx.restore();
      }
    }

    // Player indicators (colored dots showing who's playing)
    const indicatorY = panelY + panelHeight - 50;
    const indicatorSpacing = 30;
    const indicatorStartX = CANVAS_WIDTH / 2 - ((isSinglePlayer ? 4 : playerCount) - 1) * indicatorSpacing / 2;
    const playerColors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];

    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('Players:', CANVAS_WIDTH / 2, indicatorY - 20);

    const numIndicators = isSinglePlayer ? 4 : playerCount;
    for (let i = 0; i < numIndicators; i++) {
      const pulse = 1 + Math.sin(time / 300 + i * 0.5) * 0.15;
      const x = indicatorStartX + i * indicatorSpacing;

      ctx.save();
      ctx.translate(x, indicatorY);
      ctx.scale(pulse, pulse);

      ctx.shadowColor = playerColors[i];
      ctx.shadowBlur = 10;
      ctx.fillStyle = playerColors[i];
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (isSinglePlayer && i > 0) {
        // AI badge
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.font = 'bold 8px Arial';
        ctx.fillText('AI', 0, 1);
      }

      ctx.restore();
    }
  }

  private drawMenuButton(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, label: string, key: string, isSelected: boolean, time: number, index: number): void {
    const bounce = isSelected ? Math.sin(time / 200 + index) * 2 : 0;

    ctx.save();
    ctx.translate(x + width / 2, y + height / 2 + bounce);

    // Button background
    if (isSelected) {
      ctx.shadowColor = '#ff6b35';
      ctx.shadowBlur = 20;
    }

    ctx.fillStyle = isSelected ? '#ff6b35' : 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.roundRect(-width / 2, -height / 2, width, height, 10);
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, -5);

    // Key hint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px Arial';
    ctx.fillText(`(${key})`, 0, 12);

    ctx.restore();
  }

  private drawMenuControls(isSinglePlayer: boolean, playerCount: number): void {
    const ctx = this.ctx;
    const playerColors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];

    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    const controlsX = 50;
    let y = 590;

    if (isSinglePlayer) {
      ctx.fillStyle = playerColors[0];
      ctx.fillText('You: Arrow Keys + / (bomb) + . (special)', controlsX, y);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText('  |  Opponents: AI-controlled', controlsX + 280, y);
    } else {
      const controls = [
        'P1: Arrows + /',
        'P2: WASD + Space',
        'P3: IJKL + O',
        'P4: Numpad'
      ];

      let currentX = controlsX;
      for (let i = 0; i < playerCount; i++) {
        ctx.fillStyle = playerColors[i];
        ctx.fillText(controls[i], currentX, y);
        currentX += ctx.measureText(controls[i]).width + 20;
      }
    }
  }

  private lightenColor(color: string, amount: number): string {
    const hex = color.replace('#', '');
    const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + amount);
    const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + amount);
    const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + amount);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private darkenColor(color: string, amount: number): string {
    const hex = color.replace('#', '');
    const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - amount);
    const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - amount);
    const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - amount);
    return `rgb(${r}, ${g}, ${b})`;
  }

  renderPaused(): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Pulsing effect
    const pulse = 1 + Math.sin(Date.now() / 400) * 0.05;

    this.ctx.save();
    this.ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    this.ctx.scale(pulse, pulse);

    this.ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    this.ctx.shadowBlur = 40;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 72px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('PAUSED', 0, 0);

    this.ctx.restore();
    this.ctx.shadowBlur = 0;

    this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    this.ctx.shadowBlur = 15;
    this.ctx.font = '28px Arial';
    this.ctx.fillText('Press ESC to resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
    this.ctx.shadowBlur = 0;
    this.ctx.restore();
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  private renderLighting(state: RenderState): void {
    const ctx = this.lightingCtx;

    // Clear and fill darkness
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; // Ambient darkness
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.globalCompositeOperation = 'destination-out';

    // Cut holes for players
    for (const player of state.players) {
      if (!player.isPlayerAlive()) continue;

      const cx = player.position.pixelX + TILE_SIZE / 2;
      const cy = player.position.pixelY + TILE_SIZE / 2;
      this.drawLight(ctx, cx, cy, 100);
    }

    // Cut holes for bombs (flickering)
    for (const bomb of state.bombs) {
      if (!bomb.isActive) continue;
      const cx = bomb.position.pixelX + TILE_SIZE / 2;
      const cy = bomb.position.pixelY + TILE_SIZE / 2;

      // Flicker
      const radius = 80 + Math.sin(Date.now() / 100) * 10;
      this.drawLight(ctx, cx, cy, radius);
    }

    // Cut holes for explosions (huge bright spots)
    for (const explosion of state.explosions) {
      if (!explosion.isActive) continue;
      for (const tile of explosion.tiles) {
        const cx = tile.gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = tile.gridY * TILE_SIZE + TILE_SIZE / 2;
        this.drawLight(ctx, cx, cy, 120);
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    // Draw lighting overlay onto main canvas
    this.ctx.drawImage(this.lightingCanvas, 0, 0);
  }

  private drawLight(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
