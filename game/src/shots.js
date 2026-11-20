// Deterministic screenshot scenes (?shot=start|play|chase|end&seed=1): the
// same seed always builds the same scene.
import { writeSave } from './save.js';

export function applyShot(ctx, name) {
  const { state, player, vehicles, police, hud, game } = ctx;

  if (name === 'start') {
    // Seed a demo save so the title screen offers Continue.
    writeSave({ cash: 1234, missionsDone: 2, totalEarned: 550 });
    state.mode = 'title';
    hud.showScreen('title');
    return;
  }

  game.startNew();

  if (name === 'play') {
    // A fresh run starts broke, by design.
    state.cash = 0;
    const car = vehicles.cars[0];
    if (car) {
      player.setPosition(car.x + 1.5, car.z);
      vehicles.tryEnter(player, ctx);
    }
    state.mode = 'play';
    hud.showScreen(null);
    return;
  }

  if (name === 'chase') {
    state.cash = 550;
    const car = vehicles.cars[0];
    if (car) {
      player.setPosition(car.x + 1.5, car.z);
      vehicles.tryEnter(player, ctx);
    }
    // Stealing the car already raised wanted by 1, so add 2 more for a
    // 3-star chase.
    police.raise(2, 'Police chase', state);
    state.wantedReason = 'Police chase';
    for (let i = 0; i < 5; i++) police.step(0.016, ctx);
    state.mode = 'play';
    hud.showScreen(null);
    return;
  }

  if (name === 'end') {
    state.health = 0;
    game.gameOver('WASTED');
  }
}
