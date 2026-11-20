// police.js — wanted level, police cars + foot cops, chase, ram, bust, decay.
// Phase B of the Solmar City fresh rebuild. Authored from the prose spec.
// No repo source file was read while writing this module.
// Contract for Phase C (missions): set state.robbing = true while the bank
// robbery hold is active; police still converge but never ram or bust then.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const RAM_DIST = 3.2;
const BUST_DIST = 1.8;
const BUST_TIME = 1.5;
const COP_RUN_SPEED = 5.5;
const SPAWN_CAR_DIST = 75;
const SPAWN_COP_DIST = 30;
const SIREN_INTERVAL = 2.5;

function desiredCounts(wanted) {
  if (wanted <= 0) return { cars: 0, cops: 0 };
  if (wanted === 1) return { cars: 1, cops: 0 };
  if (wanted === 2) return { cars: 2, cops: 0 };
  if (wanted === 3) return { cars: 2, cops: 1 };
  if (wanted === 4) return { cars: 3, cops: 2 };
  return { cars: 4, cops: 2 };
}

function makePoliceCarMesh() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.2), bodyMat);
  body.position.y = 0.45;
  body.castShadow = true;
  group.add(body);
  const cabinMat = new THREE.MeshLambertMaterial({ color: 0x1a1d22 });
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
  const redMat = new THREE.MeshLambertMaterial({ color: 0xcc0000, emissive: 0xff0000, emissiveIntensity: 2.5 });
  const blueMat = new THREE.MeshLambertMaterial({ color: 0x0000cc, emissive: 0x0000ff, emissiveIntensity: 0.3 });
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), redMat);
  left.position.set(-0.38, 1.28, -0.25);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), blueMat);
  right.position.set(0.38, 1.28, -0.25);
  group.add(left);
  group.add(right);
  return { group, wheels, lightBar: { left, right, redMat, blueMat, phase: 0 } };
}

function makeCopMesh() {
  const group = new THREE.Group();
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c2a4a });
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0x2a4a7a });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd8a080 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirtMat);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.38), darkMat);
  cap.position.y = 1.82;
  group.add(cap);
  const legGeo = new THREE.BoxGeometry(0.2, 0.65, 0.24);
  legGeo.translate(0, -0.32, 0);
  const legL = new THREE.Mesh(legGeo, darkMat);
  legL.position.set(-0.14, 0.68, 0);
  const legR = new THREE.Mesh(legGeo, darkMat);
  legR.position.set(0.14, 0.68, 0);
  group.add(legL);
  group.add(legR);
  const armGeo = new THREE.BoxGeometry(0.16, 0.6, 0.2);
  armGeo.translate(0, -0.28, 0);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.36, 1.32, 0);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.36, 1.32, 0);
  group.add(armL);
  group.add(armR);
  return { group, legL, legR, armL, armR };
}

function turnToward(current, target, maxStep) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) d = maxStep;
  if (d < -maxStep) d = -maxStep;
  return current + d;
}

export function createPolice(scene, city, rng) {
  const pol = {
    cars: [],
    cops: [],
    busted: false,
    _decayTimer: 0,
    _sirenTimer: 0,
    _reasonTimer: 0,
    _adoptedDone: false,

    raise(n, reason, state) {
      const st = state || pol._state;
      if (!st) return;
      st.wanted = Math.min(CONFIG.wantedMax, st.wanted + n);
      if (reason) {
        st.wantedReason = reason;
        pol._reasonTimer = 0;
      }
      pol._decayTimer = 0;
    },

    nearestDistance(px, pz) {
      let best = null;
      for (const u of [...pol.cars, ...pol.cops]) {
        const d = Math.hypot(u.x - px, u.z - pz);
        if (best === null || d < best) best = d;
      }
      return best;
    },

    _spawnCar(ctx, atX, atZ) {
      const { group, wheels, lightBar } = makePoliceCarMesh();
      scene.add(group);
      let x, z;
      if (atX !== undefined) { x = atX; z = atZ; }
      else {
        // Spawn on a road 60-90 m from the player.
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(60, 90);
        x = Math.max(-240, Math.min(240, ctx.player.pos.x + Math.sin(a) * d));
        z = Math.max(-240, Math.min(240, ctx.player.pos.z + Math.cos(a) * d));
        x = Math.round(x / CONFIG.roadSpacing) * CONFIG.roadSpacing;
        z = Math.round(z / CONFIG.roadSpacing) * CONFIG.roadSpacing;
      }
      const car = {
        kind: 'police', mesh: group, wheels, lightBar,
        x, z, heading: 0, speed: 0,
        ramCooldown: 0, lightTimer: 0, shot: atX !== undefined,
      };
      group.position.set(x, 0, z);
      pol.cars.push(car);
      return car;
    },

    _spawnCop(ctx, atX, atZ) {
      const { group, legL, legR, armL, armR } = makeCopMesh();
      scene.add(group);
      let x, z;
      if (atX !== undefined) { x = atX; z = atZ; }
      else {
        const a = rng.range(0, Math.PI * 2);
        const d = rng.range(20, 40);
        x = Math.max(-245, Math.min(245, ctx.player.pos.x + Math.sin(a) * d));
        z = Math.max(-245, Math.min(245, ctx.player.pos.z + Math.cos(a) * d));
      }
      const cop = {
        kind: 'cop', mesh: group, legL, legR, armL, armR,
        x, z, heading: 0, speed: 0,
        bustTimer: 0, stunTimer: 0, walkPhase: rng.range(0, Math.PI * 2),
        shot: atX !== undefined,
      };
      group.position.set(x, 0, z);
      pol.cops.push(cop);
      return cop;
    },

    _removeUnit(list, unit) {
      scene.remove(unit.mesh);
      const i = list.indexOf(unit);
      if (i >= 0) list.splice(i, 1);
    },

    step(dt, ctx) {
      const { player, state } = ctx;
      pol._state = state;
      pol._reasonTimer += dt;
      const want = desiredCounts(state.wanted);

      // Adopt placeholder police set by a screenshot scene (plain {x, z}).
      // One-time only, and only before any unit exists: the step rewrites
      // state.police from the live units each frame, so re-adopting the
      // published positions would spawn duplicates forever.
      if (!pol._adoptedDone && state.police && state.police.length > 0 && pol.cars.length === 0 && pol.cops.length === 0) {
        for (let i = 0; i < state.police.length; i++) {
          const ph = state.police[i];
          if (!ph || typeof ph.x !== 'number') continue;
          // First half of the placeholders become cars, the rest foot cops.
          if (i < Math.ceil(state.police.length / 2)) pol._spawnCar(ctx, ph.x, ph.z);
          else pol._spawnCop(ctx, ph.x, ph.z);
        }
        pol._adoptedDone = true;
      }
      // Spawn up to the desired counts (adopted shot police count toward it).
      if (pol.cars.length < want.cars) {
        for (let i = pol.cars.length; i < want.cars; i++) pol._spawnCar(ctx);
      }
      if (pol.cops.length < want.cops) {
        for (let i = pol.cops.length; i < want.cops; i++) pol._spawnCop(ctx);
      }
      // Despawn the farthest non-shot units when wanted dropped.
      if (state.wanted === 0) {
        for (const c of [...pol.cars]) pol._removeUnit(pol.cars, c);
        for (const c of [...pol.cops]) pol._removeUnit(pol.cops, c);
      } else {
        const overCars = pol.cars.filter((c) => !c.shot).length - want.cars;
        const overCops = pol.cops.filter((c) => !c.shot).length - want.cops;
        const dropFarthest = (list, n) => {
          const sorted = [...list].filter((u) => !u.shot)
            .sort((a, b) => Math.hypot(b.x - player.pos.x, b.z - player.pos.z) - Math.hypot(a.x - player.pos.x, a.z - player.pos.z));
          for (let i = 0; i < n && i < sorted.length; i++) pol._removeUnit(list, sorted[i]);
        };
        if (overCars > 0) dropFarthest(pol.cars, overCars);
        if (overCops > 0) dropFarthest(pol.cops, overCops);
      }

      const robbing = !!state.robbing;
      // Screenshot scenes are staged: police chase but never damage the
      // player there, so a chase shot cannot turn into a WASTED screen
      // on a fast machine before the screenshot is taken.
      const noDamage = robbing || !!state.isShot;

      // --- police cars: chase, ram ---
      for (const car of pol.cars) {
        car.ramCooldown -= dt;
        car.lightTimer += dt;
        // Light bar: alternate glow AND colour every ~0.35 s.
        if (car.lightTimer > 0.35) {
          car.lightTimer = 0;
          car.lightBar.phase = 1 - car.lightBar.phase;
          const p = car.lightBar.phase;
          car.lightBar.redMat.emissiveIntensity = p === 0 ? 2.5 : 0.3;
          car.lightBar.blueMat.emissiveIntensity = p === 0 ? 0.3 : 2.5;
        }
        const dx = player.pos.x - car.x;
        const dz = player.pos.z - car.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        const desiredHeading = Math.atan2(dx, dz);
        car.heading = turnToward(car.heading, desiredHeading, 2.4 * dt);
        // Slow down when close so the car does not overshoot the player.
        const target = dist < 6 ? 6 : CONFIG.policeTopSpeed;
        if (car.speed < target) car.speed = Math.min(target, car.speed + 10 * dt);
        else if (car.speed > target) car.speed = Math.max(target, car.speed - 12 * dt);
        const nx = car.x + Math.sin(car.heading) * car.speed * dt;
        const nz = car.z + Math.cos(car.heading) * car.speed * dt;
        const blocked = (x, z) => {
          for (const c of city.colliders) {
            if (x > c.minX - 1.3 && x < c.maxX + 1.3 && z > c.minZ - 1.3 && z < c.maxZ + 1.3) return true;
          }
          return Math.abs(x) > 248 || Math.abs(z) > 248;
        };
        if (!blocked(nx, car.z)) car.x = nx;
        if (!blocked(car.x, nz)) car.z = nz;
        car.mesh.position.set(car.x, 0, car.z);
        car.mesh.rotation.y = car.heading;
        for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.34;
        // Ram: damage + shove, with a per-car cooldown. Never while robbing
        // or in a staged screenshot scene.
        if (!noDamage && dist < RAM_DIST && car.ramCooldown <= 0 && car.speed > 2) {
          const driving = ctx.vehicles && ctx.vehicles.isDriving();
          const dmg = driving ? CONFIG.policeRamDamageCar : CONFIG.policeRamDamageFoot;
          state.health = Math.max(0, state.health - dmg);
          car.ramCooldown = CONFIG.policeRamCooldown;
          car.speed *= 0.5;
          // Shove the player away from the police car.
          const ux = dx / dist, uz = dz / dist;
          if (driving && ctx.vehicles.playerCar) {
            ctx.vehicles.playerCar.x += ux * 1.6;
            ctx.vehicles.playerCar.z += uz * 1.6;
            ctx.vehicles.playerCar.speed *= 0.85;
          } else {
            player.pos.x += ux * 1.6;
            player.pos.z += uz * 1.6;
          }
          if (ctx.audio) ctx.audio.punch();
        }
      }

      // --- foot cops: chase, bust ---
      for (const cop of pol.cops) {
        if (cop.stunTimer > 0) {
          cop.stunTimer -= dt;
          cop.bustTimer = 0;
          continue;
        }
        const dx = player.pos.x - cop.x;
        const dz = player.pos.z - cop.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        cop.heading = Math.atan2(dx, dz);
        const driving = ctx.vehicles && ctx.vehicles.isDriving();
        if (dist > 2) {
          cop.speed = COP_RUN_SPEED;
          cop.x += (dx / dist) * cop.speed * dt;
          cop.z += (dz / dist) * cop.speed * dt;
        } else {
          cop.speed = 0;
        }
        cop.walkPhase += cop.speed * dt * 2.4;
        const swing = Math.sin(cop.walkPhase) * 0.55;
        cop.legL.rotation.x = swing;
        cop.legR.rotation.x = -swing;
        cop.armL.rotation.x = -swing * 0.8;
        cop.armR.rotation.x = swing * 0.8;
        cop.mesh.position.set(cop.x, 0, cop.z);
        cop.mesh.rotation.y = cop.heading;
        // Bust: only on foot, only while not robbing / not a staged scene.
        if (!noDamage && !driving && dist < BUST_DIST) {
          cop.bustTimer += dt;
          if (cop.bustTimer >= BUST_TIME) pol.busted = true;
        } else {
          cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
        }
      }

      // --- wanted decay: no police within 30 m for 10 s -> wanted -1 ---
      const nearest = pol.nearestDistance(player.pos.x, player.pos.z);
      if (state.wanted > 0) {
        if (nearest === null || nearest > CONFIG.wantedDecayDistance) {
          pol._decayTimer += dt;
          if (pol._decayTimer >= CONFIG.wantedDecayTime) {
            state.wanted -= 1;
            pol._decayTimer = 0;
            if (state.wanted === 0) state.wantedReason = 'Clean';
          }
        } else {
          pol._decayTimer = 0;
        }
        // Reason becomes "Chase" once the specific reason is a few seconds old.
        if (pol._reasonTimer > 4 && state.wantedReason !== 'Chase') {
          state.wantedReason = 'Chase';
        }
        // Siren while wanted.
        pol._sirenTimer += dt;
        if (pol._sirenTimer >= SIREN_INTERVAL) {
          pol._sirenTimer = 0;
          if (ctx.audio) ctx.audio.siren();
        }
      }

      // Publish plain positions for the HUD / minimap / debug state.
      state.police = [...pol.cars, ...pol.cops].map((u) => ({ x: u.x, z: u.z }));
    },
  };
  return pol;
}
