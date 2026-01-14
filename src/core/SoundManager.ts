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
        case 'shieldBreak':
          this.playShieldBreak(ctx);
          break;
        case 'teleport':
          this.playTeleport(ctx);
          break;
        case 'bombPunch':
          this.playBombPunch(ctx);
          break;
        case 'bombLand':
          this.playBombLand(ctx);
          break;
        case 'bombDangerTick':
          this.playBombDangerTick(ctx);
          break;
        case 'blockDestroy':
          this.playBlockDestroy(ctx);
          break;
        case 'footstep':
          this.playFootstep(ctx);
          break;
        case 'playerPushback':
          this.playPlayerPushback(ctx);
          break;
        case 'diarrheaBomb':
          this.playDiarrheaBomb(ctx);
          break;
      }
    } catch (e) {
      // Silently fail if audio isn't available
      console.warn('Audio playback failed:', e);
    }
  }

  private playExplosion(ctx: AudioContext, volume: number, freq: number, duration: number): void {
    const now = ctx.currentTime;

    // Random pitch variation (up to 15%) for variety
    const pitchVar = 1 + (Math.random() - 0.5) * 0.15;
    const adjustedFreq = freq * pitchVar;
    const adjustedDuration = duration * (0.9 + Math.random() * 0.2);

    // LAYER 1: Initial impact transient (sharp attack)
    const impactOsc = ctx.createOscillator();
    impactOsc.type = 'sine';
    impactOsc.frequency.setValueAtTime(200 * pitchVar, now);
    impactOsc.frequency.exponentialRampToValueAtTime(40, now + 0.05);

    const impactGain = ctx.createGain();
    impactGain.gain.setValueAtTime(volume * this.masterVolume * 0.8, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    impactOsc.connect(impactGain);
    impactGain.connect(ctx.destination);
    impactOsc.start(now);
    impactOsc.stop(now + 0.08);

    // LAYER 2: Enhanced noise with dual frequency bands
    const bufferSize = Math.floor(ctx.sampleRate * adjustedDuration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise with aggressive decay and random crackle
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const decay = Math.pow(1 - t, 1.5);
      const crackle = Math.random() > 0.97 ? 2 : 1;
      data[i] = (Math.random() * 2 - 1) * decay * crackle;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Low-pass filter for bass rumble
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.setValueAtTime(adjustedFreq, now);
    lowFilter.frequency.exponentialRampToValueAtTime(30, now + adjustedDuration);
    lowFilter.Q.value = 2;

    // High-pass filter for sizzle/crackle
    const highFilter = ctx.createBiquadFilter();
    highFilter.type = 'highpass';
    highFilter.frequency.value = 2000;

    // Separate gains for low and high
    const lowGain = ctx.createGain();
    lowGain.gain.setValueAtTime(volume * this.masterVolume * 0.7, now);
    lowGain.gain.exponentialRampToValueAtTime(0.001, now + adjustedDuration);

    const highGain = ctx.createGain();
    highGain.gain.setValueAtTime(volume * this.masterVolume * 0.3, now);
    highGain.gain.exponentialRampToValueAtTime(0.001, now + adjustedDuration * 0.5);

    // Route noise to both filters
    noise.connect(lowFilter);
    lowFilter.connect(lowGain);
    lowGain.connect(ctx.destination);

    noise.connect(highFilter);
    highFilter.connect(highGain);
    highGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + adjustedDuration);

    // LAYER 3: Sub-bass thump
    const bassOsc = ctx.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(60 * pitchVar, now);
    bassOsc.frequency.exponentialRampToValueAtTime(15, now + 0.15);

    const bassGain = ctx.createGain();
    bassGain.gain.setValueAtTime(volume * this.masterVolume, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    bassOsc.connect(bassGain);
    bassGain.connect(ctx.destination);

    bassOsc.start(now);
    bassOsc.stop(now + 0.15);

    // LAYER 4: Mid-range punch
    const midOsc = ctx.createOscillator();
    midOsc.type = 'triangle';
    midOsc.frequency.setValueAtTime(120 * pitchVar, now);
    midOsc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

    const midGain = ctx.createGain();
    midGain.gain.setValueAtTime(volume * this.masterVolume * 0.4, now);
    midGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    midOsc.connect(midGain);
    midGain.connect(ctx.destination);

    midOsc.start(now);
    midOsc.stop(now + 0.12);
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
    const pitchVar = 1 + (Math.random() - 0.5) * 0.15;

    // Thud sound
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(50 * pitchVar, now + 0.1);

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
    const pitchVar = 1 + (Math.random() - 0.5) * 0.15;

    // Whoosh sound for kick
    const bufferSize = Math.floor(ctx.sampleRate * 0.15);
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
    filter.frequency.setValueAtTime(800 * pitchVar, now);
    filter.frequency.linearRampToValueAtTime(300 * pitchVar, now + 0.15);
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
    const pitchVar = 1 + (Math.random() - 0.5) * 0.08;

    // Rising arpeggio
    const frequencies = [523, 659, 784, 1047]; // C5, E5, G5, C6

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq * pitchVar;

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
    const pitchVar = 1 + (Math.random() - 0.5) * 0.1;

    // Descending minor sound
    const frequencies = [400, 350, 300, 200];

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq * pitchVar;

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
    const pitchVar = 1 + (Math.random() - 0.5) * 0.1;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(600 * pitchVar, now);
    osc.frequency.setValueAtTime(800 * pitchVar, now + 0.05);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  private playShieldBreak(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // Glass breaking sound
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  private playTeleport(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const pitchVar = 1 + (Math.random() - 0.5) * 0.1;

    // Sci-fi swoop
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(2000 * pitchVar, now + 0.3);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2 * this.masterVolume, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);

    // Add shimmer overlay
    const shimmerOsc = ctx.createOscillator();
    shimmerOsc.type = 'sine';
    shimmerOsc.frequency.setValueAtTime(400 * pitchVar, now);
    shimmerOsc.frequency.exponentialRampToValueAtTime(3000 * pitchVar, now + 0.25);

    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.08 * this.masterVolume, now);
    shimmerGain.gain.linearRampToValueAtTime(0, now + 0.25);

    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(ctx.destination);

    shimmerOsc.start(now);
    shimmerOsc.stop(now + 0.25);
  }

  private playBombPunch(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const pitchVar = 1 + (Math.random() - 0.5) * 0.1;

    // Whoosh component (quick sweep)
    const whooshDuration = 0.12;
    const whooshBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * whooshDuration), ctx.sampleRate);
    const whooshData = whooshBuffer.getChannelData(0);

    for (let i = 0; i < whooshBuffer.length; i++) {
      const t = i / whooshBuffer.length;
      const env = Math.sin(t * Math.PI) * (1 - t);
      whooshData[i] = (Math.random() * 2 - 1) * env;
    }

    const whoosh = ctx.createBufferSource();
    whoosh.buffer = whooshBuffer;

    const whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.frequency.setValueAtTime(1200 * pitchVar, now);
    whooshFilter.frequency.linearRampToValueAtTime(400, now + whooshDuration);
    whooshFilter.Q.value = 3;

    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0.35 * this.masterVolume, now);
    whooshGain.gain.exponentialRampToValueAtTime(0.001, now + whooshDuration);

    whoosh.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(ctx.destination);
    whoosh.start(now);

    // Impact thump
    const impactOsc = ctx.createOscillator();
    impactOsc.type = 'sine';
    impactOsc.frequency.setValueAtTime(180 * pitchVar, now);
    impactOsc.frequency.exponentialRampToValueAtTime(60, now + 0.08);

    const impactGain = ctx.createGain();
    impactGain.gain.setValueAtTime(0.4 * this.masterVolume, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    impactOsc.connect(impactGain);
    impactGain.connect(ctx.destination);
    impactOsc.start(now);
    impactOsc.stop(now + 0.08);
  }

  private playBombLand(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const pitchVar = 1 + (Math.random() - 0.5) * 0.15;

    // Heavy thud
    const thudOsc = ctx.createOscillator();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(100 * pitchVar, now);
    thudOsc.frequency.exponentialRampToValueAtTime(35, now + 0.15);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.45 * this.masterVolume, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudOsc.start(now);
    thudOsc.stop(now + 0.15);

    // Debris scatter noise
    const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseBuffer.length; i++) {
      const t = i / noiseBuffer.length;
      noiseData[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 800;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15 * this.masterVolume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
  }

  private playBombDangerTick(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const pitchVar = 1 + (Math.random() - 0.5) * 0.1;

    // Soft warning tick - using sine wave for gentler sound
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 440 * pitchVar; // Lower frequency, less piercing

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06 * this.masterVolume, now); // Quieter
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.025);
  }

  private playBlockDestroy(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const pitchVar = 1 + (Math.random() - 0.5) * 0.2;

    // Crumbling/cracking noise
    const crumbleDuration = 0.25;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * crumbleDuration), ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / buffer.length;
      const decay = Math.pow(1 - t, 1.2);
      const click = Math.random() > 0.95 ? 2.5 : 1;
      data[i] = (Math.random() * 2 - 1) * decay * click;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Bandpass for woody/stone sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800 * pitchVar, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + crumbleDuration);
    filter.Q.value = 1.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + crumbleDuration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Low thump for impact
    const thumpOsc = ctx.createOscillator();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(90 * pitchVar, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(30, now + 0.1);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.2 * this.masterVolume, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.1);
  }

  private playFootstep(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const pitchVar = 1 + (Math.random() - 0.5) * 0.3;

    // Very short, subtle tap
    const duration = 0.04 + Math.random() * 0.02;

    // Noise burst for footstep
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / buffer.length;
      const env = Math.pow(1 - t, 2);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter for soft/padded sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400 * pitchVar;

    const gain = ctx.createGain();
    // Very quiet - subtle footsteps
    gain.gain.setValueAtTime(0.08 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  private playPlayerPushback(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const pitchVar = 1 + (Math.random() - 0.5) * 0.2;

    // Soft bounce/boing
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);

    // Quick noise for impact texture
    const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseBuffer.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseBuffer.length);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08 * this.masterVolume, now);

    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
  }

  private playDiarrheaBomb(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const pitchVar = 1 + (Math.random() - 0.5) * 0.2;

    // Wet splat sound
    const splatDuration = 0.15;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * splatDuration), ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / buffer.length;
      const env = Math.sin(t * Math.PI * 0.5) * (1 - t);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600 * pitchVar, now);
    filter.frequency.linearRampToValueAtTime(200, now + splatDuration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + splatDuration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Descending squelch tone
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(250 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.15 * this.masterVolume, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
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
