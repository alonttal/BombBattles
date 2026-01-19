#!/usr/bin/env node

import { setupGlobalMocks } from './setupGlobals.js';
import { TestHarness, TestConfig } from './TestHarness.js';

setupGlobalMocks();

function parseArgs(): TestConfig {
  const args = process.argv.slice(2);

  const config: TestConfig = {
    numGames: 10,
    aiDifficulties: ['medium', 'medium', 'medium', 'medium'],
    maxRoundTime: 180,
    mapIndex: 0,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-n':
      case '--num-games':
        config.numGames = parseInt(args[++i], 10);
        break;

      case '-d':
      case '--difficulties':
        const difficulties = args[++i].split(',') as Array<'easy' | 'medium' | 'hard'>;
        config.aiDifficulties = difficulties;
        break;

      case '-t':
      case '--time':
        config.maxRoundTime = parseInt(args[++i], 10);
        break;

      case '-m':
      case '--map':
        config.mapIndex = parseInt(args[++i], 10);
        break;

      case '-v':
      case '--verbose':
        config.verbose = true;
        break;

      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;

      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return config;
}

function printHelp(): void {
  console.log(`
AI Testing Tool for Playing with Fire

Usage: npm run test-ai [options]

Options:
  -n, --num-games <number>       Number of games to run (default: 10)
  -d, --difficulties <list>      Comma-separated AI difficulties (default: medium,medium,medium,medium)
                                 Example: easy,medium,hard,hard
  -t, --time <seconds>           Max round time in seconds (default: 180)
  -m, --map <index>              Map index to use (default: 0)
  -v, --verbose                  Verbose output
  -h, --help                     Show this help message

Examples:
  npm run test-ai                                    # Run 10 games with default settings
  npm run test-ai -- -n 50                           # Run 50 games
  npm run test-ai -- -d easy,medium,hard,hard        # Test different AI difficulties
  npm run test-ai -- -n 100 -v                       # Run 100 games with verbose output
  `);
}

async function main(): Promise<void> {
  console.log('Playing with Fire - AI Testing Tool\n');

  const config = parseArgs();

  const harness = new TestHarness(config);

  try {
    await harness.runTests();

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `test-results-${timestamp}.json`;
    harness.exportResults(filename);

    console.log('\nTest run complete!');
  } catch (error) {
    console.error('\nError running tests:', error);
    process.exit(1);
  }
}

main();
