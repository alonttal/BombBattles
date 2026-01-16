type SoundType =
  | 'explosion'
  | 'explosionBig'
  | 'explosionIce'
  | 'explosionFire'
  | 'bombPlace'
  | 'bombKick'
  | 'bombPunch'
  | 'bombLand'
  | 'bombDangerTick'
  | 'powerUp'
  | 'powerUpBad'
  | 'playerDeath'
  | 'countdown'
  | 'gameStart'
  | 'gameOver'
  | 'menuSelect'
  | 'shieldBreak'
  | 'teleport'
  | 'blockDestroy'
  | 'footstep'
  | 'playerPushback'
  | 'diarrheaBomb';

class MockSoundManagerClass {
  playSound(type: SoundType, volume?: number): void {
  }

  playMusic(): void {
  }

  stopMusic(): void {
  }

  playMenuMusic(): void {
  }

  stopMenuMusic(): void {
  }

  setMasterVolume(volume: number): void {
  }

  setMusicVolume(volume: number): void {
  }

  toggleMute(): void {
  }

  toggleMusicMute(): void {
  }

  isMusicPlaying(): boolean {
    return false;
  }

  isMenuMusicPlaying(): boolean {
    return false;
  }
}

export const MockSoundManager = new MockSoundManagerClass();
