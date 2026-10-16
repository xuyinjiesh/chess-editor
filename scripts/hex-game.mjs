import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function hexGame(root) {
  const n=11, red='#b94c47', blue='#367ba8';
  const source='https://zh.wikipedia.org/wiki/%E5%85%AD%E8%B2%AB%E6%A3%8B';
  const guide='https://www.mseymour.ca/hex_book/hexstrat0.html';
  return {
    project: {
      version:1,id:'hex',name:'六贯棋 · Hex',
      description:'在菱形蜂巢棋盘上，用相邻的同色棋子连通两条对边。红方连上下红边，蓝方连左右蓝边；路径可以转弯。含第二手交换首子规则。',
      board:{rows:n,cols:n,pattern:'hex',hexLayout:'rhombus',light:'#eee7d6',dark:'#eee7d6',coordinates:true,theme:'custom'},
      pieceTypes:[{id:'stone',name:'棋石',symbol:'●',shape:'stone'}],pieces:[],
      regions:['top','bottom','left','right'].map(edge=>({id:'hex-'+edge,tag:'hex-edge-'+edge,name:{top:'红方 · 上边',bottom:'红方 · 下边',left:'蓝方 · 左边',right:'蓝方 · 右边'}[edge],color:['top','bottom'].includes(edge)?red:blue,cells:Array.from({length:n},(_,i)=>({row:edge==='top'?0:edge==='bottom'?n-1:i,col:edge==='left'?0:edge==='right'?n-1:i}))})),
      rules:{engine:'custom',firstTurn:'white',winLength:3,code:await readFile(resolve(root,'scripts/rules/hex.js'),'utf8')},
      ui:{accent:'#a45143',showHints:false,showHistory:true,sideLabels:{white:'红方',black:'蓝方'},sideColors:{white:red,black:blue}},
    },
    entry:{id:'hex',revision:1,title:'六贯棋 · Hex',summary:'红连上下，蓝连左右。在真正的蜂巢棋盘上架桥、阻挡，抢先贯通两条对边。',author:'Piet Hein / John Nash · 规则设计',tags:['连接','六边形','策略'],publishedAt:'2026-10-16',
      instructions:'采用 11 × 11 菱形蜂巢棋盘，红方先手。红方连接上下两条红边，蓝方连接左右两条蓝边，四个角格各属于两条边。\n双方轮流在任一空格放一枚己方棋石。棋子沿六条共边方向相邻，落定后不能移动或吃子。率先以同色棋子连通己方两条对边者获胜，路径可以任意转弯，不要求直线或固定枚数。六贯棋没有和棋；获胜路径以「连」标出。\n交换首子：仅在红方落下第一枚棋子后，蓝方可以正常落子，或点击「交换首子」。本实现保留双方红蓝身份，把首子改为蓝色并交换其内部行列位置，随后轮到红方。这与交换双方颜色的规则等价；选择正常落子后不能再交换。棋盘坐标沿用工坊的从下往上编号，翻转仅改变观看方向。\n支持本机双人、电脑对弈、悔棋、重做与重新开始。可复制到工坊，保持菱形布局并将行列改为相同数值（3–24）来调整棋盘大小。',
      credits:'六贯棋由 Piet Hein 与 John Nash 独立提出。依据中文维基百科介绍与 Matthew Seymour《Hex: A Strategy Guide》的规则、交换首子说明独立编写；棋盘与棋石由代码绘制。',
      sources:[{label:'六贯棋 · 中文维基百科',url:source},{label:'Matthew Seymour · Hex 规则与交换首子',url:guide}]},
  };
}
