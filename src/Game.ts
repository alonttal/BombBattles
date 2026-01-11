import {
  GamePhase,
  Direction,
  TILE_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  ROUND_TIME,
  COUNTDOWN_TIME,
  POWERUP_SPAWN_CHANCE,
  COLORS
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
import { TileType, MapData, CLASSIC_MAP } from './map/TileTypes';
import { AIController } from './ai/AIController';

export class Game {
  private renderer: Renderer;
  private inputManager: InputManager;
  private gameLoop: GameLoop;

  private phase: GamePhase = GamePhase.MAIN_MENU;
  private players: Player[] = [];
  private bombs: Bomb[] = [];
  private blocks: Block[] = [];
  private explosions: Explosion[] = [];
  private powerUps: PowerUp[] = [];

  private roundTime: number = ROUND_TIME;
  private countdownTime: number = COUNTDOWN_TIME;
  private playerCount: number = 2;
  private winner: Player | null = null;

  // AI support
  private aiControllers: Map<number, AIController> = new Map();
  private aiPlayers: Set<number> = new Set();
  private isSinglePlayer: boolean = false;
  private aiDifficulty: 'easy' | 'medium' | 'hard' = 'medium';

  // Grid for collision detection
  private grid: (Block | Bomb | null)[][] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.inputManager = new InputManager();
    this.gameLoop = new GameLoop(
      this.update.bind(this),
      this.render.bind(this)
    );

    this.setupEventListeners();
    this.initializeGrid();
  }

  private setupEventListeners(): void {
    EventBus.on('bomb-placed', this.onBombPlaced.bind(this));
    EventBus.on('bomb-explode', this.onBombExplode.bind(this));
    EventBus.on('block-destroyed', this.onBlockDestroyed.bind(this));
    EventBus.on('player-died', this.onPlayerDied.bind(this));
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
    const currentTime = performance.now();
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
      }

      // Apply movement
      if (direction) {
        this.movePlayer(player, direction, deltaTime);
      } else {
        player.stopMoving();
      }

      // Apply bomb placement
      if (shouldPlaceBomb) {
        this.tryPlaceBomb(player);
      }

      // Check power-up collection
      this.checkPowerUpCollection(player);
    }

    // Update entities
    for (const player of this.players) {
      player.update(deltaTime);
    }

    for (const bomb of this.bombs) {
      bomb.update(deltaTime);
    }

    for (const block of this.blocks) {
      block.update(deltaTime);
    }

    for (const explosion of this.explosions) {
      explosion.update(deltaTime);
    }

    for (const powerUp of this.powerUps) {
      powerUp.update(deltaTime);
    }

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
    }
  }

  private render(interpolation: number): void {
    switch (this.phase) {
      case GamePhase.MAIN_MENU:
        this.renderer.renderMainMenu(this.playerCount, this.isSinglePlayer, this.aiDifficulty);
        break;

      case GamePhase.COUNTDOWN:
        this.renderGameState(interpolation);
        this.renderer.renderCountdown(Math.ceil(this.countdownTime));
        break;

      case GamePhase.PLAYING:
        this.renderGameState(interpolation);
        this.renderer.renderUI(this.players, this.roundTime);
        break;

      case GamePhase.PAUSED:
        this.renderGameState(interpolation);
        this.renderer.renderUI(this.players, this.roundTime);
        this.renderer.renderPaused();
        break;

      case GamePhase.GAME_OVER:
        this.renderGameState(interpolation);
        this.renderer.renderGameOver(this.winner);
        break;
    }
  }

  private renderGameState(interpolation: number): void {
    const state: RenderState = {
      players: this.players,
      bombs: this.bombs,
      blocks: this.blocks,
      explosions: this.explosions,
      powerUps: this.powerUps
    };
    this.renderer.render(state, interpolation);
  }

  private startNewGame(): void {
    this.initializeGrid();
    this.loadMap(CLASSIC_MAP);
    this.spawnPlayers();
    this.bombs = [];
    this.explosions = [];
    this.powerUps = [];
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
    const speed = player.getEffectiveSpeed();
    const moveAmount = speed * TILE_SIZE * deltaTime;

    let newPixelX = player.position.pixelX;
    let newPixelY = player.position.pixelY;

    switch (direction) {
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

      // Check if there's a bomb at this position (players can't walk through bombs they didn't just place)
      if (entity instanceof Bomb && entity.owner !== player) {
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
      // Try corner sliding
      this.tryCornerSlide(player, direction, deltaTime);
    }

    // Update player direction for animation
    player.move(direction, 0); // Just update direction, we already moved
  }

  private tryCornerSlide(player: Player, direction: Direction, deltaTime: number): void {
    const speed = player.getEffectiveSpeed();
    const slideAmount = speed * TILE_SIZE * deltaTime * 0.5;

    const offsetX = player.position.pixelX % TILE_SIZE;
    const offsetY = player.position.pixelY % TILE_SIZE;
    const threshold = TILE_SIZE * 0.4;

    if (direction === Direction.UP || direction === Direction.DOWN) {
      // Try sliding left or right
      if (offsetX < threshold) {
        player.position.pixelX -= slideAmount;
      } else if (offsetX > TILE_SIZE - threshold) {
        player.position.pixelX += slideAmount;
      }
    } else {
      // Try sliding up or down
      if (offsetY < threshold) {
        player.position.pixelY -= slideAmount;
      } else if (offsetY > TILE_SIZE - threshold) {
        player.position.pixelY += slideAmount;
      }
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
  }

  private onBombPlaced(_data: { gridX: number; gridY: number; owner: Player }): void {
    // Event handling is done in tryPlaceBomb
  }

  private onBombExplode(data: { bomb: Bomb; gridX: number; gridY: number; range: number; type: BombType }): void {
    const { bomb, gridX, gridY, range, type } = data;

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

    // Screen shake - bigger shake for chain reactions and larger explosions
    if (chainReactionCount > 0) {
      camera.shakePreset('chainReaction');
      SoundManager.play('explosionBig');
    } else if (range >= 4) {
      camera.shakePreset('bigExplosion');
      SoundManager.play('explosionBig');
    } else {
      camera.shakePreset('bombExplode');
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
          player.die();
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

  private onBlockDestroyed(data: { gridX: number; gridY: number }): void {
    // Add debris particles
    const centerX = data.gridX * TILE_SIZE + TILE_SIZE / 2;
    const centerY = data.gridY * TILE_SIZE + TILE_SIZE / 2;
    const particles = this.renderer.getParticleSystem();
    particles.emitPreset('debris', centerX, centerY);

    // Maybe spawn a power-up (delayed to avoid being destroyed by the same explosion)
    if (Math.random() < POWERUP_SPAWN_CHANCE) {
      const type = this.getRandomPowerUpType();
      // Use setTimeout to spawn after the current explosion finishes processing
      setTimeout(() => {
        const powerUp = new PowerUp(data.gridX, data.gridY, type);
        this.powerUps.push(powerUp);
      }, 0);
    }
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
        break;
      case PowerUpType.ICE_BOMB:
        player.setBombType(BombType.ICE);
        break;
      case PowerUpType.PIERCING_BOMB:
        player.setBombType(BombType.PIERCING);
        break;
      case PowerUpType.SKULL:
        this.applyRandomDebuff(player);
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
    const playerColors = [COLORS.player1, COLORS.player2, COLORS.player3, COLORS.player4];

    // Death particles in player's color
    const centerX = player.position.pixelX + TILE_SIZE / 2;
    const centerY = player.position.pixelY + TILE_SIZE / 2;
    particles.emitPreset('death', centerX, centerY, [
      playerColors[player.playerIndex],
      '#ffffff',
      '#000000'
    ]);

    // Screen shake for dramatic effect
    camera.shakePreset('playerDeath');

    // Play death sound
    SoundManager.play('playerDeath');

    this.checkWinCondition();
  }

  private checkWinCondition(): void {
    const alivePlayers = this.players.filter(p => p.isPlayerAlive());

    if (alivePlayers.length <= 1) {
      this.winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
      this.phase = GamePhase.GAME_OVER;
      SoundManager.stopMusic();
      SoundManager.play('gameOver');
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
