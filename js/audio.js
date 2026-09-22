const MUTE_KEY = "mase-mute";

let ctx = null;
let unlocked = false;
let lastStepAt = 0;
let muted = false;

function readMute() {
  try {
    return sessionStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

muted = readMute();

export function isMuted() {
  return muted;
}

export function setMuted(on) {
  muted = !!on;
  try {
    sessionStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

function ac() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

export function unlockAudio() {
  const audio = ac();
  if (!audio) return;
  if (audio.state === "suspended") audio.resume();
  unlocked = true;
}

function beep(freq, dur, type = "sine", gain = 0.08, slide = 0) {
  const audio = ac();
  if (!audio || !unlocked || muted) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, gain = 0.04) {
  const audio = ac();
  if (!audio || !unlocked || muted) return;
  const n = Math.floor(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, n, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = audio.createBufferSource();
  const g = audio.createGain();
  src.buffer = buf;
  g.gain.value = gain;
  src.connect(g);
  g.connect(audio.destination);
  src.start();
}

export const sfx = {
  shoot() {
    beep(420, 0.07, "square", 0.05, -180);
    noise(0.04, 0.03);
  },
  enemyShoot() {
    beep(240, 0.08, "sawtooth", 0.035, -80);
  },
  bounce() {
    beep(680, 0.05, "triangle", 0.045, 120);
  },
  mark() {
    beep(520, 0.12, "sine", 0.07, 200);
  },
  reject() {
    beep(160, 0.1, "square", 0.04, -60);
    noise(0.06, 0.025);
  },
  portal() {
    beep(180, 0.2, "triangle", 0.04, 220);
  },
  hunt() {
    beep(140, 0.28, "sawtooth", 0.06, 80);
    beep(280, 0.22, "square", 0.03, 40);
  },
  hurt() {
    beep(110, 0.14, "sawtooth", 0.07, -40);
  },
  die() {
    beep(90, 0.35, "sawtooth", 0.08, -50);
  },
  upgrade() {
    beep(440, 0.08, "sine", 0.05, 80);
    beep(660, 0.12, "sine", 0.04, 40);
  },
  notebook() {
    beep(330, 0.18, "triangle", 0.06, 90);
    beep(495, 0.22, "sine", 0.05, 60);
  },
  step(now) {
    if (now - lastStepAt < 0.28) return;
    lastStepAt = now;
    noise(0.03, 0.018);
  },
  kill() {
    beep(300, 0.06, "triangle", 0.04, -100);
  },
};

export function bindAudioUnlock() {
  const once = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  };
  window.addEventListener("pointerdown", once);
  window.addEventListener("keydown", once);
}
