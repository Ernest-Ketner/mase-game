const MUTE_KEY = "mase-mute";
const MUSIC_KEY = "mase-music";

let ctx = null;
let unlocked = false;
let lastStepAt = 0;
let muted = false;
let musicOn = true;
let musicTimer = null;
let musicStep = 0;
let musicNext = 0;

function readMute() {
  try {
    return sessionStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function readMusic() {
  try {
    return sessionStorage.getItem(MUSIC_KEY) !== "0";
  } catch {
    return true;
  }
}

muted = readMute();
musicOn = readMusic();

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

let muteSnap = null;

export function toggleMute() {
  const audible = !muted || musicOn;
  if (audible) {
    muteSnap = { sfx: !muted, music: musicOn };
    setMuted(true);
    setMusicOn(false);
  } else {
    const snap = muteSnap || { sfx: true, music: true };
    muteSnap = null;
    setSfxOn(snap.sfx);
    setMusicOn(snap.music);
  }
  return muted && !musicOn;
}

export function isSfxOn() {
  return !muted;
}

export function setSfxOn(on) {
  setMuted(!on);
}

export function isMusicOn() {
  return musicOn;
}

export function setMusicOn(on) {
  musicOn = !!on;
  try {
    sessionStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (musicOn) startMusic();
  else stopMusic();
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
  if (musicOn) startMusic();
}

const TRACKS = {
  ink: {
    step: 0.46,
    wave: "triangle",
    gain: 0.03,
    drone: 146.83,
    droneEvery: 8,
    notes: [293.66, 0, 349.23, 392, 349.23, 0, 293.66, 261.63, 220, 0, 261.63, 293.66, 0, 246.94, 220, 196],
  },
  margin: {
    step: 0.5,
    wave: "triangle",
    gain: 0.028,
    drone: 130.81,
    droneEvery: 8,
    notes: [261.63, 293.66, 0, 329.63, 293.66, 261.63, 0, 220, 196, 220, 0, 246.94, 261.63, 0, 196, 174.61],
  },
  dusk: {
    step: 0.48,
    wave: "triangle",
    gain: 0.03,
    drone: 110,
    droneEvery: 8,
    notes: [220, 0, 246.94, 293.66, 246.94, 220, 0, 196, 174.61, 0, 196, 220, 246.94, 0, 220, 196],
  },
  rush: {
    step: 0.24,
    wave: "triangle",
    gain: 0.036,
    drone: 164.81,
    droneEvery: 4,
    notes: [392, 440, 392, 349.23, 392, 493.88, 440, 392, 349.23, 392, 329.63, 349.23, 392, 440, 493.88, 440],
  },
};

let musicId = "ink";

function toneAt(freq, time, dur, type, gain) {
  const audio = ac();
  if (!audio || !freq || freq <= 0) return;
  const osc = audio.createOscillator();
  const filter = audio.createBiquadFilter();
  const g = audio.createGain();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1200, time);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(filter);
  filter.connect(g);
  g.connect(audio.destination);
  osc.start(time);
  osc.stop(time + dur + 0.03);
}

export function setMusicTrack(id) {
  if (!TRACKS[id] || musicId === id) return;
  musicId = id;
  musicStep = 0;
  musicNext = 0;
}

function pumpMusic() {
  const audio = ac();
  if (!audio || !musicOn || !unlocked) return;
  if (audio.state === "suspended") audio.resume();
  const track = TRACKS[musicId] || TRACKS.ink;
  if (musicNext < audio.currentTime) musicNext = audio.currentTime + 0.06;
  const horizon = audio.currentTime + 0.55;
  const noteDur = Math.min(0.36, track.step * 0.85);
  while (musicNext < horizon) {
    const freq = track.notes[musicStep % track.notes.length];
    toneAt(freq, musicNext, noteDur, track.wave, track.gain);
    if (musicId === "rush" && musicStep % 2 === 0) {
      toneAt(freq ? freq * 2 : 0, musicNext, noteDur * 0.45, "square", 0.012);
    }
    if (musicStep % track.droneEvery === 0) toneAt(track.drone, musicNext, track.step * 3.4, "sine", 0.016);
    musicStep += 1;
    musicNext += track.step;
  }
}

function startMusic() {
  if (musicTimer || !musicOn || !unlocked) return;
  if (!ac()) return;
  musicTimer = setInterval(pumpMusic, 140);
  pumpMusic();
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
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
  crumple() {
    noise(0.16, 0.05);
    beep(90, 0.12, "triangle", 0.03, -30);
  },
  smooth() {
    noise(0.1, 0.03);
    beep(220, 0.08, "sine", 0.025, 40);
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
