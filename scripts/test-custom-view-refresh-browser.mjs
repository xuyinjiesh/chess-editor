import { chromium, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const url=process.env.GALLERY_TEST_URL || 'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{channel:'msedge'}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
const cell=(row,col)=>page.locator(`[role="grid"] [data-row="${row}"][data-col="${col}"]`);
const panel=page.getByLabel('当前操作');
const count=()=>page.locator('.gallery-step-count strong, .game-metrics > div:first-child strong');

async function snapshot() {
  await page.evaluate(()=>{
    const board=document.querySelector('[role="grid"]'),panel=document.querySelector('.custom-rule-panel'),table=document.querySelector('.game-table');
    window.refreshSnapshot={board,panel,table,panelContent:panel.innerHTML,tableContent:[...document.querySelectorAll('.game-zone')].map(el=>el.innerHTML),opacities:[...document.querySelectorAll('.zone-item')].map(el=>getComputedStyle(el).opacity),boardBox:board.getBoundingClientRect().toJSON()};
  });
  navigations=0;
}
async function checkPending(step) {
  await expect(panel).toHaveAttribute('aria-busy','true');
  await expect(count()).toHaveText(String(step));
  const actual=await page.evaluate(()=>{
    const saved=window.refreshSnapshot,board=document.querySelector('[role="grid"]'),panel=document.querySelector('.custom-rule-panel'),table=document.querySelector('.game-table');
    return {sameBoard:saved.board===board,samePanel:saved.panel===panel,sameTable:saved.table===table,panelRetained:saved.panelContent===panel.innerHTML,zonesRetained:JSON.stringify(saved.tableContent)===JSON.stringify([...document.querySelectorAll('.game-zone')].map(el=>el.innerHTML)),opacityRetained:JSON.stringify(saved.opacities)===JSON.stringify([...document.querySelectorAll('.zone-item')].map(el=>getComputedStyle(el).opacity)),widthStable:Math.abs(saved.boardBox.width-board.getBoundingClientRect().width)<1,hasHints:!!document.querySelector('.move-hint'),inert:panel.inert&&(!table||table.inert)};
  });
  assert.deepEqual(actual,{sameBoard:true,samePanel:true,sameTable:true,panelRetained:true,zonesRetained:true,opacityRetained:true,widthStable:true,hasHints:false,inert:true});
  // Programmatic events bypass inert hit-testing: submission guards must still
  // reject both old panel actions and a second board move while loading.
  await page.locator('.game-zone button, .rule-choices button').first().evaluate(el=>el.click());
  await cell(1,2).evaluate(el=>el.click());
  await expect(count()).toHaveText(String(step));
  assert.equal(navigations,0,'moves do not navigate or reload the page');
  await expect(panel).toHaveAttribute('aria-busy','false');
}
try {
  for(const id of ['wrestle-chess','football']) {
    const project=JSON.parse(readFileSync(`public/gallery/${id}/v1/project.json`,'utf8'));
    // Make the normally short worker gap observable and deterministic.
    const code=project.rules.code+'\nconst originalView=getGameView;getGameView=async(s,p)=>{const view=originalView(s,p);if(s.history.length)await new Promise(resolve=>setTimeout(resolve,700));return view;};';
    await page.route(`**/gallery/${id}/v1/project.json`,route=>route.fulfill({json:{...project,rules:{...project.rules,code}}}));
  }
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(url+'#/gallery/wrestle-chess/v1');await page.reload();
    await page.getByRole('button',{name:'开始试玩',exact:true}).click();
    await expect(page.getByRole('button',{name:'选择棋子：红方马',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'选择棋子：红方马',exact:true}).click();
    await snapshot();await cell(0,0).click();await checkPending(1);
    await expect(page.getByRole('button',{name:'选择棋子：蓝方车',exact:true})).toBeEnabled();
    await expect(page.locator('[data-zone-owner="white"] .zone-item').nth(1)).toContainText('×1');
    await snapshot();await cell(2,2).click();await checkPending(2);
    await expect(page.getByRole('button',{name:'移动棋子',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'选择棋子：红方兵',exact:true}).click();
    await snapshot();await cell(0,1).click();await checkPending(3);
    await snapshot();await page.getByRole('button',{name:'悔棋',exact:true}).click();await checkPending(2);
    await snapshot();await page.getByRole('button',{name:'重做',exact:true}).click();await checkPending(3);
    console.log(`PASS ${width}px wrestle placement and history: retained panel, reserves, selection, opacity and board; stale input blocked`);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(url+'#/gallery/football/v1');await page.reload();await page.getByRole('button',{name:'开始试玩',exact:true}).click();
  await expect(page.getByRole('button',{name:'移动 / 带球',exact:true})).toBeVisible();
  await cell(13,6).click();await snapshot();await cell(11,6).click();await checkPending(1);
  console.log('PASS football retains its above-board panel without moving or remounting it');

  await page.goto(url+'#/gallery/wrestle-chess/v1');await page.reload();
  await page.getByRole('button',{name:'复制到编辑器',exact:true}).click();await page.getByRole('button',{name:'开始试玩',exact:true}).click();
  await expect(page.getByRole('button',{name:'选择棋子：红方车',exact:true})).toBeVisible();
  await snapshot();await cell(0,0).click();await checkPending(1);
  await page.getByRole('button',{name:'选择棋子：蓝方车',exact:true}).click();
  await snapshot();await cell(2,2).click();await checkPending(2);
  assert.deepEqual(errors,[]);
  console.log('PASS copied editor uses the same stable refresh and blocks stale input; no page errors');
} finally {await browser.close();}
