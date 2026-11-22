// Cars: creation, player driving physics, traffic AI, and the shared
// collision rules (car vs building, car vs car, the bump speed cut).
import * as THREE from 'three';
import { C } from './config.js';
import { pick, range } from './random.js';
import { resolveBuildings, clampWorld, nearestRoad, onRoad } from './city.js';

const TRAFFIC_COLORS = [0xd8d8d8, 0x2a2a2a, 0xc23a2a, 0x2a5ac2, 0xd8a83a, 0x3a8a5a, 0x7a4a9a, 0x8a8a7a];

function carMesh(kind, color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.65, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1a2530, metalness: 0.2, roughness: 0.3 }),
  );
  cabin.position.set(0, 1.2, -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
  }
  let lightBar = null;
  if (kind === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.25, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0xcc2222, emissiveIntensity: 1 }),
    );
    red.position.x = -0.4;
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.25, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2244cc, emissive: 0x2244cc, emissiveIntensity: 1 }),
    );
    blue.position.x = 0.4;
    bar.add(red);
    bar.add(blue);
    bar.position.set(0, 1.6, -0.2);
    g.add(bar);
    lightBar = { red, blue };
  }
  return { group: g, lightBar };
}

export function createCar(S, kind, x, z, angle, color, opts = {}) {
  const { group, lightBar } = carMesh(kind, color);
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  S.render.scene.add(group);
  const car = {
    kind,
    x, z, angle,
    speed: 0,
    parked: !!opts.parked,
    playerOwned: false,
    color,
    mesh: group,
    lightBar,
    axis: opts.axis || 'x',
    dir: opts.dir || 1,
    road: opts.road ?? 0,
    lane: opts.lane || 0,
    cruise: opts.cruise || range(S.rng, C.trafficCruiseMin, C.trafficCruiseMax),
    targetSpeed: 0,
    ramCooldown: 0,
    turnAt: 0,
  };
  S.cars.push(car);
  return car;
}

export function spawnTrafficCars(S) {
  // Parked cars on road edges, spread across the city. Three sit within
  // ~25 m of the player's spawn so driving starts within seconds.
  const parkedSpots = [
    [5, -12, 0], [-5, 10, 0], [5, 25, 0],
    [-120, 5, Math.PI / 2], [60, -5, -Math.PI / 2], [150, 5, Math.PI / 2],
    [55, -120, 0], [-55, 60, 0], [105, 150, 0],
    [-105, -150, 0], [205, 5, Math.PI / 2], [-205, -5, -Math.PI / 2],
  ];
  for (const [x, z, angle] of parkedSpots) {
    const c = createCar(S, 'traffic', x, z, angle, pick(S.rng, TRAFFIC_COLORS), { parked: true });
    c.speed = 0;
  }
  // Moving traffic on the road grid.
  const moving = C.trafficCount - C.trafficParked;
  for (let i = 0; i < moving; i++) {
    const axis = S.rng() < 0.5 ? 'x' : 'z';
    const road = pick(S.rng, [-200, -150, -100, -50, 0, 50, 100, 150, 200]);
    const along = range(S.rng, -230, 230);
    const lane = pick(S.rng, [-2, 2]);
    const dir = pick(S.rng, [-1, 1]);
    const x = axis === 'x' ? along : road + lane;
    const z = axis === 'x' ? road + lane : along;
    const angle = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? Math.PI : 0);
    const c = createCar(S, 'traffic', x, z, angle, pick(S.rng, TRAFFIC_COLORS), { axis, dir, road, lane });
    c.speed = c.cruise;
  }
}

function forwardOf(angle) {
  return { x: Math.sin(angle), z: -Math.cos(angle) };
}

export function stepPlayerCar(S, dt) {
  const p = S.player;
  const car = p.car;
  if (!car) return;
  const inp = S.input;
  const fwd = forwardOf(car.angle);
  // Steering: D turns toward screen-right. A stopped car can still turn
  // a little, so it never gets stuck facing the wrong way in a corner.
  const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  // A stopped car can still turn (at reduced rate) even with no throttle
  // pressed — otherwise a handbrake U-turn leaves it facing the wrong
  // way forever, wedged in a corner. Reversing flips the steering.
  const dirSign = car.speed > 0.5 ? 1 : car.speed < -0.5 ? -1 : (inp.back ? -1 : 1);
  let rate = C.carTurnRate * (0.35 + 0.65 * Math.min(Math.abs(car.speed) / 10, 1));
  // A fast car that turns while braking arcs wide off the road and wedges
  // against a building. While the handbrake is stopping the car with no
  // throttle, do not steer at all: going straight keeps it on its road,
  // and once slow it rotates in place. (With the throttle held — the
  // flee mode's rolling turns — keep a reduced rate so it still corners.)
  if (inp.handbrake && Math.abs(car.speed) > 3) rate *= inp.forward ? 0.3 : 0;
  car.angle += steer * rate * dt * dirSign;
  // Longitudinal: accelerate, brake, reverse, drag, handbrake.
  if (inp.forward) car.speed += C.carAccel * dt;
  if (inp.back) {
    if (car.speed > 0.5) car.speed -= C.carBrake * dt;
    else car.speed -= C.carReverseAccel * dt;
  }
  if (!inp.forward && !inp.back) car.speed *= Math.max(0, 1 - 0.4 * dt);
  if (inp.handbrake) car.speed *= Math.max(0, 1 - 12 * dt);
  // Cornering keeps most of its speed (the escape needs it).
  if (steer !== 0 && Math.abs(car.speed) > 5) car.speed *= Math.max(0, 1 - 0.05 * dt);
  car.speed = Math.max(-C.carReverseTop, Math.min(C.carTopSpeed, car.speed));
  car.x += fwd.x * car.speed * dt;
  car.z += fwd.z * car.speed * dt;
  p.x = car.x;
  p.z = car.z;
  p.angle = car.angle;
  p.speed = car.speed;
}

export function stepTraffic(S, dt) {
  const escaping = S.missions.index === 2 && S.missions.stage === 'escape'
    || S.missions.index === 3 && S.missions.stage === 'escape';
  for (const c of S.cars) {
    if (c.kind !== 'traffic' || c.parked || c === S.player.car) continue;
    // Slow for the car ahead on the same road.
    let ahead = null;
    let aheadD = 12;
    for (const o of S.cars) {
      if (o === c || o.parked) continue;
      if (o.axis !== c.axis || o.road !== c.road) continue;
      const along = c.axis === 'x' ? (o.x - c.x) * c.dir : (o.z - c.z) * c.dir;
      if (along > 0 && along < aheadD) { aheadD = along; ahead = o; }
    }
    let target = ahead ? 0 : c.cruise;
    let laneTarget = c.lane;
    if (escaping) {
      // During an escape, nearby traffic pulls over to the road edge and
      // slows down so it cannot box the player in.
      const dp = Math.hypot(c.x - S.player.x, c.z - S.player.z);
      if (dp < 50) { target = 3; laneTarget = 4.5; }
    }
    c.targetSpeed = target;
    c.speed += Math.sign(target - c.speed) * Math.min(Math.abs(target - c.speed), 6 * dt);
    // Ease the lane toward its target.
    c.lane += Math.sign(laneTarget - c.lane) * Math.min(Math.abs(laneTarget - c.lane), 2 * dt);
    // Turn at an intersection sometimes.
    const pos = c.axis === 'x' ? c.x : c.z;
    const cross = nearestRoad(pos);
    if (Math.abs(pos - cross) < 3 && S.time > c.turnAt && onRoad(c.x, c.z)) {
      c.turnAt = S.time + 1;
      if (S.rng() < 0.3) {
        const newRoad = cross;
        const newAxis = c.axis === 'x' ? 'z' : 'x';
        const newDir = pick(S.rng, [-1, 1]);
        c.axis = newAxis;
        c.road = newRoad;
        c.dir = newDir;
        c.lane = pick(S.rng, [-2, 2]);
      }
    }
    // World edge: turn around rather than leave the city.
    if (c.axis === 'x' && Math.abs(c.x) > 244) c.dir *= -1;
    if (c.axis === 'z' && Math.abs(c.z) > 244) c.dir *= -1;
    if (c.axis === 'x') {
      c.x += c.dir * c.speed * dt;
      c.z = c.road + c.lane;
      c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      c.z += c.dir * c.speed * dt;
      c.x = c.road + c.lane;
      c.angle = c.dir > 0 ? Math.PI : 0;
    }
  }
}

export function integrateCars(S) {
  // Every car — player, traffic, police, parked — resolves against
  // buildings (a shoved traffic car still collides with them) and is
  // clamped inside the world, then its mesh follows its position.
  for (const c of S.cars) {
    const r = resolveBuildings(S, c.x, c.z, C.carRadius, false);
    c.x = r.x;
    c.z = r.z;
    const cl = clampWorld(c.x, c.z);
    c.x = cl.x;
    c.z = cl.z;
    c.mesh.position.set(c.x, 0, c.z);
    c.mesh.rotation.y = c.angle;
  }
}

// Car vs car: push overlapping cars apart. The player car is never pushed
// outside the world by a shove (clamped after). Police cars push the
// player out of the overlap but never trigger the bump speed cut.
export function resolveCarCollisions(S) {
  // Two cars may never overlap. The overlap is split between them —
  // but the player's car takes only a quarter of the push: a police ram
  // or a traffic bump that shoves the player's car sideways throws it
  // off the road into a building, where it wedges and cannot move.
  // The other car absorbs the rest (traffic re-centres on its road).
  const cars = S.cars;
  const playerCar = S.player.car;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const min = 3.6;
      if (d2 >= min * min || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      const aIsPlayer = playerCar === a;
      const bIsPlayer = playerCar === b;
      const aShare = aIsPlayer ? 0.5 : bIsPlayer ? 1.5 : 1;
      const bShare = bIsPlayer ? 0.5 : aIsPlayer ? 1.5 : 1;
      a.x -= nx * push * aShare;
      a.z -= nz * push * aShare;
      b.x += nx * push * bShare;
      b.z += nz * push * bShare;
    }
  }
  // Bump speed cut: a non-police car within 4.2 m cuts the player's speed
  // by 30%, once per encounter (police glued to the player never cut it).
  const p = S.player;
  if (!p.onFoot && p.car) {
    if (!p.bumpSet) p.bumpSet = new Set();
    for (const c of cars) {
      if (c === p.car || c.kind === 'police') continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < C.bumpCutDistance) {
        if (!p.bumpSet.has(c)) {
          p.bumpSet.add(c);
          p.car.speed *= C.bumpCutFactor;
          p.speed = p.car.speed;
        }
      } else {
        p.bumpSet.delete(c);
      }
    }
  }
  // The player car is clamped inside the world after any push.
  if (p.car) {
    const cl = clampWorld(p.car.x, p.car.z);
    p.car.x = cl.x;
    p.car.z = cl.z;
    p.x = cl.x;
    p.z = cl.z;
  }
}

export function nearestCar(S, x, z, maxDist, wantParked) {
  let best = null;
  let bestD = maxDist;
  for (const c of S.cars) {
    if (c.kind !== 'traffic') continue;
    if (wantParked && !c.parked) continue;
    if (c === S.player.car) continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function enterCar(S, car) {
  const p = S.player;
  const fresh = !car.playerOwned;
  car.playerOwned = true;
  car.parked = false;
  p.car = car;
  p.onFoot = false;
  p.x = car.x;
  p.z = car.z;
  p.angle = car.angle;
  p.speed = car.speed;
  if (fresh) {
    S.police.raiseWanted(1, 'Grand theft auto');
  }
  return fresh;
}

export function exitCar(S) {
  const p = S.player;
  if (!p.car) return;
  // Exiting leaves the car parked exactly where it is: traffic never
  // drives it away, and it stays enterable.
  p.car.parked = true;
  p.car.speed = 0;
  p.x = p.car.x + Math.sin(p.angle + Math.PI / 2) * 2.5;
  p.z = p.car.z - Math.cos(p.angle + Math.PI / 2) * 2.5;
  const r = resolveBuildings(S, p.x, p.z, C.playerRadius, true);
  p.x = r.x;
  p.z = r.z;
  p.car = null;
  p.onFoot = true;
  p.speed = 0;
}
