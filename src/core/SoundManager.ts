type SoundType =
  | 'explosion'
  | 'explosionBig'
  | 'explosionIce'
  | 'explosionFire'
  | 'bombPlace'
  | 'bombKick'
  | 'powerUp'
  | 'powerUpBad'
  | 'playerDeath'
  | 'countdown'
  | 'gameStart'
  | 'gameOver'
  | 'menuSelect';

class SoundManagerClass {
  private audioContext: AudioContext | null = null;
  private masterVolume: number = 0.5;
  private musicVolume: number = 0.3;
  private isMuted: boolean = false;
  private isMusicMuted: boolean = false;

  // Music state
  private musicPlaying: boolean = false;
  private musicIntervalId: number | null = null;
  private currentBeat: number = 0;
  private musicGainNode: GainNode | null = null;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  play(sound: SoundType): void {
    if (this.isMuted) return;

    try {
      const ctx = this.getContext();

      // Resume audio context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      switch (sound) {
        case 'explosion':
          this.playExplosion(ctx, 0.4, 150, 0.15);
          break;
        case 'explosionBig':
          this.playExplosion(ctx, 0.5, 100, 0.25);
          break;
        case 'explosionIce':
          this.playIceExplosion(ctx);
          break;
        case 'explosionFire':
          this.playFireExplosion(ctx);
          break;
        case 'bombPlace':
          this.playBombPlace(ctx);
          break;
        case 'bombKick':
          this.playBombKick(ctx);
          break;
        case 'powerUp':
          this.playPowerUp(ctx);
          break;
        case 'powerUpBad':
          this.playPowerUpBad(ctx);
          break;
        case 'playerDeath':
          this.playPlayerDeath(ctx);
          break;
        case 'countdown':
          this.playCountdown(ctx);
          break;
        case 'gameStart':
          this.playGameStart(ctx);
          break;
        case 'gameOver':
          this.playGameOver(ctx);
          break;
        case 'menuSelect':
          this.playMenuSelect(ctx);
          break;
      }
    } catch (e) {
      // Silently fail if audio isn't available
      console.warn('Audio playback failed:', e);
    }
  }

  private playExplosion(ctx: AudioContext, volume: number, freq: number, duration: number): void {
    const now = ctx.currentTime;

    // Create noise for explosion
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise with decay
    for (let i = 0; i < bufferSize; i++) {
      const decay = 1 - (i / bufferSize);
      data[i] = (Math.random() * 2 - 1) * decay * decay;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Low-pass filter for bass rumble
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + duration);

    // Gain envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);

    // Add a low thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.1);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(volume * this.masterVolume * 0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  private playIceExplosion(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const duration = 0.3;

    // High-pitched crystalline sound
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + duration);

    // Add shimmer with second oscillator
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2200, now);
    osc2.frequency.exponentialRampToValueAtTime(600, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // High-pass filter for icy feel
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 800;

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + duration);
    osc2.stop(now + duration);

    // Add crackle noise
    this.playExplosion(ctx, 0.2, 3000, 0.15);
  }

  private playFireExplosion(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // Whoosh sound
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const envelope = Math.sin(t * Math.PI) * (1 - t);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.linearRampToValueAtTime(200, now + 0.4);
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4 * this.masterVolume, now);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);

    // Add bass explosion
    this.playExplosion(ctx, 0.35, 120, 0.2);
  }

  private playBombPlace(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // Thud sound
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  private playBombKick(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // Whoosh sound for kick
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const envelope = Math.sin(t * Math.PI) * (1 - t * t);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.linearRampToValueAtTime(300, now + 0.15);
    filter.Q.value = 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
  }

  private playPowerUp(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // Rising arpeggio
    const frequencies = [523, 659, 784, 1047]; // C5, E5, G5, C6

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      const startTime = now + i * 0.05;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.15 * this.masterVolume, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.15);
    });
  }

  private playPowerUpBad(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // Descending minor sound
    const frequencies = [400, 350, 300, 200];

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      const startTime = now + i * 0.08;
      gain.gain.setValueAtTime(0.12 * this.masterVolume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.15);
    });
  }

  private playPlayerDeath(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // Descending tone
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.5);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2 * this.masterVolume, now);
    gain.gain.setValueAtTime(0.2 * this.masterVolume, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);

    // Add noise burst
    this.playExplosion(ctx, 0.2, 200, 0.2);
  }

  private playCountdown(ctx: AudioContext): void {
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 440;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  private playGameStart(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // Fanfare
    const notes = [
      { freq: 523, time: 0 },      // C5
      { freq: 659, time: 0.1 },    // E5
      { freq: 784, time: 0.2 },    // G5
      { freq: 1047, time: 0.35 },  // C6
    ];

    notes.forEach(({ freq, time }) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15 * this.masterVolume, now + time);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + 0.2);
    });
  }

  private playGameOver(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // Sad descending tones
    const notes = [
      { freq: 400, time: 0 },
      { freq: 350, time: 0.2 },
      { freq: 300, time: 0.4 },
      { freq: 200, time: 0.6 },
    ];

    notes.forEach(({ freq, time }) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2 * this.masterVolume, now + time);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + 0.3);
    });
  }

  private playMenuSelect(ctx: AudioContext): void {
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setValueAtTime(800, now + 0.05);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.masterVolume;
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  isSoundMuted(): boolean {
    return this.isMuted;
  }

  // ============ MUSIC SYSTEM ============

  startMusic(): void {
    if (this.musicPlaying || this.isMusicMuted) return;

    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      this.musicPlaying = true;
      this.currentBeat = 0;

      // Create master gain for music
      this.musicGainNode = ctx.createGain();
      this.musicGainNode.gain.value = this.musicVolume * this.masterVolume;
      this.musicGainNode.connect(ctx.destination);

      // Start the music loop - 140 BPM (approx 428ms per beat)
      const beatDuration = 428;
      this.playMusicBeat();
      this.musicIntervalId = window.setInterval(() => {
        this.playMusicBeat();
      }, beatDuration);
    } catch (e) {
      console.warn('Music playback failed:', e);
    }
  }

  stopMusic(): void {
    if (!this.musicPlaying) return;

    this.musicPlaying = false;
    if (this.musicIntervalId !== null) {
      clearInterval(this.musicIntervalId);
      this.musicIntervalId = null;
    }

    // Fade out
    if (this.musicGainNode && this.audioContext) {
      const now = this.audioContext.currentTime;
      this.musicGainNode.gain.setValueAtTime(this.musicGainNode.gain.value, now);
      this.musicGainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    }
  }

  private playMusicBeat(): void {
    if (!this.musicPlaying || !this.audioContext || !this.musicGainNode) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // Music pattern (16 beats = 1 bar, 4 bars total = 64 beats then loop)
    const beat = this.currentBeat % 64;
    const barBeat = beat % 16;

    // Bass line pattern (plays on beats 0, 4, 8, 12)
    if (barBeat % 4 === 0) {
      this.playBassNote(ctx, now, beat);
    }

    // Melody pattern
    this.playMelodyNote(ctx, now, beat);

    // Drums/percussion
    this.playDrumBeat(ctx, now, barBeat);

    // Arpeggio accent on certain beats
    if (barBeat === 0 || barBeat === 8) {
      this.playArpeggio(ctx, now, beat);
    }

    this.currentBeat++;
  }

  private playBassNote(ctx: AudioContext, time: number, beat: number): void {
    // Bass pattern - changes every bar
    const bar = Math.floor(beat / 16) % 4;
    const bassNotes = [
      [65.41, 65.41, 82.41, 65.41],  // C2, C2, E2, C2
      [73.42, 73.42, 87.31, 73.42],  // D2, D2, F2, D2
      [55.00, 55.00, 69.30, 55.00],  // A1, A1, C#2, A1
      [61.74, 61.74, 77.78, 61.74],  // B1, B1, D#2, B1
    ];
    const noteIndex = Math.floor((beat % 16) / 4);
    const freq = bassNotes[bar][noteIndex];

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc.connect(gain);
    gain.connect(this.musicGainNode!);

    osc.start(time);
    osc.stop(time + 0.35);
  }

  private playMelodyNote(ctx: AudioContext, time: number, beat: number): void {
    // Catchy melody pattern
    const melodyPattern: (number | null)[] = [
      523, null, 587, null, 659, null, 587, null,  // C5, D5, E5, D5
      523, null, 494, null, 440, null, 494, null,  // C5, B4, A4, B4
      523, null, 659, null, 784, null, 659, null,  // C5, E5, G5, E5
      523, null, 587, null, 659, 587, 523, null,   // C5, D5, E5, D5, C5
      // Second phrase
      698, null, 659, null, 587, null, 523, null,  // F5, E5, D5, C5
      587, null, 523, null, 494, null, 440, null,  // D5, C5, B4, A4
      523, null, 659, null, 784, null, 880, null,  // C5, E5, G5, A5
      784, null, 659, null, 523, null, null, null, // G5, E5, C5
    ];

    const noteIndex = beat % melodyPattern.length;
    const freq = melodyPattern[noteIndex];

    if (freq === null) return;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    // Add slight filter for softer sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGainNode!);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  private playDrumBeat(ctx: AudioContext, time: number, barBeat: number): void {
    // Kick on 0, 4, 8, 12
    if (barBeat % 4 === 0) {
      this.playKick(ctx, time);
    }

    // Snare on 4, 12
    if (barBeat === 4 || barBeat === 12) {
      this.playSnare(ctx, time);
    }

    // Hi-hat on every beat
    this.playHiHat(ctx, time, barBeat % 2 === 0);
  }

  private playKick(ctx: AudioContext, time: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(this.musicGainNode!);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  private playSnare(ctx: AudioContext, time: number): void {
    // Noise burst for snare
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGainNode!);

    noise.start(time);
  }

  private playHiHat(ctx: AudioContext, time: number, isAccent: boolean): void {
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isAccent ? 0.08 : 0.04, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGainNode!);

    noise.start(time);
  }

  private playArpeggio(ctx: AudioContext, time: number, beat: number): void {
    const bar = Math.floor(beat / 16) % 4;
    const chords = [
      [523, 659, 784],  // C major
      [587, 740, 880],  // D major
      [440, 554, 659],  // A minor
      [494, 622, 740],  // B diminished-ish
    ];

    const chord = chords[bar];

    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      const noteTime = time + i * 0.05;
      gain.gain.setValueAtTime(0.06, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.2);

      osc.connect(gain);
      gain.connect(this.musicGainNode!);

      osc.start(noteTime);
      osc.stop(noteTime + 0.2);
    });
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicGainNode) {
      this.musicGainNode.gain.value = this.musicVolume * this.masterVolume;
    }
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  toggleMusicMute(): boolean {
    this.isMusicMuted = !this.isMusicMuted;
    if (this.isMusicMuted) {
      this.stopMusic();
    }
    return this.isMusicMuted;
  }

  isMusicCurrentlyMuted(): boolean {
    return this.isMusicMuted;
  }

  isMusicPlaying(): boolean {
    return this.musicPlaying;
  }
}

export const SoundManager = new SoundManagerClass();
