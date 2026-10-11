import { describe,it,expect } from 'vitest';
import { TEMPLATES } from './templates';
import { applyMove, initialState, hints } from './engine';
import { clone, validateProject, type Cell, type Project } from './model';
const cell=(square:string):Cell=>({row:8-Number(square[1]),col:square.charCodeAt(0)-97});
async function chessGame(moves:string[]){const p=clone(TEMPLATES[0]);let s=initialState(p);for(const m of moves)s=await applyMove(p,s,{from:cell(m.slice(0,2)),to:cell(m.slice(2,4)),promotion:m[4] as 'q'});return s;}
describe('international chess rules',()=>{
  it('preserves every piece identity when moving and undo-compatible snapshots',async()=>{
    const p=clone(TEMPLATES[0]),before=initialState(p),pawn=before.pieces.find(p=>p.row===6&&p.col===4)!;
    const after=await applyMove(p,before,{from:cell('e2'),to:cell('e4')});
    expect(after.pieces.map(p=>p.id).sort()).toEqual(before.pieces.map(p=>p.id).sort());
    expect(after.pieces.find(p=>p.id===pawn.id)).toMatchObject(cell('e4'));
    expect(before.pieces.find(p=>p.id===pawn.id)).toMatchObject(cell('e2'));
  });
  it('keeps both original identities when castling on either wing',async()=>{
    for(const [rookCol,to,rookTo] of [[7,'g1','f1'],[0,'c1','d1']] as const){
      const p=clone(TEMPLATES[0]);p.pieces=p.pieces.filter(p=>p.type==='k'||p.side==='white'&&p.type==='r'&&p.col===rookCol);
      const before=initialState(p),king=before.pieces.find(p=>p.type==='k'&&p.side==='white')!,rook=before.pieces.find(p=>p.type==='r')!;
      const after=await applyMove(p,before,{from:cell('e1'),to:cell(to)});
      expect(after.pieces.find(p=>p.id===king.id)).toMatchObject(cell(to));
      expect(after.pieces.find(p=>p.id===rook.id)).toMatchObject(cell(rookTo));
    }
  });
  it('keeps the pawn identity through en passant and removes only the captured pawn',async()=>{
    const before=await chessGame(['e2e4','a7a6','e4e5','d7d5']);
    const pawn=before.pieces.find(p=>p.row===3&&p.col===4)!,captured=before.pieces.find(p=>p.row===3&&p.col===3)!;
    const after=await applyMove(TEMPLATES[0],before,{from:cell('e5'),to:cell('d6')});
    expect(after.pieces.find(p=>p.id===pawn.id)).toMatchObject(cell('d6'));
    expect(after.pieces.map(p=>p.id).sort()).toEqual(before.pieces.filter(p=>p.id!==captured.id).map(p=>p.id).sort());
  });
  it('preserves a promoted pawn identity for all four promotion choices',async()=>{
    for(const promotion of ['q','r','b','n'] as const){
      const p=clone(TEMPLATES[0]);p.pieces=[{id:'wk',type:'k',side:'white',...cell('a1')},{id:'bk',type:'k',side:'black',...cell('h8')},{id:'pawn',type:'p',side:'white',...cell('e7')}];
      const after=await applyMove(p,initialState(p),{from:cell('e7'),to:cell('e8'),promotion});
      expect(after.pieces.find(p=>p.id==='pawn')).toMatchObject({type:promotion,...cell('e8')});
    }
  });
  it('starts with 32 pieces and enforces turns and legal pawn movement',async()=>{const p=clone(TEMPLATES[0]),s=initialState(p);expect(s.pieces).toHaveLength(32);expect(hints(p,s,cell('e2'))).toContainEqual(cell('e4'));await expect(applyMove(p,s,{from:cell('e7'),to:cell('e5')})).rejects.toThrow();await expect(applyMove(p,s,{from:cell('e2'),to:cell('e5')})).rejects.toThrow();const n=await applyMove(p,s,{from:cell('e2'),to:cell('e4')});expect(n.turn).toBe('black');expect(n.history[0].text).toBe('e4');expect(s.pieces.find(x=>x.row===6&&x.col===4)).toBeDefined();});
  it('recognizes checkmate and blocks later moves',async()=>{const s=await chessGame(['f2f3','e7e5','g2g4','d8h4']);expect(s.winner).toBe('black');await expect(applyMove(TEMPLATES[0],s,{from:cell('e2'),to:cell('e4')})).rejects.toThrow('结束');});
  it('executes castling with both king and rook',async()=>{const s=await chessGame(['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','e1g1']);expect(s.pieces.find(x=>x.row===7&&x.col===6)?.type).toBe('k');expect(s.pieces.find(x=>x.row===7&&x.col===5)?.type).toBe('r');});
  it('handles en passant captures',async()=>{const s=await chessGame(['e2e4','a7a6','e4e5','d7d5','e5d6']);expect(s.pieces).toHaveLength(31);expect(s.pieces.some(p=>p.row===3&&p.col===3)).toBe(false);});
  it('recognizes threefold repetition across reconstructed positions',async()=>{const s=await chessGame(['g1f3','g8f6','f3g1','f6g8','g1f3','g8f6','f3g1','f6g8']);expect(s.winner).toBe('draw');});
});
describe('placement games',()=>{
  it('detects a five-stone line and occupied cells',async()=>{const p=clone(TEMPLATES[1]);let s=initialState(p);for(let col=0;col<4;col++){s=await applyMove(p,s,{to:{row:7,col}});s=await applyMove(p,s,{to:{row:8,col}});}await expect(applyMove(p,s,{to:{row:7,col:0}})).rejects.toThrow();s=await applyMove(p,s,{to:{row:7,col:4}});expect(s.winner).toBe('black');});
  it('detects a full tic tac toe draw',async()=>{const p=clone(TEMPLATES[3]);let s=initialState(p);for(const [row,col] of [[0,0],[0,1],[0,2],[1,1],[1,0],[1,2],[2,1],[2,0],[2,2]])s=await applyMove(p,s,{to:{row,col}});expect(s.winner).toBe('draw');});
  it('flips bracketed stones in reversi and rejects isolated placement',async()=>{const p=clone(TEMPLATES[2]),s=initialState(p);expect(hints(p,s)).toHaveLength(4);await expect(applyMove(p,s,{to:{row:0,col:0}})).rejects.toThrow();const n=await applyMove(p,s,{to:{row:2,col:3}});expect(n.pieces.filter(p=>p.side==='black')).toHaveLength(4);expect(n.turn).toBe('white');});
  it('rejects out-of-board and non-integer moves',async()=>{const p=TEMPLATES[1],s=initialState(p);for(const to of [{row:-1,col:0},{row:15,col:0},{row:0.2,col:0}])await expect(applyMove(p,s,{to})).rejects.toThrow();});
});
describe('portable project validation',()=>{
  it('round-trips theme preferences and keeps older files compatible',()=>{
    const p=clone(TEMPLATES[0]);p.board.theme='nebula';
    expect(validateProject(JSON.parse(JSON.stringify(p))).board.theme).toBe('nebula');
    delete p.board.theme;
    expect(validateProject(p).board).not.toHaveProperty('theme');
    expect(()=>validateProject({...p,board:{...p.board,theme:'url(https://bad)'}})).toThrow('主题');
  });
  it('round-trips every template',()=>{for(const p of TEMPLATES)expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);});
  it('rejects overlapping pieces and invalid colors',()=>{const p=clone(TEMPLATES[0]);p.pieces[1]={...p.pieces[1],row:p.pieces[0].row,col:p.pieces[0].col};expect(()=>validateProject(p)).toThrow('同一个');expect(()=>validateProject({...TEMPLATES[0],board:{...TEMPLATES[0].board,light:'url(https://bad)'}})).toThrow();});
  it('rejects incompatible dimensions and oversized code',()=>{expect(()=>validateProject({...TEMPLATES[0],board:{...TEMPLATES[0].board,rows:9}})).toThrow('8 × 8');const p:Project=clone(TEMPLATES[4]);p.rules.code=' '.repeat(40001);expect(()=>validateProject(p)).toThrow();});
  it('strips unknown fields and rejects invalid region cells',()=>{expect(validateProject({...TEMPLATES[4],html:'<script>bad</script>'})).not.toHaveProperty('html');expect(()=>validateProject({...TEMPLATES[4],regions:[{id:'r',name:'r',tag:'blocked',color:'#aabbcc',cells:[{row:99,col:1}]}]})).toThrow('区域');});
});
