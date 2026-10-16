import { createBoardTopology } from './board-geometry';
import { validateProject, type GameState, type Move, type Project, type RuleResult } from './model';

// Opaque-origin iframe -> dedicated worker. Each search reuses one sandbox for
// all its simulated moves. CSP blocks network, DOM and application storage.
export function runSandbox<T>(workerCode: string, payload: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('已取消', 'AbortError')); return; }
    const frame = document.createElement('iframe');
    frame.hidden = true; frame.setAttribute('sandbox', 'allow-scripts');
    const token = crypto.randomUUID();
    const script = `const token=${JSON.stringify(token)}; const worker=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerCode)}],{type:'text/javascript'}))); worker.onmessage=e=>parent.postMessage({token,...e.data},'*'); worker.onerror=e=>parent.postMessage({token,error:e.message||'沙箱执行失败'},'*'); addEventListener('message',e=>{if(e.source!==parent||e.data.token!==token)return;if(e.data.stop){worker.terminate();return;}worker.postMessage(e.data.payload)}); parent.postMessage({token,ready:true},'*');`;
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; child-src 'none'"><script>${script.replace(/<\/script/gi, '<\\/script')}<\/script>`;
    const cleanup = () => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      window.removeEventListener('message', receive);
      frame.contentWindow?.postMessage({ token, stop: true }, '*'); frame.remove();
    };
    const abort = () => { cleanup(); reject(new DOMException('已取消', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`规则执行超过 ${timeoutMs / 1000} 秒，已停止。请检查死循环或递归。`)); }, timeoutMs);
    function receive(event: MessageEvent) {
      if (event.source !== frame.contentWindow || event.data?.token !== token) return;
      if (event.data.ready) { frame.contentWindow?.postMessage({ token, payload }, '*'); return; }
      cleanup();
      if (event.data.error) reject(new Error(String(event.data.error))); else resolve(event.data.result);
    }
    signal?.addEventListener('abort', abort, { once: true });
    window.addEventListener('message', receive); document.body.appendChild(frame);
  });
}

export async function runRule(code: string, state: GameState, move: Move, project: Project, signal?: AbortSignal): Promise<RuleResult> {
  const workerCode = `onmessage = async (event) => { try {
    const {code, state, move, project} = event.data;
    const execute = new Function('state', 'move', 'project', 'boardTopology', code + '\\n;if (typeof onMove !== "function") throw new Error("请定义 onMove(state, move, project) 函数"); return onMove(state, move, project);');
    const result = await execute(state, move, project, (${createBoardTopology.toString()})(project.board)); postMessage({result});
  } catch (error) {postMessage({error:String(error.message || error)})} };`;
  const r = await runSandbox<RuleResult>(workerCode, { code, state, move, project }, 2000, signal);
  if (!r || typeof r.valid !== 'boolean') throw new Error('规则需要返回 { valid: boolean, ... }。');
  if (r.message !== undefined && typeof r.message !== 'string') throw new Error('规则 message 必须是文本。');
  if (r.valid) {
    if (!['white', 'black'].includes(r.turn!) || ![undefined, null, 'white', 'black', 'draw'].includes(r.winner)) throw new Error('规则返回的回合或胜负无效。');
    validateProject({ ...project, pieces: r.pieces });
    if (r.data !== undefined && (!r.data || typeof r.data !== 'object' || Array.isArray(r.data) || JSON.stringify(r.data).length > 50000)) throw new Error('自定义状态 data 必须是小于 50 KB 的对象。');
  }
  return r;
}
