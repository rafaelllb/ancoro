// [2026-10-07] Criado: gera WAV por beat via SAPI (Microsoft Maria pt-BR) + durações — Rafael Brito
// Uso: node tts.js <outDir>   (Windows; sem dependências externas além de ffprobe)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const out = path.resolve(process.argv[2] || 'audio'); fs.mkdirSync(out, { recursive: true });
const items = require('./beats-text.js').flatMap(s => s.beats.map(b => ({ id: b.id, text: b.tts || b.say })));
const jsonPath = path.join(out, 'beats.json'); fs.writeFileSync(jsonPath, JSON.stringify(items), 'utf8');
const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Maria Desktop'); $s.Rate = 0
$items = Get-Content -Raw -Encoding UTF8 '${jsonPath}' | ConvertFrom-Json
foreach ($i in $items) { $s.SetOutputToWaveFile((Join-Path '${out}' ($i.id + '.wav'))); $s.Speak($i.text); $s.SetOutputToNull() }
`;
execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
const dur = {};
for (const i of items) dur[i.id] = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(out, i.id + '.wav')]).toString());
fs.writeFileSync(path.join(out, 'durations.json'), JSON.stringify(dur, null, 1));
console.log('total narração: ' + Object.values(dur).reduce((a, b) => a + b, 0).toFixed(1) + 's');
