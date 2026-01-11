import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE, GRID_WIDTH, GRID_HEIGHT, COLORS } from '../constants';
import { Player } from '../entities/Player';
import { Bomb } from '../entities/Bomb';
import { Block } from '../entities/Block';
import { Explosion } from '../entities/Explosion';
import { PowerUp } from '../entities/PowerUp';
import { ParticleSystem } from './ParticleSystem';
import { Camera } from './Camera';

export interface RenderState {
  players: Player[];
  bombs: Bomb[];
  blocks: Block[];
  explosions: Explosion[];
  powerUps: PowerUp[];
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.particleSystem = new ParticleSystem();
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

    // Apply camera transform (for screen shake)
    this.ctx.save();
    this.camera.applyTransform(this.ctx);

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
    // Draw particles (on top of explosions)
    this.particleSystem.render(this.ctx);

    // Draw lighting overlay
    this.renderLighting(state);

    // Restore transform before UI rendering

    // Restore transform before UI rendering
    this.ctx.restore(); // Restore camera transform
    this.ctx.restore(); // Restore scale
  }

  getParticleSystem(): ParticleSystem {
    return this.particleSystem;
  }

  getCamera(): Camera {
    return this.camera;
  }

  private renderGround(): void {
    const ctx = this.ctx;
    // Draw checkered ground pattern with depth and texture
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const isLight = (x + y) % 2 === 0;
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        // Base tile color - bright, happy greens!
        const baseColor = isLight ? '#7FD957' : '#6BBF59'; // Light/Dark pattern

        ctx.fillStyle = baseColor;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Add "Grass" texture patches
        if ((x * 17 + y * 23) % 5 === 0) { // Deterministic random-ish pattern
          ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.fillRect(px + 10, py + 10, 4, 4);
          ctx.fillRect(px + 20, py + 30, 6, 6);
        }
        if ((x * 7 + y * 13) % 7 === 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; // Highlight tuft
          ctx.fillRect(px + 30, py + 15, 3, 3);
        }

        // Add grid lines (subtle)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

        // Add subtle inner highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    }
  }

  renderUI(alivePlayers: Player[], roundTime: number): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);

    // Draw HUD at the top with gradient
    const hudGradient = this.ctx.createLinearGradient(0, 0, 0, 50);
    hudGradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
    hudGradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    this.ctx.fillStyle = hudGradient;
    const uiHeight = 50;

    // UI Background Bar
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, uiHeight);

    // Calculate positions
    const centerX = CANVAS_WIDTH / 2;
    const padding = 20;

    // Draw Timer (Center)
    const minutes = Math.floor(roundTime / 60);
    const seconds = Math.floor(roundTime % 60);
    const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    this.ctx.fillStyle = roundTime <= 30 ? '#ff5555' : '#ffffff';
    this.ctx.font = 'bold 28px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Timer Glow
    if (roundTime <= 30) {
      this.ctx.shadowColor = '#ff0000';
      this.ctx.shadowBlur = 10 + Math.sin(Date.now() / 100) * 10;
    }
    this.ctx.fillText(timeText, centerX, uiHeight / 2);
    this.ctx.shadowBlur = 0;

    // Draw Players (Distributed)
    // P1 (Left), P2 (Left-Center), P3 (Right-Center), P4 (Right)?
    // Or just spread them out evenly.

    // Fixed slots layout to avoid overlap:
    // P1: 0 to width/4
    // P2: width/4 to width/2 (avoid center)
    // P3: width/2 to 3*width/4
    // P4: 3*width/4 to width

    // Actually, P1 & P2 Left, P3 & P4 Right. Timer in middle.
    // P1: Left Edge + padding
    // P2: Left Edge + 120px
    // P3: Right Edge - 120px
    // P4: Right Edge - padding

    const slots = [
      { x: padding + 20, align: 'left' as const },
      { x: padding + 160, align: 'left' as const },
      { x: CANVAS_WIDTH - padding - 160, align: 'right' as const },
      { x: CANVAS_WIDTH - padding - 20, align: 'right' as const }
    ];

    // We should iterate through the passed players array using their playerIndex to determine slot.
    for (const player of alivePlayers) { // Assuming this is actually "allPlayers" based on Game.ts logic usage
      const i = player.playerIndex;
      if (i >= 4) continue; // Max 4 slots support

      const slot = slots[i];
      const isAlive = player.isPlayerAlive();

      let x = slot.x;
      const y = uiHeight / 2;

      // Avatar circle
      const radius = 16;

      this.ctx.shadowBlur = 0;

      // Draw avatar background
      const colors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];
      this.ctx.fillStyle = isAlive ? colors[i] : '#444444';
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Face/Number
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 12px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(`P${i + 1}`, x, y);

      // Stats (Bomb & Power)
      if (isAlive) {
        const statX = slot.align === 'left' ? x + radius + 10 : x - radius - 10;
        const align = slot.align;

        this.ctx.textAlign = align;
        this.ctx.font = 'bold 12px Arial';

        // Bombs
        this.ctx.fillStyle = '#ffffff';
        const bombText = `💣 ${player.activeBombs}/${player.maxBombs}`;
        this.ctx.fillText(bombText, statX, y - 6);

        // Range
        this.ctx.fillStyle = '#ffaa00';
        const rangeText = `🔥 ${player.bombRange}`;
        this.ctx.fillText(rangeText, statX, y + 8);
      } else {
        // Dead Marker
        const textX = slot.align === 'left' ? x + radius + 10 : x - radius - 10;
        this.ctx.textAlign = slot.align;
        this.ctx.fillStyle = '#777777';
        this.ctx.font = 'italic 12px Arial';
        this.ctx.fillText("DEAD", textX, y);
      }
    }
    this.ctx.restore();
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
