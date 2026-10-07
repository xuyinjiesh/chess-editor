/* 棋局工坊 — 房间与联机
 *
 * 设计原则：**房主权威（host-authoritative）**
 *   - 房主持有权威棋局；加入者把改动发给房主，房主应用后再广播新状态。
 *   - 协作编辑模式：加入者改完直接同步整盘状态（简单、万无一失）。
 *   - 对战模式：加入者只能发「走子指令」，房主用规则引擎校验后广播。
 * 传输层可替换，三种都不需要自己部署服务器：
 *   local = BroadcastChannel（同一台电脑的多个标签页，零网络）
 *   mqtt  = 公共 MQTT 代理（跨网络、多人，无需账号）
 *   p2p   = WebRTC（PeerJS 公共信令，浏览器之间直连，房主中转）
 */
(function (root) {
  'use strict';

  const PROTO = 'chess-studio/v1';
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PUBLIC_BROKERS = [
    { id: 'emqx', name: 'EMQX 公共代理（较稳定）', url: 'wss://broker.emqx.io:8084/mqtt' },
    { id: 'hivemq', name: 'HiveMQ 公共代理（备用）', url: 'wss://broker.hivemq.com:8884/mqtt' }
  ];
  const DEFAULT_BROKER = PUBLIC_BROKERS[0].url;

  function makeCode(len) {
    let s = '';
    const n = len || 5;
    for (let i = 0; i < n; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return s;
  }
  function makeId() {
    return 'u' + Math.random().toString(36).slice(2, 10);
  }
  function topicFor(code) {
    return PROTO + '/' + String(code || '').toUpperCase();
  }

  // ------------------------------------------------------------------
  // 传输层
  // ------------------------------------------------------------------
  /** 同一浏览器的多个标签页之间通信（无需任何网络）。 */
  function broadcastTransport(cfg) {
    if (typeof BroadcastChannel === 'undefined') {
      cfg.onStatus('error', '当前浏览器不支持 BroadcastChannel');
      return { kind: 'local', send() { return false; }, close() {}, ready: false };
    }
    const ch = new BroadcastChannel(PROTO + '/' + cfg.code);
    let open = true;
    ch.onmessage = (ev) => {
      const d = ev.data;
      if (!d || d.from === cfg.selfId || typeof d.text !== 'string') return;
      cfg.onText(d.text);
    };
    setTimeout(() => cfg.onStatus('ready'), 0);
    return {
      kind: 'local',
      send(text) { if (!open) return false; ch.postMessage({ from: cfg.selfId, text }); return true; },
      close() { open = false; try { ch.close(); } catch (e) { /* ignore */ } },
      get ready() { return open; }
    };
  }

  /** 公共 MQTT 代理（别人已经部署好的服务器，我们只是借用）。 */
  function mqttTransport(cfg) {
    const url = cfg.brokerUrl || DEFAULT_BROKER;
    const client = root.CE && root.CE.mqtt
      ? root.CE.mqtt.connect(url, {
        clientId: 'cs_' + cfg.selfId + '_' + Math.random().toString(36).slice(2, 6),
        topic: topicFor(cfg.code),
        keepalive: 30,
        onStatus: (s, d) => cfg.onStatus(s, d),
        onMessage: (text) => {
          let msg;
          try { msg = JSON.parse(text); } catch (e) { return; }
          if (!msg || msg.from === cfg.selfId) return;      // 代理会把自己的消息回传
          cfg.onText(text);
        }
      })
      : null;
    if (!client) cfg.onStatus('error', '缺少 MQTT 客户端');
    return {
      kind: 'mqtt',
      send(text) { return !!client && client.publish(text); },
      close() { client && client.close(); },
      get ready() { return !!client && client.ready; }
    };
  }

  /** WebRTC 点对点：房主用固定 peer id，其他人连它，房主负责中转。 */
  function peerTransport(cfg) {
    let peer = null;
    let conns = [];                 // 房主维护的连线
    let gateway = null;             // 加入者到房主的连线
    let closed = false;
    const peerId = 'cs-' + String(cfg.code).toLowerCase() + '-v1';

    const api = {
      kind: 'p2p',
      send(text) {
        if (cfg.role === 'host') {
          let n = 0;
          conns.forEach((c) => { if (c.open) { try { c.send(text); n += 1; } catch (e) { /* ignore */ } } });
          return n > 0;
        }
        if (gateway && gateway.open) { try { gateway.send(text); return true; } catch (e) { return false; } }
        return false;
      },
      close() {
        closed = true;
        conns.forEach((c) => { try { c.close(); } catch (e) { /* ignore */ } });
        try { peer && peer.destroy(); } catch (e) { /* ignore */ }
      },
      get ready() { return cfg.role === 'host' ? !!peer : !!(gateway && gateway.open); }
    };

    cfg.onStatus('connecting');
    loadPeerJS((ok) => {
      if (!ok) { cfg.onStatus('error', '无法加载 WebRTC 组件（需要联网）'); return; }
      if (closed) return;
      const Peer = root.Peer;
      try {
        peer = cfg.role === 'host' ? new Peer(peerId, { debug: 0 }) : new Peer({ debug: 0 });
      } catch (e) {
        cfg.onStatus('error', 'WebRTC 初始化失败');
        return;
      }
      peer.on('error', (err) => {
        const t = (err && err.type) || '';
        if (t === 'unavailable-id') cfg.onStatus('error', '房间号已被占用，请换一个或直接加入');
        else if (t === 'peer-unavailable') cfg.onStatus('error', '找不到这个房间，请确认房主在线');
        else cfg.onStatus('error', 'WebRTC：' + t);
      });
      peer.on('open', () => {
        if (cfg.role === 'host') { cfg.onStatus('ready'); return; }
        cfg.onStatus('connecting');            // 信令已通，但数据通道还没建立
        attach(peer.connect(peerId, { reliable: true }));
      });
      if (cfg.role === 'host') {
        peer.on('connection', (conn) => { attach(conn); });
      }
    });

    function attach(conn) {
      conn.on('open', () => {
        if (cfg.role === 'host') {
          conns.push(conn);
          cfg.onPeer && cfg.onPeer(conn.peer);
        } else {
          gateway = conn;
          cfg.onStatus('ready');
          cfg.onOpen && cfg.onOpen();
        }
      });
      conn.on('data', (text) => { if (typeof text === 'string') cfg.onText(text); });
      conn.on('close', () => {
        conns = conns.filter((c) => c !== conn);
        if (cfg.role !== 'host' && conn === gateway) {
          gateway = null;
          cfg.onStatus('lost', '与房主的连接已断开');
        }
      });
      if (cfg.role !== 'host') gateway = conn;
    }

    return api;
  }

  let peerLoading = null;
  function loadPeerJS(cb) {
    if (root.Peer) return cb(true);
    if (peerLoading) { peerLoading.push(cb); return; }
    peerLoading = [cb];
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = () => peerLoading.forEach((f) => f(!!root.Peer));
    s.onerror = () => peerLoading.forEach((f) => f(false));
    document.head.appendChild(s);
  }

  const TRANSPORTS = {
    local: { id: 'local', name: '同一台电脑的多个标签页', hint: '零网络，打开同一个链接即可', create: broadcastTransport },
    mqtt: { id: 'mqtt', name: '公共中继（推荐）', hint: '借用公共 MQTT 服务器跨网络联机，无需注册', create: mqttTransport },
    p2p: { id: 'p2p', name: 'WebRTC 点对点（实验性）', hint: '浏览器直连延迟最低，需要联网加载组件', create: peerTransport }
  };

  function createTransport(kind, cfg) {
    const t = TRANSPORTS[kind] || TRANSPORTS.mqtt;
    return t.create(cfg);
  }

  // ------------------------------------------------------------------
  // 房间协议
  // ------------------------------------------------------------------
  const M = {
    HELLO: 'hello', WELCOME: 'welcome', STATE: 'state', SYNC: 'sync', OP: 'op',
    PING: 'ping', BYE: 'bye', MODE: 'mode', MEMBERS: 'members', CLAIM: 'claim', TAKE: 'takeover'
  };
  const ALIVE_MS = 12000;         // 超过这个时间没心跳就不再显示
  const HOST_LOST_MS = 15000;     // 加入者判定房主掉线的时间

  /**
   * @param {object} cfg {
   *   code, selfId, name, armyId, role:'host'|'guest', mode:'coedit'|'match',
   *   transport, getState(), onState(state, meta), onRoom(meta), onNotice(text, kind),
   *   onStatus(status, detail), applyOp(op, member)
   * }
   */
  function createRoom(cfg) {
    const self = { id: cfg.selfId, name: cfg.name || '我', armyId: cfg.armyId || null };
    let role = cfg.role === 'host' ? 'host' : 'guest';
    let mode = cfg.mode === 'match' ? 'match' : 'coedit';
    let hostId = role === 'host' ? self.id : null;
    let members = [];
    let rev = 0;
    let status = 'connecting';
    let lastHostAt = Date.now();
    let closed = false;
    let syncTimer = null;
    let lastAnnounce = 0;

    let transport = cfg.transport || null;

    function emit(fn, ...args) { return typeof fn === 'function' ? fn(...args) : undefined; }

    function roomMeta() {
      return {
        code: cfg.code, selfId: self.id, role, hostId, mode, rev, status,
        members: liveMembers().sort((a, b) => (a.role === 'host' ? -1 : b.role === 'host' ? 1 : a.ts - b.ts))
      };
    }
    function pushRoom() { emit(cfg.onRoom, roomMeta()); }

    function liveMembers() {
      const now = Date.now();
      const out = members.filter((m) => now - m.ts < ALIVE_MS);
      if (!out.some((m) => m.id === self.id)) {
        out.push({ id: self.id, name: self.name, armyId: self.armyId, role, ts: now });
      }
      return out;
    }

    function upsert(m) {
      const now = Date.now();
      const found = members.find((x) => x.id === m.id);
      if (found) {
        Object.assign(found, m, { ts: now });
      } else {
        members.push(Object.assign({ ts: now }, m));
        if (m.id !== self.id) emit(cfg.onNotice, (m.name || '有人') + ' 加入了房间', 'info');
      }
      if (m.id === self.id) { self.name = m.name || self.name; self.armyId = m.armyId; }
      return !found;
    }

    /** 房主向某个新成员补发欢迎包（应对订阅时序造成的丢包）。 */
    function sendWelcome(to) {
      send(M.WELCOME, {
        hostId: self.id, members: liveMembers().map(strip), mode, rev, state: cfg.getState()
      }, to);
    }

    function send(type, extra, to) {
      if (closed) return;
      const msg = Object.assign({ t: type, from: self.id, code: cfg.code, ts: Date.now(), name: self.name, armyId: self.armyId }, extra || {});
      if (to) msg.to = to;
      transport.send(JSON.stringify(msg));
    }

    function broadcastState(extra) {
      rev += 1;
      send(M.STATE, Object.assign({ rev, state: cfg.getState() }, extra || {}));
      pushRoom();
    }

    function announceMembers() {
      const now = Date.now();
      if (now - lastAnnounce < 400) return;                 // 心跳频繁时合并广播
      lastAnnounce = now;
      send(M.MEMBERS, { members: liveMembers().map(strip), hostId, mode });
      pushRoom();
    }
    function strip(m) { return { id: m.id, name: m.name, armyId: m.armyId || null, role: m.role, ts: m.ts }; }

    /** 采纳房主给我分配的阵营（否则心跳会把 null 发回去，导致阵营反复被重分配）。 */
    function adoptSelfArmy() {
      const mine = members.find((m) => m.id === self.id);
      if (mine && mine.armyId) self.armyId = mine.armyId;
    }

    // ---------------- 接收 ----------------
    function onText(text) {
      let msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      if (!msg || msg.from === self.id) return;
      if (msg.to && msg.to !== self.id) return;
      if (msg.code && String(msg.code).toUpperCase() !== String(cfg.code).toUpperCase()) return;
      handle(msg);
    }

    function handle(msg) {
      const fromHost = msg.from === hostId;
      if (fromHost) lastHostAt = Date.now();

      switch (msg.t) {
        case M.HELLO:
          if (role !== 'host') return;
          upsert({ id: msg.from, name: msg.name, armyId: assignArmy(msg), role: 'guest' });
          sendWelcome(msg.from);
          announceMembers();
          break;

        case M.WELCOME:
          if (role === 'host' || !msg.hostId) return;
          hostId = msg.hostId;
          mode = msg.mode === 'match' ? 'match' : 'coedit';
          rev = msg.rev || 0;
          members = (msg.members || []).slice();
          adoptSelfArmy();
          status = 'ready';
          emit(cfg.onState, msg.state, { initial: true, by: msg.from });
          emit(cfg.onStatus, 'ready');
          pushRoom();
          break;

        case M.STATE:
          if (role === 'host' && msg.from !== self.id) {
            // 加入者回传的整盘状态（协作模式）
            emit(cfg.onState, msg.state, { by: msg.from });
            broadcastState({ by: msg.from });
            return;
          }
          if (!fromHost) return;
          if ((msg.rev || 0) < rev) return;                  // 旧状态，忽略
          rev = msg.rev || rev;
          emit(cfg.onState, msg.state, { by: msg.by });
          pushRoom();
          break;

        case M.SYNC:
          if (role !== 'host' || mode !== 'coedit') return;
          emit(cfg.onState, msg.state, { by: msg.from });
          broadcastState({ by: msg.from });
          break;

        case M.OP: {
          if (role !== 'host') return;
          const member = members.find((x) => x.id === msg.from) || { id: msg.from, name: msg.name };
          // 没有校验器时一律不落地、不广播，避免非法指令传播
          const applied = typeof cfg.applyOp === 'function' ? cfg.applyOp(msg.op, member) : false;
          if (applied) broadcastState({ by: msg.from });
          break;
        }

        case M.PING: {
          if (role !== 'host') return;
          const existing = members.find((m) => m.id === msg.from);
          const armyId = msg.armyId || (existing && existing.armyId) || assignArmy(msg);
          const isNew = upsert({ id: msg.from, name: msg.name, armyId, role: 'guest' });
          if (isNew) sendWelcome(msg.from);
          announceMembers();
          break;
        }

        case M.MEMBERS:
          if (!fromHost) return;
          members = (msg.members || []).slice();
          adoptSelfArmy();
          hostId = msg.hostId || hostId;
          mode = msg.mode === 'match' ? 'match' : mode;
          pushRoom();
          break;

        case M.MODE:
          if (!fromHost) return;
          mode = msg.mode === 'match' ? 'match' : 'coedit';
          emit(cfg.onNotice, mode === 'match' ? '房主切换为对战模式' : '房主切换为协作编辑模式', 'info');
          pushRoom();
          break;

        case M.CLAIM:
          if (role !== 'host') return;
          upsert({ id: msg.from, name: msg.name, armyId: msg.armyId, role: 'guest' });
          announceMembers();
          break;

        case M.BYE:
          members = members.filter((m) => m.id !== msg.from);
          emit(cfg.onNotice, (msg.name || '有人') + ' 离开了房间', 'info');
          pushRoom();
          if (role === 'host') announceMembers();
          break;

        case M.TAKE:
          if (role === 'host') { announceMembers(); return; }   // 房主还在，忽略接管
          hostId = msg.from;
          lastHostAt = Date.now();
          status = 'ready';
          emit(cfg.onNotice, '房间由 ' + (msg.name || '其他人') + ' 接管', 'info');
          pushRoom();
          break;
      }
    }

    /** 房主给新成员分配一个还没人认领的阵营。 */
    function assignArmy(msg) {
      if (msg.armyId) return msg.armyId;
      if (role !== 'host') return null;
      const taken = new Set(liveMembers().map((m) => m.armyId).filter(Boolean));
      const list = (cfg.getArmies && cfg.getArmies()) || [];
      const free = list.find((a) => !taken.has(a));
      return free || null;
    }

    // ---------------- 心跳 ----------------
    const pingTimer = setInterval(() => {
      if (closed) return;
      send(M.PING, {});
      if (role === 'host') {
        const before = members.length;
        members = members.filter((m) => Date.now() - m.ts < ALIVE_MS || m.id === self.id);
        if (members.length !== before) announceMembers();
      } else {
        pushRoom();
        if (status === 'ready' && Date.now() - lastHostAt > HOST_LOST_MS) {
          status = 'lost';
          emit(cfg.onStatus, 'lost', '房主似乎已离线');
          pushRoom();
        }
      }
    }, 3000);

    // 加入者连上后先打招呼
    function hello() { send(M.HELLO, {}); }
    if (role === 'guest') setTimeout(hello, 120);

    // ---------------- 对外接口 ----------------
    const api = {
      code: cfg.code,
      get selfId() { return self.id; },
      _receive: (text) => onText(text),           // 供传输层与测试注入消息
      get _transportKind() { return transport ? transport.kind : null; },
      get role() { return role; },
      get mode() { return mode; },
      get status() { return status; },
      get hostId() { return hostId; },
      meta: roomMeta,
      setStatus(s, d) { status = s; emit(cfg.onStatus, s, d); pushRoom(); },
      onTransportStatus(s, d) {
        if (s === 'ready') {
          status = 'ready';
          if (role === 'guest') { lastHostAt = Date.now(); hello(); }
        } else if (s === 'error') { status = 'error'; }
        else if (s === 'reconnecting') { status = 'reconnecting'; }
        emit(cfg.onStatus, s, d);
        pushRoom();
      },
      /** 本地棋局发生变化，需要同步出去。 */
      localChanged(op) {
        if (closed || !transport.ready) return;
        if (role === 'host') { broadcastState({ by: self.id }); return; }
        if (mode === 'match') {
          if (op) send(M.OP, { op });
          return;
        }
        // 协作模式：整盘状态同步（连续涂抹时合并发送）
        const merge = op && op.merge;
        if (merge) {
          clearTimeout(syncTimer);
          syncTimer = setTimeout(() => send(M.SYNC, { state: cfg.getState() }), 160);
        } else {
          clearTimeout(syncTimer);
          send(M.SYNC, { state: cfg.getState() });
        }
      },
      /** 房主：把当前状态广播出去（例如切换模板、导入）。 */
      forceBroadcast() { if (role === 'host') broadcastState({ by: self.id }); },
      setProfile(profile) {
        if (profile.name != null) self.name = profile.name;
        if (profile.armyId !== undefined) self.armyId = profile.armyId;
        if (role === 'host') {
          const me = members.find((m) => m.id === self.id);
          if (me) { me.name = self.name; me.armyId = self.armyId; }
          announceMembers();
        } else {
          send(M.PING, {});
        }
        pushRoom();
      },
      setMode(next) {
        mode = next === 'match' ? 'match' : 'coedit';
        if (role === 'host') {
          send(M.MODE, { mode });
          broadcastState({ by: self.id });
        }
        pushRoom();
      },
      requestUndo() {
        if (role === 'host') return false;
        send(M.OP, { op: { kind: 'undo' } });
        return true;
      },
      /** 房主掉线后，由某个加入者接管房间。 */
      takeover() {
        if (role === 'host') return;
        role = 'host';
        hostId = self.id;
        status = 'ready';
        rev += 1;
        send(M.TAKE, {});
        send(M.MEMBERS, { members: liveMembers().map(strip), hostId, mode });
        send(M.STATE, { rev, state: cfg.getState() });
        emit(cfg.onNotice, '你已成为房主', 'info');
        pushRoom();
      },
      leave() {
        if (closed) return;
        send(M.BYE, {});
        closed = true;
        clearInterval(pingTimer);
        clearTimeout(syncTimer);
        transport.close();
        status = 'closed';
      }
    };
    // 传输层最后创建：此时 api 已就绪，回调不会踩到暂时性死区
    if (!transport) {
      transport = createTransport(cfg.transportKind || 'mqtt', {
        code: cfg.code,
        selfId: cfg.selfId,
        role,
        brokerUrl: cfg.brokerUrl,
        onText: (text) => onText(text),
        onStatus: (s, d) => api.onTransportStatus(s, d),
        onOpen: () => { if (role === 'guest') hello(); }
      });
    }

    pushRoom();
    return api;
  }

  const api = {
    PROTO, PUBLIC_BROKERS, DEFAULT_BROKER, TRANSPORTS, M,
    makeCode, makeId, topicFor, createTransport, createRoom,
    inviteUrl(code, kind, mode, broker) {
      const base = location.origin + location.pathname;
      return base + '#room=' + code + '&net=' + kind
        + (mode === 'match' ? '&mode=match' : '')
        + (kind === 'mqtt' && broker ? '&broker=' + encodeURIComponent(broker) : '');
    },
    parseHash(hash) {
      const out = {};
      String(hash || '').replace(/^#/, '').split('&').forEach((kv) => {
        const i = kv.indexOf('=');
        if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
      });
      return out;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CE = root.CE || {};
  root.CE.net = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
