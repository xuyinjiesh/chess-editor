import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateProject } from '../src/model.ts';
import { galleryCover } from '../src/gallery-cover.ts';
import { validateCatalog } from '../src/gallery-format.ts';

// Explicit maintenance command for the two curated games; never runs on build.
// Existing unrelated publications and older revisions are preserved.
const root = fileURLToPath(new URL('../', import.meta.url));
const miniSource = 'https://newchessbar.fandom.com/zh/wiki/%E8%BF%B7%E4%BD%A0%E6%B0%B8%E6%81%92%E6%A3%8B?variant=zh-sg';
const shockSource = 'https://www.bilibili.com/video/BV1ch4y1c7Kn/';
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
  {
    project: {...base,id:'mini-eternal',name:'迷你永恒棋',description:'日出333设计。车马炮争夺禁区，吃掉的棋子由行动方放回其所属半场。规则来源：'+miniSource+'。授权状态尚未核实。',board:board(7,6,'custom'),pieceTypes:[{id:'rook',name:'车',symbol:'車',shape:'xiangqi'},{id:'horse',name:'马',symbol:'馬',shape:'xiangqi'},{id:'cannon',name:'炮',symbol:'炮',shape:'xiangqi'},{id:'river-stone',name:'河中石',symbol:'◆',shape:'token',neutral:true}],pieces:miniPieces,regions:[{id:'red-zone',name:'红方禁区',tag:'red-forbidden',color:'#bc574d',cells:[{row:6,col:2},{row:6,col:3}]},{id:'blue-zone',name:'蓝方禁区',tag:'blue-forbidden',color:'#547ead',cells:[{row:0,col:2},{row:0,col:3}]},{id:'river',name:'河界',tag:'river',color:'#719a9b',cells:Array.from({length:6},(_,col)=>({row:3,col}))}],rules:{engine:'custom',firstTurn:'white',winLength:4,code:await readFile(resolve(root,'scripts/rules/mini-eternal.js'),'utf8')},ui:{...base.ui,sideLabels:{white:'红方',black:'蓝方'},sideColors:{white:'#a2392d',black:'#355f99'}}},
    entry: {id:'mini-eternal',revision:1,title:'迷你永恒棋',summary:'棋子不会轻易离场。调动车、马、炮，利用吃子与放回，抢先进入对方禁区。',author:'日出333 · 规则设计',tags:['吃子','布阵','策略'],publishedAt:'2026-10-12',instructions:'棋盘为 6 列 × 7 行，红方在下、蓝方在上，各有两车、两马、两炮；第 4 行的六枚河中石属于中立棋子，不能移动。\n开局双方依次布阵：在己方六个指定起始格内点击或拖动棋子互换位置，确认后红方先走。电脑采用预设布阵。\n车沿横竖线移动，不能越子；马走日字且不蹩腿；炮平走，吃子时必须隔一枚棋子。可以吃敌方、己方棋子和河中石。\n吃掉有色棋子后，仍由吃子方操作，把被吃棋子放在其所属半场的任一空位，再换对方走；河中石被吃后永久移除。红方半场为第 1–3 行，蓝方为第 5–7 行，河界不属于任何一方。\n红方禁区为 c1、d1，蓝方为 c7、d7。己方禁区内的己方棋子为守护者，任何一方都不能吃它；每方至多一名守护者。任一棋子进入对方禁区立即获胜。',credits:'规则设计：日出333。规则依据新棋吧 Wiki《迷你永恒棋》。'+rights,sources:[{label:'迷你永恒棋 · 原规则',url:miniSource}]},
  },
  {
    project: {...base,id:'shock-chess',name:'震棋',description:'黑先白后，落子击退周围八格棋子，连四获胜。参考 chess-room 及日出333视频：'+shockSource+'。原规则设计者与授权状态尚未核实。',board:board(10,10,'custom'),pieceTypes:[{id:'stone',name:'棋石',symbol:'●',shape:'stone'}],pieces:[],rules:{engine:'custom',firstTurn:'black',winLength:4,code:await readFile(resolve(root,'scripts/rules/shock.js'),'utf8')},ui:{...base.ui,showHints:false}},
    entry: {id:'shock-chess',revision:1,title:'震棋',summary:'每次落子都是一次冲击。把周围棋子向外震开，在不断变化的棋盘上连成四子。',author:'日出333 · 视频介绍',tags:['连珠','击退','策略'],publishedAt:'2026-10-12',instructions:'采用参考实现的 10 × 10 棋盘，黑方先手，双方轮流在空位放一枚己方棋子。\n新落子周围八格中的棋子，无论敌我，都沿远离新落子的方向同时退一格。目标格在击退前已有棋子时，受阻的棋子不动，不会连锁推动；退到棋盘外的棋子被移除。新落子自身不动。\n沿用参考版本的胜负顺序：新落子如果已形成横、竖或斜向连续至少四子，行动方立即获胜，不再击退；否则执行击退，再检查双方连线。击退后仅一方连四则该方获胜，双方同时连四则和棋；棋盘填满且无人连四也为和棋。',credits:'视频介绍：日出333（Bilibili）。原规则设计者待核实。本站提供独立数字化版本。'+rights,sources:[{label:'震棋 · 日出333的视频介绍',url:shockSource}]},
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
console.log('已更新迷你永恒棋、震棋的 v1 快照与来源署名。');
