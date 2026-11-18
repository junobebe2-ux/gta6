// Keyboard and mouse, read once a frame. WASD moves and drives, E enters/exits/steals
// cars and interacts, F punches, Shift runs, Space is the handbrake, Esc/P pauses,
// M mutes. The mouse orbits the camera while dragged and aims; a click shoots.
export function createInput(canvas) {
  const held = new Set(); // keys down right now
  const pressed = new Set(); // keys pressed since the last takeActions()
  let dragDX = 0;
  let dragDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let clicked = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    pressed.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
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
      dragDX += event.movementX;
      dragDY += event.movementY;
      return;
    }
    if (!dragging) return;
    dragDX += event.clientX - lastX;
    dragDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });

  const down = (code) => held.has(code);

  return {
    /** WASD (or arrows) as -1..1 on each axis, camera-relative. */
    move() {
      let x = 0;
      let y = 0;
      if (down('KeyW') || down('ArrowUp')) y += 1;
      if (down('KeyS') || down('ArrowDown')) y -= 1;
      if (down('KeyA') || down('ArrowLeft')) x -= 1;
      if (down('KeyD') || down('ArrowRight')) x += 1;
      return { x, y };
    },
    run() {
      return down('ShiftLeft') || down('ShiftRight');
    },
    brake() {
      return down('Space');
    },
    /** Whether a key is held down right now (for hold-to-interact). */
    isDown(code) {
      return down(code);
    },
    /** One-shot presses since the last take(): 'KeyE', 'KeyF', 'KeyP', 'Escape', 'KeyM', 'Enter', 'Space'. */
    takeActions() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    /** Mouse orbit since the last take(), in pixels. */
    takeMouse() {
      const out = { dx: dragDX, dy: dragDY };
      dragDX = 0;
      dragDY = 0;
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
