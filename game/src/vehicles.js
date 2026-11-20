// vehicles.js — traffic AI, drivable / stealable cars, player driving.
// Phase B of the Solmar City fresh rebuild. Authored from the prose spec.
// No repo source file was read while writing this module.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const TRAFFIC_COUNT = 20;
const ROAD_MIN = -200;
const ROAD_MAX = 200;
const WORLD_EDGE = 245;
const LANE = 2.5;
const ENTER_DIST = 4.5;
const CAR_LENGTH = 4.2;
const CAR_WIDTH = 1.9;

const TRAFFIC_COLORS = [
  0xc0c8d0, 0x30343c, 0x7a1f1f, 0x1f4d7a, 0x3f6b3a,
  0xc8a03a, 0x6b4a8a, 0x8a8f96, 0x2a6b6b, 0xb05a2a,
];

function gridLines() {
  const lines = [];
  for (let v = ROAD_MIN; v <= ROAD_MAX; v += CONFIG.roadSpacing) lines.push(v);
  return lines;
}

function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xe8e8e8 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.55, CAR_LENGTH), bodyMat);
  body.position.y = 0.45;
  body.castShadow = true;
  group.add(body);
  const cabinMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a1d22 : 0x222831 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.1), cabinMat);
  cabin.position.set(0, 0.95, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.34, wz);
    group.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.7 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), lightMat);
    h.position.set(hx, 0.5, CAR_LENGTH / 2 + 0.01);
    group.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0x880000, emissive: 0xaa0000, emissiveIntensity: 0.5 });
  for (const tx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), tailMat);
    t.position.set(tx, 0.5, -CAR_LENGTH / 2 - 0.01);
    group.add(t);
  }
  let lightBar = null;
  if (isPolice) {
    lightBar = {};
    const redMat = new THREE.MeshLambertMaterial({ color: 0xcc0000, emissive: 0xff0000, emissiveIntensity: 2.5 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x0000cc, emissive: 0x0000ff, emissiveIntensity: 0.3 });
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), redMat);
    left.position.set(-0.38, 1.28, -0.25);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), blueMat);
    right.position.set(0.38, 1.28, -0.25);
    group.add(left);
    group.add(right);
    lightBar = { left, right, redMat, blueMat, phase: 0 };
  }
  return { group, wheels, lightBar };
}

function laneOffset(axis, dir) {
  // Right-hand traffic: offset to the right of the direction of travel.
  // Forward is (sin h, cos h); right is (-cos h, sin h).
  if (axis === 'x') return dir > 0 ? LANE : -LANE; // moving +-x: right is +-z
  return dir > 0 ? -LANE : LANE; // moving +-z: right is -+x
}

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function makeTrafficCar(scene, rng, lines) {
  const axis = rng.pick(['x', 'z']);
  const line = rng.pick(lines);
  const dir = rng.pick([-1, 1]);
  const color = rng.pick(TRAFFIC_COLORS);
  const { group, wheels } = makeCarMesh(color, false);
  scene.add(group);
  const car = {
    kind: 'traffic',
    mesh: group,
    wheels,
    x: 0, z: 0,
    heading: headingFor(axis, dir),
    speed: rng.range(6, 11),
    targetSpeed: rng.range(8, 12),
    axis, line, dir,
    s: rng.range(-240, 240),
    owned: false,
    driven: false,
    turnCooldown: rng.range(0, 3),
  };
  placeOnRoad(car);
  group.position.set(car.x, 0, car.z);
  group.rotation.y = car.heading;
  return car;
}

function placeOnRoad(car) {
  const off = laneOffset(car.axis, car.dir);
  if (car.axis === 'x') { car.x = car.s; car.z = car.line + off; }
  else { car.x = car.line + off; car.z = car.s; }
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

export function createVehicles(scene, city, rng) {
  const lines = gridLines();
  const cars = [];
  for (let i = 0; i < TRAFFIC_COUNT; i++) cars.push(makeTrafficCar(scene, rng, lines));

  const v = {
    cars,
    playerCar: null,
    isDriving: () => v.playerCar !== null,
    drivingSpeed: () => (v.playerCar ? Math.abs(v.playerCar.speed) : 0),

    tryEnter(player, ctx) {
      if (v.playerCar) return false;
      let best = null;
      let bestD = ENTER_DIST * ENTER_DIST;
      const all = [...cars];
      if (ctx.police) for (const pc of ctx.police.cars) all.push(pc);
      for (const car of all) {
        if (car.driven) continue;
        const d = dist2(player.pos.x, player.pos.z, car.x, car.z);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (!best) return false;
      const isPoliceCar = best.kind === 'police';
      if (!best.owned) {
        best.owned = true;
        if (ctx.police) ctx.police.raise(isPoliceCar ? 2 : 1, 'Grand Theft Auto', ctx.state);
      }
      best.driven = true;
      best.kind = 'player';
      v.playerCar = best;
      player.mesh.visible = false;
      player.pos.set(best.x, 0, best.z);
      player.heading = best.heading;
      return true;
    },

    exitCar(player, ctx) {
      const car = v.playerCar;
      if (!car) return false;
      // Step out on the right side of the car.
      const rx = -Math.cos(car.heading);
      const rz = Math.sin(car.heading);
      const ex = car.x + rx * 2.4;
      const ez = car.z + rz * 2.4;
      car.driven = false;
      car.kind = 'parked';
      car.speed = 0;
      v.playerCar = null;
      player.mesh.visible = true;
      player.pos.set(ex, 0, ez);
      player.heading = car.heading;
      if (ctx.audio) ctx.audio.setEngine(0);
      return true;
    },

    step(dt, ctx) {
      const { input, player, state } = ctx;
      const others = [];
      if (ctx.police) for (const pc of ctx.police.cars) others.push(pc);
      if (ctx.people) for (const ped of ctx.people.pedestrians) others.push({ x: ped.x, z: ped.z, kind: 'ped', speed: 0 });

      // --- traffic AI ---
      for (const car of cars) {
        if (car.driven || car.kind === 'parked' || car.kind === 'player') continue;
        car.turnCooldown -= dt;
        // Who is ahead of this car (same heading corridor)?
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        let want = car.targetSpeed;
        const checkAhead = (ox, oz, ospeed, stopDist) => {
          const dx = ox - car.x;
          const dz = oz - car.z;
          const along = dx * fx + dz * fz;
          const side = Math.abs(dx * fz - dz * fx);
          if (along > 0 && along < 16 && side < 2.6) {
            if (along < stopDist) want = 0;
            else want = Math.min(want, Math.max(0, ospeed));
          }
        };
        for (const o of cars) {
          if (o === car || o.driven) continue;
          checkAhead(o.x, o.z, o.speed, 6);
        }
        for (const o of others) {
          if (o.kind === 'ped') checkAhead(o.x, o.z, 0, 8);
          else checkAhead(o.x, o.z, o.speed || 0, 7);
        }
        if (v.playerCar) checkAhead(v.playerCar.x, v.playerCar.z, v.playerCar.speed, 6);
        // Player on foot ahead: stop.
        if (!v.playerCar) {
          const dx = player.pos.x - car.x;
          const dz = player.pos.z - car.z;
          const along = dx * fx + dz * fz;
          const side = Math.abs(dx * fz - dz * fx);
          if (along > 0 && along < 9 && side < 2.2) want = 0;
        }
        // Accelerate / brake toward want.
        if (car.speed < want) car.speed = Math.min(want, car.speed + 4 * dt);
        else if (car.speed > want) car.speed = Math.max(want, car.speed - 9 * dt);
        // Advance along the road.
        car.s += car.dir * car.speed * dt;
        // Intersection: maybe turn.
        const nearestGrid = Math.round(car.s / CONFIG.roadSpacing) * CONFIG.roadSpacing;
        if (Math.abs(car.s - nearestGrid) < 1.6 && car.turnCooldown <= 0 && Math.abs(car.s) < 235) {
          if (Math.random() < 0.3) {
            const oldLine = car.line;
            car.line = nearestGrid;
            car.s = oldLine;
            car.axis = car.axis === 'x' ? 'z' : 'x';
            car.dir = Math.random() < 0.5 ? -1 : 1;
            car.heading = headingFor(car.axis, car.dir);
            car.turnCooldown = 2.5;
          } else {
            car.turnCooldown = 1.2;
          }
        }
        // World edge: U-turn.
        if (Math.abs(car.s) > WORLD_EDGE) {
          car.dir *= -1;
          car.s = Math.sign(car.s) * WORLD_EDGE;
          car.heading = headingFor(car.axis, car.dir);
        }
        placeOnRoad(car);
        car.mesh.position.set(car.x, 0, car.z);
        car.mesh.rotation.y = car.heading;
        for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.34;
      }

      // --- player driving ---
      const pc = v.playerCar;
      if (pc && state.mode === 'play') {
        const ax = input.axis();
        const handbrake = input.isDown('Space');
        const topSpeed = 30;
        const reverseTop = 10;
        if (ax.y > 0) {
          pc.speed = Math.min(topSpeed, pc.speed + 14 * dt);
        } else if (ax.y < 0) {
          if (pc.speed > 0.5) pc.speed = Math.max(0, pc.speed - 22 * dt);
          else pc.speed = Math.max(-reverseTop, pc.speed - 8 * dt);
        } else {
          pc.speed -= pc.speed * Math.min(1, 0.6 * dt);
          if (Math.abs(pc.speed) < 0.05) pc.speed = 0;
        }
        if (handbrake) {
          pc.speed -= pc.speed * Math.min(1, 4 * dt);
          if (Math.abs(pc.speed) < 0.5) pc.speed = 0;
        }
        // Steering: D turns toward screen-right (heading decreases).
        const steer = ax.x;
        const rate = 1.9 * Math.min(1, Math.abs(pc.speed) / 10) * (handbrake ? 1.5 : 1);
        pc.heading -= steer * rate * dt * Math.sign(pc.speed || 1);
        // Move with building collision (axis separated, car radius ~1.3).
        const nx = pc.x + Math.sin(pc.heading) * pc.speed * dt;
        const nz = pc.z + Math.cos(pc.heading) * pc.speed * dt;
        const blocked = (x, z) => {
          for (const c of city.colliders) {
            if (x > c.minX - 1.3 && x < c.maxX + 1.3 && z > c.minZ - 1.3 && z < c.maxZ + 1.3) return true;
          }
          return Math.abs(x) > 248 || Math.abs(z) > 248;
        };
        if (!blocked(nx, pc.z)) pc.x = nx;
        else pc.speed *= 0.6;
        if (!blocked(pc.x, nz)) pc.z = nz;
        else pc.speed *= 0.6;
        // Car-car bump: 30% speed cut for NON-police cars only; police push apart.
        let bumped = false;
        const bumpList = [...cars, ...others.filter((o) => o.kind !== 'ped')];
        for (const o of bumpList) {
          if (o === pc || o.driven) continue;
          const dx = pc.x - o.x;
          const dz = pc.z - o.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < CONFIG.bumpDistance && d > 0.001) {
            // Push apart so the contact does not persist.
            const push = (CONFIG.bumpDistance - d) / 2;
            const ux = dx / d, uz = dz / d;
            pc.x += ux * push;
            pc.z += uz * push;
            if (o.kind !== 'police' && !o.driven) {
              o.x -= ux * push;
              o.z -= uz * push;
              if (o.mesh) { o.mesh.position.x = o.x; o.mesh.position.z = o.z; }
            }
            if (o.kind !== 'police') bumped = true;
          }
        }
        if (bumped) pc.speed *= 1 - CONFIG.bumpSpeedCut;
        pc.mesh.position.set(pc.x, 0, pc.z);
        pc.mesh.rotation.y = pc.heading;
        for (const w of pc.wheels) w.rotation.x += (pc.speed * dt) / 0.34;
        // Sync the player onto the car.
        player.pos.set(pc.x, 0, pc.z);
        player.heading = pc.heading;
        player.speed = Math.abs(pc.speed);
        player.moving = Math.abs(pc.speed) > 0.5;
        state.speed = Math.abs(pc.speed);
        if (ctx.audio) ctx.audio.setEngine(Math.min(1, Math.abs(pc.speed) / topSpeed));
      }

      // --- traffic cars pushing the on-foot player aside (no damage) ---
      if (!v.playerCar && state.mode === 'play') {
        for (const car of cars) {
          if (car.driven || car.kind === 'parked' || car.kind === 'player') continue;
          const dx = player.pos.x - car.x;
          const dz = player.pos.z - car.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < 2.6 && d > 0.001) {
            player.pos.x = car.x + (dx / d) * 2.6;
            player.pos.z = car.z + (dz / d) * 2.6;
          }
        }
      }
    },
  };
  return v;
}
