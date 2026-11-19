// Cars: a procedural low-poly car built from boxes (no model files), plus the
// traffic AI that drives them along the road grid. Parked cars sit empty at the
// kerb; traffic cars are occupied; police cars chase. A car's heading is an angle
// where 0 means +z and PI/2 means +x.
import * as THREE from 'three';
import { CAR, CITY } from './config.js';

const PAINTS = [0xc23b2e, 0x2f6fb8, 0xe8a020, 0x3f8f4f, 0x8a6fd8, 0xd8d8d8, 0x2c313a, 0xe07840, 0x40b8a8];
const GLASS = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
const TYRE = new THREE.MeshLambertMaterial({ color: 0x14161a });
const LIGHT_FRONT = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0x888866 });
const LIGHT_BACK = new THREE.MeshLambertMaterial({ color: 0xc23b2e, emissive: 0x550000 });
const WHEEL_SPOTS = [[-0.88, 1.35], [0.88, 1.35], [-0.88, -1.35], [0.88, -1.35]];

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function createCarMesh(color, police) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0x1c2733 : color });
  const roofMat = police
    ? new THREE.MeshLambertMaterial({ color: 0xe8e8e8 })
    : new THREE.MeshLambertMaterial({ color });
  group.add(box(1.9, 0.55, 4.2, paint, 0, 0.62, 0));
  group.add(box(1.7, 0.5, 2.1, GLASS, 0, 1.12, -0.2));
  group.add(box(1.72, 0.12, 2.0, roofMat, 0, 1.38, -0.2));
  // Bumpers and lights.
  group.add(box(1.9, 0.22, 0.3, TYRE, 0, 0.42, 2.05));
  group.add(box(1.9, 0.22, 0.3, TYRE, 0, 0.42, -2.05));
  group.add(box(0.4, 0.18, 0.1, LIGHT_FRONT, -0.6, 0.72, 2.12));
  group.add(box(0.4, 0.18, 0.1, LIGHT_FRONT, 0.6, 0.72, 2.12));
  group.add(box(0.4, 0.18, 0.1, LIGHT_BACK, -0.6, 0.72, -2.12));
  group.add(box(0.4, 0.18, 0.1, LIGHT_BACK, 0.6, 0.72, -2.12));
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of WHEEL_SPOTS) {
    const w = new THREE.Mesh(wheelGeo, TYRE);
    w.position.set(wx, 0.36, wz);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }
  let lightBar = null;
  if (police) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshLambertMaterial({ color: 0xff2a1a, emissive: 0xaa0000 }));
    red.position.set(-0.3, 1.48, -0.2);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x0022aa }));
    blue.position.set(0.3, 1.48, -0.2);
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.userData.red = red;
    lightBar.userData.blue = blue;
    group.add(lightBar);
  }
  return { group, wheels, lightBar };
}

function syncMesh(car) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  for (const w of car.wheels) w.rotation.x += (car.speed * 0.016) / 0.36;
}

// The road line nearest to v.
function nearestRoad(v) {
  let best = CITY.pitch * -CITY.grid;
  let bestD = Infinity;
  for (let i = -CITY.grid; i <= CITY.grid; i += 1) {
    const c = i * CITY.pitch;
    const d = Math.abs(v - c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function pickPaint(rng) {
  return PAINTS[Math.floor(rng.next() * PAINTS.length)];
}

function makeCar(scene, x, z, heading, color, kind, police) {
  const { group, wheels, lightBar } = createCarMesh(color, police);
  scene.add(group);
  const car = {
    group,
    wheels,
    lightBar,
    x,
    z,
    heading,
    speed: 0,
    targetSpeed: 0,
    color,
    kind, // 'traffic' | 'parked' | 'police'
    isPolice: !!police,
    occupied: kind === 'traffic',
    health: CAR.health,
    alive: true,
    turnCooldown: 0,
    flash: 0,
  };
  syncMesh(car);
  return car;
}

function roadStart(rng, laneOffset) {
  // A starting spot on a random road, heading along it.
  const axis = rng.next() < 0.5 ? 'x' : 'z';
  const coord = (Math.floor(rng.next() * (CITY.grid * 2 + 1)) - CITY.grid) * CITY.pitch;
  const along = rng.range(-220, 220);
  const dir = rng.next() < 0.5 ? 1 : -1;
  if (axis === 'x') {
    return { x: along, z: coord + (dir > 0 ? laneOffset : -laneOffset), heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }
  return { x: coord + (dir > 0 ? -laneOffset : laneOffset), z: along, heading: dir > 0 ? 0 : Math.PI };
}

export function createTrafficCar(scene, rng) {
  const spot = roadStart(rng, 3);
  const car = makeCar(scene, spot.x, spot.z, spot.heading, pickPaint(rng), 'traffic', false);
  car.targetSpeed = rng.range(7, 12);
  car.speed = car.targetSpeed;
  return car;
}

export function createParkedCar(scene, rng) {
  const axis = rng.next() < 0.5 ? 'x' : 'z';
  const coord = (Math.floor(rng.next() * (CITY.grid * 2 + 1)) - CITY.grid) * CITY.pitch;
  const along = rng.range(-210, 210);
  const side = rng.next() < 0.5 ? 1 : -1;
  const dir = rng.next() < 0.5 ? 1 : -1;
  let x;
  let z;
  let heading;
  if (axis === 'x') {
    x = along;
    z = coord + side * 4.2;
    heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    x = coord + side * 4.2;
    z = along;
    heading = dir > 0 ? 0 : Math.PI;
  }
  return makeCar(scene, x, z, heading, pickPaint(rng), 'parked', false);
}

export function createPoliceCar(scene, x, z, heading) {
  const car = makeCar(scene, x, z, heading, 0x1c2733, 'police', true);
  car.targetSpeed = 0;
  return car;
}

/** One traffic step: drive along the road, turn at intersections, slow for the car ahead. */
export function stepTraffic(car, dt, cars) {
  if (!car.alive) return;
  car.turnCooldown -= dt;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  // Slow down for a car close ahead.
  let want = car.targetSpeed;
  for (const other of cars) {
    if (other === car || !other.alive) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (ahead > 0 && ahead < 9 && side < 2.5) want = Math.min(want, other.speed * 0.5);
  }
  car.speed += (want - car.speed) * Math.min(1, dt * 2);
  car.x += fx * car.speed * dt;
  car.z += fz * car.speed * dt;
  // Near an intersection: maybe turn.
  const rx = nearestRoad(car.x);
  const rz = nearestRoad(car.z);
  const nearX = Math.abs(car.x - rx) < 3;
  const nearZ = Math.abs(car.z - rz) < 3;
  if (nearX && nearZ && car.turnCooldown <= 0) {
    car.turnCooldown = 1.2;
    const roll = Math.random();
    if (roll < 0.22) car.heading += Math.PI / 2;
    else if (roll < 0.44) car.heading -= Math.PI / 2;
    // At the city edge, turn back toward the centre instead of leaving.
    if (Math.abs(car.x) > 228 || Math.abs(car.z) > 228) {
      const toCentre = Math.atan2(-car.x, -car.z);
      car.heading = Math.round(toCentre / (Math.PI / 2)) * (Math.PI / 2);
    }
  }
  // Never leave the city.
  car.x = Math.max(-238, Math.min(238, car.x));
  car.z = Math.max(-238, Math.min(238, car.z));
  syncMesh(car);
}

/** Flash a police light bar; call every frame for police cars. */
export function updatePoliceLights(car, t) {
  if (!car.lightBar) return;
  const on = Math.sin(t * 12) > 0;
  const red = car.lightBar.userData.red;
  const blue = car.lightBar.userData.blue;
  // Alternate which half is lit, in both colour and glow, so the bar reads as
  // flashing from across the street.
  red.material.emissive.setHex(on ? 0xff0000 : 0x220000);
  red.material.color.setHex(on ? 0xff2a1a : 0x5a0f08);
  blue.material.emissive.setHex(on ? 0x000022 : 0x0000ff);
  blue.material.color.setHex(on ? 0x0a1a5a : 0x2266ff);
}
