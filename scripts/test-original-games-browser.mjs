import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const url=process.env.GALLERY_TEST_URL || 'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{channel:'msedge'}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
page.setDefaultTimeout(12000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const projects=Object.fromEntries(['football','wrestle-chess'].map(id=>[id,JSON.parse(readFileSync(`public/gallery/${id}/v1/project.json`,'utf8'))]));
const cell=(row,col)=>page.locator(`[role="grid"] [data-row="${row}"][data-col="${col}"]`);
const choice=name=>page.getByRole('button',{name,exact:true});
const count=page.locator('.gallery-step-count strong');
const draft=()=>page.evaluate(()=>localStorage.getItem('qijing-project-v1'));
async function open(id){await page.goto(url+'#/gallery/'+id+'/v1');await page.reload();await expect(choice('开始试玩')).toBeEnabled();}
async function start(id){await open(id);await choice('开始试玩').click();await expect(page.getByRole('group',{name:'选择操作'})).toBeVisible();}
async function play(fr,fc,tr,tc,step){await cell(fr,fc).click();await expect(cell(tr,tc).locator('.move-hint')).toBeVisible();await cell(tr,tc).click();await expect(count).toHaveText(String(step));}
async function fixture(id,pieces,data) {
  const p=projects[id];
  const code=p.rules.code+`\nconst fixtureState=s=>s.history.length?s:{...s,data:${JSON.stringify(data)}};const originalMove=onMove,originalMoves=getLegalMoves,originalView=getGameView,originalEval=evaluate;onMove=(s,m,p)=>originalMove(fixtureState(s),m,p);getLegalMoves=(s,p)=>originalMoves(fixtureState(s),p);getGameView=(s,p)=>originalView(fixtureState(s),p);evaluate=(s,c,p)=>originalEval(fixtureState(s),c,p);`;
  await page.route(`**/gallery/${id}/v1/project.json`,route=>route.fulfill({json:{...p,pieces,rules:{...p.rules,code}}}));
  await start(id);
}
const p=(id,type,side,row,col)=>({id,type,side,row,col});
async function screenshot(name){await page.screenshot({path:`artifacts/original-${name}.png`,fullPage:true,animations:'disabled'});}
try {
  mkdirSync('artifacts',{recursive:true});
  await page.goto(url);await expect.poll(draft).toBeTruthy();const original=await draft();
  await choice('作品广场').click();await page.getByLabel('搜索作品').fill('原创');await expect(page.locator('.gallery-card')).toHaveCount(3);
  await page.getByRole('link',{name:'查看足球棋'}).click();await expect(page.getByRole('heading',{name:'足球棋',exact:true})).toBeVisible();
  await expect(page.locator('.gallery-byline')).toContainText('xuyinjie');assert.equal(page.workers().length,0);await expect(page.locator('iframe')).toHaveCount(0);
  await screenshot('football-detail');
  await start('football');await expect(count).toHaveText('0');await expect(page.locator('.football-pitch-lines')).toBeVisible();
  await choice('传球 / 射门').click();await expect(count).toHaveText('0');await choice('移动 / 带球').click();
  await play(13,6,11,6,1);await play(10,6,9,6,2);await play(11,6,11,7,3);
  await expect(cell(11,7)).toHaveAttribute('aria-label',/红方前锋 ⚽/);await expect(page.locator('.piece-status-marker')).toHaveText('⚽');
  await play(10,8,9,8,4);await choice('传球 / 射门').click();await play(11,7,8,7,5);
  await expect(cell(8,7)).toHaveAttribute('aria-label',/中立足球/);await expect(cell(11,7)).toHaveAttribute('aria-label','h12 红方前锋');
  await choice('悔棋').click();await expect(count).toHaveText('4');await expect(page.locator('.piece-status-marker')).toHaveText('⚽');
  await choice('重做').click();await expect(count).toHaveText('5');await expect(page.locator('.piece-status-marker')).toHaveCount(0);
  assert.equal(await draft(),original);await screenshot('football-desktop');
  await choice('重新开始').click();await expect(count).toHaveText('0');await expect(cell(11,7)).toHaveAttribute('aria-label',/中立足球/);
  console.log('PASS original gallery discovery, movement, pickup, mode switching, kicks, undo/redo, reset and draft preservation');

  await fixture('football',[p('carrier','fw','white',1,7)],{carrierId:'carrier',charged:true});
  await expect(page.locator('.piece-status-marker')).toHaveText('⚽蓄');await play(1,7,0,7,1);
  await expect(page.locator('.gallery-turn')).toHaveText('红方获胜');await expect(choice('移动 / 带球')).toBeDisabled();
  await choice('悔棋').click();await expect(page.locator('.piece-status-marker')).toHaveText('⚽蓄');await choice('传球 / 射门').click();await play(1,7,0,7,1);await expect(page.locator('.gallery-turn')).toHaveText('红方获胜');
  await page.unroute('**/gallery/football/v1/project.json');
  console.log('PASS charged marker, carried goal, shot goal, terminal controls and undo state restoration');

  await start('wrestle-chess');await expect(page.locator('.rule-choices button')).toHaveCount(7);
  await cell(1,1).click();await expect(page.getByRole('alert')).toContainText('第一手不能占中心');await expect(count).toHaveText('0');
  await cell(0,0).click();await expect(count).toHaveText('1');await cell(2,2).click();await expect(count).toHaveText('2');
  await choice('马 ×2 · 上场').click();await cell(0,1).click();await expect(count).toHaveText('3');
  await choice('炮 ×2 · 上场').click();await cell(2,0).click();await expect(count).toHaveText('4');
  await choice('兵 ×5 · 上场').click();await cell(0,2).click();await expect(count).toHaveText('5');
  await choice('兵 ×5 · 上场').click();await cell(2,1).click();await expect(count).toHaveText('6');
  await expect(page.locator('.rule-choices button')).toHaveCount(1);await expect(choice('移动棋子')).toHaveAttribute('aria-pressed','true');
  const from=await cell(0,0).boundingBox(),to=await cell(1,0).boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:10});await page.mouse.up();
  await expect(count).toHaveText('7');await expect(cell(1,0)).toHaveAttribute('aria-label',/红方車/);
  await choice('悔棋').click();await expect(count).toHaveText('6');await choice('重做').click();await expect(count).toHaveText('7');
  await screenshot('wrestle-desktop');
  await fixture('wrestle-chess',[p('elephant','elephant','white',0,0),p('king','king','black',1,1)],{});
  await play(0,0,2,2,1);await expect(page.locator('.gallery-turn')).toHaveText('红方获胜');await expect(cell(1,1)).toHaveAttribute('aria-label','b2 空格');
  await page.unroute('**/gallery/wrestle-chess/v1/project.json');
  console.log('PASS reserve placement, center restriction, three-piece cap, dragging and penetrating king capture');

  for(const id of ['football','wrestle-chess']) {
    await open(id);await choice('与电脑对弈').click();await page.getByLabel('电脑难度').selectOption('easy');await choice('开始新的人机对局').click();
    await expect(page.getByRole('group',{name:'选择操作'})).toBeVisible();
    if(id==='football') {await cell(13,6).click();await cell(11,6).click();} else await cell(0,0).click();
    await expect(count).toHaveText('2');await expect(page.locator('.gallery-turn')).toHaveText('红方回合');
    await choice('悔棋').click();await expect(count).toHaveText('0');await expect(page.locator('.gallery-turn')).toHaveText('红方回合');
    await choice('返回作品介绍').click();assert.equal(await draft(),original);
    const download=page.waitForEvent('download');await choice('下载作品').click();await (await download).saveAs(`artifacts/${id}-design.json`);
    assert.deepEqual(JSON.parse(readFileSync(`artifacts/${id}-design.json`,'utf8')),projects[id]);
  }
  console.log('PASS real sandbox AI replies, grouped undo and complete design downloads');

  await open('wrestle-chess');await choice('复制到编辑器').click();await expect(page.locator('.project-breadcrumb strong')).toHaveText('角斗棋 · 副本');
  await choice('开始试玩').click();await expect(choice('车 ×2 · 上场')).toBeVisible();await cell(0,0).click();await expect(page.locator('.game-metrics > div:first-child strong')).toHaveText('1');
  await open('football');await choice('复制到编辑器').click();await choice('开始试玩').click();await expect(choice('移动 / 带球')).toBeVisible();
  const editorCount=page.locator('.game-metrics > div:first-child strong');
  await cell(13,6).click();await cell(12,7).click();await expect(editorCount).toHaveText('1');
  await cell(10,6).click();await cell(9,6).click();await expect(editorCount).toHaveText('2');
  await cell(12,7).click();await cell(11,7).click();await expect(editorCount).toHaveText('3');await expect(page.locator('.piece-status-marker')).toHaveText('⚽');
  console.log('PASS both games copied into the editor retain custom controls and play');

  for(const id of ['football','wrestle-chess']) {
    await page.setViewportSize({width:390,height:844});await start(id);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no mobile horizontal overflow');
    await expect(page.getByRole('group',{name:'选择操作'})).toBeVisible();
    if(id==='football') {await cell(13,6).click();await cell(11,6).click();await expect(count).toHaveText('1');}
    else {await choice('士 ×2 · 上场').click();await cell(0,0).click();await expect(count).toHaveText('1');}
    await screenshot(id+'-mobile');
    await page.getByRole('button',{name:'切换夜间模式'}).click();await screenshot(id+'-mobile-dark');
    await page.getByRole('button',{name:'切换日间模式'}).click();
  }
  assert.deepEqual(errors,[]);console.log('PASS mobile play, light/dark rendering and no page errors');
} finally {await browser.close();}
