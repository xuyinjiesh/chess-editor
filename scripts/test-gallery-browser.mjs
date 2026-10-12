import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const url = process.env.GALLERY_TEST_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{channel:'msedge'}:{})});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(10000);
const errors=[]; page.on('pageerror',error=>errors.push(error.message));
const draft=()=>page.evaluate(()=>localStorage.getItem('qijing-project-v1'));
const count=page.locator('.gallery-step-count strong');
const cell=(row,col)=>page.locator(`[role="grid"] [data-row="${row}"][data-col="${col}"]`);
const panel=page.getByLabel('当前操作');
const catalog=JSON.parse(readFileSync('public/gallery/index.json','utf8'));
const shock=JSON.parse(readFileSync('public/gallery/shock-chess/v1/project.json','utf8'));
async function fits(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');}
async function screenshot(name){await page.screenshot({path:`artifacts/gallery-${name}.png`,fullPage:true,animations:'disabled'});}
async function open(id){await page.goto(url+`#/gallery/${id}/v1`);await page.reload();await expect(page.getByRole('button',{name:'开始试玩',exact:true})).toBeEnabled();}
try {
  mkdirSync('artifacts',{recursive:true}); await page.goto(url); await expect.poll(draft).toBeTruthy(); const original=await draft();
  await page.getByRole('button',{name:'作品广场',exact:true}).click(); await expect(page.locator('.gallery-card')).toHaveCount(2);
  await fits(); await screenshot('desktop');
  await page.getByLabel('搜索作品').fill('不存在的作品'); await expect(page.getByText('没有找到匹配的作品')).toBeVisible();
  await page.getByRole('button',{name:'清除筛选'}).click(); await page.getByLabel('筛选作品分类').selectOption('布阵'); await expect(page.locator('.gallery-card')).toHaveCount(1);
  await page.getByLabel('筛选作品分类').selectOption(''); await page.getByRole('link',{name:'查看迷你永恒棋'}).click();
  await expect(page.getByRole('button',{name:'开始试玩',exact:true})).toBeEnabled(); assert.equal(new URL(page.url()).hash,'#/gallery/mini-eternal/v1');
  await page.reload(); await expect(page.getByRole('heading',{name:'迷你永恒棋',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'迷你永恒棋 · 原规则'})).toHaveAttribute('href',catalog.entries.find(e=>e.id==='mini-eternal').sources[0].url);
  await expect(page.getByLabel('来源与权利说明')).toContainText('公开授权状态尚未核实');
  await page.getByRole('button',{name:'分享作品'}).click(); await expect(page.getByLabel('作品分享链接')).toHaveValue(url+'#/gallery/mini-eternal/v1');
  await screenshot('detail'); assert.equal(await draft(),original); assert.equal(page.workers().length,0); await expect(page.locator('iframe')).toHaveCount(0);
  console.log('PASS two-game catalog, filters, deep links, attribution and nonexecuting preview');

  await page.getByRole('button',{name:'开始试玩',exact:true}).click(); await expect(panel).toContainText('红方布阵');
  await expect(page.locator('.piece-sprite')).toHaveCount(18); await expect(page.locator('.piece-sprite .neutral')).toHaveCount(6);
  await cell(6,1).click(); await cell(5,0).click(); await expect(count).toHaveText('1');
  await page.getByRole('button',{name:'悔棋',exact:true}).click(); await expect(count).toHaveText('0');
  await page.getByRole('button',{name:'重做',exact:true}).click(); await expect(count).toHaveText('1');
  await page.getByRole('button',{name:'悔棋',exact:true}).click(); await expect(count).toHaveText('0');
  await page.getByRole('button',{name:'确认布阵',exact:true}).click(); await expect(panel).toContainText('蓝方布阵');
  await page.getByRole('button',{name:'确认布阵',exact:true}).click(); await expect(panel).toContainText('进入对方禁区获胜'); await expect(count).toHaveText('2');
  await cell(6,1).click(); await expect(cell(6,4).locator('.move-hint')).toBeVisible(); await cell(6,4).click();
  await expect(count).toHaveText('3'); await expect(panel).toContainText('把被吃的红方棋子放回');
  await cell(3,2).click(); await expect(page.getByRole('alert')).toContainText('所属半场'); await expect(count).toHaveText('3');
  await cell(6,3).click(); await expect(count).toHaveText('4'); await expect(page.locator('.gallery-turn')).toHaveText('蓝方回合');
  await expect(page.locator('.piece-sprite')).toHaveCount(18); await expect(cell(6,3)).toHaveAttribute('aria-label','d1 红方車');
  await page.getByRole('button',{name:'悔棋',exact:true}).click(); await expect(panel).toContainText('把被吃的红方棋子放回');
  await page.getByRole('button',{name:'重做',exact:true}).click(); await expect(count).toHaveText('4');
  await screenshot('mini-restore'); assert.equal(await draft(),original);
  await page.getByRole('button',{name:'重新开始',exact:true}).click(); await expect(count).toHaveText('0'); await expect(panel).toContainText('红方布阵');
  await page.getByRole('button',{name:'返回作品介绍'}).click();
  await page.getByRole('button',{name:'与电脑对弈'}).click(); await page.getByLabel('电脑难度').selectOption('easy'); await page.getByRole('button',{name:'开始新的人机对局'}).click();
  await expect(panel).toContainText('红方布阵'); await page.getByRole('button',{name:'确认布阵',exact:true}).click();
  await expect(count).toHaveText('2'); await expect(panel).toContainText('进入对方禁区获胜');
  await cell(5,0).click(); await cell(3,1).click(); await expect.poll(async()=>Number(await count.textContent())).toBeGreaterThan(3);
  await expect(page.locator('.gallery-turn')).toHaveText('红方回合');
  await expect(page.locator('.bot-status [role="alert"]')).toHaveCount(0);
  await page.getByRole('button',{name:'悔棋',exact:true}).click(); await expect(count).toHaveText('2');
  await screenshot('mini-ai'); await page.getByRole('button',{name:'返回作品介绍'}).click();
  console.log('PASS mini setup, swaps, friendly capture hints, restoration, undo/redo and AI setup/reply');

  await open('shock-chess'); await expect(page.getByRole('link',{name:'震棋 · 日出333的视频介绍'})).toHaveAttribute('href','https://www.bilibili.com/video/BV1ch4y1c7Kn/');
  await page.getByRole('button',{name:'开始试玩',exact:true}).click(); await expect(panel).toContainText('周围八格');
  await cell(4,4).click(); await expect(count).toHaveText('1'); await expect(panel).toBeVisible();
  await cell(4,5).click(); await expect(count).toHaveText('2'); await expect(cell(4,3)).toHaveAttribute('aria-label','d6 黑方棋石');
  await cell(4,4).click(); await expect(count).toHaveText('3'); await expect(cell(4,2)).toHaveAttribute('aria-label','c6 黑方棋石'); await expect(cell(4,6)).toHaveAttribute('aria-label','g6 白方棋石');
  await page.getByRole('button',{name:'悔棋',exact:true}).click(); await expect(count).toHaveText('2'); await page.getByRole('button',{name:'重做',exact:true}).click(); await expect(count).toHaveText('3');
  await screenshot('shock-play'); await page.getByRole('button',{name:'返回作品介绍'}).click();
  await page.getByRole('button',{name:'与电脑对弈'}).click(); await page.getByLabel('电脑难度').selectOption('easy'); await page.getByRole('button',{name:'开始新的人机对局'}).click();
  await expect(panel).toBeVisible(); await cell(4,4).click(); await expect(count).toHaveText('2');
  await page.getByRole('button',{name:'悔棋',exact:true}).click(); await expect(count).toHaveText('0'); await screenshot('ai');
  await page.getByRole('button',{name:'返回作品介绍'}).click(); assert.equal(await draft(),original);
  const fixture={...shock,pieces:[0,1,3].map(col=>({id:'b'+col,type:'stone',side:'black',row:4,col}))};
  await page.route('**/gallery/shock-chess/v1/project.json',route=>route.fulfill({json:fixture}));
  await page.reload(); await page.getByRole('button',{name:'开始试玩',exact:true}).click(); await expect(panel).toBeVisible();
  await cell(4,2).click(); await expect(page.locator('.gallery-turn')).toHaveText('黑方获胜'); await expect(count).toHaveText('1');
  await page.unroute('**/gallery/shock-chess/v1/project.json'); await open('shock-chess'); await page.reload();
  console.log('PASS shock pushes both colors, undo/redo, AI reply and four-in-row victory');

  const downloaded=page.waitForEvent('download'); await page.getByRole('button',{name:'下载作品'}).click(); const designFile=await downloaded; await designFile.saveAs('artifacts/gallery-design.json');
  const design=JSON.parse(readFileSync('artifacts/gallery-design.json','utf8')); assert.equal(design.rules.engine,'custom'); assert.ok(design.rules.code.includes('BV1ch4y1c7Kn'));
  await page.getByRole('button',{name:'复制到编辑器'}).click(); await expect(page.locator('.project-breadcrumb strong')).toHaveText('震棋 · 副本');
  await expect.poll(async()=>JSON.parse(await draft()).name).toBe('震棋 · 副本'); const copied=JSON.parse(await draft()); assert.notEqual(copied.id,'shock-chess');
  const library=await page.evaluate(()=>JSON.parse(localStorage.getItem('qijing-library-v1'))); assert.deepEqual(library.find(p=>p.id===JSON.parse(original).id),JSON.parse(original));
  await page.getByRole('button',{name:'开始试玩',exact:true}).click(); await expect(panel).toBeVisible(); await cell(4,4).click(); await cell(4,5).click();
  await expect(cell(4,3)).toHaveAttribute('aria-label','d6 黑方棋石'); await page.getByRole('button',{name:'返回编辑',exact:true}).click();
  await page.getByRole('button',{name:'准备发布作品'}).click(); await page.getByLabel('作品标识',{exact:false}).fill('my-first-game'); await page.getByLabel('作者署名').fill('本地测试作者');
  await page.getByLabel('玩法说明').fill('黑先白后，落子击退周围八格棋子，连四获胜。');
  const releaseDownload=page.waitForEvent('download'); await page.getByRole('button',{name:'导出发布包'}).click(); const releaseFile=await releaseDownload;
  await releaseFile.saveAs('artifacts/gallery-release.json'); const release=JSON.parse(readFileSync('artifacts/gallery-release.json','utf8')); assert.deepEqual(release.project,copied); assert.ok(release.coverSvg.startsWith('<svg'));
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  console.log('PASS download attribution, copy retaining draft, editor gameplay and release export');

  await open('mini-eternal'); await page.getByRole('button',{name:'复制到编辑器'}).click();
  await expect(page.locator('.project-breadcrumb strong')).toHaveText('迷你永恒棋 · 副本');
  await page.getByRole('button',{name:'开始试玩',exact:true}).click(); await expect(panel).toContainText('红方布阵');
  await page.getByRole('button',{name:'确认布阵',exact:true}).click(); await expect(panel).toContainText('蓝方布阵');
  await page.getByRole('button',{name:'确认布阵',exact:true}).click(); await expect(panel).toContainText('进入对方禁区获胜');
  await cell(6,1).click(); await expect(cell(6,4).locator('.move-hint')).toBeVisible(); await cell(6,4).click();
  await expect(panel).toContainText('把被吃的红方棋子放回'); await cell(6,3).click();
  await expect(panel).toContainText('进入对方禁区获胜'); await expect(cell(6,3)).toHaveAttribute('aria-label','d1 红方車');
  await page.getByRole('button',{name:'返回编辑',exact:true}).click();
  console.log('PASS copied mini game retains setup, neutral stones, friendly capture and restoration in editor');

  const newest={...catalog.entries.find(e=>e.id==='mini-eternal'),revision:2,instructions:'新版规则'};
  await page.route('**/gallery/index.json',route=>route.fulfill({json:{...catalog,entries:[...catalog.entries,newest]}}));
  await open('mini-eternal'); await expect(page.getByLabel('作品版本')).toHaveValue('1'); await expect(page.getByLabel('作品版本').locator('option')).toHaveCount(2); await expect(page.locator('.gallery-rules')).toContainText('守护者');
  await page.goto(url+'#/gallery/not-found/v1'); await expect(page.getByText('没有找到这个作品版本')).toBeVisible(); await page.unroute('**/gallery/index.json');
  await page.route('**/gallery/index.json',route=>route.fulfill({status:404,body:'missing'})); await page.reload(); await expect(page.getByText('暂时无法打开广场')).toBeVisible();
  await page.unroute('**/gallery/index.json'); await page.getByRole('button',{name:'重新加载',exact:true}).click(); await expect(page.getByText('没有找到这个作品版本')).toBeVisible();
  await page.route('**/gallery/index.json',route=>route.fulfill({json:{...catalog,entries:[]}})); await page.goto(url+'#/gallery'); await page.reload(); await expect(page.getByText('第一款作品，等你发布')).toBeVisible(); await page.unroute('**/gallery/index.json');
  console.log('PASS pinned versions, missing catalog/version, retry and empty states');

  await page.setViewportSize({width:390,height:844}); await page.goto(url+'#/gallery'); await page.reload(); await expect(page.locator('.gallery-card')).toHaveCount(2); await fits(); await screenshot('mobile');
  await open('mini-eternal'); await fits(); await screenshot('mobile-detail'); await page.getByRole('button',{name:'开始试玩',exact:true}).click(); await expect(panel).toContainText('红方布阵');
  await page.getByRole('button',{name:'确认布阵',exact:true}).click(); await expect(panel).toContainText('蓝方布阵'); await page.getByRole('button',{name:'确认布阵',exact:true}).click(); await expect(panel).toContainText('进入对方禁区获胜');
  await fits(); await screenshot('mobile-play'); await page.getByRole('button',{name:'切换夜间模式'}).click(); await screenshot('mobile-dark'); await fits();
  await open('shock-chess'); await page.getByRole('button',{name:'开始试玩',exact:true}).click(); await expect(panel).toBeVisible(); await cell(4,4).click(); await expect(count).toHaveText('1'); await fits(); await screenshot('mobile-shock');
  await page.setViewportSize({width:1440,height:1000}); await page.getByRole('button',{name:'编辑器',exact:true}).click();
  await page.getByRole('button',{name:'人机对弈',exact:true}).click(); await page.getByLabel('对弈方式').selectOption('watch'); await page.getByLabel('电脑难度').selectOption('hard'); await page.getByRole('button',{name:'开始新的人机对局'}).click();
  await page.getByRole('button',{name:'作品广场',exact:true}).click(); await expect(page.locator('.gallery-card')).toHaveCount(2); await page.waitForTimeout(2500); await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button',{name:'编辑器',exact:true}).click(); await expect(page.locator('.bot-status')).toContainText('电脑已暂停');
  const editorCount=page.locator('.game-metrics > div:first-child strong'), paused=await editorCount.textContent(); await page.waitForTimeout(700); await expect(editorCount).toHaveText(paused);
  assert.deepEqual(errors,[]); console.log('PASS both games on mobile/dark theme, AI cancellation, no overflow or runtime errors');
} finally {await browser.close();}
