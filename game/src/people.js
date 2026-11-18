// People: pedestrians who walk the sidewalks (and run when scared) and the player's
// own low-poly character. Every person is boxes: legs and arms that swing with the
// walk cycle, a jacket body, a head. No model files.
import * as THREE from 'three';
import { PEDS } from './config.js';

const SKIN = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0];
const JACKETS = [0xd8d8d8, 0x7a4a3a, 0x3a5a7a, 0x5a7a3a, 0xc2a040, 0x8a6fd8, 0x4a4a4a, 0xb85a5a];
const PANTS = [0x2c313a, 0x3a4a6a, 0x5a4632, 0x4a4a4a];

function limb(w, h, d, mat, px, py) {
  const pivot = new THREE.Group();
  pivot.position.set(px, py, 0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.y = -h / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

export function createPersonMesh(jacketColor, pantsColor, skinColor, scale) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: jacketColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const legL = limb(0.22, 0.55, 0.24, pants, -0.14, 0.55);
  const legR = limb(0.22, 0.55, 0.24, pants, 0.14, 0.55);
  const armL = limb(0.16, 0.55, 0.18, jacket, -0.4, 1.18);
  const armR = limb(0.16, 0.55, 0.18, jacket, 0.4, 1.18);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.34), jacket);
  body.position.y = 0.88;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
  head.position.y = 1.38;
  head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
  hair.position.y = 1.58;
  group.add(legL, legR, armL, armR, body, head, hair);
  group.scale.setScalar(scale || 1);
  return { group, parts: { legL, legR, armL, armR, body, head } };
}

/** Swing the limbs for a walk cycle; phase advances with distance walked. */
export function animateWalk(parts, phase, amount) {
  const s = Math.sin(phase) * amount;
  parts.legL.rotation.x = s;
  parts.legR.rotation.x = -s;
  parts.armL.rotation.x = -s * 0.8;
  parts.armR.rotation.x = s * 0.8;
}

function randomOutfit(rng) {
  return {
    jacket: JACKETS[Math.floor(rng.next() * JACKETS.length)],
    pants: PANTS[Math.floor(rng.next() * PANTS.length)],
    skin: SKIN[Math.floor(rng.next() * SKIN.length)],
    scale: rng.range(0.92, 1.05),
  };
}

export function createPedestrian(scene, city, rng) {
  const spot = city.sidewalkPoint();
  const outfit = randomOutfit(rng);
  const { group, parts } = createPersonMesh(outfit.jacket, outfit.pants, outfit.skin, outfit.scale);
  scene.add(group);
  const ped = {
    group,
    parts,
    x: spot.x,
    z: spot.z,
    heading: rng.range(0, Math.PI * 2),
    speed: 0,
    state: 'walk', // 'walk' | 'flee' | 'dead'
    target: city.sidewalkPoint(),
    health: 100,
    phase: rng.range(0, 6),
    deadTimer: 0,
    fleeTimer: 0,
    fleeFrom: null,
  };
  group.position.set(ped.x, 0, ped.z);
  group.rotation.y = ped.heading;
  return ped;
}

/** One pedestrian step. threat is {x, z} when a gunshot or explosion just scared the street. */
export function stepPedestrian(ped, dt, city, threat) {
  if (ped.state === 'dead') {
    ped.deadTimer -= dt;
    return;
  }
  if (threat) {
    const dx = ped.x - threat.x;
    const dz = ped.z - threat.z;
    if (Math.hypot(dx, dz) < 30) {
      ped.state = 'flee';
      ped.fleeTimer = 3;
      ped.fleeFrom = { x: threat.x, z: threat.z };
    }
  }
  if (ped.state === 'flee') {
    ped.fleeTimer -= dt;
    if (ped.fleeTimer <= 0) ped.state = 'walk';
    const dx = ped.x - ped.fleeFrom.x;
    const dz = ped.z - ped.fleeFrom.z;
    const d = Math.hypot(dx, dz) || 1;
    ped.heading = Math.atan2(dx / d, dz / d);
    ped.speed = PEDS.runSpeed;
  } else {
    const dx = ped.target.x - ped.x;
    const dz = ped.target.z - ped.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      ped.target = city.sidewalkPoint();
      ped.speed = 0;
    } else {
      ped.heading = Math.atan2(dx / d, dz / d);
      ped.speed = PEDS.walkSpeed;
    }
  }
  if (ped.speed > 0) {
    ped.x += Math.sin(ped.heading) * ped.speed * dt;
    ped.z += Math.cos(ped.heading) * ped.speed * dt;
    const fixed = city.collideCircle(ped.x, ped.z, 0.6);
    ped.x = fixed.x;
    ped.z = fixed.z;
  }
  ped.phase += ped.speed * dt * 1.6;
  animateWalk(ped.parts, ped.phase, Math.min(1, ped.speed / PEDS.walkSpeed) * 0.6);
  ped.group.position.set(ped.x, 0, ped.z);
  ped.group.rotation.y = ped.heading;
}

export function killPedestrian(ped) {
  ped.state = 'dead';
  ped.deadTimer = 18;
  ped.group.rotation.x = -Math.PI / 2;
  ped.group.position.y = 0.35;
}
