export interface AIDecision {
  playerId: number;
  timestamp: number;
  decision: {
    direction: { x: number; y: number };
    placeBomb: boolean;
    reason: string;
  };
  gameState: {
    position: { x: number; y: number };
    health: number;
    bombCount: number;
    blastRadius: number;
  };
}

export interface GameEvent {
  type: 'bomb_placed' | 'bomb_exploded' | 'player_death' | 'powerup_collected' | 'block_destroyed';
  timestamp: number;
  playerId?: number;
  position?: { x: number; y: number };
  data?: any;
}

export interface GameResult {
  winnerId: number | null;
  isDraw: boolean;
  roundDuration: number;
  playerStats: PlayerStats[];
}

export interface PlayerStats {
  playerId: number;
  isAI: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  survived: boolean;
  bombsPlaced: number;
  blocksDestroyed: number;
  powerUpsCollected: number;
  damageDealt: number;
  causeOfDeath?: string;
}

export interface TestRunSummary {
  totalGames: number;
  aiWins: { easy: number; medium: number; hard: number };
  draws: number;
  averageGameDuration: number;
  aiStats: {
    [difficulty: string]: {
      winRate: number;
      avgBombsPlaced: number;
      avgBlocksDestroyed: number;
      avgSurvivalTime: number;
      commonCausesOfDeath: { [cause: string]: number };
    };
  };
}

export class Telemetry {
  private static instance: Telemetry | null = null;
  private enabled: boolean = false;

  private aiDecisions: AIDecision[] = [];
  private gameEvents: GameEvent[] = [];
  private currentGameStats: Map<number, Partial<PlayerStats>> = new Map();
  private testResults: GameResult[] = [];

  private constructor() {}

  static getInstance(): Telemetry {
    if (!Telemetry.instance) {
      Telemetry.instance = new Telemetry();
    }
    return Telemetry.instance;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  reset(): void {
    this.aiDecisions = [];
    this.gameEvents = [];
    this.currentGameStats.clear();
    this.testResults = [];
  }

  startGame(players: Array<{ id: number; isAI: boolean; difficulty?: 'easy' | 'medium' | 'hard' }>): void {
    if (!this.enabled) return;

    this.currentGameStats.clear();
    players.forEach(player => {
      this.currentGameStats.set(player.id, {
        playerId: player.id,
        isAI: player.isAI,
        difficulty: player.difficulty,
        survived: true,
        bombsPlaced: 0,
        blocksDestroyed: 0,
        powerUpsCollected: 0,
        damageDealt: 0,
      });
    });
  }

  recordAIDecision(decision: AIDecision): void {
    if (!this.enabled) return;
    this.aiDecisions.push(decision);
  }

  recordEvent(event: GameEvent): void {
    if (!this.enabled) return;
    this.gameEvents.push(event);

    const stats = event.playerId !== undefined ? this.currentGameStats.get(event.playerId) : null;
    if (!stats) return;

    switch (event.type) {
      case 'bomb_placed':
        stats.bombsPlaced = (stats.bombsPlaced || 0) + 1;
        break;
      case 'block_destroyed':
        stats.blocksDestroyed = (stats.blocksDestroyed || 0) + 1;
        break;
      case 'powerup_collected':
        stats.powerUpsCollected = (stats.powerUpsCollected || 0) + 1;
        break;
      case 'player_death':
        stats.survived = false;
        stats.causeOfDeath = event.data?.cause || 'unknown';
        break;
    }
  }

  endGame(result: GameResult): void {
    if (!this.enabled) return;

    result.playerStats = Array.from(this.currentGameStats.values()) as PlayerStats[];
    this.testResults.push(result);
  }

  getGameResults(): GameResult[] {
    return this.testResults;
  }

  getAIDecisions(): AIDecision[] {
    return this.aiDecisions;
  }

  getGameEvents(): GameEvent[] {
    return this.gameEvents;
  }

  generateSummary(): TestRunSummary {
    const totalGames = this.testResults.length;
    const aiWins = { easy: 0, medium: 0, hard: 0 };
    let draws = 0;
    let totalDuration = 0;

    const aiStatsMap = new Map<string, {
      games: number;
      wins: number;
      totalBombs: number;
      totalBlocks: number;
      totalSurvivalTime: number;
      deathCauses: Map<string, number>;
    }>();

    ['easy', 'medium', 'hard'].forEach(diff => {
      aiStatsMap.set(diff, {
        games: 0,
        wins: 0,
        totalBombs: 0,
        totalBlocks: 0,
        totalSurvivalTime: 0,
        deathCauses: new Map(),
      });
    });

    this.testResults.forEach(result => {
      totalDuration += result.roundDuration;

      if (result.isDraw) {
        draws++;
      }

      result.playerStats.forEach(player => {
        if (player.isAI && player.difficulty) {
          const stats = aiStatsMap.get(player.difficulty)!;
          stats.games++;
          stats.totalBombs += player.bombsPlaced;
          stats.totalBlocks += player.blocksDestroyed;

          if (player.playerId === result.winnerId) {
            stats.wins++;
            if (player.difficulty === 'easy') aiWins.easy++;
            if (player.difficulty === 'medium') aiWins.medium++;
            if (player.difficulty === 'hard') aiWins.hard++;
          }

          if (!player.survived && player.causeOfDeath) {
            const count = stats.deathCauses.get(player.causeOfDeath) || 0;
            stats.deathCauses.set(player.causeOfDeath, count + 1);
          }
        }
      });
    });

    const aiStats: any = {};
    aiStatsMap.forEach((stats, difficulty) => {
      if (stats.games > 0) {
        const deathCauses: { [cause: string]: number } = {};
        stats.deathCauses.forEach((count, cause) => {
          deathCauses[cause] = count;
        });

        aiStats[difficulty] = {
          winRate: stats.wins / stats.games,
          avgBombsPlaced: stats.totalBombs / stats.games,
          avgBlocksDestroyed: stats.totalBlocks / stats.games,
          avgSurvivalTime: 0,
          commonCausesOfDeath: deathCauses,
        };
      }
    });

    return {
      totalGames,
      aiWins,
      draws,
      averageGameDuration: totalGames > 0 ? totalDuration / totalGames : 0,
      aiStats,
    };
  }

  exportToJSON(): string {
    return JSON.stringify({
      aiDecisions: this.aiDecisions,
      gameEvents: this.gameEvents,
      gameResults: this.testResults,
      summary: this.generateSummary(),
    }, null, 2);
  }
}
