// people.js — pedestrians walking the sidewalks, fleeing from danger.
// Phase B of the Solmar City fresh rebuild. Authored from the prose spec.
// No repo source file was read while writing this module.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const PED_COUNT = 16;
const WALK_SPEED = 1.2;
const FLEE_SPEED = 3.0;
const SIDEWALK_OFF = 6;

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c84a, 0x8a4ad8, 0xd87a4a, 0x4ad8d8, 0xe8e8e8];
const PANTS = [0x2a2f38, 0x3a3f4a, 0x5a4a3a, 0x2f3a2f];

function makePersonMesh(shirt, pants) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a080 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirtMat);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const legGeo = new THREE.BoxGeometry(0.2, 0.65, 0.24);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.geometry = legGeo;
  legL.position.set(-0.14, 0.35, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.14, 0.35, 0);
  // Pivot legs at the hip so they can swing: offset geometry upward.
  legL.geometry.translate(0, -0.32, 0);
  legL.position.y = 0.68;
  legR.geometry = legL.geometry;
  legR.position.y = 0.68;
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

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

export function createPeople(scene, city, rng) {
  const pedestrians = [];
  const lines = [];
  for (let v = -200; v <= 200; v += CONFIG.roadSpacing) lines.push(v);

  for (let i = 0; i < PED_COUNT; i++) {
    const axis = rng.pick(['x', 'z']);
    const line = rng.pick(lines);
    const dir = rng.pick([-1, 1]);
    const side = rng.pick([-1, 1]);
    const { group, legL, legR, armL, armR } = makePersonMesh(rng.pick(SHIRTS), rng.pick(PANTS));
    scene.add(group);
    const ped = {
      mesh: group, legL, legR, armL, armR,
      axis, line, dir, side,
      s: rng.range(-240, 240),
      x: 0, z: 0,
      heading: headingFor(axis, dir),
      speed: WALK_SPEED,
      walkPhase: rng.range(0, Math.PI * 2),
      fleeTimer: 0,
      fleeX: 0, fleeZ: 0,
      turnCooldown: rng.range(0, 4),
    };
    if (axis === 'x') { ped.x = ped.s; ped.z = line + side * SIDEWALK_OFF; }
    else { ped.x = line + side * SIDEWALK_OFF; ped.z = ped.s; }
    group.position.set(ped.x, 0, ped.z);
    group.rotation.y = ped.heading;
    pedestrians.push(ped);
  }

  const p = {
    pedestrians,

    step(dt, ctx) {
      const { player, state } = ctx;
      const driving = ctx.vehicles && ctx.vehicles.isDriving();
      for (const ped of pedestrians) {
        ped.turnCooldown -= dt;
        // Flee check: player driving close by, or player punching close by.
        const dxp = player.pos.x - ped.x;
        const dzp = player.pos.z - ped.z;
        const dp = Math.sqrt(dxp * dxp + dzp * dzp);
        let fleeing = ped.fleeTimer > 0;
        if (ped.fleeTimer <= 0) {
          if (driving && dp < 7) {
            ped.fleeTimer = 2.0;
            ped.fleeX = ped.x - dxp;
            ped.fleeZ = ped.z - dzp;
            fleeing = true;
          } else if (!driving && dp < 3 && ctx.punchPulse) {
            ped.fleeTimer = 2.0;
            ped.fleeX = ped.x - dxp;
            ped.fleeZ = ped.z - dzp;
            fleeing = true;
          }
        }
        // Police cars nearby also scare pedestrians.
        if (!fleeing && ctx.police) {
          for (const pc of ctx.police.cars) {
            const dx = pc.x - ped.x;
            const dz = pc.z - ped.z;
            if (dx * dx + dz * dz < 36) {
              ped.fleeTimer = 1.5;
              ped.fleeX = ped.x - dx;
              ped.fleeZ = ped.z - dz;
              fleeing = true;
              break;
            }
          }
        }
        if (fleeing) {
          ped.fleeTimer -= dt;
          const len = Math.hypot(ped.fleeX - ped.x, ped.fleeZ - ped.z) || 1;
          const ux = (ped.fleeX - ped.x) / len;
          const uz = (ped.fleeZ - ped.z) / len;
          ped.heading = Math.atan2(ux, uz);
          ped.x += ux * FLEE_SPEED * dt;
          ped.z += uz * FLEE_SPEED * dt;
          ped.speed = FLEE_SPEED;
        } else {
          ped.speed = WALK_SPEED;
          ped.s += ped.dir * ped.speed * dt;
          const nearestGrid = Math.round(ped.s / CONFIG.roadSpacing) * CONFIG.roadSpacing;
          if (Math.abs(ped.s - nearestGrid) < 1.2 && ped.turnCooldown <= 0 && Math.abs(ped.s) < 235) {
            if (Math.random() < 0.25) {
              const oldLine = ped.line;
              ped.line = nearestGrid;
              ped.s = oldLine;
              ped.axis = ped.axis === 'x' ? 'z' : 'x';
              ped.dir = Math.random() < 0.5 ? -1 : 1;
              ped.side = Math.random() < 0.5 ? -1 : 1;
              ped.heading = headingFor(ped.axis, ped.dir);
              ped.turnCooldown = 3;
            } else {
              ped.turnCooldown = 1.5;
            }
          }
          if (Math.abs(ped.s) > 240) {
            ped.dir *= -1;
            ped.s = Math.sign(ped.s) * 240;
            ped.heading = headingFor(ped.axis, ped.dir);
          }
          if (ped.axis === 'x') { ped.x = ped.s; ped.z = ped.line + ped.side * SIDEWALK_OFF; }
          else { ped.x = ped.line + ped.side * SIDEWALK_OFF; ped.z = ped.s; }
        }
        // Clamp inside the world.
        ped.x = Math.max(-248, Math.min(248, ped.x));
        ped.z = Math.max(-248, Math.min(248, ped.z));
        // Walk swing.
        ped.walkPhase += ped.speed * dt * 2.4;
        const swing = Math.sin(ped.walkPhase) * 0.55;
        ped.legL.rotation.x = swing;
        ped.legR.rotation.x = -swing;
        ped.armL.rotation.x = -swing * 0.8;
        ped.armR.rotation.x = swing * 0.8;
        ped.mesh.position.set(ped.x, 0, ped.z);
        ped.mesh.rotation.y = ped.heading;
      }
      void state;
    },
  };
  return p;
}
