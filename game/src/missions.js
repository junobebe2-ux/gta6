// Solmar City story missions: four missions in story order, an objective
// tracker, rewards, and the fair bank-hold flag (state.robbing) that the
// police module reads to suspend ramming and busting during the hold.
import { writeSave } from './save.js';

export const MISSION_LIST = [
  { id: 'wheels', name: 'First Wheels', reward: 200 },
  { id: 'package', name: 'The Package', reward: 350 },
  { id: 'heat', name: 'Heat', reward: 500 },
  { id: 'score', name: 'The Big Score', reward: 1500 },
];

const REACH = 7;
const PICKUP_REACH = 4;
const HOLD_SECONDS = 8;
const PACKAGE_SECONDS = 100;

function firstStage(mission) {
  if (!mission) return 'done';
  if (mission.id === 'wheels') return 'steal';
  if (mission.id === 'package') return 'pickup';
  if (mission.id === 'heat') return 'raise';
  return 'goto';
}

export function createMissions(ctx) {
  const { state, city } = ctx;
  const places = city.places;
  let index = 0;
  let stage = 'steal';
  let timer = 0;
  let targetCar = null;
  let snapshot = { cash: 0, missionsDone: 0, totalEarned: 0 };

  function current() {
    return MISSION_LIST[index] || null;
  }

  function here() {
    const v = ctx.vehicles;
    if (v.isDriving() && v.playerCar) return { x: v.playerCar.x, z: v.playerCar.z };
    return { x: ctx.player.pos.x, z: ctx.player.pos.z };
  }

  function near(place, radius) {
    const p = here();
    const dx = p.x - place.x;
    const dz = p.z - place.z;
    return dx * dx + dz * dz < radius * radius;
  }

  function nearestTrafficCar() {
    const p = here();
    let best = null;
    let bestD = Infinity;
    for (const car of ctx.vehicles.cars) {
      if (car.kind !== 'traffic') continue;
      const dx = car.x - p.x;
      const dz = car.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function checkpoint() {
    snapshot = { cash: state.cash, missionsDone: state.missionsDone, totalEarned: state.totalEarned };
    writeSave({ cash: state.cash, missionsDone: state.missionsDone, totalEarned: state.totalEarned });
  }

  function complete() {
    const m = current();
    state.cash += m.reward;
    state.totalEarned += m.reward;
    state.missionsDone += 1;
    ctx.audio.missionComplete();
    index += 1;
    stage = firstStage(current());
    timer = 0;
    targetCar = null;
    state.robbing = false;
    state.missionMarker = null;
    checkpoint();
  }

  function objectiveText() {
    const m = current();
    if (!m) return 'All missions complete — free roam!';
    if (m.id === 'wheels') {
      return stage === 'steal' ? 'Steal a car — press E near one' : "Drive to Rico's Garage";
    }
    if (m.id === 'package') {
      if (stage === 'pickup') return 'Pick up the package at the Garage';
      return 'Deliver to the Docks — ' + Math.max(0, Math.ceil(timer)) + 's left';
    }
    if (m.id === 'heat') {
      return stage === 'raise'
        ? 'Raise your wanted level to 3 stars'
        : 'Lose the heat — escape until wanted falls to 0';
    }
    if (stage === 'goto') return 'Get to the Bank';
    if (stage === 'hold') return 'Robbing the bank — hold on! ' + Math.max(0, Math.ceil(timer)) + 's';
    return 'Escape to the Safehouse!';
  }

  function step(dt) {
    if (state.mode !== 'play') return;
    const m = current();
    if (!m) {
      state.objective = objectiveText();
      state.missionMarker = null;
      return;
    }
    if (m.id === 'wheels') {
      if (stage === 'steal') {
        if (!targetCar) targetCar = nearestTrafficCar();
        state.missionMarker = targetCar ? { x: targetCar.x, z: targetCar.z, label: 'Car' } : null;
        if (ctx.vehicles.isDriving()) stage = 'drive';
      } else {
        state.missionMarker = { x: places.garage.x, z: places.garage.z, label: "Rico's Garage" };
        if (near(places.garage, REACH)) complete();
      }
    } else if (m.id === 'package') {
      if (stage === 'pickup') {
        state.missionMarker = { x: places.garage.x, z: places.garage.z, label: 'Package' };
        if (near(places.garage, PICKUP_REACH)) {
          stage = 'deliver';
          timer = PACKAGE_SECONDS;
        }
      } else {
        timer -= dt;
        state.missionMarker = { x: places.docks.x, z: places.docks.z, label: 'Docks' };
        if (near(places.docks, REACH)) complete();
        else if (timer <= 0) stage = 'pickup';
      }
    } else if (m.id === 'heat') {
      state.missionMarker = null;
      if (stage === 'raise') {
        if (state.wanted >= 3) stage = 'escape';
      } else if (state.wanted === 0) {
        complete();
      }
    } else {
      if (stage === 'goto') {
        state.missionMarker = { x: places.bank.x, z: places.bank.z, label: 'Bank' };
        if (near(places.bank, REACH)) {
          stage = 'hold';
          timer = HOLD_SECONDS;
          state.robbing = true;
        }
      } else if (stage === 'hold') {
        state.missionMarker = { x: places.bank.x, z: places.bank.z, label: 'Bank' };
        const holding = near(places.bank, REACH);
        state.robbing = holding;
        if (holding) {
          timer -= dt;
          if (timer <= 0) {
            state.robbing = false;
            ctx.police.raise(Math.max(0, 4 - state.wanted), 'Bank robbery', state);
            state.wantedReason = 'Bank robbery';
            stage = 'escape';
          }
        }
      } else {
        state.missionMarker = { x: places.safehouse.x, z: places.safehouse.z, label: 'Safehouse' };
        if (near(places.safehouse, REACH)) complete();
      }
    }
    state.objective = objectiveText();
  }

  function reset() {
    index = 0;
    stage = 'steal';
    timer = 0;
    targetCar = null;
    state.robbing = false;
    state.missionMarker = null;
    snapshot = { cash: 0, missionsDone: 0, totalEarned: 0 };
  }

  function setIndex(n) {
    index = Math.max(0, Math.min(MISSION_LIST.length, n | 0));
    stage = firstStage(current());
    timer = 0;
    targetCar = null;
    state.robbing = false;
    state.missionMarker = null;
    snapshot = { cash: state.cash, missionsDone: state.missionsDone, totalEarned: state.totalEarned };
  }

  function restartCurrent() {
    state.cash = snapshot.cash;
    state.missionsDone = snapshot.missionsDone;
    state.totalEarned = snapshot.totalEarned;
    stage = firstStage(current());
    timer = 0;
    targetCar = null;
    state.robbing = false;
    state.missionMarker = null;
  }

  return {
    list: MISSION_LIST,
    current,
    step,
    reset,
    setIndex,
    restartCurrent,
    get index() {
      return index;
    },
    get stage() {
      return stage;
    },
  };
}
