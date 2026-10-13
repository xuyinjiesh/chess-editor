import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function incidentGame(root) {
  const parts=['core-position','core-piece','ability','pieces','state','engine','adapter'];
  const code=(await Promise.all(parts.map(name=>readFile(resolve(root,`scripts/rules/incident-chess/${name}.js`),'utf8')))).join('\n');
  const {kinds,skills,descriptions}=new Function(code+'\nreturn {kinds:IncidentChessPieceKinds,skills:ALL_SKILLS,descriptions:SKILL_DESCRIPTIONS};')();
  const glyphs={'车':'車','马':'馬','炮':'炮','相':'相','士':'仕','将':'帥','兵':'兵','虚·初始棋子':'虚子','车·原型':'原型车','原型·炮':'原型炮','骠骑将军':'骠骑将','傀儡·兵':'傀儡兵','皮影·猴':'皮影猴'};
  const blacks={'将':'將','士':'士','相':'象','兵':'卒','炮':'砲'};
  const pieces=[];
  for (const side of ['white','black']) {
    const row=side === 'white' ? 9 : 0;
    ['车','马','相','士','将','士','相','马','车'].forEach((type,col)=>pieces.push({id:`${side}-back-${col}`,type,side,row,col}));
    for (const col of [1,7]) pieces.push({id:`${side}-cannon-${col}`,type:'炮',side,row:side === 'white' ? 7 : 2,col});
    for (const col of [0,2,4,6,8]) pieces.push({id:`${side}-pawn-${col}`,type:'兵',side,row:side === 'white' ? 6 : 3,col});
  }
  return {
    project:{version:1,id:'incident-chess',name:'异变象棋',description:`xuyinjie 原创。每次行动后从三个技能中选择一个，${skills.length} 种瞬发、锦囊与持续技能让棋局不断变化。炮车异变、良驹合体、战功晋升、傀儡与将帅复活。广场采用公开幻子身份的沙盘规则。`,
      board:{rows:10,cols:9,pattern:'xiangqi',light:'#eadfc8',dark:'#d9c7a6',coordinates:true,theme:'custom'},
      pieceTypes:kinds.map(id=>({id,name:id,symbol:glyphs[id] || id,...(blacks[id] ? {blackSymbol:blacks[id]} : {}),shape:'xiangqi'})),pieces,regions:[],
      rules:{engine:'custom',firstTurn:'white',winLength:4,code},ui:{accent:'#856047',showHints:true,showHistory:true,sideLabels:{white:'红方',black:'黑方'},sideColors:{white:'#a2392d',black:'#344138'}},
    },
    entry:{id:'incident-chess',revision:1,title:'异变象棋',summary:'走一步，选一个技能。炮车异变、良驹合体、战功晋升与傀儡术，让每局象棋走向不同。',author:'xuyinjie · 原创设计',tags:['原创','象棋','技能','策略'],publishedAt:'2026-10-13',credits:'规则设计：xuyinjie（本站作者）。完整技能依据作者的 chess-room / game-incident-chess 移植；作者确认沿用旧版流程并允许修正明显程序错误，广场同屏试玩公开幻子身份。',instructions:[
      '9 列 × 10 行象棋棋盘，标准 32 子开局，红方先行。点击「开始对局」后移动棋子。以消灭对方将帅为目标；不采用普通象棋的将军、自将保护、将帅照面限制。若有金蝉脱壳或将魂犹在，先结算保命效果。',
      '每次正常行动后，由行动方从三个随机技能中选择一个。瞬发技能立即选择目标执行，持续技能长期生效，锦囊留存供以后使用；处理完技能再换方。持续技能和未用锦囊不重复提供，偃师分支及战功晋升II有前置条件。无合适目标的瞬发可以跳过；无效点击不会消耗技能。',
      '锦囊和召唤傀儡沿用旧版的回合内附加操作，不替代正常走子；金蝉脱壳为被动锦囊。需要连动时，只能再移动该枚棋子，或点击「放弃第二次移动」。点击或拖动均可走子，升级和放置技能直接点击高亮目标，己子之间的合体也用同样操作。',
      '广场是双方公开信息的规则沙盘：幻兵、幻马和虚子始终显示真实身份。幻兵／幻马在所属方下一回合开始时消失；虚子持久存在，可被双方攻击或被生成的真子覆盖。护甲、良驹种类、原型倒计时与连动显示在棋子旁。每次换方算原型倒计时的一回合。',
      '技能、棋子状态和随机序列都保存在棋局快照中；悔棋、重做不会重抽技能。人机使用公开局面的本地练习 AI；它能操作技能，但不是专门针对异变象棋训练的强棋力引擎。复制到编辑器或下载后仍保留完整规则。',
      '技能图鉴：',...skills.map(s=>`${s}：${descriptions[s]}`),
    ].join('\n\n')},
  };
}
