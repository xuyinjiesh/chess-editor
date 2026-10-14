import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Original designs by the site author, ported from their chess-room project.
export async function originalGames(root) {
  const rules = async name => ({engine:'custom',firstTurn:'white',winLength:4,code:await readFile(resolve(root,`scripts/rules/${name}.js`),'utf8')});
  const ui = {accent:'#537a61',showHints:true,showHistory:true};
  const region = (id,name,tag,color,cells) => ({id,name,tag,color,cells});
  const rectangle = (r1,r2,c1,c2) => Array.from({length:r2-r1+1},(_,r)=>Array.from({length:c2-c1+1},(_,c)=>({row:r1+r,col:c1+c}))).flat();
  const footballSetup = [['gk',1,7],['df',3,5],['df',3,9],['mf',7,4],['mf',7,10],['fw',10,6],['fw',10,8]];
  const football = {
    version:1,id:'football',name:'足球棋',description:'xuyinjie 原创。15 × 23 球场上的回合制足球：调动守门员、后卫、中场和前锋，控球、抢球、蓄力与射门，把球踢入或带入对方球门即获胜。',
    board:{rows:23,cols:15,pattern:'cells',light:'#9dbb8d',dark:'#739d77',coordinates:true,theme:'custom'},
    pieceTypes:[{id:'gk',name:'守门员',symbol:'守',shape:'token'},{id:'df',name:'后卫',symbol:'卫',shape:'token'},{id:'mf',name:'中场',symbol:'中',shape:'token'},{id:'fw',name:'前锋',symbol:'锋',shape:'token'},{id:'ball',name:'足球',symbol:'⚽',shape:'token',neutral:true}],
    pieces:[...['black','white'].flatMap(side => footballSetup.map(([type,row,col],i)=>({id:`${side}-${i}`,type,side,row:side==='white'?type==='fw'?13:22-row:row,col}))),{id:'football-ball',type:'ball',side:'white',row:11,col:7}],
    regions:[region('pitch','球场标线','football-pitch','#f3f6df',[]),region('top-goal','黑方球门','goal','#f4edc6',rectangle(0,0,5,9)),region('bottom-goal','红方球门','goal','#f4edc6',rectangle(22,22,5,9)),region('top-penalty','黑方罚球区','penalty','#e4f0d8',rectangle(1,3,4,10)),region('bottom-penalty','红方罚球区','penalty','#e4f0d8',rectangle(19,21,4,10)),region('touchline','底线两侧 · 仅球员可移入','touchline','#425b4e',[...rectangle(0,0,0,4),...rectangle(0,0,10,14),...rectangle(22,22,0,4),...rectangle(22,22,10,14)])],
    rules:await rules('football'),ui:{...ui,sideLabels:{white:'红方',black:'黑方'},sideColors:{white:'#ae3f35',black:'#283c38'}},
  };
  const wrestle = {
    version:1,id:'wrestle-chess',name:'角斗棋',description:'xuyinjie 原创。3 × 3 棋盘上调配十六枚储备，每方最多同时上场三子；象可贯穿敌子、马只受敌子蹩腿、炮可斜打，吃将获胜。',
    board:{rows:3,cols:3,pattern:'grid',light:'#e8d7b6',dark:'#dcc6a0',coordinates:true,theme:'custom'},
    pieceTypes:[['rook','车','車','車'],['horse','马','馬','馬'],['cannon','炮','炮','砲'],['elephant','相','相','象'],['advisor','士','仕','士'],['king','将','帥','將'],['pawn','兵','兵','卒']].map(([id,name,symbol,blackSymbol])=>({id,name,symbol,blackSymbol,shape:'xiangqi'})),
    pieces:[],regions:[],rules:await rules('wrestle'),ui:{...ui,sideLabels:{white:'红方',black:'蓝方'},sideColors:{white:'#a2392d',black:'#355f99'}},
  };
  const common = {revision:1,author:'xuyinjie · 原创设计',publishedAt:'2026-10-13',credits:'规则设计：xuyinjie（本站作者）。依据作者的 chess-room 实现迁移，并按作者确认的规则修正；界面、棋盘与棋子由本站代码绘制。'};
  return [
    {project:football,entry:{...common,id:'football',title:'足球棋',summary:'七名球员，一枚足球。带球突破、邻格抢球、蓄力传射，率先攻入对方球门。',tags:['原创','足球','策略'],instructions:[
      '球场为 15 列 × 23 行，红方在下、黑方在上，红方先手。双方各有一名守门员、两名后卫、两名中场、两名前锋，足球在中点 h12。每回合移动一名球员，或由一名球员踢球，然后换方。',
      '球员不吃子，不能落在其他球员上。沿横、竖、斜八方向移动：守门员最多两格、后卫最多三格、前锋最多四格；中场横竖最多三格、斜走一格，另可走不蹩腿的日字。直线移动遇到球员即受阻；中场日字可跳过球员。可经过空地上的球，只有停在球上才控球；持球者移动时带球同行。',
      '选择「移动 / 带球」或「传球 / 射门」，再点击己方球员和目的格；也可拖动球员至目的格。切换操作不消耗回合。足球的所在格及周围八格内，任何己方球员都可踢球，包括从队友或对手脚下踢走球。',
      '普通踢球：球从当前位置沿横、竖、斜八方向任意距离前进；以“球员→球”的方向为前方，允许向前、斜前或垂直侧方踢，不能往身后踢（两方向点积不得为负）。持球者与球同格，因此可朝八方向踢。遇己方球员可传到其脚下并停止；遇敌方球员不能踢到或越过。球不能踢入顶行、底行球门以外的格子。',
      '中场还有日字连跳传球：从球的位置沿一个固定日字向量连续跳跃，途中的跨越格不阻挡；每次落点遇敌人即受阻，遇队友可接球并停止。它不受普通踢球的前向限制。',
      '蓄力：己方持球队员在自己的一次有效行动中保持原位与持球身份不变（移动另一名队友），即可蓄力；对方行动不会自动取消。持球者移动、失球或换人接球后蓄力清除，无效操作不会蓄力。持球棋子显示 ⚽，蓄力后显示 ⚽蓄。',
      '蓄力后，前锋和后卫增加日字连跳传球；前锋、中场和后卫都增加折线球：先横竖一格再沿同向斜线延伸，或先斜走一格再沿对应横线／竖线延伸。折点须为空格或队友格；与参考版本一致，折点有队友也允许折过，延伸段遇队友即停、遇敌人受阻。守门员只有普通八方向踢球。',
      '黑方球门为 f23–j23，红方球门为 f1–j1。把球踢入、传给已在门内的队友，或带球进入对方球门，立即获胜；把球送入己方球门则对方获胜。无空手进门得分、守门员禁区限制或越位。罚球区只作球场标记；所有球员（包括持球者）仍可移动到顶行和底行两侧格，但不能直接把球踢入这些格。',
    ].join('\n')}},
    {project:wrestle,entry:{...common,id:'wrestle-chess',title:'角斗棋',summary:'三乘三的角斗场，每方最多三子。用十六枚储备调兵遣将，贯象、蹩马、斜炮，吃将即胜。',tags:['原创','吃子','储备','策略'],instructions:[
      '棋盘为 3 × 3，开局为空，红方先手、蓝方后手。每方储备为两车、两马、两炮、两相、两士、一将、五兵，共十六子。每回合可从储备放一子到空格，或移动一枚场上棋子。每方场上最多三子；被吃棋子永久离场，不回到储备。',
      '只有全局第一手不能放在中心 b2；此后双方均可在中心上场，即使红方场上已无棋子。将／帅没有强制上场时机，可一直留在储备。',
      '操作：点击棋盘上下储备区中的棋子，再点击空格上场；棋子角标表示剩余数量。要走场上棋子，选择「移动棋子」，再点击或拖动。双方储备公开显示，用尽或己方场上满三子时不可选择上场，选择棋种不消耗回合。',
      '所有棋子都可额外横向或纵向走一格空位；这条通用走法本身不能吃子。各棋种还保留以下专属走法，专属走法可以走空位或吃敌子，不能落在己子上。',
      '车：沿横竖线任意距离，不能越子。马：走日字，马腿只被敌方棋子阻挡，己方棋子不蹩腿。相／象：斜走两格，可穿过中心；中心若为敌子，也会一并吃掉，若为己子则保留。',
      '炮：横竖平移不越子；吃子必须恰好隔一枚任意阵营棋子，可横、竖或斜向隔子打吃。斜向不能无吃子平移。士／仕：斜走一格可吃子，另有通用的横竖一步走空格。将／帅和兵／卒：横竖一格可吃子，无九宫、前后或过河限制。',
      '吃掉对方已上场的将／帅立即获胜，相穿过中心时吃将也获胜。没有将军、自将保护或将帅照面限制。将还在储备不算被吃；没有额外的回合上限或自动重复和棋。',
    ].join('\n')}},
  ];
}
