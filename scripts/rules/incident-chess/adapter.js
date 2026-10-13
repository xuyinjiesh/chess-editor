// The gallery sandbox protocol. Only JSON crosses the worker boundary.
const incidentEngine = new ChineseChessEngine();
const incidentCell = p => ({row:p.y,col:p.x});
const incidentPos = c => ({x:c.col,y:c.row});
const incidentSame = (a,b) => !!a === !!b && (!a || a.row === b.row && a.col === b.col);
const incidentAction = (prefix,skill) => `${prefix}-${ALL_SKILLS.indexOf(skill)}`;
const incidentSkill = action => ALL_SKILLS[Number(action?.split('-').at(-1))];
const incidentButtonMove = action => ({action,to:{row:0,col:0}});
const incidentMulti = ['快马加鞭','仙人指路','运筹帷幄','衷心护主','瞒天过海'];

function incidentRestore(state) {
  const saved = structuredClone(state.data.incident || {});
  const cc = Object.assign(Object.create(IncidentChessState.prototype), {
    boardSize:{size:{x:9,y:10}}, players:['white','black'], playerToPieceColor:{white:'Red',black:'Black'},
    status:{kind:'playing',turn:state.turn === 'white' ? 0 : 1}, offer:null,pendingSkill:null,
    tricks:{},persistents:{},resurrect:{},awaitingResurrect:null,doubleMovePos:{},pendingSecondMove:null,
    round:0,phantomSideArmed:{},seed:1,serial:0,
  },saved);
  cc.boardState = Array.from({length:10},()=>Array(9).fill(null));
  for (const p of state.pieces) {
    const meta = saved.meta?.[p.id] || {};
    const piece = Object.assign(new IncidentChessPiece(p.side,incidentPos(p),p.side === 'white' ? 'Red' : 'Black',p.type),meta);
    piece._id = p.id;
    cc.boardState[p.row][p.col] = piece;
  }
  delete cc.meta;
  return cc;
}

function incidentSave(cc, message) {
  const pieces=[],meta={};
  for (const row of cc.boardState) for (const p of row) if (p) {
    p._id ||= `incident-${++cc.serial}`;
    pieces.push({id:p._id,type:p.kind,side:p.owner,...incidentCell(p.pos)});
    meta[p._id] = Object.fromEntries(['mimicKind','expiry','armored','upgradeAt','steedKind'].filter(k=>p[k] !== undefined).map(k=>[k,p[k]]));
  }
  const {boardState,boardSize,players,playerToPieceColor,...saved} = cc;
  return {valid:true,pieces,turn:cc.players[cc.status.turn ?? 0],winner:cc.status.kind === 'won' ? cc.status.winner : cc.status.kind === 'draw' ? 'draw' : null,data:{incident:{...saved,meta}},message};
}

function incidentSources(cc,owner,skill) {
  const sources = {
    '快马加鞭':horsesOnBaseline,'仙人指路':pawnsOnPawnLine,'运筹帷幄':elephantsOnBaseline,'衷心护主':advisorsOnBaseline,
    '迷你炮':myCannons,'空响炮':myCannons,'直角炮':myCannons,'士角炮':myCannons,
    '冲击车':myChariots,'变形金刚·炮台':myChariots,'变形金刚·火铳':myChariots,'变形金刚·装甲':myChariots,
    '招贤纳士':emptyAdvisorElephantSlots,'招兵买马':emptyPawnHorseSlots,
    '基础设施·掩体':emptyHalfSquares,'基础设施·地雷':emptyHalfSquares,
    '火器制造·炮':emptyCannonSlots,'火器制造·车':emptyChariotSlots,'江湖众生·偃师':yanShiPlacementSlots,
    '以逸待劳':myPawns,'瞒天过海':pawnsOnPawnLine,'化整为零':myPromotedRanks,
    '无中生有':emptyInitialSlots,'树上开花':emptyPawnSlots,
    '傀儡术·悬丝':puppetSpawnSlots,'傀儡术·皮影':puppetSpawnSlots,
  };
  if (skill === '江湖众生·偃师' && findYanShi(cc,owner)) return [];
  if (skill.startsWith('傀儡术·') && !findYanShi(cc,owner)) return [];
  return sources[skill]?.(cc,owner) || [];
}

function incidentTargets(cc,owner,skill,prefix) {
  const action=incidentAction(prefix,skill),moves=[];
  for (const from of incidentSources(cc,owner,skill)) {
    if (!incidentMulti.includes(skill)) {moves.push({action,to:incidentCell(from)});continue;}
    const piece=cc.boardState[from.y][from.x];
    const destinations=skill === '瞒天过海' ? [acrossRiverPos(piece.color,from.x)].filter(to=>{
      const target=cc.boardState[to.y][to.x];
      return !target || target.kind !== '掩体' && (target.owner !== owner || ['虚·初始棋子','装甲','地雷'].includes(target.kind));
    }) : hintMove(piece,cc);
    for (const to of destinations) moves.push({action,from:incidentCell(from),to:incidentCell(to)});
  }
  return moves;
}

function incidentResurrectionSlots(cc,owner) {
  const at=cc.resurrect[owner];
  return !at ? [] : ORTHOGONAL_DIRS.map(([dx,dy])=>({x:at.x+dx,y:at.y+dy})).filter(p=>checkPosInBoard(cc,p) && !cc.boardState[p.y][p.x]);
}

function incidentMoves(cc,owner) {
  if (cc.status.kind !== 'playing') return [];
  if (cc.offer) return cc.offer.options.length ? cc.offer.options.map(s=>incidentButtonMove(incidentAction('choose',s))) : [incidentButtonMove('skip-offer')];
  if (cc.pendingSkill) return [...incidentTargets(cc,owner,cc.pendingSkill.skill,'apply'),incidentButtonMove('skip-skill')];
  if (cc.awaitingResurrect === owner) {
    const slots=incidentResurrectionSlots(cc,owner);
    return slots.length ? slots.map(p=>({action:'resurrect',to:incidentCell(p)})) : [incidentButtonMove('resurrection-failed')];
  }
  const moves=[];
  for (const row of cc.boardState) for (const p of row) {
    if (!p || p.owner !== owner || cc.pendingSecondMove && !posEq(cc.pendingSecondMove,p.pos)) continue;
    for (const to of hintMove(p,cc)) moves.push({action:'move',from:incidentCell(p.pos),to:incidentCell(to)});
  }
  if (cc.pendingSecondMove) moves.push(incidentButtonMove('end-turn'));
  else {
    for (const skill of cc.tricks[owner] || []) {
      if (skill === '声东击西') moves.push(incidentButtonMove(incidentAction('trick',skill)));
      else moves.push(...incidentTargets(cc,owner,skill,'trick'));
    }
    for (const skill of ['傀儡术·悬丝','傀儡术·皮影']) if ((cc.persistents[owner] || []).includes(skill)) moves.push(...incidentTargets(cc,owner,skill,'puppet'));
  }
  return [...new Map(moves.map(m=>[JSON.stringify(m),m])).values()];
}

function getLegalMoves(state) {
  if (state.winner) return [];
  if (!state.data.incident) return [incidentButtonMove('begin')];
  return incidentMoves(incidentRestore(state),state.turn);
}

function onMove(state,move) {
  if (state.winner) return {valid:false,message:'本局已经结束。'};
  const cc=incidentRestore(state),owner=state.turn;
  const candidate={...move,action:move.action || 'move'};
  if (!getLegalMoves(state).some(m=>m.action === candidate.action && incidentSame(m.from,candidate.from) && incidentSame(m.to,candidate.to))) return {valid:false,message:'此操作或目标不可用，请按当前技能提示选择高亮位置。'};
  if (candidate.action === 'begin') {
    cc.seed=(Math.random()*4294967296)>>>0;
    return incidentSave(cc,'开局 · 红方先行，幻子身份公开');
  }
  if (candidate.action === 'skip-skill' || candidate.action === 'skip-offer') {
    const label=cc.pendingSkill?.skill;
    cc.offer=null;
    incidentEngine.endSkillPhase(cc,owner);
    return incidentSave(cc,label ? `跳过「${label}」` : '没有新技能，结束回合');
  }
  if (candidate.action === 'resurrection-failed') {
    const other=owner === 'white' ? 'black' : 'white';
    const otherAlive=cc.boardState.flat().some(p=>p && p.owner === other && ['将','骠骑将军'].includes(p.kind));
    cc.status=!otherAlive && !incidentResurrectionSlots(cc,other).length ? {kind:'draw'} : {kind:'won',winner:other};
    return incidentSave(cc,'将帅附近无空位，无法复活');
  }
  const skill=incidentSkill(candidate.action),from=candidate.from ? incidentPos(candidate.from) : incidentPos(candidate.to),to=incidentPos(candidate.to);
  let action,message;
  if (candidate.action.startsWith('choose-')) {action={kind:'choose-skill',skill};message=`选择「${skill}」`;}
  else if (candidate.action.startsWith('apply-')) {action={kind:'apply-skill',skill,from,to};message=`施放「${skill}」`;}
  else if (candidate.action.startsWith('trick-')) {action={kind:'use-trick',skill,from,to};message=`使用锦囊「${skill}」`;}
  else if (candidate.action.startsWith('puppet-')) {action={kind:'place-puppet',skill,to};message=`召唤${skill === '傀儡术·悬丝' ? '傀儡·兵' : '皮影·猴'}`;}
  else if (candidate.action === 'resurrect') {action={kind:'place-general',to};message='金蝉脱壳 · 将帅复活';}
  else if (candidate.action === 'end-turn') {action={kind:'end-turn'};message='放弃第二次移动';}
  else {
    action={kind:'move',from,to};
    const p=cc.boardState[from.y][from.x];
    message=`${p.kind} ${String.fromCharCode(97+from.x)}${10-from.y} → ${String.fromCharCode(97+to.x)}${10-to.y}`;
  }
  const result=incidentEngine.handleMove(cc,owner,action);
  if (!result.success) return {valid:false,message:result.error || '此操作不可用。'};
  return incidentSave(cc,message);
}

function getGameView(state) {
  const cc=incidentRestore(state),owner=state.turn;
  const view={message:'移动一枚棋子，随后三选一技能。幻子身份公开。',interaction:'move',actions:[],choices:[],markers:[],details:[]};
  for (const side of cc.players) {
    const persistent=cc.persistents[side] || [],tricks=cc.tricks[side] || [];
    view.details.push({title:`${side === 'white' ? '红' : '黑'}方技能 · 持续 ${persistent.length} / 锦囊 ${tricks.length}`,text:[...persistent,...tricks].map(s=>`${s}\n${SKILL_DESCRIPTIONS[s]}`).join('\n\n') || '尚未获得技能。'});
  }
  view.details.push({title:`技能图鉴 · ${ALL_SKILLS.length} 种`,text:ALL_SKILLS.map(s=>`${s}\n${SKILL_DESCRIPTIONS[s]}`).join('\n\n')});
  for (const row of cc.boardState) for (const p of row) if (p) {
    const labels=[];
    if (p.armored) labels.push('护甲');
    if (p.upgradeAt !== undefined) labels.push(`${Math.max(0,p.upgradeAt-cc.round)}回合`);
    if (p.kind === '良驹') labels.push(p.steedKind || '良驹');
    if (p.kind === '虚·初始棋子') labels.push(`虚·${p.mimicKind || '兵'}`);
    if (p.expiry !== undefined) labels.push('下回合消失');
    if (cc.pendingSecondMove && posEq(p.pos,cc.pendingSecondMove)) labels.push('连动');
    if (cc.doubleMovePos[p.owner] && posEq(p.pos,cc.doubleMovePos[p.owner])) labels.push('待劳');
    if (labels.length) view.markers.push({cell:incidentCell(p.pos),label:labels.join('·').slice(0,12)});
  }
  if (state.winner) {view.message='本局结束。可以悔棋查看技能效果，或重新开始。';return view;}
  if (!state.data.incident) {
    view.message='每次正常行动后选择一个技能。瞬发立即执行，锦囊留存，持续技能长期生效。此处为公开幻子身份的沙盘试玩。';
    view.actions=[{label:'开始对局',move:incidentButtonMove('begin')}];return view;
  }
  if (cc.offer) {
    view.message='本次行动已完成，请三选一技能。选择后才换方；瞬发技能还需指定目标。';
    view.actions=cc.offer.options.map(s=>({label:s,description:SKILL_DESCRIPTIONS[s],move:incidentButtonMove(incidentAction('choose',s))}));
    if (!view.actions.length) view.actions.push({label:'结束回合',move:incidentButtonMove('skip-offer')});
    return view;
  }
  if (cc.pendingSkill) {
    const skill=cc.pendingSkill.skill;
    view.message=incidentMulti.includes(skill) ? `施放「${skill}」：先选棋子，再选落点。` : `施放「${skill}」：点击一个高亮目标。`;
    view.choices=[{action:incidentAction('apply',skill),label:skill,interaction:incidentMulti.includes(skill) ? 'move' : 'place',description:SKILL_DESCRIPTIONS[skill]}];
    view.actions=[{label:'跳过此技能',move:incidentButtonMove('skip-skill')}];return view;
  }
  if (cc.awaitingResurrect === owner) {
    view.message='金蝉脱壳：在将帅被吃位置的上下左右空格复活。';
    view.choices=[{action:'resurrect',label:'放回将帅',interaction:'place'}];
    if (!incidentResurrectionSlots(cc,owner).length) view.actions=[{label:'无法复活 · 结束本局',move:incidentButtonMove('resurrection-failed')}];
    return view;
  }
  view.choices=[{action:'move',label:'移动棋子',interaction:'move'}];
  if (cc.pendingSecondMove) {
    view.message='这枚棋子可再行动一次，也可放弃第二次移动。';
    view.actions=[{label:'放弃第二次移动',move:incidentButtonMove('end-turn')}];return view;
  }
  for (const skill of cc.tricks[owner] || []) {
    if (skill === '金蝉脱壳') continue;
    if (skill === '声东击西') view.actions.push({label:'使用声东击西',description:SKILL_DESCRIPTIONS[skill],move:incidentButtonMove(incidentAction('trick',skill))});
    else view.choices.push({action:incidentAction('trick',skill),label:`锦囊 · ${skill}`,interaction:incidentMulti.includes(skill) ? 'move' : 'place',description:SKILL_DESCRIPTIONS[skill]});
  }
  for (const skill of ['傀儡术·悬丝','傀儡术·皮影']) if ((cc.persistents[owner] || []).includes(skill) && findYanShi(cc,owner)) view.choices.push({action:incidentAction('puppet',skill),label:skill,interaction:'place',description:SKILL_DESCRIPTIONS[skill]});
  if (cc.phantomSideArmed[owner]) view.message+=' 声东击西已就绪：本回合首次横移兵会留下幻兵。';
  return view;
}

function evaluate(state,side) {
  const cc=incidentRestore(state);
  const values={'将':10000,'骠骑将军':10500,'车':900,'炮':450,'马':400,'相':200,'士':200,'兵':100,'后':1600,'猛犸象':700,'龙骑兵':600,'偃师':500,'良驹':100,'虚·初始棋子':10,'幻·兵':5,'幻·马':5,'掩体':80,'地雷':100,'装甲':120,'原型·炮':180,'车·原型':220};
  let score=0;
  for (const row of cc.boardState) for (const p of row) if (p) {
    const value=values[p.kind] ?? (RANK_INDEX[p.kind] !== undefined ? 120+RANK_INDEX[p.kind]*110 : 600);
    score+=(p.owner === side ? 1 : -1)*(value+(p.armored ? 150 : 0));
  }
  for (const owner of cc.players) score+=(owner === side ? 1 : -1)*((cc.persistents[owner]?.length || 0)*70+(cc.tricks[owner]?.length || 0)*45);
  return score;
}
