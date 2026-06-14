// ── DOM refs ────────────────────────────────────────────────────────────────
// Exported so app.js can read the current selection values and wire up
// its own change listeners (e.g. to re-run checkReady).
export const sampleSel  = document.getElementById('sample-select');
export const impulseSel = document.getElementById('impulse-select');

// ── State ───────────────────────────────────────────────────────────────────
// Module-private. Tracks the last randomly chosen index for each selector
// so pickRandom* can avoid immediately repeating the same file.
let lastSampleIndex  = -1;
let lastImpulseIndex = -1;

// ── Helpers ─────────────────────────────────────────────────────────────────
// Fills a <select> element with audio file entries fetched from the server.
// Each option's value is the full URL path; its visible text is the filename.
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

// ── File lists ───────────────────────────────────────────────────────────────
// Fetches available samples and impulses from the server and populates both
// selectors. Accepts setStatus and onReady as callbacks rather than importing
// them directly — that would create a circular dependency with app.js since
// both functions reference DOM elements that live there.
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

// ── Randomize helpers ────────────────────────────────────────────────────────
// Each function picks a random index from its selector while avoiding the
// most recently used index, so auto-play never immediately repeats a file.

export function pickRandomSample() {
  const options = sampleSel.options;
  if (options.length <= 1) return;

  let index;
  do { index = Math.floor(Math.random() * options.length); }
  while (index === lastSampleIndex && options.length > 1);

  lastSampleIndex = index;
  sampleSel.selectedIndex = index;
}

export function pickRandomImpulse() {
  const options = impulseSel.options;
  if (options.length <= 1) return;

  let index;
  do { index = Math.floor(Math.random() * options.length); }
  while (index === lastImpulseIndex && options.length > 1);

  lastImpulseIndex = index;
  impulseSel.selectedIndex = index;
}
