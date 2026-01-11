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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.particleSystem = new ParticleSystem();
    this.camera = new Camera();

    // Set canvas size
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    // Pixel-perfect rendering
    this.ctx.imageSmoothingEnabled = false;
  }

  update(deltaTime: number): void {
    this.particleSystem.update(deltaTime);
    this.camera.update(deltaTime);
  }

  render(state: RenderState, interpolation: number): void {
    // Clear canvas (before camera transform to clear full screen)
    this.ctx.fillStyle = '#1a1a2e';
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
    this.particleSystem.render(this.ctx);

    // Restore transform before UI rendering
    this.ctx.restore();
  }

  getParticleSystem(): ParticleSystem {
    return this.particleSystem;
  }

  getCamera(): Camera {
    return this.camera;
  }

  private renderGround(): void {
    // Draw checkered ground pattern
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const isLight = (x + y) % 2 === 0;
        this.ctx.fillStyle = isLight ? '#3d7a35' : COLORS.background;
        this.ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  renderUI(alivePlayers: Player[], roundTime: number): void {
    // Draw HUD at the top
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, 40);

    // Timer
    const minutes = Math.floor(roundTime / 60);
    const seconds = Math.floor(roundTime % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 24px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(timeStr, CANVAS_WIDTH / 2, 28);

    // Player status
    const statusWidth = 100;
    const startX = 20;

    for (let i = 0; i < 4; i++) {
      const player = alivePlayers.find(p => p.playerIndex === i);
      const x = startX + i * statusWidth;

      // Player indicator
      const colors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];
      this.ctx.fillStyle = player?.isPlayerAlive() ? colors[i] : '#444444';
      this.ctx.beginPath();
      this.ctx.arc(x + 15, 20, 12, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 12px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`P${i + 1}`, x + 15, 24);

      if (player?.isPlayerAlive()) {
        // Show bomb count and range
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`B:${player.maxBombs} R:${player.bombRange}`, x + 32, 16);
        this.ctx.fillText(`S:${player.speed.toFixed(1)}`, x + 32, 28);
      }
    }
  }

  renderCountdown(count: number): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 120px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(count.toString(), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  }

  renderGameOver(winner: Player | null): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    if (winner) {
      const colors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];
      this.ctx.fillStyle = colors[winner.playerIndex];
      this.ctx.font = 'bold 48px Arial';
      this.ctx.fillText(`PLAYER ${winner.playerIndex + 1} WINS!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
    } else {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 48px Arial';
      this.ctx.fillText('DRAW!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
    }

    this.ctx.fillStyle = '#888888';
    this.ctx.font = '24px Arial';
    this.ctx.fillText('Press SPACE to play again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40);
  }

  renderMainMenu(playerCount: number = 2): void {
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Title
    this.ctx.fillStyle = '#ff6b35';
    this.ctx.font = 'bold 56px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('PLAYING WITH FIRE', CANVAS_WIDTH / 2, 120);

    // Subtitle
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '24px Arial';
    this.ctx.fillText('A Bomberman Clone', CANVAS_WIDTH / 2, 170);

    // Player count selector
    this.ctx.font = 'bold 28px Arial';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText('Players:', CANVAS_WIDTH / 2, 240);

    // Player count buttons
    const buttonY = 280;
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

    // Instructions
    this.ctx.font = '16px Arial';
    this.ctx.fillStyle = '#888888';
    this.ctx.fillText('Press 2, 3, or 4 to select players', CANVAS_WIDTH / 2, 330);

    this.ctx.font = 'bold 22px Arial';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText('Press SPACE to start', CANVAS_WIDTH / 2, 370);

    // Controls
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'left';
    const controlsX = 120;
    let y = 420;

    const playerColors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];
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
      y += 24;
    }
  }

  renderPaused(): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 48px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    this.ctx.font = '24px Arial';
    this.ctx.fillText('Press ESC to resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }
}
