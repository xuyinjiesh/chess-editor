import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameTable, validateGameZones, zonePlacement, zoneSelections, type GameZone } from './game-zones';
import { customMoveControls, validateCustomView } from './custom-play';
import { TEMPLATES } from './templates';

const project = TEMPLATES[0];
const reserve: GameZone = {id:'reserve',label:'备用棋子',owner:'white',items:[{id:'horse',label:'马',symbol:'马',count:2,action:'deploy-horse',interaction:'place'}]};
const view = (zones: unknown) => validateCustomView({zones,actions:[],moves:[]},project);

describe('portable game zones',()=>{
  it('accepts cards, reserve pieces, counted stacks and empty zones without requiring diagrams',()=>{
    const zones = validateGameZones([reserve,{id:'deck',label:'牌库',owner:'shared',items:[{id:'deck',label:'牌库',count:24}]},{id:'discard',label:'弃牌堆',owner:'shared',items:[],emptyLabel:'尚未弃牌'}]);
    expect(zones[0].items[0]).toMatchObject({symbol:'马',count:2,interaction:'place'});
    expect(zones[0].items[0].offsets).toBeUndefined();
    expect(zones[1].items[0].count).toBe(24);
    expect(zones[2].items).toEqual([]);
  });
  it('rejects invalid ownership, duplicate IDs and actions, excessive content and invalid counts',()=>{
    for (const zones of [null,[{...reserve,owner:'enemy'}],[reserve,reserve],Array(9).fill(reserve),[{...reserve,items:[reserve.items[0],reserve.items[0]]}],[{...reserve,items:[reserve.items[0],{...reserve.items[0],id:'another'}]}],[{...reserve,items:Array(65).fill(reserve.items[0])}]]) expect(()=>validateGameZones(zones)).toThrow();
    for (const changes of [{count:-1},{count:0.5},{count:1000001},{action:'<script>'},{interaction:'html'},{disabled:'false'},{symbol:'x'.repeat(9)},{label:1},{description:'x'.repeat(301)},{offsets:[{row:0,col:3}]},{offsets:[{row:0,col:0}]}]) expect(()=>view([{...reserve,items:[{...reserve.items[0],...changes}]}])).toThrow();
    const huge=Array.from({length:3},(_,i)=>({id:'zone-'+i,label:'zone',owner:'shared',items:Array.from({length:64},(_,n)=>({id:String(n),label:'card'}))}));
    expect(()=>validateGameZones(huge)).toThrow();
    expect(()=>validateCustomView({zones:[reserve],choices:[{action:'deploy-horse',label:'重复',interaction:'move'}],actions:[],moves:[]},project)).toThrow();
  });
  it('reconstructs only known fields and escapes user-provided text when rendering',()=>{
    const zones = validateGameZones([{...reserve,html:'<script>',items:[{...reserve.items[0],label:'<img src=x>',html:'<script>'}]}]);
    expect(zones[0]).not.toHaveProperty('html');expect(zones[0].items[0]).not.toHaveProperty('html');
    const html=renderToStaticMarkup(createElement(GameTable,{zones,project,turn:'white',disabled:false,onSelect:()=>{},children:'board'}));
    expect(html).toContain('&lt;img src=x&gt;');expect(html).not.toContain('<img');
  });
  it('maps older card groups to owned zones and respects an explicit empty zones list',()=>{
    const card={id:'tiger',label:'虎',subtitle:'Tiger',group:'手牌',tone:'white',offsets:[{row:-2,col:0}],action:'card-tiger'};
    const legacy=validateCustomView({cards:[card,{...card,id:'crab',tone:'black',action:undefined}],actions:[],moves:[]},project);
    expect(legacy.zones?.map(z=>z.owner)).toEqual(['white','black']);
    expect(legacy.zones?.[0].items[0].action).toBe('card-tiger');
    expect(validateCustomView({cards:[card],zones:[],actions:[],moves:[]},project).zones).toEqual([]);
  });
  it('keeps zones attached to their board side and swaps them only on board flip',()=>{
    expect(['white','black','shared'].map(owner=>zonePlacement(owner as GameZone['owner'],false))).toEqual(['bottom','top','shared']);
    expect(['white','black','shared'].map(owner=>zonePlacement(owner as GameZone['owner'],true))).toEqual(['top','bottom','shared']);
  });
  it('offers only current-side and shared actions, excluding exhausted or disabled items',()=>{
    const zones=validateGameZones([reserve,{id:'enemy',label:'对手',owner:'black',items:[{id:'e',label:'棋',action:'enemy'}]},{id:'shared',label:'公共区',owner:'shared',items:[{id:'a',label:'可用',action:'available'},{id:'b',label:'用尽',action:'empty',count:0},{id:'c',label:'禁用',action:'blocked',disabled:true}]}]);
    expect(zoneSelections(zones,'white').map(i=>i.action)).toEqual(['deploy-horse','available']);
    expect(zoneSelections(zones,'black').map(i=>i.action)).toEqual(['enemy','available']);
  });
  it('selects a reserve piece for placement and filters hints without consuming a game move',()=>{
    const v=view([reserve]);v.moves=[{action:'deploy-horse',to:{row:3,col:2}},{action:'move',from:{row:1,col:1},to:{row:2,col:1}}];
    const controls=customMoveControls(v,'deploy-horse');
    expect(controls.interaction).toBe('place');
    expect(controls.prepareMove({to:{row:3,col:2}})).toEqual({to:{row:3,col:2},action:'deploy-horse'});
    expect(controls.hints({row:1,col:1})).toEqual([{row:3,col:2}]);
    expect(controls.prepareMove({action:'pass',to:{row:0,col:0}}).action).toBe('pass');
  });
  it('renders inactive items as disabled, and makes no-zone games use their existing board layout',()=>{
    const html=renderToStaticMarkup(createElement(GameTable,{zones:[reserve],project,turn:'black',disabled:false,onSelect:()=>{},children:'board'}));
    expect(html).toContain('disabled=""');expect(html).toContain('数量 2');
    expect(renderToStaticMarkup(createElement(GameTable,{project,turn:'white',disabled:false,onSelect:()=>{},children:'board'}))).toBe('board');
  });
});
