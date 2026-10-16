import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

// Run against a production preview: npm run build && npm run preview.
const url = process.env.GALLERY_TEST_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { channel: 'msedge' } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const count = page.locator('.gallery-step-count strong');
const full = () => page.getByRole('button', { name: '全屏试玩', exact: true });
const exit = () => page.getByRole('button', { name: '退出全屏', exact: true });
const cell = (row, col) => page.locator(`[role="grid"] [data-row="${row}"][data-col="${col}"]`);
async function open(id) {
  await page.goto(url + `#/gallery/${id}/v1`);
  await page.getByRole('button', { name: '开始试玩', exact: true }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(page.getByRole('grid')).not.toHaveAttribute('aria-busy', 'true');
}
async function fits() {
  await expect.poll(() => page.evaluate(() => {
    const player = document.querySelector('.gallery-fullscreen'), board = player?.querySelector('[role="grid"]');
    if (!player || !board) return false;
    const rect = player.getBoundingClientRect(), b = board.getBoundingClientRect();
    return Math.abs(rect.width - innerWidth) < 2 && Math.abs(rect.height - innerHeight) < 2 && b.width > 150 && b.left >= 0 && b.right <= innerWidth + 1 && player.scrollWidth <= innerWidth;
  })).toBe(true);
  await expect(exit()).toBeInViewport();
}
try {
  mkdirSync('artifacts', { recursive: true });
  await page.goto(url);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('qijing-project-v1'))).toBeTruthy();
  const draft = await page.evaluate(() => localStorage.getItem('qijing-project-v1'));
  await open('shock-chess');
  await cell(4, 4).click(); await expect(count).toHaveText('1');
  const normal = await page.getByRole('grid').boundingBox();
  await full().click(); await expect(exit()).toHaveAttribute('aria-pressed', 'true'); await fits();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expect.poll(async () => (await page.getByRole('grid').boundingBox()).width).toBeGreaterThan(normal.width + 100);
  await expect.poll(() => page.evaluate(() => {
    const area = document.querySelector('.gallery-play-board').getBoundingClientRect();
    return document.querySelector('[role="grid"]').getBoundingClientRect().height / area.height;
  })).toBeGreaterThan(0.8);
  await cell(4, 5).click(); await expect(count).toHaveText('2');
  await page.screenshot({ path: 'artifacts/gallery-fullscreen-desktop.png', fullPage: true });
  await exit().click(); await expect(full()).toHaveAttribute('aria-pressed', 'false');
  await expect(count).toHaveText('2'); await expect(cell(4, 3)).toHaveAttribute('aria-label', 'd4 黑方棋石');
  await expect.poll(() => page.evaluate(() => !document.fullscreenElement)).toBe(true);
  await full().click(); await expect(exit()).toBeVisible();
  await page.evaluate(() => document.exitFullscreen()); await expect(full()).toBeVisible(); await expect(count).toHaveText('2');
  console.log('PASS native fullscreen, larger board, continued moves and state retained after button/browser exit');

  // Exercise the window-filling fallback used by mobile/embedded browsers.
  await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false }));
  await page.setViewportSize({ width: 390, height: 844 });
  await full().click(); await fits(); await expect(count).toHaveText('2');
  await page.getByRole('button', { name: '悔棋', exact: true }).click(); await expect(count).toHaveText('1');
  await page.screenshot({ path: 'artifacts/gallery-fullscreen-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 844, height: 390 }); await fits();
  await expect(page.getByRole('button', { name: '悔棋', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'artifacts/gallery-fullscreen-landscape.png', fullPage: true });
  await page.keyboard.press('Escape'); await expect(full()).toBeVisible(); await expect(count).toHaveText('1');
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  console.log('PASS fullscreen fallback, mobile rotation, undo, Escape and restored scrolling');

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const id of ['onitama', 'incident-chess', 'wrestle-chess', 'football', 'hex', 'mini-eternal', 'intransitive']) {
    await open(id); await full().click(); await fits();
    if (id === 'onitama') {
      await expect(page.locator('.game-table')).toBeVisible();
      await page.getByRole('button', { name: '抽取招式 · 开始对局' }).click();
      await expect(page.locator('.game-table .rule-card-grid')).toHaveCount(5);
      await fits();
      await page.screenshot({ path: 'artifacts/gallery-fullscreen-cards.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 }); await fits();
      await page.screenshot({ path: 'artifacts/gallery-fullscreen-mobile-cards.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.getByRole('button', { name: '返回作品介绍', exact: true }).click();
    await expect(page.getByRole('button', { name: '开始试玩', exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => !document.fullscreenElement)).toBe(true);
  }
  await open('shock-chess'); await full().click();
  await page.getByRole('button', { name: '开始人机对弈', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeInViewport();
  await page.getByLabel('电脑难度').selectOption('easy');
  await page.getByRole('button', { name: '开始新的人机对局' }).click();
  await expect(page.locator('.bot-status')).toBeVisible(); await fits();
  await cell(4, 4).click(); await expect(count).toHaveText('2');
  await exit().click(); await expect(count).toHaveText('2');
  assert.equal(await page.evaluate(() => localStorage.getItem('qijing-project-v1')), draft);
  assert.deepEqual(errors, []);
  console.log('PASS all gallery board shapes/zones, cleanup on return, AI dialog/reply and editor draft retained');
} finally { await browser.close(); }
