// The save: cash and mission progress, kept in localStorage between visits. Anything
// unreadable (a private window, storage turned off) is quietly treated as no save.
import { SAVE_KEY } from './config.js';

function cleanNumber(value) {
  return Number.isFinite(value) ? Math.max(0, value | 0) : 0;
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: cleanNumber(data.cash),
      missionsDone: cleanNumber(data.missionsDone),
      totalEarned: cleanNumber(data.totalEarned),
    };
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        cash: data.cash | 0,
        missionsDone: data.missionsDone | 0,
        totalEarned: data.totalEarned | 0,
      }),
    );
  } catch {
    // Storage can be off: progress then lasts for this visit only.
  }
}
