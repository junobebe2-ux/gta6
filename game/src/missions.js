// The four story missions, in order, with the HUD objective tracker.
// Completing a mission heals the player to full and saves the game.
import { C } from './config.js';
import { writeSave } from './save.js';
import { sfxMission } from './audio.js';

export const MISSION_NAMES = ['First Wheels', 'The Package', 'Heat', 'The Big Score'];

export function createMissions(S) {
  S.missions = {
    index: 0,
    stage: 'steal',
    missionsDone: 0,
    totalEarned: 0,
    holdT: 0,
    m2Timer: 0,
    objective: 'Steal a car — press E near a car',
  };
}

function completeMission(S) {
  const m = S.missions;
  const reward = C.rewards[m.index];
  S.player.cash += reward;
  m.totalEarned += reward;
  m.missionsDone++;
  m.index++;
  S.player.health = C.playerHealth;
  sfxMission(S.audio);
  writeSave(S);
  if (m.index === 1) {
    m.stage = 'pickup';
    m.objective = 'Pick up the package at Rico\'s Garage';
  } else if (m.index === 2) {
    m.stage = 'raise';
    m.objective = 'Raise your wanted level to 3 stars';
  } else if (m.index === 3) {
    m.stage = 'drive';
    m.objective = 'Drive to the Bank';
  } else {
    m.stage = 'done';
    m.objective = 'All missions complete — free roam';
  }
}

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

export function stepMissions(S, dt) {
  const m = S.missions;
  const p = S.player;
  const pol = S.police;
  if (m.index >= 4) return;

  if (m.index === 0) {
    if (m.stage === 'steal') {
      if (!p.onFoot) {
        m.stage = 'garage';
        m.objective = 'Drive to Rico\'s Garage — park on the road and walk inside';
      }
    } else if (m.stage === 'garage') {
      // The garage cannot be reached by car: the player must walk in.
      if (p.onFoot && dist(p.x, p.z, C.garage.x, C.garage.z) < C.garage.radius) {
        completeMission(S);
      }
    }
    return;
  }

  if (m.index === 1) {
    if (m.stage === 'pickup') {
      if (dist(p.x, p.z, C.garage.x, C.garage.z) < C.packageRadius) {
        m.stage = 'deliver';
        m.m2Timer = C.m2TimeLimit;
        m.objective = 'Deliver the package to the Docks — 100s left';
      }
    } else if (m.stage === 'deliver') {
      m.m2Timer -= dt;
      m.objective = `Deliver the package to the Docks — ${Math.max(0, Math.ceil(m.m2Timer))}s left`;
      if (dist(p.x, p.z, C.docks.x, C.docks.z) < C.docks.radius) {
        completeMission(S);
      } else if (m.m2Timer <= 0) {
        // Out of time: the package waits back at the garage, fresh clock.
        m.stage = 'pickup';
        m.objective = 'Pick up the package at Rico\'s Garage';
      }
    }
    return;
  }

  if (m.index === 2) {
    if (m.stage === 'raise') {
      if (pol.wanted >= 3) {
        m.stage = 'escape';
        m.objective = 'Lose the heat — escape until your wanted level falls to 0';
      } else {
        m.objective = `Raise your wanted level to 3 stars (now ${pol.wanted})`;
      }
    } else if (m.stage === 'escape') {
      m.objective = `Lose the heat — wanted ${pol.wanted} star${pol.wanted === 1 ? '' : 's'} left`;
      if (pol.wanted === 0) completeMission(S);
    }
    return;
  }

  if (m.index === 3) {
    if (m.stage === 'drive') {
      if (dist(p.x, p.z, C.bank.x, C.bank.z) < C.bank.radius) {
        m.stage = 'hold';
        m.holdT = 0;
        pol.raiseWanted(3, 'Bank robbery');
        m.objective = 'Rob the bank — stay in the zone';
      }
    } else if (m.stage === 'hold') {
      // The hold triggers from the car: the zone is wide enough to sit
      // in while driving. Progress pauses (not resets) outside it.
      if (dist(p.x, p.z, C.bank.x, C.bank.z) < C.bank.radius) {
        m.holdT += dt;
        m.objective = `Robbing the bank — ${Math.ceil(C.m4HoldSeconds - m.holdT)}s`;
        if (m.holdT >= C.m4HoldSeconds) {
          m.stage = 'escape';
          pol.wanted = 4;
          pol.reason = 'Bank robbery';
          pol.decayTimer = 0;
          pol.escapeTimer = 0;
          m.objective = 'Escape to the Safehouse';
        }
      } else {
        m.objective = 'Rob the bank — get back in the zone';
      }
    } else if (m.stage === 'escape') {
      m.objective = 'Escape to the Safehouse';
      if (dist(p.x, p.z, C.safehouse.x, C.safehouse.z) < C.safehouse.radius) {
        completeMission(S);
      }
    }
  }
}

// The current mission marker position for the minimap (null when none).
export function missionMarker(S) {
  const m = S.missions;
  if (m.index === 0) return { x: C.garage.x, z: C.garage.z };
  if (m.index === 1) return m.stage === 'pickup'
    ? { x: C.garage.x, z: C.garage.z }
    : { x: C.docks.x, z: C.docks.z };
  if (m.index === 2) return null;
  if (m.index === 3) return m.stage === 'escape'
    ? { x: C.safehouse.x, z: C.safehouse.z }
    : { x: C.bank.x, z: C.bank.z };
  return null;
}
