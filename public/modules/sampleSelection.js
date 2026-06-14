/**
 * The sample <select> element.
 * Exported so app.js can read the current value and wire up change listeners.
 * @type {HTMLSelectElement}
 */
export const sampleSel = document.getElementById('sample-select');

/**
 * The impulse response <select> element.
 * Exported so app.js can read the current value and wire up change listeners.
 * @type {HTMLSelectElement}
 */
export const impulseSel = document.getElementById('impulse-select');

// Tracks the last randomly chosen index for each selector so the pickRandom*
// functions can avoid immediately repeating the same file.
let lastSampleIndex  = -1;
let lastImpulseIndex = -1;

/**
 * Populates a <select> element with audio file entries from the server.
 * Each option's value is the full server URL path; its visible label is the bare filename.
 *
 * @param {HTMLSelectElement} selectElement - The select to populate.
 * @param {string[]} files - Array of filenames returned by the API.
 * @param {string} urlPrefix - Server path prefix, e.g. 'samples' or 'impulses'.
 */
function populateSelect(selectElement, files, urlPrefix) {
  selectElement.innerHTML = '';

  if (!files.length) {
    selectElement.innerHTML = `<option value="">— no files found —</option>`;
    return;
  }

  files.forEach(filename => {
    const option = document.createElement('option');
    option.value       = `/${urlPrefix}/${encodeURIComponent(filename)}`;
    option.textContent = filename;
    selectElement.appendChild(option);
  });
}

/**
 * Fetches available samples and impulses from the server and populates both selectors.
 *
 * Accepts setStatus and onReady as callbacks rather than importing them directly —
 * that would create a circular dependency since both functions reference DOM elements
 * that live in app.js.
 *
 * @param {(message: string, cls: string) => void} setStatus - Updates the status bar.
 * @param {() => void} onReady - Called after selectors are populated, e.g. to enable buttons.
 * @returns {Promise<void>}
 */
export async function loadLists(setStatus, onReady) {
  try {
    const [samples, impulses] = await Promise.all([
      fetch('/api/samples').then(response => response.json()),
      fetch('/api/impulses').then(response => response.json())
    ]);

    populateSelect(sampleSel,  samples,  'samples');
    populateSelect(impulseSel, impulses, 'impulses');

    onReady();

    const bothLoaded = samples.length && impulses.length;
    setStatus(
      bothLoaded
        ? `${samples.length} sample(s), ${impulses.length} impulse(s) loaded`
        : 'Warning: one or more folders appear empty',
      bothLoaded ? 'ok' : 'err'
    );
  } catch (error) {
    setStatus('Failed to load file lists: ' + error.message, 'err');
  }
}

/**
 * Selects a random sample, skipping the most recently played index to avoid
 * immediate repeats during auto-play.
 */
export function pickRandomSample() {
  const options = sampleSel.options;
  if (options.length <= 1) return;

  let index;
  do { index = Math.floor(Math.random() * options.length); }
  while (index === lastSampleIndex && options.length > 1);

  lastSampleIndex = index;
  sampleSel.selectedIndex = index;
}

/**
 * Selects a random impulse response, skipping the most recently played index
 * to avoid immediate repeats during auto-play.
 */
export function pickRandomImpulse() {
  const options = impulseSel.options;
  if (options.length <= 1) return;

  let index;
  do { index = Math.floor(Math.random() * options.length); }
  while (index === lastImpulseIndex && options.length > 1);

  lastImpulseIndex = index;
  impulseSel.selectedIndex = index;
}
