import { setOutputDevice } from './audioGraph.js';

const deviceGroupsEl = document.getElementById('device-groups');

// Tracks the currently selected output device across renders.
// Initialised to 'default' since that is what AudioContext uses until setSinkId() is called.
let selectedDeviceId = 'default';

/**
 * Returns the deviceId of the currently selected output device.
 * Intended for use by the audio graph when setSinkId() support is wired up.
 *
 * @returns {string}
 */
export function getSelectedDeviceId() { return selectedDeviceId; }

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
    // Permission denied or no mic present — labels will remain empty,
    // but we can still display whatever deviceIds the browser exposes.
    console.warn('Microphone permission not granted; device labels may be unavailable.', error);
  }
}

/**
 * Fetches the current output device list and re-renders the display.
 * Also called on 'devicechange' so the list stays current as
 * hardware is connected or disconnected.
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
    deviceGroupsEl.appendChild(buildChips(audioOutputs));
  } else {
    // Firefox does not enumerate output devices without the speaker-selection
    // permission policy, so this branch is expected there.
    deviceGroupsEl.textContent = 'No output devices found.';
  }
}

/**
 * Builds a row of selectable chips, one per output device.
 * Clicking a chip updates selectedDeviceId and moves the --selected class
 * without re-rendering the whole list.
 *
 * @param {MediaDeviceInfo[]} devices
 * @returns {HTMLElement}
 */
function buildChips(devices) {
  const chipRow = document.createElement('div');
  chipRow.className = 'device-chips';

  devices.forEach((device, index) => {
    const labelText = device.label || `Output ${index + 1}`;

    const chip = document.createElement('div');
    chip.className   = 'device-chip';
    chip.textContent = labelText;
    chip.title       = labelText;

    if (device.deviceId === selectedDeviceId) chip.classList.add('device-chip--selected');

    chip.addEventListener('click', () => {
      if (selectedDeviceId === device.deviceId) return;

      // Move the selected class without rebuilding the DOM.
      const previouslySelected = deviceGroupsEl.querySelector('.device-chip--selected');
      if (previouslySelected) previouslySelected.classList.remove('device-chip--selected');

      chip.classList.add('device-chip--selected');
      selectedDeviceId = device.deviceId;

      setOutputDevice(device.deviceId);
    });

    chipRow.appendChild(chip);
  });

  return chipRow;
}

unlockDeviceLabels().then(renderDevices);
navigator.mediaDevices?.addEventListener('devicechange', renderDevices);
