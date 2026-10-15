import { boardAppearance, pieceLetterLayout } from './appearance.ts';
import { tokenArtwork } from './piece-art.ts';
import { pieceSymbol, type Project } from './model.ts';
import { footballPitchPath, hasFootballPitch, regionGeometry, terrainKind } from './terrain.ts';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const font = "'KaiTi','STKaiti','SimSun','Songti SC',serif";
const rock = 'M20 18Q41 10 66 14L83 30Q89 46 83 67L70 83Q49 89 30 82L14 64Q9 43 20 18Z';

// A standalone vector cover. Generated only from validated design fields;
// exporting and browsing a cover never executes custom rule code.
export function galleryCover(project: Project): string {
  const { rows, cols, pattern, light, dark } = project.board, unit = 44, margin = 26;
  const width = cols * unit + margin * 2, height = rows * unit + margin * 2, theme = boardAppearance(project.board);
  const river = theme.id === 'midnight' || theme.id === 'nebula' || theme.text === '#b9c4d2' ? '#567f79' : '#9bbdb1';
  const lines: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><title>${escape(project.name)}</title>`, `<defs><linearGradient id="piece-face" x2=".7" y2="1"><stop stop-color="#fffbee"/><stop offset="1" stop-color="#e6d7b9"/></linearGradient><linearGradient id="rock-face" x2=".8" y2="1"><stop stop-color="#bac9bb"/><stop offset="1" stop-color="#91a491"/></linearGradient><pattern id="river-waves" width="180" height="36" patternUnits="userSpaceOnUse"><path d="M-40 18Q-10 9 20 18T80 18T140 18T200 18" fill="none" stroke="${river}" stroke-width="1.15"/></pattern><pattern id="zone-hatch" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M-6 6L6-6M0 24L24 0M18 30L30 18" fill="none" stroke="${theme.text}" stroke-width="1.2"/></pattern></defs>`, `<rect width="${width}" height="${height}" rx="12" fill="${theme.frameA}"/><rect x="6" y="6" width="${width-12}" height="${height-12}" rx="7" fill="none" stroke="${theme.frameB}" stroke-opacity=".6"/>`, `<g transform="translate(${margin} ${margin})">`];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const fill = pattern === 'checker' && (row + col) % 2 ? dark : light;
    if (pattern === 'hex') {
      const x = col * unit, y = row * unit;
      lines.push(`<polygon points="${x + 11},${y + 2} ${x + 33},${y + 2} ${x + 43},${y + 22} ${x + 33},${y + 42} ${x + 11},${y + 42} ${x + 1},${y + 22}" fill="${fill}" stroke="${theme.text}" stroke-opacity=".2"/>`);
    } else lines.push(`<rect x="${col * unit}" y="${row * unit}" width="${unit}" height="${unit}" fill="${fill}"/>`);
  }
  // Match the live board's continuous terrain, behind the intersection grid.
  lines.push('<g transform="scale(.44)">');
  if (pattern === 'xiangqi') lines.push(`<rect x="50" y="450" width="800" height="100" fill="${river}" fill-opacity=".45"/><rect x="50" y="450" width="800" height="100" fill="url(#river-waves)" opacity=".4"/><g fill="${theme.text}" fill-opacity=".065"><rect x="350" y="50" width="200" height="200"/><rect x="350" y="750" width="200" height="200"/></g>`);
  for (const region of ['grid', 'cells', 'xiangqi'].includes(pattern) ? project.regions : []) {
    const { fill, outline } = regionGeometry(region.cells, rows, cols), kind = terrainKind(region);
    lines.push(`<path d="${fill}" fill="${region.color}" fill-opacity="${kind === 'river' ? '.38' : '.14'}"/>`);
    if (kind !== 'region') lines.push(`<path d="${fill}" fill="url(#${kind === 'river' ? 'river-waves' : 'zone-hatch'})" opacity="${kind === 'river' ? '.4' : '.16'}"/>`);
    lines.push(`<path d="${outline}" fill="none" stroke="${region.color}" stroke-opacity=".6" stroke-width=".65" vector-effect="non-scaling-stroke"/>`);
  }
  if (hasFootballPitch(project)) lines.push(`<path d="${footballPitchPath}" fill="none" stroke="#f3f6df" stroke-width="6"/>`);
  lines.push('</g>');
  if (['checker', 'hex'].includes(pattern)) for (const region of project.regions) for (const c of region.cells) lines.push(`<rect x="${c.col * unit + 2}" y="${c.row * unit + 2}" width="40" height="40" rx="5" fill="${region.color}" fill-opacity=".3"/>`);
  if (['grid', 'xiangqi', 'cells'].includes(pattern)) {
    const cells = pattern === 'cells', start = cells ? 0 : unit / 2, endX = cols * unit - start, endY = rows * unit - start;
    lines.push(`<g stroke="${theme.text}" stroke-opacity=".45" fill="none">`);
    for (let row = 0; row < (cells ? rows + 1 : rows); row++) lines.push(`<path d="M${start} ${start + row * unit}H${endX}"/>`);
    for (let col = 0; col < (cells ? cols + 1 : cols); col++) {
      const x = start + col * unit;
      lines.push(pattern === 'xiangqi' && col > 0 && col < cols - 1 ? `<path d="M${x} ${start}V198M${x} 242V${endY}"/>` : `<path d="M${x} ${start}V${endY}"/>`);
    }
    if (pattern === 'xiangqi') lines.push('<path d="M154 22L242 110M242 22L154 110M154 330L242 418M242 330L154 418"/>');
    lines.push('</g>');
    if (pattern === 'xiangqi') lines.push(`<g fill="${theme.text}" font-family="${font}" font-size="18" text-anchor="middle" dominant-baseline="central"><text x="110" y="220">楚 河</text><text x="286" y="220">漢 界</text></g>`);
  }
  for (const piece of project.pieces) {
    const type = project.pieceTypes.find(p => p.id === piece.type)!;
    const x = piece.col * unit + unit / 2, y = piece.row * unit + unit / 2, white = piece.side === 'white', neutral = type.neutral;
    const symbol = pieceSymbol(type,piece.side);
    if (neutral && type.id === 'river-stone' && type.shape === 'token') {
      lines.push(`<g transform="translate(${x-16.94} ${y-16.94}) scale(.3388)"><path d="${rock}" transform="translate(0 3)" fill="#748977"/><path d="${rock}" fill="url(#rock-face)" stroke="#748977"/><path d="M50 38L61 50L50 62L39 50Z" fill="none" stroke="#4e6656" stroke-width="3" stroke-linejoin="round"/></g>`);
    } else if (type.shape === 'stone') {
      lines.push(`<circle cx="${x}" cy="${y}" r="17" fill="${white ? '#fffdf4' : '#303730'}" stroke="${white ? '#9a927e' : '#141b17'}" stroke-width="1.5"/>`);
    } else if (type.shape === 'chess') {
      lines.push(`<text x="${x}" y="${y+1}" text-anchor="middle" dominant-baseline="central" font-family="'Segoe UI Symbol','Noto Sans Symbols 2',serif" font-size="35" fill="${white ? '#fffdf4' : '#202a23'}" stroke="#37372d" stroke-width=".5" paint-order="stroke">${escape(symbol)}</text>`);
    } else {
      const ink = neutral ? '#34473b' : project.ui.sideColors?.[piece.side] || (white ? type.shape === 'xiangqi' ? '#a2392d' : '#2f6b63' : '#344138');
      const artwork = tokenArtwork(type.id,symbol,type.shape);
      if (artwork) {
        lines.push(`<g aria-label="${escape(type.name)}" color="${ink}"><circle cx="${x}" cy="${y+1.4}" r="18.48" fill="#bda578"/><circle cx="${x}" cy="${y}" r="18.48" fill="url(#piece-face)"/><circle cx="${x}" cy="${y}" r="15.5" fill="none" stroke="${ink}" stroke-opacity=".3" stroke-width=".7"/><circle cx="${x}" cy="${y}" r="14.05" fill="none" stroke="${ink}" stroke-opacity=".17" stroke-width=".5"/><g transform="translate(${x-15.1536} ${y-15.1536}) scale(.47355)" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">`);
        for (const path of artwork.paths) lines.push(`<path d="${path.d}" fill="${path.fill}"${path.fillOpacity !== undefined ? ` fill-opacity="${path.fillOpacity}"` : ''}${path.strokeOpacity !== undefined ? ` stroke-opacity="${path.strokeOpacity}"` : ''}${path.strokeWidth !== undefined ? ` stroke-width="${path.strokeWidth}"` : ''}/>`);
        lines.push('</g></g>');
        continue;
      }
      const {chars,columns,size} = pieceLetterLayout(symbol), fontSize = size/100*36.96, textRows = Math.ceil(chars.length/columns);
      lines.push(`<circle cx="${x}" cy="${y+1.4}" r="18.48" fill="#bda578"/><circle cx="${x}" cy="${y}" r="18.48" fill="${neutral ? '#c3d0c2' : 'url(#piece-face)'}"/><circle cx="${x}" cy="${y}" r="15.5" fill="none" stroke="${ink}" stroke-opacity=".3" stroke-width=".7"/><circle cx="${x}" cy="${y}" r="14.05" fill="none" stroke="${ink}" stroke-opacity=".17" stroke-width=".5"/><text aria-label="${escape(symbol)}" fill="${ink}" font-family="${font}" font-weight="600" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">`);
      chars.forEach((char,index) => {
        const row = Math.floor(index/columns), rowLength = Math.min(columns,chars.length-row*columns);
        lines.push(`<tspan x="${x+(index%columns-(rowLength-1)/2)*fontSize}" y="${y+(row-(textRows-1)/2)*fontSize}">${escape(char)}</tspan>`);
      });
      lines.push('</text>');
    }
  }
  return lines.join('') + '</g></svg>';
}
