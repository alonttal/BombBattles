# Playing with Fire - AI Testing Infrastructure

This directory contains a complete testing infrastructure for running headless AI battles and collecting detailed telemetry data. Use this to analyze AI behavior, identify bugs, and tune game balance.

## Quick Start

```bash
# Install dependencies (if not already installed)
npm install

# Run 10 games with default settings
npm run test-ai

# Run 50 games with verbose output
npm run test-ai -- -n 50 -v

# Test different AI difficulties
npm run test-ai -- -d easy,medium,hard,hard -n 20
```

## Architecture

The testing infrastructure consists of four main components:

### 1. Telemetry System (`Telemetry.ts`)

Collects comprehensive data about AI decisions and game events:

**AI Decisions:**
- Direction chosen
- Bomb placement decisions
- Game state at decision time (position, health, bombs, blast radius)

**Game Events:**
- Bomb placements
- Bomb explosions
- Player deaths
- Block destructions
- Power-up collections

**Game Results:**
- Winner ID
- Round duration
- Player statistics (bombs placed, blocks destroyed, power-ups collected)
- Causes of death

### 2. Headless Mode (`mocks/`)

Mock implementations that allow the game to run without rendering or sound:

- `MockRenderer.ts` - No-op renderer (skips all canvas operations)
- `MockSoundManager.ts` - No-op sound manager (silent)
- `MockInputManager.ts` - Programmatic input simulation

### 3. Test Harness (`TestHarness.ts`)

Orchestrates test execution:

- Runs multiple games sequentially
- Configures AI difficulties per player
- Collects telemetry data across all games
- Generates statistical summaries
- Exports detailed results to JSON

### 4. CLI Tool (`cli.ts`)

Command-line interface for running tests:

```bash
npm run test-ai -- [options]
```

**Options:**
- `-n, --num-games <number>` - Number of games to run (default: 10)
- `-d, --difficulties <list>` - Comma-separated AI difficulties (default: medium,medium,medium,medium)
- `-t, --time <seconds>` - Max round time in seconds (default: 180)
- `-m, --map <index>` - Map index to use (default: 0)
- `-v, --verbose` - Verbose output showing detailed per-game stats
- `-h, --help` - Show help message

## Usage Examples

### Basic Testing

Run a quick test to see if everything is working:

```bash
npm run test-ai
```

This runs 10 games with 4 medium-difficulty AI players and outputs a summary.

### Difficulty Testing

Test how different AI difficulties perform against each other:

```bash
# Easy vs Medium vs Hard
npm run test-ai -- -d easy,medium,hard,hard -n 50

# All easy (for baseline)
npm run test-ai -- -d easy,easy,easy,easy -n 20

# All hard (for stress testing)
npm run test-ai -- -d hard,hard,hard,hard -n 30
```

### Long-Running Tests

Run extensive tests for statistical significance:

```bash
# 100 games with verbose output saved to a log file
npm run test-ai -- -n 100 -v > ai-test-log.txt

# 500 games for robust statistics (takes ~10-15 minutes)
npm run test-ai -- -n 500
```

### Map-Specific Testing

Test AI behavior on different maps:

```bash
# Test on map 0
npm run test-ai -- -m 0 -n 20

# Test on map 1
npm run test-ai -- -m 1 -n 20
```

## Output

### Console Output

The tool outputs real-time progress and a summary:

```
Playing with Fire - AI Testing Tool

Starting test run: 10 games
AI Difficulties: medium, medium, medium, medium

Game 1/10... P0(medium) in 45.2s
Game 2/10... P2(medium) in 38.7s
...

============================================================
TEST RUN SUMMARY
============================================================
Total Games: 10
Draws: 1
Average Game Duration: 42.3s

AI Performance by Difficulty:

  MEDIUM:
    Win Rate: 22.5%
    Avg Bombs Placed: 12.3
    Avg Blocks Destroyed: 8.7
    Common Causes of Death:
      - explosion: 28
      - unknown: 2

============================================================

Results exported to: test-results-2024-01-15T10-30-45.json

Test run complete!
```

### JSON Export

Each test run exports a detailed JSON file with:

```json
{
  "aiDecisions": [
    {
      "playerId": 0,
      "timestamp": 1234.567,
      "decision": {
        "direction": { "x": 1, "y": 0 },
        "placeBomb": false,
        "reason": "ai_decision"
      },
      "gameState": {
        "position": { "x": 5, "y": 7 },
        "health": 1,
        "bombCount": 3,
        "blastRadius": 2
      }
    }
  ],
  "gameEvents": [
    {
      "type": "bomb_placed",
      "timestamp": 1235.890,
      "playerId": 1,
      "position": { "x": 8, "y": 3 }
    }
  ],
  "gameResults": [
    {
      "winnerId": 2,
      "isDraw": false,
      "roundDuration": 45.2,
      "playerStats": [...]
    }
  ],
  "summary": {
    "totalGames": 10,
    "aiWins": { "easy": 0, "medium": 9, "hard": 0 },
    "draws": 1,
    "averageGameDuration": 42.3,
    "aiStats": {...}
  }
}
```

## Integration Details

The testing infrastructure integrates with the game code via minimal hooks:

### Game.ts Hooks

1. **AI Decision Recording** (line ~267): Records every AI decision with game state context
2. **Event Handlers**: Records game events (bomb placement, player death, block destruction, power-up collection)

### Telemetry Singleton

The `Telemetry` class is a singleton that can be enabled/disabled:

```typescript
const telemetry = Telemetry.getInstance();
telemetry.enable();  // Start recording
telemetry.disable(); // Stop recording
```

When disabled (default), telemetry has zero performance impact.

## Analyzing Results

The exported JSON files can be analyzed using standard tools:

```bash
# Pretty-print results
cat test-results-*.json | jq '.'

# Extract win rates
cat test-results-*.json | jq '.summary.aiStats'

# Count total decisions
cat test-results-*.json | jq '.aiDecisions | length'

# Find most common death causes
cat test-results-*.json | jq '.summary.aiStats.medium.commonCausesOfDeath'
```

You can also write custom analysis scripts in Python, JavaScript, or your preferred language.

## Troubleshooting

### "Cannot find module" errors

Install dependencies:

```bash
npm install
```

### TypeScript errors

Make sure TypeScript is installed and configured:

```bash
npm install -D typescript @types/node tsx
```

### Game crashes or hangs

1. Run with verbose mode to see where it fails: `npm run test-ai -- -v`
2. Reduce the number of games: `npm run test-ai -- -n 1`
3. Check for infinite loops in game logic

### No output

The game might be stuck in a non-ending state. Check:
- Win/loss detection logic in `Game.ts`
- Round timer is counting down correctly
- At least one player can die

## Future Enhancements

Potential additions to the testing infrastructure:

1. **Replay System**: Record and replay specific games for debugging
2. **Visual Debugging**: Render games in slow motion for analysis
3. **Fuzzing**: Random input testing to find edge cases
4. **Performance Profiling**: Track frame times and bottlenecks
5. **Headless Server**: Run tests on CI/CD infrastructure
6. **Comparative Analysis**: A/B test different AI implementations
7. **Bug Detection**: Automatically flag anomalous behavior (e.g., players walking through walls)

## Contributing

When modifying the game code, please ensure telemetry hooks remain functional:

1. If adding new AI decision factors, update `recordAIDecision()` calls
2. If adding new game events, add corresponding `recordEvent()` calls
3. If changing game end conditions, verify `endGame()` is called correctly
4. Run tests after major changes to ensure they still work

## License

Same as the main project.
