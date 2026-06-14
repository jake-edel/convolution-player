import { setOutputDevice, probeChannelCount, setEnabledChannels } from './audioGraph.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const deviceGroupsEl  = document.getElementById('device-groups');
const channelSelectEl = document.getElementById('channel-select');
const channelChipsEl  = document.getElementById('channel-chips');

// ── State ─────────────────────────────────────────────────────────────────────
let selectedDeviceId = 'default';

// 1-based channel numbers. All channels start enabled when a device is selected.
let enabledChannels = new Set();

/**
 * Returns a copy of the set of currently enabled channel numbers (1-based).
 * Intended for use by the audio graph when channel routing is wired up.
 *
 * @returns {Set<number>}
 */
export function getEnabledChannels() { return new Set(enabledChannels); }

/**
 * Returns the deviceId of the currently selected output device.
 *
 * @returns {string}
 */
export function getSelectedDeviceId() { return selectedDeviceId; }

// ── Permission ────────────────────────────────────────────────────────────────

/**
 * Requests microphone permission — not because we use the mic, but because
 * browsers gate real device labels behind this permission. We stop the stream
 * immediately after; we only needed the grant, not the audio data.
 *
 * @returns {Promise<void>}
 */
async function unlockDeviceLabels() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
  } catch (error) {
    console.warn('Microphone permission not granted; device labels may be unavailable.', error);
  }
}

// ── Device rendering ──────────────────────────────────────────────────────────

/**
 * Fetches the current output device list and re-renders the device chips.
 * Also called on 'devicechange' so the list stays current as hardware changes.
 */
async function renderDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    deviceGroupsEl.textContent = 'Device enumeration not supported.';
    return;
  }

  const allDevices   = await navigator.mediaDevices.enumerateDevices();
  const audioOutputs = allDevices.filter(device => device.kind === 'audiooutput');

  deviceGroupsEl.innerHTML = '';

  if (audioOutputs.length) {
    deviceGroupsEl.appendChild(buildDeviceChips(audioOutputs));
  } else {
    deviceGroupsEl.textContent = 'No output devices found.';
  }
}

/**
 * Builds a row of selectable device chips. Clicking a chip selects that device,
 * routes AudioContext output to it, and updates the channel selector below.
 *
 * @param {MediaDeviceInfo[]} devices
 * @returns {HTMLElement}
 */
function buildDeviceChips(devices) {
  const chipRow = document.createElement('div');
  chipRow.className = 'device-chips';

  devices.forEach((device, index) => {
    const labelText = device.label || `Output ${index + 1}`;

    const chip = document.createElement('div');
    chip.className   = 'device-chip';
    chip.textContent = labelText;
    chip.title       = labelText;

    if (device.deviceId === selectedDeviceId) chip.classList.add('device-chip--selected');

    chip.addEventListener('click', async () => {
      if (selectedDeviceId === device.deviceId) return;

      const previouslySelected = deviceGroupsEl.querySelector('.device-chip--selected');
      if (previouslySelected) previouslySelected.classList.remove('device-chip--selected');

      chip.classList.add('device-chip--selected');
      selectedDeviceId = device.deviceId;

      // Probe channel count first so we can pass it to setOutputDevice,
      // which needs it to size the ChannelMerger correctly.
      const channelCount = await probeChannelCount(device.deviceId);
      await setOutputDevice(device.deviceId, channelCount);
      renderChannels(channelCount);
    });

    chipRow.appendChild(chip);
  });

  return chipRow;
}

// ── Channel rendering ─────────────────────────────────────────────────────────

/**
 * Renders a row of toggleable channel chips and reveals the channel section.
 * All channels start enabled. Re-calling this (on device change) resets state.
 *
 * @param {number} count - Total number of channels the device supports.
 */
function renderChannels(count) {
  enabledChannels = new Set(Array.from({ length: count }, (_, i) => i + 1));

  channelChipsEl.innerHTML = '';

  for (let channel = 1; channel <= count; channel++) {
    const chip = document.createElement('div');
    chip.className   = 'channel-chip channel-chip--enabled';
    chip.textContent = channel;
    chip.title       = `Channel ${channel}`;

    chip.addEventListener('click', () => {
      if (enabledChannels.has(channel)) {
        enabledChannels.delete(channel);
        chip.classList.remove('channel-chip--enabled');
      } else {
        enabledChannels.add(channel);
        chip.classList.add('channel-chip--enabled');
      }
      // Push the updated set into the audio graph so the ChannelMerger
      // immediately reflects which physical outputs are active.
      setEnabledChannels(enabledChannels);
    });

    channelChipsEl.appendChild(chip);
  }

  channelSelectEl.hidden = false;
}

// ── Init ──────────────────────────────────────────────────────────────────────

unlockDeviceLabels().then(renderDevices);
navigator.mediaDevices?.addEventListener('devicechange', renderDevices);
