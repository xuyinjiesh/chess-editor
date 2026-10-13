import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {initialState} from './engine';
import {validateProject,type GameState,type Move,type Piece,type Project,type RuleResult,type Side} from './model';
import {validateCustomView} from './custom-play';
import {customAdapter} from './bot-custom';
import {searchGame} from './bot-search';

const project=validateProject(JSON.parse(readFileSync(new URL('../public/gallery/incident-chess/v1/project.json',import.meta.url),'utf8')));
const api=new Function(project.rules.code+'\nreturn {onMove,getLegalMoves,getGameView,evaluate,skills:ALL_SKILLS,types:SKILL_TYPES,kinds:IncidentChessPieceKinds};')() as {
  onMove:(s:GameState,m:Move,p?:Project)=>RuleResult;getLegalMoves:(s:GameState)=>Move[];getGameView:(s:GameState)=>Record<string,unknown>;
  evaluate:(s:GameState,side:Side)=>number;skills:string[];types:Record<string,string>;kinds:string[];
};
const cell=(row:number,col:number)=>({row,col});
const move=(r:number,c:number,tr:number,tc:number,action='move'):Move=>({from:cell(r,c),to:cell(tr,tc),action});
const button=(action:string):Move=>({action,to:cell(0,0)});
const skillAction=(prefix:string,skill:string)=>`${prefix}-${api.skills.indexOf(skill)}`;
const piece=(type:string,side:Side,row:number,col:number):Piece=>({id:`${side}-${row}-${col}`,type,side,row,col});
const kings=()=>[piece('将','white',9,4),piece('将','black',0,4)];
// Deliberately readable snapshots make chained effects independently testable.
function fixture(pieces:Piece[]=project.pieces,fields:Record<string,unknown>={},turn:Side='white'):GameState {
  return {pieces:structuredClone(pieces),turn,winner:null,history:[],data:{incident:{seed:87654,serial:0,round:0,...fields}}};
}
function play(state:GameState,m:Move):GameState {
  const before=structuredClone(state),result=api.onMove(state,m,project);
  expect(state).toEqual(before);
  expect(result.valid,result.message).toBe(true);
  validateProject({...project,pieces:result.pieces});
  expect(JSON.stringify(result.data).length).toBeLessThan(50000);
  return {...state,pieces:result.pieces!,turn:result.turn!,winner:result.winner || null,data:result.data!,history:[...state.history,{...m,side:state.turn,text:result.message || ''}]};
}
function view(s:GameState) {return validateCustomView({...api.getGameView(s),moves:api.getLegalMoves(s)},project);}
const at=(s:GameState,r:number,c:number)=>s.pieces.find(p=>p.row === r && p.col === c);
const data=(s:GameState)=>s.data.incident as Record<string,any>;
const choose=(s:GameState,skill:string)=>play(s,button(skillAction('choose',skill)));
const pending=(skill:string,pieces=project.pieces)=>fixture(pieces,{pendingSkill:{playerId:'white',skill}});

describe('incident chess gallery and full skill catalog',()=>{
  it('ships all original skills and piece kinds in a portable bounded project',()=>{
    expect(api.skills.length).toBe(50);
    expect(new Set(api.skills).size).toBe(api.skills.length);
    expect(project.pieceTypes).toHaveLength(api.kinds.length);
    expect(validateProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    const catalog=JSON.parse(readFileSync(new URL('../public/gallery/index.json',import.meta.url),'utf8'));
    expect(catalog.entries.find((e:{id:string})=>e.id === 'incident-chess').instructions).toContain('公开');
    expect(view(initialState(project)).actions[0].label).toBe('开始对局');
  });
  it('starts red, offers after an action, then changes sides after choosing',()=>{
    let s=play(initialState(project),button('begin'));
    expect(s.turn).toBe('white');expect(s.pieces).toHaveLength(32);
    expect(api.getLegalMoves(s)).toHaveLength(44);
    const before=structuredClone(s);
    s=play(s,move(6,0,5,0));
    expect(s.turn).toBe('white');expect(data(s).offer.options).toHaveLength(3);
    expect(api.onMove(before,move(6,0,5,0))).toEqual(api.onMove(before,move(6,0,5,0)));
    expect(view(s).actions).toHaveLength(3);
    expect(api.onMove(s,move(6,2,5,2)).valid).toBe(false);
    s=choose(s,data(s).offer.options[0]);
    if (data(s).pendingSkill) s=play(s,button('skip-skill'));
    expect(s.turn).toBe('black');expect(data(s).round).toBe(1);
  });
  it.each(api.skills)('can select %s and exposes executable targets or a safe skip',skill=>{
    const pieces=project.pieces.filter(p=>!['white-back-0','white-back-2','white-cannon-1','white-pawn-0'].includes(p.id));
    pieces.push(piece('偃师','white',5,0));
    const s=choose(fixture(pieces,{offer:{playerId:'white',options:[skill]}}),skill);
    view(s);
    if (api.types[skill] === 'instant' && !skill.startsWith('良驹难寻')) {
      const moves=api.getLegalMoves(s);
      expect(moves.at(-1)?.action).toBe('skip-skill');
      for (const candidate of moves) play(s,candidate);
    } else expect(s.turn).toBe('black');
  });
  it('does not consume a targeted skill on invalid input and rejects unoffered skills',()=>{
    const s=pending('迷你炮'),before=structuredClone(s);
    expect(api.onMove(s,{action:skillAction('apply','迷你炮'),to:cell(9,0)}).valid).toBe(false);
    expect(s).toEqual(before);
    expect(api.onMove(s,button(skillAction('choose','如履平地'))).valid).toBe(false);
    const next=play(s,{action:skillAction('apply','迷你炮'),to:cell(7,1)});
    expect(at(next,7,1)?.type).toBe('迷你炮');expect(next.turn).toBe('black');
    for(const bad of [{to:cell(-1,0)},{to:cell(0,99),action:'move'},{to:cell(0,0),action:'choose-999'}]) expect(api.onMove(s,bad).valid).toBe(false);
  });
  it('does not repeat owned skills or offer locked branches',()=>{
    const s=play(fixture(undefined,{persistents:{white:['如履平地']},tricks:{white:['金蝉脱壳']}}),move(6,0,5,0));
    expect(data(s).offer.options).not.toContain('如履平地');expect(data(s).offer.options).not.toContain('金蝉脱壳');
    expect(data(s).offer.options).not.toContain('战功晋升II');
    expect(data(s).offer.options.some((s:string)=>s.startsWith('傀儡术') || s === '大衍诀')).toBe(false);
  });
});

describe('incident chess skill interactions',()=>{
  it('implements mini, empty-sounding and both corner cannon paths',()=>{
    let s=fixture([...kings(),piece('迷你炮','white',5,0),piece('兵','black',5,3)]);
    expect(api.getLegalMoves(s)).toContainEqual(move(5,0,5,3));expect(api.getLegalMoves(s)).not.toContainEqual(move(5,0,5,4));
    s=fixture([...kings(),piece('空响炮','white',5,0),piece('兵','white',5,2)]);
    expect(api.getLegalMoves(s)).toContainEqual(move(5,0,5,4));
    for(const [type,row,col] of [['直角炮',3,2],['士角炮',3,4]] as const) {
      s=fixture([...kings(),piece(type,'white',5,0),piece('火铳','white',5,2),piece('兵','black',row,col),piece('马','black',row,col+1)]);
      s=play(s,move(5,0,row,col));expect(at(s,5,2)).toBeUndefined();expect(at(s,row,col)).toBeUndefined();expect(at(s,row,col+1)).toBeUndefined();
    }
  });
  it('does not overwrite friendly units through unsupported borrowed or max-rank fusions',()=>{
    const s=fixture([...kings(),piece('司令','white',4,0),piece('司令','white',3,0),piece('排长','white',4,2),piece('马','white',3,2)],{persistents:{white:['化零为整','龙骑兵']}});
    expect(api.getLegalMoves(s)).not.toContainEqual(move(4,0,3,0));expect(api.getLegalMoves(s)).not.toContainEqual(move(4,2,3,2));
  });
  it('allows general capture and immediate double action after general/horse fusion',()=>{
    expect(at(play(fixture([...kings(),piece('兵','black',8,4)]),move(9,4,8,4)),8,4)?.type).toBe('将');
    let s=play(fixture([...kings(),piece('马','white',8,4)],{persistents:{white:['骠骑将军']}}),move(9,4,8,4));
    expect(at(s,8,4)?.type).toBe('骠骑将军');expect(data(s).pendingSecondMove).toEqual({x:4,y:8});
    expect(api.getLegalMoves(s).filter(m=>m.from).every(m=>m.from?.row === 8 && m.from.col === 4)).toBe(true);
    s=play(s,button('end-turn'));expect(data(s).offer).toBeTruthy();expect(data(s).pendingSecondMove).toBeNull();
  });
  it('lets either side take armor or virtual pieces, and armor absorbs one attack',()=>{
    let s=play(fixture([...kings(),piece('车','white',5,0),piece('装甲','white',5,2)]),move(5,0,5,2));
    expect(data(s).meta[at(s,5,2)!.id].armored).toBe(true);
    const target=piece('车','black',5,2);
    s=play(fixture([...kings(),piece('车','white',5,0),target],{meta:{[target.id]:{armored:true}},pendingSecondMove:{x:0,y:5}}),move(5,0,5,2));
    expect(at(s,5,0)?.side).toBe('white');expect(at(s,5,2)?.side).toBe('black');
    expect(data(s).meta[target.id].armored).toBe(false);expect(data(s).pendingSecondMove).toBeNull();
    s=play(fixture([...kings(),piece('车','white',5,0),piece('虚·初始棋子','white',5,2)]),move(5,0,5,2));
    expect(at(s,5,2)?.type).toBe('车');
  });
  it('resolves mines for friendly pieces and keeps a destroyed mover out of double actions',()=>{
    const s=play(fixture([...kings(),piece('旅长','white',5,0),piece('地雷','white',5,1)]),move(5,0,5,1));
    expect(at(s,5,0)).toBeUndefined();expect(at(s,5,1)).toBeUndefined();expect(data(s).pendingSecondMove).toBeNull();
  });
  it('upgrades a horse stepping onto a steed and keeps its identity',()=>{
    const horse=piece('马','white',7,1),token=piece('良驹','white',5,2);
    const s=play(fixture([...kings(),horse,token],{meta:{[token.id]:{steedKind:'绝影'}}}),move(7,1,5,2));
    expect(at(s,5,2)).toMatchObject({type:'绝影',id:horse.id});
    expect(s.pieces.filter(p=>p.type === '幻·马')).toHaveLength(2);
    expect(view(s).markers?.some(m=>m.label.includes('消失'))).toBe(true);
  });
  it('borrows nearby movement and no longer blocks horses with a leg after 如履平地',()=>{
    const pieces=[...kings(),piece('相','white',7,2),piece('车','white',7,3),piece('马','white',5,1),piece('兵','white',4,1)];
    const s=fixture(pieces,{persistents:{white:['择善而从','如履平地']}});
    expect(api.getLegalMoves(s)).toContainEqual(move(7,2,3,2));expect(api.getLegalMoves(s)).toContainEqual(move(5,1,3,2));
  });
  it('promotes soldiers twice, merges equal ranks, and decomposes promoted pieces',()=>{
    let s=play(fixture([...kings(),piece('兵','white',4,0),piece('马','black',3,0)],{persistents:{white:['战功晋升','战功晋升II']}}),move(4,0,3,0));
    expect(at(s,3,0)?.type).toBe('连长');
    s=play(fixture([...kings(),piece('兵','white',4,0),piece('兵','white',3,0)],{persistents:{white:['化零为整']}}),move(4,0,3,0));expect(at(s,3,0)?.type).toBe('排长');
    s=play(fixture([...kings(),piece('营长','white',4,4)],{tricks:{white:['化整为零']}}),{action:skillAction('trick','化整为零'),to:cell(4,4)});
    expect(s.pieces.filter(p=>p.type === '排长')).toHaveLength(4);expect(s.turn).toBe('white');
  });
  it('tracks prototype upgrades and phantom expiry across turn boundaries',()=>{
    const proto=piece('原型·炮','white',7,1),phantom=piece('幻·兵','white',6,0);
    let s=fixture([...kings(),proto,phantom],{round:2,meta:{[proto.id]:{upgradeAt:3},[phantom.id]:{expiry:2}},pendingSkill:{playerId:'black',skill:'迷你炮'}},'black');
    s=play(s,button('skip-skill'));
    expect(at(s,7,1)?.type).toBe('炮');expect(at(s,6,0)).toBeUndefined();
    expect(data(s).meta[proto.id].upgradeAt).toBeUndefined();
  });
  it('offers free tricks, marks double move and spawns puppets only in control range',()=>{
    let s=fixture([...kings(),piece('兵','white',6,0)],{tricks:{white:['以逸待劳','声东击西']}});
    s=play(s,{action:skillAction('trick','以逸待劳'),to:cell(6,0)});expect(s.turn).toBe('white');expect(data(s).offer).toBeNull();
    s=play(s,move(6,0,5,0));expect(data(s).pendingSecondMove).toEqual({x:0,y:5});
    s=play(s,move(5,0,4,0));expect(data(s).offer).toBeTruthy();
    s=fixture([...kings(),piece('偃师','white',5,0)],{persistents:{white:['傀儡术·悬丝']}});
    const spawn=api.getLegalMoves(s).find(m=>m.action === skillAction('puppet','傀儡术·悬丝'))!;
    expect(spawn).toBeTruthy();expect(api.onMove(s,{action:spawn.action,to:cell(0,8)}).valid).toBe(false);
    expect(at(play(s,spawn),spawn.to.row,spawn.to.col)?.type).toBe('傀儡·兵');
  });
});

describe('incident chess survival and simultaneous effects',()=>{
  it('keeps 金蝉脱壳 ahead of 将魂犹在 and resurrects next turn near the actual capture',()=>{
    let s=play(fixture([...kings(),piece('车','white',1,4),piece('相','black',2,2)],{tricks:{black:['金蝉脱壳']},persistents:{black:['将魂犹在']}}),move(1,4,0,4));
    expect(s.winner).toBeNull();expect(data(s).resurrect.black).toEqual({x:4,y:0});
    expect(at(s,2,2)?.type).toBe('相');
    s=choose(s,data(s).offer.options[0]);if(data(s).pendingSkill) s=play(s,button('skip-skill'));
    expect(s.turn).toBe('black');expect(view(s).choices?.[0].action).toBe('resurrect');
    s=play(s,{action:'resurrect',to:cell(1,4)});expect(at(s,1,4)?.type).toBe('将');expect(data(s).offer.playerId).toBe('black');
  });
  it('handles loss of own general to a mine and an elephant becoming the new general',()=>{
    let s=play(fixture([...kings(),piece('地雷','black',8,4)]),move(9,4,8,4));expect(s.winner).toBe('black');
    s=play(fixture([...kings(),piece('地雷','black',8,4),piece('相','white',9,2)],{persistents:{white:['将魂犹在']}}),move(9,4,8,4));
    expect(s.winner).toBeNull();expect(at(s,9,2)?.type).toBe('将');
    s=play(fixture([...kings(),piece('地雷','black',8,4)],{tricks:{white:['金蝉脱壳']}}),move(9,4,8,4));
    expect(data(s).resurrect.white).toEqual({x:4,y:8});
  });
  it('resolves a fire-shot draw, armor protection and resurrection at blast victims',()=>{
    const red=piece('将','white',4,4),black=piece('将','black',6,4);
    const pieces=[red,black,piece('炮','white',5,0),piece('火铳','white',5,2),piece('兵','black',5,4)];
    expect(play(fixture(pieces),move(5,0,5,4)).winner).toBe('draw');
    let s=play(fixture(pieces,{meta:{[red.id]:{armored:true}}}),move(5,0,5,4));expect(s.winner).toBe('white');expect(at(s,4,4)?.type).toBe('将');
    s=play(fixture(pieces,{tricks:{white:['金蝉脱壳'],black:['金蝉脱壳']}}),move(5,0,5,4));
    expect(s.winner).toBeNull();expect(data(s).resurrect.white).toEqual({x:4,y:4});expect(data(s).resurrect.black).toEqual({x:4,y:6});
  });
  it('applies survival and mines during 瞒天过海 too',()=>{
    const pieces=[piece('将','white',9,4),piece('将','black',4,0),piece('兵','white',6,0)];
    let s=play(fixture(pieces,{tricks:{white:['瞒天过海'],black:['金蝉脱壳']}}),move(6,0,4,0,skillAction('trick','瞒天过海')));
    expect(s.winner).toBeNull();expect(data(s).resurrect.black).toEqual({x:0,y:4});
    s=play(fixture([...kings(),piece('兵','white',6,0),piece('地雷','black',4,0)],{tricks:{white:['瞒天过海']}}),move(6,0,4,0,skillAction('trick','瞒天过海')));
    expect(at(s,4,0)).toBeUndefined();expect(at(s,6,0)).toBeUndefined();
  });
});

describe('incident chess integration and sandbox contracts',()=>{
  it('validates bounded skill descriptions, markers and disclosure panels',()=>{
    expect(()=>validateCustomView({actions:[],moves:[],details:[{title:'x',text:'x'.repeat(8001)}]},project)).toThrow();
    expect(()=>validateCustomView({actions:[{label:'x',description:{html:'x'},move:button('begin')}],moves:[]},project)).toThrow();
    expect(()=>validateCustomView({actions:[],moves:[],choices:[{action:'move',label:'x',interaction:'move',description:'x'.repeat(301)}]},project)).toThrow();
  });
  it('can search and play through the normal move and skill phases',async()=>{
    let s=fixture();const adapter=customAdapter(project);
    for(let i=0;i<5;i++) {
      const result=await searchGame(adapter,s,{timeMs:1200,maxDepth:1,maxNodes:1500});
      expect(result.move).toBeTruthy();s=play(s,result.move!);view(s);
    }
    expect(s.history.some(m=>m.text.includes('选择'))).toBe(true);
  });
  it('keeps every generated action valid through a deterministic multi-phase playout',()=>{
    let s=fixture();let seed=713;
    for(let i=0;i<160 && !s.winner;i++) {
      const moves=api.getLegalMoves(s);expect(moves.length).toBeGreaterThan(0);view(s);
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      s=play(s,moves[seed % moves.length]);
      expect(Number.isFinite(api.evaluate(s,'white'))).toBe(true);
    }
  });
});
