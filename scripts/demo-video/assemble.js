// [2026-10-07] Criado: monta o MP4 final (frames + narração + trilha + capítulos + clipes por setor) — Rafael Brito
// Uso: node assemble.js <workDir> <outDir> [musicFile]
//  - Frames do screencast têm timestamps irregulares -> concat demuxer com durations, resample p/ 30fps CFR.
//  - Narração posicionada por adelay = (início real do beat - t0): sync garantido mesmo se uma ação demorou mais que o áudio.
//  - Trilha em volume baixo (0.09) com fade-out; capítulos MP4 (ffmetadata) = setores.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const work = path.resolve(process.argv[2]), out = path.resolve(process.argv[3] || 'out'); fs.mkdirSync(out, { recursive: true });
const music = process.argv[4];
const QUICK = process.argv.includes('--quick'); // [2026-10-07] Criado: sem narração, crf maior, sem clipes por setor
const tl = JSON.parse(fs.readFileSync(path.join(work, 'timeline.json'), 'utf8'));
const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const total = tl.end - tl.t0;

// 1) vídeo
const lines = [];
tl.frames.forEach((f, i) => {
  const next = i + 1 < tl.frames.length ? tl.frames[i + 1].t : tl.end;
  lines.push(`file '${path.join(work, 'frames', f.name).replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
});
lines.push(`file '${path.join(work, 'frames', tl.frames[tl.frames.length - 1].name).replace(/\\/g, '/')}'`); // concat exige repetir o último
const listPath = path.join(work, 'frames.txt'); fs.writeFileSync(listPath, lines.join('\n'));
const videoOnly = path.join(work, 'video_only.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', listPath, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', QUICK ? 'slow' : 'medium', '-crf', QUICK ? '26' : '17', '-movflags', '+faststart', videoOnly]);

// 2) áudio (narração + trilha)
const inputs = []; const filt = []; const labels = [];
tl.beats.forEach((b, i) => {
  inputs.push('-i', path.join(work, 'audio', b.id + '.wav'));
  const ms = Math.max(0, Math.round((b.start - tl.t0) * 1000));
  filt.push(`[${i}:a]aresample=44100,adelay=${ms}|${ms},volume=1.6[v${i}]`); labels.push(`[v${i}]`);
});
let mixFilter = labels.length ? filt.join(';') + `;${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[voice]` : '';
let map = '[voice]';
if (music) {
  const mi = tl.beats.length; inputs.push('-stream_loop', '-1', '-i', path.resolve(music));
  const vol = QUICK ? 0.35 : 0.09;
  mixFilter += labels.length ? `;[${mi}:a]aresample=44100,volume=${vol},afade=t=in:d=2,afade=t=out:st=${(total - 4).toFixed(2)}:d=4[mus];[voice][mus]amix=inputs=2:normalize=0:duration=first[aout]` : `[${mi}:a]aresample=44100,volume=${vol},afade=t=in:d=2,afade=t=out:st=${(total - 3).toFixed(2)}:d=3[aout]`;
  map = '[aout]';
}
const audioPath = path.join(work, 'mix.m4a');
ff([...inputs, '-filter_complex', mixFilter, '-map', map, '-t', total.toFixed(2), '-c:a', 'aac', '-b:a', QUICK ? '128k' : '192k', audioPath]);

// 3) capítulos
const secs = tl.sectors.filter(s => s.start - tl.t0 >= -0.01);
let meta = ';FFMETADATA1\ntitle=Ancoro - Demonstração\n';
secs.forEach((s, i) => {
  const a = Math.max(0, Math.round((s.start - tl.t0) * 1000)); const e = Math.round(((i + 1 < secs.length ? secs[i + 1].start : tl.end) - tl.t0) * 1000);
  meta += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${a}\nEND=${e}\ntitle=${s.n ? 'Setor ' + s.n + ' - ' : ''}${s.title}\n`;
});
const metaPath = path.join(work, 'chapters.txt'); fs.writeFileSync(metaPath, meta, 'utf8');
// [2026-10-19] Alterado: nome do arquivo configurável (--name=) p/ não sobrescrever o demo anterior
const NAME = (process.argv.find(x => x.startsWith('--name=')) || '--name=Ancoro_Demo').split('=')[1];
const final = path.join(out, NAME + '.mp4');
ff(['-i', videoOnly, '-i', audioPath, '-i', metaPath, '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', final]);

// 4) clipes por setor
if (QUICK) { console.log('OK', final, total.toFixed(1) + 's'); process.exit(0); }
fs.mkdirSync(path.join(out, 'setores'), { recursive: true });
const idx = [];
secs.forEach((s, i) => {
  const a = Math.max(0, s.start - tl.t0), e = (i + 1 < secs.length ? secs[i + 1].start : tl.end) - tl.t0;
  const name = `${String(i).padStart(2, '0')}_${s.id}.mp4`;
  ff(['-ss', a.toFixed(2), '-to', e.toFixed(2), '-i', final, '-c:v', 'libx264', '-crf', '20', '-preset', 'fast', '-c:a', 'aac', path.join(out, 'setores', name)]);
  const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  idx.push(`- ${fmt(a)}  ${s.n ? 'Setor ' + s.n + ' — ' : ''}${s.title}  (setores/${name})`);
});
fs.writeFileSync(path.join(out, 'capitulos.md'), '# Ancoro_Demo.mp4 — capítulos\n\n' + idx.join('\n') + '\n', 'utf8');
console.log('OK', final, total.toFixed(1) + 's');
