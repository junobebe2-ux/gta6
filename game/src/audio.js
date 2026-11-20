// Solmar City — WebAudio-synthesised sound effects + music loop.
// Everything is lazy and guarded: no AudioContext is created until the
// first user gesture, and every call is a safe no-op when audio is
// unavailable (headless browsers stay silent and never throw).

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (ctx !== null) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.25;
      master.connect(ctx.destination);
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(freq, duration, type, volume, slideTo) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), c.currentTime + duration);
      }
      gain.gain.setValueAtTime(volume || 0.2, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(c.currentTime + duration + 0.02);
    } catch {
      // Silence is fine.
    }
  }

  function noise(duration, volume, filterFreq) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    try {
      const len = Math.max(1, Math.floor(c.sampleRate * duration));
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = c.createGain();
      gain.gain.value = volume || 0.2;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // Silence is fine.
    }
  }

  // A short two-note bassline, stepped on a timer. Low-key, loops forever.
  const bassline = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 73.42, 0, 65.41, 0];

  const audio = {
    ensure,
    setMuted(value) {
      muted = !!value;
      if (master) master.gain.value = muted ? 0 : 0.25;
    },
    isMuted() {
      return muted;
    },
    pickup() {
      tone(880, 0.12, 'sine', 0.25, 1320);
    },
    punch() {
      noise(0.12, 0.3, 500);
      tone(120, 0.1, 'square', 0.15, 60);
    },
    shot() {
      noise(0.18, 0.35, 2500);
      tone(180, 0.12, 'sawtooth', 0.12, 50);
    },
    siren() {
      tone(660, 0.4, 'sine', 0.12, 880);
      setTimeout(() => tone(880, 0.4, 'sine', 0.12, 660), 400);
    },
    missionComplete() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        setTimeout(() => tone(f, 0.22, 'triangle', 0.25), i * 110);
      });
    },
    // Engine hum that follows speed (0..1). Call every frame; cheap.
    setEngine(speed01) {
      const c = ensure();
      if (!c) return;
      try {
        if (!engineOsc) {
          engineOsc = c.createOscillator();
          engineGain = c.createGain();
          engineOsc.type = 'sawtooth';
          engineOsc.frequency.value = 60;
          engineGain.gain.value = 0;
          const filter = c.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 400;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        const target = muted ? 0 : 0.03 + speed01 * 0.06;
        engineGain.gain.setTargetAtTime(target, c.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(60 + speed01 * 140, c.currentTime, 0.1);
      } catch {
        // Silence is fine.
      }
    },
    startMusic() {
      if (musicTimer !== null) return;
      const c = ensure();
      if (!c) return;
      musicStep = 0;
      musicTimer = setInterval(() => {
        if (muted || !ctx) return;
        const f = bassline[musicStep % bassline.length];
        musicStep += 1;
        if (f > 0) tone(f, 0.28, 'triangle', 0.12);
      }, 300);
    },
    stopMusic() {
      if (musicTimer !== null) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };
  return audio;
}
