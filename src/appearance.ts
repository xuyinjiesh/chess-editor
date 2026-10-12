import type { Project } from './model';

// Ported from the user's chess-editor/styles.css and packs/ui-*.json.
export const BOARD_THEMES = [
  {id:'wood',name:'经典木色',light:'#f0d9b5',dark:'#d8b98c',frameA:'#cb9a5d',frameB:'#a9793f',line:'rgba(74,48,18,.55)',text:'#3a2a16'},
  {id:'jade',name:'温润玉石',light:'#eaf2ec',dark:'#d5e5db',frameA:'#a8bfb1',frameB:'#8ba596',line:'rgba(30,60,45,.55)',text:'#2c4a3a'},
  {id:'marble',name:'浅色大理石',light:'#fbfbf9',dark:'#e7e8e5',frameA:'#dedbd4',frameB:'#c8c4bb',line:'rgba(0,0,0,.32)',text:'#33312e'},
  {id:'ink',name:'水墨素纸',light:'#faf8f4',dark:'#faf8f4',frameA:'#efeade',frameB:'#e2dccd',line:'rgba(40,36,30,.55)',text:'#33302a'},
  {id:'midnight',name:'午夜',light:'#242b36',dark:'#1d232c',frameA:'#2b3340',frameB:'#171c24',line:'rgba(255,255,255,.32)',text:'#b9c4d2'},
  {id:'nebula',name:'星云',light:'#1b2140',dark:'#151a33',frameA:'#0a0e20',frameB:'#0a0e20',line:'rgba(160,190,255,.4)',text:'#a9b8d8'},
  {id:'paper',name:'素纸高对比',light:'#ffffff',dark:'#dcdcdc',frameA:'#333333',frameB:'#111111',line:'rgba(0,0,0,.65)',text:'#333333'},
  {id:'goban',name:'木色棋墩',light:'#e8c88a',dark:'#e8c88a',frameA:'#c79850',frameB:'#b8873f',line:'rgba(60,38,10,.75)',text:'#4a3210'},
] as const;
export type BoardTheme = typeof BOARD_THEMES[number]['id'] | 'custom';
export function pieceLetterLayout(symbol:string){
  const chars=Array.from(symbol).slice(0,8),count=chars.length;
  return {chars,columns:count<=2?Math.max(count,1):count<=4?2:3,size:count<=1?58:count===2?34:count<=4?27:count<=6?21:18};
}
export function boardAppearance(board:Project['board']){
  const preset=BOARD_THEMES.find(t=>t.id===board.theme)||BOARD_THEMES.find(t=>board.light===t.light&&board.dark===t.dark);
  if(preset)return preset;
  const rgb=[1,3,5].map(i=>parseInt(board.light.slice(i,i+2),16));
  const dark=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<90;
  return {id:'custom',name:'自定义',frameA:board.dark,frameB:board.dark,line:dark?'rgba(255,255,255,.5)':'rgba(40,36,30,.55)',text:dark?'#b9c4d2':'#3a2a16'};
}
