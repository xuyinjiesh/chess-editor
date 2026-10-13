import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const url=process.env.GALLERY_TEST_URL || 'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{channel:'msedge'}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const project=JSON.parse(readFileSync('public/gallery/onitama/v1/project.json','utf8'));
const cell=(row,col)=>page.locator(`[role="grid"] [data-row="${row}"][data-col="${col}"]`);
const count=page.locator('.gallery-step-count strong');
const card=name=>page.getByRole('button',{name:`选择招式：${name}`,exact:false});
const draft=()=>page.evaluate(()=>localStorage.getItem('qijing-project-v1'));
async function fits(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');}
async function open(){await page.goto(url+'#/gallery/onitama/v1');await page.reload();await expect(page.getByRole('button',{name:'开始试玩',exact:true})).toBeEnabled();}
async function start(){await page.getByRole('button',{name:'开始试玩',exact:true}).click();await page.getByRole('button',{name:'抽取招式 · 开始对局'}).click();await expect(page.locator('.rule-card')).toHaveCount(5);}
async function screenshot(name){await page.screenshot({path:`artifacts/onitama-${name}.png`,fullPage:true,animations:'disabled'});}
async function fixture(pieces=project.pieces,hands={white:['tiger','dragon'],black:['frog','rabbit']},shared='crab') {
  const initial={pieces,hands,shared};
  const code=project.rules.code+`\nconst originalOnMove=onMove;onMove=function(state,move,project){if(!state.data.hands && move.action==='deal-cards'){const fixture=${JSON.stringify(initial)};return {valid:true,pieces:fixture.pieces,turn:'white',winner:null,data:{hands:fixture.hands,shared:fixture.shared},message:'测试发牌'};}return originalOnMove(state,move,project);};`;
  await page.route('**/gallery/onitama/v1/project.json',route=>route.fulfill({json:{...project,pieces,rules:{...project.rules,code}}}));
  await open();await start();
}
try {
  mkdirSync('artifacts',{recursive:true});
  await page.goto(url);await expect.poll(draft).toBeTruthy();const original=await draft();
  await page.getByRole('button',{name:'作品广场',exact:true}).click();
  await page.getByLabel('搜索作品').fill('Onitama');await expect(page.locator('.gallery-card')).toHaveCount(1);
  await page.getByRole('link',{name:'查看形意棋 · Onitama'}).click();
  await expect(page.getByRole('heading',{name:'形意棋 · Onitama',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Onitama · 官方规则书'})).toHaveAttribute('href',/arcanewonders/);
  await screenshot('detail');assert.equal(page.workers().length,0);await expect(page.locator('iframe')).toHaveCount(0);
  await start();await expect(page.locator('.rule-card button')).toHaveCount(0);
  await expect(page.locator('button.rule-card')).toHaveCount(2);await expect(count).toHaveText('1');
  const names=await page.locator('.rule-card-heading small').allTextContents();assert.equal(new Set(names).size,5);
  assert.equal(await draft(),original);await fits();
  console.log('PASS gallery discovery, attributed preview, real random dealing and draft preservation');

  await fixture();
  await card('虎').click();await expect(card('虎')).toHaveAttribute('aria-pressed','true');
  await cell(4,2).click();await expect(cell(2,2).locator('.move-hint')).toBeVisible();
  await card('龙').click();await expect(card('龙')).toHaveAttribute('aria-pressed','true');
  await expect(count).toHaveText('1');await expect(cell(2,2).locator('.move-hint')).toHaveCount(0);
  await expect(cell(3,0).locator('.move-hint')).toBeVisible();
  await cell(2,2).click();await expect(page.getByRole('alert')).toContainText('不符合');await expect(count).toHaveText('1');
  await card('虎').click();await cell(2,2).click();await expect(count).toHaveText('2');
  await expect(cell(2,2)).toHaveAttribute('aria-label','c3 红方师父');await expect(page.locator('.gallery-turn')).toHaveText('蓝方回合');
  await expect(card('蛙')).toBeVisible();await expect(page.locator('.rule-card.shared')).toContainText('Tiger');
  await card('蛙').click();await cell(0,0).click();await expect(cell(1,1).locator('.move-hint')).toBeVisible();await cell(1,1).click();
  await expect(count).toHaveText('3');await expect(page.locator('.rule-card.shared')).toContainText('Frog');
  await page.getByRole('button',{name:'悔棋',exact:true}).click();await expect(count).toHaveText('2');await expect(page.locator('.rule-card.shared')).toContainText('Tiger');
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(count).toHaveText('3');await expect(page.locator('.rule-card.shared')).toContainText('Frog');
  await screenshot('desktop');
  await page.getByRole('button',{name:'重新开始',exact:true}).click();await expect(count).toHaveText('0');await expect(page.locator('.rule-card')).toHaveCount(0);
  await page.getByRole('button',{name:'抽取招式 · 开始对局'}).click();await expect(card('虎')).toBeVisible();await card('虎').click();
  const from=await cell(4,2).boundingBox(),to=await cell(2,2).boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:10});await page.mouse.up();
  await expect(count).toHaveText('2');await expect(cell(2,2)).toHaveAttribute('aria-label','c3 红方师父');
  console.log('PASS card selection, filtered hints, rejected moves, both orientations, exchanges, undo/redo and dragging');

  const p=(type,side,row,col)=>({id:`${side}-${row}-${col}`,type,side,row,col});
  for(const type of ['student','master']) {
    await fixture([p(type,'white',2,2),...(type==='student'?[p('master','white',4,1)]:[]),p('master','black',type==='student'?0:1,type==='student'?2:4)]);
    await card('虎').click();await cell(2,2).click();await cell(0,2).click();
    await expect(page.locator('.gallery-turn')).toHaveText('红方获胜');await expect(page.locator('.rule-card')).toHaveCount(5);
    await expect(page.locator('.gallery-moves')).toContainText(type==='student'?'擒师获胜':'入庙获胜');
    await page.getByRole('button',{name:'悔棋',exact:true}).click();await expect(card('虎')).toBeEnabled();
  }
  await fixture([...Array.from({length:5},(_,col)=>p(col===0?'master':'student','white',0,col)),p('master','black',4,2)],{white:['crab','boar'],black:['tiger','dragon']},'monkey');
  await page.getByRole('button',{name:'停着换「蟹」'}).click();await expect(count).toHaveText('2');await expect(page.locator('.gallery-turn')).toHaveText('蓝方回合');
  await expect(page.locator('.rule-card.shared')).toContainText('Crab');
  await page.unroute('**/gallery/onitama/v1/project.json');
  console.log('PASS capture victory, temple victory, terminal cards and forced pass/exchange');

  await fixture();await page.getByRole('button',{name:'返回作品介绍'}).click();
  await page.getByRole('button',{name:'与电脑对弈'}).click();await page.getByLabel('电脑难度').selectOption('easy');
  await page.getByRole('button',{name:'开始新的人机对局'}).click();await page.getByRole('button',{name:'抽取招式 · 开始对局'}).click();
  await card('虎').click();await cell(4,2).click();await cell(2,2).click();await expect(count).toHaveText('3');
  await expect(page.locator('.gallery-turn')).toHaveText('红方回合');
  await page.getByRole('button',{name:'悔棋',exact:true}).click();await expect(count).toHaveText('1');await expect(card('虎')).toBeEnabled();
  await page.getByRole('button',{name:'返回作品介绍'}).click();assert.equal(await draft(),original);
  await page.unroute('**/gallery/onitama/v1/project.json');await open();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载作品'}).click();await (await download).saveAs('artifacts/onitama-design.json');
  assert.deepEqual(JSON.parse(readFileSync('artifacts/onitama-design.json','utf8')),project);
  await page.getByRole('button',{name:'复制到编辑器'}).click();await expect(page.locator('.project-breadcrumb strong')).toHaveText('形意棋 · Onitama · 副本');
  await page.getByRole('button',{name:'开始试玩',exact:true}).click();await page.getByRole('button',{name:'抽取招式 · 开始对局'}).click();
  await expect(page.locator('.rule-card')).toHaveCount(5);await expect(page.locator('button.rule-card')).toHaveCount(2);
  const diagram=page.locator('button.rule-card .rule-card-grid').first();
  const positions=()=>diagram.locator('i').evaluateAll(nodes=>nodes.flatMap((n,i)=>n.classList.contains('destination')?[i]:[]));
  const before=await positions();await page.keyboard.press('f');assert.deepEqual((await positions()).sort((a,b)=>a-b),before.map(i=>24-i).sort((a,b)=>a-b));
  await page.keyboard.press('f');
  // Select a current-side piece using the colored hand's tone, then follow a visible hint.
  const red=await page.locator('button.rule-card.white').count();
  for(const col of [2,0,1,3,4]) {
    await cell(red?4:0,col).click();const hint=page.locator('[role="gridcell"]').filter({has:page.locator('.move-hint')}).first();
    if(await hint.count()){await hint.click();break;}
  }
  await expect(page.locator('.game-metrics > div:first-child strong')).toHaveText('2');
  console.log('PASS local AI reply, grouped undo, download, copied editor gameplay and flipped card diagrams');

  await page.getByRole('button',{name:'作品广场',exact:true}).click();await open();await start();
  await page.setViewportSize({width:390,height:844});await fits();await screenshot('mobile');
  await page.getByRole('button',{name:'切换夜间模式'}).click();await fits();await screenshot('mobile-dark');
  await page.setViewportSize({width:1440,height:1000});await fits();await screenshot('desktop-dark');
  assert.deepEqual(errors,[]);console.log('PASS mobile, dark theme, no horizontal overflow or browser errors');
} finally {await browser.close();}
