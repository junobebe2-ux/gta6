// Deterministic screenshot scenes (?shot=start|play|chase|end&seed=1).
// Each scene is set up synchronously on load so the first rendered frame
// already shows the right thing. The same seed always gives the same scene.
import * as THREE from 'three';
import { C } from './config.js';
import { createCar } from './vehicles.js';
import { repaintHud, drawMinimap } from './hud.js';

function policeCar(S, x, z, angle) {
  const car = createCar(S, 'police', x, z, angle, 0xffffff, {});
  // Black-and-white livery.
  car.mesh.children[0].material = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.5 });
  car.speed = 18;
  S.police.cars.push(car);
  return car;
}

function placePoliceBehind(S, count) {
  // Police cars close behind the player car: 7–10 m back, so they sit in
  // the lower half of the shot frame (the shot camera sits further back
  // than the play camera).
  const p = S.player;
  const spots = [[0, 7], [-5, 9], [5, 10]];
  for (let i = 0; i < count; i++) {
    const [dx, dz] = spots[i % spots.length];
    policeCar(S, p.x + dx, p.z + dz, p.angle);
  }
}

function startDriving(S, x, z, angle, speed) {
  // Put the player in a car at (x, z), already moving, with the game
  // running — the shot then shows a live driving scene, not a still.
  const car = S.cars.find((c) => c.kind === 'traffic' && c.parked);
  if (!car) return;
  car.x = x;
  car.z = z;
  car.angle = angle;
  car.parked = false;
  car.playerOwned = true;
  car.speed = speed;
  S.player.car = car;
  S.player.onFoot = false;
  S.player.x = x;
  S.player.z = z;
  S.player.angle = angle;
  S.player.speed = speed;
  S.player.mesh.visible = false;
  S.mode = 'playing';
  S.cameraSnap = true;
  S.shotCamera = true;
  document.getElementById('title-screen').style.display = 'none';
}

function placeTrafficNear(S, spots) {
  // spots: [x, z, axis, road, lane, dir] — traffic driving on its road.
  for (const [x, z, axis, road, lane, dir] of spots) {
    const angle = axis === 'z' ? (dir > 0 ? Math.PI : 0) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = createCar(S, 'traffic', x, z, angle, 0xd8a83a, { axis, road, lane, dir });
    car.speed = 10;
  }
}

export function applyShot(S, shot) {
  if (shot === 'start') {
    // Title screen over the city: the loop orbits the camera.
    S.mode = 'title';
    return;
  }
  if (shot === 'play') {
    // Cover: downtown driving, traffic cars near the camera, a police
    // car close behind the player. Not the title screen.
    startDriving(S, 0, -100, 0, 15);
    placeTrafficNear(S, [
      [0, -118, 'z', 0, 0, -1],
      [5, -132, 'z', 0, 5, -1],
      [-5, -108, 'z', 0, -5, -1],
    ]);
    S.police.wanted = 1;
    S.police.reason = 'Grand theft auto';
    placePoliceBehind(S, 1);
    S.player.cash = 200;
    return;
  }
  if (shot === 'chase') {
    // Wanted 3, police visibly chasing, the banner showing the level.
    startDriving(S, 0, 0, 0, 18);
    placeTrafficNear(S, [
      [5, -20, 'z', 0, 5, -1],
      [-5, -35, 'z', 0, -5, -1],
      [0, -50, 'z', 0, 0, -1],
    ]);
    S.police.wanted = 3;
    S.police.reason = 'Grand theft auto';
    placePoliceBehind(S, 3);
    S.player.cash = 550;
    S.missions.index = 2;
    S.missions.stage = 'escape';
    S.missions.missionsDone = 2;
    S.missions.totalEarned = 550;
    S.missions.objective = 'Lose the heat — escape until your wanted level falls to 0';
    return;
  }
  if (shot === 'end') {
    // Game over with REAL values: run one play tick first (HUD repaint
    // + minimap draw from the live state), then trigger WASTED.
    startDriving(S, 0, 0, 0, 5.4); // 5.4 m/s = 12 mph
    S.player.cash = 450;
    S.player.health = 100;
    S.police.wanted = 2;
    S.police.reason = 'Grand theft auto';
    placePoliceBehind(S, 1);
    repaintHud(S);
    drawMinimap(S);
    S.player.health = 0;
    S.gameOver = 'WASTED';
    S.mode = 'gameover';
    S.gameOverShown = false; // let the loop show it with real values
    return;
  }
}
