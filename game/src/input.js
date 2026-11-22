// Keyboard + mouse state. Keys are edge-triggered for actions (E, F)
// through the `pressed` set, which the game loop clears each frame.
export function createInput() {
  const keys = {};
  const pressed = new Set();
  const input = {
    keys,
    pressed,
    mouseDown: false,
    mouseClicked: false,
    attach() {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        keys[e.code] = true;
        pressed.add(e.code);
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => { keys[e.code] = false; });
      window.addEventListener('blur', () => {
        for (const k of Object.keys(keys)) keys[k] = false;
      });
      window.addEventListener('mousedown', (e) => {
        if (e.button === 0) { input.mouseDown = true; input.mouseClicked = true; }
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) input.mouseDown = false;
      });
    },
    get forward() { return !!(keys.KeyW || keys.ArrowUp); },
    get back() { return !!(keys.KeyS || keys.ArrowDown); },
    get left() { return !!(keys.KeyA || keys.ArrowLeft); },
    get right() { return !!(keys.KeyD || keys.ArrowRight); },
    get run() { return !!(keys.ShiftLeft || keys.ShiftRight); },
    get handbrake() { return !!keys.Space; },
    endFrame() {
      pressed.clear();
      input.mouseClicked = false;
    },
  };
  return input;
}
