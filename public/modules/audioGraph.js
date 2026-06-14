// ── Module state ──────────────────────────────────────────────────────────────
let audioCtx      = null;
let sourceNode    = null;
let gainNode      = null;
let convolverNode = null;
let analyserNode  = null;

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Creates the AudioContext and wires the persistent output chain
 * (gainNode → analyserNode → destination) on first call, then resumes
 * the context if it was suspended.
 *
 * Must be called from a user-gesture handler — browsers block AudioContext
 * creation until the user has interacted with the page.
 *
 * @returns {Promise<void>}
 */
export async function ensureContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext();

    // Build the persistent output chain once. These nodes survive across
    // play calls — only the source and convolver are rebuilt per play.
    gainNode     = audioCtx.createGain();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;

    gainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
  }

  if (audioCtx.state === 'suspended') await audioCtx.resume();
}

// ── Buffer loading ────────────────────────────────────────────────────────────

/**
 * Fetches an audio file and decodes it into an AudioBuffer.
 * ensureContext() must have been called before this.
 *
 * @param {string} url - Server path to the audio file.
 * @returns {Promise<AudioBuffer>}
 */
export async function loadBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  return audioCtx.decodeAudioData(arrayBuffer);
}

// ── Source chain ──────────────────────────────────────────────────────────────

/**
 * Creates a fresh source node and convolver for one play session and plugs
 * them into the persistent gain node.
 *
 * The caller is responsible for setting playbackRate and gain.value on the
 * returned node before calling .start().
 *
 * @param {AudioBuffer} sampleBuffer  - Decoded audio for the dry sample.
 * @param {AudioBuffer} impulseBuffer - Decoded audio for the impulse response.
 * @returns {AudioBufferSourceNode} The configured source node, ready to start.
 */
export function buildSourceChain(sampleBuffer, impulseBuffer) {
  convolverNode        = audioCtx.createConvolver();
  convolverNode.buffer = impulseBuffer;

  sourceNode        = audioCtx.createBufferSource();
  sourceNode.buffer = sampleBuffer;

  sourceNode.connect(convolverNode);
  convolverNode.connect(gainNode);

  return sourceNode;
}

/**
 * Stops and disconnects the current source node and convolver.
 * Nullifies onended first so any natural-completion handler registered by
 * the caller does not fire after a manual stop.
 */
export function teardownSource() {
  if (!sourceNode) return;

  sourceNode.onended = null;
  try { sourceNode.stop(); } catch (_) {}
  sourceNode.disconnect();
  sourceNode = null;

  if (convolverNode) {
    convolverNode.disconnect();
    convolverNode = null;
  }
}

/**
 * Clears the source and convolver references after natural playback completion.
 * Unlike teardownSource(), does not call .stop() — the node already finished.
 */
export function clearSourceRef() {
  sourceNode = null;

  if (convolverNode) {
    convolverNode.disconnect();
    convolverNode = null;
  }
}

// ── Getters ───────────────────────────────────────────────────────────────────
// Expose live node references so external controls (pitch slider, volume
// slider, VU meter) can reach the graph without going through play().

/** @returns {AudioContext|null} */
export function getAudioCtx()     { return audioCtx;     }

/** @returns {AudioBufferSourceNode|null} */
export function getSourceNode()   { return sourceNode;   }

/** @returns {GainNode|null} */
export function getGainNode()     { return gainNode;      }

/** @returns {AnalyserNode|null} */
export function getAnalyserNode() { return analyserNode; }
