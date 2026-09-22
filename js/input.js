export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let shootQueued = false;
  let restartQueued = false;
  let pauseQueued = false;
  let choiceQueued = null;
  let confirmQueued = false;

  function updateMouse(event) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    mouse.x = ((event.clientX - rect.left) / rect.width) * (canvas.width / dpr);
    mouse.y = ((event.clientY - rect.top) / rect.height) * (canvas.height / dpr);
  }

  let muteQueued = false;

  window.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code === "Space" || event.code === "Enter") {
      event.preventDefault();
      if (event.code === "Enter") confirmQueued = true;
      else shootQueued = true;
    }
    if (event.code === "KeyR") {
      restartQueued = true;
    }
    if (event.code === "KeyM") {
      muteQueued = true;
    }
    if (event.code === "Escape") {
      event.preventDefault();
      pauseQueued = true;
    }
    if (event.code === "Digit1" || event.code === "Numpad1") {
      choiceQueued = 0;
    }
    if (event.code === "Digit2" || event.code === "Numpad2") {
      choiceQueued = 1;
    }
    if (event.code === "Digit3" || event.code === "Numpad3") {
      choiceQueued = 2;
    }
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("mousemove", updateMouse);
  canvas.addEventListener("mousedown", (event) => {
    updateMouse(event);
    if (event.button === 0) {
      mouse.down = true;
      shootQueued = true;
    }
    if (event.button === 2) event.preventDefault();
  });
  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) mouse.down = false;
  });

  function axis() {
    let x = 0;
    let y = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.sqrt(2);
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  function consumeShoot() {
    const fired = shootQueued;
    shootQueued = false;
    return fired;
  }

  function consumeRestart() {
    const restart = restartQueued;
    restartQueued = false;
    return restart;
  }

  function consumePause() {
    const pause = pauseQueued;
    pauseQueued = false;
    return pause;
  }

  function consumeChoice() {
    const choice = choiceQueued;
    choiceQueued = null;
    return choice;
  }

  function consumeConfirm() {
    const ok = confirmQueued;
    confirmQueued = false;
    return ok;
  }

  function consumeMute() {
    const mute = muteQueued;
    muteQueued = false;
    return mute;
  }

  function isShootHeld() {
    return mouse.down || keys.has("Space");
  }

  return {
    mouse,
    axis,
    consumeShoot,
    consumeRestart,
    consumePause,
    consumeChoice,
    consumeConfirm,
    consumeMute,
    isShootHeld,
  };
}
