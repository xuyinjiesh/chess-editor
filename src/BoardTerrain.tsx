import { useId, type CSSProperties } from 'react';
import type { Project } from './model';
import { hexBoundaryPath, boardMetrics, cellCenter } from './board-geometry';
import { footballPitchPath, hasFootballPitch, regionGeometry, terrainKind } from './terrain';

export function BoardTerrain({ project, flipped }: { project: Project; flipped: boolean }) {
  const id = useId().replace(/:/g, ''), { rows, cols, pattern } = project.board;
  if (!['grid', 'cells', 'xiangqi', 'hex'].includes(pattern)) return null;
  const metrics = boardMetrics(project.board);
  return <svg className="board-terrain" viewBox={`0 0 ${metrics.width} ${metrics.height}`} preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <pattern id={`${id}-waves`} width="180" height="36" patternUnits="userSpaceOnUse"><path d="M-40 18Q-10 9 20 18T80 18T140 18T200 18" className="terrain-wave"/></pattern>
      <pattern id={`${id}-hatch`} width="24" height="24" patternUnits="userSpaceOnUse"><path d="M-6 6L6-6M0 24L24 0M18 30L30 18" className="terrain-hatch"/></pattern>
      <pattern id={`${id}-palace`} width="32" height="32" patternUnits="userSpaceOnUse"><path d="M16 6L26 16L16 26L6 16Z" className="palace-grain"/></pattern>
    </defs>
    {pattern === 'xiangqi' && <>
      <g className="terrain-zone terrain-palace">{[50,750].map(y=><g key={y}><rect x="350" y={y} width="200" height="200"/><rect className="palace-texture" x="350" y={y} width="200" height="200" fill={`url(#${id}-palace)`}/></g>)}</g>
      <g className="terrain-zone terrain-river xiangqi-river"><rect className="terrain-fill" x="50" y="450" width="800" height="100"/><rect className="terrain-texture" x="50" y="450" width="800" height="100" fill={`url(#${id}-waves)`}/><path className="terrain-shore" d="M50 460Q250 453 450 460T850 460M50 540Q250 547 450 540T850 540"/></g>
    </>}
    {hasFootballPitch(project) && <path d={footballPitchPath} className="football-pitch-lines"/>}
    {project.regions.map(region => {
      if (pattern === 'hex' && /^hex-edge-(top|bottom|left|right)$/.test(region.tag)) return <path key={region.id} className="hex-goal-edge" d={hexBoundaryPath(project.board, region.tag.slice(9), flipped)} stroke={region.color}/>;
      const { fill, outline } = regionGeometry(region.cells, rows, cols, flipped, pattern, project.board.hexLayout), kind = terrainKind(region);
      const corner = kind === 'forbidden' ? region.cells.map(c => cellCenter(project.board,c,flipped)).sort((a,b)=>a.y-b.y||a.x-b.x)[0] : undefined;
      return <g key={region.id} className={`terrain-zone terrain-${kind}`} style={{ '--region-color': region.color } as CSSProperties}>
        <path className="terrain-fill" d={fill}/>
        {kind !== 'region' && <path className="terrain-texture" d={fill} fill={`url(#${id}-${kind === 'river' ? 'waves' : 'hatch'})`}/>}
        <path className="terrain-outline" d={outline}/>
        {corner && <g className="terrain-corner" transform={`translate(${corner.x-(pattern==='hex'?25:38)} ${corner.y-(pattern==='hex'?25:38)})`}><path d="M0 13V0H13"/><text x="18" y="20">禁</text></g>}
      </g>;
    })}
    {pattern!=='hex'&&<g className="terrain-frame"><rect x="14" y="14" width={cols*100-28} height={rows*100-28}/><path d={`M14 36V14H36M${cols*100-36} 14H${cols*100-14}V36M14 ${rows*100-36}V${rows*100-14}H36M${cols*100-36} ${rows*100-14}H${cols*100-14}V${rows*100-36}`} strokeWidth="2"/></g>}
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
