import { boardAppearance } from './appearance.ts';
import { pieceSymbol, type Project } from './model.ts';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

// A standalone vector cover. Generated only from validated design fields;
// exporting and browsing a cover never executes custom rule code.
export function galleryCover(project: Project): string {
  const { rows, cols, pattern, light, dark } = project.board, unit = 44, margin = 26;
  const width = cols * unit + margin * 2, height = rows * unit + margin * 2, theme = boardAppearance(project.board);
  const lines: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><title>${escape(project.name)}</title>`, `<rect width="${width}" height="${height}" rx="18" fill="${theme.frameA}"/>`, `<g transform="translate(${margin} ${margin})">`];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const fill = pattern === 'checker' && (row + col) % 2 ? dark : light;
    if (pattern === 'hex') {
      const x = col * unit, y = row * unit;
      lines.push(`<polygon points="${x + 11},${y + 2} ${x + 33},${y + 2} ${x + 43},${y + 22} ${x + 33},${y + 42} ${x + 11},${y + 42} ${x + 1},${y + 22}" fill="${fill}" stroke="${theme.text}" stroke-opacity=".2"/>`);
    } else lines.push(`<rect x="${col * unit}" y="${row * unit}" width="${unit}" height="${unit}" fill="${fill}"/>`);
  }
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
  }
  for (const region of project.regions) for (const c of region.cells) lines.push(`<rect x="${c.col * unit + 2}" y="${c.row * unit + 2}" width="40" height="40" rx="5" fill="${region.color}" fill-opacity=".3"/>`);
  for (const piece of project.pieces) {
    const type = project.pieceTypes.find(p => p.id === piece.type)!;
    const x = piece.col * unit + unit / 2, y = piece.row * unit + unit / 2, white = piece.side === 'white';
    if (type.shape !== 'chess') lines.push(`<circle cx="${x}" cy="${y}" r="17" fill="${white ? '#fffdf4' : '#303730'}" stroke="${white ? '#9a927e' : '#141b17'}" stroke-width="1.5"/>`);
    if (type.shape !== 'stone') lines.push(`<text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="central" font-family="'Segoe UI Symbol','Noto Sans Symbols 2',serif" font-size="${type.shape === 'chess' ? 35 : 24}" fill="${white ? type.shape === 'chess' ? '#fffdf4' : '#843d2c' : type.shape === 'chess' ? '#202a23' : '#fffdf4'}" ${type.shape === 'chess' ? 'stroke="#37372d" stroke-width=".5" paint-order="stroke"' : ''}>${escape(pieceSymbol(type, piece.side))}</text>`);
  }
  return lines.join('') + '</g></svg>';
}
