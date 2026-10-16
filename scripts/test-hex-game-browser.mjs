import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const url=process.env.GALLERY_TEST_URL||'http://127.0.0.1:4173/';
const project=JSON.parse(readFileSync('public/gallery/hex/v1/project.json','utf8'));
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{channel:'msedge'}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const grid=page.getByRole('grid'), count=page.locator('.gallery-step-count strong'), panel=page.getByLabel('当前操作');
const cell=(row,col)=>grid.locator(`[data-row="${row}"][data-col="${col}"]`);
const draft=()=>page.evaluate(()=>localStorage.getItem('qijing-project-v1'));
async function ready(){await expect(grid).not.toHaveAttribute('aria-busy','true');}
async function place(row,col,step){await ready();await cell(row,col).click();await expect(count).toHaveText(String(step));await ready();}
async function fits(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');}
async function shot(name){await page.screenshot({path:`artifacts/hex-game-${name}.png`,fullPage:true,animations:'disabled'});}
async function aligned(row,col){await expect.poll(async()=>{
  const a=await cell(row,col).boundingBox(), b=await grid.locator('.piece-sprite').boundingBox();
  return Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2);
}).toBeLessThan(.6);}
try {
  mkdirSync('artifacts',{recursive:true});
  await page.goto(url);await expect.poll(draft).toBeTruthy();const original=await draft();
  await page.getByRole('button',{name:'作品广场',exact:true}).click();
  await page.getByRole('link',{name:'查看六贯棋 · Hex'}).click();
  await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'开始试玩',exact:true})).toBeEnabled();
  await expect(page.getByRole('link',{name:'六贯棋 · 中文维基百科'})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);assert.equal(await draft(),original);
  await page.getByRole('button',{name:'开始试玩',exact:true}).click();await ready();
  await expect(grid.getByRole('gridcell')).toHaveCount(121);
  await expect(grid.locator('.hex-goal-edge')).toHaveCount(4);
  await expect(panel).toContainText('红方：连接上下');
  const a=await cell(0,0).boundingBox(),b=await cell(1,0).boundingBox(),c=await cell(2,0).boundingBox();
  assert.ok(Math.abs(b.x-a.x-a.width/2)<.6 && Math.abs(c.x-b.x-a.width/2)<.6,'every row shifts half a hex');
  assert.ok(Math.abs(a.height/a.width-2/Math.sqrt(3))<.003,'regular hexagonal cells');
  const bounds=await grid.boundingBox();await page.mouse.click(bounds.x+bounds.width-1,bounds.y+1);await expect(count).toHaveText('0');
  await place(0,7,1);await expect(page.getByRole('button',{name:/^交换首子/})).toBeVisible();
  await expect(grid.locator('.stone.white')).toHaveCount(1);
  assert.ok((await grid.locator('.stone.white').evaluate(e=>getComputedStyle(e).backgroundColor)).includes('185, 76, 71'),'red stone uses side color');
  await page.getByRole('button',{name:/^交换首子/}).click();await expect(count).toHaveText('2');await ready();
  await expect(cell(7,0)).toHaveAttribute('aria-label',/蓝方棋石/);await aligned(7,0);
  await expect(cell(0,7)).toHaveAttribute('aria-label',/空格/);
  await expect(page.locator('.gallery-turn')).toHaveText('红方回合');
  await expect(page.getByRole('button',{name:/^交换首子/})).toHaveCount(0);
  await page.getByRole('button',{name:'悔棋',exact:true}).click();await expect(count).toHaveText('1');await ready();
  await expect(cell(0,7)).toHaveAttribute('aria-label',/红方棋石/);await aligned(0,7);
  await expect(page.getByRole('button',{name:/^交换首子/})).toBeVisible();
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(count).toHaveText('2');await ready();await aligned(7,0);
  await cell(7,0).click();await expect(page.getByRole('alert')).toContainText('已有棋石');await expect(count).toHaveText('2');
  await place(0,7,3);await expect(grid.locator('.piece-sprite')).toHaveCount(2);
  await fits();await shot('opening');assert.equal(await draft(),original);
  console.log('PASS real rhombus, colored goals, swap mirroring, legal placement, undo/redo and draft isolation');

  await page.getByRole('button',{name:'重新开始',exact:true}).click();await expect(count).toHaveText('0');await ready();
  const path=[[0,5],[1,4],[2,4],[3,3],[4,3],[5,2],[6,2],[7,1],[8,1],[9,0],[10,0]];
  for(let i=0;i<path.length;i++) {
    await place(...path[i],i*2+1);
    if(i<10)await place(i,10,i*2+2);
  }
  await expect(page.locator('.gallery-turn')).toHaveText('红方获胜');
  await expect(grid.locator('.piece-status-marker')).toHaveCount(11);await expect(panel).toContainText('获胜路径');
  await cell(10,10).click();await expect(count).toHaveText('21');
  await page.getByRole('button',{name:'悔棋',exact:true}).click();await expect(count).toHaveText('20');await ready();
  await expect(grid.locator('.piece-status-marker')).toHaveCount(0);
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(count).toHaveText('21');await ready();
  await expect(grid.locator('.piece-status-marker')).toHaveCount(11);await shot('win');
  console.log('PASS bent edge-to-edge victory, highlighted path, terminal lock and history restoration');

  await page.getByRole('button',{name:'返回作品介绍'}).click();await page.getByRole('button',{name:'与电脑对弈',exact:true}).click();
  await page.getByLabel('我执哪方').selectOption('black');await page.getByLabel('电脑难度').selectOption('easy');
  await page.getByRole('button',{name:'开始新的人机对局'}).click();await expect(count).toHaveText('1');await ready();
  await page.getByRole('button',{name:/^交换首子/}).click();await expect(count).toHaveText('3');await ready();
  await expect(grid.locator('.stone.black')).toHaveCount(1);await expect(grid.locator('.stone.white')).toHaveCount(1);
  await expect(page.locator('.bot-status [role="alert"]')).toHaveCount(0);
  await page.getByRole('button',{name:'悔棋',exact:true}).click();await expect(count).toHaveText('1');await ready();
  await expect(page.getByRole('button',{name:/^交换首子/})).toBeVisible();
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(count).toHaveText('3');await ready();
  await fits();await shot('computer');
  console.log('PASS sandboxed computer opening, human swap, computer reply and human-turn undo/redo');

  await page.getByRole('button',{name:'返回作品介绍'}).click();
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'下载作品',exact:true}).click();
  await (await downloaded).saveAs('artifacts/hex-game.qijing.json');
  assert.deepEqual(JSON.parse(readFileSync('artifacts/hex-game.qijing.json','utf8')),project);
  await page.getByRole('button',{name:'复制到编辑器',exact:true}).click();
  await expect(page.locator('.project-breadcrumb strong')).toHaveText('六贯棋 · Hex · 副本');
  await expect(page.getByLabel('六边形布局')).toHaveValue('rhombus');
  await expect.poll(async()=>JSON.parse(await draft()).board.hexLayout).toBe('rhombus');
  await page.getByRole('button',{name:'开始试玩',exact:true}).click();await ready();
  await cell(0,7).click();await expect(page.locator('.game-metrics > div:first-child strong')).toHaveText('1');await ready();
  await page.keyboard.press('f');await aligned(0,7);
  await page.getByRole('button',{name:/^交换首子/}).click();await expect(page.locator('.game-metrics > div:first-child strong')).toHaveText('2');await ready();await aligned(7,0);
  await page.keyboard.press('d');await fits();await shot('editor-dark');
  console.log('PASS portable download/copy, editor topology, flipped swap alignment and dark theme');

  await page.getByRole('button',{name:'返回编辑',exact:true}).click();
  await page.getByLabel('棋盘列数').fill('5');await page.getByLabel('棋盘行数').fill('5');
  await expect(grid.getByRole('gridcell')).toHaveCount(25);
  await expect.poll(async()=>JSON.parse(await draft()).regions.every(r=>r.cells.length===5)).toBe(true);
  await page.getByRole('button',{name:'开始试玩',exact:true}).click();await ready();
  const editorCount=page.locator('.game-metrics > div:first-child strong');
  for(let i=0;i<5;i++) {
    await cell(4,i).click();await expect(editorCount).toHaveText(String(i*2+1));await ready();
    await cell(0,i).click();await expect(editorCount).toHaveText(String(i*2+2));await ready();
  }
  await expect(panel).toContainText('蓝方已连通两条对边');await expect(grid.locator('.piece-status-marker')).toHaveCount(5);
  await expect(grid.locator('.hex-goal-edge')).toHaveCount(4);
  console.log('PASS editor board resizing, goal-region adaptation and blue left-to-right victory');

  await page.setViewportSize({width:390,height:844});
  await page.goto(url+'#/gallery/hex/v1');await page.reload();
  await page.getByRole('button',{name:'开始试玩',exact:true}).click();await ready();
  await place(2,6,1);await page.getByRole('button',{name:/^交换首子/}).click();await expect(count).toHaveText('2');await ready();
  await expect(cell(6,2)).toHaveAttribute('aria-label',/蓝方棋石/);await aligned(6,2);await fits();await shot('mobile');
  assert.deepEqual(errors,[]);
  console.log('PASS mobile placement and swap, no horizontal overflow or browser exceptions');
} finally {await browser.close();}
