import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// One-time asset preparation; normal builds only use the checked-in WAV files.
// node scripts/prepare-board-audio.mjs "path/to/the/original.mp3"
const input = process.argv[2];
if (!input) throw new Error('请提供原始 MP3 文件路径。');
const source = readFileSync(input);
const output = resolve(dirname(fileURLToPath(import.meta.url)), '../src/assets/audio/stone');
const clips = [
  { name: 'pick', start: 4.275, end: 4.435, peak: 0.32, fadeOut: 0.015 },
  { name: 'place', start: 5.685, end: 5.905, peak: 0.56, fadeOut: 0.025 },
  { name: 'capture', start: 14.465, end: 14.805, peak: 0.66, fadeOut: 0.035 },
];
const browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { channel: 'msedge' } : {}) });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({ encoded, clips }) => {
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer);
    const sampleRate = audio.sampleRate;
    const prepared = clips.map(clip => {
      const start = Math.round(clip.start * sampleRate), length = Math.round((clip.end - clip.start) * sampleRate);
      if (start + length > audio.length) throw new Error('原始录音长度不足。');
      const samples = new Float32Array(length);
      for (let c = 0; c < audio.numberOfChannels; c++) {
        const channel = audio.getChannelData(c);
        for (let i = 0; i < length; i++) samples[i] += channel[start + i] / audio.numberOfChannels;
      }
      const mean = samples.reduce((sum, value) => sum + value, 0) / length;
      let max = 0;
      for (let i = 0; i < length; i++) {
        samples[i] = (samples[i] - mean) * Math.min(1, i / (sampleRate * 0.002), (length - 1 - i) / (sampleRate * clip.fadeOut));
        max = Math.max(max, Math.abs(samples[i]));
      }
      if (max < 0.01) throw new Error('选中片段没有有效音频。');
      const pcm = new ArrayBuffer(length * 2), view = new DataView(pcm);
      for (let i = 0; i < length; i++) view.setInt16(i * 2, Math.round(samples[i] / max * clip.peak * 32767), true);
      const raw = new Uint8Array(pcm), chunks = [];
      for (let i = 0; i < raw.length; i += 8192) chunks.push(String.fromCharCode(...raw.subarray(i, i + 8192)));
      return { ...clip, duration: length / sampleRate, pcm: btoa(chunks.join('')) };
    });
    return { sampleRate, sourceDuration: audio.duration, clips: prepared };
  }, { encoded: source.toString('base64'), clips });
  mkdirSync(output, { recursive: true });
  for (const clip of result.clips) {
    const pcm = Buffer.from(clip.pcm, 'base64'), wav = Buffer.alloc(44 + pcm.length);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(result.sampleRate, 24); wav.writeUInt32LE(result.sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
    pcm.copy(wav, 44); writeFileSync(resolve(output, `${clip.name}.wav`), wav);
    delete clip.pcm;
    console.log(`${clip.name}: ${clip.duration.toFixed(3)}s, ${wav.length} bytes`);
  }
  writeFileSync(resolve(output, 'manifest.json'), JSON.stringify({
    source: basename(input), sourceSha256: createHash('sha256').update(source).digest('hex'),
    format: 'PCM WAV, mono, 16-bit', ...result,
  }, null, 2) + '\n');
} finally { await browser.close(); }
