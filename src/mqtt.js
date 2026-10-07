/* 棋局工坊 — 极简 MQTT 3.1.1 客户端（WebSocket 之上，零依赖）
 * 只实现房间同步需要的部分：CONNECT / SUBSCRIBE(QoS0) / PUBLISH(QoS0) / PINGREQ / 断线重连。
 * 公共 MQTT 代理（如 broker.emqx.io）本身就是别人部署好的服务器，因此使用者无需自建后端。
 */
(function (root) {
  'use strict';

  const T = { CONNECT: 1, CONNACK: 2, PUBLISH: 3, PUBACK: 4, SUBSCRIBE: 8, SUBACK: 9, PINGREQ: 12, PINGRESP: 13, DISCONNECT: 14 };
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function encodeLength(n) {
    const out = [];
    do {
      let b = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) b |= 0x80;
      out.push(b);
    } while (n > 0);
    return out;
  }

  function frame(typeByte, body) {
    const len = encodeLength(body.length);
    const out = new Uint8Array(1 + len.length + body.length);
    out[0] = typeByte;
    out.set(len, 1);
    out.set(body, 1 + len.length);
    return out;
  }

  function u16(n) { return [n >> 8 & 0xff, n & 0xff]; }

  function connectPacket(clientId, keepalive, user, pass) {
    const proto = enc.encode('MQTT');
    const id = enc.encode(clientId);
    let flags = 0x02;                                  // clean session
    if (user) flags |= 0x80;
    if (pass) flags |= 0x40;
    const body = [].concat(
      u16(proto.length), Array.from(proto),
      [0x04, flags], u16(keepalive),
      u16(id.length), Array.from(id)
    );
    if (user) { const u = enc.encode(user); body.push(...u16(u.length), ...u); }
    if (pass) { const p = enc.encode(pass); body.push(...u16(p.length), ...p); }
    return frame(T.CONNECT << 4, body);
  }

  function subscribePacket(packetId, topic) {
    const t = enc.encode(topic);
    const body = [].concat(u16(packetId), u16(t.length), Array.from(t), [0]);   // QoS 0
    return frame((T.SUBSCRIBE << 4) | 0x02, body);
  }

  function publishPacket(topic, text) {
    const t = enc.encode(topic);
    const p = enc.encode(text);
    const body = new Uint8Array(t.length + p.length + 2);
    body[0] = t.length >> 8 & 0xff;
    body[1] = t.length & 0xff;
    body.set(t, 2);
    body.set(p, 2 + t.length);
    return frame(T.PUBLISH << 4, body);
  }

  /** 从缓冲区里切出完整报文；返回 [{type, topic, payload}] 与剩余字节。 */
  function parseBuffer(buf) {
    const packets = [];
    let offset = 0;
    for (;;) {
      if (buf.length - offset < 2) break;
      const typeByte = buf[offset];
      let mult = 1, value = 0, i = offset + 1, ok = false;
      for (; i < buf.length && i <= offset + 4; i++) {
        const b = buf[i];
        value += (b & 0x7f) * mult;
        mult *= 128;
        if (!(b & 0x80)) { ok = true; i++; break; }
      }
      if (!ok) break;
      if (buf.length - i < value) break;
      const body = buf.subarray(i, i + value);
      packets.push(decodePacket(typeByte, body));
      offset = i + value;
    }
    return { packets, rest: buf.subarray(offset) };
  }

  function decodePacket(typeByte, body) {
    const type = typeByte >> 4;
    if (type === T.PUBLISH) {
      const tlen = (body[0] << 8) | body[1];
      const topic = dec.decode(body.subarray(2, 2 + tlen));
      const qos = (typeByte >> 1) & 0x03;
      let p = 2 + tlen;
      if (qos > 0) p += 2;
      return { type, topic, payload: dec.decode(body.subarray(p)) };
    }
    if (type === T.CONNACK) return { type, code: body[1] };
    return { type };
  }

  /**
   * 连接一个 MQTT 代理并订阅一个主题。
   * @param {string} url     例如 wss://broker.emqx.io:8084/mqtt
   * @param {object} opts    {clientId, topic, keepalive, onMessage, onStatus}
   */
  function connect(url, opts) {
    const o = opts || {};
    const topic = o.topic;
    const keepalive = o.keepalive || 30;
    const onStatus = o.onStatus || function () {};
    const onMessage = o.onMessage || function () {};
    let ws = null;
    let buf = new Uint8Array(0);
    let pingTimer = null;
    let retry = 0;
    let retryTimer = null;
    let closed = false;
    let packetId = 1;

    const WS = root.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!WS) { onStatus('error', '当前环境不支持 WebSocket'); return null; }

    function clearTimers() {
      clearInterval(pingTimer);
      clearTimeout(retryTimer);
      pingTimer = null;
      retryTimer = null;
    }

    function scheduleRetry(reason) {
      if (closed) return;
      retry += 1;
      const wait = Math.min(8000, 700 * Math.pow(1.6, retry));
      onStatus('reconnecting', reason + '，' + Math.round(wait / 1000) + ' 秒后重试');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(open, wait);
    }

    function open() {
      if (closed) return;
      try {
        ws = new WS(url, 'mqtt');
        ws.binaryType = 'arraybuffer';
      } catch (e) {
        scheduleRetry('无法连接中继');
        return;
      }
      ws.onopen = () => {
        send(connectPacket(o.clientId || ('cs_' + Math.random().toString(36).slice(2, 10)), keepalive, o.user, o.pass));
      };
      ws.onmessage = (ev) => {
        const chunk = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : enc.encode(String(ev.data));
        const merged = new Uint8Array(buf.length + chunk.length);
        merged.set(buf, 0);
        merged.set(chunk, buf.length);
        const { packets, rest } = parseBuffer(merged);
        buf = rest;
        for (const pk of packets) {
          if (pk.type === T.CONNACK) {
            if (pk.code === 0) {
              retry = 0;
              send(subscribePacket(packetId++, topic));
              onStatus('ready');
              clearInterval(pingTimer);
              pingTimer = setInterval(() => send(frame(T.PINGREQ << 4, [])), Math.max(5, keepalive * 0.6) * 1000);
            } else {
              closed = true;
              onStatus('error', '中继拒绝连接（代码 ' + pk.code + '）');
            }
          } else if (pk.type === T.PUBLISH) {
            onMessage(pk.payload, pk.topic);
          }
        }
      };
      ws.onclose = () => { clearInterval(pingTimer); scheduleRetry('连接已断开'); };
      ws.onerror = () => { onStatus('error', '网络错误'); };
    }

    function send(bytes) {
      if (ws && ws.readyState === 1) { ws.send(bytes); return true; }
      return false;
    }

    open();

    return {
      publish(text) { return send(publishPacket(topic, text)); },
      close() {
        closed = true;
        clearTimers();
        try { send(frame(T.DISCONNECT << 4, [])); ws && ws.close(); } catch (e) { /* ignore */ }
      },
      get ready() { return !!ws && ws.readyState === 1; }
    };
  }

  const api = { connect, _internals: { encodeLength, connectPacket, subscribePacket, publishPacket, parseBuffer, decodePacket, T } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CE = root.CE || {};
  root.CE.mqtt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
