import { Game } from './Game';

function init(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const loading = document.getElementById('loading');

  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  // Hide loading indicator
  if (loading) {
    loading.classList.add('hidden');
  }

  // Create and start the game
  const game = new Game(canvas);
  game.start();

  console.log('Playing with Fire - Game started!');
  console.log('Controls:');
  console.log('  Player 1: Arrow Keys + / (bomb)');
  console.log('  Player 2: WASD + Space (bomb)');
  console.log('  Player 3: IJKL + O (bomb)');
  console.log('  Player 4: Numpad 8456 + 0 (bomb)');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
