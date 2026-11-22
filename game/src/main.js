// Entry point: builds the state, applies the deterministic screenshot
// scenes (?shot= and &seed=) and the playtest hook (?debug=m3), then
// starts the loop.
import { C } from './config.js';
import { createState, startLoop } from './game.js';
import { applyShot } from './shots.js';
import { enterCar } from './vehicles.js';

const params = new URLSearchParams(window.location.search);
const seed = parseInt(params.get('seed') || String(C.seed), 10) || C.seed;
const S = createState(seed);
startLoop(S);

// A deterministic screenshot scene, when requested.
const shot = params.get('shot');
if (shot) applyShot(S, shot);

// Playtest hook: jump straight to the mission-3 escape (wanted 3, in a
// car, stage 'escape') so the escape balance can be tested on its own.
if (params.get('debug') === 'm3') {
  const car = S.cars.find((c) => c.kind === 'traffic' && c.parked);
  if (car) {
    S.player.x = car.x;
    S.player.z = car.z;
    enterCar(S, car);
  }
  S.missions.index = 2;
  S.missions.stage = 'escape';
  S.missions.missionsDone = 2;
  S.missions.totalEarned = 550;
  S.missions.objective = 'Lose the heat — escape until your wanted level falls to 0';
  S.police.wanted = 3;
  S.police.reason = 'Grand theft auto';
  S.mode = 'playing';
  S.cameraSnap = true;
  document.getElementById('title-screen').style.display = 'none';
}
