// Solmar City — localStorage save/load.
// Save shape: { cash, missionsDone, totalEarned }.
// Every function is guarded: a missing, corrupt or unavailable store
// returns null / false and never throws, so headless browsers stay silent.

import { CONFIG } from './config.js';

const KEY = CONFIG.saveKey;

function storeAvailable() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

export function readSave() {
  if (!storeAvailable()) return null;
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number.isFinite(data.cash) ? data.cash : 0,
      missionsDone: Number.isFinite(data.missionsDone) ? data.missionsDone : 0,
      totalEarned: Number.isFinite(data.totalEarned) ? data.totalEarned : 0,
    };
  } catch {
    return null;
  }
}

export function loadSave() {
  return readSave();
}

export function writeSave(save) {
  if (!storeAvailable()) return false;
  const data = {
    cash: Number.isFinite(save.cash) ? save.cash : 0,
    missionsDone: Number.isFinite(save.missionsDone) ? save.missionsDone : 0,
    totalEarned: Number.isFinite(save.totalEarned) ? save.totalEarned : 0,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  if (!storeAvailable()) return false;
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
