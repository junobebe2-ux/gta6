// The HUD: health bar, cash, wanted stars and the live wanted line, the mission
// objective, speed, the prompt, the message feed, and a canvas minimap. Everything
// is DOM except the minimap. The game hands state in; this module paints it.
import { CITY } from './config.js';

export function createHud(city) {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const healthText = el('health-text');
  const cashText = el('cash');
  const pickupsEl = el('pickups');
  const wantedEl = el('wanted');
  const starsEl = el('stars');
  const objectiveEl = el('objective');
  const speedEl = el('speed');
  const promptEl = el('prompt');
  const bannerEl = el('banner');
  const feedEl = el('feed');
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  const mapSize = minimap.width;
  const mapScale = mapSize / (CITY.bound * 2 + 140);
  const toMap = (x, z) => [(x + CITY.bound + 70) * mapScale, (z + CITY.bound + 70) * mapScale];
  let bannerTimer = null;
  let shownStars = -1;

  function paintGround() {
    mctx.clearRect(0, 0, mapSize, mapSize);
    mctx.fillStyle = '#10151c';
    mctx.fillRect(0, 0, mapSize, mapSize);
    // Beach on the east edge, water past it.
    const [beachX] = toMap(CITY.bound, 0);
    mctx.fillStyle = '#c8b078';
    mctx.fillRect(beachX, 0, mapSize - beachX, mapSize);
    mctx.fillStyle = '#2f7fb8';
    mctx.fillRect(beachX + (mapSize - beachX) * 0.45, 0, mapSize - beachX, mapSize);
    // Roads as dark strokes.
    mctx.strokeStyle = '#3a3f46';
    mctx.lineWidth = Math.max(2, 12 * mapScale);
    for (const c of city.roads) {
      const [vx] = toMap(c, 0);
      mctx.beginPath();
      mctx.moveTo(vx, 0);
      mctx.lineTo(vx, mapSize);
      mctx.stroke();
      const [, hz] = toMap(0, c);
      mctx.beginPath();
      mctx.moveTo(0, hz);
      mctx.lineTo(mapSize, hz);
      mctx.stroke();
    }
    // Buildings as pale blocks.
    mctx.fillStyle = '#5a6270';
    for (const b of city.colliders) {
      const [x1, z1] = toMap(b.minX, b.minZ);
      const [x2, z2] = toMap(b.maxX, b.maxZ);
      mctx.fillRect(x1, z1, Math.max(1, x2 - x1), Math.max(1, z2 - z1));
    }
  }

  function paintMarkers(state, t) {
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
    // Cash pickups: small gold dots.
    if (state.pickupPositions) {
      mctx.fillStyle = '#ffd23e';
      for (const p of state.pickupPositions) {
        const [px, pz] = toMap(p.x, p.z);
        mctx.beginPath();
        mctx.arc(px, pz, 2, 0, Math.PI * 2);
        mctx.fill();
      }
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

  function paintMinimap(state, t) {
    paintGround();
    paintMarkers(state, t);
  }

  return {
    update(state, t) {
      const hp = Math.max(0, Math.min(100, state.health));
      healthFill.style.width = `${hp}%`;
      healthFill.style.background = state.health > 50 ? '#4caf50' : state.health > 25 ? '#ff9800' : '#f44336';
      healthText.textContent = `${Math.ceil(state.health)}`;
      cashText.textContent = `$${state.cash.toLocaleString('en-US')}`;
      pickupsEl.textContent = state.pickups > 0 ? `Cash found: ${state.pickups}` : '';
      // The wanted line is live: it always shows the current level and the last
      // reason, so it can never go stale while the stars change underneath it.
      if (state.wanted > 0) {
        wantedEl.style.display = 'block';
        wantedEl.textContent = `Wanted level ${state.wanted}` + (state.wantedReason ? ` — ${state.wantedReason}` : '');
      } else {
        wantedEl.style.display = 'none';
      }
      if (state.wanted !== shownStars) {
        shownStars = state.wanted;
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
      paintMinimap(state, t);
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
