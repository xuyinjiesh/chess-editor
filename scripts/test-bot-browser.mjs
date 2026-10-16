import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

// Run against a production preview: npm run build && npm run preview.
const url = process.env.BOT_TEST_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { channel: 'msedge' } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const count = page.locator('.game-metrics > div:first-child strong');
const cell = (row, col) => page.locator(`[role="grid"] [data-row="${row}"][data-col="${col}"]`);
async function setup({ side = 'white', mode = 'human', difficulty = 'easy' } = {}) {
  await page.getByRole('button', { name: '人机对弈', exact: true }).click();
  await page.getByLabel('对弈方式').selectOption(mode);
  if (mode === 'human') await page.getByLabel('我执哪方').selectOption(side);
  await page.getByLabel('电脑难度').selectOption(difficulty);
  await page.getByRole('button', { name: '开始新的人机对局' }).click();
}
async function edit() { const button = page.getByRole('button', { name: '返回编辑', exact: true }); if (await button.isVisible()) await button.click(); }
async function template(name) { await edit(); await page.locator('.template-item').filter({ hasText: name }).click(); }
async function noBotError() { await expect(page.locator('.bot-status [role="alert"]')).toHaveCount(0); }
try {
  await page.goto(url);
  await setup();
  await cell(6, 4).click(); await cell(4, 4).click();
  await expect(count).toHaveText('2', { timeout: 10000 }); await noBotError();
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/ai-engine-desktop.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(count).toHaveText('0'); await page.waitForTimeout(700); await expect(count).toHaveText('0');
  await page.getByRole('button', { name: '重做', exact: true }).click(); await expect(count).toHaveText('2');
  await page.getByRole('button', { name: '重新开始', exact: true }).click(); await expect(count).toHaveText('0');
  console.log('PASS chess reply, round undo/redo, restart');

  await setup({ side: 'black' }); await expect(count).toHaveText('1', { timeout: 10000 }); await noBotError();
  await setup({ side: 'black', difficulty: 'hard' });
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: '暂停电脑' }).click();
  const pausedCount = await count.textContent(); await page.waitForTimeout(2800); await expect(count).toHaveText(pausedCount);
  await page.getByRole('button', { name: '返回编辑', exact: true }).click();
  await page.waitForTimeout(500); await page.getByRole('button', { name: '开始试玩', exact: true }).click(); await expect(count).toHaveText('0');
  console.log('PASS computer first, pause and stale result cancellation');

  for (const [name, side, move] of [['五子棋', 'black', [7, 7]], ['黑白棋', 'black', [2, 3]], ['井字棋', 'white', [1, 1]]]) {
    await template(name); await setup({ side }); await cell(...move).click();
    await expect(count).toHaveText('2', { timeout: 10000 }); await noBotError();
  }
  await template('中国象棋'); await setup({ side: 'black' }); await expect(count).toHaveText('1', { timeout: 10000 }); await noBotError();
  console.log('PASS gomoku, reversi, tic tac toe and xiangqi');

  await edit(); await page.getByRole('button', { name: /新建棋类项目/ }).click();
  await setup({ side: 'black' }); await expect(count).toHaveText('1', { timeout: 10000 }); await noBotError();
  assert.equal(await page.locator('iframe').count(), 0, 'custom search sandbox must be removed');
  console.log('PASS bundled custom adapter and onMove sandbox');

  // Exercise user-edited code through the actual UI, including the parent-owned
  // watchdog (a worker caught in an infinite loop cannot enforce its own timer).
  await edit();
  await page.getByRole('button', { name: '规则', exact: true }).click();
  await page.getByRole('button', { name: '打开规则代码编辑器' }).click();
  const editor = page.getByRole('textbox', { name: 'JavaScript 规则代码' });
  const originalCode = await editor.inputValue();
  await editor.fill(originalCode.split('// 人机对弈：')[0]);
  await page.getByRole('button', { name: '测试电脑走子' }).click();
  await expect(page.locator('.code-dialog-body .success-box')).toContainText('电脑找到走法', { timeout: 10000 });
  await editor.fill(originalCode + '\nfunction getLegalMoves(){while(true){}}');
  await page.getByRole('button', { name: '测试电脑走子' }).click();
  await expect(page.locator('.code-dialog-body .error-box')).toContainText('已停止', { timeout: 10000 });
  await editor.fill(originalCode + '\nasync function evaluate(){let blocked=false;try{await fetch("https://example.com/")}catch{blocked=true}if(typeof document!=="undefined"||typeof localStorage!=="undefined"||!blocked)throw Error("isolation failed");return 0;}');
  await page.getByRole('button', { name: '测试电脑走子' }).click();
  await expect(page.locator('.code-dialog-body .success-box')).toContainText('电脑找到走法', { timeout: 10000 });
  await editor.fill(originalCode + '\nfunction getLegalMoves(){return [{to:{row:99,col:0}}]}');
  await page.getByRole('button', { name: '应用规则', exact: true }).click();
  await setup({ side: 'black' });
  await expect(page.locator('.bot-status [role="alert"]')).toContainText('无效走法');
  await expect(page.locator('.bot-status')).toContainText('电脑已暂停');
  await page.getByRole('button', { name: '改为双人操作', exact: true }).click();
  // Invalid legal moves also invalidate the shared rule view. Repair the hook
  // before resuming; changing opponents must not bypass that existing gate.
  await expect(page.locator('.custom-rule-panel [role="alert"]')).toContainText('无效走法');
  await cell(7, 3).click(); await cell(6, 3).click(); await expect(count).toHaveText('0');
  await edit(); await page.getByRole('button', { name: '规则', exact: true }).click();
  await page.getByRole('button', { name: '打开规则代码编辑器' }).click();
  await editor.fill(originalCode); await page.getByRole('button', { name: '应用规则', exact: true }).click();
  await page.getByRole('button', { name: '开始试玩', exact: true }).click();
  await expect(page.locator('[role="grid"]')).not.toHaveAttribute('aria-busy','true');
  await cell(7, 3).click(); await cell(6, 3).click(); await expect(count).toHaveText('1');
  await expect(page.locator('iframe')).toHaveCount(0);
  console.log('PASS legacy rules, infinite loop timeout, isolation, invalid adapter and manual recovery');

  await template('井字棋'); await setup({ mode: 'watch', difficulty: 'hard' });
  await expect(page.locator('.result-banner')).toContainText('和棋', { timeout: 30000 });
  console.log('PASS computer self-play reaches a tic tac toe draw');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '人机对弈', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始新的人机对局' })).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile view must not overflow');
  await page.screenshot({ path: 'artifacts/ai-engine-mobile.png', fullPage: true, animations: 'disabled' });
  assert.deepEqual(errors, []);
  console.log('PASS mobile settings and no browser exceptions');
} finally { await browser.close(); }
