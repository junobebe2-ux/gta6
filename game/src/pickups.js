// Cash pickups: $25 each, gold dots on the minimap, respawning 20 s
// after collection.
import * as THREE from 'three';
import { C } from './config.js';
import { pick, range } from './random.js';
import { sfxPickup } from './audio.js';
import { ROADS } from './city.js';

export function spawnPickups(S) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xaa8822, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
  const geo = new THREE.OctahedronGeometry(0.6);
  for (let i = 0; i < C.pickupCount; i++) {
    const road = pick(S.rng, ROADS);
    const along = range(S.rng, -220, 220);
    const onX = S.rng() < 0.5;
    const x = onX ? along : road + pick(S.rng, [-4, 4]);
    const z = onX ? road + pick(S.rng, [-4, 4]) : along;
    if (z < -224) { i--; continue; }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1, z);
    S.render.scene.add(mesh);
    S.pickups.push({ x, z, taken: false, respawnT: 0, mesh });
  }
}

export function stepPickups(S, dt) {
  const p = S.player;
  for (const pk of S.pickups) {
    if (pk.taken) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) {
        pk.taken = false;
        pk.mesh.visible = true;
      }
      continue;
    }
    pk.mesh.rotation.y += dt * 2;
    pk.mesh.position.y = 1 + Math.sin(S.time * 3 + pk.x) * 0.2;
    if (Math.hypot(pk.x - p.x, pk.z - p.z) < C.pickupRadius) {
      pk.taken = true;
      pk.respawnT = C.pickupRespawn;
      pk.mesh.visible = false;
      p.cash += C.pickupValue;
      sfxPickup(S.audio);
    }
  }
}
