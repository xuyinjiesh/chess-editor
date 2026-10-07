/* 棋局工坊 — 数据模型
 * 所有状态都是可 JSON 序列化的纯数据，便于撤销、保存与导入导出。
 */
(function (CE) {
  'use strict';

  let seq = 0;
  function uid(prefix) {
    seq += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36).slice(-4) + seq.toString(36) + Math.random().toString(36).slice(2, 5);
  }

  /** 默认走法：上下左右一步。 */
  function defaultMove() {
    return {
      moveDirs: 'ortho',        // 移动方向组（见 presets.DIR_OPTIONS）
      custom: [[-1, 0], [1, 0], [0, -1], [0, 1]], // 仅 moveDirs === 'custom' 时使用
      moveRange: 1,             // 移动最大格数；0 表示无限（滑行）
      moveFirstRange: 0,        // 首次移动的最大格数（0 表示与 moveRange 相同）
      captureDirs: 'same',      // 吃子方向组；'same' 表示与移动方向相同
      captureRange: 1,          // 吃子最大格数；0 表示无限
      jump: false,              // true = 忽略路径/马腿阻挡
      cannon: false             // true = 炮式吃子（直行不吃，隔一子吃）
    };
  }

  function blankState(opt) {
    const o = opt || {};
    return {
      v: 1,
      meta: { name: o.name || '未命名棋局', updated: Date.now() },
      board: {
        rows: o.rows || 8,
        cols: o.cols || 8,
        theme: o.theme || 'wood',
        grid: o.grid || 'fill',      // fill = 实心格，line = 线框
        coords: o.coords !== false,
        flipped: !!o.flipped,
        frame: true
      },
      armies: o.armies || [
        { id: 'a', name: '红方', color: '#b3402f', dir: -1 },
        { id: 'b', name: '黑方', color: '#2d3742', dir: 1 }
      ],
      pieceTypes: [],
      cells: {},                     // "r,c" -> 'block' | 'goal'
      pieces: [],                    // { id, t, r, c, moved }
      rules: {
        forbidSelfCheck: false,      // 禁止走出被将军的棋（送将）
        drawPlyLimit: 0,             // 回合上限（半步），0 = 不限
        stalemateLoss: true,         // 无子可动判负
        validateInEdit: false        // 编辑模式下拖动也按走法校验
      },
      wins: [{ id: uid('win'), kind: 'captureKing' }],
      play: { order: [], turn: 0, plies: [], result: null, active: false }
    };
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // ---------- 查询 ----------
  const key = (r, c) => r + ',' + c;

  function armyById(s, id) {
    return s.armies.find((a) => a.id === id) || null;
  }
  function typeById(s, id) {
    return s.pieceTypes.find((t) => t.id === id) || null;
  }
  function pieceAt(s, r, c) {
    return s.pieces.find((p) => p.r === r && p.c === c) || null;
  }
  function typeOf(s, piece) {
    return piece ? typeById(s, piece.t) : null;
  }
  /** 棋盘上有棋子的阵营，按 armies 顺序；若一个都没有则返回全部阵营。 */
  function activeArmies(s) {
    const ids = new Set(s.pieces.map((p) => {
      const t = typeById(s, p.t);
      return t ? t.army : null;
    }));
    const list = s.armies.filter((a) => ids.has(a.id));
    return list.length ? list : s.armies.slice();
  }
  function armyPieceTypes(s, armyId) {
    return s.pieceTypes.filter((t) => t.army === armyId);
  }
  function countArmyPieces(s, armyId) {
    return s.pieces.filter((p) => {
      const t = typeById(s, p.t);
      return t && t.army === armyId;
    }).length;
  }
  function inBounds(s, r, c) {
    return r >= 0 && c >= 0 && r < s.board.rows && c < s.board.cols;
  }
  function terrainAt(s, r, c) {
    return s.cells[key(r, c)] || 'plain';
  }
  function isBlocked(s, r, c) {
    return s.cells[key(r, c)] === 'block';
  }

  /** 阵营的半场行区间（含端点）。dir < 0 表示向上方推进。 */
  function ownHalfRows(s, army) {
    const rows = s.board.rows;
    const mid = Math.floor(rows / 2);
    if (!army || army.dir >= 0) return [0, mid];               // 向下推进 → 上方半场
    return [rows - 1 - mid, rows - 1];                          // 向上推进 → 下方半场
  }

  // ---------- 修复导入数据 ----------
  function normalize(raw) {
    const base = blankState();
    if (!raw || typeof raw !== 'object') return base;
    const s = Object.assign(base, clone(raw));
    s.meta = Object.assign({ name: '未命名棋局', updated: Date.now() }, raw.meta || {});
    s.board = Object.assign(base.board, raw.board || {});
    s.board.rows = clampInt(s.board.rows, 2, 24, 8);
    s.board.cols = clampInt(s.board.cols, 2, 24, 8);
    if (!Array.isArray(s.armies) || !s.armies.length) s.armies = base.armies;
    s.armies = s.armies.map((a) => ({
      id: a.id || uid('army'),
      name: a.name || '阵营',
      color: a.color || '#666',
      dir: a.dir === 1 ? 1 : -1
    }));
    const armyIds = new Set(s.armies.map((a) => a.id));
    s.pieceTypes = (Array.isArray(raw.pieceTypes) ? raw.pieceTypes : []).map((t) => {
      const move = Object.assign(defaultMove(), t.move || {});
      move.custom = Array.isArray(move.custom) ? move.custom.filter(isVec) : defaultMove().custom;
      return {
        id: t.id || uid('pt'),
        name: t.name || '棋子',
        army: armyIds.has(t.army) ? t.army : s.armies[0].id,
        glyph: typeof t.glyph === 'string' ? t.glyph : '●',
        shape: ['glyph', 'disc', 'stone'].includes(t.shape) ? t.shape : 'glyph',
        desc: t.desc || '',
        isKing: !!t.isKing,
        zone: t.zone === 'ownHalf' ? 'ownHalf' : 'any',
        promote: {
          enabled: !!(t.promote && t.promote.enabled),
          toTypeId: (t.promote && t.promote.toTypeId) || null
        },
        move
      };
    });
    const typeIds = new Set(s.pieceTypes.map((t) => t.id));
    s.pieces = (Array.isArray(raw.pieces) ? raw.pieces : [])
      .filter((p) => typeIds.has(p.t) && Number.isFinite(p.r) && Number.isFinite(p.c))
      .filter((p) => p.r >= 0 && p.c >= 0 && p.r < s.board.rows && p.c < s.board.cols)
      .map((p) => ({ id: p.id || uid('p'), t: p.t, r: p.r | 0, c: p.c | 0, moved: !!p.moved }));
    // 去掉重叠棋子
    const seen = new Set();
    s.pieces = s.pieces.filter((p) => {
      const k = key(p.r, p.c);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    s.cells = {};
    if (raw.cells && typeof raw.cells === 'object') {
      Object.keys(raw.cells).forEach((k) => {
        const v = raw.cells[k];
        if ((v === 'block' || v === 'goal') && /^\d+,\d+$/.test(k)) {
          const [r, c] = k.split(',').map(Number);
          if (inBounds(s, r, c) && !(seen.has(k))) s.cells[k] = v;
        }
      });
    }
    s.rules = Object.assign(base.rules, raw.rules || {});
    s.rules.drawPlyLimit = clampInt(s.rules.drawPlyLimit, 0, 9999, 0);
    // 允许空数组（= 不设胜负条件，例如自由摆谱）
    s.wins = Array.isArray(raw.wins)
      ? raw.wins.filter((w) => w && w.kind).map((w) => Object.assign({ id: w.id || uid('win') }, w))
      : base.wins.slice();
    s.play = Object.assign({ order: [], turn: 0, plies: [], result: null, active: false }, raw.play || {});
    s.play.plies = Array.isArray(s.play.plies) ? s.play.plies : [];
    s.play.order = Array.isArray(s.play.order) ? s.play.order.filter((id) => armyIds.has(id)) : [];
    return s;
  }

  function isVec(v) {
    return Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Math.abs(v[0]) <= 8 && Math.abs(v[1]) <= 8;
  }
  function clampInt(v, lo, hi, dflt) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }

  CE.model = {
    uid, defaultMove, blankState, clone, normalize,
    key, armyById, typeById, pieceAt, typeOf, activeArmies, armyPieceTypes,
    countArmyPieces, inBounds, terrainAt, isBlocked, ownHalfRows, clampInt
  };
})(window.CE = window.CE || {});
