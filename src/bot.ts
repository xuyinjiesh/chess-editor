import type { GameState, Project } from './model';
import { BOT_LIMITS, searchGame, type BotDifficulty, type SearchResult } from './bot-search';
import { customAdapter } from './bot-custom';
import { runSandbox } from './sandbox';

export function validateSearchResult(value: unknown, project: Project): SearchResult {
  if (!value || typeof value !== 'object') throw new Error('AI 引擎返回了无效结果。');
  const result = value as SearchResult;
  const cell = (c: { row: number; col: number }) => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.row < project.board.rows && c.col >= 0 && c.col < project.board.cols;
  if (![result.depth, result.nodes, result.elapsedMs].every(n => Number.isSafeInteger(n) && n >= 0) ||
    (result.move !== null && (!result.move || !cell(result.move.to) || (result.move.from !== undefined && !cell(result.move.from)) || (result.move.promotion !== undefined && !['q', 'r', 'b', 'n'].includes(result.move.promotion))))) throw new Error('AI 引擎返回了无效走法或搜索统计。');
  return result;
}

export async function chooseBotMove(project: Project, state: GameState, difficulty: BotDifficulty, signal: AbortSignal): Promise<SearchResult> {
  const limits = BOT_LIMITS[difficulty];
  if (project.rules.engine === 'custom') {
    const workerCode = `onmessage = async event => { try {
      const {project, state, limits} = event.data;
      const result = await (${searchGame.toString()})((${customAdapter.toString()})(project), state, limits);
      postMessage({result});
    } catch(error) { postMessage({error: String(error.message || error)}); } };`;
    return validateSearchResult(await runSandbox<unknown>(workerCode, { project, state, limits }, limits.timeMs + 2000, signal), project);
  }
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('已取消', 'AbortError')); return; }
    const worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException('已取消', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('电脑思考超时，已停止。可以重试或降低难度。')); }, limits.timeMs + 2000);
    worker.onmessage = event => { cleanup(); try { if (event.data.error) throw new Error(event.data.error); resolve(validateSearchResult(event.data.result, project)); } catch(error) { reject(error); } };
    worker.onerror = event => { cleanup(); reject(new Error(event.message || '无法启动本地 AI 引擎。')); };
    signal.addEventListener('abort', abort, { once: true });
    worker.postMessage({ project, state, limits });
  });
}
