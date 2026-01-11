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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.particleSystem = new ParticleSystem();
    this.camera = new Camera();

    // Setup lighting canvas
    this.lightingCanvas = document.createElement('canvas');
    this.lightingCtx = this.lightingCanvas.getContext('2d')!;

    // Set initial canvas size
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    // Pixel-perfect rendering
    this.ctx.imageSmoothingEnabled = false;

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
    this.particleSystem.update(deltaTime);
    this.camera.update(deltaTime);

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

    // Draw lighting overlay (Disabled temporarily to debug grey screen issue)
    // this.renderLighting(state);

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

        // Grass blade details (small vertical strokes)
        ctx.strokeStyle = 'rgba(0, 80, 0, 0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const bladeX = px + ((seed * (i + 1) * 7) % (TILE_SIZE - 4)) + 2;
          const bladeY = py + ((seed * (i + 2) * 11) % (TILE_SIZE - 8)) + 4;
          ctx.beginPath();
          ctx.moveTo(bladeX, bladeY + 4);
          ctx.lineTo(bladeX + ((i % 2) ? 1 : -1), bladeY);
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

    // Warning Glow
    if (roundTime <= 30) {
      this.ctx.shadowColor = '#ff2222';
      this.ctx.shadowBlur = 15;
      this.ctx.fillStyle = '#ff5555';
    } else {
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = '#ffffff';
    }
    this.ctx.fillText(timeText, centerX, timerY + timerHeight / 2 - 2);
    this.ctx.shadowBlur = 0;

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
    const ctx = this.ctx;
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

      // Ability indicator (small dot if any ability)
      if (player.hasAbility('kick') || player.hasAbility('punch') || player.hasShield() || player.teleportCharges > 0) {
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(contentX + 65, statsY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Dead State
      ctx.fillStyle = '#666666';
      ctx.font = 'italic 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("OUT", contentX + contentWidth / 2, y + this.CARD_HEIGHT / 2);
    }
  }

  private drawStatText(text: string, x: number, y: number) {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 11px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x, y);
  }

  private drawStatIcon(x: number, y: number, type: 'bomb' | 'blast', bombType: BombType) {
    if (type === 'bomb') {
      this.drawBombIcon(x, y, 6, bombType);
    } else {
      this.drawBlastIcon(x, y, 6);
    }
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

  // Keep drawFireIcon for compatibility if used elsewhere, or just rename/replace logic if I can find usage.
  // Actually, I'm replacing the method in the class.
  private drawFireIcon(x: number, y: number, size: number): void {
    this.drawBlastIcon(x, y, size);
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

    // Animated bright background gradient
    const bgGradient = this.ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, Math.max(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.8
    );
    bgGradient.addColorStop(0, '#87CEEB'); // Sky blue
    bgGradient.addColorStop(0.5, '#6BB6D6'); // Medium blue
    bgGradient.addColorStop(1, '#4A9EC1'); // Deep blue
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Animated title with massive glow
    const titlePulse = 1 + Math.sin(Date.now() / 500) * 0.03;
    this.ctx.save();
    this.ctx.translate(CANVAS_WIDTH / 2, 100);
    this.ctx.scale(titlePulse, titlePulse);

    // Title shadow layers for depth
    this.ctx.shadowColor = '#ff6b35';
    this.ctx.shadowBlur = 60;
    this.ctx.fillStyle = '#ff6b35';
    this.ctx.font = 'bold 68px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('PLAYING WITH FIRE', 0, 0);

    this.ctx.shadowBlur = 30;
    this.ctx.fillStyle = '#ffaa55';
    this.ctx.fillText('PLAYING WITH FIRE', 0, 0);

    this.ctx.shadowBlur = 10;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 64px Arial';
    this.ctx.fillText('PLAYING WITH FIRE', 0, 0);

    this.ctx.restore();
    this.ctx.shadowBlur = 0;

    // Subtitle with glow
    this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    this.ctx.shadowBlur = 15;
    this.ctx.fillStyle = '#dddddd';
    this.ctx.font = '28px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('A Bomberman Clone', CANVAS_WIDTH / 2, 160);
    this.ctx.shadowBlur = 0;

    // Mode selection
    this.ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
    this.ctx.shadowBlur = 10;
    this.ctx.font = 'bold 28px Arial';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText('Game Mode:', CANVAS_WIDTH / 2, 220);
    this.ctx.shadowBlur = 0;

    // Mode buttons
    const modeY = 270;
    const modeSpacing = 180;
    const modeStartX = CANVAS_WIDTH / 2 - modeSpacing / 2;

    // Single Player button with glow
    if (isSinglePlayer) {
      this.ctx.shadowColor = '#ff6b35';
      this.ctx.shadowBlur = 25;
    }
    this.ctx.fillStyle = isSinglePlayer ? '#ff6b35' : '#444444';
    this.ctx.fillRect(modeStartX - 90, modeY - 25, 160, 50);
    this.ctx.shadowBlur = 0;

    if (isSinglePlayer) {
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(modeStartX - 90, modeY - 25, 160, 50);
      // Inner highlight
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(modeStartX - 87, modeY - 22, 154, 44);
    }
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 20px Arial';
    this.ctx.fillText('Single (S)', modeStartX - 10, modeY + 7);

    // Multiplayer button with glow
    if (!isSinglePlayer) {
      this.ctx.shadowColor = '#ff6b35';
      this.ctx.shadowBlur = 25;
    }
    this.ctx.fillStyle = !isSinglePlayer ? '#ff6b35' : '#444444';
    this.ctx.fillRect(modeStartX + 70, modeY - 25, 160, 50);
    this.ctx.shadowBlur = 0;

    if (!isSinglePlayer) {
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(modeStartX + 70, modeY - 25, 160, 50);
      // Inner highlight
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(modeStartX + 73, modeY - 22, 154, 44);
    }
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText('Multi (M)', modeStartX + 150, modeY + 7);

    // Single player specific options
    if (isSinglePlayer) {
      // AI Difficulty selector
      this.ctx.font = 'bold 20px Arial';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText('AI Difficulty:', CANVAS_WIDTH / 2, 320);

      const difficultyY = 355;
      const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
      const diffSpacing = 140;
      const diffStartX = CANVAS_WIDTH / 2 - diffSpacing;

      for (let i = 0; i < difficulties.length; i++) {
        const diff = difficulties[i];
        const x = diffStartX + i * diffSpacing;
        const isSelected = aiDifficulty === diff;

        // Button background
        this.ctx.fillStyle = isSelected ? '#ff6b35' : '#444444';
        this.ctx.fillRect(x - 50, difficultyY - 15, 100, 35);

        // Button border
        if (isSelected) {
          this.ctx.strokeStyle = '#ffffff';
          this.ctx.lineWidth = 3;
          this.ctx.strokeRect(x - 50, difficultyY - 15, 100, 35);
        }

        // Label
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '16px Arial';
        const label = diff.charAt(0).toUpperCase() + diff.slice(1) + ` (${i + 1})`;
        this.ctx.fillText(label, x, difficultyY + 5);
      }
    } else {
      // Player count selector (multiplayer only)
      this.ctx.font = 'bold 24px Arial';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText('Players:', CANVAS_WIDTH / 2, 320);

      // Player count buttons
      const buttonY = 355;
      const buttonSpacing = 80;
      const startX = CANVAS_WIDTH / 2 - buttonSpacing * 1.5;

      for (let i = 2; i <= 4; i++) {
        const x = startX + (i - 2) * buttonSpacing;
        const isSelected = playerCount === i;

        // Button background
        this.ctx.fillStyle = isSelected ? '#ff6b35' : '#444444';
        this.ctx.beginPath();
        this.ctx.arc(x, buttonY, 25, 0, Math.PI * 2);
        this.ctx.fill();

        // Button border
        if (isSelected) {
          this.ctx.strokeStyle = '#ffffff';
          this.ctx.lineWidth = 3;
          this.ctx.stroke();
        }

        // Number
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.fillText(i.toString(), x, buttonY + 8);
      }
    }

    // Start instruction with pulsing glow
    const instructionPulse = 0.7 + Math.sin(Date.now() / 400) * 0.3;
    this.ctx.shadowColor = `rgba(255, 255, 255, ${instructionPulse})`;
    this.ctx.shadowBlur = 20;
    this.ctx.font = 'bold 26px Arial';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Press SPACE to start', CANVAS_WIDTH / 2, 450);
    this.ctx.shadowBlur = 0;

    // Controls
    this.ctx.font = '13px Arial';
    this.ctx.textAlign = 'left';
    const controlsX = 100;
    let y = 480;

    const playerColors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];

    if (isSinglePlayer) {
      // Show only player 1 controls
      this.ctx.fillStyle = playerColors[0];
      this.ctx.fillText('You: Arrow Keys + / (bomb)', controlsX, y);
      y += 20;
      this.ctx.fillStyle = '#888888';
      this.ctx.fillText('Opponents: AI-controlled', controlsX, y);
    } else {
      // Show all player controls
      const controls = [
        'Player 1: Arrow Keys + / (bomb)',
        'Player 2: WASD + Space (bomb)',
        'Player 3: IJKL + O (bomb)',
        'Player 4: Numpad 8456 + 0 (bomb)'
      ];

      for (let i = 0; i < 4; i++) {
        const isActive = i < playerCount;
        this.ctx.fillStyle = isActive ? playerColors[i] : '#444444';
        this.ctx.fillText(controls[i], controlsX, y);
        y += 20;
      }
    }
    this.ctx.restore();
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
