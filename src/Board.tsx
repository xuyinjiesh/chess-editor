import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { boardAppearance, pieceLetterLayout } from './appearance';
import { BoardTerrain } from './BoardTerrain';
import type { RuleMarker } from './custom-play';
import { coord, sameCell, sideLabel, pieceSymbol, type Cell, type Piece, type PieceType, type Project } from './model';
const CHESS_GLYPHS:Record<string,[string,string]>={k:['♔','♚'],q:['♕','♛'],r:['♖','♜'],b:['♗','♝'],n:['♘','♞'],p:['♙','♟']};
function RiverStone(){
  const id=useId().replace(/:/g,'');
  const outline='M20 18Q41 10 66 14L83 30Q89 46 83 67L70 83Q49 89 30 82L14 64Q9 43 20 18Z';
  return <span className="token neutral river-stone" aria-hidden="true"><svg viewBox="0 0 100 100"><defs><linearGradient id={`${id}-stone`} x1="20%" y1="0" x2="80%" y2="100%"><stop stopColor="var(--stone-light)"/><stop offset="1" stopColor="var(--stone-mid)"/></linearGradient></defs><path d={outline} transform="translate(0 3)" fill="var(--stone-edge)"/><path d={outline} fill={`url(#${id}-stone)`} stroke="var(--stone-edge)" strokeWidth="1"/><path d="M24 23Q40 15 59 19M17 44L21 32M34 78L46 81" fill="none" stroke="var(--stone-light)" strokeWidth="2"/><path className="stone-texture" d="M23 32L39 28L51 33M58 69L73 61M23 61L32 69M64 28L72 36M37 74L45 71" fill="none" stroke="var(--stone-edge)" strokeWidth=".8"/><path d="M50 38L61 50L50 62L39 50Z" fill="none" stroke="var(--stone-symbol)" strokeWidth="3" strokeLinejoin="round"/></svg></span>;
}
export function PieceIcon({type,side='white',symbol,shape='chess'}:{type:string;side?:string;symbol?:string;shape?:PieceType['shape']}){
  if(shape==='stone')return <span className={`stone ${side}`} aria-hidden="true"/>;
  if(shape==='token'&&side==='neutral'&&type==='river-stone')return <RiverStone/>;
  if(shape==='xiangqi'||shape==='token'){
    const {chars,columns,size}=pieceLetterLayout(symbol||(shape==='xiangqi'?'棋':'✦'));
    return <span className={`${shape==='xiangqi'?'xiangqi-piece':'token'} letter-piece ${side}`} style={{'--glyph-cols':columns,'--glyph-size':`${size}cqi`} as CSSProperties} aria-hidden="true"><span className="piece-grain"/><span className="piece-glyph">{chars.map((c,i)=><span className="piece-letter" key={i}>{c}</span>)}</span></span>;
  }
  const glyphs=CHESS_GLYPHS[type];
  // Older exports contain only the white symbol; still show the black glyph.
  const glyph=glyphs&&(!symbol||glyphs.includes(symbol))?glyphs[side==='black'?1:0]:symbol||'♟';
  return <span className={`chess-piece chess-glyph ${side}`} aria-hidden="true">{glyph}</span>;
}

// Draw shared lines once, terminating at the outermost playable intersections.
// Cell-centered games instead place their grid on the boundaries of each cell.
function BoardLines({rows,cols,pattern}:{rows:number;cols:number;pattern:Project['board']['pattern']}){
  if(!['grid','cells','xiangqi'].includes(pattern))return null;
  const w=cols*100,h=rows*100;
  if(pattern==='cells')return <svg className="board-lines cell-lines" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><g>{Array.from({length:cols-1},(_,i)=><line key={`v${i}`} x1={(i+1)*100} y1="0" x2={(i+1)*100} y2={h}/>)}{Array.from({length:rows-1},(_,i)=><line key={`h${i}`} x1="0" y1={(i+1)*100} x2={w} y2={(i+1)*100}/>)}</g></svg>;
  const xiangqi=pattern==='xiangqi',riverTop=450,riverBottom=550;
  const marks=xiangqi?[[2,1],[2,7],[7,1],[7,7],...[0,2,4,6,8].flatMap(c=>[[3,c],[6,c]])]:[];
  return <svg className="board-lines" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
    <g>{Array.from({length:rows},(_,r)=><line key={`h${r}`} x1="50" y1={r*100+50} x2={w-50} y2={r*100+50}/>)}
      {Array.from({length:cols},(_,c)=>{const x=c*100+50;return xiangqi&&c>0&&c<cols-1?<path key={`v${c}`} d={`M${x} 50V${riverTop}M${x} ${riverBottom}V${h-50}`}/>:<line key={`v${c}`} x1={x} y1="50" x2={x} y2={h-50}/>;})}
      {xiangqi&&<path d="M350 50L550 250M550 50L350 250M350 750L550 950M550 750L350 950"/>}
      {marks.map(([r,c])=><path className="starting-mark" key={`${r}-${c}`} d={[-1,1].flatMap(dx=>[-1,1].map(dy=>{if((c===0&&dx<0)||(c===8&&dx>0))return '';const x=c*100+50+dx*12,y=r*100+50+dy*12;return `M${x+dx*13} ${y}H${x}V${y+dy*13}`;})).join('')}/>)}
    </g>
    {xiangqi?<g className="river-labels"><text x="250" y="503">楚 河</text><text x="650" y="503">漢 界</text></g>:rows===15&&cols===15&&<g className="star-points">{[[3,3],[3,11],[7,7],[11,3],[11,11]].map(([r,c])=><circle key={`${r}-${c}`} cx={c*100+50} cy={r*100+50} r="7"/>)}</g>}
  </svg>;
}
function PieceSprite({piece,definition,row,col,selected,exiting,entering,drag,invalid,marker}:{marker?:string;piece:Piece;definition?:PieceType;row:number;col:number;selected:boolean;exiting:boolean;entering:boolean;drag?:{x:number;y:number};invalid?:number}){
  const body=useRef<HTMLDivElement>(null),previous=useRef({side:piece.side,type:piece.type}),arriving=useRef(entering);
  useEffect(()=>{
    const old=previous.current;previous.current={side:piece.side,type:piece.type};
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    if(old.side!==piece.side)body.current?.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(90deg)',offset:.5},{transform:'rotateY(0deg)'}],{duration:320,easing:'ease-in-out'});
    else if(old.type!==piece.type)body.current?.animate([{transform:'scale(.7)',opacity:.4},{transform:'scale(1.12)'},{transform:'scale(1)',opacity:1}],{duration:300});
  },[piece.side,piece.type]);
  useEffect(()=>{
    if(!invalid||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    body.current?.animate([0,-6,6,-4,4,0].map(x=>({transform:`translateX(${x}px)`})),{duration:320});
  },[invalid]);
  return <div className={`piece-sprite ${selected?'is-selected':''} ${exiting?'is-exiting':''} ${drag?'is-dragging':''}`} data-piece-id={piece.id} style={{transform:drag?`translate(${drag.x}px,${drag.y}px)`:`translate(calc(${col} * (100% + var(--piece-gap, 0px))),calc(${row} * (100% + var(--piece-gap, 0px))))`}} aria-hidden="true"><div className={`piece-body ${arriving.current?'is-arriving':''}`} ref={body}><PieceIcon type={piece.type} side={definition?.neutral?'neutral':piece.side} shape={definition?.shape} symbol={definition&&pieceSymbol(definition,piece.side)}/>{marker&&<span className="piece-status-marker">{marker}</span>}</div></div>;
}

type BoardProps={project:Project;pieces:Piece[];selected?:Cell;hints?:Cell[];markers?:RuleMarker[];lastMove?:{from?:Cell;to:Cell};flipped?:boolean;mini?:boolean;onCell?:(c:Cell)=>void;onDrop?:(from:Cell,to:Cell)=>void;onPick?:(cell:Cell)=>void;canDrag?:(piece:Piece)=>boolean;invalid?:{cell:Cell;sequence:number};tool?:string};
export function Board({project,pieces,selected,hints=[],markers=[],lastMove,flipped=false,mini=false,onCell,onDrop,onPick,canDrag,invalid,tool='select'}:BoardProps){
  const {rows,cols,pattern,light,dark,coordinates}=project.board;
  const appearance=boardAppearance(project.board);
  const rowList=Array.from({length:rows},(_,i)=>flipped?rows-1-i:i),colList=Array.from({length:cols},(_,i)=>flipped?cols-1-i:i);
  const board=useRef<HTMLDivElement>(null),previous=useRef(pieces),ready=useRef(false),gesture=useRef<{id:number;piece:Piece;startX:number;startY:number;active:boolean}|undefined>(undefined),lastDrag=useRef(-Infinity);
  const [exits,setExits]=useState<Piece[]>([]),[drag,setDrag]=useState<{id:string;x:number;y:number;target?:Cell}>();
  useLayoutEffect(()=>{
    const removed=previous.current.filter(p=>!pieces.some(n=>n.id===p.id));previous.current=pieces;ready.current=true;
    setExits(old=>[...old.filter(p=>!pieces.some(n=>n.id===p.id)),...removed.filter(p=>!old.some(n=>n.id===p.id))]);
    const timer=setTimeout(()=>setExits([]),220);return()=>clearTimeout(timer);
  },[pieces]);
  useEffect(()=>{gesture.current=undefined;setDrag(undefined);},[flipped,rows,cols,tool]);
  useEffect(()=>{if(gesture.current){gesture.current=undefined;setDrag(undefined);}},[pieces]);
  function point(event:PointerEvent<HTMLDivElement>){
    const el=board.current!,rect=el.getBoundingClientRect(),style=getComputedStyle(el),pad=parseFloat(style.paddingLeft)||0,gap=parseFloat(style.columnGap)||0;
    const w=el.clientWidth-pad*2,h=el.clientHeight-pad*2,cw=(w-gap*(cols-1))/cols,ch=(h-gap*(rows-1))/rows,x=event.clientX-rect.left-el.clientLeft-pad,y=event.clientY-rect.top-el.clientTop-pad;
    const vr=Math.floor(y/(ch+gap)),vc=Math.floor(x/(cw+gap)),target=x>=0&&x<w&&y>=0&&y<h&&vr<rows&&vc<cols?{row:flipped?rows-1-vr:vr,col:flipped?cols-1-vc:vc}:undefined;
    return {x:x-cw/2,y:y-ch/2,target};
  }
  function pointerDown(event:PointerEvent<HTMLDivElement>){
    if(mini||event.button!==0||!event.isPrimary||!onDrop||!['select','play'].includes(tool))return;
    const cell=(event.target as HTMLElement).closest<HTMLElement>('[data-row]');if(!cell)return;
    const piece=pieces.find(p=>p.row===Number(cell.dataset.row)&&p.col===Number(cell.dataset.col));
    if(!piece||canDrag&&!canDrag(piece))return;
    gesture.current={id:event.pointerId,piece,startX:event.clientX,startY:event.clientY,active:false};
  }
  function pointerMove(event:PointerEvent<HTMLDivElement>){
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    if(event.buttons===0){gesture.current=undefined;setDrag(undefined);return;}
    if(!g.active&&Math.hypot(event.clientX-g.startX,event.clientY-g.startY)<6)return;
    if(!g.active){g.active=true;board.current?.setPointerCapture(event.pointerId);onPick?.(g.piece);}
    event.preventDefault();setDrag({id:g.piece.id,...point(event)});
  }
  function pointerEnd(event:PointerEvent<HTMLDivElement>,cancel=false){
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    gesture.current=undefined;setDrag(undefined);
    if(board.current?.hasPointerCapture(event.pointerId))board.current.releasePointerCapture(event.pointerId);
    if(!g.active)return;
    lastDrag.current=performance.now();
    const {target}=point(event);if(!cancel&&target&&!sameCell(g.piece,target))onDrop?.({row:g.piece.row,col:g.piece.col},target);
  }
  return <div className={`board-frame ${mini?'mini':''} ${coordinates&&!mini?'with-coordinates':''}`} style={{'--light':light,'--dark':dark,'--board-text':appearance.text,'--piece-white':project.ui.sideColors?.white,'--piece-black':project.ui.sideColors?.black} as CSSProperties} aria-hidden={mini||undefined}>
    {coordinates&&!mini&&<div className="rank-labels">{rowList.map(r=><span key={r}>{rows-r}</span>)}</div>}
    <div className="board-surface" data-board-theme={appearance.id} data-dark-board={appearance.id==='midnight'||appearance.id==='nebula'||(appearance.id==='custom'&&appearance.text==='#b9c4d2')} style={{'--frame-a':appearance.frameA,'--frame-b':appearance.frameB,'--board-line':appearance.line,'--board-text':appearance.text} as CSSProperties}><div ref={board} className={`board pattern-${pattern} tool-${tool} ${drag?'is-dragging':''}`} role={mini?undefined:'grid'} aria-label={mini?undefined:`${project.name}棋盘`} style={{'--rows':rows,'--cols':cols,'--light':light,'--dark':dark,aspectRatio:`${cols} / ${rows}`} as CSSProperties} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={e=>pointerEnd(e)} onPointerCancel={e=>pointerEnd(e,true)} onLostPointerCapture={()=>{gesture.current=undefined;setDrag(undefined);}}>
      <BoardTerrain project={project} flipped={flipped}/>
      <BoardLines rows={rows} cols={cols} pattern={pattern}/>
      {rowList.flatMap(row=>colList.map(col=>{
        const cell={row,col},piece=pieces.find(p=>sameCell(p,cell)),definition=piece&&project.pieceTypes.find(t=>t.id===piece.type),regions=project.regions.filter(r=>r.cells.some(c=>sameCell(c,cell)));
        const legacyRegions=['checker','hex'].includes(pattern)?regions:[];
        if(mini)return <div key={`${row}-${col}`} className={`cell ${(row+col)%2?'dark':'light'}`}>{legacyRegions.map(r=><span key={r.id} className="region-mark" style={{background:r.color+'55',borderColor:r.color}}/>)}{piece&&<PieceIcon type={piece.type} side={definition?.neutral?'neutral':piece.side} shape={definition?.shape} symbol={definition&&pieceSymbol(definition,piece.side)}/>}</div>;
        return <button type="button" key={`${row}-${col}`} data-row={row} data-col={col} className={`cell ${(row+col)%2?'dark':'light'} ${selected&&sameCell(selected,cell)?'selected':''} ${lastMove&&(sameCell(lastMove.to,cell)||(lastMove.from&&sameCell(lastMove.from,cell)))?'last-move':''} ${drag?.target&&sameCell(drag.target,cell)?'drag-target':''} ${invalid&&sameCell(invalid.cell,cell)?'invalid-target':''}`}
          aria-label={`${coord(cell,rows)}${piece?` ${definition?.neutral?'中立':sideLabel(project,piece.side)}${definition?.shape==='xiangqi'?pieceSymbol(definition,piece.side):definition?.name||piece.type}`:' 空格'}${markers.find(m=>sameCell(m.cell,cell))?' '+markers.find(m=>sameCell(m.cell,cell))!.label:''}`} title={regions.map(r=>r.name).join(' · ')||undefined} role={mini?undefined:'gridcell'} tabIndex={mini?-1:0}
          onClick={e=>{if(e.detail>0&&performance.now()-lastDrag.current<250)return;onCell?.(cell);}}>
          {legacyRegions.map(r=><span key={r.id} className="region-mark" style={{background:r.color+'55',borderColor:r.color}} title={r.name}/>)}
          {hints.some(h=>sameCell(h,cell))&&<span className={`move-hint ${piece?'capture':''}`}/>}
        </button>;
      }))}
      {!mini&&<div className="piece-layer">{[...pieces,...exits.filter(p=>!pieces.some(n=>n.id===p.id))].map(piece=><PieceSprite key={piece.id} piece={piece} marker={pieces.some(p=>p.id===piece.id)?markers.find(m=>sameCell(m.cell,piece))?.label:undefined} definition={project.pieceTypes.find(t=>t.id===piece.type)} row={flipped?rows-1-piece.row:piece.row} col={flipped?cols-1-piece.col:piece.col} selected={!!selected&&sameCell(selected,piece)} exiting={!pieces.some(p=>p.id===piece.id)} entering={ready.current} drag={drag?.id===piece.id?drag:undefined} invalid={invalid&&sameCell(invalid.cell,piece)?invalid.sequence:undefined}/>)}</div>}
    </div></div>
    {coordinates&&!mini&&<div className="file-labels">{colList.map(c=><span key={c}>{String.fromCharCode(97+c)}</span>)}</div>}
  </div>;
}
