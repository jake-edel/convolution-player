// ── Module state ──────────────────────────────────────────────────────────────
let audioCtx      = null;
let sourceNode    = null;
let gainNode      = null;
let convolverNode = null;
let analyserNode  = null;

// ── Output routing state ──────────────────────────────────────────────────────

// Desired device ID stored before AudioContext exists, applied on first creation.
let pendingDeviceId   = null;

// <audio> element that plays the MediaStream. Routing to a specific device
// uses HTMLMediaElement.setSinkId(), which works in both Chrome and Firefox.
// AudioContext.setSinkId() is Chrome-only and caps at stereo.
let audioEl           = null;

// Bridge between the Web Audio graph and the <audio> element.
let streamDest        = null;

// Routes the analyser output to N discrete physical output channels.
// Rebuilt whenever the selected device changes.
let mergerNode        = null;

// Total channels on the currently selected device. Defaults to stereo
// until a device is explicitly selected.
let totalChannelCount = 2;

// ── Output routing ────────────────────────────────────────────────────────────

/**
 * Tears down the current ChannelMerger and MediaStreamDestination and rebuilds
 * them for a new channel count. All channels are enabled by default after a
 * device switch. Also recreates streamDest so the MediaStream track carries the
 * updated channel count — changing channelCount on an existing node does not
 * reliably update the track that has already been handed to the <audio> element.
 *
 * @param {number} channelCount
 */
function rebuildOutputChain(channelCount) {
  if (mergerNode) {
    try { analyserNode.disconnect(mergerNode); } catch (_) {}
    try { mergerNode.disconnect();             } catch (_) {}
  }

  mergerNode = audioCtx.createChannelMerger(channelCount);

  streamDest                  = audioCtx.createMediaStreamDestination();
  streamDest.channelCount     = channelCount;
  streamDest.channelCountMode = 'explicit';

  for (let ch = 0; ch < channelCount; ch++) {
    analyserNode.connect(mergerNode, 0, ch);
  }

  mergerNode.connect(streamDest);
  totalChannelCount = channelCount;

  if (audioEl) {
    audioEl.srcObject = streamDest.stream;
    audioEl.play().catch(error => console.warn('audioEl.play() after rebuild:', error));
  }
}

/**
 * Rewires which ChannelMerger inputs carry signal without rebuilding the full
 * chain. Called when the user toggles individual channel chips.
 *
 * @param {Set<number>} enabledChannels - 1-based channel numbers from the UI.
 */
function rerouteChannels(enabledChannels) {
  if (!mergerNode) return;

  // Disconnect all current analyser→merger connections before reconnecting,
  // since the Web Audio API has no "disconnect specific input" method on the
  // receiving end — we must remove all and re-add only the enabled ones.
  try { analyserNode.disconnect(mergerNode); } catch (_) {}

  [...enabledChannels]
    .map(ch => ch - 1)                                         // UI is 1-based; merger inputs are 0-based
    .filter(index => index >= 0 && index < totalChannelCount)
    .forEach(index => analyserNode.connect(mergerNode, 0, index));
}

/**
 * Routes audio output to the given device, rebuilding the ChannelMerger for
 * the new channel count. Deferred if the AudioContext does not yet exist.
 *
 * @param {string} deviceId     - MediaDeviceInfo.deviceId of the target output.
 * @param {number} channelCount - Number of channels the device supports.
 * @returns {Promise<void>}
 */
export async function setOutputDevice(deviceId, channelCount = 2) {
  pendingDeviceId   = deviceId;
  totalChannelCount = channelCount;

  if (!audioCtx) return;

  rebuildOutputChain(channelCount);

  if (typeof audioEl.setSinkId === 'function') {
    try {
      await audioEl.setSinkId(deviceId);
    } catch (error) {
      console.error('setSinkId failed:', error);
    }
  }
}

/**
 * Updates which physical output channels carry the audio signal by rewiring
 * the ChannelMerger inputs. Does not rebuild the chain or interrupt playback.
 *
 * @param {Set<number>} enabledChannels - 1-based channel numbers from the UI.
 */
export function setEnabledChannels(enabledChannels) {
  if (!audioCtx || !mergerNode) return;
  rerouteChannels(enabledChannels);
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

    // gainNode and analyserNode are persistent — they survive across plays.
    // sourceNode and convolverNode are rebuilt fresh for each play call.
    gainNode     = audioCtx.createGain();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;

    gainNode.connect(analyserNode);

    // Build the MediaStream output bridge. The graph terminates at streamDest
    // rather than audioCtx.destination so we can route to a specific device
    // via HTMLMediaElement.setSinkId(), which works in both Chrome and Firefox.
    mergerNode = audioCtx.createChannelMerger(totalChannelCount);

    streamDest                  = audioCtx.createMediaStreamDestination();
    streamDest.channelCount     = totalChannelCount;
    streamDest.channelCountMode = 'explicit';

    for (let ch = 0; ch < totalChannelCount; ch++) {
      analyserNode.connect(mergerNode, 0, ch);
    }
    mergerNode.connect(streamDest);

    audioEl           = document.createElement('audio');
    audioEl.srcObject = streamDest.stream;

    if (pendingDeviceId && typeof audioEl.setSinkId === 'function') {
      await audioEl.setSinkId(pendingDeviceId);
    }

    await audioEl.play();
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
    // setSinkId is Chrome-only. On Firefox we skip it and fall back to reading
    // the default context's maxChannelCount, which is imprecise for non-default
    // devices but avoids throwing and gives a usable value.
    if (typeof probeCtx.setSinkId === 'function') {
      await probeCtx.setSinkId(deviceId);
    }
    return probeCtx.destination.maxChannelCount;
  } finally {
    await probeCtx.close();
  }
}
