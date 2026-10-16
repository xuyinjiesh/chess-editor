import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// Run against a production preview: npm run build && npm run preview.
const url = process.env.GALLERY_TEST_URL || 'http://127.0.0.1:4173/';
const relay = spawn(process.execPath, ['server/relay.mjs'], { env: { ...process.env, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const server = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Relay startup timed out')), 10000);
    relay.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/ws:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`ws://127.0.0.1:${match[1]}`); }
    });
    relay.once('error', error => { clearTimeout(timer); reject(error); });
    relay.once('exit', code => { clearTimeout(timer); reject(new Error(`Relay exited: ${code}`)); });
  });
  browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { channel: 'msedge' } : {}) });
  const host = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const guest = await browser.newPage();
  const errors = [];
  for (const page of [host, guest]) { page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message)); }
  await host.goto(url);
  const draft = () => host.evaluate(() => JSON.parse(localStorage.getItem('qijing-project-v1')));
  await expect.poll(draft).toBeTruthy();
  const original = await draft();
  await host.goto(url + '#/gallery/shock-chess/v1');
  await expect(host.getByRole('button', { name: '联机游玩', exact: true })).toBeEnabled();
  assert.ok(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  mkdirSync('artifacts', { recursive: true });
  await host.screenshot({ path: 'artifacts/gallery-online-mobile.png', fullPage: true });
  await host.getByRole('button', { name: '联机游玩', exact: true }).click();
  await expect(host.getByRole('button', { name: '用当前项目创建房间' })).toBeVisible();
  await expect(host.locator('.project-breadcrumb strong')).toHaveText('震棋 · 副本');
  await expect.poll(async () => (await draft()).name).toBe('震棋 · 副本');
  const selected = JSON.parse(readFileSync('public/gallery/shock-chess/v1/project.json', 'utf8'));
  assert.deepEqual((await draft()).rules, selected.rules);
  const library = await host.evaluate(() => JSON.parse(localStorage.getItem('qijing-library-v1')));
  assert.deepEqual(library.find(p => p.id === original.id), original);
  await host.getByRole('button', { name: '指定服务器', exact: true }).click();
  await host.getByLabel('WebSocket 服务器地址').fill(server);
  await host.getByRole('button', { name: '用当前项目创建房间' }).click();
  await expect(host.locator('.room-code strong')).toBeVisible();
  const code = await host.locator('.room-code strong').textContent();
  const invite = new URL(url); invite.searchParams.set('room', code); invite.searchParams.set('mode', 'server'); invite.searchParams.set('server', server);
  await guest.goto(invite.toString());
  await guest.getByRole('button', { name: '加入', exact: true }).click();
  await expect(guest.locator('.project-breadcrumb strong')).toHaveText('震棋 · 副本');
  await expect(host.locator('.players-list > div')).toHaveCount(2);
  for (const page of [host, guest]) await page.getByRole('button', { name: '关闭弹窗' }).click();
  const cell = (page, row, col) => page.locator(`[role="grid"] [data-row="${row}"][data-col="${col}"]`);
  const count = page => page.locator('.game-metrics > div:first-child strong');
  await guest.getByLabel('当前操作').waitFor();
  await cell(guest, 4, 4).click();
  for (const page of [host, guest]) await expect(count(page)).toHaveText('1');
  await cell(host, 4, 5).click();
  for (const page of [host, guest]) { await expect(count(page)).toHaveText('2'); await expect(cell(page, 4, 3)).toHaveAttribute('aria-label', 'd4 黑方棋石'); }
  await host.getByRole('button', { name: '作品广场', exact: true }).click();
  await host.getByRole('link', { name: '查看迷你永恒棋' }).click();
  await host.getByRole('button', { name: '联机游玩', exact: true }).click();
  await expect(host.locator('.toast')).toContainText('请先离开联机房间');
  assert.equal((await draft()).name, '震棋 · 副本');
  assert.deepEqual(errors, []);
  console.log('PASS gallery online entry, mobile layout, selected rules, saved draft, invite joining, two-way moves and active-room guard');
} finally {
  await browser?.close();
  relay.kill();
}
