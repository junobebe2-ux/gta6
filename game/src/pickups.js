// Cash pickups — gold coins lying on the sidewalks, $25 a piece. They give the
// player something to chase between Rico's jobs, and the HUD keeps score. A coin
// that gets picked up pops back up somewhere new after a short while, so the
// streets never run dry. Visuals and cash only; no network anywhere in here.
import * as THREE from 'three';

export const PICKUP_VALUE = 25;
export const PICKUP_COUNT = 12;
const RESPAWN_AFTER = 20;
const COLLECT_RADIUS = 2.6;
const COIN_HEIGHT = 1.1;
const SPIN_RATE = 2.2;
const BOB_DEPTH = 0.18;

// A fresh spot on a sidewalk, shoved clear of any building it landed inside.
function respot(coin, city) {
  const spot = city.sidewalkPoint();
  const clear = city.collideCircle(spot.x, spot.z, 1);
  coin.x = clear.x;
  coin.z = clear.z;
  coin.group.position.set(coin.x, COIN_HEIGHT, coin.z);
}

export function createPickups(scene, city, rng) {
  const coins = [];
  const discGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 18);
  discGeo.rotateX(Math.PI / 2); // turn the disc upright, like a wheel
  const discMat = new THREE.MeshLambertMaterial({ color: 0xffc832, emissive: 0x8a6d00 });
  const rimGeo = new THREE.TorusGeometry(0.34, 0.07, 8, 18);
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0x6a5200 });
  for (let i = 0; i < PICKUP_COUNT; i += 1) {
    const group = new THREE.Group();
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    group.add(disc);
    group.add(rim);
    scene.add(group);
    const coin = { group, x: 0, z: 0, phase: rng.range(0, Math.PI * 2), respawn: 0 };
    respot(coin, city);
    coins.push(coin);
  }
  return coins;
}

/**
 * Spin and bob the coins, and collect any the player walks or drives over.
 * ctx is {x, z, city, rng}; returns how many coins were collected this step.
 */
export function stepPickups(pickups, ctx, dt, t) {
  let taken = 0;
  for (const coin of pickups) {
    if (coin.respawn > 0) {
      coin.respawn -= dt;
      if (coin.respawn <= 0) {
        respot(coin, ctx.city);
        coin.group.visible = true;
      }
      continue;
    }
    coin.group.rotation.y += dt * SPIN_RATE;
    coin.group.position.y = COIN_HEIGHT + Math.sin(t * 2 + coin.phase) * BOB_DEPTH;
    if (Math.hypot(ctx.x - coin.x, ctx.z - coin.z) < COLLECT_RADIUS) {
      taken += 1;
      coin.respawn = RESPAWN_AFTER;
      coin.group.visible = false;
    }
  }
  return taken;
}
