// WebAudio-synthesised sound effects plus a simple music loop. Everything
// is guarded: in a headless browser (or without user gesture) audio may be
// silent, and that must never throw.
export function createAudio() {
  const a = { ctx: null, master: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null, musicTimer: null, musicStep: 0, enabled: false };
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return a;
    a.ctx = new AC();
    a.master = a.ctx.createGain();
    a.master.gain.value = 0.25;
    a.master.connect(a.ctx.destination);
    a.engineOsc = a.ctx.createOscillator();
    a.engineOsc.type = 'sawtooth';
    a.engineOsc.frequency.value = 50;
    a.engineGain = a.ctx.createGain();
    a.engineGain.gain.value = 0;
    a.engineOsc.connect(a.engineGain);
    a.engineGain.connect(a.master);
    a.engineOsc.start();
    a.sirenOsc = a.ctx.createOscillator();
    a.sirenOsc.type = 'sine';
    a.sirenOsc.frequency.value = 700;
    a.sirenGain = a.ctx.createGain();
    a.sirenGain.gain.value = 0;
    a.sirenOsc.connect(a.sirenGain);
    a.sirenGain.connect(a.master);
    a.sirenOsc.start();
    a.enabled = true;
  } catch {
    a.enabled = false;
  }
  return a;
}

function tone(a, freq, dur, type, vol, when = 0) {
  if (!a.enabled || !a.ctx) return;
  try {
    const t0 = a.ctx.currentTime + when;
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(a.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch { /* silent */ }
}

function noise(a, dur, vol) {
  if (!a.enabled || !a.ctx) return;
  try {
    const len = Math.floor(a.ctx.sampleRate * dur);
    const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    const g = a.ctx.createGain();
    g.gain.value = vol || 0.2;
    src.connect(g);
    g.connect(a.master);
    src.start();
  } catch { /* silent */ }
}

export function sfxPickup(a) { tone(a, 880, 0.12, 'sine', 0.25); tone(a, 1320, 0.15, 'sine', 0.2, 0.08); }
export function sfxPunch(a) { noise(a, 0.12, 0.3); tone(a, 120, 0.1, 'square', 0.15); }
export function sfxShot(a) { noise(a, 0.18, 0.35); }
export function sfxMission(a) {
  tone(a, 523, 0.15, 'triangle', 0.25);
  tone(a, 659, 0.15, 'triangle', 0.25, 0.12);
  tone(a, 784, 0.3, 'triangle', 0.25, 0.24);
}
export function sfxBusted(a) { tone(a, 220, 0.5, 'sawtooth', 0.2); tone(a, 165, 0.6, 'sawtooth', 0.2, 0.3); }

export function updateAudio(a, S, dt) {
  if (!a.enabled || !a.ctx) return;
  try {
    if (a.ctx.state === 'suspended') a.ctx.resume().catch(() => {});
    const speed = S.player.onFoot ? S.player.speed : (S.player.car ? Math.abs(S.player.car.speed) : 0);
    a.engineGain.gain.value = S.mode === 'playing' ? 0.02 + Math.min(0.06, speed * 0.002) : 0;
    a.engineOsc.frequency.value = 50 + speed * 4;
    // Siren: two-tone wail while wanted, alternating with the clock.
    if (S.police.wanted > 0 && S.mode === 'playing') {
      a.sirenGain.gain.value = 0.05;
      a.sirenOsc.frequency.value = (Math.floor(S.time * 2) % 2 === 0) ? 700 : 950;
    } else {
      a.sirenGain.gain.value = 0;
    }
    // Simple music loop: a lazy bassline, one note per beat.
    if (S.mode === 'playing') {
      a.musicTimer = (a.musicTimer || 0) + dt;
      if (a.musicTimer > 0.45) {
        a.musicTimer = 0;
        const scale = [110, 110, 130.8, 98, 110, 146.8, 130.8, 98];
        tone(a, scale[a.musicStep % scale.length], 0.4, 'triangle', 0.06);
        a.musicStep++;
      }
    }
  } catch { /* silent */ }
}
