import { useId, type CSSProperties } from 'react';
import type { Project } from './model';
import { regionGeometry, terrainKind } from './terrain';

export function BoardTerrain({ project, flipped }: { project: Project; flipped: boolean }) {
  const id = useId().replace(/:/g, ''), { rows, cols, pattern } = project.board;
  if (!['grid', 'cells', 'xiangqi'].includes(pattern)) return null;
  return <svg className="board-terrain" viewBox={`0 0 ${cols * 100} ${rows * 100}`} preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <pattern id={`${id}-waves`} width="180" height="36" patternUnits="userSpaceOnUse"><path d="M-40 18Q-10 9 20 18T80 18T140 18T200 18" className="terrain-wave"/></pattern>
      <pattern id={`${id}-hatch`} width="24" height="24" patternUnits="userSpaceOnUse"><path d="M-6 6L6-6M0 24L24 0M18 30L30 18" className="terrain-hatch"/></pattern>
      <pattern id={`${id}-palace`} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M16 6L26 16L16 26L6 16Z" className="palace-grain"/></pattern>
    </defs>
    {pattern === 'xiangqi' && <>
      <g className="terrain-zone terrain-palace">{[50,750].map(y=><g key={y}><rect x="350" y={y} width="200" height="200"/><rect className="palace-texture" x="350" y={y} width="200" height="200" fill={`url(#${id}-palace)`}/></g>)}</g>
      <g className="terrain-zone terrain-river xiangqi-river"><rect className="terrain-fill" x="50" y="450" width="800" height="100"/><rect className="terrain-texture" x="50" y="450" width="800" height="100" fill={`url(#${id}-waves)`}/><path className="terrain-shore" d="M50 460Q250 453 450 460T850 460M50 540Q250 547 450 540T850 540"/></g>
    </>}
    {project.regions.map(region => {
      const { fill, outline } = regionGeometry(region.cells, rows, cols, flipped), kind = terrainKind(region);
      const corner = kind === 'forbidden' ? region.cells.map(c => flipped ? {row:rows-1-c.row,col:cols-1-c.col} : c).sort((a,b)=>a.row-b.row||a.col-b.col)[0] : undefined;
      return <g key={region.id} className={`terrain-zone terrain-${kind}`} style={{ '--region-color': region.color } as CSSProperties}>
        <path className="terrain-fill" d={fill}/>
        {kind !== 'region' && <path className="terrain-texture" d={fill} fill={`url(#${id}-${kind === 'river' ? 'waves' : 'hatch'})`}/>}
        <path className="terrain-outline" d={outline}/>
        {corner && <g className="terrain-corner" transform={`translate(${corner.col*100+12} ${corner.row*100+12})`}><path d="M0 13V0H13"/><text x="18" y="20">禁</text></g>}
      </g>;
    })}
    <g className="terrain-frame"><rect x="14" y="14" width={cols*100-28} height={rows*100-28}/><path d={`M14 36V14H36M${cols*100-36} 14H${cols*100-14}V36M14 ${rows*100-36}V${rows*100-14}H36M${cols*100-36} ${rows*100-14}H${cols*100-14}V${rows*100-36}`} strokeWidth="2"/></g>
  </svg>;
}

export function BoardLegend({ project }: { project: Project }) {
  const regions = project.regions.filter(r => r.cells.length);
  if (!regions.length && project.board.pattern !== 'xiangqi') return null;
  return <div className="board-legend" aria-label="棋盘地形图例">
    {project.board.pattern === 'xiangqi' && <><span><i className="legend-river"/>楚河汉界</span><span><i className="legend-palace"/>九宫</span></>}
    {regions.map(region => <span key={region.id}><i className={`legend-${terrainKind(region)}`} style={{ '--region-color': region.color } as CSSProperties}/>{region.name}</span>)}
    {project.pieceTypes.some(t => t.neutral) && <span><i className="legend-stone"/>{project.pieceTypes.some(t=>t.neutral&&t.id==='river-stone')?'中立河石':'中立棋子'}</span>}
  </div>;
}
