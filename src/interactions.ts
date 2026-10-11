import { useLayoutEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark';
export const THEME_KEY = 'qijing-theme-v1';
export function initialTheme():Theme {
  try {const saved=localStorage.getItem(THEME_KEY);if(saved==='light'||saved==='dark')return saved;}catch{/* private browsing */}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light';
}
export function themeAccent(hex:string,theme:Theme){
  if(theme==='light')return hex;
  return '#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*.55+220*.45).toString(16).padStart(2,'0')).join('');
}

export type Shortcut = 'save'|'export'|'import'|'undo'|'redo'|'escape'|'select'|'place'|'erase'|'region'|'flip'|'theme'|'focus'|'play'|'delete'|'zoom-in'|'zoom-out'|'zoom-reset'|'help'|`piece-${number}`;
type KeyInput = Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'shiftKey'|'altKey'|'repeat'|'isComposing'>;
// Keep the resolver independent of the DOM: text editing and modal focus must
// never accidentally modify the underlying board.
export function shortcutFor(e:KeyInput,typing=false,modal=false):Shortcut|undefined {
  if(e.isComposing||e.altKey||e.repeat)return;
  if(e.key==='Escape')return 'escape';
  if(modal)return;
  const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
  if(mod){
    if(key==='s')return e.shiftKey?'export':'save';
    if(typing)return;
    if(key==='z')return e.shiftKey?'redo':'undo';
    if(key==='y')return 'redo';
    if(key==='o')return 'import';
    return;
  }
  if(typing)return;
  if(/^[1-9]$/.test(key))return `piece-${Number(key)}`;
  return ({v:'select',p:'place',e:'erase',r:'region',f:'flip',d:'theme',g:'focus',' ':'play',delete:'delete',backspace:'delete','+':'zoom-in','=':'zoom-in','-':'zoom-out','0':'zoom-reset','?':'help'} as Record<string,Shortcut>)[key];
}
export function isTypingTarget(target:EventTarget|null){
  return target instanceof HTMLElement&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
}

// The viewport already excludes headings/toolbars. Fit the board and both
// player strips to its actual size, including rectangular and tall boards.
export function useBoardFit(rows:number,cols:number,coordinates:boolean){
  const ref=useRef<HTMLDivElement>(null),[size,setSize]=useState(480);
  useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    const measure=()=>{
      const {width,height}=el.getBoundingClientRect(),left=coordinates?24:0,bottom=coordinates?22:0,frame=28;
      const fit=(height-92-bottom-frame-8)*cols/rows+left+frame;
      setSize(Math.max(48,Math.floor(Math.min(width-8,fit))));
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(el);
    return()=>observer.disconnect();
  },[rows,cols,coordinates]);
  return {ref,size};
}

export const SHORTCUTS=[
  ['保存作品','Ctrl / ⌘ S'],['导出项目','Ctrl / ⌘ ⇧ S'],['导入项目','Ctrl / ⌘ O'],
  ['撤销','Ctrl / ⌘ Z'],['重做','Ctrl / ⌘ ⇧ Z / Y'],['编辑 / 试玩','Space'],
  ['选择 / 放置','V / P'],['擦除 / 区域','E / R'],['选择棋子类型','1 – 9'],
  ['删除选中棋子','Delete'],['翻转棋盘','F'],['夜间 / 日间','D'],
  ['放大 / 退出放大','G'],['缩放 / 还原','+ / − / 0'],['取消 / 退出放大','Esc'],['打开本指南','?'],
];
