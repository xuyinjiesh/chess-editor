import { chromium, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const url=process.env.GALLERY_TEST_URL || 'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{channel:'msedge'}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const cell=(r,c)=>page.locator(`[role="gridcell"][data-row="${r}"][data-col="${c}"]`);
async function fits(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page has no horizontal overflow');}
async function placement(flipped=false,mobile=false) {
  const table=page.getByLabel('棋盘与手牌区'),board=await table.locator('.board-frame').boundingBox();
  const top=await table.locator('[data-zone-position="top"]').boundingBox(),bottom=await table.locator('[data-zone-position="bottom"]').boundingBox(),shared=await table.locator('[data-zone-position="shared"]').boundingBox();
  assert.ok(top.y+top.height<=board.y+1,'top hand is above the board');
  assert.ok(bottom.y>=board.y+board.height-1,'bottom hand is below the board');
  if(mobile) assert.ok(shared.y>=board.y+board.height-1,'shared zone moves below board on mobile');
  else assert.ok(shared.x>=board.x+board.width-1,'shared zone sits beside board');
  await expect(table.locator('[data-zone-position="top"] .game-zone').first()).toHaveAttribute('data-zone-owner',flipped?'white':'black');
  await expect(table.locator('[data-zone-position="bottom"] .game-zone').first()).toHaveAttribute('data-zone-owner',flipped?'black':'white');
  await expect(page.locator('.gallery-play-info .game-zone')).toHaveCount(0);
}
try {
  mkdirSync('artifacts',{recursive:true});
  await page.goto(url+'#/gallery/onitama/v1');await page.getByRole('button',{name:'开始试玩',exact:true}).click();
  await page.getByRole('button',{name:'抽取招式 · 开始对局'}).click();await expect(page.locator('.rule-card')).toHaveCount(5);
  await placement();await fits();
  await page.screenshot({path:'artifacts/game-zones-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await placement(false,true);await fits();
  await page.screenshot({path:'artifacts/game-zones-mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'切换夜间模式'}).click();await fits();
  await page.screenshot({path:'artifacts/game-zones-mobile-dark.png',fullPage:true,animations:'disabled'});

  // A different game uses counted reserves, text cards and two shared zones.
  // Delayed views also verify that board layout survives async rule updates.
  const base=JSON.parse(readFileSync('public/gallery/onitama/v1/project.json','utf8'));
  const code=`
    function getGameView(state) {
      const remaining=state.data.remaining??2;
      return new Promise(resolve=>setTimeout(()=>resolve({interaction:'move',zones:[
        {id:'enemy',label:'对方备用区',owner:'black',items:[{id:'enemy',label:'卒',symbol:'卒',count:3,action:'enemy-reserve',interaction:'place'}]},
        {id:'reserve',label:'己方备用区',owner:'white',items:[{id:'horse',label:'马',symbol:'马',count:remaining,action:'deploy-horse',interaction:'place'},...Array.from({length:18},(_,i)=>({id:'card-'+i,label:'卡片 '+(i+1),description:i===0?'普通文字卡牌，无走法图。':undefined}))]},
        {id:'deck',label:'牌库',owner:'shared',items:[{id:'stack',label:'牌库',count:24}]},
        {id:'discard',label:'弃牌堆',owner:'shared',items:[],emptyLabel:'尚未弃牌'}
      ]}),200));
    }
    function getLegalMoves(state) { const moves=[];if((state.data.remaining??2)>0)for(let row=0;row<5;row++)for(let col=0;col<5;col++)if(!state.pieces.some(p=>p.row===row&&p.col===col))moves.push({action:'deploy-horse',to:{row,col}});return moves; }
    function onMove(state,move) {
      if(!getLegalMoves(state).some(m=>m.action===move.action&&m.to.row===move.to.row&&m.to.col===move.to.col)||move.from)return {valid:false,message:'无效放置'};
      return {valid:true,pieces:[...state.pieces,{id:'piece-'+state.pieces.length,type:'horse',side:'white',...move.to}],turn:'white',winner:null,data:{remaining:(state.data.remaining??2)-1}};
    }
    function evaluate(){return 0;}
  `;
  const fixture={...base,id:'general-reserves',name:'通用手牌演示',description:'备用棋子、文字卡牌、牌库和弃牌堆。',pieces:[],regions:[],pieceTypes:[{id:'horse',name:'马',symbol:'马',shape:'token'}],rules:{...base.rules,code}};
  await page.evaluate(p=>localStorage.setItem('qijing-project-v1',JSON.stringify(p)),fixture);
  await page.setViewportSize({width:1440,height:1000});await page.goto(url);await page.reload();
  await page.getByRole('button',{name:'开始试玩',exact:true}).click();
  const reserve=page.getByRole('button',{name:'选择项目：马',exact:true});
  await expect(reserve).toBeEnabled();await expect(reserve).toContainText('×2');
  await expect(page.getByRole('button',{name:'选择项目：卒',exact:true})).toBeDisabled();
  await expect(page.getByText('尚未弃牌')).toBeVisible();
  await fits();await placement();
  const itemRow=page.locator('[data-zone-id="reserve"] .game-zone-items');
  assert.ok(await itemRow.evaluate(el=>el.scrollWidth>el.clientWidth),'many cards scroll within their zone');
  await reserve.click();await expect(cell(2,2).locator('.move-hint')).toBeVisible();await cell(2,2).click();
  await expect(cell(2,2)).toHaveAttribute('aria-label','c3 红方马');
  await expect(page.getByLabel('棋盘与手牌区')).toBeVisible();
  await expect(reserve).toContainText('×1');await expect(reserve).toBeEnabled();
  await cell(2,3).click();await expect(reserve).toContainText('×0');await expect(reserve).toBeDisabled();
  await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(reserve).toContainText('×1');await expect(reserve).toBeEnabled();
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(reserve).toContainText('×0');
  await page.getByRole('button',{name:'翻转棋盘',exact:true}).click();await placement(true);await fits();
  await page.screenshot({path:'artifacts/game-zones-editor.png',animations:'disabled'});
  await page.getByRole('button',{name:'放大试玩棋盘',exact:true}).click();await placement(true);await fits();
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await placement(true,true);await fits();
  await page.screenshot({path:'artifacts/game-zones-editor-mobile.png',fullPage:true,animations:'disabled'});
  assert.deepEqual(errors,[]);
  console.log('PASS owned/shared positions, mobile layout, counted reserve placement, disabled items, empty zones, overflow, undo/redo, board flip and focus mode');
} finally {await browser.close();}
