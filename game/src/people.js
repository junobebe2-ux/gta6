// Pedestrians and the on-foot player. On foot the facing follows the
// movement direction: strafing rotates the walker, then walking straight
// carries them where they face.
import * as THREE from 'three';
import { C } from './config.js';
import { pick, range } from './random.js';
import { resolveBuildings, clampWorld, nearestRoad, ROADS } from './city.js';
import { enterCar, exitCar, nearestCar } from './vehicles.js';
import { sfxPunch, sfxShot } from './audio.js';

const PED_COLORS = [0xc23a5a, 0x3a7ac2, 0x3aa85a, 0xd8a83a, 0x7a4a9a, 0x8a6a4a, 0x2a2a2a, 0xd8d8d8];

function pedMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.38, 1.1, 8),
    new THREE.MeshStandardMaterial({ color }),
  );
  body.position.y = 0.85;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8a878 }),
  );
  head.position.y = 1.65;
  head.castShadow = true;
  g.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.6, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x2a2a3a }),
  );
  legs.position.y = 0.3;
  g.add(legs);
  return g;
}

export function createPlayerMesh(S) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.4, 1.15, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a6a9a }),
  );
  body.position.y = 0.9;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8a878 }),
  );
  head.position.y = 1.7;
  head.castShadow = true;
  g.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.6, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x1a1a2a }),
  );
  legs.position.y = 0.3;
  g.add(legs);
  g.visible = false;
  S.render.scene.add(g);
  return g;
}

export function spawnPeds(S) {
  for (let i = 0; i < C.pedCount; i++) {
    const onXRoad = S.rng() < 0.5;
    const road = pick(S.rng, ROADS);
    const along = range(S.rng, -230, 230);
    const side = pick(S.rng, [-8, 8]);
    const x = onXRoad ? along : road + side;
    const z = onXRoad ? road + side : along;
    if (z < -224) continue; // not on the beach
    const mesh = pedMesh(pick(S.rng, PED_COLORS));
    mesh.position.set(x, 0, z);
    S.render.scene.add(mesh);
    S.peds.push({
      x, z,
      angle: range(S.rng, 0, Math.PI * 2),
      speed: range(S.rng, 1, 1.6),
      flee: false,
      fleeT: 0,
      mesh,
      axis: onXRoad ? 'x' : 'z',
      dir: pick(S.rng, [-1, 1]),
      road,
      side,
    });
  }
}

function normAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function stepPlayerOnFoot(S, dt) {
  const p = S.player;
  const inp = S.input;
  if (!p.onFoot) return;
  // E: enter the nearest car. F: punch a nearby ped. Click: shoot.
  if (inp.pressed.has('KeyE')) {
    const car = nearestCar(S, p.x, p.z, 4, false) || nearestCar(S, p.x, p.z, 4, true);
    if (car) enterCar(S, car);
  }
  if (inp.pressed.has('KeyF')) {
    let best = null;
    let bestD = 2.5;
    for (const ped of S.peds) {
      const d = Math.hypot(ped.x - p.x, ped.z - p.z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    if (best) {
      best.flee = true;
      best.fleeT = 5;
      sfxPunch(S.audio);
      S.police.raiseWanted(1, 'Assault');
    }
  }
  if (inp.mouseClicked) {
    sfxShot(S.audio);
    // A shot in front of the player scatters nearby peds and draws heat.
    let hit = false;
    const fx = Math.sin(p.angle);
    const fz = -Math.cos(p.angle);
    for (const ped of S.peds) {
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 30 && (dx * fx + dz * fz) / d > 0.7) {
        ped.flee = true;
        ped.fleeT = 5;
        hit = true;
      }
    }
    if (hit) S.police.raiseWanted(1, 'Shots fired');
  }
  // Movement: A/D turn in place (D turns toward screen-right), W/S walk
  // forward/back along the facing. Turning in place — rather than
  // strafing with a velocity-following facing — is what keeps the walker
  // from oscillating and drifting sideways when it rotates toward a
  // target: a strafe's direction rotates with the facing, so the walker
  // curves away instead of turning.
  const speed = inp.run ? C.runSpeed : C.walkSpeed;
  if (inp.right) p.angle += 2.5 * dt;
  if (inp.left) p.angle -= 2.5 * dt;
  const fx = Math.sin(p.angle);
  const fz = -Math.cos(p.angle);
  if (inp.forward) {
    p.speed = speed;
    p.x += fx * speed * dt;
    p.z += fz * speed * dt;
  } else if (inp.back) {
    p.speed = speed * 0.5;
    p.x -= fx * speed * 0.5 * dt;
    p.z -= fz * speed * 0.5 * dt;
  } else {
    p.speed = 0;
  }
  const r = resolveBuildings(S, p.x, p.z, C.playerRadius, true);
  p.x = r.x;
  p.z = r.z;
  const cl = clampWorld(p.x, p.z);
  p.x = cl.x;
  p.z = cl.z;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.angle;
  p.mesh.visible = true;
}

export function stepPeds(S, dt) {
  for (const ped of S.peds) {
    if (ped.flee) {
      ped.fleeT -= dt;
      if (ped.fleeT <= 0) ped.flee = false;
      // Run away from the player.
      const dx = ped.x - S.player.x;
      const dz = ped.z - S.player.z;
      const d = Math.hypot(dx, dz) || 1;
      ped.x += (dx / d) * 4 * dt;
      ped.z += (dz / d) * 4 * dt;
      ped.angle = Math.atan2(dx / d, -(dz / d));
    } else {
      // Walk the sidewalk along a road; turn at intersections sometimes.
      const pos = ped.axis === 'x' ? ped.x : ped.z;
      const cross = nearestRoad(pos);
      if (Math.abs(pos - cross) < 3 && S.rng() < dt * 0.2) {
        ped.axis = ped.axis === 'x' ? 'z' : 'x';
        ped.dir = pick(S.rng, [-1, 1]);
        ped.road = cross;
        ped.side = pick(S.rng, [-8, 8]);
      }
      if (ped.axis === 'x') {
        ped.x += ped.dir * ped.speed * dt;
        ped.z = ped.road + ped.side;
        ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (Math.abs(ped.x) > 244) ped.dir *= -1;
      } else {
        ped.z += ped.dir * ped.speed * dt;
        ped.x = ped.road + ped.side;
        ped.angle = ped.dir > 0 ? Math.PI : 0;
        if (Math.abs(ped.z) > 244) ped.dir *= -1;
      }
    }
    const r = resolveBuildings(S, ped.x, ped.z, 0.4, true);
    ped.x = r.x;
    ped.z = r.z;
    const cl = clampWorld(ped.x, ped.z);
    ped.x = cl.x;
    ped.z = cl.z;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.angle;
  }
}
