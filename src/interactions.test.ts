import { describe,it,expect } from 'vitest';
import { shortcutFor,themeAccent } from './interactions';
const key=(key:string,extra:Partial<KeyboardEvent>={})=>({key,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,repeat:false,isComposing:false,...extra});
describe('keyboard interactions',()=>{
  it('keeps native text editing and board tools isolated',()=>{
    for(const value of ['f','d','g',' ','e','r','1','Delete','Backspace','+','?'])expect(shortcutFor(key(value),true)).toBeUndefined();
    expect(shortcutFor(key('z',{ctrlKey:true}),true)).toBeUndefined();
    expect(shortcutFor(key('s',{ctrlKey:true}),true)).toBe('save');
  });
  it('leaves all actions except Escape to the open modal',()=>{
    for(const value of ['f','g','s','z',' ','1'])expect(shortcutFor(key(value,{ctrlKey:true}),false,true)).toBeUndefined();
    expect(shortcutFor(key('Escape'),true,true)).toBe('escape');
  });
  it('supports Mac and Windows undo, redo, import and export',()=>{
    for(const modifier of [{ctrlKey:true},{metaKey:true}]){
      expect(shortcutFor(key('z',modifier))).toBe('undo');
      expect(shortcutFor(key('Z',{...modifier,shiftKey:true}))).toBe('redo');
      expect(shortcutFor(key('y',modifier))).toBe('redo');
      expect(shortcutFor(key('s',{...modifier,shiftKey:true}))).toBe('export');
      expect(shortcutFor(key('o',modifier))).toBe('import');
    }
  });
  it('does not toggle repeatedly or during IME composition or Alt combinations',()=>{
    for(const extra of [{repeat:true},{isComposing:true},{altKey:true}])expect(shortcutFor(key('f',extra))).toBeUndefined();
    expect(shortcutFor(key('F',{shiftKey:true}))).toBe('flip');
    expect(shortcutFor(key('9'))).toBe('piece-9');
    expect(shortcutFor(key('F11'))).toBeUndefined();
  });
});
describe('theme presentation',()=>{
  it('keeps the chosen accent intact in day mode and makes it readable at night',()=>{
    expect(themeAccent('#43634d','light')).toBe('#43634d');
    expect(themeAccent('#43634d','dark')).toBe('#88998d');
  });
});
