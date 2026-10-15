// Shared vector artwork for the canonical rock / paper / scissors tokens.
// Match both type and symbol so editing a token's symbol still restores text.
// Paths use a 64 × 64 viewBox and currentColor for either player's ink.
type InkPath = { d: string; fill: 'none' | 'currentColor'; fillOpacity?: number; strokeOpacity?: number; strokeWidth?: number };
type TokenArtwork = { symbol: string; paths: InkPath[] };
const artwork: Record<string, TokenArtwork> = {
  rock: { symbol: '石', paths: [
    {d:'M9 43L13 26L25 14L43 13L54 26L56 42L44 52L24 53Z',fill:'currentColor',fillOpacity:.14},
    {d:'M13 26L29 29L43 13M29 29L36 43L56 42M36 43L24 53',fill:'none',strokeOpacity:.65,strokeWidth:2.5},
    {d:'M13 26L25 14L29 29Z',fill:'currentColor',fillOpacity:.16,strokeWidth:0},
    {d:'M36 43L56 42L44 52L24 53Z',fill:'currentColor',fillOpacity:.18,strokeWidth:0},
  ]},
  paper: { symbol: '布', paths: [
    {d:'M18 9H39L51 21V50Q51 55 46 55H18Q13 55 13 50V14Q13 9 18 9Z',fill:'currentColor',fillOpacity:.08},
    {d:'M39 9V18Q39 21 42 21H51',fill:'currentColor',fillOpacity:.22},
    {d:'M22 31H42M22 39H42M22 47H34',fill:'none',strokeWidth:3},
  ]},
  scissors: { symbol: '剪', paths: [
    {d:'M23 24L34 34M23 40L34 30',fill:'none',strokeWidth:4},
    {d:'M29 29L53 11L44 29L35 36Z',fill:'currentColor',fillOpacity:.2,strokeWidth:2.8},
    {d:'M29 35L53 53L44 35L35 28Z',fill:'currentColor',fillOpacity:.2,strokeWidth:2.8},
    {d:'M24 18a8 8 0 1 1-16 0a8 8 0 1 1 16 0M24 46a8 8 0 1 1-16 0a8 8 0 1 1 16 0',fill:'none',strokeWidth:4},
    {d:'M35 32a3 3 0 1 1-6 0a3 3 0 1 1 6 0',fill:'currentColor',strokeWidth:0},
  ]},
};

export function tokenArtwork(type: string, symbol: string | undefined, shape: string) {
  const icon = Object.hasOwn(artwork,type) ? artwork[type] : undefined;
  return shape === 'token' && icon?.symbol === symbol ? icon : undefined;
}
