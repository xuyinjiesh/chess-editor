/* 棋局工坊 — 应用控制器
 * 负责：状态与撤销栈、模式切换、编辑/对局手势的语义决策、存档与导入导出。
 */
(function (CE) {
  'use strict';

  const M = CE.model, R = CE.rules, P = CE.presets;
  const STORE_KEY = 'chess-studio.state.v1';
  const THEME_KEY = 'chess-studio.theme';
  const UNDO_LIMIT = 200;

  let state = null;
  let undoStack = [];
  let redoStack = [];
  let clean = null;        // 最近一次提交后的快照
  let lastKey = null, lastTime = 0;
  let suspended = false;   // true = 正在应用远端状态，不要回传

  const ui = {
    mode: 'edit',
    brush: { kind: 'piece', typeId: null },
    brushArmy: null,
    selectedTypeId: null,
    selectedPieceId: null,
    highlight: {},
    rightTab: 'board'
  };

  const $ = (id) => document.getElementById(id);
  function lum(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return 0.5;
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const toast = (m, k) => CE.panels.toast(m, k);
  const typeOf = (id) => M.typeById(state, id);
  const pieceOf = (id) => state.pieces.find((p) => p.id === id) || null;

  // ---------------------------------------------------------------- 撤销栈
  function snapshot() { return JSON.stringify(state); }

  function captureUndo(coalesceKey) {
    const now = snapshot();
    if (now === clean) return false;
    const t = Date.now();
    const merged = coalesceKey && coalesceKey === lastKey && (t - lastTime) < 900 && undoStack.length;
    if (!merged) {
      undoStack.push(clean);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      redoStack = [];
    }
    lastKey = coalesceKey || null;
    lastTime = t;
    clean = now;
    return true;
  }

  function commit(mutator, opts) {
    opts = opts || {};
    if (mutator) mutator(state);
    state.meta.updated = Date.now();
    const changed = captureUndo(opts.coalesce);
    if (changed) scheduleSave();
    if (changed && !suspended) CE.room.onLocalCommit(opts.op || null, !!opts.coalesce);
    if (opts.silent) return changed;
    draw();                                     // 棋盘永远跟随状态重绘
    if (opts.panels) renderPanels();
    else { CE.panels.renderStatus(); CE.panels.renderPlayPanel(); }
    updateToolbar();
    return changed;
  }

  /** 状态已在别处被直接修改（表单实时编辑）时调用。 */
  function touch(opts) {
    const changed = captureUndo(opts && opts.coalesce);
    if (changed) {
      scheduleSave();
      if (!suspended) CE.room.onLocalCommit(null, true);   // 表单实时编辑：合并发送
    }
    updateToolbar();
    return changed;
  }

  function undo() {
    if (!undoStack.length) { toast('没有可撤销的操作'); return; }
    redoStack.push(snapshot());
    const prev = undoStack.pop();
    state = JSON.parse(prev);
    clean = prev;
    lastKey = null;
    afterStateSwap();
    toast('已撤销');
  }

  function redo() {
    if (!redoStack.length) { toast('没有可重做的操作'); return; }
    undoStack.push(snapshot());
    const next = redoStack.pop();
    state = JSON.parse(next);
    clean = next;
    lastKey = null;
    afterStateSwap();
    toast('已重做');
  }

  function afterStateSwap() {
    if (ui.selectedTypeId && !typeOf(ui.selectedTypeId)) ui.selectedTypeId = null;
    if (ui.selectedPieceId && !pieceOf(ui.selectedPieceId)) ui.selectedPieceId = null;
    if (!M.armyById(state, ui.brushArmy)) ui.brushArmy = state.armies[0] && state.armies[0].id;
    if (ui.brush.kind === 'piece' && !typeOf(ui.brush.typeId)) {
      const first = state.pieceTypes.find((t) => t.army === ui.brushArmy) || state.pieceTypes[0];
      ui.brush = first ? { kind: 'piece', typeId: first.id } : { kind: 'erase' };
    }
    if (!state.play.result && ui.mode === 'play' && !state.play.order.length) R.startPlay(state);
    refreshAll();
    scheduleSave();
    if (!suspended) CE.room.onLocalCommit(null);
  }

  // ---------------------------------------------------------------- 渲染调度
  function refreshHighlight() {
    const hi = {};
    const plies = state.play.plies;
    const last = plies.length ? plies[plies.length - 1] : null;
    if (last) hi.last = [{ r: last.from.r, c: last.from.c }, { r: last.to.r, c: last.to.c }];

    if (ui.mode === 'play') {
      const turn = R.currentArmyId(state);
      if (turn && !state.play.result) {
        const king = R.findKing(state, turn);
        if (king && R.isInCheck(state, turn)) hi.check = [{ r: king.r, c: king.c }];
      }
      const p = ui.selectedPieceId ? pieceOf(ui.selectedPieceId) : null;
      const t = p ? typeOf(p.t) : null;
      if (p && t && t.army === turn && !state.play.result) {
        hi.selected = { r: p.r, c: p.c, pieceId: p.id };
        hi.moves = R.legalMovesFor(state, p);
      } else {
        ui.selectedPieceId = null;
      }
    } else {
      const p = ui.selectedPieceId ? pieceOf(ui.selectedPieceId) : null;
      if (p) {
        hi.selected = { r: p.r, c: p.c, pieceId: p.id };
        hi.preview = R.generateMoves(state, p);
      } else {
        ui.selectedPieceId = null;
      }
    }
    ui.highlight = hi;
  }

  function draw() {
    refreshHighlight();
    CE.render.draw(state, ui);
  }

  function refreshLight() {
    draw();
    CE.panels.renderStatus();
    CE.panels.renderPlayPanel();
  }

  function renderPanels() {
    CE.panels.renderAll();
    CE.panels.renderPieceForm();
    CE.panels.renderBoardForm();
  }

  function refreshAll() {
    draw();
    renderPanels();
    updateToolbar();
  }

  function updateToolbar() {
    $('btn-undo').disabled = !undoStack.length;
    $('btn-redo').disabled = !redoStack.length;
    const locked = CE.room.lockedForMe();
    $('mode-seg').querySelectorAll('[data-mode]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.mode === ui.mode);
      b.disabled = locked && b.dataset.mode !== ui.mode;
    });
    document.body.dataset.mode = ui.mode;
    const nameInput = $('game-name');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = state.meta.name || '';
  }

  // ---------------------------------------------------------------- 存档
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, snapshot()); } catch (e) { /* 忽略配额错误 */ }
    }, 350);
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      return M.normalize(JSON.parse(raw));
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- 选择与画笔
  function setBrush(brush) {
    ui.brush = brush;
    if (brush.kind === 'piece') ui.selectedTypeId = brush.typeId;
    CE.panels.renderAll();
    CE.panels.renderPieceForm();
    draw();
  }
  function setBrushArmy(id) {
    ui.brushArmy = id;
    const first = state.pieceTypes.find((t) => t.army === id);
    if (first) { ui.brush = { kind: 'piece', typeId: first.id }; ui.selectedTypeId = first.id; }
    CE.panels.renderAll();
    CE.panels.renderPieceForm();
  }
  function selectPiece(id) {
    ui.selectedPieceId = (ui.selectedPieceId === id) ? null : id;
    const p = ui.selectedPieceId ? pieceOf(id) : null;
    if (p) ui.selectedTypeId = p.t;
    draw();
    CE.panels.renderStatus();
    CE.panels.renderPieceForm();
  }
  function clearSelection() {
    ui.selectedPieceId = null;
    draw();
    CE.panels.renderStatus();
  }

  // ---------------------------------------------------------------- 编辑操作
  function placePiece(r, c, typeId) {
    commit((st) => {
      if (M.pieceAt(st, r, c)) return;
      delete st.cells[M.key(r, c)];                        // 障碍格上落子会先清掉障碍
      st.pieces.push({ id: M.uid('p'), t: typeId, r, c, moved: false });
    });
  }

  function eraseAt(r, c) {
    commit((st) => {
      const p = M.pieceAt(st, r, c);
      if (p) { st.pieces = st.pieces.filter((x) => x.id !== p.id); return; }
      delete st.cells[M.key(r, c)];
    });
  }

  function paintTerrain(r, c, terrain, coalesce) {
    commit((st) => {
      if (terrain === 'plain') { delete st.cells[M.key(r, c)]; return; }
      if (terrain === 'block') {
        const p = M.pieceAt(st, r, c);
        if (p) st.pieces = st.pieces.filter((x) => x.id !== p.id);   // 障碍格上不能站子
      }
      st.cells[M.key(r, c)] = terrain;
    }, { coalesce });
  }

  function deleteSelectedPiece() {
    const p = pieceOf(ui.selectedPieceId);
    if (!p) return;
    commit((st) => { st.pieces = st.pieces.filter((x) => x.id !== p.id); });
    ui.selectedPieceId = null;
    refreshLight();
    toast('已删除棋子');
  }

  function toggleMovedFlag(v) {
    const p = pieceOf(ui.selectedPieceId);
    if (!p) return;
    commit((st) => { const q = st.pieces.find((x) => x.id === p.id); if (q) q.moved = !!v; });
  }

  function resize(rows, cols) {
    commit((st) => {
      st.board.rows = M.clampInt(rows, 2, 24, 8);
      st.board.cols = M.clampInt(cols, 2, 24, 8);
      trimToBoard(st);
    }, { panels: true });
  }
  function resizeBoardField(field, value) {
    commit((st) => {
      st.board[field] = M.clampInt(value, 2, 24, 8);
      trimToBoard(st);
    }, { coalesce: 'resize' + field });   // 不重建面板，避免输入时失焦
  }
  function trimToBoard(st) {
    const lost = [];
    st.pieces = st.pieces.filter((p) => {
      const ok = p.r < st.board.rows && p.c < st.board.cols;
      if (!ok) lost.push(p);
      return ok;
    });
    Object.keys(st.cells).forEach((k) => {
      const [r, c] = k.split(',').map(Number);
      if (r >= st.board.rows || c >= st.board.cols) delete st.cells[k];
    });
    if (lost.length) toast(lost.length + ' 枚棋子超出了棋盘范围，已被移除', 'warn');
  }

  function mirror(dir) {
    commit((st) => {
      const { rows, cols } = st.board;
      st.pieces.forEach((p) => {
        if (dir === 'h') p.c = cols - 1 - p.c;
        else p.r = rows - 1 - p.r;
      });
      const cells = {};
      Object.keys(st.cells).forEach((k) => {
        const [r, c] = k.split(',').map(Number);
        cells[M.key(dir === 'h' ? r : rows - 1 - r, dir === 'h' ? cols - 1 - c : c)] = st.cells[k];
      });
      st.cells = cells;
    });
    toast(dir === 'h' ? '已左右镜像' : '已上下镜像');
  }

  async function clearPieces() {
    if (!state.pieces.length) { toast('棋盘上还没有棋子'); return; }
    if (!await CE.panels.confirm({ title: '清空棋子', body: '棋盘上的 ' + state.pieces.length + ' 枚棋子将被移除。', ok: '清空', danger: true })) return;
    commit((st) => { st.pieces = []; }, { panels: true });
    ui.selectedPieceId = null;
  }
  async function clearAll() {
    if (!await CE.panels.confirm({ title: '全部清空', body: '棋子、地形与坐标设置都会被重置。', ok: '全部清空', danger: true })) return;
    commit((st) => {
      st.pieces = [];
      st.cells = {};
      st.play = { order: [], turn: 0, plies: [], result: null, active: false };
    }, { panels: true });
    ui.selectedPieceId = null;
    ui.mode = 'edit';
  }
  async function newFromTemplate(id) {
    const tpl = P.TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    if (state.pieces.length && !await CE.panels.confirm({
      title: '新建棋局', body: '将用「' + tpl.name + '」替换当前棋局，未保存的改动会丢失。', ok: '新建', danger: true
    })) return;
    state = P.build(id);
    undoStack = []; redoStack = []; clean = snapshot();
    ui.mode = 'edit';
    ui.selectedPieceId = null;
    ui.brushArmy = state.armies[0].id;
    const first = state.pieceTypes.find((t) => t.army === ui.brushArmy) || state.pieceTypes[0];
    ui.brush = first ? { kind: 'piece', typeId: first.id } : { kind: 'erase' };
    ui.selectedTypeId = first ? first.id : null;
    refreshAll();
    scheduleSave();
    CE.room.onLocalCommit(null);
    toast('已载入：' + tpl.name);
  }

  // ---------------------------------------------------------------- 棋子类型
  function addType() {
    const army = ui.brushArmy || state.armies[0].id;
    const t = {
      id: M.uid('pt'), name: '新棋子', army, glyph: '★', shape: 'glyph', desc: '',
      isKing: false, zone: 'any', promote: { enabled: false, toTypeId: null },
      move: Object.assign(M.defaultMove(), { moveDirs: 'ortho', moveRange: 1 })
    };
    commit((st) => { st.pieceTypes.push(t); }, { panels: true });
    ui.brushArmy = army;
    ui.selectedTypeId = t.id;
    ui.brush = { kind: 'piece', typeId: t.id };
    renderPanels();
    toast('已新建棋子类型');
  }
  function duplicateType(id) {
    const src = typeOf(id);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = M.uid('pt');
    copy.name = src.name + '副本';
    commit((st) => { st.pieceTypes.push(copy); }, { panels: true });
    ui.selectedTypeId = copy.id;
    renderPanels();
    toast('已复制棋子类型');
  }
  async function deleteType(id) {
    const t = typeOf(id);
    if (!t) return;
    const used = state.pieces.filter((p) => p.t === id).length;
    if (!await CE.panels.confirm({
      title: '删除棋子类型',
      body: '「' + t.name + '」将被删除' + (used ? '，棋盘上的 ' + used + ' 枚该棋子也会被移除。' : '。'),
      ok: '删除', danger: true
    })) return;
    commit((st) => {
      st.pieceTypes = st.pieceTypes.filter((x) => x.id !== id);
      st.pieces = st.pieces.filter((p) => p.t !== id);
      st.pieceTypes.forEach((x) => { if (x.promote && x.promote.toTypeId === id) x.promote = { enabled: false, toTypeId: null }; });
      st.wins.forEach((w) => { if (w.typeId === id) w.typeId = 'any'; });
    }, { panels: true });
    const next = state.pieceTypes.find((x) => x.army === ui.brushArmy) || state.pieceTypes[0];
    ui.selectedTypeId = next ? next.id : null;
    ui.brush = next ? { kind: 'piece', typeId: next.id } : { kind: 'erase' };
    renderPanels();
    toast('已删除棋子类型');
  }

  // ---------------------------------------------------------------- 阵营
  function addArmy() {
    const palette = P.ARMY_COLORS;
    const color = palette[state.armies.length % palette.length];
    const a = { id: M.uid('army'), name: '阵营' + (state.armies.length + 1), color, dir: state.armies.length % 2 ? 1 : -1 };
    commit((st) => { st.armies.push(a); }, { panels: true });
    toast('已添加阵营');
  }
  async function deleteArmy(id) {
    const a = M.armyById(state, id);
    if (!a) return;
    if (state.armies.length <= 1) { toast('至少需要保留一个阵营', 'warn'); return; }
    const types = state.pieceTypes.filter((t) => t.army === id);
    if (!await CE.panels.confirm({
      title: '删除阵营',
      body: '「' + a.name + '」及其 ' + types.length + ' 种棋子、棋盘上对应的棋子都会被移除。',
      ok: '删除', danger: true
    })) return;
    commit((st) => {
      const typeIds = new Set(st.pieceTypes.filter((t) => t.army === id).map((t) => t.id));
      st.armies = st.armies.filter((x) => x.id !== id);
      st.pieceTypes = st.pieceTypes.filter((t) => t.army !== id);
      st.pieces = st.pieces.filter((p) => !typeIds.has(p.t));
      st.play.order = st.play.order.filter((x) => x !== id);
    }, { panels: true });
    if (ui.brushArmy === id) ui.brushArmy = state.armies[0].id;
    renderPanels();
  }

  // ---------------------------------------------------------------- 胜负条件
  function addWin() {
    commit((st) => { st.wins.push({ id: M.uid('win'), kind: 'captureKing' }); }, { panels: true });
  }
  function deleteWin(id) {
    commit((st) => { st.wins = st.wins.filter((w) => w.id !== id); }, { panels: true });
  }
  function updateWin(id, field, value) {
    commit((st) => {
      const w = st.wins.find((x) => x.id === id);
      if (!w) return;
      if (field === 'kind') {
        w.kind = value;
        if (value === 'eliminateArmy' && !w.army) w.army = st.armies[1] ? st.armies[1].id : st.armies[0].id;
        if (value === 'reachGoal') { w.army = w.army || 'any'; w.typeId = w.typeId || 'any'; }
      } else {
        w[field] = value;
      }
    }, { panels: true });
  }

  // ---------------------------------------------------------------- 对局
  function validatePosition() {
    const issues = [];
    if (state.wins.some((w) => w.kind === 'captureKing')) {
      state.armies.forEach((a) => {
        if (!M.countArmyPieces(state, a.id)) return;
        const hasKing = state.pieces.some((p) => {
          const t = typeOf(p.t);
          return t && t.isKing && t.army === a.id;
        });
        if (!hasKing) issues.push(a.name + '没有「王」');
      });
    }
    if (state.wins.some((w) => w.kind === 'reachGoal') && !Object.values(state.cells).includes('goal')) {
      issues.push('还没有标出目标格');
    }
    if (M.activeArmies(state).length < 2) issues.push('棋盘上不足两方棋子');
    return issues;
  }

  function toggleMode(mode) {
    if (mode === ui.mode) return;
    if (CE.room.isActive() && CE.room.mode() === 'match') {
      if (CE.room.isHost()) { CE.room.setMode('coedit'); return; }   // 房主离开对战 = 回到协作编辑
      toast('对战进行中，玩法由房主控制', 'warn');
      return;
    }
    if (mode === 'play') {
      if (!M.activeArmies(state).length) { toast('先在棋盘上放一些棋子吧', 'warn'); return; }
      const issues = validatePosition();
      if (issues.length) toast('提示：' + issues.join('；'), 'warn');
      commit((st) => { if (!st.play.active || !st.play.order.length) R.startPlay(st); }, { silent: true });
      ui.mode = 'play';
      ui.selectedPieceId = null;
      CE.panels.setRightTab('play');
      refreshAll();
      if (!issues.length) toast('开始对局：拖动棋子走子');
    } else {
      commit((st) => { st.play.active = false; }, { silent: true });
      ui.mode = 'edit';
      ui.selectedPieceId = null;
      CE.panels.setRightTab('board');
      refreshAll();
    }
  }

  function restartPlay() {
    if (CE.room.isActive() && CE.room.mode() === 'match' && !CE.room.isHost()) {
      toast('只有房主可以重开对局', 'warn');
      return;
    }
    commit((st) => { R.startPlay(st); }, { panels: true });
    ui.selectedPieceId = null;
    refreshAll();
    toast('已重新开始');
  }

  function undoPly() {
    if (CE.room.isActive() && CE.room.mode() === 'match' && !CE.room.isHost()) {
      const last = state.play.plies[state.play.plies.length - 1];
      if (!last) { toast('还没有走子'); return; }
      if (CE.room.myArmyId() !== last.army) { toast('只能悔自己刚走的那一步', 'warn'); return; }
      CE.room.session.room.requestUndo();
      toast('已请求房主悔棋');
      return;
    }
    undo();
  }

  function movePiece(pieceId, r, c) {
    const p = pieceOf(pieceId);
    if (!p) return false;
    if (ui.mode === 'edit') {
      if (p.r === r && p.c === c) return true;
      if (M.pieceAt(state, r, c)) return false;             // 不能叠子
      if (M.isBlocked(state, r, c)) return false;           // 障碍格不能落子
      if (state.rules.validateInEdit && !R.generateMoves(state, p).some((m) => m.r === r && m.c === c)) {
        toast('这枚棋子走不到这里（可在「规则」里关闭编辑校验）', 'warn');
        return false;
      }
      commit((st) => {
        const q = st.pieces.find((x) => x.id === pieceId);
        q.r = r; q.c = c;
      });
      ui.selectedPieceId = pieceId;
      refreshLight();
      return true;
    }
    // 对局模式：严格按规则校验
    if (state.play.result) { toast('对局已经结束，可悔棋或重开', 'warn'); return false; }
    const t = typeOf(p.t);
    if (!t || t.army !== R.currentArmyId(state)) { toast('还没轮到这一方', 'warn'); return false; }
    const legal = R.legalMovesFor(state, p);
    if (!legal.some((m) => m.r === r && m.c === c)) { toast('这一步不符合走子规则', 'warn'); return false; }
    commit((st) => {
      R.applyPly(st, pieceId, { r, c });
      R.advanceTurn(st);
      const outcome = R.evaluate(st);
      if (outcome) st.play.result = outcome;
      const next = R.currentArmyId(st);
      st.play.lastCheck = !outcome && next ? R.isInCheck(st, next) : false;
    }, { panels: true, op: { kind: 'move', pieceId, r, c } });
    ui.selectedPieceId = null;
    const res = state.play.result;
    if (res) toast(res.kind === 'draw' ? '和棋：' + res.reason : (M.armyById(state, res.army) || {}).name + ' 获胜！', 'win');
    else if (state.play.lastCheck) toast('将军！', 'warn');
    return true;
  }

  // ---------------------------------------------------------------- 手势钩子
  const hooks = {
    onPieceGrab(pieceId) {
      const p = pieceOf(pieceId);
      if (!p) return { draggable: false };
      if (ui.mode === 'edit') {
        const checking = !!state.rules.validateInEdit;
        return { draggable: true, check: checking, moves: checking ? R.generateMoves(state, p) : [] };
      }
      if (state.play.result) return { draggable: false, reason: '对局已结束' };
      const t = typeOf(p.t);
      if (!t) return { draggable: false };
      if (CE.room.isActive() && CE.room.mode() === 'match') {
        if (!CE.room.myArmyId()) { toast('你在观战，先在房间面板里选一个阵营', 'warn'); return { draggable: false }; }
        if (!CE.room.canControl(t.army)) { toast('你操控的是另一方', 'warn'); return { draggable: false }; }
        if (!CE.room.myTurn()) { toast('还没轮到你', 'warn'); return { draggable: false }; }
      }
      if (t.army !== R.currentArmyId(state)) return { draggable: false, reason: '未轮到该方' };
      const moves = R.legalMovesFor(state, p);
      if (!moves.length) { toast('这枚棋子暂时无处可走', 'warn'); return { draggable: false, reason: '无处可走' }; }
      return { draggable: true, check: true, moves };
    },
    onPieceTap(pieceId) {
      const p = pieceOf(pieceId);
      const t = p ? typeOf(p.t) : null;
      if (ui.mode === 'play' && t && t.army !== R.currentArmyId(state)) {
        toast('还没轮到这一方', 'warn');
        return;
      }
      selectPiece(pieceId);
    },
    onDragStart(pieceId, verdict) {
      const p = pieceOf(pieceId);
      if (!p) return;
      ui.highlight = Object.assign({}, ui.highlight, {
        selected: { r: p.r, c: p.c, pieceId: p.id },
        moves: verdict.moves || []
      });
      CE.render.highlightOnly(ui.highlight);
    },
    onDragEnd() { CE.room.flushPending(); },
    onPieceDrop(pieceId, r, c) { return movePiece(pieceId, r, c); },
    onPieceDelete(pieceId) {
      commit((st) => { st.pieces = st.pieces.filter((p) => p.id !== pieceId); });
      if (ui.selectedPieceId === pieceId) ui.selectedPieceId = null;
      refreshLight();
    },
    onCellRightClick(r, c) {
      const p = M.pieceAt(state, r, c);
      if (p) { hooks.onPieceDelete(p.id); return; }
      if (state.cells[M.key(r, c)]) paintTerrain(r, c, 'plain');
    },
    onCellPaint(r, c, e) {
      const paintMove = !!(e && e.paintMove);
      if (ui.mode === 'play') {
        if (paintMove) return;
        const p = M.pieceAt(state, r, c);
        if (p && !ui.selectedPieceId) { selectPiece(p.id); return; }
        if (ui.selectedPieceId) {
          const selected = pieceOf(ui.selectedPieceId);
          const t = selected ? typeOf(selected.t) : null;
          if (p && t && t.army === R.currentArmyId(state) && p.id !== ui.selectedPieceId) { selectPiece(p.id); return; }
          movePiece(ui.selectedPieceId, r, c);
        } else if (p) {
          selectPiece(p.id);
        }
        return;
      }
      const brush = ui.brush;
      if (brush.kind === 'erase') { eraseAt(r, c); return; }
      if (brush.kind === 'terrain') { paintTerrain(r, c, brush.terrain, 'paint'); return; }
      if (brush.kind === 'piece') {
        const p = M.pieceAt(state, r, c);
        if (p) { if (!paintMove) selectPiece(p.id); return; }
        if (paintMove) return;                      // 棋子画笔只在单击时落子
        placePiece(r, c, brush.typeId);
      }
    }
  };

  // ---------------------------------------------------------------- 联机
  /** 收到远端权威状态：整盘替换（拖拽中会由 room 暂存后再调用）。 */
  function applyRemoteState(next) {
    if (!next) { refreshAll(); return; }
    suspended = true;
    try {
      const prev = snapshot();
      state = M.normalize(JSON.parse(JSON.stringify(next)));
      undoStack.push(prev);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      redoStack = [];
      clean = snapshot();
      lastKey = null;
      afterStateSwapQuiet();
    } finally {
      suspended = false;
    }
  }
  function afterStateSwapQuiet() {
    if (ui.selectedTypeId && !typeOf(ui.selectedTypeId)) ui.selectedTypeId = null;
    if (ui.selectedPieceId && !pieceOf(ui.selectedPieceId)) ui.selectedPieceId = null;
    if (!M.armyById(state, ui.brushArmy)) ui.brushArmy = state.armies[0] && state.armies[0].id;
    if (ui.brush.kind === 'piece' && !typeOf(ui.brush.typeId)) {
      const first = state.pieceTypes.find((t) => t.army === ui.brushArmy) || state.pieceTypes[0];
      ui.brush = first ? { kind: 'piece', typeId: first.id } : { kind: 'erase' };
    }
    refreshAll();
    scheduleSave();
  }

  /** 房主：校验并应用来自加入者的指令。返回 true 表示已落地，需要广播。 */
  function remoteApplyOp(op, member) {
    if (!op || typeof op !== 'object') return false;
    if (op.kind === 'move') {
      const p = pieceOf(op.pieceId);
      if (!p) return false;
      const t = typeOf(p.t);
      if (!t) return false;
      if (CE.room.mode() === 'match' && member && member.armyId !== t.army) return false;  // 不是他的棋
      if (t.army !== R.currentArmyId(state)) return false;                                 // 没轮到
      if (state.play.result) return false;                                                 // 已结束
      if (!R.legalMovesFor(state, p).some((m) => m.r === op.r && m.c === op.c)) return false;
      suspended = true;
      try {
        commit((st) => {
          R.applyPly(st, op.pieceId, { r: op.r, c: op.c });
          R.advanceTurn(st);
          const outcome = R.evaluate(st);
          if (outcome) st.play.result = outcome;
          const next = R.currentArmyId(st);
          st.play.lastCheck = !outcome && next ? R.isInCheck(st, next) : false;
        }, { silent: true });
      } finally {
        suspended = false;
      }
      const res = state.play.result;
      if (res) toast(res.kind === 'draw' ? '和棋：' + res.reason : (M.armyById(state, res.army) || {}).name + ' 获胜！', 'win');
      else if (state.play.lastCheck) toast('将军！', 'warn');
      refreshAll();
      return true;
    }
    if (op.kind === 'undo') {
      const last = state.play.plies[state.play.plies.length - 1];
      if (!last) return false;
      if (member && member.armyId && last.army !== member.armyId) return false;   // 只能悔自己那一步
      undo();
      return true;
    }
    if (op.kind === 'request-edit') return false;
    return false;
  }

  /** 由房间控制切换到某个模式（不额外广播，避免来回触发）。 */
  function forceMode(m) {
    if (ui.mode === m) return;
    const authoritative = !CE.room.isActive() || CE.room.isHost();
    if (authoritative) {
      suspended = true;
      try {
        commit((st) => {
          if (m === 'play') { if (!st.play.active || !st.play.order.length) R.startPlay(st); }
          else { st.play.active = false; }
        }, { silent: true });
      } finally { suspended = false; }
    }
    ui.mode = m;
    ui.selectedPieceId = null;
    CE.panels.setRightTab(m === 'play' ? 'play' : 'board');
    refreshAll();
  }

  // ---------------------------------------------------------------- 导出
  function download(filename, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const safeName = () => (state.meta.name || '棋局').replace(/[\\/:*?"<>|]/g, '_');

  function exportJSON() {
    download(safeName() + '.json', new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    toast('已导出棋局文件');
  }

  function buildSVG() {
    const s = state;
    const cell = 54;
    const { rows, cols } = s.board;
    const W = cols * cell, H = rows * cell;
    const C = P.BOARD_COLORS[s.board.theme] || P.BOARD_COLORS.wood;
    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    out.push(`<rect width="${W}" height="${H}" fill="${C.frame}"/>`);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fill = s.board.grid === 'line' ? C.a : ((r + c) % 2 ? C.b : C.a);
        out.push(`<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${fill}" stroke="${C.line}" stroke-width="1"/>`);
      }
    }
    Object.keys(s.cells).forEach((k) => {
      const [r, c] = k.split(',').map(Number);
      const x = c * cell, y = r * cell;
      if (s.cells[k] === 'block') {
        out.push(`<rect x="${x + 3}" y="${y + 3}" width="${cell - 6}" height="${cell - 6}" fill="rgba(0,0,0,.18)"/>`);
        out.push(`<path d="M${x + 10} ${y + cell - 10} L${x + cell - 10} ${y + 10}" stroke="${C.line}" stroke-width="3"/>`);
      } else if (s.cells[k] === 'goal') {
        out.push(`<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell * 0.22}" fill="none" stroke="${C.goal}" stroke-width="3"/>`);
      }
    });
    s.pieces.forEach((p) => {
      const t = M.typeById(s, p.t);
      if (!t) return;
      const army = M.armyById(s, t.army) || { color: '#333' };
      const cx = p.c * cell + cell / 2, cy = p.r * cell + cell / 2;
      if (t.shape === 'stone') {
        out.push(`<circle cx="${cx}" cy="${cy}" r="${cell * 0.4}" fill="${army.color}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>`);
      } else if (t.shape === 'disc') {
        out.push(`<circle cx="${cx}" cy="${cy}" r="${cell * 0.41}" fill="${C.a}" stroke="${army.color}" stroke-width="3"/>`);
        out.push(`<text x="${cx}" y="${cy}" font-size="${cell * 0.5}" fill="${army.color}" text-anchor="middle" dominant-baseline="central" font-family="serif" font-weight="700">${escapeXML(t.glyph || t.name)}</text>`);
      } else {
        const pale = lum(army.color) > 0.68;
        out.push(`<text x="${cx}" y="${cy}" font-size="${cell * 0.74}" fill="${army.color}" ${pale ? 'stroke="rgba(0,0,0,.5)" stroke-width="0.8"' : ''} text-anchor="middle" dominant-baseline="central" font-family="serif">${escapeXML(t.glyph || t.name)}</text>`);
      }
    });
    out.push('</svg>');
    return out.join('');
  }
  function escapeXML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[m]));
  }

  function exportSVG() {
    download(safeName() + '.svg', new Blob([buildSVG()], { type: 'image/svg+xml;charset=utf-8' }));
    toast('已导出 SVG 图片');
  }

  function exportPNG() {
    const svg = buildSVG();
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) { toast('导出 PNG 失败，可以试试 SVG', 'warn'); return; }
        download(safeName() + '.png', blob);
        toast('已导出 PNG 图片');
      }, 'image/png');
    };
    img.onerror = () => toast('导出 PNG 失败，可以试试 SVG', 'warn');
    img.src = url;
  }

  function copyJSON() {
    const text = JSON.stringify(state, null, 2);
    const fallback = () => CE.panels.textPrompt({
      title: '棋局 JSON',
      body: '浏览器不允许自动复制，请手动复制下面的内容：',
      value: text
    });
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('棋局 JSON 已复制到剪贴板'), fallback);
    } else {
      fallback();
    }
  }

  function importState(text) {
    try {
      const raw = JSON.parse(text);
      const next = M.normalize(raw);
      if (!next.pieceTypes.length && !next.pieces.length && !raw.board) throw new Error('empty');
      state = next;
      undoStack = []; redoStack = []; clean = snapshot();
      ui.mode = 'edit';
      ui.selectedPieceId = null;
      ui.brushArmy = state.armies[0].id;
      const first = state.pieceTypes[0];
      ui.brush = first ? { kind: 'piece', typeId: first.id } : { kind: 'erase' };
      ui.selectedTypeId = first ? first.id : null;
      refreshAll();
      scheduleSave();
      CE.room.onLocalCommit(null);
      toast('已导入棋局');
      return true;
    } catch (e) {
      toast('导入失败：文件格式不正确', 'warn');
      return false;
    }
  }

  // ---------------------------------------------------------------- 工具栏与快捷键
  function bindToolbar() {
    $('mode-seg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (b) toggleMode(b.dataset.mode);
    });
    $('btn-undo').addEventListener('click', undo);
    $('btn-redo').addEventListener('click', redo);
    $('btn-help').addEventListener('click', () => CE.panels.help());
    $('btn-new-type').addEventListener('click', addType);
    $('btn-import').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => importState(String(reader.result));
      reader.readAsText(file);
      e.target.value = '';
    });
    $('game-name').addEventListener('input', (e) => {
      state.meta.name = e.target.value.slice(0, 24) || '未命名棋局';
      touch({ coalesce: 'name' });
    });
    $('game-name').addEventListener('blur', () => { if (!state.meta.name) $('game-name').value = '未命名棋局'; });

    document.querySelectorAll('[data-export]').forEach((b) => {
      b.addEventListener('click', () => {
        const menu = b.closest('details');
        if (menu) menu.open = false;
        const kind = b.dataset.export;
        if (kind === 'json') exportJSON();
        if (kind === 'svg') exportSVG();
        if (kind === 'png') exportPNG();
        if (kind === 'copy') copyJSON();
      });
    });

    const themeBtn = $('btn-theme');
    const applyTheme = (t) => {
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
      themeBtn.textContent = t === 'dark' ? '☾' : '☀';
    };
    themeBtn.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');

    document.addEventListener('click', (e) => {
      document.querySelectorAll('details.menu[open]').forEach((d) => {
        if (!d.contains(e.target)) d.open = false;
      });
    });

    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (e.key === 'Escape') {
        if (typing) { e.target.blur(); return; }
        clearSelection();
        document.querySelectorAll('details.menu[open]').forEach((d) => { d.open = false; });
        return;
      }
      if (typing) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); exportJSON(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ui.mode === 'edit' && ui.selectedPieceId) { e.preventDefault(); deleteSelectedPiece(); }
        return;
      }
      if (e.key.toLowerCase() === 'e') { setBrush({ kind: 'erase' }); return; }
      if (/^[1-9]$/.test(e.key)) {
        const armyId = ui.brushArmy;
        const list = state.pieceTypes.filter((t) => t.army === armyId);
        const t = list[Number(e.key) - 1];
        if (t) setBrush({ kind: 'piece', typeId: t.id });
      }
    });
  }

  // ---------------------------------------------------------------- 启动
  let inited = false;
  function init() {
    if (inited) return;          // 保证只初始化一次，重复触发不会覆盖当前棋局
    inited = true;
    state = loadSaved() || P.build('chess');
    if (!state.pieceTypes.length && !state.pieces.length) state = P.build('chess');
    clean = snapshot();
    ui.brushArmy = state.armies[0].id;
    const first = state.pieceTypes.find((t) => t.army === ui.brushArmy) || state.pieceTypes[0];
    if (first) { ui.brush = { kind: 'piece', typeId: first.id }; ui.selectedTypeId = first.id; }
    else ui.brush = { kind: 'erase' };

    CE.render.init({
      board: $('board'),
      cells: $('cells'),
      pieces: $('pieces'),
      stage: $('stage')
    }, hooks);
    CE.panels.init({
      board: $('board'),
      cells: $('cells'),
      pieces: $('pieces'),
      stage: $('stage'),
      templateMenu: $('template-menu'),
      armyTabs: $('army-tabs'),
      palette: $('palette'),
      tools: $('tools'),
      brushHint: $('brush-hint'),
      pieceForm: $('piece-form'),
      boardForm: $('board-form'),
      winsForm: $('wins-form'),
      playPanel: $('play-panel'),
      statusbar: $('statusbar'),
      rightTabs: $('right-tabs'),
      rightPanes: $('right-panes'),
      toastHost: $('toast-host'),
      modalHost: $('modal-host')
    });

    bindToolbar();
    CE.room.init();
    CE.panels.setRightTab('board');
    refreshAll();
    updateToolbar();
  }

  window.addEventListener('DOMContentLoaded', init);

  CE.app = {
    get state() { return state; },
    ui,
    commit, touch, undo, redo, draw, refreshLight, renderPanels, refreshAll,
    refreshPieceForm: () => { CE.panels.renderPieceForm(); CE.panels.renderPalette(); draw(); },
    refreshPieceLight: () => { CE.panels.renderPalette(); draw(); CE.panels.renderStatus(); },
    refreshBoardForm: () => CE.panels.renderBoardForm(),
    setBrush, setBrushArmy, selectPiece, clearSelection,
    placePiece, eraseAt, paintTerrain, deleteSelectedPiece, toggleMovedFlag,
    resize, resizeBoardField, mirror, clearPieces, clearAll, newFromTemplate,
    addType, duplicateType, deleteType, addArmy, deleteArmy,
    addWin, deleteWin, updateWin,
    toggleMode, restartPlay, undoPly, movePiece,
    applyRemoteState, remoteApplyOp, forceMode,
    exportJSON, exportSVG, exportPNG, copyJSON, importState, buildSVG,
    validatePosition, snapshot
  };
})(window.CE = window.CE || {});
