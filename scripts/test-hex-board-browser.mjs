import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const url=process.env.HEX_TEST_URL||'http://127.0.0.1:4186/';
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{channel:'msedge'}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(10000);
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const code=readFileSync('src/templates.ts','utf8').match(/export const CUSTOM_CODE = `([\s\S]*?)`;/)[1];
const fixture={version:1,id:'hex-test',name:'蜂巢棋盘',description:'六个方向，连续地形。',board:{rows:7,cols:7,pattern:'hex',light:'#eaf2ec',dark:'#d5e5db',coordinates:true,theme:'jade'},pieceTypes:[{id:'token',name:'棋子',symbol:'棋',shape:'token'}],pieces:[{id:'white-token',type:'token',side:'white',row:2,col:3},{id:'black-token',type:'token',side:'black',row:5,col:6}],regions:[{id:'river',name:'河流',tag:'river',color:'#459aab',cells:[{row:4,col:0},{row:4,col:1},{row:3,col:1},{row:3,col:2}]},{id:'blocked',name:'禁区',tag:'blocked',color:'#af7048',cells:[{row:0,col:1},{row:1,col:1}]}],rules:{engine:'custom',code:code+'\nfunction getGameView(){return {message:"蜂巢 · "+boardTopology.directionCount+" 个方向"}}',winLength:4,firstTurn:'white'},ui:{accent:'#2f6b63',showHints:true,showHistory:true}};
const grid=page.locator('[role="grid"]'), count=page.locator('.game-metrics > div:first-child strong');
const cell=(row,col)=>grid.locator(`[data-row="${row}"][data-col="${col}"]`);
const token=id=>page.locator(`[data-piece-id="${id}"]`);
async function rect(locator){const b=await locator.boundingBox();assert.ok(b);return b;}
async function ready(){await expect(grid).not.toHaveAttribute('aria-busy','true');}
async function aligned(id,row,col){await expect.poll(async()=>{const a=await rect(token(id)),b=await rect(cell(row,col));return Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2)}).toBeLessThan(.6);}
async function drag(id,to){const a=await rect(token(id)),b=await rect(to);await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();}
async function load(p=fixture){await page.goto(url);await page.evaluate(p=>localStorage.setItem('qijing-project-v1',JSON.stringify(p)),p);await page.reload();await expect(grid).toHaveClass(/pattern-hex/);}
async function screenshot(name){await page.screenshot({path:`artifacts/hex-${name}.png`,fullPage:true,animations:'disabled'});}
try {
  mkdirSync('artifacts',{recursive:true});
  await page.goto(url);
  await page.getByRole('button',{name:'六边形',exact:true}).click();
  await expect(grid).toHaveClass(/pattern-hex/);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('qijing-project-v1')||'null')?.rules.engine)).toBe('custom');
  console.log('PASS switching standard chess to honeycomb selects custom rules');

  for(const rows of [6,7]) {
    const p=structuredClone(fixture);p.board.rows=rows;await load(p);
    const a=await rect(cell(0,0)),b=await rect(cell(1,0));
    assert.ok(Math.abs(a.height/a.width-2/Math.sqrt(3))<.003,'regular hexagon proportions');
    assert.ok(Math.abs(b.x-a.x-a.width/2)<.6,'odd row shifts half a cell');
    assert.ok(Math.abs(b.y-a.y-a.height*.75)<.6,'rows share sloped edges');
    await aligned('white-token',2,3);
    for(const flipped of [false,true]) {
      if(flipped)await page.keyboard.press('f');
      await aligned('white-token',2,3);
      await drag('white-token',cell(1,2)); await aligned('white-token',1,2);
      await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('qijing-project-v1')).pieces.find(p=>p.id==='white-token').row)).toBe(1);
      const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('qijing-project-v1')).pieces);
      const source=await rect(token('white-token')),surface=await rect(grid);
      await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();
      // This point is in the rectangular bounding box, but outside every hex.
      await page.mouse.move(flipped?surface.x+surface.width-1:surface.x+1,flipped?surface.y+surface.height-1:surface.y+1,{steps:12});await page.mouse.up();
      await aligned('white-token',1,2);
      assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('qijing-project-v1')).pieces),before);
      await drag('white-token',cell(2,3));await aligned('white-token',2,3);
    }
  }
  console.log('PASS exact drag targets, board gaps, odd/even heights and 180-degree flipping');

  await load(); await page.getByRole('button',{name:'开始试玩',exact:true}).click();await ready();
  await expect(page.getByText('蜂巢 · 6 个方向',{exact:true})).toBeVisible();
  await cell(2,3).click();await expect(grid.locator('.move-hint')).toHaveCount(6);
  await cell(3,4).click();await expect(page.getByText('只能移动一格',{exact:true})).toBeVisible();await expect(count).toHaveText('0');
  // The top-left of this bounding box belongs to its upper-left neighbor.
  const a=await rect(cell(2,3));await page.mouse.click(a.x+2,a.y+2);
  await expect(count).toHaveText('1');await ready();await aligned('white-token',1,2);
  await drag('black-token',cell(4,6));await expect(count).toHaveText('2');await ready();
  await page.keyboard.press('f');await aligned('white-token',1,2);
  await drag('white-token',cell(2,3));await expect(count).toHaveText('3');await ready();
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(count).toHaveText('2');await ready();await aligned('white-token',1,2);
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(count).toHaveText('3');await ready();await aligned('white-token',2,3);
  await page.keyboard.press('f');await cell(4,6).click();
  if(await page.getByLabel('关闭提示').isVisible())await page.getByLabel('关闭提示').click();
  await screenshot('desktop');
  console.log('PASS production rule worker, custom view, six legal hints, clipped clicks, moves, undo and redo');

  await load();await page.getByRole('button',{name:'开始试玩',exact:true}).click();await ready();
  await cell(2,3).click();await cell(1,2).click();await expect(count).toHaveText('1');await ready();
  await cell(5,6).click();await cell(4,6).click();await expect(count).toHaveText('2');await ready();
  await cell(1,2).click();await cell(1,1).click();await expect(page.getByText('不能进入禁区',{exact:true})).toBeVisible();await expect(count).toHaveText('2');
  await expect(cell(1,1).locator('.move-hint')).toHaveCount(0);
  console.log('PASS painted blocked terrain uses real hex cells');

  await load();await page.getByRole('button',{name:'人机对弈',exact:true}).click();
  await page.getByLabel('对弈方式').selectOption('human');await page.getByLabel('我执哪方').selectOption('black');await page.getByLabel('电脑难度').selectOption('easy');
  await page.getByRole('button',{name:'开始新的人机对局'}).click();await expect(count).toHaveText('1');await ready();
  await expect(page.locator('.bot-status [role="alert"]')).toHaveCount(0);await expect(page.locator('iframe')).toHaveCount(0);
  console.log('PASS production AI worker shares topology and leaves no sandbox behind');

  await load();await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await aligned('white-token',2,3);await drag('white-token',cell(3,3));await aligned('white-token',3,3);
  await screenshot('mobile');await page.keyboard.press('d');await screenshot('mobile-dark');
  await page.keyboard.press('f');await aligned('white-token',3,3);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('PASS mobile sizing, dark theme, drag, flip and no application errors');
} finally {await browser.close();}
