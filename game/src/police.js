// Wanted level, police cars, foot cops, chase, ram, bust and decay.
// Escape balance (mission 3 / mission 4 escape): rams hurt far less and
// can never chain, and wanted decays while the player keeps moving fast
// even with police in view — it only pauses while a police car is very
// close. A clean straight-line drive with normal cornering reliably ends
// wanted 3 -> 2 -> 1 -> 0.
import * as THREE from 'three';
import { C } from './config.js';
import { pick, range } from './random.js';
import { createCar } from './vehicles.js';
import { resolveBuildings, clampWorld, nearestRoad, ROADS } from './city.js';

function normAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function createPolice(S) {
  S.police = {
    wanted: 0,
    reason: '',
    decayTimer: 0,
    escapeTimer: 0,
    lastRamGlobal: -10,
    cars: [],
    cops: [],
    raiseWanted(n, reason) {
      const p = S.police;
      const before = p.wanted;
      p.wanted = Math.min(5, p.wanted + n);
      if (p.wanted > before) {
        p.reason = reason || p.reason;
        p.decayTimer = 0;
      }
    },
  };
}

function wantedTargets(wanted) {
  // Police cars and foot cops per wanted level.
  return [
    { cars: 0, cops: 0 },
    { cars: 1, cops: 0 },
    { cars: 2, cops: 0 },
    { cars: 3, cops: 1 },
    { cars: 4, cops: 2 },
    { cars: 5, cops: 3 },
  ][wanted];
}

function spawnPoint(S, minD, maxD) {
  // A road position minD..maxD metres from the player.
  for (let i = 0; i < 12; i++) {
    const road = pick(S.rng, ROADS);
    const along = range(S.rng, -240, 240);
    const onX = S.rng() < 0.5;
    const x = onX ? along : road;
    const z = onX ? road : along;
    const d = Math.hypot(x - S.player.x, z - S.player.z);
    if (d >= minD && d <= maxD) return { x, z };
  }
  return { x: S.player.x + 70, z: S.player.z };
}

function copMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.4, 1.15, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a2a5a }),
  );
  body.position.y = 0.9;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8a878 }),
  );
  head.position.y = 1.7;
  g.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10),
    new THREE.MeshStandardMaterial({ color: 0x0a1a3a }),
  );
  cap.position.y = 1.9;
  g.add(cap);
  return g;
}

export function nearestPolice(S) {
  let best = null;
  for (const c of S.police.cars) {
    const d = Math.hypot(c.x - S.player.x, c.z - S.player.z);
    if (best === null || d < best) best = d;
  }
  for (const cop of S.police.cops) {
    const d = Math.hypot(cop.x - S.player.x, cop.z - S.player.z);
    if (best === null || d < best) best = d;
  }
  return best;
}

function removePoliceCar(S, car) {
  S.render.scene.remove(car.mesh);
  const i = S.cars.indexOf(car);
  if (i >= 0) S.cars.splice(i, 1);
  const j = S.police.cars.indexOf(car);
  if (j >= 0) S.police.cars.splice(j, 1);
}

function removeCop(S, cop) {
  S.render.scene.remove(cop.mesh);
  const j = S.police.cops.indexOf(cop);
  if (j >= 0) S.police.cops.splice(j, 1);
}

export function stepPolice(S, dt) {
  const pol = S.police;
  const p = S.player;
  const holding = S.missions.index === 3 && S.missions.stage === 'hold';
  const escaping = (S.missions.index === 2 && S.missions.stage === 'escape')
    || (S.missions.index === 3 && S.missions.stage === 'escape');

  // Spawn / despawn to match the wanted level.
  const target = wantedTargets(pol.wanted);
  while (pol.cars.length < target.cars) {
    const sp = spawnPoint(S, 60, 90);
    const car = createCar(S, 'police', sp.x, sp.z, 0, 0xffffff, {});
    car.mesh.children.forEach(() => {});
    // Black-and-white livery: repaint the body dark.
    car.mesh.children[0].material = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.5 });
    car.speed = 0;
    pol.cars.push(car);
  }
  while (pol.cars.length > target.cars) removePoliceCar(S, pol.cars[pol.cars.length - 1]);
  while (pol.cops.length < target.cops) {
    const sp = spawnPoint(S, 20, 35);
    const mesh = copMesh();
    mesh.position.set(sp.x, 0, sp.z);
    S.render.scene.add(mesh);
    pol.cops.push({ x: sp.x, z: sp.z, angle: 0, mesh, punchCooldown: 0, bustT: 0 });
  }
  while (pol.cops.length > target.cops) removeCop(S, pol.cops[pol.cops.length - 1]);

  // Chase: steer straight at the player (they cut corners off-road),
  // accelerate to their top speed, and resolve against buildings.
  for (const car of pol.cars) {
    car.ramCooldown = Math.max(0, car.ramCooldown - dt);
    const want = Math.atan2(p.x - car.x, -(p.z - car.z));
    const diff = normAngle(want - car.angle);
    const turn = Math.max(-1, Math.min(1, diff * 2));
    car.angle += turn * C.policeTurnRate * dt * (car.speed >= 0 ? 1 : -1);
    if (car.speed < C.policeTopSpeed) car.speed += C.policeAccel * dt;
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += -Math.cos(car.angle) * car.speed * dt;
    // Alternate the light bar glow and colour.
    if (car.lightBar) {
      const phase = Math.floor(S.time * 2.5) % 2 === 0;
      car.lightBar.red.material.emissiveIntensity = phase ? 1.6 : 0.15;
      car.lightBar.blue.material.emissiveIntensity = phase ? 0.15 : 1.6;
    }
  }

  // Ram: damage + a shove. During an escape the ram hurts far less and a
  // global cooldown stops chain-ramming; during the bank hold there is
  // no ramming at all.
  if (!holding) {
    for (const car of pol.cars) {
      const d = Math.hypot(car.x - p.x, car.z - p.z);
      if (d > 3.5 || car.ramCooldown > 0) continue;
      if (escaping && S.time - pol.lastRamGlobal < C.escapeRamGlobalCooldown) continue;
      car.ramCooldown = C.policeRamCooldown;
      if (escaping) pol.lastRamGlobal = S.time;
      const dmg = escaping ? C.escapeRamDamage : (p.onFoot ? C.policeRamFoot : C.policeRamCar);
      p.health = Math.max(0, p.health - dmg);
      // No extra shove: the car-vs-car collision already pushes the
      // player out of the overlap. An extra shove throws the car off the
      // road sideways, where it wedges against a building and the police
      // then rams it to death while it cannot move.
      if (!p.onFoot && p.car) p.car.speed *= 0.9;
    }
  }

  // Foot cops: run at the player, punch up close, bust after holding
  // them on foot. They cannot hit the player through a car, and they
  // never punch or bust during the bank hold.
  for (const cop of pol.cops) {
    cop.punchCooldown = Math.max(0, cop.punchCooldown - dt);
    const d = Math.hypot(p.x - cop.x, p.z - cop.z);
    if (d > 2) {
      const want = Math.atan2(p.x - cop.x, -(p.z - cop.z));
      cop.angle = want;
      cop.x += Math.sin(want) * 6 * dt;
      cop.z += -Math.cos(want) * 6 * dt;
      cop.bustT = 0;
    } else if (!p.onFoot || holding) {
      cop.bustT = 0;
    } else {
      // Within arm's reach on foot: punch, and hold to bust.
      if (cop.punchCooldown <= 0) {
        cop.punchCooldown = C.copPunchCooldown;
        p.health = Math.max(0, p.health - C.copPunch);
      }
      cop.bustT += dt;
      if (cop.bustT >= C.bustHold) {
        S.gameOver = 'BUSTED';
        S.mode = 'gameover';
      }
    }
    const r = resolveBuildings(S, cop.x, cop.z, 0.5, true);
    cop.x = r.x;
    cop.z = r.z;
    const cl = clampWorld(cop.x, cop.z);
    cop.x = cl.x;
    cop.z = cl.z;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.angle;
  }

  // Wanted decay.
  const near = nearestPolice(S);
  const playerSpeed = p.onFoot ? p.speed : (p.car ? Math.abs(p.car.speed) : 0);
  if (pol.wanted > 0) {
    if (escaping) {
      // Decay while the player keeps moving fast; it only pauses while a
      // police car is very close, and the timer is kept (not reset) so
      // progress survives a corner.
      if (playerSpeed > C.escapeSpeed && (near === null || near > C.escapeNear)) {
        pol.escapeTimer += dt;
        if (pol.escapeTimer >= C.escapeDecaySeconds) {
          pol.escapeTimer = 0;
          pol.wanted = Math.max(0, pol.wanted - 1);
          pol.decayTimer = 0;
        }
      }
    } else if (near === null || near > C.wantedDecayNear) {
      pol.decayTimer += dt;
      if (pol.decayTimer >= C.wantedDecaySeconds) {
        pol.decayTimer = 0;
        pol.wanted = Math.max(0, pol.wanted - 1);
      }
    } else {
      pol.decayTimer = 0;
    }
  }
}
