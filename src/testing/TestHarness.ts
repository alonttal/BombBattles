import { Game } from '../Game';
import { Telemetry, GameResult } from './Telemetry';
import { GamePhase } from '../constants';
import * as fs from 'fs';

export interface TestConfig {
  numGames: number;
  aiDifficulties: Array<'easy' | 'medium' | 'hard'>;
  maxRoundTime?: number;
  mapIndex?: number;
  verbose?: boolean;
}

export interface TestGame {
  game: Game;
  update: (deltaTime: number) => void;
  getPhase: () => GamePhase;
  getWinner: () => any;
  getRoundTime: () => number;
  getPlayers: () => any[];
}

export class TestHarness {
  private telemetry: Telemetry;
  private config: TestConfig;

  constructor(config: TestConfig) {
    this.config = {
      maxRoundTime: 180,
      mapIndex: 0,
      verbose: false,
      ...config,
    };
    this.telemetry = Telemetry.getInstance();
  }

  async runTests(): Promise<void> {
    this.telemetry.reset();
    this.telemetry.enable();

    console.log(`\nStarting test run: ${this.config.numGames} games`);
    console.log(`AI Difficulties: ${this.config.aiDifficulties.join(', ')}\n`);

    for (let gameNum = 0; gameNum < this.config.numGames; gameNum++) {
      await this.runSingleGame(gameNum + 1);
    }

    this.printSummary();
  }

  private async runSingleGame(gameNum: number): Promise<void> {
    if (this.config.verbose) {
      console.log(`\n=== Game ${gameNum} ===`);
    } else {
      process.stdout.write(`Game ${gameNum}/${this.config.numGames}... `);
    }

    const testGame = await this.createTestGame();
    const startTime = Date.now();

    const playerConfigs = this.config.aiDifficulties.map((difficulty, index) => ({
      id: index,
      isAI: true,
      difficulty,
    }));
    this.telemetry.startGame(playerConfigs);

    const fixedTimeStep = 1000 / 60;
    let gameTime = 0;
    const maxGameTime = this.config.maxRoundTime! * 1000;

    while (testGame.getPhase() !== GamePhase.GAME_OVER && gameTime < maxGameTime) {
      testGame.update(fixedTimeStep / 1000);
      gameTime += fixedTimeStep;

      await this.sleep(0);
    }

    const winner = testGame.getWinner();
    const players = testGame.getPlayers();
    const roundDuration = (this.config.maxRoundTime! * 1000 - testGame.getRoundTime() * 1000) / 1000;

    const result: GameResult = {
      winnerId: winner?.id ?? null,
      isDraw: winner === null,
      roundDuration,
      playerStats: [],
    };

    this.telemetry.endGame(result);

    const elapsed = Date.now() - startTime;

    if (this.config.verbose) {
      console.log(`Winner: ${winner ? `Player ${winner.id} (${this.config.aiDifficulties[winner.id]})` : 'Draw'}`);
      console.log(`Duration: ${roundDuration.toFixed(1)}s (real: ${elapsed}ms)`);
    } else {
      const winnerStr = winner ? `P${winner.id}(${this.config.aiDifficulties[winner.id]})` : 'Draw';
      console.log(`${winnerStr} in ${roundDuration.toFixed(1)}s`);
    }
  }

  private async createTestGame(): Promise<TestGame> {
    const fakeCanvas = document.createElement('canvas') as any;

    const game = new Game(fakeCanvas);

    (game as any).isSinglePlayer = true;
    (game as any).playerCount = this.config.aiDifficulties.length;
    (game as any).aiDifficulty = this.config.aiDifficulties[1] || 'medium';
    (game as any).selectedMapIndex = this.config.mapIndex || 0;

    (game as any).startNewGame();

    const aiDifficulties = this.config.aiDifficulties;
    const players = (game as any).players;
    const aiControllers = (game as any).aiControllers;
    const aiPlayers = (game as any).aiPlayers;

    aiPlayers.clear();
    aiControllers.clear();

    const { SimpleAI } = await import('../ai/SimpleAI.js');
    players.forEach((player: any, index: number) => {
      if (index < aiDifficulties.length) {
        aiPlayers.add(index);
        const controller = new SimpleAI(player);
        aiControllers.set(index, controller);
      }
    });

    return {
      game,
      update: (deltaTime: number) => (game as any).update(deltaTime),
      getPhase: () => (game as any).phase,
      getWinner: () => (game as any).winner,
      getRoundTime: () => (game as any).roundTime,
      getPlayers: () => (game as any).players,
    };
  }

  private printSummary(): void {
    const summary = this.telemetry.generateSummary();

    console.log('\n' + '='.repeat(60));
    console.log('TEST RUN SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Games: ${summary.totalGames}`);
    console.log(`Draws: ${summary.draws}`);
    console.log(`Average Game Duration: ${summary.averageGameDuration.toFixed(1)}s`);

    console.log('\nAI Performance by Difficulty:');
    Object.entries(summary.aiStats).forEach(([difficulty, stats]) => {
      console.log(`\n  ${difficulty.toUpperCase()}:`);
      console.log(`    Win Rate: ${(stats.winRate * 100).toFixed(1)}%`);
      console.log(`    Avg Bombs Placed: ${stats.avgBombsPlaced.toFixed(1)}`);
      console.log(`    Avg Blocks Destroyed: ${stats.avgBlocksDestroyed.toFixed(1)}`);

      if (Object.keys(stats.commonCausesOfDeath).length > 0) {
        console.log(`    Common Causes of Death:`);
        Object.entries(stats.commonCausesOfDeath)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .forEach(([cause, count]) => {
            console.log(`      - ${cause}: ${count}`);
          });
      }
    });

    console.log('\n' + '='.repeat(60));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  exportResults(filename: string): void {
    const json = this.telemetry.exportToJSON();
    fs.writeFileSync(filename, json);
    console.log(`\nResults exported to: ${filename}`);
  }
}
