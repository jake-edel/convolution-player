import './modules/deviceDisplay.js';

import {
  sampleSel,
  impulseSel,
  loadLists,
  pickRandomSample,
  pickRandomImpulse,
} from './modules/sampleSelection.js';

import {
  ensureContext,
  buildSourceChain,
  teardownSource,
  clearSourceRef,
  loadBuffer,
  getAudioCtx,
  getSourceNode,
  getGainNode,
  getAnalyserNode,
} from './modules/audioGraph.js';

// ── State ──────────────────────────────────────────────────────────────────
let animFrame    = null;
let selectedNumber = 1;
let autoPlaying  = false;
let autoTimer    = null;
let walkActive   = false;
let walkTimer    = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const volumeSlider        = document.getElementById('volume');
const volDisplay          = document.getElementById('vol-display');
const vuFill              = document.getElementById('vu-fill');
const playBtn             = document.getElementById('play-btn');
const autoBtn             = document.getElementById('auto-btn');
const stopBtn             = document.getElementById('stop-btn');
const statusEl            = document.getElementById('status');
const numBtns             = document.querySelectorAll('.num-btn');
const gapSlider           = document.getElementById('gap');
const gapDisplay          = document.getElementById('gap-display');
const pitchSlider         = document.getElementById('pitch');
const pitchDisplay        = document.getElementById('pitch-display');
const walkBtn             = document.getElementById('walk-btn');
const walkStepSlider      = document.getElementById('walk-step');
const walkStepDisplay     = document.getElementById('walk-step-display');
const walkIntervalSlider  = document.getElementById('walk-interval');
const walkIntervalDisplay = document.getElementById('walk-interval-display');

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

// ── Pitch ──────────────────────────────────────────────────────────────────
function semitoneToRate(semitones) { return Math.pow(2, semitones / 12); }

function updatePitchDisplay(semitones) {
  pitchDisplay.textContent = (semitones > 0 ? '+' : '') + semitones + ' st';
}

pitchSlider.addEventListener('input', () => {
  const semitones = parseInt(pitchSlider.value);
  updatePitchDisplay(semitones);
  const source = getSourceNode();
  if (source) source.playbackRate.setTargetAtTime(semitoneToRate(semitones), getAudioCtx().currentTime, 0.01);
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
    const delta   = Math.floor(Math.random() * (maxStep * 2 + 1)) - maxStep;
    const current = parseInt(pitchSlider.value);
    const next    = Math.max(-24, Math.min(24, current + delta));
    pitchSlider.value = next;
    updatePitchDisplay(next);
    const source = getSourceNode();
    if (source) source.playbackRate.setTargetAtTime(semitoneToRate(next), getAudioCtx().currentTime, 0.05);
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
  const semitones = Math.floor(Math.random() * 49) - 24; // -24 to +24
  pitchSlider.value = semitones;
  updatePitchDisplay(semitones);
}

// ── Volume ─────────────────────────────────────────────────────────────────
volumeSlider.addEventListener('input', () => {
  const volume = parseFloat(volumeSlider.value);
  volDisplay.textContent = Math.round(volume * 100);
  const gain = getGainNode();
  if (gain) gain.gain.setTargetAtTime(volume, getAudioCtx().currentTime, 0.01);
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
  const analyser = getAnalyserNode();
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);

  function tick() {
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      // PCM values are centred on 128; normalise to 0–1.
      const amplitude = Math.abs(data[i] - 128) / 128;
      if (amplitude > peak) peak = amplitude;
    }
    vuFill.style.width = (peak * 100) + '%';
    animFrame = requestAnimationFrame(tick);
  }

  tick();
}

function stopVU() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  vuFill.style.width = '0%';
}

// ── Auto helpers ───────────────────────────────────────────────────────────
function stopAuto() {
  autoPlaying = false;
  clearTimeout(autoTimer);
  autoTimer = null;
  autoBtn.classList.remove('active');
  autoBtn.textContent = '⟳ Auto';
}

// ── Play ───────────────────────────────────────────────────────────────────
async function play() {
  if (!sampleSel.value || !impulseSel.value) return;

  await ensureContext();
  teardownSource();

  setStatus('Loading audio…', 'info');
  playBtn.disabled = true;

  try {
    const [sampleBuf, impulseBuf] = await Promise.all([
      loadBuffer(sampleSel.value),
      loadBuffer(impulseSel.value),
    ]);

    const sourceNode = buildSourceChain(sampleBuf, impulseBuf);
    getGainNode().gain.value      = parseFloat(volumeSlider.value);
    sourceNode.playbackRate.value = semitoneToRate(parseInt(pitchSlider.value));

    sourceNode.onended = () => {
      clearSourceRef();
      stopVU();
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
  // teardownSource nullifies onended before stopping, so the natural-
  // completion handler doesn't fire and overwrite our manual-stop UI state.
  teardownSource();
  stopVU();
  playBtn.classList.remove('playing');
  playBtn.textContent = '▶ Play';
  playBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus('Stopped', 'info');
}

// ── Event listeners ────────────────────────────────────────────────────────
sampleSel.addEventListener('change', checkReady);
impulseSel.addEventListener('change', checkReady);

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
