// pickups.js — cash pickups scattered in the city, $25 each, 20 s respawn.
// Phase B of the Solmar City fresh rebuild. Authored from the prose spec.
// No repo source file was read while writing this module.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const COLLECT_DIST = 2.5;

export function createPickups(scene, city, rng) {
  const items = [];
  const geo = new THREE.OctahedronGeometry(0.55);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffc21a, emissive: 0xaa7700, emissiveIntensity: 0.9 });
  for (let i = 0; i < CONFIG.pickupCount; i++) {
    // Near a road (clear of buildings): pick a grid road and an offset along it.
    const axis = rng.pick(['x', 'z']);
    const line = rng.pick([-200, -150, -100, -50, 0, 50, 100, 150, 200]);
    const s = rng.range(-230, 230);
    const off = rng.range(-3, 3);
    let x, z;
    if (axis === 'x') { x = s; z = line + off; }
    else { x = line + off; z = s; }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.9, z);
    mesh.castShadow = true;
    scene.add(mesh);
    items.push({ mesh, x, z, collected: false, respawnTimer: 0, phase: rng.range(0, Math.PI * 2) });
  }

  const pk = {
    items,

    // Returns how many pickups were collected this frame.
    step(dt, ctx) {
      const { player, state } = ctx;
      let collected = 0;
      const t = performance.now() / 1000;
      for (const it of items) {
        if (it.collected) {
          it.respawnTimer -= dt;
          if (it.respawnTimer <= 0) {
            it.collected = false;
            it.mesh.visible = true;
          }
          continue;
        }
        it.mesh.rotation.y += dt * 2.2;
        it.mesh.position.y = 0.9 + Math.sin(t * 2 + it.phase) * 0.15;
        const dx = player.pos.x - it.x;
        const dz = player.pos.z - it.z;
        if (dx * dx + dz * dz < COLLECT_DIST * COLLECT_DIST) {
          it.collected = true;
          it.respawnTimer = CONFIG.pickupRespawn;
          it.mesh.visible = false;
          state.cash += CONFIG.pickupValue;
          collected++;
          if (ctx.audio) ctx.audio.pickup();
        }
      }
      return collected;
    },
  };
  return pk;
}
