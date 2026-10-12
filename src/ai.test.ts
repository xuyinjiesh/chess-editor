import {afterEach,describe,expect,it,vi} from 'vitest';
import {generateProject} from './ai';
import {TEMPLATES} from './templates';
const settings={endpoint:'https://example.com/v1/',model:'test-model',key:'test-key'};
afterEach(()=>vi.unstubAllGlobals());
describe('AI generation contract',()=>{
  it('sends the schema to the configured provider and validates the proposal',async()=>{
    const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'```json\n'+JSON.stringify(TEMPLATES[3])+'\n```'}}]}),{status:200}));
    vi.stubGlobal('fetch',mock);
    const result=await generateProject('设计井字棋',TEMPLATES[0],settings,new AbortController().signal);
    expect(result.name).toBe('井字棋');expect(mock.mock.calls[0][0]).toBe('https://example.com/v1/chat/completions');
    const options=mock.mock.calls[0][1];expect(options.headers.Authorization).toBe('Bearer test-key');expect(JSON.parse(options.body).model).toBe('test-model');
    const instruction=JSON.parse(options.body).messages[0].content;expect(instruction).toContain('getLegalMoves');expect(instruction).toContain('evaluate');expect(instruction).toContain('额外回合');
  });
  it('rejects malformed generated project data without applying it',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{"version":1,"name":"broken"}'}}]}))));await expect(generateProject('test',TEMPLATES[0],settings,new AbortController().signal)).rejects.toThrow('校验');});
  it('surfaces provider errors and propagates cancellation',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:'Invalid API key'}}),{status:401})));await expect(generateProject('test',TEMPLATES[0],settings,new AbortController().signal)).rejects.toThrow('401');const controller=new AbortController();controller.abort();vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new DOMException('Aborted','AbortError')));await expect(generateProject('test',TEMPLATES[0],settings,controller.signal)).rejects.toHaveProperty('name','AbortError');});
  it('rejects non-http endpoints before a request',async()=>{const mock=vi.fn();vi.stubGlobal('fetch',mock);await expect(generateProject('test',TEMPLATES[0],{...settings,endpoint:'file:///tmp/api'},new AbortController().signal)).rejects.toThrow('HTTP');expect(mock).not.toHaveBeenCalled();});
});
