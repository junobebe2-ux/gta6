// All sound is synthesised with WebAudio: no audio files, no network. An engine hum that
// follows the car's speed, a two-tone siren when police are near, and one-shot effects for
// gunshots, punches, pickups, crashes and mission jingles, over a quiet chord-pad music loop.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  // A small A-minor / F / C / G pad loop, one chord a bar, played very quietly.
  const CHORDS = [
    [110.0, 130.81, 164.81],
    [87.31, 130.81, 174.61],
    [130.81, 164.81, 196.0],
    [98.0, 146.83, 196.0],
  ];
  const BASS = [55.0, 43.65, 65.41, 49.0];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();

      musicTimer = window.setInterval(() => {
        if (!ctx || ctx.state !== 'running') return;
        const chord = CHORDS[musicStep % CHORDS.length];
        const bass = BASS[musicStep % BASS.length];
        const t = ctx.currentTime;
        for (const freq of chord) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = freq;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.045, t + 0.4);
          g.gain.linearRampToValueAtTime(0.0001, t + 1.9);
          o.connect(g);
          g.connect(master);
          o.start(t);
          o.stop(t + 2.0);
        }
        const b = ctx.createOscillator();
        b.type = 'triangle';
        b.frequency.value = bass;
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.0001, t);
        bg.gain.linearRampToValueAtTime(0.07, t + 0.2);
        bg.gain.linearRampToValueAtTime(0.0001, t + 1.9);
        b.connect(bg);
        bg.connect(master);
        b.start(t);
        b.stop(t + 2.0);
        musicStep += 1;
      }, 2000);
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!ensure() || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 3000;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** speed01: 0..1 of the car's top speed; 0 silences the engine. */
    setEngine(speed01) {
      if (!ctx) return;
      const target = speed01 <= 0.01 ? 0 : 0.05 + speed01 * 0.06;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      const f = 55 + speed01 * 130;
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(f / 2, ctx.currentTime, 0.08);
    },
    /** on: police are close enough to hear. */
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
      if (on) sirenOsc.frequency.setTargetAtTime(750 + 220 * Math.sin(ctx.currentTime * 4.2), ctx.currentTime, 0.05);
    },
    gunshot() {
      noise(0.14, 0.5, 2400);
      blip(160, 0.12, 'square', 0.25, 60);
    },
    punch() {
      noise(0.08, 0.3, 900);
    },
    crash() {
      noise(0.25, 0.4, 700);
      blip(90, 0.25, 'sine', 0.3, 45);
    },
    pickup() {
      blip(660, 0.1, 'sine', 0.22);
      window.setTimeout(() => blip(990, 0.14, 'sine', 0.22), 90);
    },
    explosion() {
      noise(0.7, 0.6, 500);
      blip(70, 0.6, 'sine', 0.4, 30);
    },
    wantedUp() {
      blip(520, 0.12, 'square', 0.16);
      window.setTimeout(() => blip(392, 0.18, 'square', 0.16), 120);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
    },
    busted() {
      [392, 330, 262].forEach((f, i) => window.setTimeout(() => blip(f, 0.3, 'sawtooth', 0.16), i * 160));
    },
  };
}
