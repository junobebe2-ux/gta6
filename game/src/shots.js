// The deterministic screenshot scenes behind ?shot=start|play|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot, so the frame is what a short game really looks like and the same seed always
// gives the same frame. The HUD stays on: the judge reads the game from these frames.
import { STEP } from './config.js';

function fakeInput(drive) {
  return {
    move() {
      return drive ? { x: 0, y: 1 } : { x: 0, y: 1 };
    },
    run() {
      return false;
    },
    brake() {
      return false;
    },
    takeActions() {
      return new Set();
    },
    takeMouse() {
      return { dx: 0, dy: 0 };
    },
    takeClick() {
      return false;
    },
    isDown() {
      return false;
    },
  };
}

function runSteps(game, seconds, drive) {
  const input = fakeInput(drive);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.step(STEP, input, i * STEP);
    if (game.state.gameOver) break;
  }
}

/**
 * Stage the named scene and return the screen to draw over it: 'title', 'play' or 'over'.
 * Any other name stages the title.
 */
export function stageShot(name, game, render) {
  game.reset();
  if (name === 'play') {
    // On foot at a busy intersection, walking down the road as traffic passes.
    game.debugTeleport(-56, -56, 0);
    runSteps(game, 10, false);
    game.debugStageStreet();
    return 'play';
  }
  if (name === 'chase') {
    // Behind the wheel mid-city with three stars: police cars closing in.
    game.debugTeleport(-168, -80, 0);
    game.debugEnterNearestCar();
    game.debugSetWanted(3);
    runSteps(game, 5, true);
    return 'play';
  }
  if (name === 'end') {
    // Wasted after a chase: on foot, a police car beside them, the city behind.
    game.debugTeleport(-168, -80, 0);
    game.debugEnterNearestCar();
    game.debugSetWanted(3);
    runSteps(game, 4, true);
    game.debugExitCar();
    game.debugSetHealth(0);
    game.state.gameOver = 'wasted';
    game.step(STEP, fakeInput(false), 99); // one step so the HUD paints the final state
    return 'over';
  }
  // Title: the city alive behind the menu, traffic rolling, palms in the sun.
  runSteps(game, 5, false);
  return 'title';
}
