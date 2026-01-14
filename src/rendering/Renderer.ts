import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE, GRID_WIDTH, GRID_HEIGHT, RETRO_PALETTE } from '../constants';
import { Player, BombType } from '../entities/Player';
import { Bomb } from '../entities/Bomb';
import { Block } from '../entities/Block';
import { Explosion } from '../entities/Explosion';
import { PowerUp } from '../entities/PowerUp';
import { FloatingText } from './FloatingText';
import { ScoreManager } from '../core/ScoreManager';
import { ParticleSystem } from './ParticleSystem';
import { Camera } from './Camera';
import { PixelFont } from './PixelFont';

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

    // Clear canvas with solid retro sky color
    this.ctx.fillStyle = RETRO_PALETTE.skyMid;
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

  // Pixel cloud sprites
  private static readonly CLOUD_SPRITE = [
    '....LLLL....',
    '..LLHHHHLL..',
    '.LHHHHHHHHH.',
    'LHHHHHHHHHHL',
    'LHHHHHHHHHHL',
    '.LHHHHHHHHH.',
    '..LLLLLLLL..',
  ];

  // NEW: Render drifting pixel clouds
  private renderClouds(): void {
    const ctx = this.ctx;

    for (const cloud of this.clouds) {
      // Discrete movement - snap to 2px increments
      const x = Math.floor(cloud.x / 2) * 2;
      const y = Math.floor(cloud.y);
      const pixelSize = Math.floor(cloud.size / 12);

      const sprite = Renderer.CLOUD_SPRITE;

      for (let py = 0; py < sprite.length; py++) {
        const row = sprite[py];
        for (let px = 0; px < row.length; px++) {
          const char = row[px];
          if (char === '.') continue;

          // L = light shade, H = highlight (white)
          if (char === 'L') {
            ctx.fillStyle = 'rgba(200, 220, 255, 0.25)';
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          }

          ctx.fillRect(
            Math.floor(x + px * pixelSize),
            Math.floor(y + py * pixelSize),
            pixelSize,
            pixelSize
          );
        }
      }
    }
  }

  // 4 grass tile patterns (12x12 pixel sprites)
  private static readonly GRASS_TILES = [
    // Tile 0: Plain light
    [
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
    ],
    // Tile 1: Plain dark
    [
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
    ],
    // Tile 2: Light with grass detail
    [
      'LLLLLLLLLLLL',
      'LLHLLLLLHLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLHLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLHLLLLLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLHLLLLL',
      'LLLLLLLLLLLL',
      'LLLLLLLLLLLL',
    ],
    // Tile 3: Dark with grass detail
    [
      'DDDDDDDDDDDD',
      'DDDDDDDDHDDD',
      'DDDDDDDDDDDD',
      'DDHDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDHDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDDDDDDDDDDD',
      'DDHDDDDDDDDD',
      'DDDDDDDDDDDD',
    ],
  ];

  // Small pixel decorations (3x3)
  private static readonly FLOWER_SPRITE = [
    '.W.',
    'WYW',
    '.W.',
  ];

  private static readonly CLOVER_SPRITE = [
    '.H.',
    'HHH',
    '.H.',
  ];

  private renderGround(): void {
    const ctx = this.ctx;
    const pixelSize = 4; // 12 * 4 = 48 (TILE_SIZE)

    const grassPalette: Record<string, string> = {
      'L': RETRO_PALETTE.grassLight,
      'D': RETRO_PALETTE.grassDark,
      'H': RETRO_PALETTE.grassHighlight,
    };

    // Draw pixel grass tiles (checkerboard pattern)
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const seed = x * 17 + y * 31;

        // Checkerboard pattern with detail variation
        const isLight = (x + y) % 2 === 0;
        const hasDetail = seed % 3 === 0;
        let tileIndex: number;

        if (isLight) {
          tileIndex = hasDetail ? 2 : 0;
        } else {
          tileIndex = hasDetail ? 3 : 1;
        }

        const sprite = Renderer.GRASS_TILES[tileIndex];

        // Draw the tile
        for (let sy = 0; sy < sprite.length; sy++) {
          const row = sprite[sy];
          for (let sx = 0; sx < row.length; sx++) {
            const char = row[sx];
            const color = grassPalette[char];
            if (!color) continue;

            ctx.fillStyle = color;
            ctx.fillRect(
              px + sx * pixelSize,
              py + sy * pixelSize,
              pixelSize,
              pixelSize
            );
          }
        }

        // Add small pixel decorations (rare)
        if (seed % 13 === 0) {
          const decX = px + 8 + (seed % 28);
          const decY = py + 8 + ((seed * 3) % 28);
          const isFlower = seed % 2 === 0;
          const decoration = isFlower ? Renderer.FLOWER_SPRITE : Renderer.CLOVER_SPRITE;

          const decPalette: Record<string, string> = {
            'W': '#ffffff',
            'Y': '#ffdd44',
            'H': RETRO_PALETTE.grassHighlight,
          };

          for (let dy = 0; dy < decoration.length; dy++) {
            const row = decoration[dy];
            for (let dx = 0; dx < row.length; dx++) {
              const char = row[dx];
              if (char === '.') continue;
              const color = decPalette[char];
              if (!color) continue;

              ctx.fillStyle = color;
              ctx.fillRect(
                Math.floor(decX + dx * 2),
                Math.floor(decY + dy * 2),
                2,
                2
              );
            }
          }
        }

        // Pixel tile border (shadow on bottom/right)
        ctx.fillStyle = RETRO_PALETTE.grassShadow;
        ctx.fillRect(px + TILE_SIZE - 1, py, 1, TILE_SIZE);
        ctx.fillRect(px, py + TILE_SIZE - 1, TILE_SIZE, 1);
      }
    }
  }

  // UI Layout Constants (Compact)
  private readonly CARD_WIDTH = 130;
  private readonly CARD_HEIGHT = 40;
  private readonly UI_PADDING = 8;

  renderUI(alivePlayers: Player[], roundTime: number, scoreManager?: ScoreManager): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);

    // No full-width HUD gradient (it obscures the game)

    // --- TIMER PANEL (Top Center, Pixel Style) ---
    const centerX = CANVAS_WIDTH / 2;
    const timerWidth = 80;
    const timerHeight = 32;
    const timerX = Math.floor(centerX - timerWidth / 2);
    const timerY = 5;

    // Pixel box background
    this.ctx.fillStyle = RETRO_PALETTE.uiBlack;
    this.ctx.fillRect(timerX, timerY, timerWidth, timerHeight);

    // Warning: red flashing border
    const isWarning = roundTime <= 30;
    const borderFlash = isWarning && Math.floor(this.hudAnimationTimer * 8) % 2 === 0;
    const borderColor = borderFlash ? RETRO_PALETTE.uiRed : RETRO_PALETTE.uiLight;

    // Pixel border (2px)
    this.ctx.fillStyle = borderColor;
    this.ctx.fillRect(timerX, timerY, timerWidth, 2); // top
    this.ctx.fillRect(timerX, timerY + timerHeight - 2, timerWidth, 2); // bottom
    this.ctx.fillRect(timerX, timerY, 2, timerHeight); // left
    this.ctx.fillRect(timerX + timerWidth - 2, timerY, 2, timerHeight); // right

    // Timer Text (Pixel Font)
    const minutes = Math.floor(roundTime / 60);
    const seconds = Math.floor(roundTime % 60);
    const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    const textColor = isWarning ? RETRO_PALETTE.uiRed : RETRO_PALETTE.uiWhite;

    PixelFont.drawTextCentered(this.ctx, timeText, centerX, timerY + 10, 2, textColor);

    // Progress Bar (discrete pixel blocks)
    const totalTime = 180;
    const progress = Math.max(0, roundTime / totalTime);
    const barX = timerX + 6;
    const barY = timerY + timerHeight - 8;
    const barMaxWidth = timerWidth - 12;
    const blockSize = 4;
    const numBlocks = Math.floor((barMaxWidth / blockSize) * progress);

    for (let i = 0; i < numBlocks; i++) {
      this.ctx.fillStyle = isWarning ? RETRO_PALETTE.uiRed : RETRO_PALETTE.skyDark;
      this.ctx.fillRect(barX + i * blockSize, barY, blockSize - 1, 3);
    }


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
      this.cardScorePulse[index] = 0.5;
      this.lastScores[index] = score;
    }

    const ctx = this.ctx;
    const retro_colors = [
      RETRO_PALETTE.player1,
      RETRO_PALETTE.player2,
      RETRO_PALETTE.player3,
      RETRO_PALETTE.player4
    ];
    const playerColor = retro_colors[index];
    const borderColor = isAlive ? playerColor : '#555555';

    // Pixel card background (solid, no gradients)
    ctx.fillStyle = RETRO_PALETTE.uiBlack;
    ctx.fillRect(x, y, this.CARD_WIDTH, this.CARD_HEIGHT);

    // 2px pixel border
    ctx.fillStyle = borderColor;
    ctx.fillRect(x, y, this.CARD_WIDTH, 2); // top
    ctx.fillRect(x, y + this.CARD_HEIGHT - 2, this.CARD_WIDTH, 2); // bottom
    ctx.fillRect(x, y, 2, this.CARD_HEIGHT); // left
    ctx.fillRect(x + this.CARD_WIDTH - 2, y, 2, this.CARD_HEIGHT); // right

    // Inner highlight (top-left)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(x + 2, y + 2, this.CARD_WIDTH - 6, 1);
    ctx.fillRect(x + 2, y + 2, 1, this.CARD_HEIGHT - 6);

    // Pixel avatar
    const isLeft = (index % 2 === 0);
    const avatarX = isLeft ? x + 6 : x + this.CARD_WIDTH - 26;
    const avatarY = y + 6;
    this.drawPixelAvatar(avatarX, avatarY, 20, playerColor, isAlive);

    // Content starts after avatar
    const contentX = isLeft ? x + 30 : x + 6;

    if (isAlive) {
      // Player ID with pixel font
      PixelFont.drawText(ctx, `P${index + 1}`, contentX, y + 6, 1, playerColor);

      // Score with star icon (pixel)
      ctx.fillStyle = RETRO_PALETTE.uiGold;
      ctx.fillRect(contentX + 24, y + 6, 4, 4); // simple pixel star
      ctx.fillRect(contentX + 22, y + 8, 8, 2);
      ctx.fillRect(contentX + 24, y + 10, 4, 2);

      PixelFont.drawText(ctx, `${score}`, contentX + 34, y + 6, 1, RETRO_PALETTE.uiGold);

      // Stats row with pixel icons
      const statsY = y + 22;

      // Bomb pixel icon (5x5)
      this.drawPixelBombIcon(contentX, statsY, player.bombType);
      PixelFont.drawText(ctx, `${player.maxBombs}`, contentX + 10, statsY, 1, RETRO_PALETTE.uiWhite);

      // Fire/range pixel icon
      ctx.fillStyle = RETRO_PALETTE.fireOrange;
      ctx.fillRect(contentX + 28, statsY + 1, 2, 5);
      ctx.fillRect(contentX + 26, statsY + 2, 6, 3);
      PixelFont.drawText(ctx, `${player.bombRange}`, contentX + 36, statsY, 1, RETRO_PALETTE.fireOrange);

      // Ability indicator (pixel icons)
      const abilityX = contentX + 54;
      if (player.hasShield()) {
        this.drawPixelAbilityIcon(abilityX, statsY, 'shield');
      } else if (player.canTeleport()) {
        this.drawPixelAbilityIcon(abilityX, statsY, 'teleport');
      } else if (player.hasAbility('kick')) {
        this.drawPixelAbilityIcon(abilityX, statsY, 'kick');
      } else if (player.hasAbility('punch')) {
        this.drawPixelAbilityIcon(abilityX, statsY, 'punch');
      }
    } else {
      // Dead state
      PixelFont.drawTextCentered(ctx, 'OUT', x + this.CARD_WIDTH / 2, y + this.CARD_HEIGHT / 2 - 4, 1, '#666666');
    }
  }

  private drawPixelAvatar(x: number, y: number, size: number, color: string, isAlive: boolean): void {
    const ctx = this.ctx;

    // Background circle (pixel approximation - square with cut corners)
    ctx.fillStyle = isAlive ? color : '#333333';
    ctx.fillRect(x + 2, y, size - 4, size);
    ctx.fillRect(x, y + 2, size, size - 4);

    // Eyes
    if (isAlive) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 4, y + 6, 4, 4);
      ctx.fillRect(x + size - 8, y + 6, 4, 4);
      // Pupils
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + 6, y + 8, 2, 2);
      ctx.fillRect(x + size - 6, y + 8, 2, 2);
    } else {
      // X eyes
      ctx.fillStyle = '#888888';
      ctx.fillRect(x + 4, y + 6, 2, 2);
      ctx.fillRect(x + 6, y + 8, 2, 2);
      ctx.fillRect(x + size - 6, y + 6, 2, 2);
      ctx.fillRect(x + size - 8, y + 8, 2, 2);
    }
  }

  private drawPixelBombIcon(x: number, y: number, type: BombType): void {
    const ctx = this.ctx;
    let color: string;

    switch (type) {
      case BombType.FIRE: color = RETRO_PALETTE.fireRed; break;
      case BombType.ICE: color = RETRO_PALETTE.iceBlue; break;
      case BombType.PIERCING: color = RETRO_PALETTE.magicPurple; break;
      default: color = RETRO_PALETTE.bombBody; break;
    }

    // Simple 6x6 bomb
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y, 4, 6);
    ctx.fillRect(x, y + 1, 6, 4);
    // Fuse
    ctx.fillStyle = RETRO_PALETTE.bombSpark;
    ctx.fillRect(x + 2, y - 2, 2, 2);
  }

  private drawPixelAbilityIcon(x: number, y: number, type: 'kick' | 'punch' | 'shield' | 'teleport'): void {
    const ctx = this.ctx;

    switch (type) {
      case 'shield':
        ctx.fillStyle = RETRO_PALETTE.iceCyan;
        ctx.fillRect(x + 1, y, 4, 2);
        ctx.fillRect(x, y + 2, 6, 4);
        ctx.fillRect(x + 1, y + 6, 4, 2);
        break;
      case 'teleport':
        ctx.fillStyle = RETRO_PALETTE.magicPink;
        ctx.fillRect(x + 2, y, 2, 2);
        ctx.fillRect(x, y + 2, 6, 2);
        ctx.fillRect(x + 2, y + 4, 2, 2);
        break;
      case 'kick':
        ctx.fillStyle = '#f77622';
        ctx.fillRect(x, y + 2, 6, 4);
        ctx.fillRect(x + 4, y + 4, 4, 2);
        break;
      case 'punch':
        ctx.fillStyle = RETRO_PALETTE.fireOrange;
        ctx.fillRect(x, y + 1, 4, 4);
        ctx.fillRect(x + 4, y + 2, 4, 2);
        break;
    }
  }

  renderCountdown(count: number): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);

    // Dark overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Discrete pulse (2 sizes)
    const pulsePhase = Math.floor(Date.now() / 200) % 2;
    const pixelScale = pulsePhase === 0 ? 10 : 9;

    // Draw large pixel number with outline
    const text = count.toString();
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;

    // Orange outline
    PixelFont.drawTextWithOutline(this.ctx, text, centerX, centerY - 30, pixelScale, RETRO_PALETTE.fireOrange, '#ffffff');

    this.ctx.restore();
  }

  renderGameOver(winner: Player | null): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);

    // Dark overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;

    if (winner) {
      const retro_colors = [
        RETRO_PALETTE.player1,
        RETRO_PALETTE.player2,
        RETRO_PALETTE.player3,
        RETRO_PALETTE.player4
      ];
      const winnerColor = retro_colors[winner.playerIndex];

      // "PLAYER X" text
      PixelFont.drawTextWithOutline(
        this.ctx,
        `PLAYER ${winner.playerIndex + 1}`,
        centerX,
        centerY - 80,
        4,
        winnerColor,
        '#000000'
      );

      // "WINS!" text with blinking
      const blink = Math.floor(Date.now() / 300) % 2 === 0;
      PixelFont.drawTextWithOutline(
        this.ctx,
        'WINS!',
        centerX,
        centerY - 20,
        5,
        blink ? '#ffffff' : RETRO_PALETTE.uiGold,
        '#000000'
      );
    } else {
      // "DRAW!" text with blinking
      const blink = Math.floor(Date.now() / 300) % 2 === 0;
      PixelFont.drawTextWithOutline(
        this.ctx,
        'DRAW!',
        centerX,
        centerY - 40,
        5,
        blink ? '#ffffff' : '#888888',
        '#000000'
      );
    }

    // Instruction text (blinking cursor style)
    const cursorBlink = Math.floor(Date.now() / 500) % 2 === 0;
    const instructionText = cursorBlink ? 'PRESS SPACE TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN_';
    PixelFont.drawTextCentered(this.ctx, instructionText, centerX, centerY + 80, 2, '#aaaaaa');

    this.ctx.restore();
  }

  renderMainMenu(playerCount: number = 2, isSinglePlayer: boolean = false, aiDifficulty: 'easy' | 'medium' | 'hard' = 'medium'): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);
    const time = Date.now();

    // Solid dark background
    this.ctx.fillStyle = RETRO_PALETTE.uiBlack;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw pixel background elements
    this.drawMenuBackground(time);

    // Draw pixel bombs
    this.drawFloatingBombs(time);

    // Draw pixel characters
    this.drawMenuCharacters(time, playerCount, isSinglePlayer);

    // Pixel title
    this.drawBouncyTitle(time);

    // Mode selection panel
    this.drawMenuPanel(time, playerCount, isSinglePlayer, aiDifficulty);

    // Start instruction - blinking text
    const blink = Math.floor(time / 500) % 2 === 0;
    if (blink) {
      PixelFont.drawTextCentered(this.ctx, 'PRESS SPACE TO START', CANVAS_WIDTH / 2, 540, 2, RETRO_PALETTE.uiGold);
    }

    // Controls at bottom
    this.drawMenuControls(isSinglePlayer, playerCount);

    this.ctx.restore();
  }

  private drawMenuBackground(time: number): void {
    const ctx = this.ctx;

    // 1. Pixel grid pattern
    ctx.fillStyle = RETRO_PALETTE.uiDark;
    for (let x = 0; x < CANVAS_WIDTH; x += TILE_SIZE) {
      for (let y = 0; y < CANVAS_HEIGHT; y += TILE_SIZE) {
        // Checkerboard pattern
        if ((Math.floor(x / TILE_SIZE) + Math.floor(y / TILE_SIZE)) % 2 === 0) {
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // 2. Pixel sparkles (discrete positions)
    const sparklePhase = Math.floor(time / 200) % 4;
    ctx.fillStyle = RETRO_PALETTE.fireYellow;
    for (let i = 0; i < 20; i++) {
      // Fixed positions based on index, sparkle on/off based on phase
      const showSparkle = (i + sparklePhase) % 4 === 0;
      if (showSparkle) {
        const px = ((i * 137) % CANVAS_WIDTH);
        const py = ((i * 89) % CANVAS_HEIGHT);
        ctx.fillRect(px, py, 2, 2);
      }
    }

    // 3. Scanlines (every 2 pixels)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let y = 0; y < CANVAS_HEIGHT; y += 2) {
      ctx.fillRect(0, y, CANVAS_WIDTH, 1);
    }

    // 4. Border frame
    const borderSize = 4;
    ctx.fillStyle = RETRO_PALETTE.uiMid;
    // Top
    ctx.fillRect(0, 0, CANVAS_WIDTH, borderSize);
    // Bottom
    ctx.fillRect(0, CANVAS_HEIGHT - borderSize, CANVAS_WIDTH, borderSize);
    // Left
    ctx.fillRect(0, 0, borderSize, CANVAS_HEIGHT);
    // Right
    ctx.fillRect(CANVAS_WIDTH - borderSize, 0, borderSize, CANVAS_HEIGHT);
  }

  private drawFloatingBombs(time: number): void {
    const ctx = this.ctx;
    const bombs = [
      { x: 80, y: 150, size: 24, phase: 0 },
      { x: CANVAS_WIDTH - 80, y: 180, size: 28, phase: 1 },
      { x: 120, y: 450, size: 20, phase: 2 },
      { x: CANVAS_WIDTH - 100, y: 480, size: 22, phase: 3 },
      { x: 60, y: 320, size: 18, phase: 4 },
      { x: CANVAS_WIDTH - 60, y: 350, size: 20, phase: 5 },
    ];

    bombs.forEach(bomb => {
      // Discrete bob - 3 positions
      const bobPhase = Math.floor((time / 300 + bomb.phase * 100) / 100) % 3;
      const bobOffsets = [0, -4, -8];
      const bobY = bobOffsets[bobPhase];

      const px = Math.floor(bomb.x - bomb.size / 2);
      const py = Math.floor(bomb.y + bobY - bomb.size / 2);

      // Draw pixel bomb (square with cut corners)
      ctx.fillStyle = RETRO_PALETTE.bombBody;
      const s = bomb.size;
      const corner = Math.floor(s / 4);

      // Main body (octagon-ish shape)
      ctx.fillRect(px + corner, py, s - corner * 2, s);
      ctx.fillRect(px, py + corner, s, s - corner * 2);

      // Highlight pixels
      ctx.fillStyle = RETRO_PALETTE.bombHighlight;
      ctx.fillRect(px + corner + 2, py + corner, 4, 4);

      // Fuse (vertical line)
      ctx.fillStyle = RETRO_PALETTE.bombFuse;
      ctx.fillRect(px + Math.floor(s / 2) - 1, py - 6, 3, 8);

      // Fuse spark - blinking
      const sparkOn = Math.floor(time / 100 + bomb.phase * 50) % 2 === 0;
      if (sparkOn) {
        ctx.fillStyle = RETRO_PALETTE.bombSpark;
        ctx.fillRect(px + Math.floor(s / 2) - 2, py - 10, 4, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + Math.floor(s / 2) - 1, py - 9, 2, 2);
      }
    });
  }

  private drawMenuCharacters(time: number, playerCount: number, isSinglePlayer: boolean): void {
    const ctx = this.ctx;
    const playerColors = [
      RETRO_PALETTE.player1,
      RETRO_PALETTE.player2,
      RETRO_PALETTE.player3,
      RETRO_PALETTE.player4
    ];
    const numPlayers = isSinglePlayer ? 4 : playerCount;

    const positions = [
      { x: 100, baseY: 280 },
      { x: CANVAS_WIDTH - 100, baseY: 290 },
      { x: 130, baseY: 420 },
      { x: CANVAS_WIDTH - 130, baseY: 410 },
    ];

    for (let i = 0; i < numPlayers; i++) {
      const pos = positions[i];
      // Discrete bounce - 4 positions
      const bouncePhase = Math.floor((time / 150 + i * 50) / 50) % 4;
      const bounceOffsets = [0, -8, -12, -8];
      const bounceY = bounceOffsets[bouncePhase];

      this.drawPixelCharacter(ctx, pos.x, pos.baseY + bounceY, playerColors[i], time, i);
    }
  }

  private drawPixelCharacter(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, time: number, index: number): void {
    const size = 32;
    const px = Math.floor(cx - size / 2);
    const py = Math.floor(cy - size / 2);
    const pixel = 4; // Pixel size for character

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(px + 4, py + size + 2, size - 8, 4);

    // Body - square with cut corners
    ctx.fillStyle = color;
    const corner = pixel * 2;
    ctx.fillRect(px + corner, py, size - corner * 2, size);
    ctx.fillRect(px, py + corner, size, size - corner * 2);

    // Outline
    ctx.fillStyle = '#000000';
    // Top edge
    ctx.fillRect(px + corner, py - 2, size - corner * 2, 2);
    // Bottom edge
    ctx.fillRect(px + corner, py + size, size - corner * 2, 2);
    // Left edge
    ctx.fillRect(px - 2, py + corner, 2, size - corner * 2);
    // Right edge
    ctx.fillRect(px + size, py + corner, 2, size - corner * 2);

    // Highlight pixels
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.4;
    ctx.fillRect(px + corner + pixel, py + corner, pixel * 2, pixel);
    ctx.globalAlpha = 1;

    // Eyes - blink occasionally
    const blinkPhase = Math.floor(time / 2000 + index) % 5 === 0 && (time % 2000) < 150;
    const eyeY = py + size / 2 - pixel;

    if (blinkPhase) {
      // Closed eyes - horizontal lines
      ctx.fillStyle = '#000000';
      ctx.fillRect(px + pixel * 2, eyeY + pixel, pixel * 2, 2);
      ctx.fillRect(px + size - pixel * 4, eyeY + pixel, pixel * 2, 2);
    } else {
      // Open eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px + pixel * 2, eyeY, pixel * 2, pixel * 2);
      ctx.fillRect(px + size - pixel * 4, eyeY, pixel * 2, pixel * 2);

      // Pupils - discrete look direction
      const lookPhase = Math.floor(time / 500 + index * 100) % 3;
      const lookOffsets = [0, pixel / 2, -pixel / 2];
      const lookX = lookOffsets[lookPhase];
      ctx.fillStyle = '#000000';
      ctx.fillRect(px + pixel * 2 + pixel / 2 + lookX, eyeY + pixel / 2, pixel, pixel);
      ctx.fillRect(px + size - pixel * 4 + pixel / 2 + lookX, eyeY + pixel / 2, pixel, pixel);
    }

    // Feet - alternating animation
    const footPhase = Math.floor(time / 200 + index * 50) % 2;
    ctx.fillStyle = color;
    if (footPhase === 0) {
      ctx.fillRect(px + pixel, py + size, pixel * 2, pixel);
      ctx.fillRect(px + size - pixel * 3, py + size + 2, pixel * 2, pixel);
    } else {
      ctx.fillRect(px + pixel, py + size + 2, pixel * 2, pixel);
      ctx.fillRect(px + size - pixel * 3, py + size, pixel * 2, pixel);
    }

    // Hands - waving
    const handPhase = Math.floor(time / 250 + index * 75) % 3;
    const handOffsets = [-pixel, 0, pixel];
    const handY = handOffsets[handPhase];
    ctx.fillStyle = color;
    // Left hand
    ctx.fillRect(px - pixel * 2, py + size / 2 + handY, pixel * 2, pixel * 2);
    // Right hand
    ctx.fillRect(px + size, py + size / 2 - handY, pixel * 2, pixel * 2);

    // Hand outlines
    ctx.fillStyle = '#000000';
    ctx.fillRect(px - pixel * 2 - 1, py + size / 2 + handY - 1, 1, pixel * 2 + 2);
    ctx.fillRect(px + size + pixel * 2, py + size / 2 - handY - 1, 1, pixel * 2 + 2);
  }

  private drawBouncyTitle(time: number): void {
    const ctx = this.ctx;
    const title = 'BOMB BATTLES';
    const baseY = 60;
    const scale = 6;

    // Calculate total width for centering
    const charWidth = (5 + 1) * scale; // 5px char + 1px spacing
    const totalWidth = title.length * charWidth - scale;
    let currentX = Math.floor(CANVAS_WIDTH / 2 - totalWidth / 2);

    // Draw each letter with discrete bounce
    for (let i = 0; i < title.length; i++) {
      const char = title[i];
      // Discrete bounce - 4 positions
      const bouncePhase = Math.floor((time / 100 + i * 30) / 30) % 4;
      const bounceOffsets = [0, -4, -8, -4];
      const bounceY = bounceOffsets[bouncePhase];

      // Color cycling between fire colors
      const colorPhase = Math.floor((time / 150 + i * 20) / 20) % 4;
      const colors = [
        RETRO_PALETTE.fireWhite,
        RETRO_PALETTE.fireYellow,
        RETRO_PALETTE.fireOrange,
        RETRO_PALETTE.fireYellow
      ];
      const color = colors[colorPhase];

      // Draw with outline
      PixelFont.drawText(ctx, char, currentX + scale, baseY + bounceY + scale, scale, RETRO_PALETTE.uiBlack);
      PixelFont.drawText(ctx, char, currentX, baseY + bounceY, scale, color);

      currentX += charWidth;
    }

    // Subtitle
    PixelFont.drawTextCentered(ctx, 'CLASSIC ARENA ACTION', CANVAS_WIDTH / 2, baseY + 60, 2, RETRO_PALETTE.uiLight);
  }

  private drawMenuPanel(time: number, playerCount: number, isSinglePlayer: boolean, aiDifficulty: 'easy' | 'medium' | 'hard'): void {
    const ctx = this.ctx;
    const panelX = CANVAS_WIDTH / 2 - 180;
    const panelY = 150;
    const panelWidth = 360;
    const panelHeight = 320;
    const border = 4;

    // Panel background - solid color with pixel border
    ctx.fillStyle = RETRO_PALETTE.uiBlack;
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

    // Border
    ctx.fillStyle = RETRO_PALETTE.uiLight;
    ctx.fillRect(panelX, panelY, panelWidth, border); // Top
    ctx.fillRect(panelX, panelY + panelHeight - border, panelWidth, border); // Bottom
    ctx.fillRect(panelX, panelY, border, panelHeight); // Left
    ctx.fillRect(panelX + panelWidth - border, panelY, border, panelHeight); // Right

    // Inner border
    ctx.fillStyle = RETRO_PALETTE.uiMid;
    ctx.fillRect(panelX + border, panelY + border, panelWidth - border * 2, 2);
    ctx.fillRect(panelX + border, panelY + panelHeight - border - 2, panelWidth - border * 2, 2);

    // Mode selection header
    PixelFont.drawTextCentered(ctx, 'GAME MODE', CANVAS_WIDTH / 2, panelY + 30, 3, RETRO_PALETTE.uiWhite);

    // Mode buttons
    const modeY = panelY + 70;
    this.drawPixelButton(ctx, CANVAS_WIDTH / 2 - 100, modeY, 90, 40, 'SINGLE', 'S', isSinglePlayer, time, 0);
    this.drawPixelButton(ctx, CANVAS_WIDTH / 2 + 10, modeY, 90, 40, 'MULTI', 'M', !isSinglePlayer, time, 1);

    // Options section
    const optionsY = panelY + 140;

    if (isSinglePlayer) {
      PixelFont.drawTextCentered(ctx, 'AI DIFFICULTY', CANVAS_WIDTH / 2, optionsY, 2, RETRO_PALETTE.uiWhite);

      const difficulties: ('easy' | 'medium' | 'hard')[] = ['easy', 'medium', 'hard'];
      const diffLabels = ['EASY', 'MED', 'HARD'];
      const diffY = optionsY + 30;
      const spacing = 100;
      const startX = CANVAS_WIDTH / 2 - spacing;

      for (let i = 0; i < 3; i++) {
        const isSelected = aiDifficulty === difficulties[i];
        this.drawPixelButton(ctx, startX + i * spacing - 40, diffY, 80, 36, diffLabels[i], String(i + 1), isSelected, time, i + 2);
      }
    } else {
      PixelFont.drawTextCentered(ctx, 'PLAYERS', CANVAS_WIDTH / 2, optionsY, 2, RETRO_PALETTE.uiWhite);

      const buttonY = optionsY + 35;
      const spacing = 60;
      const startX = CANVAS_WIDTH / 2 - spacing;
      const size = 40;

      for (let i = 2; i <= 4; i++) {
        const isSelected = playerCount === i;
        const px = Math.floor(startX + (i - 2) * spacing - size / 2);
        const py = buttonY;

        // Discrete bounce for selected
        let offsetY = 0;
        if (isSelected) {
          const bouncePhase = Math.floor(time / 150) % 2;
          offsetY = bouncePhase === 0 ? -2 : 0;
        }

        // Button box
        ctx.fillStyle = isSelected ? RETRO_PALETTE.fireOrange : RETRO_PALETTE.uiDark;
        ctx.fillRect(px, py + offsetY, size, size);

        // Border
        ctx.fillStyle = isSelected ? RETRO_PALETTE.fireYellow : RETRO_PALETTE.uiMid;
        ctx.fillRect(px, py + offsetY, size, 3);
        ctx.fillRect(px, py + offsetY + size - 3, size, 3);
        ctx.fillRect(px, py + offsetY, 3, size);
        ctx.fillRect(px + size - 3, py + offsetY, 3, size);

        // Number
        PixelFont.drawTextCentered(ctx, String(i), px + size / 2, py + offsetY + 12, 3, RETRO_PALETTE.uiWhite);
      }
    }

    // Player indicators
    const indicatorY = panelY + panelHeight - 60;
    const playerColors = [
      RETRO_PALETTE.player1,
      RETRO_PALETTE.player2,
      RETRO_PALETTE.player3,
      RETRO_PALETTE.player4
    ];

    PixelFont.drawTextCentered(ctx, 'PLAYERS', CANVAS_WIDTH / 2, indicatorY - 20, 1, RETRO_PALETTE.uiLight);

    const numIndicators = isSinglePlayer ? 4 : playerCount;
    const indicatorSpacing = 36;
    const indicatorStartX = CANVAS_WIDTH / 2 - ((numIndicators - 1) * indicatorSpacing) / 2;

    for (let i = 0; i < numIndicators; i++) {
      const x = Math.floor(indicatorStartX + i * indicatorSpacing);
      const size = 16;

      // Blinking for selected indicator
      const blinkPhase = Math.floor(time / 200 + i * 50) % 3;
      const showBorder = blinkPhase !== 0;

      // Indicator box
      ctx.fillStyle = playerColors[i];
      ctx.fillRect(x - size / 2, indicatorY - size / 2, size, size);

      // Border
      if (showBorder) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - size / 2 - 2, indicatorY - size / 2 - 2, size + 4, 2);
        ctx.fillRect(x - size / 2 - 2, indicatorY + size / 2, size + 4, 2);
        ctx.fillRect(x - size / 2 - 2, indicatorY - size / 2, 2, size + 4);
        ctx.fillRect(x + size / 2, indicatorY - size / 2, 2, size + 4);
      }

      // AI label
      if (isSinglePlayer && i > 0) {
        PixelFont.drawTextCentered(ctx, 'AI', x, indicatorY + size / 2 + 10, 1, RETRO_PALETTE.uiLight);
      }
    }
  }

  private drawPixelButton(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, label: string, key: string, isSelected: boolean, time: number, _index: number): void {
    // Discrete bounce for selected
    let offsetY = 0;
    if (isSelected) {
      const bouncePhase = Math.floor(time / 150) % 2;
      offsetY = bouncePhase === 0 ? -2 : 0;
    }

    const px = Math.floor(x);
    const py = Math.floor(y + offsetY);

    // Button background
    ctx.fillStyle = isSelected ? RETRO_PALETTE.fireOrange : RETRO_PALETTE.uiDark;
    ctx.fillRect(px, py, width, height);

    // Border
    const borderColor = isSelected ? RETRO_PALETTE.fireYellow : RETRO_PALETTE.uiMid;
    ctx.fillStyle = borderColor;
    ctx.fillRect(px, py, width, 3); // Top
    ctx.fillRect(px, py + height - 3, width, 3); // Bottom
    ctx.fillRect(px, py, 3, height); // Left
    ctx.fillRect(px + width - 3, py, 3, height); // Right

    // Label
    PixelFont.drawTextCentered(ctx, label, px + width / 2, py + 8, 2, RETRO_PALETTE.uiWhite);

    // Key hint
    PixelFont.drawTextCentered(ctx, '(' + key + ')', px + width / 2, py + height - 14, 1, RETRO_PALETTE.uiLight);
  }

  private drawMenuControls(isSinglePlayer: boolean, playerCount: number): void {
    const ctx = this.ctx;
    const playerColors = [
      RETRO_PALETTE.player1,
      RETRO_PALETTE.player2,
      RETRO_PALETTE.player3,
      RETRO_PALETTE.player4
    ];

    const y = 580;

    if (isSinglePlayer) {
      PixelFont.drawText(ctx, 'YOU: ARROWS + /', 40, y, 1, playerColors[0]);
      PixelFont.drawText(ctx, 'AI OPPONENTS', 220, y, 1, RETRO_PALETTE.uiLight);
    } else {
      const controls = [
        'P1:ARROWS',
        'P2:WASD',
        'P3:IJKL',
        'P4:NUMPAD'
      ];

      let currentX = 40;
      for (let i = 0; i < playerCount; i++) {
        PixelFont.drawText(ctx, controls[i], currentX, y, 1, playerColors[i]);
        currentX += PixelFont.measureText(controls[i], 1) + 20;
      }
    }
  }

  renderPaused(): void {
    this.ctx.save();
    this.ctx.scale(this.scale, this.scale);

    // Dark overlay
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;

    // "PAUSED" text with blinking cursor
    const cursorBlink = Math.floor(Date.now() / 500) % 2 === 0;
    PixelFont.drawTextWithOutline(
      this.ctx,
      'PAUSED',
      centerX,
      centerY - 30,
      5,
      '#ffffff',
      RETRO_PALETTE.uiBlack
    );

    // Blinking cursor underneath
    if (cursorBlink) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(centerX - 15, centerY + 30, 30, 4);
    }

    // Instruction text
    PixelFont.drawTextCentered(this.ctx, 'PRESS ESC TO RESUME', centerX, centerY + 60, 2, '#aaaaaa');

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
