// The save: cash and mission progress, kept in localStorage between visits. A save that
// cannot be read (private windows, disabled storage) is simply ignored.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number.isFinite(data.cash) ? Math.max(0, data.cash | 0) : 0,
      missionsDone: Number.isFinite(data.missionsDone) ? Math.max(0, data.missionsDone | 0) : 0,
      totalEarned: Number.isFinite(data.totalEarned) ? Math.max(0, data.totalEarned | 0) : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ cash: data.cash | 0, missionsDone: data.missionsDone | 0, totalEarned: data.totalEarned | 0 }),
    );
  } catch {
    // Storage can be off: the game then keeps its progress for this visit only.
  }
}
