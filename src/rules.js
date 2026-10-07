/* 棋局工坊 — 规则引擎
 * 负责：走法生成（含阻挡、马腿、炮架、区域限制）、合法性过滤、将军判定、胜负判定。
 * 引擎只依赖 model 中的纯数据，不触碰 DOM，因此可以在 Node 里直接测试。
 */
(function (CE) {
  'use strict';

  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }

  /** 把方向组名称展开成具体向量；forward 等相对方向按阵营朝向计算。 */
  function resolveDirs(key, custom, armyDir) {
    const d = armyDir >= 0 ? 1 : -1;
    switch (key) {
      case 'none': return [];
      case 'ortho': return ORTHO;
      case 'diag': return DIAG;
      case 'all': return ORTHO.concat(DIAG);
      case 'forward': return [[d, 0]];
      case 'forwardDiag': return [[d, -1], [d, 1]];
      case 'back': return [[-d, 0]];
      case 'side': return [[0, -1], [0, 1]];
      case 'knight': return KNIGHT;
      case 'custom':
        return (custom || []).filter((v) => Array.isArray(v) && v.length === 2 && (v[0] || v[1]));
      default: return [];
    }
  }

  /** 一跳之内的“腿”（马腿、象眼等）。unit=true 表示相邻一步，可连续滑行。 */
  function leapShape(dr, dc) {
    const g = gcd(dr, dc);
    if (g > 1) {
      const ur = dr / g, uc = dc / g;
      const legs = [];
      for (let k = 1; k < g; k++) legs.push([ur * k, uc * k]);
      return { unit: false, legs };
    }
    const ar = Math.abs(dr), ac = Math.abs(dc);
    if (ar === 2 && ac === 1) return { unit: false, legs: [[dr / 2, 0]] };
    if (ar === 1 && ac === 2) return { unit: false, legs: [[0, dc / 2]] };
    if (ar <= 1 && ac <= 1) return { unit: true, legs: [] };
    return { unit: false, legs: [] };
  }

  function occupancy(state) {
    const m = new Map();
    for (const p of state.pieces) m.set(CE.model.key(p.r, p.c), p);
    return m;
  }

  function pathBlocked(occ, fr, fc, dr, dc, step, jump) {
    if (jump) return false;
    const shape = leapShape(dr, dc);
    for (let s = 1; s < step; s++) {
      if (occ.has(CE.model.key(fr + dr * s, fc + dc * s))) return true;
    }
    for (let s = 0; s < step; s++) {
      for (const leg of shape.legs) {
        if (occ.has(CE.model.key(fr + dr * s + leg[0], fc + dc * s + leg[1]))) return true;
      }
    }
    return false;
  }

  function effectiveRange(range, firstRange, piece) {
    if (range === 0) return Infinity;
    if (!piece.moved && firstRange && firstRange > range) return firstRange;
    return range;
  }

  function inOwnHalf(state, type, r) {
    const army = CE.model.armyById(state, type.army);
    const half = CE.model.ownHalfRows(state, army);
    return r >= half[0] && r <= half[1];
  }

  /**
   * 生成一个棋子的所有「理论上」可走点。
   * @returns {Array<{r:number,c:number,capture:boolean}>}
   */
  function generateMoves(state, piece) {
    const M = CE.model;
    const type = M.typeById(state, piece.t);
    if (!type) return [];
    const army = M.armyById(state, type.army);
    const mv = type.move;
    const occ = occupancy(state);
    const out = new Map();
    const zoneOk = (r) => type.zone !== 'ownHalf' || inOwnHalf(state, type, r);
    const add = (r, c, capture) => {
      const k = M.key(r, c);
      const prev = out.get(k);
      if (prev) { if (capture) prev.capture = true; }
      else out.set(k, { r, c, capture: !!capture });
    };

    /**
     * @param mode 'both' 走吃同向 | 'moveOnly' 只走不吃 | 'captureOnly' 只吃不走
     */
    const walk = (dirKey, range, firstRange, mode) => {
      const offs = resolveDirs(dirKey, mv.custom, army ? army.dir : 1);
      const captureOnly = mode === 'captureOnly';
      const allowCapture = mode !== 'moveOnly';
      const allowMove = mode !== 'captureOnly';
      const maxSteps = captureOnly ? (range === 0 ? Infinity : range) : effectiveRange(range, firstRange, piece);
      for (const off of offs) {
        const dr = off[0], dc = off[1];
        if (!dr && !dc) continue;
        for (let step = 1; ; step++) {
          if (step > maxSteps) break;
          const r = piece.r + dr * step;
          const c = piece.c + dc * step;
          if (!M.inBounds(state, r, c)) break;
          if (pathBlocked(occ, piece.r, piece.c, dr, dc, step, mv.jump)) break;
          const target = occ.get(M.key(r, c));
          if (!target) {
            if (M.isBlocked(state, r, c)) break;          // 障碍格：阻断整条线
            if (allowMove && zoneOk(r)) add(r, c, false);
            continue;
          }
          if (target.id !== piece.id && allowCapture) {
            const tt = M.typeById(state, target.t);
            if (tt && tt.army !== type.army && zoneOk(r)) add(r, c, true);
          }
          break;                                          // 遇子止步
        }
      }
    };

    if (mv.cannon) {
      // 炮式：直行不吃子；吃子必须隔一个「炮架」
      const offs = resolveDirs(mv.moveDirs, mv.custom, army ? army.dir : 1);
      const maxSteps = effectiveRange(mv.moveRange, mv.moveFirstRange, piece);
      for (const off of offs) {
        const dr = off[0], dc = off[1];
        if (!dr && !dc) continue;
        let screened = false;
        for (let step = 1; step <= maxSteps; step++) {
          const r = piece.r + dr * step;
          const c = piece.c + dc * step;
          if (!M.inBounds(state, r, c)) break;
          if (M.isBlocked(state, r, c)) break;
          const target = occ.get(M.key(r, c));
          if (!target) {
            if (!screened && zoneOk(r)) add(r, c, false);
            continue;
          }
          if (!screened) { screened = true; continue; }
          const tt = M.typeById(state, target.t);
          if (tt && tt.army !== type.army && zoneOk(r)) add(r, c, true);
          break;
        }
      }
    } else {
      const sameDirs = mv.captureDirs === 'same';
      if (mv.moveDirs !== 'none') {
        walk(mv.moveDirs, mv.moveRange, mv.moveFirstRange, sameDirs ? 'both' : 'moveOnly');
      }
      if (!sameDirs && mv.captureDirs !== 'none') {
        walk(mv.captureDirs, mv.captureRange, 0, 'captureOnly');
      }
    }
    return Array.from(out.values());
  }

  /** 走一步后的「轻量副本」状态，用于将军判定与试走。 */
  function simulate(state, piece, move) {
    const pieces = [];
    for (const p of state.pieces) {
      if (p.id === piece.id) {
        pieces.push({ id: p.id, t: p.t, r: move.r, c: move.c, moved: true });
      } else if (p.r === move.r && p.c === move.c) {
        continue;                                        // 被吃
      } else {
        pieces.push(p);
      }
    }
    return {
      board: state.board, cells: state.cells, rules: state.rules,
      armies: state.armies, pieceTypes: state.pieceTypes, pieces
    };
  }

  function findKing(state, armyId) {
    for (const p of state.pieces) {
      const t = CE.model.typeById(state, p.t);
      if (t && t.isKing && t.army === armyId) return p;
    }
    return null;
  }

  /** (r,c) 是否被 byArmyId 阵营的棋子攻击（只考虑吃子走法）。 */
  function isAttacked(state, r, c, byArmyId) {
    const M = CE.model;
    for (const p of state.pieces) {
      const t = M.typeById(state, p.t);
      if (!t || t.army !== byArmyId) continue;
      const moves = generateMoves(state, p);
      for (const m of moves) {
        if (m.r === r && m.c === c && m.capture) return true;
      }
    }
    return false;
  }

  function isInCheck(state, armyId) {
    const king = findKing(state, armyId);
    if (!king) return false;
    for (const a of state.armies) {
      if (a.id === armyId) continue;
      if (CE.model.countArmyPieces(state, a.id) === 0) continue;
      if (isAttacked(state, king.r, king.c, a.id)) return true;
    }
    return false;
  }

  /** 正式对局用的合法走法（会过滤掉送将）。 */
  function legalMovesFor(state, piece) {
    const M = CE.model;
    const raw = generateMoves(state, piece);
    const type = M.typeById(state, piece.t);
    if (!type || !state.rules.forbidSelfCheck) return raw;
    if (!findKing(state, type.army)) return raw;
    return raw.filter((m) => {
      const next = simulate(state, piece, m);
      const king = findKing(next, type.army);
      if (!king) return true;
      return !isAttackedByOthers(next, king, type.army);
    });
  }

  function isAttackedByOthers(state, king, ownArmy) {
    for (const a of state.armies) {
      if (a.id === ownArmy) continue;
      if (isAttacked(state, king.r, king.c, a.id)) return true;
    }
    return false;
  }

  function hasAnyLegalMove(state, armyId) {
    const M = CE.model;
    for (const p of state.pieces) {
      const t = M.typeById(state, p.t);
      if (!t || t.army !== armyId) continue;
      if (legalMovesFor(state, p).length) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------
  // 对局流程
  // ------------------------------------------------------------------
  function startPlay(state) {
    const M = CE.model;
    state.play.order = M.activeArmies(state).map((a) => a.id);
    state.play.turn = 0;
    state.play.plies = [];
    state.play.result = null;
    state.play.active = true;
    state.pieces.forEach((p) => { p.moved = false; });
    return state;
  }

  function currentArmyId(state) {
    const order = state.play.order;
    if (!order || !order.length) {
      const act = CE.model.activeArmies(state);
      return act.length ? act[0].id : null;
    }
    return order[state.play.turn % order.length];
  }

  function advanceTurn(state) {
    const order = state.play.order;
    if (!order.length) return;
    let i = state.play.turn;
    for (let k = 0; k < order.length; k++) {
      i = (i + 1) % order.length;
      if (CE.model.countArmyPieces(state, order[i]) > 0) break;
    }
    state.play.turn = i;
  }

  function squareName(state, r, c) {
    const file = c < 26 ? String.fromCharCode(97 + c) : String(c + 1);
    return file + (state.board.rows - r);
  }

  function isLastRow(state, type, r) {
    const army = CE.model.armyById(state, type.army);
    const dir = army ? army.dir : 1;
    return dir < 0 ? r === 0 : r === state.board.rows - 1;
  }

  /** 真正落子（就地修改 state）。返回本步详情。 */
  function applyPly(state, pieceId, move) {
    const M = CE.model;
    const piece = state.pieces.find((p) => p.id === pieceId);
    if (!piece) return null;
    const type = M.typeById(state, piece.t);
    if (!type) return null;
    const captured = state.pieces.find((p) => p.r === move.r && p.c === move.c && p.id !== pieceId) || null;
    const from = { r: piece.r, c: piece.c };
    if (captured) state.pieces = state.pieces.filter((p) => p.id !== captured.id);
    piece.r = move.r;
    piece.c = move.c;
    piece.moved = true;

    const ply = {
      army: type.army,
      t: piece.t,
      sym: type.glyph || (type.shape === 'stone' ? (M.armyById(state, type.army) || {}).name : type.name),
      from, to: { r: move.r, c: move.c },
      captured: captured ? captured.t : null,
      capturedSym: captured ? (M.typeById(state, captured.t) || {}).glyph : null,
      promotion: null,
      check: false
    };
    let promotionNote = '';
    const promo = type.promote;
    if (promo && promo.enabled && promo.toTypeId && isLastRow(state, type, move.r)) {
      const nt = M.typeById(state, promo.toTypeId);
      if (nt) {
        piece.t = nt.id;
        ply.promotion = { from: type.name, to: nt.name, typeId: nt.id };
        promotionNote = '=' + nt.name;
      }
    }
    const arrow = captured ? '×' : '→';
    ply.text = (ply.sym || type.name) + ' ' + squareName(state, from.r, from.c) + arrow + squareName(state, move.r, move.c) + promotionNote;
    state.play.plies.push(ply);
    return { piece, type, captured, ply };
  }

  /** 胜负判定；返回 null 表示继续。 */
  function evaluate(state) {
    const M = CE.model;
    const plies = state.play.plies;
    const last = plies.length ? plies[plies.length - 1] : null;
    const nextArmyId = currentArmyId(state);
    const nameOf = (id) => (M.armyById(state, id) || { name: id }).name;

    for (const w of state.wins || []) {
      if (w.kind === 'captureKing') {
        if (last && last.captured) {
          const ct = M.typeById(state, last.captured);
          if (ct && ct.isKing) return { kind: 'win', army: last.army, reason: '擒获对方的「' + ct.name + '」' };
        }
      } else if (w.kind === 'eliminateArmy') {
        const target = w.army;
        if (target && target !== 'any' && M.countArmyPieces(state, target) === 0 && last) {
          return { kind: 'win', army: last.army, reason: nameOf(target) + ' 全军覆没' };
        }
      } else if (w.kind === 'reachGoal') {
        if (last && M.terrainAt(state, last.to.r, last.to.c) === 'goal') {
          const armyOk = !w.army || w.army === 'any' || w.army === last.army;
          const typeOk = !w.typeId || w.typeId === 'any' || w.typeId === last.t;
          if (armyOk && typeOk) return { kind: 'win', army: last.army, reason: '棋子抵达目标点' };
        }
      }
    }

    if (state.rules.drawPlyLimit > 0 && plies.length >= state.rules.drawPlyLimit) {
      return { kind: 'draw', army: null, reason: '达到 ' + state.rules.drawPlyLimit + ' 个半回合的上限' };
    }

    if (state.rules.stalemateLoss && nextArmyId && M.countArmyPieces(state, nextArmyId) > 0) {
      if (!hasAnyLegalMove(state, nextArmyId)) {
        return { kind: 'win', army: last ? last.army : null, reason: nameOf(nextArmyId) + ' 无子可动' };
      }
    }
    return null;
  }

  /** 非吃子/吃子统一校验：这步棋在正式对局里是否合法。 */
  function validateMove(state, piece, move) {
    return legalMovesFor(state, piece).some((m) => m.r === move.r && m.c === move.c);
  }

  CE.rules = {
    ORTHO, DIAG, KNIGHT, resolveDirs, leapShape, occupancy, effectiveRange,
    generateMoves, legalMovesFor, simulate, findKing, isAttacked, isInCheck,
    hasAnyLegalMove, startPlay, currentArmyId, advanceTurn, applyPly, evaluate,
    validateMove, squareName, isLastRow
  };
})(window.CE = window.CE || {});
