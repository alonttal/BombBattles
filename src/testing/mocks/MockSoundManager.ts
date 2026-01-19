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
  playSound(_type: SoundType, _volume?: number): void {
  }

  playMusic(): void {
  }

  stopMusic(): void {
  }

  playMenuMusic(): void {
  }

  stopMenuMusic(): void {
  }

  setMasterVolume(_volume: number): void {
  }

  setMusicVolume(_volume: number): void {
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
