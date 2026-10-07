/* 棋局工坊 — 预设：棋盘风格、方向组、走法模板、棋局模板 */
(function (CE) {
  'use strict';

  const THEMES = [
    { id: 'wood', name: '木纹' },
    { id: 'marble', name: '大理石' },
    { id: 'jade', name: '青玉' },
    { id: 'ink', name: '素纸' },
    { id: 'midnight', name: '午夜' }
  ];

  const ARMY_COLORS = ['#b3402f', '#2d3742', '#f6f3ec', '#2f6b63', '#c8892a', '#5b4b8a', '#8a8f98', '#111318'];

  /* 棋盘配色（与 styles.css 中的主题保持一致，导出图片时使用） */
  const BOARD_COLORS = {
    wood: { a: '#f0d9b5', b: '#d8b98c', frame: '#a9793f', line: 'rgba(74,48,18,.28)', text: '#3a2a16', goal: '#b3402f' },
    marble: { a: '#fbfbf9', b: '#e7e8e5', frame: '#cfccc5', line: 'rgba(0,0,0,.10)', text: '#33312e', goal: '#2f6b63' },
    jade: { a: '#eaf2ec', b: '#d5e5db', frame: '#9db3a5', line: 'rgba(30,60,45,.20)', text: '#2c4a3a', goal: '#b3402f' },
    ink: { a: '#faf8f4', b: '#faf8f4', frame: '#e7e2d8', line: 'rgba(40,36,30,.55)', text: '#33302a', goal: '#b3402f' },
    midnight: { a: '#242b36', b: '#1d232c', frame: '#101319', line: 'rgba(255,255,255,.10)', text: '#c9d3e0', goal: '#e0a44a' }
  };

  /* 方向组（forward / back 等相对方向会在引擎里按阵营朝向展开） */
  const DIR_OPTIONS = [
    { v: 'none', t: '不可移动' },
    { v: 'ortho', t: '上下左右' },
    { v: 'diag', t: '斜向四格' },
    { v: 'all', t: '八个方向' },
    { v: 'forward', t: '仅向前' },
    { v: 'forwardDiag', t: '仅前斜两格' },
    { v: 'back', t: '仅向后' },
    { v: 'side', t: '仅左右' },
    { v: 'knight', t: '日字（马步）' },
    { v: 'custom', t: '自定义方向…' }
  ];

  const SHAPES = [
    { v: 'glyph', t: '字形' },
    { v: 'disc', t: '圆形棋子' },
    { v: 'stone', t: '围棋子' }
  ];

  /** 走法模板：套用后可在高级选项里微调。 */
  const MOVE_PRESETS = [
    {
      id: 'stepOrtho', name: '单步 · 上下左右', desc: '只能走到四周相邻的一格',
      move: { moveDirs: 'ortho', moveRange: 1, moveFirstRange: 0, captureDirs: 'same', captureRange: 1, jump: false, cannon: false }
    },
    {
      id: 'stepAll', name: '单步 · 八个方向', desc: '王棋走法，四周一格（含斜向）',
      move: { moveDirs: 'all', moveRange: 1, moveFirstRange: 0, captureDirs: 'same', captureRange: 1, jump: false, cannon: false }
    },
    {
      id: 'stepDiag', name: '单步 · 斜向一格', desc: '只能斜着走一格（士）',
      move: { moveDirs: 'diag', moveRange: 1, moveFirstRange: 0, captureDirs: 'same', captureRange: 1, jump: false, cannon: false }
    },
    {
      id: 'rook', name: '长驱 · 直线滑行（车）', desc: '横竖任意格，遇子止步',
      move: { moveDirs: 'ortho', moveRange: 0, moveFirstRange: 0, captureDirs: 'same', captureRange: 0, jump: false, cannon: false }
    },
    {
      id: 'bishop', name: '长驱 · 斜线滑行（象）', desc: '斜向任意格，遇子止步',
      move: { moveDirs: 'diag', moveRange: 0, moveFirstRange: 0, captureDirs: 'same', captureRange: 0, jump: false, cannon: false }
    },
    {
      id: 'queen', name: '长驱 · 八方向滑行（后）', desc: '横竖斜任意格',
      move: { moveDirs: 'all', moveRange: 0, moveFirstRange: 0, captureDirs: 'same', captureRange: 0, jump: false, cannon: false }
    },
    {
      id: 'knight', name: '跳跃 · 日字（马）', desc: '走日字，可以越过棋子',
      move: { moveDirs: 'knight', moveRange: 1, moveFirstRange: 0, captureDirs: 'same', captureRange: 1, jump: true, cannon: false }
    },
    {
      id: 'horse', name: '跳跃 · 日字（蹩马腿）', desc: '走日字，但紧邻的格子有子时会被别住',
      move: { moveDirs: 'knight', moveRange: 1, moveFirstRange: 0, captureDirs: 'same', captureRange: 1, jump: false, cannon: false }
    },
    {
      id: 'elephant', name: '斜跳两格（象/相）', desc: '田字斜跳，象眼被塞则不可走',
      move: { moveDirs: 'custom', custom: [[2, 2], [2, -2], [-2, 2], [-2, -2]], moveRange: 1, moveFirstRange: 0, captureDirs: 'same', captureRange: 1, jump: false, cannon: false }
    },
    {
      id: 'cannon', name: '炮 · 直行不吃 / 隔子吃', desc: '走如车，吃子必须隔一个棋子',
      move: { moveDirs: 'ortho', moveRange: 0, moveFirstRange: 0, captureDirs: 'same', captureRange: 0, jump: false, cannon: true }
    },
    {
      id: 'pawnChess', name: '兵卒 · 直行斜吃（国际象棋）', desc: '向前一格（首步两格），斜前方吃子',
      move: { moveDirs: 'forward', moveRange: 1, moveFirstRange: 2, captureDirs: 'forwardDiag', captureRange: 1, jump: false, cannon: false }
    },
    {
      id: 'pawnSimple', name: '兵卒 · 只能向前一格', desc: '勇往直前，不许后退',
      move: { moveDirs: 'forward', moveRange: 1, moveFirstRange: 0, captureDirs: 'same', captureRange: 1, jump: false, cannon: false }
    },
    {
      id: 'custom', name: '自定义方向…', desc: '自己填写 (行,列) 偏移量',
      move: { moveDirs: 'custom', moveRange: 1, moveFirstRange: 0, captureDirs: 'same', captureRange: 1, jump: false, cannon: false }
    },
    {
      id: 'static', name: '静物 · 不可移动', desc: '固定障碍或标记物',
      move: { moveDirs: 'none', moveRange: 1, moveFirstRange: 0, captureDirs: 'none', captureRange: 1, jump: false, cannon: false }
    }
  ];

  const WIN_KINDS = [
    { id: 'captureKing', name: '擒王', desc: '吃掉任意被标记为「王」的棋子', params: [] },
    { id: 'eliminateArmy', name: '全歼', desc: '某个阵营的棋子被全部消灭', params: ['army'] },
    { id: 'reachGoal', name: '抵达目标', desc: '棋子走到标有「目标」的格子', params: ['army', 'typeId'] },
    { id: 'noMoves', name: '困毙', desc: '轮到对方时无子可动', params: ['result'] }
  ];

  // ------------------------------------------------------------------
  // 棋局模板
  // ------------------------------------------------------------------
  function moveOf(base) {
    return Object.assign(CE.model.defaultMove(), base);
  }
  function mkType(o) {
    return Object.assign({
      id: CE.model.uid('pt'), name: '棋子', army: 'a', glyph: '●', shape: 'glyph',
      desc: '', isKing: false, zone: 'any', promote: { enabled: false, toTypeId: null },
      move: CE.model.defaultMove()
    }, o);
  }
  function baseWins(kinds, M) {
    return (kinds || ['captureKing']).map((k) => (typeof k === 'string'
      ? { id: M.uid('win'), kind: k }
      : Object.assign({ id: M.uid('win') }, k)));
  }

  function builders() {
    const M = CE.model;
    return {
      /* 国际象棋 */
      chess() {
        const s = M.blankState({ name: '国际象棋', rows: 8, cols: 8, theme: 'wood' });
        s.armies = [
          { id: 'w', name: '白方', color: '#f2ede2', dir: -1 },
          { id: 'b', name: '黑方', color: '#2b2c31', dir: 1 }
        ];
        const spec = [
          ['king', '王', { moveDirs: 'all', moveRange: 1 }, { isKing: true }, ['♔', '♚']],
          ['queen', '后', { moveDirs: 'all', moveRange: 0, captureRange: 0 }, {}, ['♕', '♛']],
          ['rook', '车', { moveDirs: 'ortho', moveRange: 0, captureRange: 0 }, {}, ['♖', '♜']],
          ['bishop', '象', { moveDirs: 'diag', moveRange: 0, captureRange: 0 }, {}, ['♗', '♝']],
          ['knight', '马', { moveDirs: 'knight', moveRange: 1, jump: true }, {}, ['♘', '♞']],
          ['pawn', '兵', { moveDirs: 'forward', moveRange: 1, moveFirstRange: 2, captureDirs: 'forwardDiag', captureRange: 1 }, {}, ['♙', '♟']]
        ];
        const id = {};
        s.pieceTypes = [];
        [['w', 0], ['b', 1]].forEach(([army, gi]) => {
          spec.forEach(([role, name, mv, extra, glyphs]) => {
            const t = mkType(Object.assign({ army, name, glyph: glyphs[gi], desc: role, move: moveOf(mv) }, extra));
            t.role = role;
            id[army + ':' + role] = t.id;
            s.pieceTypes.push(t);
          });
        });
        s.pieceTypes.filter((t) => t.role === 'pawn').forEach((t) => {
          t.promote = { enabled: true, toTypeId: id[t.army + ':queen'] };
        });
        const add = (r, c, t) => s.pieces.push({ id: M.uid('p'), t, r, c, moved: false });
        const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
        back.forEach((role, c) => {
          add(0, c, id['b:' + role]);
          add(7, c, id['w:' + role]);
        });
        for (let c = 0; c < 8; c++) {
          add(1, c, id['b:pawn']);
          add(6, c, id['w:pawn']);
        }
        s.rules = { forbidSelfCheck: true, drawPlyLimit: 0, stalemateLoss: true };
        s.wins = baseWins(['captureKing'], M);
        s.pieceTypes.forEach((t) => { delete t.role; });
        return s;
      },

      /* 中国象棋（走法接近，未含九宫与过河规则，可在编辑器里调整） */
      xiangqi() {
        const s = M.blankState({ name: '中国象棋', rows: 10, cols: 9, theme: 'jade' });
        s.armies = [
          { id: 'r', name: '红方', color: '#b23a2e', dir: -1 },
          { id: 'b', name: '黑方', color: '#23262b', dir: 1 }
        ];
        const spec = [
          ['king', '帅', '將', { moveDirs: 'ortho', moveRange: 1 }, { isKing: true }],
          ['advisor', '仕', '士', { moveDirs: 'diag', moveRange: 1 }, {}],
          ['elephant', '相', '象', { moveDirs: 'custom', custom: [[2, 2], [2, -2], [-2, 2], [-2, -2]], moveRange: 1, jump: false }, { zone: 'ownHalf' }],
          ['horse', '马', '馬', { moveDirs: 'knight', moveRange: 1, jump: false }, {}],
          ['chariot', '车', '車', { moveDirs: 'ortho', moveRange: 0, captureRange: 0 }, {}],
          ['cannon', '炮', '砲', { moveDirs: 'ortho', moveRange: 0, captureRange: 0, cannon: true }, {}],
          ['soldier', '兵', '卒', { moveDirs: 'forward', moveRange: 1 }, {}]
        ];
        const id = {};
        s.pieceTypes = [];
        spec.forEach(([role, rn, bn, mv, extra]) => {
          const tr = mkType(Object.assign({ army: 'r', name: rn, glyph: rn, shape: 'disc', desc: role, move: moveOf(mv) }, extra));
          const tb = mkType(Object.assign({ army: 'b', name: bn, glyph: bn, shape: 'disc', desc: role, move: moveOf(mv) }, extra));
          id['r:' + role] = tr.id;
          id['b:' + role] = tb.id;
          s.pieceTypes.push(tr, tb);
        });
        const add = (r, c, t) => s.pieces.push({ id: M.uid('p'), t, r, c, moved: false });
        const back = ['chariot', 'horse', 'elephant', 'advisor', 'king', 'advisor', 'elephant', 'horse', 'chariot'];
        back.forEach((role, c) => {
          add(0, c, id['b:' + role]);
          add(9, c, id['r:' + role]);
        });
        [1, 7].forEach((c) => {
          add(2, c, id['b:cannon']);
          add(7, c, id['r:cannon']);
        });
        [0, 2, 4, 6, 8].forEach((c) => {
          add(3, c, id['b:soldier']);
          add(6, c, id['r:soldier']);
        });
        s.rules = { forbidSelfCheck: true, drawPlyLimit: 0, stalemateLoss: true };
        s.wins = baseWins(['captureKing'], M);
        return s;
      },

      /* 迷你象棋 6×6 */
      mini6() {
        const s = M.blankState({ name: '迷你象棋', rows: 6, cols: 6, theme: 'marble' });
        s.armies = [
          { id: 'r', name: '红方', color: '#b3402f', dir: -1 },
          { id: 'b', name: '黑方', color: '#2d3742', dir: 1 }
        ];
        const spec = [
          ['king', '王', { moveDirs: 'all', moveRange: 1 }, { isKing: true }, ['♔', '♚']],
          ['rook', '车', { moveDirs: 'ortho', moveRange: 0, captureRange: 0 }, {}, ['♖', '♜']],
          ['bishop', '象', { moveDirs: 'diag', moveRange: 0, captureRange: 0 }, {}, ['♗', '♝']],
          ['knight', '马', { moveDirs: 'knight', moveRange: 1, jump: true }, {}, ['♘', '♞']],
          ['pawn', '兵', { moveDirs: 'forward', moveRange: 1, moveFirstRange: 2, captureDirs: 'forwardDiag', captureRange: 1 }, {}, ['♙', '♟']]
        ];
        const id = {};
        s.pieceTypes = [];
        [['r', 0], ['b', 1]].forEach(([army, gi]) => {
          spec.forEach(([role, name, mv, extra, glyphs]) => {
            const t = mkType(Object.assign({ army, name, glyph: glyphs[gi], desc: role, move: moveOf(mv) }, extra));
            t.role = role;
            id[army + ':' + role] = t.id;
            s.pieceTypes.push(t);
          });
        });
        s.pieceTypes.filter((t) => t.role === 'pawn').forEach((t) => {
          t.promote = { enabled: true, toTypeId: id[t.army + ':rook'] };
        });
        const add = (r, c, t) => s.pieces.push({ id: M.uid('p'), t, r, c, moved: false });
        const back = ['rook', 'knight', 'bishop', 'king', 'bishop', 'knight'];
        back.forEach((role, c) => {
          add(0, c, id['b:' + role]);
          add(5, c, id['r:' + role]);
        });
        for (let c = 0; c < 6; c++) {
          add(1, c, id['b:pawn']);
          add(4, c, id['r:pawn']);
        }
        s.rules = { forbidSelfCheck: true, drawPlyLimit: 0, stalemateLoss: true };
        s.wins = baseWins(['captureKing'], M);
        s.pieceTypes.forEach((t) => { delete t.role; });
        return s;
      },

      /* 空白棋盘 + 一整套基础棋子，方便自由设计 */
      empty8() {
        const s = M.blankState({ name: '空白棋局', rows: 8, cols: 8, theme: 'wood' });
        const spec = [
          ['king', '王', '♚', { moveDirs: 'all', moveRange: 1 }, { isKing: true }],
          ['rook', '车', '♜', { moveDirs: 'ortho', moveRange: 0, captureRange: 0 }, {}],
          ['bishop', '象', '♝', { moveDirs: 'diag', moveRange: 0, captureRange: 0 }, {}],
          ['knight', '马', '♞', { moveDirs: 'knight', moveRange: 1, jump: true }, {}],
          ['pawn', '兵', '♟', { moveDirs: 'forward', moveRange: 1, moveFirstRange: 2, captureDirs: 'forwardDiag', captureRange: 1 }, {}]
        ];
        const id = {};
        s.pieceTypes = [];
        [['a'], ['b']].forEach(([army]) => {
          spec.forEach(([role, name, glyph, mv, extra]) => {
            const t = mkType(Object.assign({ army, name, glyph, desc: role, move: moveOf(mv) }, extra));
            t.role = role;
            id[army + ':' + role] = t.id;
            s.pieceTypes.push(t);
          });
        });
        s.pieceTypes.filter((t) => t.role === 'pawn').forEach((t) => {
          t.promote = { enabled: true, toTypeId: id[t.army + ':rook'] };
        });
        s.rules = { forbidSelfCheck: true, drawPlyLimit: 0, stalemateLoss: true };
        s.wins = baseWins(['captureKing'], M);
        s.pieceTypes.forEach((t) => { delete t.role; });
        return s;
      },

      /* 抢中点：演示目标格 + 擒王两种胜负条件 */
      kingHill() {
        const s = M.blankState({ name: '抢占中点', rows: 7, cols: 7, theme: 'jade' });
        s.armies = [
          { id: 'r', name: '红方', color: '#b3402f', dir: -1 },
          { id: 'b', name: '蓝方', color: '#2f6b9c', dir: 1 }
        ];
        s.cells = { '3,3': 'goal' };
        const mk = (army, glyphs) => [
          mkType({ army, name: '王', glyph: glyphs[0], isKing: true, desc: '王', move: moveOf({ moveDirs: 'all', moveRange: 1 }) }),
          mkType({ army, name: '飞', glyph: glyphs[1], desc: '飞', move: moveOf({ moveDirs: 'all', moveRange: 0, captureRange: 0 }) }),
          mkType({ army, name: '兵', glyph: glyphs[2], desc: '兵', move: moveOf({ moveDirs: 'forward', moveRange: 1, moveFirstRange: 2, captureDirs: 'forwardDiag', captureRange: 1 }) })
        ];
        const R = mk('r', ['帅', '车', '兵']);
        const B = mk('b', ['將', '車', '卒']);
        R[0].shape = R[1].shape = R[2].shape = 'disc';
        B[0].shape = B[1].shape = B[2].shape = 'disc';
        s.pieceTypes = R.concat(B);
        const add = (r, c, t) => s.pieces.push({ id: M.uid('p'), t, r, c, moved: false });
        add(6, 3, R[0].id); add(6, 2, R[1].id); add(5, 1, R[2].id); add(5, 5, R[2].id);
        add(0, 3, B[0].id); add(0, 4, B[1].id); add(1, 1, B[2].id); add(1, 5, B[2].id);
        s.rules = { forbidSelfCheck: true, drawPlyLimit: 0, stalemateLoss: true };
        s.wins = baseWins([
          'captureKing',
          { kind: 'reachGoal', army: 'any', typeId: 'any' }
        ], M);
        return s;
      },

      /* 围棋盘：自由摆谱 */
      go19() {
        const s = M.blankState({ name: '围棋盘', rows: 19, cols: 19, theme: 'ink', grid: 'line' });
        s.armies = [
          { id: 'b', name: '黑子', color: '#1c1e22', dir: 1 },
          { id: 'w', name: '白子', color: '#f4f2ec', dir: -1 }
        ];
        s.pieceTypes = [
          mkType({ army: 'b', name: '黑子', glyph: '', shape: 'stone', move: moveOf({ moveDirs: 'none', captureDirs: 'none' }) }),
          mkType({ army: 'w', name: '白子', glyph: '', shape: 'stone', move: moveOf({ moveDirs: 'none', captureDirs: 'none' }) })
        ];
        s.wins = [];
        s.rules = { forbidSelfCheck: false, drawPlyLimit: 0, stalemateLoss: false };
        return s;
      }
    };
  }

  const TEMPLATES = [
    { id: 'chess', name: '国际象棋 8×8', desc: '完整初始局面（不含王车易位与吃过路兵）' },
    { id: 'xiangqi', name: '中国象棋 9×10', desc: '完整初始局面（九宫、过河等限制可自行添加）' },
    { id: 'mini6', name: '迷你象棋 6×6', desc: '小棋盘快速对局' },
    { id: 'empty8', name: '空白棋局 8×8', desc: '两阵营各五种基础棋子，自由布子' },
    { id: 'kingHill', name: '抢占中点 7×7', desc: '演示「抵达目标格」胜负条件' },
    { id: 'go19', name: '围棋盘 19×19', desc: '线框棋盘与圆形棋子，适合摆谱' }
  ];

  CE.presets = {
    THEMES, ARMY_COLORS, BOARD_COLORS, DIR_OPTIONS, SHAPES, MOVE_PRESETS, WIN_KINDS, TEMPLATES,
    build(idOrFn) {
      const b = builders();
      if (typeof idOrFn === 'function') return idOrFn(CE.model);
      return (b[idOrFn] || b.empty8)();
    }
  };
})(window.CE = window.CE || {});
