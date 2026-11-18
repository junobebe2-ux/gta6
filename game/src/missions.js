// Missions and the story: four jobs from Rico, played in order. Each mission is a
// small state machine (go to a place, pick something up, lose the cops, rob the bank)
// with a target the beacon marks. Completing one pays cash and unlocks the next; the
// last one ends the story.
import * as THREE from 'three';
import { MISSIONS } from './config.js';

/** The first stage of a mission, from its id. */
function firstStage(id) {
  if (id === 'first-wheels') return 'steal';
  if (id === 'the-package') return 'pickup';
  if (id === 'heat') return 'wanted';
  return 'bank';
}

export function createMissions(places, startIndex = 0) {
  const state = {
    index: startIndex, // missions done so far
    stage: 'steal',
    target: null,
    timer: 0,
    hold: 0, // hold-to-rob progress, 0..1
    done: false,
    storyDone: false,
  };
  if (startIndex >= MISSIONS.length) {
    state.done = true;
    state.storyDone = true;
  } else {
    state.stage = firstStage(MISSIONS[startIndex].id);
  }
  return { state, places };
}

/** Where the beacon and the minimap should point right now, or null. */
export function missionTarget(missions) {
  const { state, places } = missions;
  if (state.done || state.storyDone) return null;
  const mission = MISSIONS[state.index];
  if (!mission) return null;
  if (state.stage === 'drive') return places.garage;
  if (state.stage === 'pickup') return places.docks;
  if (state.stage === 'deliver') return places.motel;
  if (state.stage === 'bank' || state.stage === 'rob') return places.bank;
  if (state.stage === 'escape-bank') return places.safehouse;
  return null;
}

export function missionObjective(missions) {
  const { state } = missions;
  if (state.storyDone) return 'Story complete — Solmar is yours. Free roam!';
  const mission = MISSIONS[state.index];
  if (!mission) return '';
  switch (state.stage) {
    case 'steal':
      return `${mission.title}: ${mission.objective} — steal a car`;
    case 'drive':
      return `${mission.title}: drive to ${missions.places.garage.label}`;
    case 'pickup':
      return `${mission.title}: pick up the package at ${missions.places.docks.label}`;
    case 'deliver':
      return `${mission.title}: deliver to ${missions.places.motel.label} (${Math.max(0, Math.ceil(state.timer))}s)`;
    case 'wanted':
      return `${mission.title}: get the cops on you — reach 3 stars`;
    case 'escape-heat':
      return `${mission.title}: lose the cops — get back to 0 stars`;
    case 'bank':
      return `${mission.title}: get to ${missions.places.bank.label}`;
    case 'rob':
      return `${mission.title}: HOLD E to grab the cash!`;
    case 'escape-bank':
      return `${mission.title}: escape to ${missions.places.safehouse.label}`;
    default:
      return mission.objective;
  }
}

function near(x1, z1, x2, z2, r) {
  return Math.hypot(x1 - x2, z1 - z2) < r;
}

/**
 * Advance the missions one step. ctx carries what the game knows; events come back as
 * {type:'stage'|'complete'|'failed'|'rob-start', ...} for the game to announce and pay out.
 */
export function updateMissions(missions, ctx, dt) {
  const { state, places } = missions;
  const events = [];
  if (state.storyDone) return events;
  const mission = MISSIONS[state.index];
  if (!mission) return events;

  if (state.timer > 0) {
    state.timer -= dt;
    if (state.timer <= 0) {
      events.push({ type: 'failed', reason: `${mission.title}: out of time — try again` });
      state.stage = mission.id === 'the-package' ? 'pickup' : 'steal';
      state.timer = 0;
      state.hold = 0;
      return events;
    }
  }

  if (mission.id === 'first-wheels') {
    if (state.stage === 'steal' && ctx.carEntered) {
      state.stage = 'drive';
      events.push({ type: 'stage', text: `Nice wheels. Now get to ${places.garage.label}.` });
    } else if (state.stage === 'drive' && ctx.inCar && near(ctx.x, ctx.z, places.garage.x, places.garage.z, 9)) {
      events.push({ type: 'complete', mission });
    }
  } else if (mission.id === 'the-package') {
    if (state.stage === 'pickup' && near(ctx.x, ctx.z, places.docks.x, places.docks.z, 8)) {
      state.stage = 'deliver';
      state.timer = mission.timeLimit;
      events.push({ type: 'stage', text: `Package secured. ${mission.timeLimit}s to reach ${places.motel.label}!` });
    } else if (state.stage === 'deliver' && near(ctx.x, ctx.z, places.motel.x, places.motel.z, 9)) {
      events.push({ type: 'complete', mission });
    }
  } else if (mission.id === 'heat') {
    if (state.stage === 'wanted' && ctx.wanted >= 3) {
      state.stage = 'escape-heat';
      events.push({ type: 'stage', text: 'Three stars! Now shake them — go quiet.' });
    } else if (state.stage === 'escape-heat' && ctx.wanted === 0) {
      events.push({ type: 'complete', mission });
    }
  } else if (mission.id === 'the-big-score') {
    if (state.stage === 'bank' && near(ctx.x, ctx.z, places.bank.x, places.bank.z, 12)) {
      state.stage = 'rob';
      events.push({ type: 'stage', text: 'Inside! HOLD E and grab everything!' });
    } else if (state.stage === 'rob') {
      if (ctx.interactHeld && near(ctx.x, ctx.z, places.bank.x, places.bank.z, 12)) {
        state.hold += dt / 5;
        if (state.hold >= 1) {
          state.stage = 'escape-bank';
          state.hold = 0;
          events.push({ type: 'rob-done', text: 'Cash grabbed! Get to the safehouse — the whole city is coming!' });
        }
      } else {
        state.hold = Math.max(0, state.hold - dt / 3);
      }
    } else if (state.stage === 'escape-bank' && near(ctx.x, ctx.z, places.safehouse.x, places.safehouse.z, 9)) {
      events.push({ type: 'complete', mission });
    }
  }
  return events;
}

/** Mark a mission complete and move to the next; returns true when the story is over. */
export function completeMission(missions) {
  const { state } = missions;
  state.index += 1;
  state.timer = 0;
  state.hold = 0;
  if (state.index >= MISSIONS.length) {
    state.storyDone = true;
    state.done = true;
    return true;
  }
  const next = MISSIONS[state.index];
  state.stage = firstStage(next.id);
  state.done = false;
  return false;
}

/** A pulsing beacon column + ground ring that marks the current mission target. */
export function createBeacon(scene) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, 46, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc832, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 23;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc832, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  group.add(beam);
  group.add(ring);
  group.visible = false;
  scene.add(group);
  return {
    group,
    update(target, t) {
      if (!target) {
        group.visible = false;
        return;
      }
      group.visible = true;
      group.position.set(target.x, 0, target.z);
      const pulse = 0.75 + Math.sin(t * 4) * 0.25;
      beam.material.opacity = 0.22 + pulse * 0.12;
      ring.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
    },
  };
}
