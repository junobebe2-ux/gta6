// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps,
// and the renderer paints what is there. The game moves between four screens: title, play,
// paused and game over. Behind the title the city lives on its own (attract mode).
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages that scene instead
// of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createRender } from './render.js';
import { buildCity } from './city.js';
import { createGame } from './game.js';
import { createHud } from './hud.js';
import { loadSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const EMPTY_ACTIONS = new Set();
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const render = createRender(canvas);
const audio = createAudio();
const input = createInput(canvas);
const city = buildCity(render.scene, rng);
const hud = createHud(city);
const save = loadSave();
const game = createGame({ render, audio, hud, city, rng, save });

// For headless playtests: a JSON snapshot of the live state.
window.__gameState = () => JSON.stringify({
  wanted: game.state.wanted,
  health: Math.round(game.state.health),
  cash: game.state.cash,
  inCar: game.isDriving(),
  missionsDone: game.state.missionsDone,
  gameOver: game.state.gameOver,
  x: Math.round(game.player.x),
  z: Math.round(game.player.z),
  nearCar: Math.round(game.nearestCarDist() * 10) / 10,
});

const screens = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  over: document.getElementById('screen-over'),
};
const hudEl = document.getElementById('hud');
const overTitle = document.getElementById('over-title');
const overStats = document.getElementById('over-stats');

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.classList.toggle('hidden', key !== name);
  hudEl.classList.toggle('hidden', name === 'title');
}

function announce(message) {
  status.textContent = message;
}

function neutralInput() {
  return {
    move: () => ({ x: 0, y: 0 }),
    run: () => false,
    brake: () => false,
    takeActions: () => new Set(),
    takeMouse: () => ({ dx: 0, dy: 0 }),
    takeClick: () => false,
    isDown: () => false,
  };
}

function fillOverScreen() {
  const s = game.state;
  overTitle.textContent = s.gameOver === 'busted' ? 'BUSTED' : 'WASTED';
  overStats.innerHTML =
    `Cash <b>$${s.cash.toLocaleString('en-US')}</b> &nbsp;·&nbsp; Missions <b>${s.missionsDone}/4</b>` +
    ` &nbsp;·&nbsp; Cars stolen <b>${s.stats.carsStolen}</b> &nbsp;·&nbsp; Shots fired <b>${s.stats.shotsFired}</b>`;
}

if (shot) {
  // Screenshot mode: stage the scene, paint it twice, signal readiness.
  const screen = stageShot(shot, game, render);
  if (screen === 'title') {
    showScreen('title');
    render.camera.position.set(120, 70, 180);
    render.camera.lookAt(0, 10, 0);
  } else if (screen === 'over') {
    fillOverScreen();
    showScreen('over');
    render.updateCamera(game.focus(), 'foot', 0.5);
  } else {
    showScreen(null);
    render.updateCamera(game.focus(), game.isDriving() ? 'car' : 'foot', 0.5);
  }
  render.updateParticles(0.016);
  render.render();
  requestAnimationFrame(() => {
    render.render();
    window.__shotReady = true;
  });
} else {
  // The live game.
  let screen = 'title';
  let time = 0;
  let accumulator = 0;
  let last = performance.now();
  let attractAngle = 0;

  const btnStart = document.getElementById('btn-start');
  const btnContinue = document.getElementById('btn-continue');
  const btnResume = document.getElementById('btn-resume');
  const btnRestart = document.getElementById('btn-restart');
  const btnAgain = document.getElementById('btn-again');
  const btnMute = document.getElementById('btn-mute');
  const saveInfo = document.getElementById('save-info');

  if (save && save.missionsDone > 0) {
    saveInfo.textContent = `Welcome back — $${save.cash.toLocaleString('en-US')} in the bank, ${save.missionsDone}/4 missions done.`;
    btnContinue.classList.remove('hidden');
  }

  function startGame(fresh) {
    audio.unlock();
    if (fresh) {
      game.reset();
      game.state.cash = 0;
      game.state.missionsDone = 0;
      game.state.totalEarned = 0;
      game.missions.state.index = 0;
      game.missions.state.stage = 'steal';
      game.missions.state.storyDone = false;
      game.missions.state.done = false;
    }
    screen = 'play';
    showScreen(null);
    announce('Playing. Follow the objective on the right.');
  }

  btnStart.addEventListener('click', () => startGame(true));
  btnContinue.addEventListener('click', () => startGame(false));
  btnResume.addEventListener('click', () => {
    screen = 'play';
    showScreen(null);
    announce('Playing.');
  });
  btnRestart.addEventListener('click', () => startGame(true));
  btnAgain.addEventListener('click', () => startGame(true));
  btnMute.addEventListener('click', () => {
    audio.setMuted(!audio.isMuted());
    btnMute.textContent = audio.isMuted() ? 'Unmute (M)' : 'Mute (M)';
  });

  document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  document.addEventListener('keydown', () => audio.unlock(), { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'pause';
      showScreen('pause');
      announce('Paused.');
    }
  });

  showScreen('title');
  announce('Solmar City. Press Start to play.');

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    if (actions.has('KeyM')) {
      audio.setMuted(!audio.isMuted());
      btnMute.textContent = audio.isMuted() ? 'Unmute (M)' : 'Mute (M)';
    }
    if (screen === 'play' && (actions.has('Escape') || actions.has('KeyP'))) {
      screen = 'pause';
      showScreen('pause');
      announce('Paused.');
    } else if (screen === 'pause' && (actions.has('Escape') || actions.has('KeyP') || actions.has('Enter'))) {
      screen = 'play';
      showScreen(null);
      announce('Playing.');
    } else if (screen === 'title' && actions.has('Enter')) {
      startGame(true);
    } else if (screen === 'over' && actions.has('Enter')) {
      startGame(true);
    }

    if (screen === 'play' || screen === 'title') {
      let firstStep = true;
      while (accumulator >= STEP) {
        time += STEP;
        if (screen === 'play') {
          // One-shot actions go to the first step only, or E would enter and exit in one frame.
          const over = game.step(STEP, input, time, firstStep ? actions : EMPTY_ACTIONS);
          firstStep = false;
          if (over) {
            screen = 'over';
            fillOverScreen();
            showScreen('over');
            announce(over === 'busted' ? 'Busted. Game over.' : 'Wasted. Game over.');
            break;
          }
        } else {
          // Attract mode: the city lives, the player waits.
          game.step(STEP, neutralInput(), time);
        }
        accumulator -= STEP;
      }
      if (screen === 'title') {
        attractAngle += 0.02 * Math.min(0.05, 1 / 60);
        const r = 190;
        render.camera.position.set(Math.cos(attractAngle) * r, 64, Math.sin(attractAngle) * r);
        render.camera.lookAt(0, 8, 0);
      } else {
        render.updateCamera(game.focus(), game.isDriving() ? 'car' : 'foot', 1 / 60);
      }
    } else {
      accumulator = 0;
    }
    render.updateParticles(1 / 60);
    render.render();
  }
  requestAnimationFrame(frame);
}
