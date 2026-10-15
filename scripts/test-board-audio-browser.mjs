import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const url = process.env.AUDIO_TEST_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { channel: 'msedge' } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// Observe real Web Audio buffers/sources; keep the browser's autoplay policy intact.
const observeAudio = () => {
  window.audioEvents = [];
  window.audioContexts = 0;
  window.decodedRecordings = 0;
  const recordings = new WeakSet();
  const decode = OfflineAudioContext.prototype.decodeAudioData;
  OfflineAudioContext.prototype.decodeAudioData = function (...args) {
    return decode.apply(this, args).then(buffer => {
      recordings.add(buffer); window.decodedRecordings++; return buffer;
    });
  };
  const NativeAudioContext = window.AudioContext;
  window.AudioContext = class extends NativeAudioContext {
    constructor(...args) { super(...args); window.audioContexts++; }
    createBufferSource() {
      const source = super.createBufferSource(), start = source.start.bind(source);
      source.start = (...args) => {
        const samples = source.buffer.getChannelData(0);
        window.audioEvents.push({ duration: Number(source.buffer.duration.toFixed(3)), peak: Math.max(...samples.map(Math.abs)), state: this.state, recorded: recordings.has(source.buffer) });
        return start(...args);
      };
      return source;
    }
  };
};
await page.addInitScript(observeAudio);
const cell = (row, col) => page.locator(`[role="grid"] [data-row="${row}"][data-col="${col}"]`);
const button = name => page.getByRole('button', { name, exact: true });
const events = () => page.evaluate(() => window.audioEvents.map(e => e.duration));
const clear = () => page.evaluate(() => { window.audioEvents = []; });
const loaded = () => expect.poll(() => page.evaluate(() => window.decodedRecordings)).toBe(3);
async function sounds(expected) { await expect.poll(events).toEqual(expected); }
async function silent() { await page.waitForTimeout(300); assert.deepEqual(await events(), []); }
async function drag(from, to) {
  await cell(...from).scrollIntoViewIfNeeded();
  await page.waitForTimeout(350); // Board-fit/toolbar layout settles after switching modes.
  const a = await cell(...from).boundingBox(), b = await cell(...to).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
}
try {
  await page.goto(url); await expect(button('棋子音效')).toHaveAttribute('aria-pressed', 'true');
  await loaded();
  assert.equal(await page.evaluate(() => window.audioContexts), 0);
  await button('开始试玩').click(); await silent();
  await cell(6, 4).click(); await sounds([0.16]); await clear();
  await cell(3, 4).click(); await silent();
  await cell(4, 4).click(); await sounds([0.22]); await clear();
  await cell(1, 3).click(); await cell(3, 3).click(); await sounds([0.16, 0.22]); await clear();
  await cell(4, 4).click(); await cell(3, 3).click(); await sounds([0.16, 0.34]);
  const captured = await page.evaluate(() => window.audioEvents);
  assert(captured.every(e => e.peak > 0.01 && e.peak < 1 && e.state === 'running' && e.recorded));
  assert.equal(await page.evaluate(() => window.audioContexts), 1);
  await clear(); await button('撤销').click(); await button('重做').click(); await button('重新开始').click(); await silent();
  await drag([6, 0], [4, 0]); await sounds([0.16, 0.22]); await page.waitForTimeout(300); await sounds([0.16, 0.22]);
  await clear(); await button('棋子音效').click(); await cell(1, 0).click(); await cell(3, 0).click(); await silent();
  await page.reload(); await expect(button('棋子音效')).toHaveAttribute('aria-pressed', 'false');
  await button('棋子音效').focus(); await page.keyboard.press('Enter');
  await loaded();
  await button('开始试玩').click(); await cell(6, 1).focus(); await page.keyboard.press('Enter');
  await cell(4, 1).focus(); await page.keyboard.press('Enter'); await sounds([0.16, 0.22]);
  console.log('PASS lazy activation, click, invalid move, capture, drag, undo/reset, mute persistence and keyboard');

  await clear(); await button('人机对弈').click(); await page.getByLabel('电脑难度').selectOption('easy');
  await button('开始新的人机对局').click(); await cell(6, 4).click(); await cell(4, 4).click();
  await expect(page.locator('.game-metrics > div:first-child strong')).toHaveText('2');
  await sounds([0.16, 0.22, 0.22]);
  await button('返回编辑').click(); await clear();
  await drag([6, 2], [4, 2]); await sounds([0.16, 0.22]);
  await page.waitForTimeout(300); // Let the board's synthetic click suppression expire.
  await clear(); await button('放置棋子工具').click(); await cell(3, 2).click(); await sounds([0.22]);
  await clear(); await button('撤销').click(); await silent();
  console.log('PASS computer reply and editor placement');

  await page.goto(url + '#/gallery/wrestle-chess/v1'); await button('开始试玩').click();
  await loaded();
  await expect(page.getByLabel('棋盘与手牌区')).toBeVisible(); await clear();
  await button('选择棋子：红方车').click(); await cell(1, 1).click(); await silent();
  await cell(0, 0).click(); await sounds([0.22]); await clear();
  await expect(button('选择棋子：蓝方车')).toBeEnabled(); await cell(2, 2).click(); await sounds([0.22]);
  await expect(button('移动棋子')).toBeEnabled(); await button('移动棋子').click(); await clear();
  await drag([0, 0], [1, 0]); await sounds([0.16, 0.22]);
  await clear(); await button('悔棋').click(); await button('重做').click(); await button('重新开始').click(); await silent();
  await button('棋子音效').click(); await cell(0, 0).click(); await silent();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(button('棋子音效')).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/board-audio-gallery-mobile.png', fullPage: true });
  await page.goto(url); await expect(button('棋子音效')).toHaveAttribute('aria-pressed', 'false');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'artifacts/board-audio-editor-mobile.png', fullPage: true });
  await button('开始试玩').click(); await button('放大试玩棋盘').click();
  await expect(button('棋子音效')).toBeVisible();
  console.log('PASS async custom moves, gallery/editor preference sharing and mobile/focus controls');

  // Delayed assets must neither delay chess nor replay old moves once decoded.
  const delayed = await browser.newPage();
  delayed.on('pageerror', error => errors.push(error.message));
  await delayed.addInitScript(observeAudio);
  const requests = [];
  await delayed.route('**/*.wav', route => { requests.push(route); });
  await delayed.goto(url);
  await expect.poll(() => requests.length).toBe(3);
  await delayed.getByRole('button', { name: '开始试玩', exact: true }).click();
  await delayed.locator('[role="grid"] [data-row="6"][data-col="4"]').click();
  await delayed.locator('[role="grid"] [data-row="4"][data-col="4"]').click();
  await expect(delayed.locator('.game-metrics > div:first-child strong')).toHaveText('1');
  assert.deepEqual(await delayed.evaluate(() => window.audioEvents.map(e => e.duration)), [0.045, 0.11]);
  await delayed.getByRole('button', { name: '棋子音效', exact: true }).click();
  await Promise.all(requests.map(route => route.continue()));
  await expect.poll(() => delayed.evaluate(() => window.decodedRecordings)).toBe(3);
  await delayed.waitForTimeout(300);
  assert.equal(await delayed.evaluate(() => window.audioEvents.length), 2);
  await delayed.close();

  const failed = await browser.newPage();
  failed.on('pageerror', error => errors.push(error.message));
  await failed.addInitScript(observeAudio);
  await failed.route('**/*.wav', route => route.fulfill({ status: 503, body: '' }));
  await failed.goto(url); await failed.getByRole('button', { name: '开始试玩', exact: true }).click();
  await failed.locator('[role="grid"] [data-row="6"][data-col="4"]').click();
  await failed.locator('[role="grid"] [data-row="4"][data-col="4"]').click();
  await expect(failed.locator('.game-metrics > div:first-child strong')).toHaveText('1');
  assert.deepEqual(await failed.evaluate(() => window.audioEvents.map(e => e.duration)), [0.045, 0.11]);
  await failed.close();
  console.log('PASS delayed/failed recordings fall back immediately, with no stale playback after loading');

  const unsupported = await browser.newPage();
  unsupported.on('pageerror', error => errors.push(error.message));
  await unsupported.addInitScript(() => {
    window.AudioContext = undefined; window.webkitAudioContext = undefined;
    Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
  });
  await unsupported.goto(url); await unsupported.getByRole('button', { name: '棋子音效', exact: true }).click();
  await unsupported.getByRole('button', { name: '棋子音效', exact: true }).click();
  await unsupported.getByRole('button', { name: '开始试玩', exact: true }).click();
  await unsupported.locator('[role="grid"] [data-row="6"][data-col="4"]').click();
  await unsupported.locator('[role="grid"] [data-row="4"][data-col="4"]').click();
  await expect(unsupported.locator('.game-metrics > div:first-child strong')).toHaveText('1');
  await unsupported.close(); assert.deepEqual(errors, []);
  console.log('PASS unavailable audio/storage leaves chess playable; no browser exceptions');
} catch (error) {
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/board-audio-failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
