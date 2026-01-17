export function setupGlobalMocks(): void {
  if (typeof window === 'undefined') {
    (global as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      requestAnimationFrame: (callback: any) => setTimeout(callback, 16),
      cancelAnimationFrame: (id: any) => clearTimeout(id),
      performance: {
        now: () => Date.now(),
      },
      AudioContext: class MockAudioContext {},
      Image: class MockImage {
        onload: any;
        onerror: any;
        set src(_value: string) {
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
      },
    };
  }

  if (typeof document === 'undefined') {
    (global as any).document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return {
            getContext: () => ({
              fillRect: () => {},
              clearRect: () => {},
              fillStyle: '',
              strokeStyle: '',
              lineWidth: 1,
              imageSmoothingEnabled: false,
              globalAlpha: 1,
              globalCompositeOperation: 'source-over',
              font: '10px sans-serif',
              textAlign: 'left',
              textBaseline: 'alphabetic',
              shadowColor: '',
              shadowBlur: 0,
              shadowOffsetX: 0,
              shadowOffsetY: 0,
              beginPath: () => {},
              closePath: () => {},
              moveTo: () => {},
              lineTo: () => {},
              arc: () => {},
              rect: () => {},
              fill: () => {},
              stroke: () => {},
              fillText: () => {},
              strokeText: () => {},
              clip: () => {},
              save: () => {},
              restore: () => {},
              translate: () => {},
              scale: () => {},
              rotate: () => {},
              setTransform: () => {},
              transform: () => {},
              drawImage: () => {},
              getImageData: () => ({ data: [], width: 0, height: 0 }),
              putImageData: () => {},
              createImageData: () => ({ data: [], width: 0, height: 0 }),
              createLinearGradient: () => ({
                addColorStop: () => {},
              }),
              createRadialGradient: () => ({
                addColorStop: () => {},
              }),
              createPattern: () => null,
              measureText: () => ({ width: 0 }),
            }),
            width: 800,
            height: 600,
            style: {},
            addEventListener: () => {},
            removeEventListener: () => {},
          };
        }
        return {
          style: {},
          addEventListener: () => {},
          removeEventListener: () => {},
        };
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      body: {
        appendChild: () => {},
        removeChild: () => {},
      },
      getElementById: () => null,
      querySelector: () => null,
    };
  }

  if (typeof performance === 'undefined') {
    (global as any).performance = {
      now: () => Date.now(),
    };
  }

  if (typeof AudioContext === 'undefined') {
    (global as any).AudioContext = class MockAudioContext {
      createGain() {
        return {
          connect: () => {},
          disconnect: () => {},
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
            setTargetAtTime: () => {},
            cancelScheduledValues: () => {},
          },
        };
      }
      createOscillator() {
        return {
          connect: () => {},
          disconnect: () => {},
          start: () => {},
          stop: () => {},
          frequency: {
            value: 440,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
            setTargetAtTime: () => {},
            cancelScheduledValues: () => {},
          },
          type: 'sine',
        };
      }
      createBuffer() {
        return {
          getChannelData: () => new Float32Array(0),
          copyToChannel: () => {},
          copyFromChannel: () => {},
          length: 0,
          duration: 0,
          sampleRate: 44100,
          numberOfChannels: 2,
        };
      }
      createBufferSource() {
        return {
          connect: () => {},
          disconnect: () => {},
          start: () => {},
          stop: () => {},
          buffer: null,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          playbackRate: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
        };
      }
      get destination() {
        return {
          connect: () => {},
          disconnect: () => {},
        };
      }
      get currentTime() {
        return Date.now() / 1000;
      }
    };
  }

  if (typeof HTMLCanvasElement === 'undefined') {
    (global as any).HTMLCanvasElement = class MockHTMLCanvasElement {};
  }

  if (typeof Image === 'undefined') {
    (global as any).Image = class MockImage {
      onload: any;
      onerror: any;
      set src(_value: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    };
  }
}
