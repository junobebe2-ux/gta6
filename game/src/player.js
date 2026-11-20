// Solmar City — the on-foot player character.
// A low-poly third-person walker: A/D turn the heading, W/S move along it,
// Shift runs, mouse drag turns. Building AABBs block movement with wall
// sliding. The camera heading is set to the player's heading each frame
// before stepping, so the camera always sits behind the player.

import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createPlayer(scene, startX, startZ) {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0x2e6db4 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.position.y = 1.8;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.3), pantsMat);
  legL.position.set(-0.2, 0.4, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.3), pantsMat);
  legR.position.set(0.2, 0.4, 0);
  legR.castShadow = true;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.24), shirtMat);
  armL.position.set(-0.48, 1.15, 0);
  armL.castShadow = true;
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.24), shirtMat);
  armR.position.set(0.48, 1.15, 0);
  armR.castShadow = true;
  group.add(armR);
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.42), shoeMat);
  shoeL.position.set(-0.2, 0.06, 0.04);
  group.add(shoeL);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.42), shoeMat);
  shoeR.position.set(0.2, 0.06, 0.04);
  group.add(shoeR);

  group.position.set(startX || 0, 0, startZ || 0);
  scene.add(group);

  const player = {
    mesh: group,
    pos: group.position,
    heading: 0, // radians; 0 faces +z (south, toward the beach)
    speed: 0, // current m/s
    moving: false,
    walkPhase: 0,
  };

  function collides(x, z, colliders) {
    const r = CONFIG.playerRadius;
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  // input: {axis:{x,y}, run:boolean, dragDX:number} — axis.x turns,
  // axis.y moves. dt in seconds. colliders: AABB list from the city.
  player.step = function step(input, dt, colliders) {
    const turnRate = 2.6; // rad/s
    const drag = input.dragDX || 0;
    player.heading += drag * 0.004;
    player.heading += (input.axis ? input.axis.x : 0) * turnRate * dt;
    const forward = input.axis ? input.axis.y : 0;
    const targetSpeed = forward !== 0
      ? (input.run ? CONFIG.playerRunSpeed : CONFIG.playerWalkSpeed) * Math.sign(forward)
      : 0;
    player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 10);
    player.moving = Math.abs(player.speed) > 0.2;
    if (player.moving) {
      const dx = Math.sin(player.heading) * player.speed * dt;
      const dz = Math.cos(player.heading) * player.speed * dt;
      const nx = player.pos.x + dx;
      const nz = player.pos.z + dz;
      // Move axis by axis so walls slide instead of sticking.
      if (!collides(nx, player.pos.z, colliders || [])) player.pos.x = nx;
      if (!collides(player.pos.x, nz, colliders || [])) player.pos.z = nz;
      // Keep inside the world.
      const lim = CONFIG.worldSize / 2 - 2;
      player.pos.x = Math.max(-lim, Math.min(lim, player.pos.x));
      player.pos.z = Math.max(-lim, Math.min(lim, player.pos.z));
      player.walkPhase += dt * Math.abs(player.speed) * 1.6;
      const swing = Math.sin(player.walkPhase) * 0.55;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
    } else {
      legL.rotation.x *= 0.8;
      legR.rotation.x *= 0.8;
      armL.rotation.x *= 0.8;
      armR.rotation.x *= 0.8;
    }
    group.rotation.y = player.heading;
  };

  player.setPosition = function setPosition(x, z, heading) {
    player.pos.x = x;
    player.pos.z = z;
    if (heading !== undefined) player.heading = heading;
    group.rotation.y = player.heading;
  };

  return player;
}
