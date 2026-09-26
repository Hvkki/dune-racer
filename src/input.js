// Keyboard input. Tracks key state and exposes a per-frame command snapshot.

const keys = Object.create(null);
let resetRequested = false;

export function initInput() {
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    // prevent page scroll on space / arrows
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'KeyR') resetRequested = true;
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Drop all keys when the window loses focus so the car doesn't run away.
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
  });
}

export function readInput() {
  const throttle = (keys.KeyW || keys.ArrowUp) ? 1 : 0;
  const brake = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  // +1 = steer left, -1 = steer right
  const steer =
    ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) -
    ((keys.KeyD || keys.ArrowRight) ? 1 : 0);
  const nitro = !!keys.Space;
  const handbrake = !!(keys.ShiftLeft || keys.ShiftRight);
  return { throttle, brake, steer, nitro, handbrake };
}

export function consumeReset() {
  if (resetRequested) {
    resetRequested = false;
    return true;
  }
  return false;
}
