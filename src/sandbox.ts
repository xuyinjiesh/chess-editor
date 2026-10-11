import { validateProject, type GameState, type Move, type Project, type RuleResult } from './model';
// Opaque-origin iframe -> dedicated worker. The iframe CSP is inherited by its
// blob worker: no network, no frames, no DOM access, no application storage.
// Parent owns the deadline and destroys the entire sandbox on every request.
export function runRule(code:string,state:GameState,move:Move,project:Project):Promise<RuleResult>{
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');
    frame.hidden=true; frame.setAttribute('sandbox','allow-scripts');
    const token=crypto.randomUUID();
    const workerCode=`onmessage = async (event) => { try {
      const {code, state, move, project} = event.data;
      const execute = new Function('state', 'move', 'project', code + '\\n;if (typeof onMove !== "function") throw new Error("请定义 onMove(state, move, project) 函数"); return onMove(state, move, project);');
      const result = await execute(state, move, project);
      postMessage({result});
    } catch (error) {postMessage({error:String(error.message || error)})} };`;
    const script=`const token=${JSON.stringify(token)}; const worker=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerCode)}],{type:'text/javascript'}))); worker.onmessage=e=>parent.postMessage({token,...e.data},'*');worker.onerror=e=>parent.postMessage({token,error:e.message||'沙箱执行失败'},'*');addEventListener('message',e=>{if(e.source===parent&&e.data.token===token)worker.postMessage(e.data.payload)}); parent.postMessage({token,ready:true},'*');`;
    frame.srcdoc=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; child-src 'none'"><script>${script.replace(/<\/script/gi,'<\\/script')}<\/script>`;
    const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();};
    const timer=setTimeout(()=>{cleanup();reject(new Error('规则执行超过 2 秒，已停止。请检查死循环或递归。'));},2000);
    function receive(event:MessageEvent){
      if(event.source!==frame.contentWindow||event.data?.token!==token)return;
      if(event.data.ready){frame.contentWindow?.postMessage({token,payload:{code,state,move,project}},'*');return;}
      cleanup();
      if(event.data.error){reject(new Error(event.data.error));return;}
      try {
        const r=event.data.result;
        if(!r||typeof r.valid!=='boolean')throw new Error('规则需要返回 { valid: boolean, ... }。');
        if(r.message!==undefined&&typeof r.message!=='string')throw new Error('规则 message 必须是文本。');
        if(r.valid){
          if(!['white','black'].includes(r.turn)||![undefined,null,'white','black','draw'].includes(r.winner))throw new Error('规则返回的回合或胜负无效。');
          validateProject({...project,pieces:r.pieces});
          if(r.data!==undefined&&(!r.data||typeof r.data!=='object'||Array.isArray(r.data)||JSON.stringify(r.data).length>50000))throw new Error('自定义状态 data 必须是小于 50 KB 的对象。');
        }
        resolve(r);
      }catch(error){reject(error);}
    }
    window.addEventListener('message',receive);document.body.appendChild(frame);
  });
}
