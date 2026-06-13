const express = require('express');
const path = require('path');
const fs = require('fs');
const { watch } = require('fs');
const crypto = require('crypto');
// const { Client, Message } = require('node-osc');

const HOST = '0.0.0.0';
const HTTP_PORT = 3333;
// const OSC_TARGET_IP = '192.168.254.25';
// const OSC_TARGET_PORT = 9000;

// .aif/.aiff are excluded — browsers other than Safari can't decode them via Web Audio API
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac', '.m4a'];

let version = Date.now().toString();
watch(path.join(__dirname, 'public'), () => { version = Date.now().toString(); });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/samples', express.static(path.join(__dirname, 'samples')));
app.use('/impulses', express.static(path.join(__dirname, 'impulses')));

function listAudioFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort();
}

app.get('/ping', (req, res) => res.send(version));

app.get('/api/samples', (req, res) => {
  res.json(listAudioFiles(path.join(__dirname, 'samples')));
});

app.get('/api/impulses', (req, res) => {
  res.json(listAudioFiles(path.join(__dirname, 'impulses')));
});

// app.post('/api/osc', (req, res) => {
//   const { address, args = [] } = req.body;
//   if (!address) return res.status(400).json({ error: 'address required' });
//
//   try {
//     const client = new Client(OSC_TARGET_IP, OSC_TARGET_PORT);
//     const msg = new Message(address, ...args);
//     client.send(msg, (err) => {
//       client.close();
//       if (err) {
//         console.error('OSC send error:', err);
//         return res.status(500).json({ error: err.message });
//       }
//       console.log(`OSC → ${OSC_TARGET_IP}:${OSC_TARGET_PORT}  ${address}`, args);
//       res.json({ ok: true });
//     });
//   } catch (err) {
//     console.error('OSC error:', err);
//     res.status(500).json({ error: err.message });
//   }
// });

app.listen(HTTP_PORT, HOST, () => {
  console.log(`Convolution Player running at http://${HOST}:${HTTP_PORT}`);
  // console.log(`OSC messages → ${OSC_TARGET_IP}:${OSC_TARGET_PORT}`);
});
