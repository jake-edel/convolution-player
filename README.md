# Convolution Player

A browser-based audio player that runs audio samples through convolution reverb (impulse responses) with randomised autoplay, pitch control, and OSC output.

## Stack

- **Server:** Node.js + Express, bound to `192.168.254.25:3000`
- **Audio:** Web Audio API (`ConvolverNode`, `GainNode`, `BufferSourceNode`) — runs entirely in the browser
- **OSC:** `node-osc` sends UDP messages to `192.168.254.25:9000` on play and stop events

## Setup

```bash
npm install
npm start
# → http://192.168.254.25:3000
```

### Audio files

`samples/` and `impulses/` are symlinked to:

```
/Users/philed/Dropbox/JS/osc-audio-app/samples
/Users/philed/Dropbox/JS/osc-audio-app/impulses
```

Supported formats: `.wav`, `.mp3`, `.aiff`, `.aif`, `.ogg`, `.flac`, `.m4a`

Files are scanned at request time — add or remove files and reload the page, no server restart needed.

---

## Controls

### Sample / Impulse Response

Two dropdowns populated from the `samples/` and `impulses/` folders on page load. Select a sample and an impulse before playing. In autoplay mode both are randomised automatically on each cycle.

---

### Volume

Slider from 0–100%. Controls a `GainNode` in the Web Audio graph. Changes take effect immediately during playback with a short ramp to avoid clicks. A live VU bar below the slider shows output level.

---

### Number (1–4)

Four toggle buttons. The selected number is included as the first argument in every OSC message. Use this to route messages to different targets or patches on the receiving end.

---

### ▶ Play

Loads the selected sample and impulse response, builds the audio graph, and starts playback. Also sends an OSC `/play` message.

Clicking Play while autoplay is running stops the autoplay cycle and plays the currently selected sample once.

**OSC message on play:**
```
/play  <number>  <sampleFilename>  <impulseFilename>
```

---

### ⟳ Auto

Starts the autoplay cycle. On each cycle:

1. Picks a random sample (never the same one twice in a row)
2. Picks a random impulse response (never the same one twice in a row)
3. Picks a random pitch (-24 to +24 semitones)
4. Plays the sample through the impulse
5. Waits for playback to finish, then waits the **Gap** duration before starting the next cycle

Clicking the button again (labelled **⟳ Stop Auto** while active) stops the cycle and sends an OSC `/stop` message.

---

### ■ Stop

Stops playback immediately and sends an OSC `/stop` message.

**OSC message on stop:**
```
/stop  <number>
```

---

### Gap (s)

Controls the pause between samples during autoplay. Range: 0–10 seconds in 0.5 s steps. Default: 1 s.

---

### Pitch

Semitone offset applied to playback via `BufferSourceNode.playbackRate` (`rate = 2^(semitones/12)`). Range: -24 to +24 semitones (two octaves each way). Note: changing playback rate also changes playback speed proportionally.

Changes take effect immediately during playback. Randomised on each autoplay cycle.

---

### ⇅ Walk

Toggles pitch walking. While active, the pitch is nudged by a random amount at a random interval between 0.5 and 5 seconds. The pitch stays clamped within the -24/+24 semitone range.

The **Step** slider (±1–12 st) controls the maximum size of each pitch jump.

Walk runs independently of autoplay — both can be active simultaneously.

---

## OSC Reference

All messages are sent via UDP to `192.168.254.25:9000`.

| Event | Address | Args |
|---|---|---|
| Play | `/play` | `number (int), sampleName (str), impulseName (str)` |
| Stop | `/stop` | `number (int)` |

---

## Hot Reload

The server watches `public/` for file changes. The browser polls `/ping` every second and reloads automatically when a change is detected. No dev server required.
