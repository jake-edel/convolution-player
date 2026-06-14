const express = require('express');
const path = require('path');
const fs = require('fs');
const { watch } = require('fs');
const crypto = require('crypto');
const HOST = '0.0.0.0';
const HTTP_PORT = 3333;

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

app.listen(HTTP_PORT, HOST, () => {
  console.log(`Convolution Player running at http://${HOST}:${HTTP_PORT}`);
});
