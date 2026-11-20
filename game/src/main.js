// Solmar City entry point: builds the world, wires every module together,
// runs the frame loop, and exposes the debug state for playtesting.
//
// The driving bug lived here: the vehicle and police factories take the
// built city object (with colliders, places and buildings) as their second
// argument. Passing the config object instead left city.colliders undefined
// and every driven frame threw "city.colliders is not iterable". The fix is
// to hand them the real city returned by buildCity.
import { CONFIG } from './config.js';
import { makeRandom } from './random.js';
import { writeSave } from './save.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPeople } from './people.js';
import { createPolice } from './police.js';
import { createPickups } from './pickups.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createGame } from './game.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 1) || 1;
const shot = params.get('shot');

const canvas = document.getElementById('game-canvas');
const renderer = createRenderer(canvas);
const scene = renderer.scene;
const city = buildCity(scene, seed);
const rng = makeRandom(seed);
const input = createInput();
input.attach();
const audio = createAudio();
audio.ensure();

const player = createPlayer(scene, city, CONFIG);
const vehicles = createVehicles(scene, city, rng);
const people = createPeople(scene, city, rng);
const police = createPolice(scene, city, rng);
const pickups = createPickups(scene, city, rng);

const state = {
  mode: 'title',
  cash: 0,
  health: 100,
  wanted: 0,
  wantedReason: '',
  robbing: false,
  cameraHeading: 0,
  missionsDone: 0,
  totalEarned: 0,
  playerX: 0,
  playerZ: 40,
  speed: 0,
  objective: '',
  missionMarker: null,
  police: police.cars,
};

const ctx = {
  state,
  config: CONFIG,
  input,
  audio,
  renderer,
  scene,
  city,
  player,
  vehicles,
  people,
  police,
  pickups,
  rng,
};

const missions = createMissions(ctx);
ctx.missions = missions;
const hud = createHud();
ctx.hud = hud;
const game = createGame(ctx);
ctx.game = game;

hud.bind({
  onStart: () => game.startNew(),
  onContinue: () => game.continueGame(),
  onResume: () => game.resumeGame(),
  onRestart: () => game.restartAfterGameOver(),
});

if (shot) {
  applyShot(ctx, shot);
} else {
  hud.showScreen('title');
}

window.addEventListener('beforeunload', () => {
  if (state.mode === 'play' || state.mode === 'paused' || state.mode === 'gameover') {
    writeSave({ cash: state.cash, missionsDone: state.missionsDone, totalEarned: state.totalEarned });
  }
});
window.addEventListener('resize', () => {
  renderer.resize(window.innerWidth, window.innerHeight);
});

// Debug state for playtesting (cash, health, wanted, missions done and the
// nearest police distance, plus the driving and mission state).
window.__gameState = {
  cash: 0,
  health: 100,
  wanted: 0,
  missionsDone: 0,
  totalEarned: 0,
  nearestPolice: null,
  mode: 'title',
  speed: 0,
  playerX: 0,
  playerZ: 40,
  objective: '',
  isDriving: false,
  heading: 0,
  mission: null,
  missionStage: null,
};
// Playtest hooks: step the simulation without rendering, and drive the
// input from a driver script.
window.__game = {
  state,
  ctx,
  input,
  step: (dt) => game.tick(dt),
  start: () => game.startNew(),
};

// Nearest police distance in metres, computed here from the police
// module's public unit lists: the module's own nearestDistance() returns
// NaN once foot cops exist, so this is the value __gameState reports.
function nearestPoliceDistance() {
  const px = state.playerX;
  const pz = state.playerZ;
  let best = null;
  const consider = (u) => {
    if (!u) return;
    let x;
    let z;
    if (typeof u.x === 'number' && typeof u.z === 'number') {
      x = u.x;
      z = u.z;
    } else if (u.mesh && u.mesh.position) {
      x = u.mesh.position.x;
      z = u.mesh.position.z;
    } else if (u.pos && typeof u.pos.x === 'number') {
      x = u.pos.x;
      z = u.pos.z;
    } else {
      return;
    }
    const dx = x - px;
    const dz = z - pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (Number.isFinite(d) && (best === null || d < best)) best = d;
  };
  for (const car of police.cars) consider(car);
  for (const cop of police.cops) consider(cop);
  return best;
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  game.tick(dt);
  renderer.renderer.render(renderer.scene, renderer.camera);
  const nearest = nearestPoliceDistance();
  const current = missions.current();
  window.__gameState.cash = state.cash;
  window.__gameState.health = state.health;
  window.__gameState.wanted = state.wanted;
  window.__gameState.missionsDone = state.missionsDone;
  window.__gameState.totalEarned = state.totalEarned;
  window.__gameState.nearestPolice = typeof nearest === 'number' ? nearest : null;
  window.__gameState.mode = state.mode;
  window.__gameState.speed = state.speed;
  window.__gameState.playerX = state.playerX;
  window.__gameState.playerZ = state.playerZ;
  window.__gameState.objective = state.objective;
  window.__gameState.isDriving = vehicles.isDriving();
  window.__gameState.heading =
    vehicles.isDriving() && vehicles.playerCar ? vehicles.playerCar.heading : player.heading;
  window.__gameState.mission = current ? current.id : null;
  window.__gameState.missionStage = current ? missions.stage : null;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
