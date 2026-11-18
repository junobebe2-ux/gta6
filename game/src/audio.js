// Every sound is synthesised with WebAudio — no audio files, no network. A low engine
// hum that follows the car's speed, a two-tone siren when police are close, one-shot
// effects for shots, punches, crashes, pickups and mission jingles, over a quiet
// chord-pad music loop.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  // One chord a bar, played very quietly: Am, F, C, G.
  const CHORDS = [
    [110.0, 130.81, 164.81],
    [87.31, 130.81, 174.61],
    [130.81, 164.81, 196.0],
    [98.0, 146.83, 196.0],
  ];
  const BASS = [55.0, 43.65, 65.41, 49.0];

  function startMusic() {
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
  }

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc.connect(engineFilter);
      engineOsc.start();
      engineSub = ctx.createOscillator();
      engineSub.type = 'square';
      engineSub.frequency.value = 28;
      engineSub.connect(engineFilter);
      engineSub.start();

      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();

      startMusic();
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

  function noise(dur, vol, cutoff) {
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
    filter.frequency.value = cutoff || 3000;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  function jingle(freqs, gap, dur, type, vol) {
    freqs.forEach((f, i) => window.setTimeout(() => blip(f, dur, type, vol), i * gap));
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
      engineSub.frequency.setTargetAtTime(f / 2, ctx.currentTime, 0.08);
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
      jingle([523, 659, 784, 1047], 110, 0.22, 'triangle', 0.22);
    },
    busted() {
      jingle([392, 330, 262], 160, 0.3, 'sawtooth', 0.16);
    },
  };
}
