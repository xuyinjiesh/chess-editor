/* 棋局工坊 — 侧栏界面
 * 所有面板由「状态 → HTML」重建；表单在输入时只回写状态与棋盘，不重建自身，避免焦点丢失。
 */
(function (CE) {
  'use strict';

  const P = CE.presets;
  let refs = {};

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const app = () => CE.app;
  const S = () => CE.app.state;
  const U = () => CE.app.ui;

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  const DIR_TXT = {
    none: '不可移动', ortho: '上下左右', diag: '斜线', all: '八方向', forward: '仅向前',
    forwardDiag: '前斜两格', back: '仅向后', side: '仅左右', knight: '日字', custom: '自定义方向'
  };

  function describeMove(t) {
    const m = t.move;
    if (m.cannon) return (DIR_TXT[m.moveDirs] || '') + ' · 隔子吃';
    const bits = [];
    const dirTxt = DIR_TXT[m.moveDirs] || m.moveDirs;
    if (m.moveDirs === 'none') return '不可移动';
    bits.push(dirTxt);
    bits.push(m.moveRange === 0 ? '不限距离' : m.moveRange + ' 格');
    if (m.moveFirstRange > m.moveRange && m.moveRange !== 0) bits.push('首步 ' + m.moveFirstRange + ' 格');
    if (m.jump) bits.push('可越子');
    if (m.captureDirs === 'none') bits.push('不吃子');
    else if (m.captureDirs !== 'same') bits.push('吃子：' + (DIR_TXT[m.captureDirs] || m.captureDirs));
    if (t.zone === 'ownHalf') bits.push('限本方半场');
    return bits.join(' · ');
  }

  function armyOf(id) {
    return CE.model.armyById(S(), id);
  }
  function typeOf(id) {
    return CE.model.typeById(S(), id);
  }

  // ---------------------------------------------------------------- 顶部：模板菜单
  function renderTemplates() {
    const host = refs.templateMenu;
    host.innerHTML = P.TEMPLATES.map((t) => `
      <button class="menu__item" data-act="tpl" data-id="${t.id}">
        <b>${esc(t.name)}</b><small>${esc(t.desc)}</small>
      </button>`).join('');
    bind(host, (act, d, e) => {
      if (act === 'tpl') {
        e.target.closest('details').open = false;
        app().newFromTemplate(d.id);
      }
    });
  }

  // ---------------------------------------------------------------- 左侧：画笔
  function renderPalette() {
    const s = S(), ui = U();
    // 阵营标签
    const tabs = refs.armyTabs;
    tabs.innerHTML = s.armies.map((a) => `
      <button class="army-tab ${ui.brushArmy === a.id ? 'is-on' : ''}" data-act="army" data-id="${a.id}"
              style="--army-color:${esc(a.color)}">
        <i></i>${esc(a.name)}
      </button>`).join('');
    bind(tabs, (act, d) => { if (act === 'army') app().setBrushArmy(d.id); });

    const armyId = ui.brushArmy || (s.armies[0] && s.armies[0].id);
    const types = s.pieceTypes.filter((t) => t.army === armyId);
    refs.palette.innerHTML = types.length ? types.map((t) => `
      <button class="pal-item ${isBrush('piece', t.id) ? 'is-on' : ''}" data-act="brush-type" data-id="${t.id}" title="${esc(describeMove(t))}">
        <span class="pal-item__icon shape-${t.shape}" style="--piece-color:${esc((armyOf(t.army) || {}).color || '#333')}">
          ${t.shape === 'stone' ? '' : esc(t.glyph || t.name[0])}
        </span>
        <span class="pal-item__meta">
          <b>${esc(t.name)}</b>
          <small>${esc(describeMove(t))}</small>
        </span>
      </button>`).join('')
      : '<p class="empty">这个阵营还没有棋子，点右下角「新建棋子」开始设计。</p>';
    bind(refs.palette, (act, d) => {
      if (act === 'brush-type') app().setBrush({ kind: 'piece', typeId: d.id });
    });

    // 工具：橡皮 / 障碍 / 目标
    refs.tools.innerHTML = `
      <button class="tool ${isBrush('erase') ? 'is-on' : ''}" data-act="brush-erase">橡皮擦</button>
      <button class="tool ${isBrush('terrain', null, 'block') ? 'is-on' : ''}" data-act="brush-terrain" data-terrain="block">障碍格</button>
      <button class="tool ${isBrush('terrain', null, 'goal') ? 'is-on' : ''}" data-act="brush-terrain" data-terrain="goal">目标格</button>
      <button class="tool ${isBrush('terrain', null, 'plain') ? 'is-on' : ''}" data-act="brush-terrain" data-terrain="plain">清除地形</button>`;
    bind(refs.tools, (act, d) => {
      if (act === 'brush-erase') app().setBrush({ kind: 'erase' });
      if (act === 'brush-terrain') app().setBrush({ kind: 'terrain', terrain: d.terrain });
    });

    refs.brushHint.textContent = brushLabel();
  }

  function isBrush(kind, id, terrain) {
    const b = U().brush;
    if (!b || b.kind !== kind) return false;
    if (kind === 'piece') return b.typeId === id;
    if (kind === 'terrain') return b.terrain === terrain;
    return true;
  }
  function brushLabel() {
    const b = U().brush;
    if (!b) return '未选择';
    if (b.kind === 'erase') return '橡皮擦';
    if (b.kind === 'terrain') return { block: '障碍格', goal: '目标格', plain: '清除地形' }[b.terrain] || '地形';
    const t = typeOf(b.typeId);
    return t ? t.name : '棋子';
  }

  // ---------------------------------------------------------------- 左侧：棋子属性
  function renderPieceForm() {
    const s = S(), ui = U();
    const host = refs.pieceForm;
    const t = ui.selectedTypeId ? typeOf(ui.selectedTypeId) : null;
    if (!t) {
      host.innerHTML = '<p class="empty">点击棋子库中的棋子进行编辑，或新建一个棋子类型。</p>';
      return;
    }
    const m = t.move;
    const dirOpts = (val) => P.DIR_OPTIONS.map((o) => `<option value="${o.v}" ${o.v === val ? 'selected' : ''}>${o.t}</option>`).join('');
    const armyOpts = (val) => s.armies.map((a) => `<option value="${a.id}" ${a.id === val ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    const shapeOpts = (val) => P.SHAPES.map((o) => `<option value="${o.v}" ${o.v === val ? 'selected' : ''}>${o.t}</option>`).join('');
    const presetOpts = P.MOVE_PRESETS.map((o) => `<option value="${o.id}">${o.t || o.name}</option>`).join('');
    const promoTypes = s.pieceTypes.filter((x) => x.id !== t.id);
    const isCustom = m.moveDirs === 'custom' || m.captureDirs === 'custom';

    host.innerHTML = `
      <div class="field-row">
        <label class="field"><span>名称</span><input data-f="name" value="${esc(t.name)}" maxlength="6"></label>
        <label class="field"><span>阵营</span><select data-f="army">${armyOpts(t.army)}</select></label>
      </div>
      <div class="field-row">
        <label class="field"><span>外观</span><select data-f="shape">${shapeOpts(t.shape)}</select></label>
        <label class="field"><span>字形</span><input data-f="glyph" value="${esc(t.glyph)}" maxlength="2" placeholder="♞ / 車"></label>
      </div>
      <label class="field"><span>走法模板</span><select data-f="preset"><option value="">选择一个模板…</option>${presetOpts}</select></label>
      <div class="field-row">
        <label class="field"><span>移动方向</span><select data-f="moveDirs">${dirOpts(m.moveDirs)}</select></label>
        <label class="field"><span>吃子方向</span><select data-f="captureDirs">
          <option value="same" ${m.captureDirs === 'same' ? 'selected' : ''}>与移动相同</option>
          <option value="none" ${m.captureDirs === 'none' ? 'selected' : ''}>不能吃子</option>
          ${P.DIR_OPTIONS.filter((o) => o.v !== 'none').map((o) => `<option value="${o.v}" ${o.v === m.captureDirs ? 'selected' : ''}>${o.t}</option>`).join('')}
        </select></label>
      </div>
      <div class="field-row field-row--3">
        <label class="field"><span>移动格数</span><input type="number" data-f="moveRange" min="0" max="12" value="${m.moveRange}"></label>
        <label class="field"><span>首步格数</span><input type="number" data-f="moveFirstRange" min="0" max="12" value="${m.moveFirstRange}"></label>
        <label class="field"><span>吃子格数</span><input type="number" data-f="captureRange" min="0" max="12" value="${m.captureRange}"></label>
      </div>
      <p class="hint hint--inline">格数填 0 表示不限距离（滑行）。首步格数用于「兵首次可走两格」。</p>
      <div class="field ${isCustom ? '' : 'is-hidden'}">
        <span>自定义方向（行,列 用空格分隔）</span>
        <input data-f="custom" value="${esc((m.custom || []).map((v) => v.join(',')).join(' '))}" placeholder="1,0 -1,0 0,1 0,-1">
        <div class="chips">
          <button class="chip" data-act="fill-dirs" data-v="0,-1 0,1 1,0 -1,0">四方</button>
          <button class="chip" data-act="fill-dirs" data-v="0,-1 0,1 1,0 -1,0 1,1 1,-1 -1,1 -1,-1">八方</button>
          <button class="chip" data-act="fill-dirs" data-v="-2,-1 -2,1 -1,-2 -1,2 1,-2 1,2 2,-1 2,1">马步</button>
          <button class="chip" data-act="fill-dirs" data-v="2,2 2,-2 -2,2 -2,-2">田字</button>
        </div>
      </div>
      <div class="checks">
        <label class="check"><input type="checkbox" data-f="jump" ${m.jump ? 'checked' : ''}><span>可越过棋子</span></label>
        <label class="check"><input type="checkbox" data-f="cannon" ${m.cannon ? 'checked' : ''}><span>炮式吃子</span></label>
        <label class="check"><input type="checkbox" data-f="isKing" ${t.isKing ? 'checked' : ''}><span>视为「王」</span></label>
        <label class="check"><input type="checkbox" data-f="zone" ${t.zone === 'ownHalf' ? 'checked' : ''}><span>限本方半场</span></label>
      </div>
      <div class="promo">
        <label class="check"><input type="checkbox" data-f="promoEnabled" ${t.promote.enabled ? 'checked' : ''}><span>抵达底线升变</span></label>
        <select data-f="promoTo" ${t.promote.enabled ? '' : 'disabled'}>
          <option value="">选择升变后的棋子…</option>
          ${promoTypes.map((x) => `<option value="${x.id}" ${t.promote.toTypeId === x.id ? 'selected' : ''}>${esc((armyOf(x.army) || {}).name + ' · ' + x.name)}</option>`).join('')}
        </select>
      </div>
      <label class="field"><span>备注</span><input data-f="desc" value="${esc(t.desc)}" maxlength="24" placeholder="例如：短腿的王者"></label>
      <div class="form-actions">
        <button class="btn btn--sm" data-act="dup-type">复制</button>
        <button class="btn btn--sm btn--danger" data-act="del-type">删除类型</button>
      </div>`;

    bind(host, (act, d) => {
      const cur = () => typeOf(U().selectedTypeId);
      if (act === 'fill-dirs') {
        const t2 = cur();
        if (!t2) return;
        t2.move.custom = parseDirs(d.v);
        const box = host.querySelector('[data-f="custom"]');
        if (box) box.value = d.v;
        app().commit(() => {});
        return;
      }
      if (act === 'dup-type') app().duplicateType(U().selectedTypeId);
      if (act === 'del-type') app().deleteType(U().selectedTypeId);
    }, (f, value, input) => {
      const t2 = typeOf(U().selectedTypeId);
      if (!t2) return;
      const m2 = t2.move;
      switch (f) {
        case 'name': t2.name = value || '棋子'; break;
        case 'army': t2.army = value; U().brushArmy = value; break;
        case 'shape': t2.shape = value; break;
        case 'glyph': t2.glyph = value; break;
        case 'moveDirs': m2.moveDirs = value; break;
        case 'captureDirs': m2.captureDirs = value; break;
        case 'moveRange': m2.moveRange = CE.model.clampInt(value, 0, 12, 1); break;
        case 'moveFirstRange': m2.moveFirstRange = CE.model.clampInt(value, 0, 12, 0); break;
        case 'captureRange': m2.captureRange = CE.model.clampInt(value, 0, 12, 1); break;
        case 'custom': m2.custom = parseDirs(value); break;
        case 'jump': m2.jump = input.checked; break;
        case 'cannon': m2.cannon = input.checked; break;
        case 'isKing': t2.isKing = input.checked; break;
        case 'zone': t2.zone = input.checked ? 'ownHalf' : 'any'; break;
        case 'promoEnabled': t2.promote.enabled = input.checked; break;
        case 'promoTo': t2.promote.toTypeId = value || null; break;
        case 'desc': t2.desc = value; break;
        default: return;
      }
      const structural = input.type === 'checkbox' || input.tagName === 'SELECT';
      app().touch();
      if (structural) app().refreshPieceForm();       // 方向 / 外观等会改变选项结构
      else app().refreshPieceLight();                 // 文字类只刷新棋盘与棋子库
    });

    // 数值输入在失焦后重新渲染一次，把越界数值纠正回来
    host.querySelectorAll('input[type="number"], input[data-f="custom"]').forEach((node) => {
      node.addEventListener('change', () => app().refreshPieceForm());
    });

    // 走法模板
    host.querySelector('[data-f="preset"]').addEventListener('change', (e) => {
      const preset = P.MOVE_PRESETS.find((p) => p.id === e.target.value);
      if (!preset) return;
      app().commit(() => {
        const t3 = typeOf(U().selectedTypeId);
        if (!t3) return;
        const keepCustom = preset.move.moveDirs === 'custom' && t3.move.custom;
        t3.move = Object.assign(CE.model.defaultMove(), preset.move);
        if (preset.move.custom) t3.move.custom = preset.move.custom.map((v) => v.slice());  // 深拷贝，避免多个棋子共享数组
        if (keepCustom && preset.id === 'custom') t3.move.custom = keepCustom;
      });
      app().renderPanels();
    });
  }

  function parseDirs(text) {
    return String(text || '').split(/[\s;]+/).map((chunk) => {
      const m = chunk.split(',').map((n) => parseInt(n, 10));
      return m.length === 2 && m.every(Number.isFinite) ? m : null;
    }).filter(Boolean);
  }

  // ---------------------------------------------------------------- 右侧：棋盘设置
  function renderBoardForm() {
    const s = S(), b = s.board;
    const themeOpts = P.THEMES.map((t) => `<option value="${t.id}" ${t.id === b.theme ? 'selected' : ''}>${t.name}</option>`).join('');
    refs.boardForm.innerHTML = `
      <div class="field-row">
        <label class="field"><span>行数</span><input type="number" data-b="rows" min="2" max="24" value="${b.rows}"></label>
        <label class="field"><span>列数</span><input type="number" data-b="cols" min="2" max="24" value="${b.cols}"></label>
      </div>
      <div class="presets-row">
        ${[[8, 8, '8×8'], [9, 10, '9×10'], [6, 6, '6×6'], [7, 7, '7×7'], [15, 15, '15×15'], [19, 19, '19×19']]
        .map(([r, c, t]) => `<button class="chip" data-act="size" data-r="${r}" data-c="${c}">${t}</button>`).join('')}
      </div>
      <div class="field-row">
        <label class="field"><span>棋盘风格</span><select data-b="theme">${themeOpts}</select></label>
        <label class="field"><span>格子样式</span><select data-b="grid">
          <option value="fill" ${b.grid === 'fill' ? 'selected' : ''}>实心格</option>
          <option value="line" ${b.grid === 'line' ? 'selected' : ''}>线框格</option>
        </select></label>
      </div>
      <div class="checks">
        <label class="check"><input type="checkbox" data-b="coords" ${b.coords ? 'checked' : ''}><span>显示坐标</span></label>
        <label class="check"><input type="checkbox" data-b="frame" ${b.frame ? 'checked' : ''}><span>棋盘外框</span></label>
      </div>
      <div class="form-actions">
        <button class="btn btn--sm" data-act="flip">翻转棋盘</button>
        <button class="btn btn--sm" data-act="mirror-h">水平镜像</button>
        <button class="btn btn--sm" data-act="mirror-v">垂直镜像</button>
      </div>
      <div class="form-actions">
        <button class="btn btn--sm" data-act="clear-pieces">清空棋子</button>
        <button class="btn btn--sm" data-act="clear-terrain">清空地形</button>
        <button class="btn btn--sm btn--danger" data-act="clear-all">全部清空</button>
      </div>
      <div class="divider"></div>
      <h3 class="section-title">阵营</h3>
      <div id="army-editor"></div>`;
    renderArmyEditor();
    refs.boardForm.querySelectorAll('[data-b="rows"], [data-b="cols"]').forEach((node) => {
      node.addEventListener('change', () => app().refreshBoardForm());
    });

    bind(refs.boardForm, (act, d) => {
      const A = app();
      if (act === 'size') { A.resize(Number(d.r), Number(d.c)); }
      if (act === 'flip') A.commit((st) => { st.board.flipped = !st.board.flipped; });
      if (act === 'mirror-h') A.mirror('h');
      if (act === 'mirror-v') A.mirror('v');
      if (act === 'clear-pieces') A.clearPieces();
      if (act === 'clear-terrain') A.commit((st) => { st.cells = {}; });
      if (act === 'clear-all') A.clearAll();
      if (act === 'army-name' || act === 'army-color' || act === 'army-dir' || act === 'army-add' || act === 'army-del') {
        // 由 renderArmyEditor 内部处理
      }
    }, (f, value, input) => {
      const A = app();
      if (f === 'rows' || f === 'cols') { A.resizeBoardField(f, CE.model.clampInt(value, 2, 24, 8)); }
      if (f === 'theme') A.commit((st) => { st.board.theme = value; });
      if (f === 'grid') A.commit((st) => { st.board.grid = value; });
      if (f === 'coords') A.commit((st) => { st.board.coords = input.checked; });
      if (f === 'frame') A.commit((st) => { st.board.frame = input.checked; });
    });
  }

  function renderArmyEditor() {
    const s = S();
    const host = refs.boardForm.querySelector('#army-editor');
    if (!host) return;
    host.innerHTML = s.armies.map((a) => `
      <div class="army-row" data-id="${a.id}">
        <input class="army-row__color" type="color" value="${esc(a.color)}" data-a="color" data-id="${a.id}">
        <input class="army-row__name" value="${esc(a.name)}" data-a="name" data-id="${a.id}" maxlength="6">
        <select data-a="dir" data-id="${a.id}" title="棋子「向前」的朝向">
          <option value="-1" ${a.dir === -1 ? 'selected' : ''}>向上</option>
          <option value="1" ${a.dir === 1 ? 'selected' : ''}>向下</option>
        </select>
        <button class="icon-btn icon-btn--sm" data-a="del" data-id="${a.id}" title="删除阵营">×</button>
      </div>`).join('') + '<button class="btn btn--sm" data-a="add">添加阵营</button>';

    host.onclick = (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const A = app(), id = b.dataset.id;
      if (b.dataset.a === 'del') A.deleteArmy(id);
      if (b.dataset.a === 'add') A.addArmy();
    };
    host.oninput = (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const A = app(), id = b.dataset.id;
      if (b.dataset.a === 'name') A.commit((st) => { const a = st.armies.find((x) => x.id === id); if (a) a.name = b.value || '阵营'; });
      if (b.dataset.a === 'color') A.commit((st) => { const a = st.armies.find((x) => x.id === id); if (a) a.color = b.value; });
      if (b.dataset.a === 'dir') A.commit((st) => { const a = st.armies.find((x) => x.id === id); if (a) a.dir = Number(b.value); });
    };
  }

  // ---------------------------------------------------------------- 右侧：规则与胜负
  function renderRules() {
    const s = S();
    refs.winsForm.innerHTML = `
      <h3 class="section-title">胜负条件<span class="hint">满足任意一条即结束</span></h3>
      <div class="win-list">${s.wins.length ? s.wins.map(winRow).join('') : '<p class="empty">尚未设置胜负条件，可自由摆棋。</p>'}</div>
      <button class="btn btn--sm" data-act="add-win">添加胜负条件</button>
      <div class="divider"></div>
      <h3 class="section-title">对局规则</h3>
      <div class="checks">
        <label class="check"><input type="checkbox" data-r="forbidSelfCheck" ${s.rules.forbidSelfCheck ? 'checked' : ''}><span>禁止送将（不能走出被将军的棋）</span></label>
        <label class="check"><input type="checkbox" data-r="stalemateLoss" ${s.rules.stalemateLoss ? 'checked' : ''}><span>无子可动判负</span></label>
        <label class="check"><input type="checkbox" data-r="validateInEdit" ${s.rules.validateInEdit ? 'checked' : ''}><span>编辑模式下拖动也按走法校验</span></label>
      </div>
      <label class="field"><span>回合上限（半回合数，0 = 不限）</span><input type="number" data-r="drawPlyLimit" min="0" max="9999" value="${s.rules.drawPlyLimit}"></label>`;

    bind(refs.winsForm, (act, d) => {
      const A = app();
      if (act === 'add-win') A.addWin();
      if (act === 'del-win') A.deleteWin(d.id);
    }, (f, value, input) => {
      if (f === 'forbidSelfCheck') app().commit((st) => { st.rules.forbidSelfCheck = input.checked; });
      if (f === 'stalemateLoss') app().commit((st) => { st.rules.stalemateLoss = input.checked; });
      if (f === 'validateInEdit') app().commit((st) => { st.rules.validateInEdit = input.checked; });
      if (f === 'drawPlyLimit') app().commit((st) => { st.rules.drawPlyLimit = CE.model.clampInt(value, 0, 9999, 0); });
    });
    // 条件类型与参数：需要知道是哪一条，单独监听（节点每次渲染都是新的）
    refs.winsForm.querySelectorAll('[data-w]').forEach((node) => {
      node.addEventListener('change', () => {
        const id = node.closest('[data-win]').dataset.win;
        app().updateWin(id, node.dataset.w, node.value);
      });
    });
  }

  function winRow(w) {
    const s = S();
    const kind = P.WIN_KINDS.find((k) => k.id === w.kind) || P.WIN_KINDS[0];
    const armySel = `<select data-w="army">
        <option value="any" ${(!w.army || w.army === 'any') ? 'selected' : ''}>任意阵营</option>
        ${s.armies.map((a) => `<option value="${a.id}" ${w.army === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
      </select>`;
    const typeSel = `<select data-w="typeId">
        <option value="any" ${(!w.typeId || w.typeId === 'any') ? 'selected' : ''}>任意棋子</option>
        ${s.pieceTypes.map((t) => `<option value="${t.id}" ${w.typeId === t.id ? 'selected' : ''}>${esc((armyOf(t.army) || {}).name + ' · ' + t.name)}</option>`).join('')}
      </select>`;
    const extra = kind.id === 'eliminateArmy' ? armySel
      : kind.id === 'reachGoal' ? armySel + typeSel
        : '';
    return `<div class="win-row" data-win="${w.id}">
      <div class="win-row__head">
        <select data-w="kind">${P.WIN_KINDS.map((k) => `<option value="${k.id}" ${k.id === w.kind ? 'selected' : ''}>${k.name}</option>`).join('')}</select>
        <button class="icon-btn icon-btn--sm" data-act="del-win" data-id="${w.id}" title="删除">×</button>
      </div>
      <p class="hint">${esc(kind.desc)}</p>
      ${extra ? `<div class="win-row__params">${extra}</div>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------- 右侧：对局
  function renderPlayPanel() {
    const s = S(), ui = U();
    const host = refs.playPanel;
    if (ui.mode !== 'play') {
      host.innerHTML = `
        <p class="empty">对局模式会按规则校验走法、自动判定胜负并记录棋谱。</p>
        <button class="btn btn--primary btn--block" data-act="play-start">开始对局</button>
        <div class="divider"></div>
        <h3 class="section-title">编辑模式小贴士</h3>
        <ul class="tips">
          <li>从左侧棋子库选择棋子，点击棋盘空格即可落子。</li>
          <li>拖动棋子改位置；右键删除棋子或清除地形。</li>
          <li>点选棋子可预览它的走法范围。</li>
        </ul>`;
      bind(host, (act) => { if (act === 'play-start') app().toggleMode('play'); });
      return;
    }
    const turnId = CE.rules.currentArmyId(s);
    const turnArmy = armyOf(turnId) || {};
    const res = s.play.result;
    const plies = s.play.plies;
    host.innerHTML = `
      <div class="turn-card ${res ? 'is-over' : ''}" style="--army-color:${esc(turnArmy.color || '#888')}">
        <small>${res ? '对局结束' : '当前回合'}</small>
        <b>${res ? esc(resultText(res)) : esc(turnArmy.name || '—')}</b>
      </div>
      <div class="form-actions">
        <button class="btn btn--sm" data-act="ply-undo" ${plies.length ? '' : 'disabled'}>悔棋</button>
        <button class="btn btn--sm" data-act="play-restart">重开</button>
        <button class="btn btn--sm" data-act="play-exit">返回编辑</button>
      </div>
      <div class="divider"></div>
      <h3 class="section-title">棋谱<span class="hint">${plies.length} 步</span></h3>
      <ol class="ply-list" id="ply-list">
        ${plies.map((p, i) => {
      const a = armyOf(p.army) || {};
      return `<li class="ply ${p.army === turnId && !res ? 'is-last' : ''}">
            <span class="ply__no">${Math.floor(i / Math.max(1, s.play.order.length)) + 1}</span>
            <i class="ply__sym" style="--army-color:${esc(a.color || '#888')}">${esc(p.sym || '?')}</i>
            <span class="ply__txt">${esc(p.text || '')}${p.captured ? ' <em>吃</em>' : ''}</span>
          </li>`;
    }).join('') || '<li class="empty">还没有走子</li>'}
      </ol>`;
    bind(host, (act) => {
      if (act === 'ply-undo') app().undoPly();
      if (act === 'play-restart') app().restartPlay();
      if (act === 'play-exit') app().toggleMode('edit');
    });
    const list = host.querySelector('#ply-list');
    if (list) list.scrollTop = list.scrollHeight;
  }

  function resultText(res) {
    if (!res) return '';
    if (res.kind === 'draw') return '和棋 · ' + res.reason;
    const a = armyOf(res.army);
    return (a ? a.name : '某方') + ' 胜 · ' + res.reason;
  }

  // ---------------------------------------------------------------- 状态条
  function renderStatus() {
    const s = S(), ui = U();
    const host = refs.statusbar;
    const parts = [];
    if (ui.mode === 'play') {
      const turnId = CE.rules.currentArmyId(s);
      const a = armyOf(turnId) || {};
      parts.push(`<span class="status-chip" style="--army-color:${esc(a.color || '#888')}"><i></i>${esc(a.name || '—')} 行棋</span>`);
      if (CE.room.isActive() && CE.room.mode() === 'match') {
        const mine = CE.room.myArmyId();
        if (!mine) parts.push('<span class="status-chip status-chip--warn">观战中</span>');
        else if (CE.room.myTurn()) parts.push('<span class="status-chip status-chip--turn">轮到你</span>');
        else parts.push('<span class="status-hint">等待对方走子…</span>');
      }
      if (s.play.result) parts.push(`<span class="status-chip status-chip--over">${esc(resultText(s.play.result))}</span>`);
      else if (CE.rules.isInCheck(s, turnId)) parts.push('<span class="status-chip status-chip--warn">被将军</span>');
      else parts.push('<span class="status-hint">拖动棋子走子，绿色圆点是可落点</span>');
    } else {
      parts.push(`<span class="status-chip">画笔：${esc(brushLabel())}</span>`);
      const sel = ui.selectedPieceId ? s.pieces.find((p) => p.id === ui.selectedPieceId) : null;
      if (sel) {
        const t = typeOf(sel.t);
        parts.push(`<span class="status-hint">已选中 <b>${esc(t ? t.name : '')}</b> · 按 Delete 删除</span>`);
        parts.push(`<label class="check check--inline"><input type="checkbox" id="moved-flag" ${sel.moved ? 'checked' : ''}><span>已移动过</span></label>`);
        parts.push('<button class="btn btn--sm btn--danger" data-act="del-piece">删除该子</button>');
      } else {
        parts.push('<span class="status-hint">拖动棋子可移动位置 · 右键删除 · 点选棋子查看走法</span>');
      }
    }
    host.innerHTML = parts.join('');
    if (ui.mode === 'edit') {
      bind(host, (act) => { if (act === 'del-piece') app().deleteSelectedPiece(); });
      const flag = host.querySelector('#moved-flag');
      if (flag) flag.addEventListener('change', () => app().toggleMovedFlag(flag.checked));
    }
  }

  // ---------------------------------------------------------------- 通用
  /** 事件委托：用属性赋值，重建 DOM 后自动替换旧处理器，避免闭包过期。 */
  function bind(container, onClick, onInput) {
    container.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (b) onClick(b.dataset.act, b.dataset, e);
    };
    if (onInput) {
      container.oninput = (e) => {
        const input = e.target.closest('[data-f],[data-b],[data-r]');
        if (!input) return;
        const f = input.dataset.f || input.dataset.b || input.dataset.r;
        if (input.type === 'checkbox') onInput(f, input.checked, input);
        else onInput(f, input.value, input);
      };
    } else {
      container.oninput = null;
    }
  }

  function toast(msg, kind) {
    const node = el(`<div class="toast ${kind ? 'toast--' + kind : ''}">${esc(msg)}</div>`);
    refs.toastHost.appendChild(node);
    requestAnimationFrame(() => node.classList.add('is-in'));
    setTimeout(() => {
      node.classList.remove('is-in');
      setTimeout(() => node.remove(), 300);
    }, 2200);
  }

  function confirm(opt) {
    return new Promise((resolve) => {
      const o = opt || {};
      const node = el(`<div class="modal">
        <div class="modal__card">
          <h3>${esc(o.title || '确认')}</h3>
          <p>${esc(o.body || '')}</p>
          <div class="modal__actions">
            <button class="btn" data-x="no">${esc(o.cancel || '取消')}</button>
            <button class="btn ${o.danger ? 'btn--danger' : 'btn--primary'}" data-x="yes">${esc(o.ok || '确定')}</button>
          </div>
        </div>
      </div>`);
      refs.modalHost.appendChild(node);
      requestAnimationFrame(() => node.classList.add('is-in'));
      node.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b && e.target !== node) return;
        const yes = b && b.dataset.x === 'yes';
        node.classList.remove('is-in');
        setTimeout(() => node.remove(), 200);
        resolve(!!yes);
      });
    });
  }

  function textPrompt(opt) {
    return new Promise((resolve) => {
      const o = opt || {};
      const node = el(`<div class="modal">
        <div class="modal__card modal__card--wide">
          <h3>${esc(o.title || '')}</h3>
          <p>${esc(o.body || '')}</p>
          <textarea class="paste-box" spellcheck="false" placeholder="${esc(o.placeholder || '')}">${esc(o.value || '')}</textarea>
          <div class="modal__actions">
            <button class="btn" data-x="no">取消</button>
            <button class="btn btn--primary" data-x="yes">确定</button>
          </div>
        </div>
      </div>`);
      refs.modalHost.appendChild(node);
      requestAnimationFrame(() => node.classList.add('is-in'));
      const box = node.querySelector('textarea');
      box.focus();
      node.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b && e.target !== node) return;
        const yes = b && b.dataset.x === 'yes';
        const val = box.value;
        node.classList.remove('is-in');
        setTimeout(() => node.remove(), 200);
        resolve(yes ? val : null);
      });
    });
  }

  function help() {
    const node = el(`<div class="modal">
      <div class="modal__card modal__card--wide">
        <h3>怎么玩</h3>
        <div class="help-grid">
          <section>
            <h4>编辑模式</h4>
            <ul>
              <li>左侧棋子库选子 → 点棋盘空格落子；拖动可换位。</li>
              <li>拖动时有约束：不能落在已有棋子或障碍格上。</li>
              <li>右键：删除棋子；选橡皮擦后右键可清除地形。</li>
              <li>点选棋子可预览它的走法范围（虚点）。</li>
              <li>橡皮擦 / 障碍格 / 目标格 画笔支持按住拖动连续涂抹。</li>
            </ul>
          </section>
          <section>
            <h4>设计棋子</h4>
            <ul>
              <li>选一个走法模板，再微调方向、格数、吃子方式。</li>
              <li>「可越过棋子」= 马；不勾选则会被别住（蹩马腿、塞象眼）。</li>
              <li>「炮式吃子」= 直行不吃子，隔一个棋子吃子。</li>
              <li>「限本方半场」可做不能过河的棋子。</li>
            </ul>
          </section>
          <section>
            <h4>胜负判定</h4>
            <ul>
              <li>擒王：吃掉标记为「王」的棋子。</li>
              <li>全歼：某阵营棋子被全部消灭。</li>
              <li>抵达目标：走到「目标格」。</li>
              <li>无子可动判负 / 回合上限判和。</li>
            </ul>
          </section>
          <section>
            <h4>联机房间</h4>
            <ul>
              <li>右上角「房间」→ 创建房间，把邀请链接发给朋友即可。</li>
              <li><b>同一台电脑</b>：选「多个标签页」，另开标签页打开同一地址再输房间号。</li>
              <li><b>异地联机</b>：选「公共中继」，走公共 MQTT 服务器，双方只要能上网就行。</li>
              <li>房主是权威：保存棋局、校验走法、广播结果；房主退出后其他人可接管。</li>
              <li>协作编辑 = 大家一起改棋盘与规则；对战 = 各认一方，轮流走子。</li>
            </ul>
          </section>
          <section>
            <h4>快捷键</h4>
            <ul>
              <li><kbd>1</kbd>–<kbd>9</kbd> 切换棋子库中的棋子</li>
              <li><kbd>E</kbd> 橡皮擦 · <kbd>Esc</kbd> 取消选中</li>
              <li><kbd>Delete</kbd> 删除选中棋子</li>
              <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> 撤销 / 重做</li>
              <li><kbd>Ctrl</kbd>+<kbd>S</kbd> 导出棋局文件</li>
              <li>右上角 <b>编辑 / 对局</b> 按钮切换模式</li>
            </ul>
          </section>
        </div>
        <div class="modal__actions"><button class="btn btn--primary" data-x="yes">知道了</button></div>
      </div>
    </div>`);
    refs.modalHost.appendChild(node);
    requestAnimationFrame(() => node.classList.add('is-in'));
    const close = () => { node.classList.remove('is-in'); setTimeout(() => node.remove(), 200); };
    node.addEventListener('click', (e) => { if (e.target.closest('[data-x]') || e.target === node) close(); });
  }

  function setRightTab(name) {
    U().rightTab = name;
    refs.rightTabs.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === name));
    refs.rightPanes.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('is-on', p.dataset.pane === name));
  }

  function init(r) {
    refs = r;
    renderTemplates();
    refs.rightTabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) setRightTab(b.dataset.tab);
    });
  }

  CE.panels = {
    init, toast, confirm, textPrompt, help, setRightTab, describeMove,
    renderAll() {
      renderPalette();
      renderRules();
      renderPlayPanel();
      renderStatus();
    },
    renderPalette,
    renderRules,
    renderPlayPanel,
    renderStatus,
    renderPieceForm,
    renderBoardForm,
    renderArmyEditor
  };
})(window.CE = window.CE || {});
