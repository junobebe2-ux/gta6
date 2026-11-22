// The main loop: wires every module together, owns the mode machine
// (title / playing / paused / gameover), and exposes the debug state
// objects the playtests read (window.__solmarState, window.__gameState).
import { C } from './config.js';
import { mulberry32 } from './random.js';
import { createInput } from './input.js';
import { createAudio, updateAudio, sfxBusted } from './audio.js';
import { createRender, updateCamera } from './render.js';
import { createCity } from './city.js';
import { spawnTrafficCars, stepPlayerCar, stepTraffic, integrateCars, resolveCarCollisions, exitCar } from './vehicles.js';
import { createPlayerMesh, spawnPeds, stepPlayerOnFoot, stepPeds } from './people.js';
import { createPolice, stepPolice, nearestPolice } from './police.js';
import { createMissions, stepMissions } from './missions.js';
import { spawnPickups, stepPickups } from './pickups.js';
import { createHud, repaintHud, drawMinimap, showTitle, showPause, showGameOver, hideGameOver } from './hud.js';
import { loadSave, writeSave, hasSave } from './save.js';

export function createState(seed) {
  const S = {
    seed: seed ?? C.seed,
    time: 0,
    mode: 'title',
    gameOver: null,
    gameOverShown: false,
    cameraSnap: false,
    shotCamera: false,
    saveExists: false,
    saveTimer: 0,
    cars: [],
    peds: [],
    pickups: [],
    clouds: [],
    buildings: [],
  };
  S.rng = mulberry32(S.seed);
  S.input = createInput();
  S.audio = createAudio();
  S.render = createRender();
  S.renderer = S.render.renderer;
  S.player = {
    x: 0, z: 0, angle: 0, speed: 0,
    onFoot: true, car: null, health: C.playerHealth, cash: 0,
    mesh: null, bumpSet: new Set(),
  };
  createCity(S);
  S.player.mesh = createPlayerMesh(S);
  spawnTrafficCars(S);
  spawnPeds(S);
  createPolice(S);
  createMissions(S);
  spawnPickups(S);
  createHud(S);
  S.saveExists = hasSave();
  return S;
}

function resetRun(S, save) {
  // Remove every police car and foot cop from the previous run.
  for (const car of [...S.police.cars]) {
    S.render.scene.remove(car.mesh);
    const i = S.cars.indexOf(car);
    if (i >= 0) S.cars.splice(i, 1);
  }
  S.police.cars.length = 0;
  for (const cop of [...S.police.cops]) S.render.scene.remove(cop.mesh);
  S.police.cops.length = 0;
  S.police.wanted = 0;
  S.police.reason = '';
  S.police.decayTimer = 0;
  S.police.escapeTimer = 0;
  // The player's car becomes a parked car again.
  if (S.player.car) {
    S.player.car.parked = true;
    S.player.car.speed = 0;
  }
  S.player.x = 0;
  S.player.z = 0;
  S.player.angle = 0;
  S.player.speed = 0;
  S.player.onFoot = true;
  S.player.car = null;
  S.player.health = C.playerHealth;
  S.player.cash = save ? save.cash : 0;
  S.player.mesh.visible = true;
  S.missions.missionsDone = save ? save.missionsDone : 0;
  S.missions.totalEarned = save ? save.totalEarned : 0;
  S.missions.index = save ? save.missionIndex : 0;
  S.missions.holdT = 0;
  S.missions.m2Timer = 0;
  const idx = S.missions.index;
  if (idx === 0) { S.missions.stage = 'steal'; S.missions.objective = 'Steal a car — press E near a car'; }
  else if (idx === 1) { S.missions.stage = 'pickup'; S.missions.objective = 'Pick up the package at Rico\'s Garage'; }
  else if (idx === 2) { S.missions.stage = 'raise'; S.missions.objective = 'Raise your wanted level to 3 stars'; }
  else if (idx === 3) { S.missions.stage = 'drive'; S.missions.objective = 'Drive to the Bank'; }
  else { S.missions.stage = 'done'; S.missions.objective = 'All missions complete — free roam'; }
  for (const pk of S.pickups) {
    pk.taken = false;
    pk.respawnT = 0;
    pk.mesh.visible = true;
  }
  S.gameOver = null;
  S.gameOverShown = false;
  S.cameraSnap = true;
  S.mode = 'playing';
  showTitle(S, false);
  showPause(S, false);
  hideGameOver(S);
  repaintHud(S);
  drawMinimap(S);
}

export function startLoop(S) {
  window.__solmarState = S;
  window.__gameState = {};
  S.input.attach();
  document.getElementById('new-game-btn').addEventListener('click', () => resetRun(S, null));
  document.getElementById('continue-btn').addEventListener('click', () => {
    const save = loadSave();
    if (save) resetRun(S, save);
  });
  document.getElementById('restart-btn').addEventListener('click', () => resetRun(S, null));
  document.getElementById('resume-btn').addEventListener('click', () => {
    S.mode = 'playing';
    showPause(S, false);
  });

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    // The time step never goes negative (a throttled first frame must
    // not run the clock backwards) and is capped so a slow frame cannot
    // teleport the simulation.
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    S.time += dt;
    step(S, dt);
    S.input.endFrame();
  }
  requestAnimationFrame(frame);
}

function step(S, dt) {
  const inp = S.input;
  // Pause toggle.
  if ((inp.pressed.has('Escape') || inp.pressed.has('KeyP')) && (S.mode === 'playing' || S.mode === 'paused')) {
    S.mode = S.mode === 'playing' ? 'paused' : 'playing';
    showPause(S, S.mode === 'paused');
  }
  if (S.mode === 'playing') {
    // E: enter a car on foot, exit the car while driving.
    if (inp.pressed.has('KeyE')) {
      if (S.player.onFoot) {
        // (handled in stepPlayerOnFoot)
      } else {
        exitCar(S);
        inp.pressed.delete('KeyE');
      }
    }
    stepPlayerOnFoot(S, dt);
    if (!S.player.onFoot) stepPlayerCar(S, dt);
    stepTraffic(S, dt);
    stepPeds(S, dt);
    stepPolice(S, dt);
    stepMissions(S, dt);
    stepPickups(S, dt);
    // The player's car mesh is hidden while driving; the walker shows
    // on foot.
    S.player.mesh.visible = S.player.onFoot;
    resolveCarCollisions(S);
    integrateCars(S);
    // Clouds drift.
    for (const c of S.clouds) {
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > 280) c.group.position.x = -280;
    }
    // Wasted: health hit zero.
    if (S.player.health <= 0 && S.mode === 'playing') {
      S.gameOver = 'WASTED';
      S.mode = 'gameover';
      sfxBusted(S.audio);
    }
    // Periodic save.
    S.saveTimer += dt;
    if (S.saveTimer >= C.saveInterval) {
      S.saveTimer = 0;
      writeSave(S);
    }
  }
  if (S.mode === 'gameover' && !S.gameOverShown) {
    S.gameOverShown = true;
    writeSave(S);
    showGameOver(S, S.gameOver || 'WASTED');
  }
  updateCamera(S, dt);
  updateAudio(S.audio, S, dt);
  repaintHud(S);
  drawMinimap(S);
  // The debug state objects, refreshed every frame.
  const p = S.player;
  window.__gameState = {
    cash: p.cash,
    health: Math.max(0, Math.round(p.health)),
    wanted: S.police.wanted,
    missionsDone: S.missions.missionsDone,
    totalEarned: S.missions.totalEarned,
    missionIndex: S.missions.index,
    stage: S.missions.stage,
    mode: S.mode,
    speedMph: Math.round((p.onFoot ? p.speed : (p.car ? Math.abs(p.car.speed) : 0)) * 2.23694),
    nearestPolice: nearestPolice(S),
    inCar: !p.onFoot,
    gameOver: S.gameOver,
  };
  S.render.renderer.render(S.render.scene, S.render.camera);
}
