import { builtinAdapter } from './bot-builtin';
import { searchGame, type SearchLimits } from './bot-search';
import type { GameState, Project } from './model';

self.onmessage = async (event: MessageEvent<{ project: Project; state: GameState; limits: SearchLimits }>) => {
  try {
    const { project, state, limits } = event.data;
    if (project.rules.engine === 'custom') throw new Error('自定义规则必须在隔离沙箱中运行。');
    self.postMessage({ result: await searchGame(builtinAdapter(project), state, limits) });
  } catch (error) { self.postMessage({ error: String((error as Error).message || error) }); }
};
