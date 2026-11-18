// The HUD: health, cash, wanted stars, the mission objective, speed, a canvas minimap and
// the message feed, all DOM except the minimap. The game writes state in; this module paints it.
import { CITY } from './config.js';

export function createHud(city) {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const healthText = el('health-text');
  const cashText = el('cash');
  const starsEl = el('stars');
  const objectiveEl = el('objective');
  const speedEl = el('speed');
  const promptEl = el('prompt');
  const bannerEl = el('banner');
  const feedEl = el('feed');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  const size = minimap.width;
  const scale = size / (CITY.bound * 2 + 140);
  const toMap = (x, z) => [(x + CITY.bound + 70) * scale, (z + CITY.bound + 70) * scale];
  let bannerTimer = null;
  let lastStars = -1;

  function drawMinimap(state, t) {
    const w = size;
    mctx.clearRect(0, 0, w, w);
    mctx.fillStyle = '#10151c';
    mctx.fillRect(0, 0, w, w);
    // Beach on the east edge.
    const [bx] = toMap(CITY.bound, 0);
    mctx.fillStyle = '#c8b078';
    mctx.fillRect(bx, 0, w - bx, w);
    mctx.fillStyle = '#2f7fb8';
    mctx.fillRect(bx + (w - bx) * 0.45, 0, w - bx, w);
    // Roads.
    mctx.strokeStyle = '#3a3f46';
    mctx.lineWidth = Math.max(2, 12 * scale);
    for (const c of city.roads) {
      const [x1] = toMap(c, 0);
      mctx.beginPath();
      mctx.moveTo(x1, 0);
      mctx.lineTo(x1, w);
      mctx.stroke();
      const [, z1] = toMap(0, c);
      mctx.beginPath();
      mctx.moveTo(0, z1);
      mctx.lineTo(w, z1);
      mctx.stroke();
    }
    // Buildings as pale blocks.
    mctx.fillStyle = '#5a6270';
    for (const b of city.colliders) {
      const [x1, z1] = toMap(b.minX, b.minZ);
      const [x2, z2] = toMap(b.maxX, b.maxZ);
      mctx.fillRect(x1, z1, Math.max(1, x2 - x1), Math.max(1, z2 - z1));
    }
    // Mission target: a pulsing yellow diamond.
    if (state.missionTarget) {
      const [mx, mz] = toMap(state.missionTarget.x, state.missionTarget.z);
      const r = 5 + Math.sin(t * 5) * 2;
      mctx.fillStyle = '#ffc832';
      mctx.beginPath();
      mctx.moveTo(mx, mz - r);
      mctx.lineTo(mx + r, mz);
      mctx.lineTo(mx, mz + r);
      mctx.lineTo(mx - r, mz);
      mctx.closePath();
      mctx.fill();
    }
    // Traffic cars: white dots. Police: flashing blue/red.
    for (const car of state.cars) {
      if (!car.alive) continue;
      const [cx, cz] = toMap(car.x, car.z);
      mctx.fillStyle = car.isPolice ? (Math.sin(t * 10) > 0 ? '#3a86ff' : '#ff2a1a') : '#e8e8e8';
      mctx.beginPath();
      mctx.arc(cx, cz, car.isPolice ? 3 : 2, 0, Math.PI * 2);
      mctx.fill();
    }
    // The player: a yellow arrow, rotated to face their heading.
    const [px, pz] = toMap(state.x, state.z);
    mctx.save();
    mctx.translate(px, pz);
    mctx.rotate(state.heading);
    mctx.fillStyle = '#ffd23e';
    mctx.beginPath();
    mctx.moveTo(0, -6);
    mctx.lineTo(4.5, 5);
    mctx.lineTo(0, 2.5);
    mctx.lineTo(-4.5, 5);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  return {
    update(state, t) {
      healthFill.style.width = `${Math.max(0, Math.min(100, state.health))}%`;
      healthFill.style.background = state.health > 50 ? '#4caf50' : state.health > 25 ? '#ff9800' : '#f44336';
      healthText.textContent = `${Math.ceil(state.health)}`;
      cashText.textContent = `$${state.cash.toLocaleString('en-US')}`;
      if (state.wanted !== lastStars) {
        lastStars = state.wanted;
        starsEl.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
        starsEl.classList.toggle('hot', state.wanted >= 3);
      }
      objectiveEl.textContent = state.objective;
      if (state.inCar) {
        speedEl.style.display = 'block';
        speedEl.textContent = `${Math.round(Math.abs(state.speed) * 3.6)} km/h`;
      } else {
        speedEl.style.display = 'none';
      }
      promptEl.textContent = state.prompt || '';
      promptEl.style.display = state.prompt ? 'block' : 'none';
      drawMinimap(state, t);
    },
    message(text) {
      const div = document.createElement('div');
      div.className = 'feed-line';
      div.textContent = text;
      feedEl.appendChild(div);
      while (feedEl.children.length > 4) feedEl.removeChild(feedEl.firstChild);
      window.setTimeout(() => {
        div.classList.add('fade');
        window.setTimeout(() => div.remove(), 600);
      }, 3800);
    },
    banner(text, sub) {
      bannerEl.innerHTML = '';
      const main = document.createElement('div');
      main.className = 'banner-main';
      main.textContent = text;
      bannerEl.appendChild(main);
      if (sub) {
        const s = document.createElement('div');
        s.className = 'banner-sub';
        s.textContent = sub;
        bannerEl.appendChild(s);
      }
      bannerEl.classList.remove('show');
      void bannerEl.offsetWidth;
      bannerEl.classList.add('show');
      if (bannerTimer) window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => bannerEl.classList.remove('show'), 2600);
    },
  };
}
