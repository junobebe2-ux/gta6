// Keyboard and mouse, read once a frame. Keys are WASD + E (enter/exit car, interact),
// F (punch), Shift (run), Space (handbrake / jump), Esc/P (pause), M (mute). The mouse orbits
// the camera while dragged and aims the crosshair; a click shoots.
export function createInput(canvas) {
  const keys = new Set();
  const actions = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let clicked = false;

  function keyName(event) {
    return event.code;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(keyName(event));
    actions.add(keyName(event));
    if (event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(keyName(event));
  });
  window.addEventListener('blur', () => {
    keys.clear();
  });

  canvas.addEventListener('mousedown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    clicked = true;
    if (canvas.requestPointerLock) canvas.requestPointerLock();
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  });
  window.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas) {
      mouseDX += event.movementX;
      mouseDY += event.movementY;
      return;
    }
    if (!dragging) return;
    mouseDX += event.clientX - lastX;
    mouseDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });

  return {
    /** WASD as -1..1 each axis, camera-relative. */
    move() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      return { x, y };
    },
    run() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    brake() {
      return keys.has('Space');
    },
    /** Whether a key is held down right now (for hold-to-interact). */
    isDown(code) {
      return keys.has(code);
    },
    /** One-shot actions since the last take(): 'KeyE', 'KeyF', 'KeyP', 'Escape', 'KeyM', 'Enter', 'Space'. */
    takeActions() {
      const out = new Set(actions);
      actions.clear();
      return out;
    },
    /** Mouse orbit since the last take(), in pixels. */
    takeMouse() {
      const out = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return out;
    },
    /** Whether the canvas was clicked since the last take(). */
    takeClick() {
      const out = clicked;
      clicked = false;
      return out;
    },
  };
}
