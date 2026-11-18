// The police: cars that hunt the player along the roads and foot cops who run them
// down. Counts follow the wanted level. A cop that holds the player on foot busts
// them; a police car that rams the player's car hurts them. When the heat is off, the
// police drive away.
import * as THREE from 'three';
import { WANTED } from './config.js';
import { createPoliceCar, updatePoliceLights } from './vehicles.js';
import { createPersonMesh, animateWalk } from './people.js';

function spawnPointNear(city, px, pz, rng, minD, maxD) {
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

function spawnPoliceCar(police, px, pz) {
  const spot = spawnPointNear(police.city, px, pz, police.rng, 55, 110);
  const heading = Math.atan2(px - spot.x, pz - spot.z);
  const car = createPoliceCar(police.scene, spot.x, spot.z, heading);
  car.speed = 12;
  police.cars.push(car);
  return car;
}

function spawnFootCop(police, px, pz) {
  const spot = spawnPointNear(police.city, px, pz, police.rng, 25, 60);
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

function removeCar(police, car) {
  police.scene.remove(car.group);
  police.cars.splice(police.cars.indexOf(car), 1);
}

function removeCop(police, cop) {
  police.scene.remove(cop.group);
  police.cops.splice(police.cops.indexOf(cop), 1);
}

function angleDiff(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * One police step. ctx: {x, z, inCar, wanted, dt, t, cars, onPlayerDamage(amount, kind),
 * onBusted(), city}. Police cars ram; foot cops chase on foot and hold the player to bust them.
 */
export function stepPolice(police, ctx) {
  const { wanted, dt } = ctx;
  const wantCars = wanted >= 1 ? Math.min(WANTED.maxPoliceCars, wanted * WANTED.policeCarPerStar) : 0;
  const wantCops = wanted >= WANTED.footCopsAt ? Math.min(WANTED.maxFootCops, wanted - 1) : 0;
  while (police.cars.length < wantCars) spawnPoliceCar(police, ctx.x, ctx.z);
  while (police.cops.length < wantCops) spawnFootCop(police, ctx.x, ctx.z);

  // Police cars: chase along the roads, ram when close.
  for (const car of [...police.cars]) {
    const dx = ctx.x - car.x;
    const dz = ctx.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (wanted === 0 && dist > 130) {
      removeCar(police, car);
      continue;
    }
    const snap = dist > 28 ? Math.PI / 2 : 0.35;
    let desired = Math.atan2(dx, dz);
    if (snap > 0.4) desired = Math.round(desired / snap) * snap;
    const turnRate = dist > 28 ? 2.4 : 3.6;
    car.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, angleDiff(desired, car.heading)));
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
    // Ram the player (once per cooldown, so three cars cannot melt them in a second).
    const pd = Math.hypot(ctx.x - car.x, ctx.z - car.z);
    car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
    if (pd < 3.2 && car.ramCooldown <= 0) {
      car.ramCooldown = 1.2;
      ctx.onPlayerDamage(ctx.inCar ? 6 : 22, 'ram');
      // Bounce the police car off so it does not grind the player every frame.
      car.x -= Math.sin(car.heading) * 4;
      car.z -= Math.cos(car.heading) * 4;
      car.speed *= 0.4;
    }
  }

  // Foot cops: run the player down on foot.
  for (const cop of [...police.cops]) {
    if (!cop.alive) continue;
    const dx = ctx.x - cop.x;
    const dz = ctx.z - cop.z;
    const dist = Math.hypot(dx, dz);
    if (wanted === 0 && dist > 120) {
      removeCop(police, cop);
      continue;
    }
    cop.heading = Math.atan2(dx, dz);
    cop.speed = 7.2;
    cop.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.z += Math.cos(cop.heading) * cop.speed * dt;
    const fixed = police.city.collideCircle(cop.x, cop.z, 0.6);
    cop.x = fixed.x;
    cop.z = fixed.z;
    cop.phase += cop.speed * dt * 1.6;
    animateWalk(cop.parts, cop.phase, 0.9);
    cop.group.position.set(cop.x, 0, cop.z);
    cop.group.rotation.y = cop.heading;
    if (!ctx.inCar && dist < 2.1) {
      cop.punchTimer -= dt;
      if (cop.punchTimer <= 0) {
        cop.punchTimer = 0.8;
        ctx.onPlayerDamage(7, 'cop');
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
}

/** Clear every police unit (a fresh start, or the heat going quiet for good). */
export function clearPolice(police) {
  for (const car of [...police.cars]) removeCar(police, car);
  for (const cop of [...police.cops]) removeCop(police, cop);
}
