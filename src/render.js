/* 棋局工坊 — 棋盘渲染与拖拽交互
 * 渲染与规则完全解耦：render 只负责 DOM、几何与手势，语义决策交回给 app 的 hooks。
 */
(function (CE) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  let refs = null;          // { board, cells, pieces, stage }
  let hooks = null;
  let ui = null;            // 最近一次 draw 传入的界面状态
  let state = null;
  let cellEls = [];         // [visR][visC] -> element
  let pieceEls = new Map(); // id -> element
  let geometry = '';        // rows x cols x theme x grid x flip
  let drag = null;
  let painting = false;
  let peekMoves = [];       // 拖拽时的高亮落点

  // ---------------------------------------------------------------- 工具
  function hexLum(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return 0.5;
    const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function visPos(r, c) {
    const b = state.board;
    return { vr: b.flipped ? b.rows - 1 - r : r, vc: b.flipped ? b.cols - 1 - c : c };
  }
  function logicAt(vr, vc) {
    const b = state.board;
    return { r: b.flipped ? b.rows - 1 - vr : vr, c: b.flipped ? b.cols - 1 - vc : vc };
  }

  function cellSize(s) {
    const wrap = refs.stage;
    const availW = Math.max(200, wrap.clientWidth - 56);
    const availH = Math.max(220, window.innerHeight - 250);
    const cell = Math.min(availW / s.board.cols, availH / s.board.rows);
    return Math.max(20, Math.min(Math.floor(cell), 76));
  }

  function cellFromPoint(clientX, clientY) {
    const rect = refs.board.getBoundingClientRect();
    const cs = parseFloat(getComputedStyle(refs.board).getPropertyValue('--cell')) || 40;
    const pad = parseFloat(getComputedStyle(refs.board).getPropertyValue('--pad')) || 0;
    const vc = Math.floor((clientX - rect.left - pad) / cs);
    const vr = Math.floor((clientY - rect.top - pad) / cs);
    if (vr < 0 || vc < 0 || vr >= state.board.rows || vc >= state.board.cols) return null;
    return logicAt(vr, vc);
  }

  // ---------------------------------------------------------------- 结构
  function buildCells() {
    const b = state.board;
    refs.cells.innerHTML = '';
    cellEls = [];
    const frag = document.createDocumentFragment();
    for (let vr = 0; vr < b.rows; vr++) {
      const row = [];
      for (let vc = 0; vc < b.cols; vc++) {
        const { r, c } = logicAt(vr, vc);
        const el = document.createElement('div');
        el.className = 'cell';
        el.dataset.r = r;
        el.dataset.c = c;
        el.dataset.vr = vr;
        el.dataset.vc = vc;
        // 交替底色
        if ((r + c) % 2 === 1) el.classList.add('cell--alt');
        // 坐标（左下角为 1）
        const file = c < 26 ? String.fromCharCode(97 + c) : String(c + 1);
        const rank = b.rows - r;
        if (b.coords) {
          if (vr === b.rows - 1) el.innerHTML += `<i class="coord coord--file">${file}</i>`;
          if (vc === 0) el.innerHTML += `<i class="coord coord--rank">${rank}</i>`;
        }
        frag.appendChild(el);
        row.push(el);
      }
      cellEls.push(row);
    }
    refs.cells.appendChild(frag);
  }

  function applyBoardStyle() {
    const b = state.board;
    refs.board.className = 'board board--' + b.theme + ' board--' + (b.grid === 'line' ? 'line' : 'fill');
    refs.board.style.setProperty('--rows', b.rows);
    refs.board.style.setProperty('--cols', b.cols);
    refs.board.style.setProperty('--cell', cellSize(state) + 'px');
    refs.board.style.setProperty('--pad', '0px');
    const frame = refs.board.parentElement;
    frame.className = 'board-frame board-frame--' + b.theme + (b.frame ? '' : ' board-frame--flat');
  }

  // ---------------------------------------------------------------- 棋子
  function pieceEl(piece, type) {
    const el = document.createElement('div');
    el.className = 'piece piece--' + type.shape;
    el.dataset.id = piece.id;
    el.dataset.shape = type.shape;
    el.innerHTML = '<div class="piece__body"><span class="piece__glyph"></span><span class="piece__badge"></span></div>';
    return el;
  }

  function paintPiece(el, piece, type, army) {
    const color = (army && army.color) || '#333';
    el.style.setProperty('--piece-color', color);
    el.classList.toggle('is-pale', hexLum(color) > 0.68);
    el.classList.toggle('is-king', !!type.isKing);
    const glyph = type.shape === 'stone' ? '' : (type.glyph || type.name.slice(0, 1));
    const span = el.querySelector('.piece__glyph');
    if (span.textContent !== glyph) span.textContent = glyph;
    const badge = el.querySelector('.piece__badge');
    if (type.zone === 'ownHalf' && !badge.textContent) badge.textContent = '半';
    else if (type.zone !== 'ownHalf' && badge.textContent) badge.textContent = '';
    el.title = type.name + (type.desc ? ' · ' + type.desc : '');
  }

  function positionPiece(el, r, c) {
    const { vr, vc } = visPos(r, c);
    el.style.setProperty('--r', vr);
    el.style.setProperty('--c', vc);
  }

  // ---------------------------------------------------------------- 高亮
  function clearCellMarks() {
    for (const row of cellEls) {
      for (const el of row) {
        el.classList.remove('is-sel', 'is-move', 'is-cap', 'is-preview', 'is-last', 'is-check', 'is-hover');
      }
    }
  }

  function markCell(r, c, cls) {
    const { vr, vc } = visPos(r, c);
    if (cellEls[vr] && cellEls[vr][vc]) cellEls[vr][vc].classList.add(cls);
  }

  // ---------------------------------------------------------------- 主绘制
  function draw(nextState, nextUi) {
    state = nextState;
    ui = nextUi || ui || {};
    const geo = [state.board.rows, state.board.cols, state.board.theme, state.board.grid, state.board.flipped, state.board.coords].join('|');
    applyBoardStyle();
    if (geo !== geometry) {
      geometry = geo;
      buildCells();
      pieceEls.clear();
      refs.pieces.innerHTML = '';
    }

    // 地形与高亮
    for (let vr = 0; vr < state.board.rows; vr++) {
      for (let vc = 0; vc < state.board.cols; vc++) {
        const el = cellEls[vr][vc];
        const { r, c } = logicAt(vr, vc);
        const terrain = state.cells[CE.model.key(r, c)];
        el.classList.toggle('is-block', terrain === 'block');
        el.classList.toggle('is-goal', terrain === 'goal');
      }
    }
    clearCellMarks();

    const hi = ui.highlight || {};
    (hi.last || []).forEach((p) => markCell(p.r, p.c, 'is-last'));
    (hi.check || []).forEach((p) => markCell(p.r, p.c, 'is-check'));
    if (hi.selected) markCell(hi.selected.r, hi.selected.c, 'is-sel');
    (hi.moves || []).forEach((m) => markCell(m.r, m.c, m.capture ? 'is-cap' : 'is-move'));
    (hi.preview || []).forEach((m) => markCell(m.r, m.c, m.capture ? 'is-cap' : 'is-preview'));

    // 棋子同步
    const alive = new Set();
    for (const p of state.pieces) {
      const type = CE.model.typeById(state, p.t);
      if (!type) continue;
      const army = CE.model.armyById(state, type.army);
      alive.add(p.id);
      let el = pieceEls.get(p.id);
      if (!el) {
        el = pieceEl(p, type);
        pieceEls.set(p.id, el);
        el.classList.add('no-anim', 'is-entering');
        refs.pieces.appendChild(el);
        positionPiece(el, p.r, p.c);
        requestAnimationFrame(() => el.classList.remove('no-anim', 'is-entering'));
      } else if (el.dataset.shape !== type.shape) {
        el.className = 'piece piece--' + type.shape + (el.classList.contains('is-sel') ? ' is-sel' : '');
        el.dataset.shape = type.shape;
      }
      paintPiece(el, p, type, army);
      if (!drag || drag.id !== p.id) positionPiece(el, p.r, p.c);
      el.classList.toggle('is-sel', !!(hi.selected && hi.selected.pieceId === p.id));
    }
    for (const [id, el] of Array.from(pieceEls.entries())) {
      if (!alive.has(id)) {
        el.remove();
        pieceEls.delete(id);
      }
    }
    // 保证 DOM 顺序稳定（便于调试与动画一致性）
    refs.pieces.style.setProperty('--piece-count', state.pieces.length);
  }

  /** 只更新高亮，不重建棋子（拖拽时用）。 */
  function highlightOnly(hi) {
    if (!state) return;
    ui = Object.assign({}, ui, { highlight: hi });
    clearCellMarks();
    (hi.last || []).forEach((p) => markCell(p.r, p.c, 'is-last'));
    (hi.check || []).forEach((p) => markCell(p.r, p.c, 'is-check'));
    if (hi.selected) markCell(hi.selected.r, hi.selected.c, 'is-sel');
    (hi.moves || []).forEach((m) => markCell(m.r, m.c, m.capture ? 'is-cap' : 'is-move'));
    for (const [id, el] of pieceEls) el.classList.toggle('is-sel', !!(hi.selected && hi.selected.pieceId === id));
  }

  function setHoverCell(r, c) {
    for (const row of cellEls) for (const el of row) el.classList.remove('is-hover');
    if (r == null) return;
    const { vr, vc } = visPos(r, c);
    if (cellEls[vr] && cellEls[vr][vc]) cellEls[vr][vc].classList.add('is-hover');
  }

  function shakePiece(id) {
    const el = pieceEls.get(id);
    if (!el) return;
    el.classList.remove('is-shake');
    void el.offsetWidth;
    el.classList.add('is-shake');
    el.addEventListener('animationend', () => el.classList.remove('is-shake'), { once: true });
  }

  // ---------------------------------------------------------------- 手势
  function attach() {
    // 拖拽棋子
    refs.pieces.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const el = e.target.closest('.piece');
      if (!el) return;
      const piece = state.pieces.find((p) => p.id === el.dataset.id);
      if (!piece) return;
      const brushKind = (ui.brush && ui.brush.kind) || 'piece';
      const paintingBrush = brushKind === 'terrain' || brushKind === 'erase';
      if (paintingBrush && ui.mode === 'edit') {
        const cell = cellFromPoint(e.clientX, e.clientY);
        if (cell) {
          e.preventDefault();
          painting = true;
          hooks.onCellPaint(cell.r, cell.c, e);
        }
        return;
      }
      const verdict = hooks.onPieceGrab(piece.id) || {};
      if (!verdict.draggable) {
        hooks.onPieceTap(piece.id);
        return;
      }
      e.preventDefault();
      drag = {
        id: piece.id,
        el,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        checking: !!verdict.check,          // 是否按走法校验（决定落点高亮）
        from: { r: piece.r, c: piece.c },
        next: { r: piece.r, c: piece.c }
      };
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
      peekMoves = verdict.moves || [];
      hooks.onDragStart(piece.id, verdict);
    });

    refs.pieces.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      const rect = refs.board.getBoundingClientRect();
      const cs = parseFloat(getComputedStyle(refs.board).getPropertyValue('--cell')) || 40;
      const pad = parseFloat(getComputedStyle(refs.board).getPropertyValue('--pad')) || 0;
      const fr = (e.clientY - rect.top - pad) / cs - 0.5;
      const fc = (e.clientX - rect.left - pad) / cs - 0.5;
      drag.el.style.setProperty('--r', Math.max(-0.5, Math.min(state.board.rows - 0.5, fr)));
      drag.el.style.setProperty('--c', Math.max(-0.5, Math.min(state.board.cols - 0.5, fc)));
      const cell = cellFromPoint(e.clientX, e.clientY);
      if (cell) {
        drag.next = cell;
        setHoverCell(cell.r, cell.c);
        if (drag.checking) {
          const okTarget = peekMoves.some((m) => m.r === cell.r && m.c === cell.c);
          drag.el.classList.toggle('is-over-legal', okTarget);
          drag.el.classList.toggle('is-over-illegal', !okTarget);
        }
      } else {
        setHoverCell(null);
        drag.el.classList.remove('is-over-legal', 'is-over-illegal');
      }
    });

    const endDrag = (e) => {
      if (!drag || (e.pointerId != null && e.pointerId !== drag.pointerId)) return;
      const d = drag;
      drag = null;
      peekMoves = [];
      d.el.classList.remove('is-dragging', 'is-over-legal', 'is-over-illegal');
      setHoverCell(null);
      hooks.onDragEnd();
      if (!d.moved) {
        hooks.onPieceTap(d.id);
        draw(state, ui);
        return;
      }
      const piece = state.pieces.find((p) => p.id === d.id);
      if (!piece) { draw(state, ui); return; }
      // 以「松手位置」为准：快速拖动或触屏时未必有落在终点上的 pointermove；
      // 松手在棋盘外 = 取消本次拖动（回到原位）。
      let target = null;
      if (e && e.type === 'pointerup' && typeof e.clientX === 'number') {
        target = cellFromPoint(e.clientX, e.clientY);
      }
      if (target && (target.r !== d.from.r || target.c !== d.from.c)) {
        const accepted = hooks.onPieceDrop(d.id, target.r, target.c);
        if (!accepted) {
          positionPiece(d.el, d.from.r, d.from.c);
          shakePiece(d.id);
          draw(state, ui);
          return;
        }
      }
      draw(state, ui);
    };
    refs.pieces.addEventListener('pointerup', endDrag);
    refs.pieces.addEventListener('pointercancel', endDrag);

    // 单击空格：落子 / 上色
    refs.cells.addEventListener('pointerdown', (e) => {
      const cell = cellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      e.preventDefault();
      painting = true;
      hooks.onCellPaint(cell.r, cell.c, e);
    });
    refs.cells.addEventListener('pointerover', (e) => {
      if (!painting) return;
      const el = e.target.closest('.cell');
      if (!el) return;
      hooks.onCellPaint(Number(el.dataset.r), Number(el.dataset.c), { paintMove: true });
    });
    window.addEventListener('pointerup', () => { painting = false; });

    // 右键删除棋子
    refs.board.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const el = e.target.closest('.piece');
      if (el) { hooks.onPieceDelete(el.dataset.id); return; }
      const cell = cellFromPoint(e.clientX, e.clientY);
      if (cell) hooks.onCellRightClick(cell.r, cell.c);
    });

    window.addEventListener('resize', () => { if (state) { applyBoardStyle(); } });
  }

  CE.render = {
    init(r, h) { refs = r; hooks = h; attach(); },
    draw,
    highlightOnly,
    setHoverCell,
    shakePiece,
    cellSize: () => (state ? cellSize(state) : 40),
    get dragId() { return drag ? drag.id : null; }
  };
})(window.CE = window.CE || {});
