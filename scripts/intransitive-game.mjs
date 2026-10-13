import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function intransitiveGame(root) {
  const video = 'https://www.youtube.com/watch?v=LO_zcGNJriA';
  const reference = 'https://meaf.us/rps2/';
  const blue = {rock:['b4','c3','d2'],paper:['b5','c4','d3','e2'],scissors:['c5','d4','e3']};
  const pieces = [];
  for (const [type,squares] of Object.entries(blue)) for (const square of squares) {
    const row = 9-Number(square[1]), col = square.charCodeAt(0)-97;
    pieces.push({id:'blue-'+square,type,side:'white',row,col});
    // The reference setup reflects across a1–i9, not a 180-degree rotation.
    pieces.push({id:'red-'+square,type,side:'black',row:col,col:row});
  }
  const title = '石头剪刀布棋 · Intransitive';
  const rights = '本页为独立数字化实现，棋盘与棋子由本站代码绘制。名称及原始资料的权利归原权利人所有；公开授权状态尚未核实，来源署名不代表已获得授权。';
  return {
    project:{
      version:1,id:'intransitive',name:title,
      description:'webgoatguy 设计的 Intransitive（Rock Paper Scissors 2）。石、布、剪彼此克制，八向一步，抢先攻入对角的敌方基地。视频：'+video+'；视频所附参考网站：'+reference+'。授权状态尚未核实。',
      board:{rows:9,cols:9,pattern:'cells',light:'#eee5d3',dark:'#ddd2bd',coordinates:true,theme:'custom'},
      pieceTypes:[{id:'rock',name:'石头',symbol:'石',shape:'token'},{id:'paper',name:'布',symbol:'布',shape:'token'},{id:'scissors',name:'剪刀',symbol:'剪',shape:'token'}],pieces,
      regions:[{id:'blue-base',name:'蓝方基地 · a1',tag:'blue-base',color:'#426fa4',cells:[{row:8,col:0}]},{id:'red-base',name:'红方基地 · i9',tag:'red-base',color:'#b84d46',cells:[{row:0,col:8}]}],
      rules:{engine:'custom',firstTurn:'white',winLength:4,code:await readFile(resolve(root,'scripts/rules/intransitive.js'),'utf8')},
      ui:{accent:'#426fa4',showHints:true,showHistory:true,sideLabels:{white:'蓝方',black:'红方'},sideColors:{white:'#355f99',black:'#a2392d'}},
    },
    entry:{
      id:'intransitive',revision:1,title,
      summary:'把石头剪刀布变成一场公开的阵地战。三种棋子相互克制，八向一步，突破防线、攻入敌方基地。',
      author:'webgoatguy · 规则设计',tags:['相克','吃子','占领','策略'],publishedAt:'2026-10-13',
      instructions:'棋盘为 9 × 9。蓝方位于左下、红方位于右上；双方各有 3 枚石头、4 枚布、3 枚剪刀，采用视频所附网站的固定开局。蓝方先手。\n每回合选择一枚己方棋子，横、竖或斜向移动一格；三种棋子的移动方式相同，不能跳跃、原地停着或进入己方棋子所在格。支持点击和拖动，选中后会显示合法落点。\n石头吃剪刀，剪刀吃布，布吃石头。移动到被自己克制的敌子格即可吃子；同类不能互吃，也不能吃克制自己的敌子。所有身份公开，没有随机猜拳、同时出手或变身。\n蓝方基地为左下 a1，红方基地为右上 i9。任意己子进入敌方基地立即获胜，即使落点受敌方攻击；进入己方基地可以防守，但不算获胜。吃光对方棋子或使对方无合法走法也获胜。\n沿用视频所附网站电脑对弈版的补充规则：连续 200 手（双方各走一次为两手，共 100 回合）未吃子则和棋，吃子后计数归零；基地、全歼和困毙胜利优先判定。\n支持本机双人、三档本地 AI、悔棋与重做、下载和复制到编辑器改编。',
      credits:'规则设计与视频：webgoatguy《I Reinvented Rock Paper Scissors》。参考网站：Meaf 制作的 Intransitive / RPS2；初始阵型、移动与吃子规则、基地胜利及电脑对弈终局规则依据该网站核对。'+rights,
      sources:[{label:'原视频 · I Reinvented Rock Paper Scissors',url:video},{label:'Intransitive · 视频所附试玩网站（Meaf）',url:reference}],
    },
  };
}
