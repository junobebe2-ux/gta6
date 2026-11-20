// Solmar City — keyboard + mouse state.
// One input object per game: keys tracked by code, mouse drag turns the
// camera, clicks are consumed exactly once. Losing focus clears all keys.

export function createInput() {
  const keys = new Set();
  const clickQueue = [];
  let dragDX = 0;
  let dragging = false;
  let lastX = 0;
  let attached = false;

  function onKeyDown(e) {
    keys.add(e.code);
    // Stop the page scrolling on game keys.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onBlur() {
    keys.clear();
    dragging = false;
  }

  function onMouseDown(e) {
    clickQueue.push({ x: e.clientX, y: e.clientY, button: e.button });
    dragging = true;
    lastX = e.clientX;
  }

  function onMouseMove(e) {
    if (!dragging) return;
    dragDX += e.clientX - lastX;
    lastX = e.clientX;
  }

  function onMouseUp() {
    dragging = false;
  }

  const input = {
    isDown(code) {
      return keys.has(code);
    },
    // Movement axes from WASD / arrows: x is strafe-right (+1), y is
    // forward (+1). Normalised so diagonals are not faster.
    axis() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      return { x, y };
    },
    // The oldest unconsumed click, or null. Each click is returned once.
    consumeClick() {
      return clickQueue.length > 0 ? clickQueue.shift() : null;
    },
    // Horizontal mouse drag since the last call, in pixels; resets to 0.
    consumeDragDX() {
      const d = dragDX;
      dragDX = 0;
      return d;
    },
    attach() {
      if (attached || typeof window === 'undefined') return;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      attached = true;
    },
    detach() {
      if (!attached || typeof window === 'undefined') return;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      attached = false;
    },
    // Test hooks: feed a key or a click without a real event.
    _press(code) {
      keys.add(code);
    },
    _release(code) {
      keys.delete(code);
    },
    _click(x, y) {
      clickQueue.push({ x, y, button: 0 });
    },
  };
  return input;
}
