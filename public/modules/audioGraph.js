// ── Module state ──────────────────────────────────────────────────────────────
let audioCtx      = null;
let sourceNode    = null;
let gainNode      = null;
let convolverNode = null;
let analyserNode  = null;

// Holds the desired output device ID so it can be applied either immediately
// (if the context already exists) or deferred until the context is first created.
let pendingDeviceId = null;

// ── Output device ─────────────────────────────────────────────────────────────

/**
 * Routes audio output to the given device.
 * If the AudioContext has already been created, applies the change immediately
 * via setSinkId(). If not, stores the ID so ensureContext() can apply it on
 * first creation — this covers the case where the user selects a device before
 * hitting play for the first time.
 *
 * @param {string} deviceId - The MediaDeviceInfo.deviceId of the target output.
 * @returns {Promise<void>}
 */
export async function setOutputDevice(deviceId) {
  pendingDeviceId = deviceId;

  if (!audioCtx) return;

  try {
    await audioCtx.setSinkId(deviceId);
  } catch (error) {
    console.error('Failed to set output device:', error);
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Creates the AudioContext and wires the persistent output chain
 * (gainNode → analyserNode → destination) on first call, then resumes
 * the context if it was suspended.
 *
 * Applies any pending output device selection made before the context existed.
 *
 * Must be called from a user-gesture handler — browsers block AudioContext
 * creation until the user has interacted with the page.
 *
 * @returns {Promise<void>}
 */
export async function ensureContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext();

    if (pendingDeviceId) await audioCtx.setSinkId(pendingDeviceId);

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

/**
 * Creates a short-lived AudioContext to read the maximum channel count for
 * a given device, then closes it immediately.
 *
 * Reading maxChannelCount from the main context after setSinkId() is
 * unreliable across browser versions — the destination may still reflect
 * the previous device. A probe context always reports the device's true
 * capabilities regardless of what the main context is doing.
 *
 * @param {string} deviceId - The MediaDeviceInfo.deviceId to probe.
 * @returns {Promise<number>}
 */
export async function probeChannelCount(deviceId) {
  const probeCtx = new AudioContext();
  try {
    await probeCtx.setSinkId(deviceId);
    console.log(probeCtx)
    return probeCtx.destination.maxChannelCount;
  } finally {
    await probeCtx.close();
  }
}
