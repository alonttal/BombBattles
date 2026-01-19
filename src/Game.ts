import {
  GamePhase,
  Direction,
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  ROUND_TIME,
  COUNTDOWN_TIME,
  POWERUP_SPAWN_CHANCE,
  COLORS,
  CANVAS_WIDTH,
  CANVAS_HEIGHT
} from './constants';
import { GameLoop } from './core/GameLoop';
import { InputManager } from './core/InputManager';
import { EventBus } from './core/EventBus';
import { SoundManager } from './core/SoundManager';
import { Renderer, RenderState } from './rendering/Renderer';
import { Player, BombType } from './entities/Player';
import { Bomb } from './entities/Bomb';
import { Block } from './entities/Block';
import { Explosion, ExplosionTile } from './entities/Explosion';
import { PowerUp, PowerUpType } from './entities/PowerUp';
import { TileType, MapData, ALL_MAPS } from './map/TileTypes';
import { AIController } from './ai/AIController';
import { ScoreManager, ScoreEvent } from './core/ScoreManager';
import { FloatingText } from './rendering/FloatingText';
import { Camera } from './rendering/Camera';
import {ParticleSystem} from "./rendering/ParticleSystem.ts";

export class Game {
  private renderer: Renderer;
  private particleSystem: ParticleSystem;
  private camera: Camera;
  private inputManager: InputManager;
  private gameLoop: GameLoop;

  private phase: GamePhase = GamePhase.MAIN_MENU;
  private players: Player[] = [];
  private bombs: Bomb[] = [];
  private blocks: Block[] = [];
  private explosions: Explosion[] = [];
  private powerUps: PowerUp[] = [];
  private pendingPowerUps: { x: number; y: number; type: PowerUpType }[] = [];
  private floatingTexts: FloatingText[] = [];

  private scoreManager: ScoreManager;

  private roundTime: number = ROUND_TIME;
  private countdownTime: number = COUNTDOWN_TIME;
  private playerCount: number = 2;
  private winner: Player | null = null;

  // AI support
  private aiControllers: Map<number, AIController> = new Map();
  private aiPlayers: Set<number> = new Set();
  private isSinglePlayer: boolean = false;
  private aiDifficulty: 'easy' | 'medium' | 'hard' = 'medium';

  // Map selection
  private selectedMapIndex: number = 0;

  // Grid for collision detection
  private grid: (Block | Bomb | null)[][] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.particleSystem = new ParticleSystem();
    this.camera = new Camera()
    this.inputManager = new InputManager();
    this.gameLoop = new GameLoop(
      this.update.bind(this),
      this.render.bind(this)
    );

    this.setupEventListeners();
    this.initializeGrid();

    // Initialize with default 4 players max
    this.scoreManager = new ScoreManager(4);
  }

  private setupEventListeners(): void {
    EventBus.on('bomb-placed', this.onBombPlaced.bind(this));
    EventBus.on('bomb-explode', this.onBombExplode.bind(this));
    EventBus.on('bomb-landed', this.onBombLanded.bind(this));
    EventBus.on('block-destroyed', this.onBlockDestroyed.bind(this));
    EventBus.on('player-died', this.onPlayerDied.bind(this));
    EventBus.on('score-changed', this.onScoreChanged.bind(this));
    EventBus.on('teleport-start', this.onTeleportStart.bind(this));
    EventBus.on('teleport-arrived', this.onTeleportArrived.bind(this));
    EventBus.on('player-step', this.onPlayerStep.bind(this));
    EventBus.on('player-trail', this.onPlayerTrail.bind(this));
    EventBus.on('player-dust-cloud', this.onPlayerDustCloud.bind(this));
    EventBus.on('player-speed-lines', this.onPlayerSpeedLines.bind(this));
    EventBus.on('bomb-danger-sparks', this.onBombDangerSparks.bind(this));
    EventBus.on('shield-consumed', this.onShieldConsumed.bind(this));
    EventBus.on('diarrhea-bomb', this.onDiarrheaBomb.bind(this));
    EventBus.on('player-pushback', this.onPlayerPushback.bind(this));
  }

  private initializeGrid(): void {
    this.grid = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      this.grid[y] = [];
      for (let x = 0; x < GRID_WIDTH; x++) {
        this.grid[y][x] = null;
      }
    }
  }

  start(): void {
    this.gameLoop.start();
  }

  private update(deltaTime: number): void {
    // Check for hit stop (visual freeze frame juice)
    if (this.renderer.isFrozen()) {
      this.renderer.update(deltaTime);
      return;
    }

    switch (this.phase) {
      case GamePhase.MAIN_MENU:
        this.updateMainMenu();
        break;
      case GamePhase.COUNTDOWN:
        this.updateCountdown(deltaTime);
        break;
      case GamePhase.PLAYING:
        this.updatePlaying(deltaTime);
        break;
      case GamePhase.PAUSED:
        this.updatePaused();
        break;
      case GamePhase.GAME_OVER:
        this.updateGameOver();
        break;
    }

    this.inputManager.clearFrameState();
  }

  private updateMainMenu(): void {
    // Start menu music if not already playing
    if (!SoundManager.isMenuMusicPlaying()) {
      SoundManager.startMenuMusic();
    }

    if (this.inputManager.isKeyJustPressed('Space')) {
      SoundManager.play('menuSelect');
      this.startNewGame();
    }

    // S key for single player
    if (this.inputManager.isKeyJustPressed('KeyS')) {
      this.isSinglePlayer = true;
      this.playerCount = 4;
      SoundManager.play('menuSelect');
    }

    // M key for multiplayer
    if (this.inputManager.isKeyJustPressed('KeyM')) {
      this.isSinglePlayer = false;
      SoundManager.play('menuSelect');
    }

    // Number keys to select player count (multiplayer only)
    if (!this.isSinglePlayer) {
      if (this.inputManager.isKeyJustPressed('Digit2')) {
        this.playerCount = 2;
        SoundManager.play('menuSelect');
      }
      if (this.inputManager.isKeyJustPressed('Digit3')) {
        this.playerCount = 3;
        SoundManager.play('menuSelect');
      }
      if (this.inputManager.isKeyJustPressed('Digit4')) {
        this.playerCount = 4;
        SoundManager.play('menuSelect');
      }
    }

    // Difficulty selection for single player (1, 2, 3 keys)
    if (this.isSinglePlayer) {
      if (this.inputManager.isKeyJustPressed('Digit1')) {
        this.aiDifficulty = 'easy';
        SoundManager.play('menuSelect');
      }
      if (this.inputManager.isKeyJustPressed('Digit2')) {
        this.aiDifficulty = 'medium';
        SoundManager.play('menuSelect');
      }
      if (this.inputManager.isKeyJustPressed('Digit3')) {
        this.aiDifficulty = 'hard';
        SoundManager.play('menuSelect');
      }
    }

    if (this.inputManager.isKeyJustPressed('KeyZ')) {
      this.selectedMapIndex = (this.selectedMapIndex + 1) % ALL_MAPS.length;
      SoundManager.play('menuSelect');
    }
  }

  private lastCountdownSecond: number = -1;

  private updateCountdown(deltaTime: number): void {
    const prevTime = this.countdownTime;
    this.countdownTime -= deltaTime;

    // Play countdown beep on each second
    const currentSecond = Math.ceil(this.countdownTime);
    if (currentSecond !== this.lastCountdownSecond && currentSecond > 0) {
      this.lastCountdownSecond = currentSecond;
      SoundManager.play('countdown');
    }

    if (this.countdownTime <= 0 && prevTime > 0) {
      this.phase = GamePhase.PLAYING;
      SoundManager.play('gameStart');
      SoundManager.startMusic();
    }
  }

  private updatePlaying(deltaTime: number): void {
    // Check for pause
    if (this.inputManager.isKeyJustPressed('Escape')) {
      this.phase = GamePhase.PAUSED;
      SoundManager.stopMusic();
      return;
    }

    // Update round timer
    this.roundTime -= deltaTime;
    if (this.roundTime <= 0) {
      this.endRound();
      return;
    }

    // Save previous positions for interpolation
    for (const player of this.players) {
      player.savePreviousPosition();
    }

    // Update AI controllers and get AI decisions
    const currentTime = performance.now() / 1000;
    const aiDecisions: Map<number, { direction: Direction | null; placeBomb: boolean }> = new Map();

    for (const [playerIndex, aiController] of this.aiControllers) {
      const player = this.players[playerIndex];
      if (!player || !player.isPlayerAlive()) continue;

      const decision = aiController.update(
        deltaTime,
        currentTime,
        this.blocks,
        this.bombs,
        this.explosions,
        this.powerUps,
        this.players
      );
      aiDecisions.set(playerIndex, decision);
    }

    // Update player input and movement
    for (const player of this.players) {
      if (!player.isPlayerAlive()) continue;

      let direction: Direction | null = null;
      let shouldPlaceBomb = false;

      // Check if this player is AI-controlled
      if (this.aiPlayers.has(player.playerIndex)) {
        const aiDecision = aiDecisions.get(player.playerIndex);
        if (aiDecision) {
          direction = aiDecision.direction;
          shouldPlaceBomb = aiDecision.placeBomb;
        }
      } else {
        // Human player input
        direction = this.inputManager.getMovementDirection(player.playerIndex);
        shouldPlaceBomb = this.inputManager.isBombPressed(player.playerIndex);

        // Check for punch input
        if (this.inputManager.isSpecialPressed(player.playerIndex)) {
          this.tryPunchBomb(player);
        }

      }

      // Apply bomb placement BEFORE movement to ensure consistency with AI grid simulation
      if (shouldPlaceBomb) {
        this.tryPlaceBomb(player);
      }

      // Reverse direction if player has reversed controls debuff
      if (direction && player.hasReversedControls()) {
        direction = this.reverseDirection(direction);
      }

      // Apply movement
      if (direction) {
        this.movePlayer(player, direction, deltaTime);
      } else {
        player.stopMoving();
      }

      // Check power-up collection
      this.checkPowerUpCollection(player);
    }

    // Process pending power-ups (from block destruction)
    this.processPendingPowerUps();

    // Update entities
    for (const player of this.players) {
      player.update(deltaTime);
    }

    for (const bomb of this.bombs) {
      bomb.update(deltaTime);
    }

    // Update sliding bombs
    for (const bomb of this.bombs) {
      if (bomb.isSliding && bomb.slideDirection) {
        this.updateSlidingBomb(bomb, deltaTime);
      }
    }

    for (const block of this.blocks) {
      block.update(deltaTime);
    }

    for (const explosion of this.explosions) {
      explosion.update(deltaTime);
    }

    // Check for continuous explosion damage (players walking into flames)
    this.checkExplosionCollisions();

    for (const powerUp of this.powerUps) {
      powerUp.update(deltaTime);
    }

    for (const text of this.floatingTexts) {
      text.update(deltaTime);
    }
    this.floatingTexts = this.floatingTexts.filter(t => t.active);

    // Update score manager
    this.scoreManager.update(deltaTime);

    // Clean up inactive entities
    this.bombs = this.bombs.filter(b => b.isActive);
    this.blocks = this.blocks.filter(b => b.isActive);
    this.explosions = this.explosions.filter(e => e.isActive);
    this.powerUps = this.powerUps.filter(p => p.isActive);

    // Update renderer (particles, camera shake)
    this.renderer.update(deltaTime);

    // Check win condition
    this.checkWinCondition();
  }

  private updatePaused(): void {
    if (this.inputManager.isKeyJustPressed('Escape')) {
      this.phase = GamePhase.PLAYING;
      SoundManager.startMusic();
    }
  }

  private updateGameOver(): void {
    if (this.inputManager.isKeyJustPressed('Space')) {
      this.startNewGame();
    }
    if (this.inputManager.isKeyJustPressed('Escape')) {
      this.phase = GamePhase.MAIN_MENU;
      SoundManager.startMenuMusic();
    }
  }

  private render(interpolation: number): void {
    switch (this.phase) {
      case GamePhase.MAIN_MENU:
        this.renderer.renderMainMenu(this.playerCount, this.isSinglePlayer, this.aiDifficulty, ALL_MAPS[this.selectedMapIndex]);
        break;

      case GamePhase.COUNTDOWN:
        this.renderGameState(interpolation);
        this.renderer.renderCountdown(Math.ceil(this.countdownTime));
        break;

      case GamePhase.PLAYING:
        this.renderGameState(interpolation);
        this.renderer.renderUI(this.players, this.roundTime, this.scoreManager);
        break;

      case GamePhase.PAUSED:
        this.renderGameState(interpolation);
        this.renderer.renderUI(this.players, this.roundTime);
        this.renderer.renderPaused();
        break;

      case GamePhase.GAME_OVER:
        this.renderGameState(interpolation);
        this.renderer.renderGameOver(this.winner, this.isSinglePlayer);
        break;
    }
  }

  private renderGameState(interpolation: number): void {
    const state: RenderState = {
      players: this.players,
      bombs: this.bombs,
      blocks: this.blocks,
      explosions: this.explosions,
      powerUps: this.powerUps,
      floatingTexts: this.floatingTexts,
      scores: this.scoreManager
    };
    this.renderer.render(state, interpolation);
  }

  private startNewGame(): void {
    // Stop menu music when starting the game
    SoundManager.stopMenuMusic();

    this.initializeGrid();
    this.loadMap(ALL_MAPS[this.selectedMapIndex]);
    this.spawnPlayers();
    this.bombs = [];
    this.explosions = [];
    this.powerUps = [];
    this.pendingPowerUps = [];
    this.floatingTexts = [];
    this.scoreManager = new ScoreManager(4);
    this.roundTime = ROUND_TIME;
    this.countdownTime = COUNTDOWN_TIME;
    this.winner = null;
    this.phase = GamePhase.COUNTDOWN;
  }

  private loadMap(mapData: MapData): void {
    this.blocks = [];

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y][x];

        if (tile === TileType.WALL) {
          const block = new Block(x, y, false);
          this.blocks.push(block);
          this.grid[y][x] = block;
        } else if (tile === TileType.SOFT_BLOCK) {
          const block = new Block(x, y, true);
          this.blocks.push(block);
          this.grid[y][x] = block;
        }
      }
    }
  }

  private spawnPlayers(): void {
    this.players = [];
    this.aiControllers.clear();
    this.aiPlayers.clear();

    const spawnPositions = [
      { x: 1, y: 1 },
      { x: GRID_WIDTH - 2, y: 1 },
      { x: 1, y: GRID_HEIGHT - 2 },
      { x: GRID_WIDTH - 2, y: GRID_HEIGHT - 2 }
    ];

    for (let i = 0; i < this.playerCount; i++) {
      const spawn = spawnPositions[i];
      const player = new Player(spawn.x, spawn.y, i);
      this.players.push(player);

      // In single player mode, all players except the first one are AI
      if (this.isSinglePlayer && i > 0) {
        this.aiPlayers.add(i);
        const aiController = new AIController(player, this.aiDifficulty);
        this.aiControllers.set(i, aiController);
      }
    }
  }

  private movePlayer(player: Player, direction: Direction, deltaTime: number): void {
    const startPixelX = player.position.pixelX;
    const startPixelY = player.position.pixelY;

    const speed = player.getEffectiveSpeed();
    const moveAmount = speed * TILE_SIZE * deltaTime;

    let newPixelX = player.position.pixelX;
    let newPixelY = player.position.pixelY;

    // Check if player is boxed in on the movement axis
    const gridX = player.position.gridX;
    const gridY = player.position.gridY;

    const isBlockedLeft = this.isGridBlocked(gridX - 1, gridY);
    const isBlockedRight = this.isGridBlocked(gridX + 1, gridY);
    const isBlockedUp = this.isGridBlocked(gridX, gridY - 1);
    const isBlockedDown = this.isGridBlocked(gridX, gridY + 1);

    // If boxed in horizontally, snap to grid center X
    if (isBlockedLeft && isBlockedRight) {
      newPixelX = gridX * TILE_SIZE;
    }
    // If boxed in vertically, snap to grid center Y
    if (isBlockedUp && isBlockedDown) {
      newPixelY = gridY * TILE_SIZE;
    }

    switch (direction) {
      case Direction.UP:
        if (!(isBlockedUp && isBlockedDown)) {
          newPixelY -= moveAmount;
        }
        break;
      case Direction.DOWN:
        if (!(isBlockedUp && isBlockedDown)) {
          newPixelY += moveAmount;
        }
        break;
      case Direction.LEFT:
        if (!(isBlockedLeft && isBlockedRight)) {
          newPixelX -= moveAmount;
        }
        break;
      case Direction.RIGHT:
        if (!(isBlockedLeft && isBlockedRight)) {
          newPixelX += moveAmount;
        }
        break;
    }

    // Collision detection with grid alignment
    const hitboxPadding = 4;
    const playerLeft = newPixelX + hitboxPadding;
    const playerRight = newPixelX + TILE_SIZE - hitboxPadding;
    const playerTop = newPixelY + hitboxPadding;
    const playerBottom = newPixelY + TILE_SIZE - hitboxPadding;

    // Check all corners
    const corners = [
      { x: playerLeft, y: playerTop },
      { x: playerRight, y: playerTop },
      { x: playerLeft, y: playerBottom },
      { x: playerRight, y: playerBottom }
    ];

    let canMove = true;
    for (const corner of corners) {
      const gridX = Math.floor(corner.x / TILE_SIZE);
      const gridY = Math.floor(corner.y / TILE_SIZE);

      if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
        canMove = false;
        break;
      }

      const entity = this.grid[gridY][gridX];
      if (entity instanceof Block) {
        canMove = false;
        break;
      }

      // Check if there's a bomb at this position
      if (entity instanceof Bomb) {
        // If player has KICK ability and bomb is not sliding, kick it
        if (player.hasAbility('kick') && !entity.isSliding) {
          // Kick logic remains...
          // ...
          entity.kick(direction);
          SoundManager.play('bombKick');
          continue;
        }

        // Logic to allow moving OFF a bomb
        // If we are currently ON the bomb, we should still be able to move
        const bombGridX = entity.position.gridX;
        const bombGridY = entity.position.gridY;
        // If player is substantially "inside" the bomb, ignore collision to let them leave
        // Standard Grid check:
        const currentGridX = Math.round(player.position.pixelX / TILE_SIZE);
        const currentGridY = Math.round(player.position.pixelY / TILE_SIZE);

        if (currentGridX === bombGridX && currentGridY === bombGridY) {
          // We are currently on this bomb, ignore collision to let us leave
          continue;
        }

        // If we get here, the player is NOT on the bomb tile
        // Mark that the owner has left (for their own bombs)
        if (entity.owner === player && !entity.ownerHasLeft) {
          entity.ownerHasLeft = true;
        }

        // Calculate positions for direction check
        const bombCenterX = bombGridX * TILE_SIZE + TILE_SIZE / 2;
        const bombCenterY = bombGridY * TILE_SIZE + TILE_SIZE / 2;
        const playerCenterX = player.position.pixelX + TILE_SIZE / 2;
        const playerCenterY = player.position.pixelY + TILE_SIZE / 2;

        // Check if player is moving TOWARDS the bomb (trying to enter)
        // vs moving AWAY from the bomb (trying to exit)
        const movingTowardsBomb = (
          (direction === Direction.LEFT && playerCenterX > bombCenterX) ||
          (direction === Direction.RIGHT && playerCenterX < bombCenterX) ||
          (direction === Direction.UP && playerCenterY > bombCenterY) ||
          (direction === Direction.DOWN && playerCenterY < bombCenterY)
        );

        if (movingTowardsBomb) {
          // Check if player can teleport through the bomb
          if (player.canTeleport()) {
            const targetTile = this.getOppositeTileFromBomb(entity, direction);
            if (targetTile && this.isTileClearForTeleport(targetTile.gridX, targetTile.gridY)) {
              player.useTeleport(targetTile.gridX, targetTile.gridY);
              continue; // Skip pushback, let teleport happen
            }
          }

          // Player is trying to ENTER the bomb - block and apply juicy pushback
          canMove = false;
          const pushDirX = playerCenterX - bombCenterX;
          const pushDirY = playerCenterY - bombCenterY;
          player.applyPushback(pushDirX, pushDirY, 180);
          break;
        } else if (entity.owner === player) {
          // Player is moving AWAY from their own bomb - let them exit
          continue;
        }
        // Moving away from another player's bomb - just block without pushback
        canMove = false;
        break;
      }
    }

    if (canMove) {
      player.position.pixelX = newPixelX;
      player.position.pixelY = newPixelY;
      player.position.gridX = Math.round(newPixelX / TILE_SIZE);
      player.position.gridY = Math.round(newPixelY / TILE_SIZE);
    } else {
      // Try corner sliding (for all players)
      this.tryCornerSlide(player, direction, deltaTime);

      // For AI players, also try more aggressive grid alignment
      if (this.aiPlayers.has(player.playerIndex)) {
        this.tryAIGridAlignment(player, direction, deltaTime);
      }
    }

    const moved = Math.abs(player.position.pixelX - startPixelX) > 0.01 ||
      Math.abs(player.position.pixelY - startPixelY) > 0.01;

    if (moved) {
      player.move(direction, 0); // Updates direction and sets isMoving = true
    } else {
      player.stopMoving(); // Ensure animation stops if blocked

      // Emit wall bump stars occasionally when blocked
      if (Math.random() < 0.15) {
        const bumpX = player.position.pixelX + TILE_SIZE / 2;
        const bumpY = player.position.pixelY + TILE_SIZE / 2;

        // Offset bump position based on direction
        switch (direction) {
          case Direction.UP: this.particleSystem.emitPreset('wallBump', bumpX, bumpY - TILE_SIZE / 2); break;
          case Direction.DOWN: this.particleSystem.emitPreset('wallBump', bumpX, bumpY + TILE_SIZE / 2); break;
          case Direction.LEFT: this.particleSystem.emitPreset('wallBump', bumpX - TILE_SIZE / 2, bumpY); break;
          case Direction.RIGHT: this.particleSystem.emitPreset('wallBump', bumpX + TILE_SIZE / 2, bumpY); break;
        }
      }
      // We still want to update direction if they are pressing the key?
      // Usually yes, even if blocked, you face the wall.
      // But player.move sets isMoving=true. 
      // Let's manually set direction without setting isMoving=true
      // We can add a method setFacing(direction) or just patch player.move
      // Since we can't easily change Player.ts signature right now safely without checking usage...
      // Let's assume player.direction is public or has a setter.
      // It's private in Player.ts but move() sets it.
      // Actually, let's just use player.move() but then immediately stopMoving() if blocked?
      // That might cause a 1-frame jitter.

      // Better: Check Player.ts. direction is private.
      // But move() is the only way to set it?
      // Let's look at Player.ts again. move() sets direction and isMoving=true.

      // Workaround: Call move() then stopMoving().
      // Since update() uses isMoving, if we set it to false immediately, it should be fine for the next frame.
      player.move(direction, 0);
      player.stopMoving();
    }
  }

  private tryCornerSlide(player: Player, direction: Direction, deltaTime: number): void {
    const speed = player.getEffectiveSpeed();
    const slideAmount = speed * TILE_SIZE * deltaTime * 0.5;

    const offsetX = player.position.pixelX % TILE_SIZE;
    const offsetY = player.position.pixelY % TILE_SIZE;
    const threshold = TILE_SIZE * 0.4;
    const hitboxPadding = 4;

    if (direction === Direction.UP || direction === Direction.DOWN) {
      // Try sliding left or right
      if (offsetX < threshold) {
        // Check if sliding left is blocked
        const testX = player.position.pixelX - slideAmount;
        if (!this.isPositionBlocked(testX, player.position.pixelY, hitboxPadding)) {
          player.position.pixelX = testX;
        }
      } else if (offsetX > TILE_SIZE - threshold) {
        // Check if sliding right is blocked
        const testX = player.position.pixelX + slideAmount;
        if (!this.isPositionBlocked(testX, player.position.pixelY, hitboxPadding)) {
          player.position.pixelX = testX;
        }
      }
    } else {
      // Try sliding up or down
      if (offsetY < threshold) {
        // Check if sliding up is blocked
        const testY = player.position.pixelY - slideAmount;
        if (!this.isPositionBlocked(player.position.pixelX, testY, hitboxPadding)) {
          player.position.pixelY = testY;
        }
      } else if (offsetY > TILE_SIZE - threshold) {
        // Check if sliding down is blocked
        const testY = player.position.pixelY + slideAmount;
        if (!this.isPositionBlocked(player.position.pixelX, testY, hitboxPadding)) {
          player.position.pixelY = testY;
        }
      }
    }
  }

  private isGridBlocked(gridX: number, gridY: number): boolean {
    if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
      return true;
    }
    const entity = this.grid[gridY][gridX];
    return entity instanceof Block;
  }

  private isPositionBlocked(pixelX: number, pixelY: number, hitboxPadding: number): boolean {
    const playerLeft = pixelX + hitboxPadding;
    const playerRight = pixelX + TILE_SIZE - hitboxPadding;
    const playerTop = pixelY + hitboxPadding;
    const playerBottom = pixelY + TILE_SIZE - hitboxPadding;

    const corners = [
      { x: playerLeft, y: playerTop },
      { x: playerRight, y: playerTop },
      { x: playerLeft, y: playerBottom },
      { x: playerRight, y: playerBottom }
    ];

    for (const corner of corners) {
      const gridX = Math.floor(corner.x / TILE_SIZE);
      const gridY = Math.floor(corner.y / TILE_SIZE);

      if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
        return true;
      }

      const entity = this.grid[gridY][gridX];
      if (entity instanceof Block) {
        return true;
      }
    }

    return false;
  }

  /**
   * AI-specific grid alignment helper. More aggressive than tryCornerSlide.
   * Helps AI players align to the grid when movement is blocked, since AI logic
   * operates on grid coordinates but player movement is pixel-based.
   */
  private tryAIGridAlignment(player: Player, direction: Direction, deltaTime: number): void {
    const speed = player.getEffectiveSpeed();
    const alignmentSpeed = speed * TILE_SIZE * deltaTime * 1.2; // Faster than corner slide

    const currentPixelX = player.position.pixelX;
    const currentPixelY = player.position.pixelY;

    // Calculate the aligned grid position (center of grid cell)
    const targetGridX = Math.round(currentPixelX / TILE_SIZE);
    const targetGridY = Math.round(currentPixelY / TILE_SIZE);
    const alignedPixelX = targetGridX * TILE_SIZE;
    const alignedPixelY = targetGridY * TILE_SIZE;

    // When moving horizontally (LEFT/RIGHT), align vertically
    if (direction === Direction.LEFT || direction === Direction.RIGHT) {
      const verticalOffset = Math.abs(currentPixelY - alignedPixelY);

      // If misaligned vertically, gradually align toward grid center
      if (verticalOffset > 0.5) {
        if (currentPixelY < alignedPixelY) {
          player.position.pixelY = Math.min(alignedPixelY, currentPixelY + alignmentSpeed);
        } else {
          player.position.pixelY = Math.max(alignedPixelY, currentPixelY - alignmentSpeed);
        }
        // Update grid position after alignment
        player.position.gridY = Math.round(player.position.pixelY / TILE_SIZE);
      }
    }

    // When moving vertically (UP/DOWN), align horizontally
    if (direction === Direction.UP || direction === Direction.DOWN) {
      const horizontalOffset = Math.abs(currentPixelX - alignedPixelX);

      // If misaligned horizontally, gradually align toward grid center
      if (horizontalOffset > 0.5) {
        if (currentPixelX < alignedPixelX) {
          player.position.pixelX = Math.min(alignedPixelX, currentPixelX + alignmentSpeed);
        } else {
          player.position.pixelX = Math.max(alignedPixelX, currentPixelX - alignmentSpeed);
        }
        // Update grid position after alignment
        player.position.gridX = Math.round(player.position.pixelX / TILE_SIZE);
      }
    }
  }

  private updateSlidingBomb(bomb: Bomb, deltaTime: number): void {
    if (!bomb.slideDirection) return;

    const moveAmount = bomb.slideSpeed * TILE_SIZE * deltaTime;
    let newPixelX = bomb.position.pixelX;
    let newPixelY = bomb.position.pixelY;

    // Calculate new position based on slide direction
    switch (bomb.slideDirection) {
      case Direction.UP:
        newPixelY -= moveAmount;
        break;
      case Direction.DOWN:
        newPixelY += moveAmount;
        break;
      case Direction.LEFT:
        newPixelX -= moveAmount;
        break;
      case Direction.RIGHT:
        newPixelX += moveAmount;
        break;
    }

    // Calculate target grid position
    const newGridX = Math.round(newPixelX / TILE_SIZE);
    const newGridY = Math.round(newPixelY / TILE_SIZE);

    // Check if bomb should stop sliding
    let shouldStop = false;

    // Check bounds
    if (newGridX < 0 || newGridX >= GRID_WIDTH || newGridY < 0 || newGridY >= GRID_HEIGHT) {
      shouldStop = true;
    }

    // Check for obstacles in target position
    if (!shouldStop && this.grid[newGridY] && this.grid[newGridY][newGridX]) {
      const entity = this.grid[newGridY][newGridX];
      if (entity instanceof Block || entity instanceof Bomb) {
        shouldStop = true;
      }
    }

    if (shouldStop) {
      bomb.stopSliding();
      // Update grid with stopped bomb
      const oldGridX = bomb.position.gridX;
      const oldGridY = bomb.position.gridY;
      if (this.grid[oldGridY][oldGridX] === bomb) {
        this.grid[oldGridY][oldGridX] = null;
      }
      this.grid[bomb.position.gridY][bomb.position.gridX] = bomb;
    } else {
      // Update bomb position
      const oldGridX = bomb.position.gridX;
      const oldGridY = bomb.position.gridY;

      bomb.position.pixelX = newPixelX;
      bomb.position.pixelY = newPixelY;
      bomb.position.gridX = newGridX;
      bomb.position.gridY = newGridY;

      // Update grid if position changed
      if (oldGridX !== newGridX || oldGridY !== newGridY) {
        if (this.grid[oldGridY][oldGridX] === bomb) {
          this.grid[oldGridY][oldGridX] = null;
        }
        this.grid[newGridY][newGridX] = bomb;
      }

      // Emit kick trail particles
      this.renderer.getParticleSystem().emitPreset(
        'kickTrail',
        bomb.position.pixelX + TILE_SIZE / 2,
        bomb.position.pixelY + TILE_SIZE / 2
      );
    }
  }

  private reverseDirection(dir: Direction): Direction {
    switch (dir) {
      case Direction.UP: return Direction.DOWN;
      case Direction.DOWN: return Direction.UP;
      case Direction.LEFT: return Direction.RIGHT;
      case Direction.RIGHT: return Direction.LEFT;
    }
  }

  private tryPlaceBomb(player: Player): void {
    if (!player.canPlaceBomb()) return;

    const gridX = player.position.gridX;
    const gridY = player.position.gridY;

    // Check if there's already a bomb at this position
    if (this.grid[gridY][gridX] instanceof Bomb) return;

    const bomb = new Bomb(gridX, gridY, player);
    this.bombs.push(bomb);
    this.grid[gridY][gridX] = bomb;
    player.activeBombs++;

    SoundManager.play('bombPlace');

    // Visual effects for bomb placement
    const centerX = gridX * TILE_SIZE + TILE_SIZE / 2;
    const centerY = gridY * TILE_SIZE + TILE_SIZE / 2;
    this.particleSystem.emitPreset('impactBurst', centerX, centerY);
    this.camera.shakePreset('subtle');
  }

  private onDiarrheaBomb(data: { player: Player }): void {
    const player = data.player;
    if (player.isPlayerAlive() && player.canPlaceBomb()) {
      SoundManager.play('diarrheaBomb');
      this.tryPlaceBomb(player);
    }
  }

  private tryPunchBomb(player: Player): void {
    if (!player.hasAbility('punch')) return;

    const direction = player.getDirection();

    // Check adjacent tile in facing direction for a bomb
    let checkX = player.position.gridX;
    let checkY = player.position.gridY;

    switch (direction) {
      case Direction.UP:
        checkY -= 1;
        break;
      case Direction.DOWN:
        checkY += 1;
        break;
      case Direction.LEFT:
        checkX -= 1;
        break;
      case Direction.RIGHT:
        checkX += 1;
        break;
    }

    // Check if there's a bomb at the adjacent position
    if (checkX < 0 || checkX >= GRID_WIDTH || checkY < 0 || checkY >= GRID_HEIGHT) return;

    const entity = this.grid[checkY][checkX];
    if (!(entity instanceof Bomb) || entity.isPunched || entity.isSliding) return;

    // Calculate target position (4 tiles away)
    const punchDistance = 4;
    let targetX = checkX;
    let targetY = checkY;

    switch (direction) {
      case Direction.UP:
        targetY = checkY - punchDistance;
        break;
      case Direction.DOWN:
        targetY = checkY + punchDistance;
        break;
      case Direction.LEFT:
        targetX = checkX - punchDistance;
        break;
      case Direction.RIGHT:
        targetX = checkX + punchDistance;
        break;
    }

    // Clamp to grid bounds
    targetX = Math.max(0, Math.min(GRID_WIDTH - 1, targetX));
    targetY = Math.max(0, Math.min(GRID_HEIGHT - 1, targetY));

    // Find first obstacle in path and stop before it
    let dx = 0, dy = 0;
    switch (direction) {
      case Direction.UP: dy = -1; break;
      case Direction.DOWN: dy = 1; break;
      case Direction.LEFT: dx = -1; break;
      case Direction.RIGHT: dx = 1; break;
    }

    let finalX = checkX;
    let finalY = checkY;

    for (let i = 1; i <= punchDistance; i++) {
      const testX = checkX + dx * i;
      const testY = checkY + dy * i;

      if (testX < 0 || testX >= GRID_WIDTH || testY < 0 || testY >= GRID_HEIGHT) {
        break;
      }

      const obstacle = this.grid[testY][testX];
      if (obstacle instanceof Block) {
        break;
      }

      finalX = testX;
      finalY = testY;
    }

    // Clear bomb from old grid position
    this.grid[checkY][checkX] = null;

    // Punch the bomb
    entity.punch(finalX, finalY);

    // Trigger player punch animation
    player.startPunchAnimation();

    // Play punch sound
    SoundManager.play('bombPunch');

    // Camera shake
    this.renderer.getCamera().shake({ duration: 0.15, intensity: 3, frequency: 25 });
  }

  private onBombPlaced(_data: { gridX: number; gridY: number; owner: Player }): void {
    // Event handling is done in tryPlaceBomb
  }

  private getOppositeTileFromBomb(bomb: Bomb, direction: Direction): { gridX: number; gridY: number } {
    const bombGridX = bomb.position.gridX;
    const bombGridY = bomb.position.gridY;

    // Calculate the tile on the opposite side of the bomb from the player
    let targetX = bombGridX;
    let targetY = bombGridY;

    switch (direction) {
      case Direction.UP:
        targetY = bombGridY - 1;
        break;
      case Direction.DOWN:
        targetY = bombGridY + 1;
        break;
      case Direction.LEFT:
        targetX = bombGridX - 1;
        break;
      case Direction.RIGHT:
        targetX = bombGridX + 1;
        break;
    }

    return { gridX: targetX, gridY: targetY };
  }

  private isTileClearForTeleport(gridX: number, gridY: number): boolean {
    // Bounds check
    if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
      return false;
    }

    // Check grid for obstacles
    const entity = this.grid[gridY][gridX];

    // Block (wall or destructible) blocks teleport
    if (entity instanceof Block) {
      return false;
    }

    // Another bomb blocks teleport
    if (entity instanceof Bomb) {
      return false;
    }

    // Tile is clear
    return true;
  }

  private onTeleportStart(data: { player: Player }): void {
    const player = data.player;
    this.renderer.getParticleSystem().emitPreset(
      'teleportOut',
      player.position.pixelX + TILE_SIZE / 2,
      player.position.pixelY + TILE_SIZE / 2
    );
    SoundManager.play('teleport');
  }

  private onTeleportArrived(data: { player: Player }): void {
    const player = data.player;
    this.renderer.getParticleSystem().emitPreset(
      'teleportIn',
      player.position.pixelX + TILE_SIZE / 2,
      player.position.pixelY + TILE_SIZE / 2
    );
  }

  private onPlayerStep(data: { player: Player }): void {
    const player = data.player;
    this.renderer.getParticleSystem().emitPreset(
      'footstep',
      player.position.pixelX + TILE_SIZE / 2,
      player.position.pixelY + TILE_SIZE - 4
    );
    SoundManager.play('footstep');
  }

  private onPlayerPushback(_data: { player: Player }): void {
    SoundManager.play('playerPushback');
  }

  private onPlayerTrail(data: { player: Player }): void {
    const player = data.player;
    const playerColors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];
    this.renderer.getParticleSystem().emitPreset(
      'speedTrail',
      player.position.pixelX + TILE_SIZE / 2,
      player.position.pixelY + TILE_SIZE / 2,
      [playerColors[player.playerIndex]]
    );
  }

  private onPlayerDustCloud(data: { player: Player; direction: Direction }): void {
    const player = data.player;
    // Emit dust behind the player based on direction
    let offsetX = TILE_SIZE / 2;
    let offsetY = TILE_SIZE / 2;

    switch (data.direction) {
      case Direction.UP: offsetY = TILE_SIZE; break;
      case Direction.DOWN: offsetY = 0; break;
      case Direction.LEFT: offsetX = TILE_SIZE; break;
      case Direction.RIGHT: offsetX = 0; break;
    }

    this.renderer.getParticleSystem().emitPreset(
      'dustCloud',
      player.position.pixelX + offsetX,
      player.position.pixelY + offsetY
    );
  }

  private onPlayerSpeedLines(data: { player: Player; direction: Direction }): void {
    const player = data.player;
    // Emit speed lines behind the player
    let offsetX = TILE_SIZE / 2;
    let offsetY = TILE_SIZE / 2;

    switch (data.direction) {
      case Direction.UP: offsetY = TILE_SIZE * 0.75; break;
      case Direction.DOWN: offsetY = TILE_SIZE * 0.25; break;
      case Direction.LEFT: offsetX = TILE_SIZE * 0.75; break;
      case Direction.RIGHT: offsetX = TILE_SIZE * 0.25; break;
    }

    this.renderer.getParticleSystem().emitPreset(
      'speedLines',
      player.position.pixelX + offsetX,
      player.position.pixelY + offsetY
    );
  }

  private onBombDangerSparks(data: { bomb: Bomb }): void {
    const bomb = data.bomb;
    const centerX = bomb.position.pixelX + TILE_SIZE / 2;
    const centerY = bomb.position.pixelY + TILE_SIZE / 2;
    this.particleSystem.emitPreset('dangerSparks', centerX, centerY);
    SoundManager.play('bombDangerTick');
  }

  private onShieldConsumed(data: { player: Player }): void {
    const player = data.player;
    this.renderer.getParticleSystem().emitPreset(
      'shieldBreak',
      player.position.pixelX + TILE_SIZE / 2,
      player.position.pixelY + TILE_SIZE / 2
    );
    SoundManager.play('shieldBreak'); // Assume sound exists or fallback
    this.renderer.getCamera().shake({ duration: 0.1, intensity: 2, frequency: 20 });
  }

  private onBombLanded(data: { bomb: Bomb; gridX: number; gridY: number }): void {
    const { bomb, gridX, gridY } = data;

    // Update grid with bomb at new position
    this.grid[gridY][gridX] = bomb;

    // Impact particles
    this.renderer.getParticleSystem().emitPreset(
      'debris',
      gridX * TILE_SIZE + TILE_SIZE / 2,
      gridY * TILE_SIZE + TILE_SIZE / 2
    );

    // Play landing sound
    SoundManager.play('bombLand');

    // Camera shake
    this.renderer.getCamera().shake({ duration: 0.15, intensity: 3, frequency: 25 });
  }

  private checkExplosionCollisions(): void {
    // Check if any alive players are currently on active explosion tiles
    for (const explosion of this.explosions) {
      if (!explosion.isActive || !explosion.canKill()) continue;

      for (const tile of explosion.tiles) {
        for (const player of this.players) {
          if (!player.isPlayerAlive()) continue;

          // Check if player is on this explosion tile
          if (player.position.gridX === tile.gridX && player.position.gridY === tile.gridY) {
            player.die();
          }
        }
      }
    }
  }

  private onBombExplode(data: { bomb: Bomb; gridX: number; gridY: number; range: number; type: BombType }): void {
    const { bomb, gridX, gridY, range, type } = data;

    // Safety check: ignore explosions from bombs that are no longer tracked (e.g. from previous game)
    if (!this.bombs.includes(bomb)) {
      console.log(`[DEBUG] IGNORED ghost bomb explosion at (${gridX}, ${gridY})`);
      return;
    }
    console.log(`[DEBUG] Bomb exploded at (${gridX}, ${gridY}) owned by Player ${bomb.owner.playerIndex}`);

    // Clear bomb from grid
    if (this.grid[gridY][gridX] === bomb) {
      this.grid[gridY][gridX] = null;
    }

    // Calculate explosion tiles
    const tiles: ExplosionTile[] = [];
    tiles.push({ gridX, gridY, direction: 'center', isEnd: false });

    const directions = [
      { dir: Direction.UP, dx: 0, dy: -1 },
      { dir: Direction.DOWN, dx: 0, dy: 1 },
      { dir: Direction.LEFT, dx: -1, dy: 0 },
      { dir: Direction.RIGHT, dx: 1, dy: 0 }
    ];

    let chainReactionCount = 0;

    for (const { dir, dx, dy } of directions) {
      for (let i = 1; i <= range; i++) {
        const tx = gridX + dx * i;
        const ty = gridY + dy * i;

        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) break;

        const entity = this.grid[ty][tx];

        if (entity instanceof Block) {
          if (entity.isDestructible) {
            entity.startDestroy();
            // Award points
            this.scoreManager.addPoints(
              bomb.owner.playerIndex,
              10,
              'block',
              { x: tx * TILE_SIZE, y: ty * TILE_SIZE }
            );

            this.grid[ty][tx] = null;
            tiles.push({ gridX: tx, gridY: ty, direction: dir, isEnd: true });
            if (type !== BombType.PIERCING) break;
          } else {
            break; // Hit indestructible wall
          }
        } else if (entity instanceof Bomb) {
          // Chain reaction
          entity.triggerChainReaction();
          chainReactionCount++;
          tiles.push({ gridX: tx, gridY: ty, direction: dir, isEnd: false });
        } else {
          tiles.push({ gridX: tx, gridY: ty, direction: dir, isEnd: i === range });
        }
      }
    }

    // Create explosion
    const explosion = new Explosion(tiles, type);
    this.explosions.push(explosion);

    // Add particle effects and screen shake
    const centerX = gridX * TILE_SIZE + TILE_SIZE / 2;
    const centerY = gridY * TILE_SIZE + TILE_SIZE / 2;
    const particles = this.renderer.getParticleSystem();
    const camera = this.renderer.getCamera();

    // Visual Juice: Flash and Shockwave
    particles.emitPreset('flash', centerX, centerY);
    // Shockwave only for non-ice bombs (ice is more subtle?) or all bombs
    particles.emitPreset('shockwave', centerX, centerY);

    // Choose particle preset based on bomb type
    if (type === BombType.ICE) {
      particles.emitPreset('iceExplosion', centerX, centerY);
    } else if (type === BombType.FIRE) {
      particles.emitPreset('fireExplosion', centerX, centerY);
    } else {
      particles.emitPreset('explosion', centerX, centerY);
      particles.emitPreset('explosionSparks', centerX, centerY);
    }

    // Add smoke at the center
    particles.emitPreset('smoke', centerX, centerY);

    // NEW: Add lingering embers that float upward
    if (type !== BombType.ICE) { // No embers for ice bombs
      particles.emitPreset('embers', centerX, centerY);
    }

    // NEW: Add expanding smoke clouds
    particles.emitPreset('expandingSmoke', centerX, centerY);

    // Add particles at explosion endpoints for extra visual impact
    for (const tile of tiles) {
      if (tile.isEnd) {
        const tileX = tile.gridX * TILE_SIZE + TILE_SIZE / 2;
        const tileY = tile.gridY * TILE_SIZE + TILE_SIZE / 2;
        particles.emit({
          x: tileX,
          y: tileY,
          count: 8,
          spread: 4,
          speed: { min: 50, max: 150 },
          lifetime: { min: 0.2, max: 0.4 },
          size: { min: 2, max: 5 },
          colors: type === BombType.ICE ? ['#00ffff', '#ffffff'] : ['#ff6600', '#ffcc00'],
          gravity: 100,
          shape: 'circle'
        });
      }
    }

    // Calculate radial direction for more impactful shake ( emanates from explosion)
    const screenCenterX = CANVAS_WIDTH / 2;
    const screenCenterY = CANVAS_HEIGHT / 2;
    const dirX = centerX - screenCenterX;
    const dirY = centerY - screenCenterY;
    const shakeDir = (Math.abs(dirX) > 5 || Math.abs(dirY) > 5) ? { x: dirX, y: dirY } : undefined;

    // Screen shake - bigger shake for chain reactions and larger explosions
    if (chainReactionCount > 0) {
      camera.shake({ ...Camera.PRESETS.chainReaction, direction: shakeDir });
      SoundManager.play('explosionBig');
      this.renderer.freeze(0.12); // Hit stop for chain reactions
    } else if (range >= 4) {
      camera.shake({ ...Camera.PRESETS.bigExplosion, direction: shakeDir });
      SoundManager.play('explosionBig');
      this.renderer.freeze(0.08); // Smaller hit stop for big explosions
    } else {
      camera.shake({ ...Camera.PRESETS.bombExplode, direction: shakeDir });
      // Play appropriate explosion sound based on bomb type
      if (type === BombType.ICE) {
        SoundManager.play('explosionIce');
      } else if (type === BombType.FIRE) {
        SoundManager.play('explosionFire');
      } else {
        SoundManager.play('explosion');
      }
    }

    // Check for player hits
    for (const tile of tiles) {
      for (const player of this.players) {
        if (!player.isPlayerAlive()) continue;

        if (player.position.gridX === tile.gridX && player.position.gridY === tile.gridY) {
          // ICE bombs freeze players (if they survive via shield)
          if (type === BombType.ICE) {
            const hadShield = player.hasShield();
            player.die(); // Will consume shield if present
            if (hadShield && player.isPlayerAlive()) {
              // Player survived with shield - apply freeze
              player.applyDebuff('frozen', 3);
              // Add ice particles on frozen player
              const particles = this.renderer.getParticleSystem();
              particles.emitPreset('iceExplosion',
                player.position.pixelX + TILE_SIZE / 2,
                player.position.pixelY + TILE_SIZE / 2
              );
            }
          } else {
            player.die();
          }
        }
      }

      // Destroy power-ups in explosion
      for (const powerUp of this.powerUps) {
        if (powerUp.position.gridX === tile.gridX && powerUp.position.gridY === tile.gridY) {
          powerUp.destroy();
        }
      }
    }
  }

  private onScoreChanged(event: ScoreEvent): void {
    if (event.position) {
      let color = '#ffffff';
      if (event.amount >= 100) color = '#ffff00'; // Gold for big points
      else if (event.amount < 0) color = '#ff0000'; // Red for negative

      this.floatingTexts.push(new FloatingText({
        x: event.position.x + TILE_SIZE / 2,
        y: event.position.y,
        text: event.amount > 0 ? `+${event.amount}` : `${event.amount}`,
        color: color,
        duration: 1.0,
        velocity: { x: 0, y: -40 }
      }));
    }
  }

  private onBlockDestroyed(data: { gridX: number; gridY: number; destroyer?: Player }): void {
    // Add debris particles
    const centerX = data.gridX * TILE_SIZE + TILE_SIZE / 2;
    const centerY = data.gridY * TILE_SIZE + TILE_SIZE / 2;
    const particles = this.renderer.getParticleSystem();
    particles.emitPreset('debris', centerX, centerY);

    // Play block destroy sound
    SoundManager.play('blockDestroy');

    // Maybe spawn a power-up (delayed to avoid being destroyed by the same explosion)
    if (Math.random() < POWERUP_SPAWN_CHANCE) {
      const type = this.getRandomPowerUpType();
      // Add to pending queue to be spawned in a controlled manner next frame
      this.pendingPowerUps.push({
        x: data.gridX,
        y: data.gridY,
        type: type
      });
    }
  }

  private processPendingPowerUps(): void {
    if (this.pendingPowerUps.length === 0) return;

    for (const pending of this.pendingPowerUps) {
      // Final safety check: ensure the tile is still empty (no other explosion just cleared it)
      if (!this.grid[pending.y][pending.x]) {
        const powerUp = new PowerUp(pending.x, pending.y, pending.type);
        this.powerUps.push(powerUp);

        // Emit sky beam effect when power-up appears
        const centerX = pending.x * TILE_SIZE + TILE_SIZE / 2;
        const centerY = pending.y * TILE_SIZE + TILE_SIZE / 2;
        this.particleSystem.emitPreset('skyBeam', centerX, centerY);
      }
    }

    this.pendingPowerUps = [];
  }

  private getRandomPowerUpType(): PowerUpType {
    const weights: [PowerUpType, number][] = [
      [PowerUpType.BOMB_UP, 25],
      [PowerUpType.FIRE_UP, 25],
      [PowerUpType.SPEED_UP, 15],
      [PowerUpType.SHIELD, 8],
      [PowerUpType.KICK, 7],
      [PowerUpType.TELEPORT, 5],
      [PowerUpType.FIRE_BOMB, 5],
      [PowerUpType.ICE_BOMB, 5],
      [PowerUpType.PIERCING_BOMB, 3],
      [PowerUpType.SKULL, 2]
    ];

    const totalWeight = weights.reduce((sum, [, w]) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (const [type, weight] of weights) {
      random -= weight;
      if (random <= 0) return type;
    }

    return PowerUpType.BOMB_UP;
  }

  private checkPowerUpCollection(player: Player): void {
    const particles = this.renderer.getParticleSystem();
    const playerColors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];

    for (const powerUp of this.powerUps) {
      if (!powerUp.isActive) continue;

      if (player.position.gridX === powerUp.position.gridX &&
        player.position.gridY === powerUp.position.gridY) {
        // Add collection particles
        const centerX = powerUp.position.pixelX + TILE_SIZE / 2;
        const centerY = powerUp.position.pixelY + TILE_SIZE / 2;
        particles.emitPreset('powerUpCollect', centerX, centerY, [
          playerColors[player.playerIndex],
          '#ffffff',
          '#ffff00'
        ]);

        // Play sound - different for skull (bad) power-up
        if (powerUp.type === PowerUpType.SKULL) {
          SoundManager.play('powerUpBad');
        } else {
          SoundManager.play('powerUp');
        }

        this.applyPowerUp(player, powerUp);

        // Show floating text
        const powerUpNames: Record<PowerUpType, string> = {
          [PowerUpType.BOMB_UP]: '+1 BOMB',
          [PowerUpType.FIRE_UP]: 'BIGGER FIRE',
          [PowerUpType.SPEED_UP]: 'SPEED UP!',
          [PowerUpType.SHIELD]: 'SHIELD!',
          [PowerUpType.KICK]: 'KICK!',
          [PowerUpType.PUNCH]: 'PUNCH!',
          [PowerUpType.TELEPORT]: 'TELEPORT!',
          [PowerUpType.FIRE_BOMB]: 'FIRE BOMBS!',
          [PowerUpType.ICE_BOMB]: 'ICE BOMBS!',
          [PowerUpType.PIERCING_BOMB]: 'PIERCE BOMBS!',
          [PowerUpType.SKULL]: 'CURSED!'
        };

        particles.emit({
          x: centerX,
          y: centerY - 10,
          count: 1,
          spread: 0,
          speed: { min: 20, max: 30 },
          angle: { min: -Math.PI / 2, max: -Math.PI / 2 },
          lifetime: { min: 1.0, max: 1.5 },
          size: { min: 14, max: 16 },
          colors: ['#ffffff'],
          gravity: -10,
          shape: 'text',
          text: powerUpNames[powerUp.type]
        });

        powerUp.destroy();
      }
    }
  }

  private applyPowerUp(player: Player, powerUp: PowerUp): void {
    switch (powerUp.type) {
      case PowerUpType.BOMB_UP:
        player.addBomb();
        break;
      case PowerUpType.FIRE_UP:
        player.addRange();
        break;
      case PowerUpType.SPEED_UP:
        player.addSpeed();
        break;
      case PowerUpType.SHIELD:
        player.grantShield();
        break;
      case PowerUpType.KICK:
        player.addAbility('kick');
        break;
      case PowerUpType.PUNCH:
        player.addAbility('punch');
        break;
      case PowerUpType.TELEPORT:
        player.addTeleportCharge();
        break;
      case PowerUpType.FIRE_BOMB:
        player.setBombType(BombType.FIRE);
        this.renderer.triggerColorFlash('#ff4400', 0.2);
        break;
      case PowerUpType.ICE_BOMB:
        player.setBombType(BombType.ICE);
        this.renderer.triggerColorFlash('#00ffff', 0.2);
        break;
      case PowerUpType.PIERCING_BOMB:
        player.setBombType(BombType.PIERCING);
        this.renderer.triggerColorFlash('#ff00ff', 0.2);
        break;
      case PowerUpType.SKULL:
        this.applyRandomDebuff(player);
        this.renderer.triggerColorFlash('#00ff00', 0.3); // Toxic green
        this.renderer.getCamera().shake({ duration: 0.5, intensity: 5 });
        break;
    }
  }

  private applyRandomDebuff(player: Player): void {
    const debuffs = ['slow', 'reversed', 'tiny_range', 'diarrhea'];
    const debuff = debuffs[Math.floor(Math.random() * debuffs.length)];
    player.applyDebuff(debuff, 10);
  }

  private onPlayerDied(data: { player: Player }): void {
    const player = data.player;
    const particles = this.renderer.getParticleSystem();
    const camera = this.renderer.getCamera();

    const centerX = player.position.pixelX + TILE_SIZE / 2;
    const centerY = player.position.pixelY + TILE_SIZE / 2;

    // Initial fire/smoke burst when hit
    particles.emitPreset('death', centerX, centerY, [
      '#ff6600',
      '#ff3300',
      '#ffaa00'
    ]);

    // Emit ashes when crumble phase starts (after ~330ms burn phase)
    setTimeout(() => {
      // Multiple waves of ashes falling
      particles.emitPreset('ashes', centerX, centerY);
      setTimeout(() => particles.emitPreset('ashes', centerX, centerY + 5), 100);
      setTimeout(() => particles.emitPreset('ashes', centerX, centerY + 10), 200);
    }, 330);

    // Screen shake for dramatic effect
    camera.shakePreset('playerDeath');
    this.renderer.triggerColorFlash('#ff0000', 0.5); // Red flash
    this.renderer.freeze(0.2); // Significant hit stop on death

    // Play death sound
    SoundManager.play('playerDeath');

    // Zoom in slightly on death
    camera.zoomTo(1.2, 0.2);
    setTimeout(() => camera.zoomTo(1.0, 0.5), 1000);

    this.checkWinCondition();
  }

  private checkWinCondition(): void {
    const alivePlayers = this.players.filter(p => p.isPlayerAlive());

    if (alivePlayers.length <= 1) {
      this.winner = alivePlayers.length === 1 ? alivePlayers[0] : null;

      // Delay before showing game over screen to let death animation play
      const gameOverDelay = 1500; // 1.5 seconds to see death + ashes

      // Stop music immediately for dramatic effect
      SoundManager.stopMusic();

      // Transition to game over after delay
      setTimeout(() => {
        this.phase = GamePhase.GAME_OVER;
        SoundManager.play('gameOver');

        // Victory confetti effect
        if (this.winner) {
          const winnerX = this.winner.position.pixelX + TILE_SIZE / 2;
          const winnerY = this.winner.position.pixelY + TILE_SIZE / 2;

          // Emit confetti at winner's position
          for (let i = 0; i < 3; i++) {
            setTimeout(() => {
              this.particleSystem.emitPreset('confetti', winnerX, winnerY);
            }, i * 150);
          }

          // Emit confetti at random locations for celebration
          for (let i = 0; i < 4; i++) {
            setTimeout(() => {
              const randomX = Math.random() * CANVAS_WIDTH;
              const randomY = Math.random() * CANVAS_HEIGHT * 0.7; // Top 70% of screen
              this.particleSystem.emitPreset('confetti', randomX, randomY);
            }, i * 200);
          }
        }
      }, gameOverDelay);

      // Dramatic slow motion zoom? Or just zoom
      this.renderer.getCamera().zoomTo(1.1, 1.0);
    }
  }

  private endRound(): void {
    const alivePlayers = this.players.filter(p => p.isPlayerAlive());
    this.winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
    this.phase = GamePhase.GAME_OVER;
    SoundManager.stopMusic();
    SoundManager.play('gameOver');
  }
}
