import {
  sampleSel,
  impulseSel,
  loadLists,
  pickRandomSample,
  pickRandomImpulse,
} from './modules/sampleSelection.js';

// ── State ──────────────────────────────────────────────────────────────────
let audioCtx = null;
let sourceNode = null;
let gainNode = null;
let convolverNode = null;
let analyserNode = null;
let animFrame = null;
let selectedNumber = 1;
let autoPlaying = false;
let autoTimer = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const volumeSlider = document.getElementById('volume');
const volDisplay   = document.getElementById('vol-display');
const vuFill       = document.getElementById('vu-fill');
const playBtn  = document.getElementById('play-btn');
const autoBtn  = document.getElementById('auto-btn');
const stopBtn  = document.getElementById('stop-btn');
const statusEl = document.getElementById('status');
const numBtns  = document.querySelectorAll('.num-btn');
const gapSlider   = document.getElementById('gap');
const gapDisplay  = document.getElementById('gap-display');
const pitchSlider    = document.getElementById('pitch');
const pitchDisplay   = document.getElementById('pitch-display');
const walkBtn             = document.getElementById('walk-btn');
const walkStepSlider      = document.getElementById('walk-step');
const walkStepDisplay     = document.getElementById('walk-step-display');
const walkIntervalSlider  = document.getElementById('walk-interval');
const walkIntervalDisplay = document.getElementById('walk-interval-display');
let walkActive = false;
let walkTimer  = null;

// ── Helpers ────────────────────────────────────────────────────────────────
function setStatus(msg, cls = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + cls;
}

function checkReady() {
  const ready = sampleSel.value && impulseSel.value;
  playBtn.disabled = !ready;
  autoBtn.disabled = !ready;
}

// ── Gap slider ─────────────────────────────────────────────────────────────
gapSlider.addEventListener('input', () => {
  gapDisplay.textContent = parseFloat(gapSlider.value).toFixed(1);
});

// ── Pitch slider ───────────────────────────────────────────────────────────
function semitoneToRate(st) { return Math.pow(2, st / 12); }

function updatePitchDisplay(st) {
  pitchDisplay.textContent = (st > 0 ? '+' : '') + st + ' st';
}

pitchSlider.addEventListener('input', () => {
  const st = parseInt(pitchSlider.value);
  updatePitchDisplay(st);
  if (sourceNode) sourceNode.playbackRate.setTargetAtTime(semitoneToRate(st), audioCtx.currentTime, 0.01);
});

// ── Pitch walk ─────────────────────────────────────────────────────────────
walkStepSlider.addEventListener('input', () => {
  walkStepDisplay.textContent = '±' + walkStepSlider.value + ' st';
});

walkIntervalSlider.addEventListener('input', () => {
  walkIntervalDisplay.textContent = parseFloat(walkIntervalSlider.value).toFixed(1) + 's';
});

function scheduleWalkStep() {
  const maxInterval = parseFloat(walkIntervalSlider.value);
  const delay = (0.5 + Math.random() * (maxInterval - 0.5)) * 1000;
  walkTimer = setTimeout(() => {
    if (!walkActive) return;
    const maxStep = parseInt(walkStepSlider.value);
    const delta = Math.floor(Math.random() * (maxStep * 2 + 1)) - maxStep;
    const current = parseInt(pitchSlider.value);
    const next = Math.max(-24, Math.min(24, current + delta));
    pitchSlider.value = next;
    updatePitchDisplay(next);
    if (sourceNode) sourceNode.playbackRate.setTargetAtTime(semitoneToRate(next), audioCtx.currentTime, 0.05);
    scheduleWalkStep();
  }, delay);
}

walkBtn.addEventListener('click', () => {
  walkActive = !walkActive;
  if (walkActive) {
    walkBtn.classList.add('active');
    walkBtn.textContent = '⇅ Drifting';
    scheduleWalkStep();
  } else {
    walkBtn.classList.remove('active');
    walkBtn.textContent = '⇅ Walk';
    clearTimeout(walkTimer);
    walkTimer = null;
  }
});

function pickRandomPitch() {
  const st = Math.floor(Math.random() * 49) - 24; // -24 to +24
  pitchSlider.value = st;
  updatePitchDisplay(st);
}

// ── Auto helpers ───────────────────────────────────────────────────────────
function stopAuto() {
  autoPlaying = false;
  clearTimeout(autoTimer);
  autoTimer = null;
  autoBtn.classList.remove('active');
  autoBtn.textContent = '⟳ Auto';
}

sampleSel.addEventListener('change', checkReady);
impulseSel.addEventListener('change', checkReady);

// ── Volume ─────────────────────────────────────────────────────────────────
volumeSlider.addEventListener('input', () => {
  const v = parseFloat(volumeSlider.value);
  volDisplay.textContent = Math.round(v * 100);
  if (gainNode) gainNode.gain.setTargetAtTime(v, audioCtx.currentTime, 0.01);
});

// ── Number buttons ─────────────────────────────────────────────────────────
numBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    numBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedNumber = parseInt(btn.dataset.n);
  });
});

// ── VU meter ───────────────────────────────────────────────────────────────
function startVU() {
  if (!analyserNode) return;
  const data = new Uint8Array(analyserNode.frequencyBinCount);
  function tick() {
    analyserNode.getByteTimeDomainData(data);
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] - 128) / 128;
      if (v > max) max = v;
    }
    vuFill.style.width = (max * 100) + '%';
    animFrame = requestAnimationFrame(tick);
  }
  tick();
}

function stopVU() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  vuFill.style.width = '0%';
}

// ── Audio buffer loader ────────────────────────────────────────────────────
async function loadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  const arrayBuf = await res.arrayBuffer();
  return audioCtx.decodeAudioData(arrayBuf);
}

// ── Play ───────────────────────────────────────────────────────────────────
async function play() {
  if (!sampleSel.value || !impulseSel.value) return;

  // Resume (or create) AudioContext
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  console.log(audioCtx.destination.maxChannelCount)

  // Stop any existing playback
  if (sourceNode) {
    try { sourceNode.stop(); } catch (_) {}
    sourceNode.disconnect();
    sourceNode = null;
  }

  setStatus('Loading audio…', 'info');
  playBtn.disabled = true;

  try {
    const [sampleBuf, impulseBuf] = await Promise.all([
      loadBuffer(sampleSel.value),
      loadBuffer(impulseSel.value)
    ]);

    // Build graph: source → convolver → gain → analyser → destination
    convolverNode = audioCtx.createConvolver();
    convolverNode.buffer = impulseBuf;

    gainNode = audioCtx.createGain();
    gainNode.gain.value = parseFloat(volumeSlider.value);

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;

    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = sampleBuf;
    sourceNode.playbackRate.value = semitoneToRate(parseInt(pitchSlider.value));

    sourceNode.connect(convolverNode);
    convolverNode.connect(gainNode);
    gainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    sourceNode.onended = () => {
      stopVU();
      sourceNode = null;
      if (autoPlaying) {
        const gapMs = parseFloat(gapSlider.value) * 1000;
        setStatus(`Auto: next in ${gapSlider.value}s…`, 'info');
        autoTimer = setTimeout(() => {
          if (!autoPlaying) return;
          pickRandomSample();
          pickRandomImpulse();
          if (!walkActive) pickRandomPitch();
          play();
        }, gapMs);
      } else {
        playBtn.classList.remove('playing');
        playBtn.textContent = '▶ Play';
        playBtn.disabled = false;
        stopBtn.disabled = true;
        setStatus('Playback finished', 'ok');
      }
    };

    sourceNode.start();
    startVU();

    const sampleName  = sampleSel.options[sampleSel.selectedIndex].textContent;
    const impulseName = impulseSel.options[impulseSel.selectedIndex].textContent;

    playBtn.classList.add('playing');
    playBtn.textContent = '▶ Playing';
    playBtn.disabled = false;
    stopBtn.disabled = false;
    setStatus(`Playing: ${sampleName} → ${impulseName}`, 'ok');

  } catch (e) {
    setStatus('Error: ' + e.message, 'err');
    playBtn.disabled = false;
  }
}

// ── Stop ───────────────────────────────────────────────────────────────────
async function stop() {
  if (sourceNode) {
    // Detach onended before stopping so the natural-completion handler
    // doesn't fire and overwrite our manual-stop UI state.
    sourceNode.onended = null;
    try { sourceNode.stop(); } catch (_) {}
    sourceNode.disconnect();
    sourceNode = null;
  }
  stopVU();
  playBtn.classList.remove('playing');
  playBtn.textContent = '▶ Play';
  playBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus('Stopped', 'info');
}

// ── Event listeners ────────────────────────────────────────────────────────
playBtn.addEventListener('click', () => { stopAuto(); play(); });

autoBtn.addEventListener('click', () => {
  if (autoPlaying) {
    stopAuto();
    stop();
  } else {
    autoPlaying = true;
    autoBtn.classList.add('active');
    autoBtn.textContent = '⟳ Stop Auto';
    stopBtn.disabled = false;
    pickRandomSample();
    pickRandomImpulse();
    if (!walkActive) pickRandomPitch();
    play();
  }
});

stopBtn.addEventListener('click', () => { stopAuto(); stop(); });

// ── Init ───────────────────────────────────────────────────────────────────
loadLists(setStatus, checkReady);
