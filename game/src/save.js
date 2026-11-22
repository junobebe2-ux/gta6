// Save / load through localStorage. The save holds cash, missions done,
// total earned and the mission index, and Continue restores them exactly.
import { C } from './config.js';

export function loadSave() {
  try {
    const raw = localStorage.getItem(C.saveKey);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s.cash !== 'number' || typeof s.missionsDone !== 'number') return null;
    return {
      cash: s.cash,
      missionsDone: s.missionsDone,
      totalEarned: typeof s.totalEarned === 'number' ? s.totalEarned : s.cash,
      missionIndex: typeof s.missionIndex === 'number' ? s.missionIndex : s.missionsDone,
    };
  } catch {
    return null;
  }
}

export function writeSave(S) {
  try {
    localStorage.setItem(C.saveKey, JSON.stringify({
      cash: S.player.cash,
      missionsDone: S.missions.missionsDone,
      totalEarned: S.missions.totalEarned,
      missionIndex: S.missions.index,
    }));
  } catch {
    // Storage may be unavailable (private mode, headless): the game still
    // plays, it just cannot persist.
  }
}

export function hasSave() {
  return loadSave() !== null;
}
