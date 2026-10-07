/* 棋局工坊 — 房间面板与联机会话
 * 把 CE.net 的房间协议接到界面上：创建/加入、成员列表、阵营认领、模式切换、邀请链接。
 */
(function (CE) {
  'use strict';

  const N = CE.net;
  const P = CE.presets;
  const $ = (id) => document.getElementById(id);

  let session = null;          // {room, kind, code, brokerUrl}
  let panelNode = null;
  let pendingRemote = null;    // 拖拽期间暂存的远端状态
  let lastRender = '';
  let lastMode = 'coedit';

  const prefs = {
    kind: (function () { try { return localStorage.getItem('cs.room.kind') || 'local'; } catch (e) { return 'local'; } })(),
    broker: (function () { try { return localStorage.getItem('cs.room.broker') || N.DEFAULT_BROKER; } catch (e) { return N.DEFAULT_BROKER; } })(),
    name: (function () {
      try { return localStorage.getItem('cs.room.name') || ''; } catch (e) { return ''; }
    })()
  };
  if (!prefs.name) prefs.name = '棋友' + Math.floor(Math.random() * 90 + 10);

  function savePrefs() {
    try {
      localStorage.setItem('cs.room.kind', prefs.kind);
      localStorage.setItem('cs.room.broker', prefs.broker);
      localStorage.setItem('cs.room.name', prefs.name);
    } catch (e) { /* ignore */ }
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const app = () => CE.app;
  const toast = (m, k) => CE.panels.toast(m, k);

  function meta() { return session ? session.room.meta() : null; }
  function isActive() { return !!session; }
  function isHost() { return !!session && session.room.role === 'host'; }
  function mode() { return session ? session.room.mode : null; }
  function selfMember() {
    const m = meta();
    if (!m) return null;
    return m.members.find((x) => x.id === m.selfId) || { id: m.selfId, name: prefs.name, armyId: null };
  }
  function myArmyId() { const m = selfMember(); return m ? m.armyId : null; }
  /** 对局模式下当前是否轮到我（用于界面提示与操作限制）。 */
  function myTurn() {
    if (!isActive() || mode() !== 'match') return true;
    const army = myArmyId();
    if (!army) return false;
    return CE.rules.currentArmyId(app().state) === army;
  }
  /** 观战者或非本方棋子：对局模式下不允许操作。 */
  function canControl(typeArmy) {
    if (!isActive() || mode() !== 'match') return true;
    if (isHost()) return true;                       // 房主可以代为操作，方便裁判
    const army = myArmyId();
    if (!army) return false;
    return typeArmy === army;
  }
  function lockedForMe() {
    return isActive() && mode() === 'match' && !isHost();
  }

  // ---------------------------------------------------------------- 会话
  function startSession(role, code, kind, brokerUrl) {
    if (session) leave(true);
    const selfId = N.makeId();
    const room = N.createRoom({
      code: code,
      selfId: selfId,
      name: prefs.name,
      armyId: null,
      role: role,
      mode: 'coedit',
      transportKind: kind,
      brokerUrl: brokerUrl,
      getState: () => app().state,
      getArmies: () => app().state.armies.map((a) => a.id),
      onState: (st, m) => {
        if (!st) return;
        if (CE.render.dragId) { pendingRemote = st; return; }     // 拖拽中先缓一缓
        app().applyRemoteState(st);
      },
      onRoom: () => {
        const m = session ? session.room.mode : null;
        if (m && m !== lastMode) { lastMode = m; applyMode(); }   // 房主切换玩法，其他人跟随
        renderPanel();
        renderBadge();
        applyLock();
      },
      onNotice: (text, kind2) => { toast(text, kind2 === 'info' ? '' : kind2); renderPanel(); },
      onStatus: (s, detail) => {
        renderPanel();
        renderBadge();
        if (s === 'error') toast(detail || '联机出错', 'warn');
        if (s === 'lost') toast('房主似乎已离线，你可以点「接管房主」继续', 'warn');
      },
      applyOp: (op, member) => app().remoteApplyOp(op, member)
    });
    session = { room, kind, code: String(code).toUpperCase(), brokerUrl };
    lastMode = room.mode;
    toast(role === 'host' ? '已创建房间 ' + session.code : '正在加入房间 ' + session.code);
    applyLock();
    renderBadge();
    return room;
  }

  function create(kindOpt) {
    const code = N.makeCode(5);
    startSession('host', code, kindOpt || prefs.kind, prefs.broker);
    return code;
  }

  function join(code, kindOpt) {
    const c = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(c)) { toast('房间号格式不对', 'warn'); return false; }
    startSession('guest', c, kindOpt || prefs.kind, prefs.broker);
    return true;
  }

  function leave(silent) {
    if (!session) return;
    try { session.room.leave(); } catch (e) { /* ignore */ }
    session = null;
    pendingRemote = null;
    app().refreshAll();
    applyLock();
    renderBadge();
    renderPanel();
    if (!silent) toast('已离开房间');
  }

  function setMode(next) {
    if (!session) return;
    if (!isHost()) { toast('只有房主可以切换模式', 'warn'); return; }
    session.room.setMode(next);
  }

  function applyMode() {
    const m = mode();
    if (!m) return;
    if (m === 'match') {
      toast('进入对战模式：按规则走子，轮流行动');
      app().forceMode('play');
    } else {
      app().forceMode('edit');
    }
    applyLock();
  }

  function applyLock() {
    const locked = lockedForMe();
    document.body.classList.toggle('room-locked', locked);
    const badge = $('room-locked-hint');
    if (badge) badge.hidden = !locked;
  }

  function copyInvite() {
    if (!session) return;
    const url = N.inviteUrl(session.code, session.kind, mode(), session.brokerUrl);
    const done = () => toast('邀请链接已复制，发给朋友即可加入');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, () => showLink(url));
    } else {
      showLink(url);
    }
  }
  function showLink(url) {
    CE.panels.textPrompt({ title: '邀请链接', body: '复制下面的链接发给朋友：', value: url });
  }

  // ---------------------------------------------------------------- 与 app 的联动
  /** 本地棋局发生变化时调用（来自 app.commit / app.touch）。 */
  function onLocalCommit(op, merge) {
    if (!session) return;
    if (session.room.status !== 'ready') return;      // 还没握手完成，别用本地棋局覆盖对方
    session.room.localChanged(op ? Object.assign({ merge: !!merge }, op) : (merge ? { merge: true } : null));
  }

  /** 房主校验并应用来自加入者的指令。 */
  function remoteApplyOp(op, member) {
    return app().remoteApplyOp(op, member);
  }

  function flushPending() {
    if (pendingRemote) {
      const st = pendingRemote;
      pendingRemote = null;
      app().applyRemoteState(st);
    }
  }

  // ---------------------------------------------------------------- 面板
  function openPanel() {
    if (panelNode) { renderPanel(); return; }
    panelNode = document.createElement('div');
    panelNode.className = 'modal';
    panelNode.innerHTML = `<div class="modal__card modal__card--wide">
      <div class="room-head">
        <h3>联机房间</h3>
        <button class="icon-btn icon-btn--sm" data-room="close" title="关闭">×</button>
      </div>
      <div id="room-body" class="room-body"></div>
    </div>`;
    const node = panelNode;
    $('modal-host').appendChild(node);
    requestAnimationFrame(() => node.classList.add('is-in'));
    panelNode.addEventListener('click', (e) => {
      if (e.target === panelNode) { closePanel(); return; }
      const b = e.target.closest('[data-room]');
      if (b) handleAction(b.dataset.room, b.dataset);
    });
    panelNode.addEventListener('input', (e) => {
      const f = e.target.dataset.roomField;
      if (!f) return;
      if (f === 'name') { prefs.name = e.target.value.slice(0, 8) || '棋友'; savePrefs(); if (session) session.room.setProfile({ name: prefs.name }); }
      if (f === 'broker') { prefs.broker = e.target.value; savePrefs(); }
      if (f === 'code') { /* 加入时读取 */ }
      if (f === 'army' && session) {
        const v = e.target.value;
        session.room.setProfile({ armyId: v === 'none' ? null : v });
        renderPanel();
      }
      if (f === 'kind') { prefs.kind = e.target.value; savePrefs(); renderPanel(); }
    });
    renderPanel();
  }

  function closePanel() {
    if (!panelNode) return;
    const node = panelNode;
    panelNode = null;
    node.classList.remove('is-in');
    setTimeout(() => node.remove(), 200);
  }

  function handleAction(action, d) {
    if (action === 'close') return closePanel();
    if (action === 'create') { create(d.kind || prefs.kind); return renderPanel(); }
    if (action === 'join') {
      const box = panelNode && panelNode.querySelector('[data-room-field="code"]');
      const code = box ? box.value : '';
      prefs.kind = d.kind || prefs.kind;
      savePrefs();
      if (join(code, prefs.kind)) renderPanel();
      return;
    }
    if (action === 'leave') { leave(); return renderPanel(); }
    if (action === 'copy') return copyInvite();
    if (action === 'mode') return setMode(d.mode);
    if (action === 'army') {
      if (!session) return;
      const armyId = d.army === 'none' ? null : d.army;
      session.room.setProfile({ armyId });
      renderPanel();
      return;
    }
    if (action === 'takeover') {
      if (!session) return;
      session.room.takeover();
      toast('你现在是房主');
      renderPanel();
      renderBadge();
      applyLock();
      return;
    }
    if (action === 'newcode') {
      prefs.kind = d.kind || prefs.kind;
      create(prefs.kind);
      renderPanel();
    }
  }

  function statusText(s) {
    const m = meta();
    if (!m) return '';
    if (m.status === 'ready') {
      if (m.role === 'guest' && m.hostId && m.hostId !== m.selfId) return '已连接房主';
      return m.role === 'host' ? '房间已开启' : '已连接';
    }
    if (m.status === 'connecting' || m.status === 'reconnecting') return '连接中…';
    if (m.status === 'lost') return '房主已离线';
    if (m.status === 'error') return '连接出错';
    return m.status;
  }

  function renderPanel() {
    if (!panelNode) return;
    const body = panelNode.querySelector('#room-body');
    if (!body) return;
    const html = session ? panelInRoom() : panelJoin();
    if (html === lastRender) { /* 内容相同就不重建，避免输入框失焦 */ } else { body.innerHTML = html; lastRender = html; }
  }

  function panelJoin() {
    const kinds = Object.keys(N.TRANSPORTS).map((k) => N.TRANSPORTS[k]);
    const kind = prefs.kind;
    return `
      <p class="room-lead">多人一起摆棋、一起设计规则，或者两人直接对战。<b>三种联机方式都不需要自己搭服务器。</b></p>
      <div class="room-grid">
        <label class="field"><span>联机方式</span>
          <select data-room-field="kind">
            ${kinds.map((k) => `<option value="${k.id}" ${k.id === kind ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>我的昵称</span>
          <input data-room-field="name" value="${esc(prefs.name)}" maxlength="8">
        </label>
      </div>
      <p class="hint hint--inline">${esc((N.TRANSPORTS[kind] || {}).hint || '')}</p>
      ${kind === 'mqtt' ? `
      <div class="field"><span>公共中继服务器</span>
        <select data-room-field="broker">
          ${N.PUBLIC_BROKERS.map((b) => `<option value="${b.url}" ${b.url === prefs.broker ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
        </select>
      </div>` : ''}
      ${kind === 'p2p' ? '<p class="hint hint--inline">点对点模式需要联网加载 WebRTC 组件，且双方网络需要允许直连；不稳定时请改用「公共中继」。</p>' : ''}
      <div class="room-actions">
        <button class="btn btn--primary" data-room="create" data-kind="${kind}">创建房间</button>
        <span class="room-or">或</span>
        <input class="room-code-input" data-room-field="code" placeholder="输入房间号" maxlength="12" autocomplete="off">
        <button class="btn" data-room="join" data-kind="${kind}">加入</button>
      </div>
      <div class="divider"></div>
      <ul class="tips">
        <li><b>同一台电脑</b>：选「同一台电脑的多个标签页」，再开一个标签页打开同一个地址，输入房间号即可（无需联网）。</li>
        <li><b>异地联机</b>：选「公共中继」，它会借用公共 MQTT 服务器转发消息，双方只要能上网就行。</li>
        <li>公共中继是公开信道，<b>知道房间号的人都能进来</b>，请不要在这里放敏感内容。</li>
        <li>房主是权威：它保存棋局、校验走法并广播结果；房主退出后其他人可以「接管房主」。</li>
      </ul>`;
  }

  function panelInRoom() {
    const m = meta();
    if (!m) return '';
    const me = selfMember();
    const armies = app().state.armies;
    const invite = N.inviteUrl(m.code, session.kind, m.mode, session.brokerUrl);
    const isMatch = m.mode === 'match';
    return `
      <div class="room-status">
        <div class="room-status__code">
          <small>房间号</small>
          <b>${esc(m.code)}</b>
        </div>
        <div class="room-status__info">
          <span class="dot ${m.status === 'ready' ? 'is-on' : 'is-warn'}"></span>
          ${esc(statusText(m))}
          <small>· ${esc((N.TRANSPORTS[session.kind] || {}).name || session.kind)} · ${m.members.length} 人</small>
        </div>
        <div class="room-status__acts">
          <button class="btn btn--sm" data-room="copy">复制邀请链接</button>
          ${m.role === 'guest' ? '<button class="btn btn--sm" data-room="takeover">接管房主</button>' : ''}
          <button class="btn btn--sm btn--danger" data-room="leave">离开</button>
        </div>
      </div>
      <p class="room-link">${esc(invite)}</p>

      <div class="room-modes">
        <span class="room-modes__label">玩法</span>
        <div class="seg">
          <button class="${!isMatch ? 'is-on' : ''}" data-room="mode" data-mode="coedit" ${isHost() ? '' : 'disabled'}>协作编辑</button>
          <button class="${isMatch ? 'is-on' : ''}" data-room="mode" data-mode="match" ${isHost() ? '' : 'disabled'}>对战</button>
        </div>
        <span class="hint">${isMatch ? '只能按规则走子，房主负责校验' : '所有人都能改棋盘、棋子和规则'}</span>
      </div>

      <div class="room-grid">
        <label class="field"><span>我的昵称</span>
          <input data-room-field="name" value="${esc(me ? me.name : prefs.name)}" maxlength="8">
        </label>
        <label class="field"><span>我操控的阵营</span>
          <select data-room-field="army">
            <option value="none" ${!me || !me.armyId ? 'selected' : ''}>观战</option>
            ${armies.map((a) => `<option value="${a.id}" ${me && me.armyId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="divider"></div>
      <h4 class="section-title">成员<span class="hint">房主退出后可点「接管房主」继续</span></h4>
      <ul class="member-list">
        ${m.members.map((x) => {
      const army = armies.find((a) => a.id === x.armyId);
      const isMe = x.id === m.selfId;
      const isH = x.id === m.hostId;
      return `<li class="${isMe ? 'is-me' : ''}">
            <span class="member-dot"></span>
            <b>${esc(x.name || '匿名')}</b>
            ${isH ? '<i class="tag tag--host">房主</i>' : ''}
            ${isMe ? '<i class="tag">我</i>' : ''}
            <span class="member-army" style="--army-color:${esc((army || {}).color || '#bbb')}">
              ${army ? '<i></i>' + esc(army.name) : '观战'}
            </span>
          </li>`;
    }).join('')}
      </ul>`;
  }

  function renderBadge() {
    const badge = $('room-badge');
    if (!badge) return;
    if (!session) { badge.hidden = true; return; }
    const m = meta();
    badge.hidden = false;
    badge.innerHTML = `<i class="dot ${m.status === 'ready' ? 'is-on' : 'is-warn'}"></i>
      <b>${esc(m.code)}</b><small>${m.members.length} 人${m.role === 'host' ? ' · 房主' : ''}</small>`;
    badge.classList.toggle('is-warn', m.status !== 'ready');
  }

  // ---------------------------------------------------------------- 启动
  let inited = false;
  function init() {
    if (inited) return;
    inited = true;
    const btn = $('btn-room');
    if (btn) btn.addEventListener('click', openPanel);
    const badge = $('room-badge');
    if (badge) badge.addEventListener('click', openPanel);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelNode) closePanel();
    });
    // 邀请链接： #room=XXXX&net=mqtt&mode=match
    const h = N.parseHash(location.hash);
    if (h.room) {
      if (h.net && N.TRANSPORTS[h.net]) prefs.kind = h.net;
      if (h.broker) prefs.broker = h.broker;
      savePrefs();
      openPanel();
      setTimeout(() => { join(h.room, prefs.kind); }, 260);
    }
    renderBadge();
  }

  CE.room = {
    init, openPanel, closePanel, create, join, leave, setMode, copyInvite,
    onLocalCommit, remoteApplyOp, flushPending, applyMode, applyLock,
    isActive, isHost, mode, myArmyId, myTurn, canControl, lockedForMe,
    get session() { return session; },
    prefs,
    _setPrefs(p) { Object.assign(prefs, p); savePrefs(); }
  };
})(window.CE = window.CE || {});
