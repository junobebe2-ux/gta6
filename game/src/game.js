// game.js — Solmar City: the main loop. Wires together the modules main.js
// assembles into ctx (player, vehicles, people, police, pickups, missions,
// city, hud, renderer, audio, input) and owns the per-frame flow: input
// (enter/exit, punch, shoot, pause), movement, world steps, HUD, camera,
// audio, mission flow and save, and the title / pause / game-over states.
//
// Written fresh for Phase D from the prose spec and from live probing of
// the running game (never from the previous implementation). The two
// defects fixed here are the punch wiring (F did nothing) and shooting
// from the car (clicks while driving did nothing); both now live in tick,
// where the input is actually handled.

import { readSave, writeSave } from './save.js';

// Melee reach: a pedestrian within this distance is hit by a punch;
// foot cops within this (slightly larger) distance are stunned.
const PUNCH_RANGE_PED = 2.5;
const PUNCH_RANGE_COP = 3.0;
// Punch and shot rate limits, in wall-clock milliseconds (the shot
// cooldown is wall-clock: clicks a second apart raise wanted, clicks
// inside a second only play the sound).
const PUNCH_COOLDOWN_MS = 800;
const SHOT_COOLDOWN_MS = 1000;
// A punched pedestrian runs away for this long, toward a point this far
// beyond them from the player; a stunned cop stands down for this long.
const FLEE_TIME = 2;
const FLEE_DIST = 10;
const STUN_TIME = 2;
// Per-frame delta is clamped so a slow headless frame never jumps the sim.
const MAX_DT = 0.05;

export function createGame(ctx) {
  const state = ctx.state;
  const player = ctx.player;
  const vehicles = ctx.vehicles;
  const people = ctx.people;
  const police = ctx.police;
  const pickups = ctx.pickups;
  const missions = ctx.missions;
  const city = ctx.city;
  const hud = ctx.hud;
  const renderer = ctx.renderer;
  const audio = ctx.audio;
  const input = ctx.input;

  // Where the player booted. The shot (if any) is applied by main.js
  // after this game object is created, so the spawn cannot be captured
  // here — it is captured on the first tick instead, by which time the
  // shot has been applied and the player has not moved yet. startNew /
  // continueGame then restore the scene the player started in (on foot
  // at the title spawn, or in the car in the driving scene).
  //
  // The spawn is read from state.playerX / state.playerZ, NOT from
  // player.pos: in the title scene the shot leaves player.pos holding
  // the city / config objects instead of coordinates (a wiring mix-up
  // in the shot setup), so reading pos would capture objects, and
  // re-applying them would keep the player broken (NaN once they move).
  // state.playerX/Z hold the true boot coordinates, and placeAtSpawn
  // writing them back through setPosition repairs player.pos.
  let spawn = null;

  function captureSpawn() {
    spawn = {
      x: state.playerX,
      z: state.playerZ,
      heading: player.heading,
      driving: vehicles.isDriving(),
    };
  }

  // Edge-trigger memory for the keys tick polls.
  let prevE = false;
  let prevP = false;
  let prevF = false;
  // Wall-clock timestamps of the last punch / shot that raised wanted.
  let lastPunchAt = 0;
  let lastShotAt = 0;
  // Mission counter, to spot a completion and jingle + autosave once.
  let prevMissionsDone = state.missionsDone;
  // The start() loop is single: a second call is a no-op.
  let loopRunning = false;

  function resetRun() {
    state.cash = 0;
    state.health = 100;
    state.wanted = 0;
    state.wantedReason = '';
    state.robbing = false;
    state.missionsDone = 0;
    state.totalEarned = 0;
    state.mode = 'play';
    prevMissionsDone = 0;
    prevE = false;
    prevP = false;
    prevF = false;
    lastPunchAt = 0;
    lastShotAt = 0;
  }

  function placeAtSpawn() {
    if (!spawn) captureSpawn();
    player.setPosition(spawn.x, spawn.z, spawn.heading);
    if (spawn.driving) vehicles.tryEnter(player, ctx);
  }

  function startNew() {
    resetRun();
    missions.reset();
    placeAtSpawn();
    writeSave({ cash: 0, missionsDone: 0, totalEarned: 0 });
    hud.showScreen(null);
    audio.startMusic();
  }

  function continueGame() {
    const save = readSave();
    if (!save) {
      startNew();
      return;
    }
    resetRun();
    state.cash = save.cash;
    state.missionsDone = save.missionsDone;
    state.totalEarned = save.totalEarned;
    prevMissionsDone = save.missionsDone;
    missions.setIndex(save.missionsDone);
    placeAtSpawn();
    hud.showScreen(null);
    audio.startMusic();
  }

  function pauseGame() {
    if (state.mode !== 'play') return;
    state.mode = 'paused';
    hud.showScreen('pause');
  }

  function resumeGame() {
    if (state.mode !== 'paused') return;
    state.mode = 'play';
    hud.showScreen(null);
  }

  function restartAfterGameOver() {
    startNew();
  }

  function gameOver(kind) {
    if (state.mode === 'gameover') return;
    state.mode = 'gameover';
    hud.setGameOverTitle(kind);
    hud.showScreen('gameover');
    audio.stopMusic();
    writeSave({
      cash: state.cash,
      missionsDone: state.missionsDone,
      totalEarned: state.totalEarned,
    });
  }

  // Punch (F, on foot): the nearest pedestrian in reach flees away from
  // the player, nearby foot cops are stunned, and hitting anyone raises
  // wanted for assault. A swing that hits nobody still makes the sound.
  function doPunch() {
    const px = player.pos.x;
    const pz = player.pos.z;
    let connected = false;
    let best = null;
    let bestD = Infinity;
    for (const ped of people.pedestrians) {
      const d = Math.hypot(ped.x - px, ped.z - pz);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    if (best && bestD <= PUNCH_RANGE_PED) {
      const dx = best.x - px;
      const dz = best.z - pz;
      const len = Math.hypot(dx, dz) || 1;
      // Pedestrians run toward the flee point, so put it beyond them,
      // away from the player, and they run away from the player.
      best.fleeX = best.x + (dx / len) * FLEE_DIST;
      best.fleeZ = best.z + (dz / len) * FLEE_DIST;
      best.fleeTimer = FLEE_TIME;
      connected = true;
    }
    for (const cop of police.cops) {
      const d = Math.hypot(cop.x - px, cop.z - pz);
      if (d <= PUNCH_RANGE_COP) {
        cop.stunTimer = STUN_TIME;
        connected = true;
      }
    }
    audio.punch();
    if (connected) police.raise(1, 'Assault', state);
  }

  // Shoot (mouse click, on foot or driving): the sound plays on every
  // click; wanted rises at most once a second so a burst is one offence.
  function doShoot() {
    audio.shot();
    const now = Date.now();
    if (now - lastShotAt >= SHOT_COOLDOWN_MS) {
      police.raise(1, 'Shots fired', state);
      lastShotAt = now;
    }
  }

  function tick(dt) {
    dt = Math.min(dt, MAX_DT);
    // First tick: the shot has been applied and the player has not
    // moved yet, so this is the true boot spawn (see captureSpawn).
    if (!spawn) captureSpawn();
    if (state.mode !== 'play') return;

    // --- input, edge-triggered ---
    const eDown = input.isDown('KeyE');
    if (eDown && !prevE) {
      if (vehicles.isDriving()) vehicles.exitCar(player, ctx);
      else vehicles.tryEnter(player, ctx);
    }
    prevE = eDown;

    const pDown = input.isDown('KeyP') || input.isDown('Escape');
    if (pDown && !prevP) pauseGame();
    prevP = pDown;

    const fDown = input.isDown('KeyF');
    if (fDown && !prevF && !vehicles.isDriving()) {
      const now = Date.now();
      if (now - lastPunchAt >= PUNCH_COOLDOWN_MS) {
        doPunch();
        lastPunchAt = now;
      }
    }
    prevF = fDown;

    const click = input.consumeClick();
    if (click) doShoot();

    const dragDX = input.consumeDragDX();

    // --- movement ---
    state.cameraHeading = player.heading;
    if (!vehicles.isDriving()) {
      const move = {
        axis: input.axis(),
        run: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
        dragDX,
      };
      player.step(move, dt);
    }
    vehicles.step(dt, ctx);
    people.step(dt, ctx);
    police.step(dt, ctx);
    pickups.step(dt, ctx);
    missions.step(dt);
    city.stepClouds(dt);

    // --- sync the shared state the HUD and debug hook read ---
    state.playerX = player.pos.x;
    state.playerZ = player.pos.z;
    state.speed = vehicles.isDriving() ? vehicles.drivingSpeed() : player.speed;
    state.isDriving = vehicles.isDriving();

    // --- mission completed this frame: autosave once ---
    // (The jingle itself is played by the missions step; playing it
    // here too would double it.)
    if (state.missionsDone > prevMissionsDone) {
      writeSave({
        cash: state.cash,
        missionsDone: state.missionsDone,
        totalEarned: state.totalEarned,
      });
    }
    prevMissionsDone = state.missionsDone;

    // --- HUD, camera, audio ---
    hud.repaint(state);
    hud.drawMinimap(ctx);
    renderer.updateCamera(player.pos, player.heading);
    audio.setEngine(vehicles.isDriving() ? vehicles.drivingSpeed() : 0);

    // --- game over ---
    if (police.busted) gameOver('BUSTED');
    else if (state.health <= 0) gameOver('WASTED');
  }

  function step(dt) {
    tick(dt);
  }

  function start() {
    if (loopRunning) return;
    loopRunning = true;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      step(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  return {
    state,
    ctx,
    input,
    tick,
    step,
    start,
    startNew,
    continueGame,
    pauseGame,
    resumeGame,
    restartAfterGameOver,
    gameOver,
  };
}
