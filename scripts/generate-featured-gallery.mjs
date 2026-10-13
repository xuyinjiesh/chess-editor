import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateProject } from '../src/model.ts';
import { galleryCover } from '../src/gallery-cover.ts';
import { validateCatalog } from '../src/gallery-format.ts';
import { originalGames } from './original-games.mjs';
import { incidentGame } from './incident-game.mjs';

// Explicit maintenance command for curated games; never runs on build.
// Existing unrelated publications and older revisions are preserved.
const root = fileURLToPath(new URL('../', import.meta.url));
const miniSource = 'https://newchessbar.fandom.com/zh/wiki/%E8%BF%B7%E4%BD%A0%E6%B0%B8%E6%81%92%E6%A3%8B?variant=zh-sg';
const shockSource = 'https://www.bilibili.com/video/BV1ch4y1c7Kn/';
const onitamaSource = 'https://www.arcanewonders.com/wp-content/uploads/2021/05/Onitama-Rulebook.pdf';
const rights = '本页为独立数字化实现。规则、名称及原始资料的权利归属以原权利人声明为准；公开授权状态尚未核实。来源署名不代表已获得授权。';
const board = (rows,cols,theme) => ({rows,cols,pattern:'grid',light:'#e8d7b6',dark:'#dcc6a0',coordinates:true,theme});
const base = {version:1,regions:[],ui:{accent:'#537a61',showHints:true,showHistory:true}};
const miniPieces = [];
for (const side of ['white','black']) {
  const positions = side === 'white' ? [[6,1],[5,0],[5,1],[6,4],[5,4],[5,5]] : [[0,1],[1,0],[1,1],[0,4],[1,4],[1,5]];
  positions.forEach(([row,col],i) => miniPieces.push({id:side+'-'+i,type:['rook','horse','cannon'][i%3],side,row,col}));
}
for (let col=0;col<6;col++) miniPieces.push({id:'river-'+col,type:'river-stone',side:'black',row:3,col});
const games = [
  await incidentGame(root),
  ...await originalGames(root),
  {
    project: {...base,id:'mini-eternal',name:'迷你永恒棋',description:'日出333设计。车马炮争夺禁区，吃掉的棋子由行动方放回其所属半场。规则来源：'+miniSource+'。授权状态尚未核实。',board:board(7,6,'custom'),pieceTypes:[{id:'rook',name:'车',symbol:'車',shape:'xiangqi'},{id:'horse',name:'马',symbol:'馬',shape:'xiangqi'},{id:'cannon',name:'炮',symbol:'炮',shape:'xiangqi'},{id:'river-stone',name:'河中石',symbol:'◆',shape:'token',neutral:true}],pieces:miniPieces,regions:[{id:'red-zone',name:'红方禁区',tag:'red-forbidden',color:'#bc574d',cells:[{row:6,col:2},{row:6,col:3}]},{id:'blue-zone',name:'蓝方禁区',tag:'blue-forbidden',color:'#547ead',cells:[{row:0,col:2},{row:0,col:3}]},{id:'river',name:'河界',tag:'river',color:'#719a9b',cells:Array.from({length:6},(_,col)=>({row:3,col}))}],rules:{engine:'custom',firstTurn:'white',winLength:4,code:await readFile(resolve(root,'scripts/rules/mini-eternal.js'),'utf8')},ui:{...base.ui,sideLabels:{white:'红方',black:'蓝方'},sideColors:{white:'#a2392d',black:'#355f99'}}},
    entry: {id:'mini-eternal',revision:1,title:'迷你永恒棋',summary:'棋子不会轻易离场。调动车、马、炮，利用吃子与放回，抢先进入对方禁区。',author:'日出333 · 规则设计',tags:['吃子','布阵','策略'],publishedAt:'2026-10-12',instructions:'棋盘为 6 列 × 7 行，红方在下、蓝方在上，各有两车、两马、两炮；第 4 行的六枚河中石属于中立棋子，不能移动。\n开局双方依次布阵：在己方六个指定起始格内点击或拖动棋子互换位置，确认后红方先走。电脑采用预设布阵。\n车沿横竖线移动，不能越子；马走日字且不蹩腿；炮平走，吃子时必须隔一枚棋子。可以吃敌方、己方棋子和河中石。\n吃掉有色棋子后，仍由吃子方操作，把被吃棋子放在其所属半场的任一空位，再换对方走；河中石被吃后永久移除。红方半场为第 1–3 行，蓝方为第 5–7 行，河界不属于任何一方。\n红方禁区为 c1、d1，蓝方为 c7、d7。己方禁区内的己方棋子为守护者，任何一方都不能吃它；每方至多一名守护者。任一棋子进入对方禁区立即获胜。',credits:'规则设计：日出333。规则依据新棋吧 Wiki《迷你永恒棋》。'+rights,sources:[{label:'迷你永恒棋 · 原规则',url:miniSource}]},
  },
  {
    project: {...base,id:'shock-chess',name:'震棋',description:'黑先白后，落子击退周围八格棋子，连四获胜。参考 chess-room 及日出333视频：'+shockSource+'。原规则设计者与授权状态尚未核实。',board:board(10,10,'custom'),pieceTypes:[{id:'stone',name:'棋石',symbol:'●',shape:'stone'}],pieces:[],rules:{engine:'custom',firstTurn:'black',winLength:4,code:await readFile(resolve(root,'scripts/rules/shock.js'),'utf8')},ui:{...base.ui,showHints:false}},
    entry: {id:'shock-chess',revision:1,title:'震棋',summary:'每次落子都是一次冲击。把周围棋子向外震开，在不断变化的棋盘上连成四子。',author:'日出333 · 视频介绍',tags:['连珠','击退','策略'],publishedAt:'2026-10-12',instructions:'采用参考实现的 10 × 10 棋盘，黑方先手，双方轮流在空位放一枚己方棋子。\n新落子周围八格中的棋子，无论敌我，都沿远离新落子的方向同时退一格。目标格在击退前已有棋子时，受阻的棋子不动，不会连锁推动；退到棋盘外的棋子被移除。新落子自身不动。\n沿用参考版本的胜负顺序：新落子如果已形成横、竖或斜向连续至少四子，行动方立即获胜，不再击退；否则执行击退，再检查双方连线。击退后仅一方连四则该方获胜，双方同时连四则和棋；棋盘填满且无人连四也为和棋。',credits:'视频介绍：日出333（Bilibili）。原规则设计者待核实。本站提供独立数字化版本。'+rights,sources:[{label:'震棋 · 日出333的视频介绍',url:shockSource}]},
  },
  {
    project: {...base,id:'onitama',name:'形意棋 · Onitama',description:'Shimpei Sato 设计的双人招式棋。每方一位师父、四位弟子，五张招式在双方之间流转；擒师或师父入敌庙获胜。规则来源：'+onitamaSource,board:{...board(5,5,'custom'),pattern:'cells',light:'#efe3c9',dark:'#dfccaa'},pieceTypes:[{id:'master',name:'师父',symbol:'师',shape:'token'},{id:'student',name:'弟子',symbol:'徒',shape:'token'}],pieces:['white','black'].flatMap(side=>Array.from({length:5},(_,col)=>({id:side+'-'+col,type:col===2?'master':'student',side,row:side==='white'?4:0,col}))),regions:[{id:'red-temple',name:'红方庙门',tag:'red-temple',color:'#bc574d',cells:[{row:4,col:2}]},{id:'blue-temple',name:'蓝方庙门',tag:'blue-temple',color:'#547ead',cells:[{row:0,col:2}]}],rules:{engine:'custom',firstTurn:'white',winLength:4,code:await readFile(resolve(root,'scripts/rules/onitama.js'),'utf8')},ui:{...base.ui,sideLabels:{white:'红方',black:'蓝方'},sideColors:{white:'#a2392d',black:'#355f99'}}},
    entry: {id:'onitama',revision:1,title:'形意棋 · Onitama',summary:'一位师父，四位弟子，五张流转的招式。借虎跃、龙腾与鹤步，擒获对方师父，或率师父踏入敌方庙门。',author:'Shimpei Sato · 规则设计',tags:['招式卡','吃子','策略'],publishedAt:'2026-10-13',instructions:'棋盘为 5 × 5。红方在下、蓝方在上，各有一位师父和四位弟子，师父位于己方底线中央的庙门。\n进入试玩后，点击「抽取招式 · 开始对局」，从基础版 16 张招式卡中随机抽取五张：双方各持两张，中间一张待换。待换卡的红／蓝印记决定先手；印记不限制谁能使用这张卡。\n每回合先选择己方招式卡，再点击或拖动一枚师父或弟子至该卡允许的位置。图中的圆点是起点，色块是可达位置；所有图示都已按棋盘方向绘制，蓝方走法相对红方旋转 180°。选择卡片不消耗回合。\n棋子可以越过任何棋子，但不能落在棋盘外或己方棋子上。落到敌子位置即吃掉该子。走完后自动将使用的招式与中间待换卡交换，再由对方行动；五张卡始终公开。\n擒师：任意己子吃掉敌方师父，立即获胜。入庙：己方师父走入敌方庙门（红方目标 c5，蓝方目标 c1），立即获胜；弟子入庙不获胜。没有将军或自将保护，允许师父进入受攻击的位置。\n只要两张手牌中还有合法走法，就必须走子；两张都无合法走法时，必须选择一张卡停着换牌。支持本机双人、电脑对弈、悔棋与重做；重新开始后可重新抽取招式。',credits:'规则设计：Shimpei Sato。原版发行：Arcane Wonders。规则依据基础版官方规则书；棋盘、棋子与招式示意图为本站代码绘制。Onitama 名称及原始作品权利归原权利人所有。'+rights,sources:[{label:'Onitama · 官方规则书',url:onitamaSource},{label:'Onitama · Arcane Wonders',url:'https://www.arcanewonders.com/eu/product/onitama/'}]},
  },
];
const catalogPath = resolve(root,'public/gallery/index.json');
const current = JSON.parse(await readFile(catalogPath,'utf8'));
const replaced = new Set(['nine-four','mini-reversi','adjacent-duel',...games.map(g=>g.entry.id)]);
const entries = [...current.entries.filter(e => !replaced.has(e.id) || (!['nine-four','mini-reversi','adjacent-duel'].includes(e.id) && e.revision !== 1)),...games.map(g => g.entry)];
for (const game of games) {
  const project = validateProject(game.project), folder = resolve(root,'public/gallery',game.entry.id,'v1');
  await mkdir(folder,{recursive:true});
  await writeFile(resolve(folder,'project.json'),JSON.stringify(project,null,2)+'\n');
  await writeFile(resolve(folder,'cover.svg'),galleryCover(project));
}
await writeFile(catalogPath,JSON.stringify(validateCatalog({...current,entries}),null,2)+'\n');
console.log('已更新异变象棋、足球棋、角斗棋、迷你永恒棋、震棋、形意棋的 v1 快照与署名。');
