// HUD: wanted stars, cash, health, objective, speed, the persistent
// wanted banner pill (repainted every frame from the live state), the
// 200x200 minimap, and the title / pause / game-over screens.
import { C } from './config.js';
import { missionMarker } from './missions.js';

export function createHud(S) {
  S.hud = {
    stars: document.getElementById('stars'),
    cash: document.getElementById('cash'),
    healthFill: document.getElementById('health-fill'),
    healthText: document.getElementById('health-text'),
    objective: document.getElementById('objective'),
    speed: document.getElementById('speed'),
    banner: document.getElementById('wanted-banner'),
    minimap: document.getElementById('minimap'),
    title: document.getElementById('title-screen'),
    pause: document.getElementById('pause-screen'),
    gameover: document.getElementById('gameover-screen'),
    gameoverTitle: document.getElementById('gameover-title'),
    gameoverStats: document.getElementById('gameover-stats'),
    missionName: document.getElementById('mission-name'),
  };
  const ctx = S.hud.minimap.getContext('2d');
  S.hud.minimapCtx = ctx;
}

function starsText(wanted) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < wanted ? '★' : '☆';
  return s;
}

export function repaintHud(S) {
  const h = S.hud;
  const p = S.player;
  const pol = S.police;
  const m = S.missions;
  h.stars.textContent = starsText(pol.wanted);
  h.cash.textContent = '$' + p.cash;
  const hp = Math.max(0, Math.round(p.health));
  h.healthFill.style.width = hp + '%';
  h.healthFill.style.background = hp > 50 ? '#3aa85a' : hp > 25 ? '#d8a83a' : '#c23a2a';
  h.healthText.textContent = hp + ' HP';
  h.objective.textContent = m.objective;
  const mph = Math.round((p.onFoot ? p.speed : (p.car ? Math.abs(p.car.speed) : 0)) * 2.23694);
  h.speed.textContent = mph + ' mph';
  h.missionName.textContent = m.index < 4 ? `Mission ${m.index + 1}: ${['First Wheels', 'The Package', 'Heat', 'The Big Score'][m.index]}` : 'Free roam';
  // The wanted banner always shows the current level and reason.
  if (pol.wanted > 0) {
    h.banner.style.display = 'block';
    h.banner.textContent = `Wanted level ${pol.wanted} ${starsText(pol.wanted)} — ${m.stage === 'escape' ? 'Escape' : 'Chase'}${pol.reason ? ' · ' + pol.reason : ''}`;
    h.banner.style.background = 'rgba(160,30,30,0.85)';
  } else {
    h.banner.style.display = 'block';
    h.banner.textContent = 'Wanted level 0 ☆☆☆☆☆ — Clean';
    h.banner.style.background = 'rgba(30,90,40,0.85)';
  }
}

export function drawMinimap(S) {
  const ctx = S.hud.minimapCtx;
  if (!ctx) return;
  const W = 200;
  const H = 200;
  const scale = W / 500;
  const toX = (x) => (x + 250) * scale;
  const toY = (z) => (z + 250) * scale;
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, W, H);
  // Water + beach along the north edge.
  ctx.fillStyle = '#2a7ab8';
  ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = '#e8d8a8';
  ctx.fillRect(0, 10, W, 5);
  // Roads.
  ctx.strokeStyle = '#5a5a62';
  ctx.lineWidth = 5;
  for (let r = -250; r <= 250; r += 50) {
    ctx.beginPath(); ctx.moveTo(toX(r), 0); ctx.lineTo(toX(r), H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toY(r)); ctx.lineTo(W, toY(r)); ctx.stroke();
  }
  // Named places.
  ctx.fillStyle = '#e8e0c8';
  ctx.font = '7px sans-serif';
  ctx.fillText("Rico's", toX(-175) - 10, toY(-75));
  ctx.fillText('Bank', toX(75) - 8, toY(75));
  ctx.fillText('Docks', toX(200) - 12, toY(-218));
  ctx.fillText('Safehouse', toX(-200) - 16, toY(200));
  // Cash pickups: gold dots.
  for (const pk of S.pickups) {
    if (pk.taken) continue;
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(toX(pk.x), toY(pk.z), 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // Mission marker: pulsing red diamond.
  const marker = missionMarker(S);
  if (marker) {
    const pulse = 4 + Math.sin(S.time * 4) * 1.5;
    ctx.fillStyle = '#ff3a3a';
    ctx.beginPath();
    ctx.moveTo(toX(marker.x), toY(marker.z) - pulse);
    ctx.lineTo(toX(marker.x) + pulse, toY(marker.z));
    ctx.lineTo(toX(marker.x), toY(marker.z) + pulse);
    ctx.lineTo(toX(marker.x) - pulse, toY(marker.z));
    ctx.closePath();
    ctx.fill();
  }
  // Traffic: yellow dots. Police: blue dots with a red ring.
  for (const c of S.cars) {
    if (c.kind === 'traffic') {
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath(); ctx.arc(toX(c.x), toY(c.z), 2, 0, Math.PI * 2); ctx.fill();
    } else if (c.kind === 'police') {
      ctx.fillStyle = '#3a7aff';
      ctx.beginPath(); ctx.arc(toX(c.x), toY(c.z), 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff3a3a';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(toX(c.x), toY(c.z), 4.5, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // Pedestrians: faint grey dots.
  ctx.fillStyle = 'rgba(200,200,200,0.7)';
  for (const ped of S.peds) {
    ctx.beginPath(); ctx.arc(toX(ped.x), toY(ped.z), 1.2, 0, Math.PI * 2); ctx.fill();
  }
  // Player: white triangle pointing along the facing.
  const p = S.player;
  const px = toX(p.x);
  const py = toY(p.z);
  const fx = Math.sin(p.angle);
  const fz = -Math.cos(p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px + fx * 6, py + fz * 6);
  ctx.lineTo(px - fz * 4 - fx * 4, py + fx * 4 - fz * 4);
  ctx.lineTo(px + fz * 4 - fx * 4, py - fx * 4 - fz * 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function showTitle(S, show) {
  S.hud.title.style.display = show ? 'flex' : 'none';
  document.getElementById('continue-btn').style.display = S.saveExists ? 'block' : 'none';
}

export function showPause(S, show) {
  S.hud.pause.style.display = show ? 'flex' : 'none';
}

export function showGameOver(S, kind) {
  const h = S.hud;
  h.gameoverTitle.textContent = kind;
  h.gameoverTitle.style.color = kind === 'WASTED' ? '#ff5a4a' : '#ffb84a';
  h.gameoverStats.textContent = `Cash $${S.player.cash} · Missions ${S.missions.missionsDone}/4 · Earned $${S.missions.totalEarned}`;
  h.gameover.style.display = 'flex';
  // The minimap keeps drawing under the overlay: repaint it once more
  // right now so the game-over screen never shows a black minimap.
  repaintHud(S);
  drawMinimap(S);
}

export function hideGameOver(S) {
  S.hud.gameover.style.display = 'none';
}
