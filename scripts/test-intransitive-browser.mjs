import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const url=process.env.GALLERY_TEST_URL || 'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{channel:'msedge'}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const project=JSON.parse(readFileSync('public/gallery/intransitive/v1/project.json','utf8'));
const cell=(row,col)=>page.locator(`[role="grid"] [data-row="${row}"][data-col="${col}"]`);
const count=page.locator('.gallery-step-count strong');
const draft=()=>page.evaluate(()=>localStorage.getItem('qijing-project-v1'));
const p=(type,side,row,col)=>({id:`${side}-${row}-${col}`,type,side,row,col});
async function open(){await page.goto(url+'#/gallery/intransitive/v1');await page.reload();await expect(page.getByRole('button',{name:'开始试玩',exact:true})).toBeEnabled();}
async function start(){await page.getByRole('button',{name:'开始试玩',exact:true}).click();await expect(page.locator('.custom-rule-panel')).toContainText('八向一步');}
async function play(row,col,toRow,toCol){await cell(row,col).click();await cell(toRow,toCol).click();}
async function fits(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');}
async function screenshot(name){await page.screenshot({path:`artifacts/intransitive-${name}.png`,fullPage:true,animations:'disabled'});}
async function fixture(pieces,quietPlies=0){
  const code=project.rules.code+`\nconst savedOnMove=onMove;onMove=(s,m,p)=>savedOnMove({...s,data:{quietPlies:${quietPlies},...s.data}},m,p);`;
  await page.route('**/gallery/intransitive/v1/project.json',route=>route.fulfill({json:{...project,pieces,rules:{...project.rules,code}}}));
  await open();await start();
}
try {
  mkdirSync('artifacts',{recursive:true});
  await page.goto(url);await expect.poll(draft).toBeTruthy();const original=await draft();
  await page.getByRole('button',{name:'作品广场',exact:true}).click();
  await page.getByLabel('搜索作品').fill('Intransitive');await expect(page.locator('.gallery-card')).toHaveCount(1);
  await page.getByRole('link',{name:'查看石头剪刀布棋 · Intransitive'}).click();
  await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'原视频 · I Reinvented Rock Paper Scissors'})).toHaveAttribute('href','https://www.youtube.com/watch?v=LO_zcGNJriA');
  await expect(page.locator('iframe')).toHaveCount(0);await screenshot('detail');
  await start();await expect(page.locator('.gallery-turn')).toHaveText('蓝方回合');
  await expect(page.locator('.piece-sprite')).toHaveCount(20);
  await expect(cell(8,0)).toHaveAttribute('aria-label',/蓝方基地/);
  await expect(cell(0,8)).toHaveAttribute('aria-label',/红方基地/);
  await cell(4,1).click();await expect(cell(3,1).locator('.move-hint')).toBeVisible();
  await cell(2,1).click();await expect(page.getByRole('alert')).toContainText('一格');await expect(count).toHaveText('0');
  await cell(3,1).click();await expect(count).toHaveText('1');await expect(cell(3,1)).toHaveAttribute('aria-label','b6 蓝方布');
  await play(1,5,0,5);await expect(count).toHaveText('2');
  await page.getByText('兵力与和棋计数',{exact:true}).click();await expect(page.locator('.rule-details').first()).toContainText('2 / 200');
  await page.getByRole('button',{name:'悔棋',exact:true}).click();await expect(count).toHaveText('1');await expect(page.locator('.rule-details').first()).toContainText('1 / 200');
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(count).toHaveText('2');
  await screenshot('desktop');assert.equal(await draft(),original);
  await page.getByRole('button',{name:'重新开始',exact:true}).click();await expect(count).toHaveText('0');
  const from=await cell(4,1).boundingBox(),to=await cell(3,1).boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:10});await page.mouse.up();
  await expect(count).toHaveText('1');
  console.log('PASS gallery search, source attribution, fixed opening, hints, rejected move, dragging and undo/redo counters');

  await fixture([p('rock','white',4,4),p('scissors','black',3,5),p('paper','black',0,0)]);
  await play(4,4,3,5);await expect(count).toHaveText('1');await expect(page.locator('.gallery-moves')).toContainText('吃剪');
  await expect(page.locator('.piece-sprite:not(.is-exiting)')).toHaveCount(2);
  await page.getByRole('button',{name:'悔棋',exact:true}).click();await expect(page.locator('.piece-sprite:not(.is-exiting)')).toHaveCount(3);
  await fixture([p('rock','white',4,4),p('paper','black',3,5)]);
  await play(4,4,3,5);await expect(page.getByRole('alert')).toContainText('不能吃');await expect(count).toHaveText('0');
  await fixture([p('paper','white',1,7),p('scissors','black',0,7)],199);
  await play(1,7,0,8);await expect(page.locator('.gallery-turn')).toHaveText('蓝方获胜');await expect(page.locator('.gallery-moves')).toContainText('攻入敌方基地');
  await screenshot('victory');
  await page.getByRole('button',{name:'悔棋',exact:true}).click();await expect(page.locator('.gallery-turn')).toHaveText('蓝方回合');
  await fixture([p('rock','white',4,4),p('paper','black',0,0)],199);
  await play(4,4,3,4);await expect(page.locator('.gallery-turn')).toHaveText('本局和棋');await expect(page.locator('.gallery-moves')).toContainText('200 手未吃子');
  await page.unroute('**/gallery/intransitive/v1/project.json');
  console.log('PASS cyclic capture, protected opponent, immediate base victory and quiet-move draw in the sandbox');

  await open();await page.getByRole('button',{name:'与电脑对弈'}).click();await page.getByLabel('电脑难度').selectOption('easy');
  await page.getByRole('button',{name:'开始新的人机对局'}).click();
  await expect(page.locator('.custom-rule-panel')).toContainText('蓝方行动');await play(4,1,3,1);
  await expect(count).toHaveText('2');await expect(page.locator('.gallery-turn')).toHaveText('蓝方回合');
  await page.getByRole('button',{name:'悔棋',exact:true}).click();await expect(count).toHaveText('0');
  await page.getByRole('button',{name:'返回作品介绍'}).click();assert.equal(await draft(),original);
  await page.getByRole('button',{name:'与电脑对弈'}).click();await page.getByLabel('我执哪方').selectOption('black');await page.getByLabel('电脑难度').selectOption('easy');
  await page.getByRole('button',{name:'开始新的人机对局'}).click();await expect(count).toHaveText('1');await expect(page.locator('.gallery-turn')).toHaveText('红方回合');
  await page.getByRole('button',{name:'返回作品介绍'}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载作品'}).click();await (await download).saveAs('artifacts/intransitive-design.json');
  assert.deepEqual(JSON.parse(readFileSync('artifacts/intransitive-design.json','utf8')),project);
  await page.getByRole('button',{name:'复制到编辑器'}).click();await expect(page.locator('.project-breadcrumb strong')).toHaveText(project.name+' · 副本');
  await page.getByRole('button',{name:'开始试玩',exact:true}).click();await expect(page.locator('.custom-rule-panel')).toContainText('蓝方行动');
  await page.keyboard.press('f');await play(4,1,3,1);await expect(page.locator('.game-metrics > div:first-child strong')).toHaveText('1');
  await expect(cell(3,1)).toHaveAttribute('aria-label','b6 蓝方布');
  console.log('PASS local AI first/reply moves, grouped undo, draft preservation, download and copied/flipped editor gameplay');

  await page.getByRole('button',{name:'作品广场',exact:true}).click();await open();await start();
  await page.setViewportSize({width:390,height:844});await fits();await play(4,1,3,1);await expect(count).toHaveText('1');await screenshot('mobile');
  await page.getByRole('button',{name:'切换夜间模式'}).click();await fits();await screenshot('mobile-dark');
  await page.setViewportSize({width:1440,height:1000});await fits();await screenshot('desktop-dark');
  assert.deepEqual(errors,[]);console.log('PASS mobile gameplay, dark theme, no horizontal overflow or browser errors');
} finally {await browser.close();}
