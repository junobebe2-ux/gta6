// Full HUD for Solmar City: wanted stars, cash, health, objective, speed,
// the wanted banner pill repainted every frame, a 200x200 minimap canvas,
// and the title / pause / game-over screens.
import { CONFIG } from './config.js';
import { loadSave } from './save.js';

export function createHud() {
  const byId = (id) => document.getElementById(id);
  const starsEl = byId('stars');
  const cashEl = byId('cash');
  const healthLabelEl = byId('health-label');
  const healthFillEl = byId('health-fill');
  const wantedEl = byId('wanted');
  const speedEl = byId('speed');
  const objectiveEl = byId('objective');
  const hudEl = byId('hud');
  const minimap = byId('minimap');
  const titleScreen = byId('title-screen');
  const pauseScreen = byId('pause-screen');
  const gameoverScreen = byId('gameover-screen');
  const gameoverTitle = byId('gameover-title');
  const btnStart = byId('btn-start');
  const btnContinue = byId('btn-continue');
  const continueLabel = byId('continue-label');
  const btnResume = byId('btn-resume');
  const btnRestart = byId('btn-restart');
  if (minimap) {
    minimap.width = 200;
    minimap.height = 200;
  }
  const mctx = minimap ? minimap.getContext('2d') : null;
  let actions = {};
  let bound = false;

  function refreshContinue() {
    let save = null;
    try {
      save = loadSave();
    } catch (e) {
      save = null;
    }
    if (save && btnContinue) {
      btnContinue.style.display = '';
      if (continueLabel) {
        continueLabel.textContent =
          'Continue — $' + (save.cash || 0) + ' · ' + (save.missionsDone || 0) + ' missions done';
      }
    } else if (btnContinue) {
      btnContinue.style.display = 'none';
    }
  }

  function showScreen(name) {
    if (titleScreen) titleScreen.style.display = name === 'title' ? '' : 'none';
    if (pauseScreen) pauseScreen.style.display = name === 'pause' ? '' : 'none';
    if (gameoverScreen) gameoverScreen.style.display = name === 'gameover' ? '' : 'none';
    if (hudEl) hudEl.style.display = name === 'title' ? 'none' : '';
    if (name === 'title') refreshContinue();
  }

  function setGameOverTitle(kind) {
    if (gameoverTitle) gameoverTitle.textContent = kind;
  }

  function bind(next) {
    actions = next || {};
    if (bound) return;
    bound = true;
    if (btnStart) btnStart.addEventListener('click', () => actions.onStart && actions.onStart());
    if (btnContinue) btnContinue.addEventListener('click', () => actions.onContinue && actions.onContinue());
    if (btnResume) btnResume.addEventListener('click', () => actions.onResume && actions.onResume());
    if (btnRestart) btnRestart.addEventListener('click', () => actions.onRestart && actions.onRestart());
  }

  function starsText(wanted) {
    const max = CONFIG.wantedMax || 5;
    let s = '';
    for (let i = 0; i < max; i++) s += i < wanted ? '★' : '☆';
    return s;
  }

  function repaint(state) {
    const wanted = state.wanted || 0;
    const stars = starsText(wanted);
    if (starsEl) starsEl.textContent = stars;
    if (cashEl) cashEl.textContent = '$' + (state.cash || 0).toLocaleString('en-US');
    if (healthLabelEl) healthLabelEl.textContent = 'Health ' + Math.max(0, Math.round(state.health || 0));
    if (healthFillEl) healthFillEl.style.width = Math.max(0, Math.min(100, state.health || 0)) + '%';
    if (wantedEl) {
      if (wanted > 0) {
        wantedEl.textContent = 'Wanted level ' + wanted + ' ' + stars + ' — ' + (state.wantedReason || 'Lay low');
        wantedEl.style.background = '#b91c1c';
        wantedEl.style.color = '#fff';
      } else {
        wantedEl.textContent = 'No heat — stay clean';
        wantedEl.style.background = '#14532d';
        wantedEl.style.color = '#bbf7d0';
      }
    }
    if (speedEl) speedEl.textContent = Math.round((state.speed || 0) * 2.237) + ' mph';
    if (objectiveEl) objectiveEl.textContent = state.objective || '';
  }

  function unitPos(u) {
    if (!u) return null;
    if (typeof u.x === 'number' && typeof u.z === 'number') return { x: u.x, z: u.z };
    if (u.mesh && u.mesh.position) return { x: u.mesh.position.x, z: u.mesh.position.z };
    if (u.pos && typeof u.pos.x === 'number') return { x: u.pos.x, z: u.pos.z };
    return null;
  }

  function drawMinimap(ctx) {
    if (!mctx || !minimap) return;
    const world = CONFIG.worldSize || 500;
    const S = 200 / world;
    const half = world / 2;
    const toX = (x) => (x + half) * S;
    const toY = (z) => (z + half) * S;
    const state = ctx.state;
    mctx.fillStyle = '#0b1520';
    mctx.fillRect(0, 0, 200, 200);
    const beach = ctx.city.places.beach;
    mctx.fillStyle = '#1d4e89';
    if (beach && beach.z > 0) mctx.fillRect(0, 200 - 14, 200, 14);
    else if (beach) mctx.fillRect(0, 0, 200, 14);
    const spacing = CONFIG.roadSpacing || 100;
    mctx.strokeStyle = '#2c3e50';
    mctx.lineWidth = 3;
    for (let g = -half; g <= half + 1; g += spacing) {
      mctx.beginPath();
      mctx.moveTo(toX(g), 0);
      mctx.lineTo(toX(g), 200);
      mctx.stroke();
      mctx.beginPath();
      mctx.moveTo(0, toY(g));
      mctx.lineTo(200, toY(g));
      mctx.stroke();
    }
    for (const item of ctx.pickups.items) {
      if (item.collected) continue;
      mctx.fillStyle = '#f5c542';
      mctx.beginPath();
      mctx.arc(toX(item.x), toY(item.z), 2.5, 0, Math.PI * 2);
      mctx.fill();
    }
    const playerCar = ctx.vehicles.playerCar;
    for (const car of ctx.vehicles.cars) {
      if (car === playerCar) continue;
      mctx.fillStyle = '#9aa5b1';
      mctx.fillRect(toX(car.x) - 2, toY(car.z) - 2, 4, 4);
    }
    mctx.fillStyle = '#ef4444';
    for (const car of ctx.police.cars) {
      const p = unitPos(car);
      if (!p) continue;
      mctx.fillRect(toX(p.x) - 2.5, toY(p.z) - 2.5, 5, 5);
    }
    for (const cop of ctx.police.cops) {
      const p = unitPos(cop);
      if (!p) continue;
      mctx.beginPath();
      mctx.arc(toX(p.x), toY(p.z), 2, 0, Math.PI * 2);
      mctx.fill();
    }
    const marker = state.missionMarker;
    if (marker) {
      const pulse = 5 + 2 * Math.sin(performance.now() / 250);
      const mx = toX(marker.x);
      const my = toY(marker.z);
      mctx.fillStyle = '#facc15';
      mctx.beginPath();
      mctx.moveTo(mx, my - pulse);
      mctx.lineTo(mx + pulse, my);
      mctx.lineTo(mx, my + pulse);
      mctx.lineTo(mx - pulse, my);
      mctx.closePath();
      mctx.fill();
    }
    const heading =
      ctx.vehicles.isDriving() && ctx.vehicles.playerCar ? ctx.vehicles.playerCar.heading : ctx.player.heading;
    const px = toX(state.playerX || 0);
    const py = toY(state.playerZ || 0);
    const dx = Math.sin(heading);
    const dz = Math.cos(heading);
    const tipX = px + dx * 7;
    const tipY = py + dz * 7;
    const leftX = px - dz * 4 - dx * 4;
    const leftY = py + dx * 4 - dz * 4;
    const rightX = px + dz * 4 - dx * 4;
    const rightY = py - dx * 4 - dz * 4;
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(tipX, tipY);
    mctx.lineTo(leftX, leftY);
    mctx.lineTo(rightX, rightY);
    mctx.closePath();
    mctx.fill();
    mctx.strokeStyle = '#0b1520';
    mctx.lineWidth = 1;
    mctx.stroke();
  }

  return { bind, showScreen, setGameOverTitle, refreshContinue, repaint, drawMinimap };
}
