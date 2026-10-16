import {chromium,expect} from '@playwright/test';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const url=process.env.GALLERY_TEST_URL || 'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath()) ? {channel:'msedge'} : {})});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
page.setDefaultTimeout(12000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const project=JSON.parse(readFileSync('public/gallery/incident-chess/v1/project.json','utf8'));
const button=name=>page.getByRole('button',{name,exact:true});
const cell=(row,col)=>page.locator(`[role="grid"] [data-row="${row}"][data-col="${col}"]`);
const panel=page.getByLabel('当前操作'),count=page.locator('.gallery-step-count strong');
const offer=page.locator('[data-zone-kind="offer"]'),offerCards=offer.getByRole('button');
async function open(){await page.goto(url+'#/gallery/incident-chess/v1');await page.reload();await expect(button('开始试玩')).toBeEnabled();}
async function start(){await open();await button('开始试玩').click();await expect(panel).toBeVisible();}
async function screenshot(name){await page.screenshot({path:`artifacts/incident-${name}.png`,fullPage:true,animations:'disabled'});}
async function checkOfferLayout(stacked) {
  const cards=await offerCards.evaluateAll(items=>items.map(el=>{
    const rect=el.getBoundingClientRect(),text=el.querySelector('.zone-item-description');
    return {x:rect.x,y:rect.y,width:rect.width,textFits:text.scrollWidth<=text.clientWidth+1&&text.scrollHeight<=text.clientHeight+1,described:el.getAttribute('aria-describedby').split(' ').every(id=>document.getElementById(id))};
  }));
  assert.equal(cards.length,3);assert.ok(cards.every(c=>c.textFits&&c.described),'effects fit and have accessible descriptions');
  assert.ok(stacked ? cards[1].y>cards[0].y&&cards[2].y>cards[1].y : cards.every(c=>Math.abs(c.y-cards[0].y)<1),'three choices use the expected responsive layout');
}
async function fixture(fields,pieces=project.pieces,slowView=false) {
  const code=project.rules.code+`\nconst fixtureState=s=>s.history.length?s:{...s,data:{incident:${JSON.stringify({seed:87654,round:0,...fields})}}};const fixtureMove=onMove,fixtureMoves=getLegalMoves,fixtureView=getGameView,fixtureEval=evaluate;onMove=(s,m)=>fixtureMove(fixtureState(s),m);getLegalMoves=s=>fixtureMoves(fixtureState(s));getGameView=${slowView ? 'async' : ''} s=>{${slowView ? 'if(s.history.length)await new Promise(resolve=>setTimeout(resolve,700));' : ''}return fixtureView(fixtureState(s));};evaluate=(s,c)=>fixtureEval(fixtureState(s),c);`;
  await page.route('**/gallery/incident-chess/v1/project.json',route=>route.fulfill({json:{...project,pieces,rules:{...project.rules,code}}}));
  await start();
}
try {
  mkdirSync('artifacts',{recursive:true});
  await page.goto(url);await expect.poll(()=>page.evaluate(()=>localStorage.getItem('qijing-project-v1'))).toBeTruthy();
  const draft=await page.evaluate(()=>localStorage.getItem('qijing-project-v1'));
  await button('作品广场').click();await page.getByLabel('搜索作品').fill('异变');await expect(page.locator('.gallery-card')).toHaveCount(1);
  await page.getByRole('link',{name:'查看异变象棋'}).click();await expect(page.getByRole('heading',{name:'异变象棋',exact:true})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);await screenshot('detail');
  await button('开始试玩').click();await button('开始对局').click();await expect(button('移动棋子')).toBeVisible();
  await cell(6,0).click();await expect(cell(5,0).locator('.move-hint')).toBeVisible();await cell(5,0).click();
  await expect(offerCards).toHaveCount(3);await expect(count).toHaveText('2');
  const offered=await offerCards.allTextContents();await screenshot('skill-offer');
  await button('悔棋').click();await expect(button('移动棋子')).toBeVisible();await button('重做').click();
  await expect(offerCards).toHaveCount(3);assert.deepEqual(await offerCards.allTextContents(),offered);
  await offerCards.first().click();
  await expect.poll(async()=>await button('跳过此技能').count() || (await page.locator('.gallery-turn').textContent()) === '黑方回合').toBeTruthy();
  if(await button('跳过此技能').count()) await button('跳过此技能').click();
  await expect(page.locator('.gallery-turn')).toHaveText('黑方回合');
  await page.getByText('技能图鉴 · 50 种',{exact:true}).click();await expect(panel).toContainText('良驹难寻·绝影');
  await page.getByText('技能图鉴 · 50 种',{exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('qijing-project-v1')),draft);
  console.log('PASS discovery, sandbox, movement, random offer, undo/redo and skill library');

  await fixture({offer:{playerId:'white',options:['迷你炮','如履平地','金蝉脱壳']}});
  await offerCards.filter({hasText:'迷你炮'}).press('Enter');
  await expect(panel).toContainText('点击一个高亮目标');await expect(cell(7,1).locator('.move-hint')).toBeVisible();
  await cell(9,0).click();await expect(page.getByRole('alert')).toContainText('目标不可用');await expect(count).toHaveText('1');
  await cell(7,1).click();await expect(cell(7,1)).toHaveAttribute('aria-label',/迷你炮/);await expect(count).toHaveText('2');
  await expect(page.locator('.gallery-turn')).toHaveText('黑方回合');
  await button('悔棋').click();await expect(panel).toContainText('施放「迷你炮」');await button('重做').click();
  await screenshot('upgraded-cannon');
  const p=(type,side,row,col)=>({id:side+'-'+row+'-'+col,type,side,row,col});
  await page.unroute('**/gallery/incident-chess/v1/project.json');
  await fixture({tricks:{white:['以逸待劳']},persistents:{white:['骠骑将军']}},[p('将','white',9,4),p('将','black',0,4),p('马','white',8,4),p('兵','white',6,0)]);
  await button('选择项目：以逸待劳').click();await cell(6,0).click();await expect(page.locator('.piece-status-marker')).toContainText(['待劳']);
  await expect(count).toHaveText('1');await button('移动棋子').click();await cell(9,4).click();await expect(cell(8,4).locator('.move-hint')).toBeVisible();await cell(8,4).click();
  await expect(cell(8,4)).toHaveAttribute('aria-label',/骠骑将.*连动/);await button('放弃第二次移动').click();await expect(offerCards).toHaveCount(3);
  console.log('PASS targeted upgrades, rejected targets, free tricks, friendly fusion and second move');

  await page.unroute('**/gallery/incident-chess/v1/project.json');
  await fixture({tricks:{white:['声东击西','金蝉脱壳']},persistents:{white:['如履平地'],black:['如履平地']}},project.pieces,true);
  await expect(page.locator('[data-zone-id="skills-white"]')).toContainText('被动触发');
  await expect(page.locator('[data-zone-id="skills-black"] button')).toHaveCount(0);
  await button('使用：声东击西').press('Space');
  await expect(page.locator('.game-table')).toHaveAttribute('aria-busy','true');
  await button('使用：声东击西').evaluate(el=>el.click());
  await expect(count).toHaveText('1');
  await expect(panel).toContainText('声东击西已就绪');
  await expect(button('使用：声东击西')).toHaveCount(0);await expect(page.locator('.gallery-turn')).toHaveText('红方回合');
  await button('悔棋').click();await expect(button('使用：声东击西')).toBeEnabled();
  await button('重做').click();await expect(button('使用：声东击西')).toHaveCount(0);await screenshot('hand');
  console.log('PASS keyboard direct trick, passive/continuous hand cards, retained pending view, stale click guard and history');
  await page.unroute('**/gallery/incident-chess/v1/project.json');
  await fixture({offer:{playerId:'white',options:['迷你炮','如履平地','金蝉脱壳']},tricks:{white:['声东击西','金蝉脱壳']},persistents:{black:['如履平地']}});
  await expect(offerCards).toHaveCount(3);await checkOfferLayout(false);await offer.scrollIntoViewIfNeeded();await screenshot('augment-desktop');
  await page.setViewportSize({width:390,height:844});await checkOfferLayout(true);await screenshot('mobile');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal fit');
  await button('切换夜间模式').click();await checkOfferLayout(true);await screenshot('mobile-dark');
  await button('切换日间模式').click();
  await page.unroute('**/gallery/incident-chess/v1/project.json');
  await fixture({offer:{playerId:'white',options:['良驹难寻·绝影','变形金刚·装甲','江湖众生·偃师']}});
  await checkOfferLayout(true);await screenshot('long-effects-mobile');
  await page.setViewportSize({width:1440,height:1100});await checkOfferLayout(false);await offer.scrollIntoViewIfNeeded();await screenshot('long-effects-desktop');
  await page.unroute('**/gallery/incident-chess/v1/project.json');await page.setViewportSize({width:1440,height:1100});
  await open();await button('与电脑对弈').click();await page.getByLabel('电脑难度').selectOption('easy');await button('开始新的人机对局').click();
  await button('开始对局').click();await cell(6,0).click();await cell(5,0).click();await expect(offerCards).toHaveCount(3);
  await offerCards.first().click();
  await expect.poll(async()=>await button('跳过此技能').count() || (await page.locator('.gallery-turn').textContent()).includes('黑方')).toBeTruthy();
  if(await button('跳过此技能').count()) await button('跳过此技能').click();
  await expect.poll(async()=>Number(await count.textContent())).toBeGreaterThanOrEqual(5);
  await expect(page.locator('.gallery-turn')).toHaveText('红方回合');await expect(page.getByRole('alert')).toHaveCount(0);await screenshot('ai');
  console.log('PASS responsive layout and actual sandbox AI including skill choices');
  await button('返回作品介绍').click();
  const download=page.waitForEvent('download');await button('下载作品').click();await (await download).saveAs('artifacts/incident-download.json');
  assert.deepEqual(JSON.parse(readFileSync('artifacts/incident-download.json','utf8')),project);
  await button('复制到编辑器').click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('qijing-project-v1') || '{}').name)).toBe('异变象棋 · 副本');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qijing-project-v1')).rules.code),project.rules.code);
  await button('开始试玩').click();await button('开始对局').click();
  await cell(6,0).click();await cell(5,0).click();await expect(offerCards).toHaveCount(3);
  await checkOfferLayout(false);await offer.scrollIntoViewIfNeeded();await screenshot('editor-offer');
  await expect(page.locator('.game-table-bottom [data-zone-kind="offer"]')).toHaveCount(1);
  await button('翻转棋盘').click();await expect(page.locator('.game-table-top [data-zone-kind="offer"]')).toHaveCount(1);
  await offerCards.first().press('Enter');await expect(offerCards).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await screenshot('editor');
  assert.deepEqual(errors,[]);
  console.log('PASS complete download, editor copy, actual editor card submission and flipped ownership; no browser errors');
} finally {await browser.close();}
