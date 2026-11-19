// The simulation: the player on foot and behind the wheel, traffic, pedestrians,
// the police, the wanted level, combat and the missions, all stepped at 60 Hz.
// The renderer, the HUD and the audio are handed in; this module owns the world
// state and the rules.
import * as THREE from 'three';
import { CAR, CITY, MISSIONS, PEDS, PLAYER, TRAFFIC, PARKED, WANTED } from './config.js';
import { createTrafficCar, createParkedCar, stepTraffic } from './vehicles.js';
import { createPedestrian, stepPedestrian, killPedestrian, createPersonMesh, animateWalk } from './people.js';
import { createPolice, stepPolice, clearPolice } from './police.js';
import { createMissions, missionTarget, missionObjective, updateMissions, completeMission, createBeacon } from './missions.js';
import { createPickups, stepPickups, PICKUP_VALUE } from './pickups.js';
import { writeSave } from './save.js';

// Mark a mesh (and everything under it) as something a bullet can hit.
function tagShootable(group, type, ref) {
  group.userData.shootable = { type, ref };
  group.traverse((o) => {
    o.userData.shootable = { type, ref };
  });
}

function angleDiff(target, current) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function createGame(deps) {
  const { render, audio, hud, city, rng } = deps;
  const scene = render.scene;
  const raycaster = new THREE.Raycaster();
  raycaster.far = PLAYER.shootRange;

  const save = deps.save || null;
  const state = {
    screen: 'title',
    time: 0,
    health: PLAYER.health,
    cash: save ? save.cash : 0,
    missionsDone: save ? save.missionsDone : 0,
    totalEarned: save ? save.totalEarned : 0,
    wanted: 0,
    wantedReason: '',
    lastCrime: -999,
    lastDamage: -999,
    heatTimer: 0,
    shootCooldown: 0,
    gameOver: null,
    stats: { carsStolen: 0, pedsDown: 0, copsDown: 0, shotsFired: 0, pickups: 0 },
    saveTimer: 0,
  };

  // The player, on foot, starting by Rico's garage.
  const { group: playerMesh, parts: playerParts } = createPersonMesh(0x2f6fb8, 0x2c313a, 0xe8b88a, 1.12);
  scene.add(playerMesh);
  const player = { x: -168, z: 96, heading: 0, speed: 0, phase: 0, mesh: playerMesh, parts: playerParts };
  playerMesh.position.set(player.x, 0, player.z);
  playerMesh.rotation.y = player.heading;

  const missions = createMissions(city.places, save ? save.missionsDone : 0);
  const beacon = createBeacon(scene);

  // Traffic, parked cars, pedestrians. One parked car always waits by Rico's
  // garage, so the first job (steal a car) is right there.
  const cars = [];
  for (let i = 0; i < TRAFFIC.cars; i += 1) {
    const car = createTrafficCar(scene, rng);
    tagShootable(car.group, 'car', car);
    cars.push(car);
  }
  for (let i = 0; i < PARKED.count; i += 1) {
    const car = createParkedCar(scene, rng);
    tagShootable(car.group, 'car', car);
    cars.push(car);
  }
  const garageCar = createParkedCar(scene, rng);
  garageCar.x = -163.8;
  garageCar.z = 104;
  garageCar.heading = 0;
  garageCar.group.position.set(garageCar.x, 0, garageCar.z);
  garageCar.group.rotation.y = garageCar.heading;
  tagShootable(garageCar.group, 'car', garageCar);
  cars.push(garageCar);
  const peds = [];
  for (let i = 0; i < PEDS.count; i += 1) {
    const ped = createPedestrian(scene, city, rng);
    tagShootable(ped.group, 'ped', ped);
    peds.push(ped);
  }
  const police = createPolice(scene, city, rng);
  const pickups = createPickups(scene, city, rng);

  let drivenCar = null;
  let threat = null;
  let threatTimer = 0;
  let prevMissionStage = missions.state.stage;
  let respawnTimer = 0;

  function persist() {
    writeSave({ cash: state.cash, missionsDone: state.missionsDone, totalEarned: state.totalEarned });
  }

  function addWanted(n, reason) {
    if (n <= 0) return;
    const before = state.wanted;
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.lastCrime = state.time;
    state.heatTimer = 0;
    if (state.wanted > before) {
      // The reason is painted live by the HUD's wanted line; no feed message
      // here, or the line would go stale the moment the level rises again.
      state.wantedReason = reason;
      audio.wantedUp();
    }
  }

  function damagePlayer(amount, kind) {
    if (state.gameOver) return;
    state.health -= amount;
    state.lastDamage = state.time;
    if (state.health <= 0) {
      state.health = 0;
      state.gameOver = 'wasted';
      audio.busted();
      hud.banner('WASTED', 'Solmar will remember you.');
      persist();
    }
  }

  function explodeCar(car, isPolice) {
    render.burst(car.x, 1.2, car.z, 0xff7a1a, 42, 9, 7);
    render.burst(car.x, 1.2, car.z, 0x333333, 26, 5, 9);
    render.flashAt(car.x, 2, car.z, 0xffa040, 60);
    audio.explosion();
    threat = { x: car.x, z: car.z };
    threatTimer = 2;
    addWanted(WANTED.explodeCar, 'car explosion');
    scene.remove(car.group);
    if (isPolice) {
      const i = police.cars.indexOf(car);
      if (i >= 0) police.cars.splice(i, 1);
    } else {
      const i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
      if (drivenCar === car) {
        drivenCar = null;
        player.mesh.visible = true;
        player.x = car.x + 3;
        player.z = car.z + 3;
        damagePlayer(35, 'explosion');
        hud.message('Your car blew up!');
      }
    }
    respawnTimer = 6;
  }

  function nearestCar(maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of cars) {
      if (!car.alive) continue;
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  /** Positions of the pickups still on the street, for the minimap and playtests. */
  function pickupPositions() {
    return pickups.filter((p) => p.respawn <= 0).map((p) => ({ x: Math.round(p.x), z: Math.round(p.z) }));
  }

  function enterCar(car) {
    drivenCar = car;
    car.kind = 'driven';
    player.mesh.visible = false;
    audio.pickup();
    if (car.occupied) {
      state.stats.carsStolen += 1;
      addWanted(WANTED.stealCar, 'car stolen');
      hud.message('Car stolen! The cops noticed.');
    } else {
      hud.message('You took the car.');
    }
    return true;
  }

  function exitCar() {
    if (!drivenCar) return;
    const car = drivenCar;
    drivenCar = null;
    car.kind = 'parked';
    car.occupied = false;
    car.speed = 0;
    player.x = car.x + Math.sin(car.heading + Math.PI / 2) * 3;
    player.z = car.z + Math.cos(car.heading + Math.PI / 2) * 3;
    const fixed = city.collideCircle(player.x, player.z, PLAYER.radius);
    player.x = fixed.x;
    player.z = fixed.z;
    player.heading = car.heading;
    player.mesh.visible = true;
    player.mesh.position.set(player.x, 0, player.z);
  }

  // A cop goes down: lie flat for a while, then get taken away.
  function dropCop(cop) {
    cop.alive = false;
    cop.deadTimer = 18;
    cop.group.rotation.x = -Math.PI / 2;
    cop.group.position.y = 0.35;
    state.stats.copsDown += 1;
    addWanted(WANTED.killCop, 'officer down');
  }

  function shoot() {
    if (state.shootCooldown > 0 || state.gameOver) return;
    state.shootCooldown = PLAYER.shootCooldown;
    state.stats.shotsFired += 1;
    audio.gunshot();
    const from = new THREE.Vector3(player.x, 1.45, player.z);
    raycaster.setFromCamera(new THREE.Vector2(0, 0), render.camera);
    const roots = [];
    for (const ped of peds) if (ped.state !== 'dead') roots.push(ped.group);
    for (const cop of police.cops) if (cop.alive) roots.push(cop.group);
    for (const car of cars) if (car.alive) roots.push(car.group);
    for (const car of police.cars) roots.push(car.group);
    const hits = raycaster.intersectObjects(roots, true);
    let end = raycaster.ray.at(PLAYER.shootRange, new THREE.Vector3());
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      const tag = hit.object.userData.shootable;
      if (tag) {
        if (tag.type === 'ped') {
          killPedestrian(tag.ref);
          state.stats.pedsDown += 1;
          addWanted(WANTED.hitPed, 'pedestrian down');
          render.burst(end.x, end.y, end.z, 0xc23b2e, 10, 3, 2);
        } else if (tag.type === 'cop') {
          const cop = tag.ref;
          cop.health = (cop.health || 100) - PLAYER.shootDamage;
          render.burst(end.x, end.y, end.z, 0xc23b2e, 10, 3, 2);
          if (cop.health <= 0) dropCop(cop);
        } else if (tag.type === 'car') {
          const car = tag.ref;
          car.health -= PLAYER.shootDamage;
          render.burst(end.x, end.y, end.z, 0xffa040, 12, 4, 3);
          if (car.health <= 0) explodeCar(car, car.isPolice);
        }
      }
    }
    render.shootTracer(from, end);
    render.flashAt(from.x, from.y, from.z, 0xffe9a8, 22);
    threat = { x: player.x, z: player.z };
    threatTimer = 1.5;
  }

  function punch() {
    if (state.gameOver) return;
    audio.punch();
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    let best = null;
    let bestD = PLAYER.punchRange;
    const consider = (x, z, type, ref) => {
      const dx = x - player.x;
      const dz = z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && (dx * fx + dz * fz) / (d || 1) > 0.4) {
        bestD = d;
        best = { type, ref };
      }
    };
    for (const ped of peds) {
      if (ped.state !== 'dead') consider(ped.x, ped.z, 'ped', ped);
    }
    for (const cop of police.cops) {
      if (cop.alive) consider(cop.x, cop.z, 'cop', cop);
    }
    if (!best) return;
    if (best.type === 'ped') {
      killPedestrian(best.ref);
      state.stats.pedsDown += 1;
      addWanted(WANTED.hitPed, 'pedestrian down');
    } else {
      const cop = best.ref;
      cop.health = (cop.health || 100) - PLAYER.punchDamage;
      cop.x += fx * 1.5;
      cop.z += fz * 1.5;
      if (cop.health <= 0) dropCop(cop);
    }
  }

  function driveCar(car, dt, input) {
    const move = input.move();
    // W/S throttle and brake, A/D steer, Space handbrake.
    if (move.y > 0) car.speed += CAR.accel * dt;
    else if (move.y < 0) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    }
    if (input.brake()) car.speed *= Math.max(0, 1 - 3.2 * dt);
    car.speed -= car.speed * 0.45 * dt; // rolling drag
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    const steerAuthority = 1 / (1 + Math.abs(car.speed) * 0.045);
    const steering = Math.abs(car.speed) > 0.3 ? 1 : 0;
    // Steer toward the screen-right: the chase camera sits behind the car, so
    // pressing D (move.x +1) must turn the nose right, which is a DECREASING
    // heading (forward is (sin h, cos h); right is (-cos h, sin h)). The
    // (speed >= 0 ? 1 : -1) factor keeps the wheel correct when reversing.
    car.heading -= move.x * CAR.steer * steerAuthority * dt * (car.speed >= 0 ? 1 : -1) * steering;
    const ox = car.x;
    const oz = car.z;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const fixed = city.collideCircle(car.x, car.z, CAR.radius);
    if ((fixed.x !== car.x || fixed.z !== car.z) && Math.abs(car.speed) > 9) {
      audio.crash();
      render.burst(car.x, 0.8, car.z, 0xd8d8d8, 10, 4, 2);
      car.speed *= 0.45;
    }
    car.x = fixed.x;
    car.z = fixed.z;
    // Car-car bumps. A traffic or parked car is a crash: it shoves the player
    // and bleeds speed. A police car is different — it already has its own
    // pressure, the ram (5 damage per 2.5 s), and it chases by staying glued
    // to the player. If the per-frame speed cut applied to police cars too,
    // one car inside 4.2 m pinned the player at ~7 m/s forever (the cut runs
    // every step, so speed never recovers), and the escape became
    // uncompletable no matter how well the player drove — the player is
    // supposed to outrun the police (top speed 34 vs their 30), not be
    // grappled by them. So police cars still push the player out of the
    // overlap, but they do not cut speed; the ram is what hurts.
    for (const other of [...cars, ...police.cars]) {
      if (other === car || !other.alive) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.2 && d > 0.01) {
        const push = (4.2 - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        car.x -= nx * push;
        car.z -= nz * push;
        if (other.kind === 'traffic' || other.kind === 'parked') {
          other.x += nx * push;
          other.z += nz * push;
          other.group.position.set(other.x, 0, other.z);
        }
        if (other.kind !== 'police' && Math.abs(car.speed) > 7) {
          audio.crash();
          car.speed *= 0.7;
        }
      }
    }
    // Running over pedestrians.
    for (const ped of peds) {
      if (ped.state === 'dead') continue;
      const d = Math.hypot(ped.x - car.x, ped.z - car.z);
      if (d < 2.3 && Math.abs(car.speed) > 3) {
        killPedestrian(ped);
        state.stats.pedsDown += 1;
        addWanted(WANTED.hitPed, 'pedestrian hit');
        audio.crash();
      }
    }
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    for (const w of car.wheels) w.rotation.x += (car.speed * dt) / 0.36;
    audio.setEngine(Math.abs(car.speed) / CAR.maxSpeed);
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
  }

  function walkPlayer(dt, input) {
    audio.setEngine(0);
    const move = input.move();
    // Camera-relative movement; the character turns to face the walk.
    const camYaw = render.getCamYaw();
    const fwdX = Math.sin(player.heading + camYaw);
    const fwdZ = Math.cos(player.heading + camYaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    let mx = fwdX * move.y + rightX * move.x;
    let mz = fwdZ * move.y + rightZ * move.x;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      player.heading += Math.max(-10 * dt, Math.min(10 * dt, angleDiff(targetHeading, player.heading)));
      const speed = input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
      player.speed = speed;
      player.x += mx * speed * dt;
      player.z += mz * speed * dt;
      player.phase += speed * dt * 1.6;
    } else {
      player.speed = 0;
    }
    const fixed = city.collideCircle(player.x, player.z, PLAYER.radius);
    player.x = fixed.x;
    player.z = fixed.z;
    animateWalk(player.parts, player.phase, player.speed > 0.1 ? Math.min(1, player.speed / PLAYER.walkSpeed) * 0.7 : 0);
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.heading;
    if (input.takeClick()) shoot();
  }

  function stepPlayer(dt, input) {
    const mouse = input.takeMouse();
    render.orbit(mouse.dx, mouse.dy);
    if (drivenCar) driveCar(drivenCar, dt, input);
    else walkPlayer(dt, input);
  }

  /** Paint the HUD from the current state (also used after game over, so it never goes stale). */
  function paintHud(t) {
    const target = missionTarget(missions);
    let prompt = '';
    if (!drivenCar) {
      const car = nearestCar(4.5);
      if (car) prompt = car.occupied ? 'Press E to steal the car' : 'Press E to enter the car';
      else if (missions.state.stage === 'rob') prompt = 'HOLD E to grab the cash';
    } else {
      prompt = 'Press E to exit the car';
    }
    hud.update(
      {
        health: state.health,
        cash: state.cash,
        wanted: state.wanted,
        wantedReason: state.wantedReason,
        pickups: state.stats.pickups,
        objective: missionObjective(missions),
        inCar: !!drivenCar,
        speed: drivenCar ? drivenCar.speed : 0,
        prompt,
        missionTarget: target,
        cars: [...cars, ...police.cars],
        pickupPositions: pickupPositions(),
        x: player.x,
        z: player.z,
        heading: player.heading,
      },
      t,
    );
  }

  function handleMissionEvents(events) {
    for (const ev of events) {
      if (ev.type === 'stage') hud.message(ev.text);
      else if (ev.type === 'rob-done') {
        hud.message(ev.text);
        addWanted(Math.max(0, 4 - state.wanted), 'bank robbery');
      } else if (ev.type === 'failed') {
        hud.banner('FAILED', ev.reason);
        audio.busted();
      } else if (ev.type === 'complete') {
        state.cash += ev.mission.reward;
        state.totalEarned += ev.mission.reward;
        state.missionsDone += 1;
        audio.missionDone();
        const storyOver = completeMission(missions);
        hud.banner(storyOver ? 'STORY COMPLETE' : 'MISSION COMPLETE', `${ev.mission.title} — +$${ev.mission.reward}`);
        hud.message(`${ev.mission.title} complete. +$${ev.mission.reward}`);
        persist();
      }
    }
    if (prevMissionStage !== missions.state.stage) {
      if (missions.state.stage === 'rob') addWanted(Math.max(0, 2 - state.wanted), 'bank alarm');
      prevMissionStage = missions.state.stage;
    }
  }

  function step(dt, input, t, actions) {
    state.time = t;
    if (state.gameOver) {
      paintHud(t);
      return state.gameOver;
    }
    state.shootCooldown = Math.max(0, state.shootCooldown - dt);
    if (threatTimer > 0) {
      threatTimer -= dt;
      if (threatTimer <= 0) threat = null;
    }
    // The actions for this frame arrive from the caller, which is the single
    // reader of the input's one-shot set: a second takeActions() here would eat them.
    const acts = actions || input.takeActions();
    if (acts.has('KeyF') && !drivenCar) punch();
    if (acts.has('KeyE')) {
      if (drivenCar) exitCar();
      else {
        const car = nearestCar(4.5);
        if (car) enterCar(car);
      }
    }
    stepPlayer(dt, input);

    // Traffic and pedestrians.
    for (const car of cars) {
      if (car.kind === 'traffic') stepTraffic(car, dt, [...cars, ...police.cars]);
    }
    for (const ped of [...peds]) {
      stepPedestrian(ped, dt, city, threat);
      if (ped.state === 'dead') {
        ped.deadTimer -= dt;
        if (ped.deadTimer <= 0) {
          scene.remove(ped.group);
          peds.splice(peds.indexOf(ped), 1);
          const fresh = createPedestrian(scene, city, rng);
          tagShootable(fresh.group, 'ped', fresh);
          peds.push(fresh);
        }
      }
    }
    // Dead cops lie for a while, then are taken away.
    for (const cop of [...police.cops]) {
      if (!cop.alive) {
        cop.deadTimer -= dt;
        if (cop.deadTimer <= 0) {
          scene.remove(cop.group);
          police.cops.splice(police.cops.indexOf(cop), 1);
        }
      }
    }
    // Keep the streets busy: replace exploded traffic after a pause.
    if (respawnTimer > 0) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        const car = createTrafficCar(scene, rng);
        tagShootable(car.group, 'car', car);
        cars.push(car);
      }
    }

    // Police. During the bank hold the player is standing still holding E,
    // so the police must close in without ramming or grabbing them — the hold
    // is a timing challenge, and a hurt player would otherwise die before the
    // escape even starts. That fairness switch rides along in the context.
    const robbing = missions.state.stage === 'rob';
    stepPolice(police, {
      x: player.x,
      z: player.z,
      inCar: !!drivenCar,
      wanted: state.wanted,
      robbing,
      dt,
      t,
      cars,
      city,
      onPlayerDamage: damagePlayer,
      onBusted: () => {
        if (state.gameOver) return;
        state.gameOver = 'busted';
        audio.busted();
        hud.banner('BUSTED', 'The Solmar PD got you.');
        persist();
      },
    });

    // Wanted decay: quiet for a while with no police near, and the heat fades.
    // The gap is 30 m. At 3-4 stars four police cars converge and box a slow
    // car in, so a wider gap (50 m, then 40 m) was unreachable for a driver
    // who starts the escape at low speed right after the final hit. 30 m still
    // makes the player outrun the police (top speed 34 vs their 30) — hiding
    // alone does not clear the heat.
    if (state.wanted > 0 && state.time - state.lastCrime > WANTED.decayDelay) {
      let nearest = Infinity;
      const gapTo = (x, z) => Math.hypot(x - player.x, z - player.z);
      for (const car of police.cars) nearest = Math.min(nearest, gapTo(car.x, car.z));
      for (const cop of police.cops) {
        if (cop.alive) nearest = Math.min(nearest, gapTo(cop.x, cop.z));
      }
      if (nearest > 30) {
        state.heatTimer += dt;
        if (state.heatTimer >= WANTED.decayEvery) {
          state.heatTimer = 0;
          state.wanted -= 1;
          if (state.wanted === 0) hud.message('You lost them. The heat is off.');
        }
      } else {
        state.heatTimer = 0;
      }
    }

    // Cash pickups: walking or driving over one banks it.
    const got = stepPickups(pickups, { x: player.x, z: player.z, city, rng }, dt, t);
    if (got > 0) {
      state.cash += got * PICKUP_VALUE;
      state.totalEarned += got * PICKUP_VALUE;
      state.stats.pickups += got;
      audio.pickup();
      render.burst(player.x, 1.2, player.z, 0xffc832, 14, 4, 3);
    }

    // Missions.
    const events = updateMissions(missions, {
      x: player.x,
      z: player.z,
      inCar: !!drivenCar,
      carEntered: acts.has('KeyE') && !!drivenCar,
      wanted: state.wanted,
      interactHeld: input.isDown('KeyE'),
    }, dt);
    handleMissionEvents(events);

    // Health regen after a quiet spell.
    if (state.time - state.lastDamage > PLAYER.regenDelay && state.health > 0 && state.health < PLAYER.health) {
      state.health = Math.min(PLAYER.health, state.health + PLAYER.regenRate * dt);
    }

    // Ambient updates: the city, the beacon, the siren, the HUD.
    city.update(dt, t);
    beacon.update(missionTarget(missions), t);
    let policeNear = false;
    for (const car of police.cars) {
      if (Math.hypot(car.x - player.x, car.z - player.z) < 60) policeNear = true;
    }
    audio.setSiren(policeNear && state.wanted > 0);
    city.followSun(player.x, player.z);
    paintHud(t);

    // Autosave every 15 seconds of play.
    state.saveTimer += dt;
    if (state.saveTimer > 15) {
      state.saveTimer = 0;
      persist();
    }
    return state.gameOver;
  }

  function reset() {
    state.health = PLAYER.health;
    state.wanted = 0;
    state.wantedReason = '';
    state.gameOver = null;
    state.lastCrime = -999;
    state.lastDamage = -999;
    state.heatTimer = 0;
    clearPolice(police);
    if (drivenCar) {
      const car = drivenCar;
      drivenCar = null;
      car.kind = 'parked';
      car.occupied = false;
      car.speed = 0;
    }
    player.x = -168;
    player.z = 96;
    player.heading = 0;
    player.mesh.visible = true;
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.heading;
    render.camera.position.set(player.x - 6, 4, player.z - 6);
  }

  /** Staging helpers for the deterministic ?shot= scenes (never used in live play). */
  function debugTeleport(x, z, heading) {
    player.x = x;
    player.z = z;
    player.heading = heading;
    player.mesh.position.set(x, 0, z);
    player.mesh.rotation.y = heading;
  }
  function debugEnterNearestCar() {
    let car = nearestCar(200);
    if (!car) {
      car = cars.find((c) => c.kind === 'parked') || cars[0];
      if (!car) return false;
    }
    // Stage the car where the player stands, facing where they face.
    car.x = player.x;
    car.z = player.z;
    car.heading = player.heading;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    enterCar(car);
    return !!drivenCar;
  }
  function debugExitCar() {
    exitCar();
  }
  function debugSetWanted(n) {
    state.wanted = Math.min(WANTED.max, n);
    state.lastCrime = state.time;
  }
  function debugSetHealth(h) {
    state.health = h;
  }
  /**
   * Staging helper for the ?shot=play screenshot: put a few traffic cars ahead of
   * the player on their road and a few pedestrians on the nearby sidewalk, so the
   * street reads as alive in a single frame.
   */
  function debugStageStreet() {
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    let placed = 0;
    for (const car of cars) {
      if (car.kind !== 'traffic') continue;
      const ahead = 20 + placed * 24;
      car.x = player.x + fx * ahead + (placed % 2 === 0 ? 3 : -3);
      car.z = player.z + fz * ahead;
      car.heading = player.heading;
      car.speed = 9;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.heading;
      placed += 1;
      if (placed >= 3) break;
    }
    let pedsPlaced = 0;
    for (const ped of peds) {
      if (ped.state === 'dead') continue;
      const ahead = 14 + pedsPlaced * 9;
      ped.x = player.x + fx * ahead + 5.5;
      ped.z = player.z + fz * ahead + 2;
      ped.target = { x: ped.x + fx * 20, z: ped.z + fz * 20 };
      ped.state = 'walk';
      ped.group.position.set(ped.x, 0, ped.z);
      pedsPlaced += 1;
      if (pedsPlaced >= 3) break;
    }
  }

  return {
    state,
    player,
    missions,
    step,
    reset,
    debugTeleport,
    debugEnterNearestCar,
    debugExitCar,
    debugSetWanted,
    debugSetHealth,
    debugStageStreet,
    focus() {
      return { x: player.x, z: player.z, heading: player.heading };
    },
    isDriving() {
      return !!drivenCar;
    },
    drivenCar() {
      return drivenCar;
    },
    /** Distance to the nearest car, for the HUD prompt and headless playtests. */
    nearestCarDist() {
      const car = nearestCar(999);
      return car ? Math.hypot(car.x - player.x, car.z - player.z) : -1;
    },
    /** Nearest car's position, for headless playtests. */
    nearestCarPos() {
      const car = nearestCar(999);
      return car ? { x: Math.round(car.x), z: Math.round(car.z) } : null;
    },
    /** Nearest living pedestrian's position, for headless playtests. */
    nearestPedPos() {
      let best = null;
      let bestD = Infinity;
      for (const ped of peds) {
        if (ped.state === 'dead') continue;
        const d = Math.hypot(ped.x - player.x, ped.z - player.z);
        if (d < bestD) {
          bestD = d;
          best = ped;
        }
      }
      return best ? { x: Math.round(best.x), z: Math.round(best.z), dist: Math.round(bestD * 10) / 10 } : null;
    },
    /** Positions of the pickups still on the street, for the minimap and playtests. */
    pickupPositions,
    /** How many police cars are on the street right now. */
    policeCarCount() {
      return police.cars.length;
    },
    /** Distance to the nearest police unit (car or living foot cop), for headless playtests. */
    nearestPoliceDist() {
      let best = Infinity;
      for (const car of police.cars) best = Math.min(best, Math.hypot(car.x - player.x, car.z - player.z));
      for (const cop of police.cops) {
        if (cop.alive) best = Math.min(best, Math.hypot(cop.x - player.x, cop.z - player.z));
      }
      return best === Infinity ? -1 : Math.round(best * 10) / 10;
    },
  };
}
