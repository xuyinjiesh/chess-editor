import type { GameState } from './model';

export type BoardSound = 'pick' | 'place' | 'capture';
export const SOUND_KEY = 'qijing-sound-enabled';
const listeners = new Set<() => void>();
let enabled = readPreference(), context: AudioContext | undefined, output: GainNode | undefined;
let generation = 0;
const buffers = new Map<BoardSound, AudioBuffer>();
const recordings = new Map<BoardSound, AudioBuffer>();
const recordingUrls: Record<BoardSound, string> = {
  pick: new URL('./assets/audio/stone/pick.wav', import.meta.url).href,
  place: new URL('./assets/audio/stone/place.wav', import.meta.url).href,
  capture: new URL('./assets/audio/stone/capture.wav', import.meta.url).href,
};
let recordingLoad: Promise<void> | undefined;

function preloadRecordings() {
  if (!enabled || recordingLoad) return;
  try {
    // Decode ahead of the first move without opening a live audio device or
    // waiting for autoplay permission. Vite emits hashed, base-aware asset URLs.
    const Constructor = globalThis.OfflineAudioContext || (globalThis as typeof globalThis & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const decoder = Constructor ? new Constructor(1, 1, 44100) : context;
    if (!decoder) return;
    recordingLoad = Promise.all((Object.keys(recordingUrls) as BoardSound[]).map(async kind => {
      try {
        const response = await fetch(recordingUrls[kind]);
        if (!response.ok) return;
        const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
        recordings.set(kind, buffer);
      } catch { /* Retain the immediate synthesized fallback for this sound. */ }
    })).then(() => {});
  } catch { /* Audio preparation must never prevent the app from opening. */ }
}

function readPreference() {
  try { return localStorage.getItem(SOUND_KEY) !== 'false'; } catch { return true; }
}
export const soundEnabled = () => enabled;
export function subscribeSound(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setSoundEnabled(value: boolean, persist = true) {
  enabled = value; generation++;
  try { output?.gain.setValueAtTime(value ? 0.7 : 0, context!.currentTime); } catch { /* Audio is optional. */ }
  if (persist) { try { localStorage.setItem(SOUND_KEY, String(value)); } catch { /* Keep the session preference. */ } }
  listeners.forEach(listener => listener());
}

function audioContext() {
  if (!context || context.state === 'closed') {
    const Constructor = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return;
    context = new Constructor();
    output = context.createGain();
    output.gain.value = enabled ? 0.7 : 0;
    output.connect(context.destination);
    buffers.clear();
  }
  return context;
}

// Unlock on a real pointer/keyboard gesture, before asynchronous rules or AI run.
// Never let blocked autoplay, a missing device, or storage failure interrupt play.
export function activateBoardAudio() {
  if (!enabled) return;
  try {
    const audio = audioContext();
    preloadRecordings();
    if (audio && audio.state !== 'running') void audio.resume().catch(() => {});
  } catch { /* Continue silently on unsupported browsers/devices. */ }
}
export function listenForBoardAudio() {
  preloadRecordings();
  const activate = (event: Event) => { if (event.isTrusted) activateBoardAudio(); };
  const storage = (event: StorageEvent) => {
    if (event.key === SOUND_KEY || event.key === null) setSoundEnabled(readPreference(), false);
  };
  window.addEventListener('pointerdown', activate, true);
  window.addEventListener('keydown', activate, true);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener('pointerdown', activate, true);
    window.removeEventListener('keydown', activate, true);
    window.removeEventListener('storage', storage);
  };
}

function soundBuffer(audio: AudioContext, kind: BoardSound) {
  const cached = buffers.get(kind);
  if (cached) return cached;
  const duration = kind === 'pick' ? 0.045 : kind === 'place' ? 0.11 : 0.18;
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 47;
  // A brief noisy contact and damped wooden resonances, rather than a sustained tone.
  const impact = (time: number, frequency: number, strength: number, decay: number) => {
    if (time < 0) return 0;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 0x100000000 * 2 - 1) * Math.exp(-time * 210);
    const body = Math.sin(time * frequency * Math.PI * 2) * Math.exp(-time * decay);
    const overtone = Math.sin(time * frequency * 2.73 * Math.PI * 2) * Math.exp(-time * decay * 1.8);
    return strength * Math.min(1, time / 0.001) * (noise * 0.5 + body * 0.35 + overtone * 0.15);
  };
  for (let i = 0; i < samples.length; i++) {
    const t = i / audio.sampleRate;
    const value = kind === 'pick' ? impact(t, 1050, 0.28, 115)
      : kind === 'place' ? impact(t, 620, 0.65, 65)
        : impact(t, 430, 0.65, 62) + impact(t - 0.045, 780, 0.4, 80);
    samples[i] = value * Math.min(1, (duration - t) / 0.008);
  }
  buffers.set(kind, buffer);
  return buffer;
}

export function playBoardSound(kind: BoardSound) {
  if (!enabled || typeof document === 'undefined' || document.hidden) return;
  try {
    const audio = audioContext();
    if (!audio) return;
    const requested = performance.now(), version = generation;
    const play = () => {
      // Drop stale requests instead of replaying them when autoplay is unlocked later.
      if (!enabled || version !== generation || document.hidden || audio.state !== 'running' || performance.now() - requested > 250) return;
      try {
        const source = audio.createBufferSource();
        // Loading never delays a move or queues a sound to play after a fetch.
        source.buffer = recordings.get(kind) || soundBuffer(audio, kind);
        source.connect(output!);
        source.onended = () => source.disconnect();
        source.start();
      } catch { /* A sound failure must not reject an otherwise valid move. */ }
    };
    if (audio.state === 'running') play();
    else void audio.resume().then(play).catch(() => {});
  } catch { /* Audio is optional. */ }
}

export function moveSound(before: GameState, after: GameState): Exclude<BoardSound, 'pick'> | null {
  // Compare board contents, not IDs: custom rules may regenerate piece IDs.
  const positions = new Map(after.pieces.map(p => [`${p.row},${p.col}`, p]));
  if (before.pieces.length === after.pieces.length && before.pieces.every(p => {
    const next = positions.get(`${p.row},${p.col}`);
    return next?.type === p.type && next.side === p.side;
  })) return null; // Passing, choosing a skill, or changing metadata is silent.
  const opponents = (state: GameState) => state.pieces.filter(p => p.side !== before.turn).length;
  return opponents(after) < opponents(before) ? 'capture' : 'place';
}
export function playMoveSound(before: GameState, after: GameState) {
  const kind = moveSound(before, after);
  if (kind) playBoardSound(kind);
}
