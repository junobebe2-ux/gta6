// The police: cars that hunt the player along the roads and foot cops who run
// them down. Counts follow the wanted level. A cop that holds the player on foot
// busts them; a police car that rams the player's car hurts them. When the heat is
// off, the police drive away.
import * as THREE from 'three';
import { WANTED } from './config.js';
import { createPoliceCar, updatePoliceLights } from './vehicles.js';
import { createPersonMesh, animateWalk } from './people.js';

const CAR_SPAWN_MIN = 55;
const CAR_SPAWN_MAX = 110;
const COP_SPAWN_MIN = 25;
const COP_SPAWN_MAX = 60;
const RAM_RANGE = 3.2;
const RAM_COOLDOWN = 2.5;
const RAM_DAMAGE_CAR = 5;
const RAM_DAMAGE_FOOT = 22;
const COP_SPEED = 7.2;
const COP_PUNCH_DAMAGE = 7;
const COP_PUNCH_EVERY = 0.8;
const BUST_RANGE = 2.1;

function wrapAngle(a) {
  let d = a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// A road point at some distance from (px, pz), or a fallback if none is found.
function spawnSpot(city, px, pz, rng, minD, maxD) {
  for (let tries = 0; tries < 12; tries += 1) {
    const p = city.roadPoint();
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d >= minD && d <= maxD) return p;
  }
  return { x: px + 70, z: pz };
}

export function createPolice(scene, city, rng) {
  return { scene, city, rng, cars: [], cops: [] };
}

function addPoliceCar(police, px, pz) {
  const spot = spawnSpot(police.city, px, pz, police.rng, CAR_SPAWN_MIN, CAR_SPAWN_MAX);
  const heading = Math.atan2(px - spot.x, pz - spot.z);
  const car = createPoliceCar(police.scene, spot.x, spot.z, heading);
  car.speed = 12;
  police.cars.push(car);
  return car;
}

function addFootCop(police, px, pz) {
  const spot = spawnSpot(police.city, px, pz, police.rng, COP_SPAWN_MIN, COP_SPAWN_MAX);
  const { group, parts } = createPersonMesh(0x1c2a44, 0x1c2733, 0xe8b88a, 1.06);
  // A cap, so cops read as cops at a glance.
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: 0x10161f }));
  cap.position.y = 1.62;
  group.add(cap);
  police.scene.add(group);
  const cop = {
    group,
    parts,
    x: spot.x,
    z: spot.z,
    heading: 0,
    speed: 0,
    phase: 0,
    holdTimer: 0,
    punchTimer: 0,
    alive: true,
  };
  group.position.set(cop.x, 0, cop.z);
  police.cops.push(cop);
  return cop;
}

function dropCar(police, car) {
  police.scene.remove(car.group);
  police.cars.splice(police.cars.indexOf(car), 1);
}

function dropCop(police, cop) {
  police.scene.remove(cop.group);
  police.cops.splice(police.cops.indexOf(cop), 1);
}

function chaseCar(police, car, ctx) {
  const { wanted, dt } = ctx;
  const dx = ctx.x - car.x;
  const dz = ctx.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (wanted === 0 && dist > 130) {
    dropCar(police, car);
    return;
  }
  // Far away the chase snaps to the road grid; up close it steers straight at the player.
  const snap = dist > 28 ? Math.PI / 2 : 0.35;
  let desired = Math.atan2(dx, dz);
  if (snap > 0.4) desired = Math.round(desired / snap) * snap;
  const turnRate = dist > 28 ? 2.4 : 3.6;
  car.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, wrapAngle(desired - car.heading)));
  const targetSpeed = wanted === 0 ? 10 : Math.min(30, 20 + wanted * 2.5 + (dist < 20 ? 6 : 0));
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
  const ox = car.x;
  const oz = car.z;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const fixed = police.city.collideCircle(car.x, car.z, 2.1);
  car.x = fixed.x;
  car.z = fixed.z;
  if (Math.hypot(car.x - ox, car.z - oz) < car.speed * dt * 0.25 && car.speed > 4) {
    // Stuck on a building: back off and pick a new heading.
    car.heading += Math.PI / 2;
    car.x = ox;
    car.z = oz;
  }
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  updatePoliceLights(car, ctx.t);
  // Ram the player (once per cooldown, so three cars cannot melt them in a
  // second). The cooldown is generous on purpose: a 3-star chase has to be
  // survivable for the ~28 s it takes the heat to decay, so ramming pressures
  // the player without ending the run in a few seconds.
  const pd = Math.hypot(ctx.x - car.x, ctx.z - car.z);
  car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
  if (pd < RAM_RANGE && car.ramCooldown <= 0) {
    car.ramCooldown = RAM_COOLDOWN;
    ctx.onPlayerDamage(ctx.inCar ? RAM_DAMAGE_CAR : RAM_DAMAGE_FOOT, 'ram');
    // Bounce the police car off so it does not grind the player every frame.
    car.x -= Math.sin(car.heading) * 4;
    car.z -= Math.cos(car.heading) * 4;
    car.speed *= 0.4;
  }
}

function chaseCop(police, cop, ctx) {
  const { wanted, dt } = ctx;
  if (!cop.alive) return;
  const dx = ctx.x - cop.x;
  const dz = ctx.z - cop.z;
  const dist = Math.hypot(dx, dz);
  if (wanted === 0 && dist > 120) {
    dropCop(police, cop);
    return;
  }
  cop.heading = Math.atan2(dx, dz);
  cop.speed = COP_SPEED;
  cop.x += Math.sin(cop.heading) * cop.speed * dt;
  cop.z += Math.cos(cop.heading) * cop.speed * dt;
  const fixed = police.city.collideCircle(cop.x, cop.z, 0.6);
  cop.x = fixed.x;
  cop.z = fixed.z;
  cop.phase += cop.speed * dt * 1.6;
  animateWalk(cop.parts, cop.phase, 0.9);
  cop.group.position.set(cop.x, 0, cop.z);
  cop.group.rotation.y = cop.heading;
  if (!ctx.inCar && dist < BUST_RANGE) {
    cop.punchTimer -= dt;
    if (cop.punchTimer <= 0) {
      cop.punchTimer = COP_PUNCH_EVERY;
      ctx.onPlayerDamage(COP_PUNCH_DAMAGE, 'cop');
    }
    cop.holdTimer += dt;
    if (cop.holdTimer >= WANTED.bustedHold) {
      ctx.onBusted();
      cop.holdTimer = 0;
    }
  } else {
    cop.holdTimer = Math.max(0, cop.holdTimer - dt * 2);
  }
}

/**
 * One police step. ctx: {x, z, inCar, wanted, dt, t, cars, onPlayerDamage(amount, kind),
 * onBusted(), city}. Police cars ram; foot cops chase on foot and hold the player to bust them.
 */
export function stepPolice(police, ctx) {
  const { wanted } = ctx;
  const wantCars = wanted >= 1 ? Math.min(WANTED.maxPoliceCars, wanted * WANTED.policeCarPerStar) : 0;
  const wantCops = wanted >= WANTED.footCopsAt ? Math.min(WANTED.maxFootCops, wanted - 1) : 0;
  while (police.cars.length < wantCars) addPoliceCar(police, ctx.x, ctx.z);
  while (police.cops.length < wantCops) addFootCop(police, ctx.x, ctx.z);

  for (const car of [...police.cars]) chaseCar(police, car, ctx);
  for (const cop of [...police.cops]) chaseCop(police, cop, ctx);
}

/** Clear every police unit (a fresh start, or the heat going quiet for good). */
export function clearPolice(police) {
  for (const car of [...police.cars]) dropCar(police, car);
  for (const cop of [...police.cops]) dropCop(police, cop);
}
