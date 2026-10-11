import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
// A small self-hosted relay. The host browser remains the rules authority.
// Put this behind an HTTPS reverse proxy for wss:// access from hosted sites.
const server = new WebSocketServer({ port: Number(process.env.PORT || 8787), maxPayload: 500000 });
const rooms = new Map();
const send = (socket, data) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
server.on('connection', socket => {
  socket.id = randomUUID(); socket.alive = true; socket.room = null; socket.window = Date.now(); socket.count = 0;
  socket.on('pong', () => { socket.alive = true; });
  socket.on('message', raw => {
    if(Date.now()-socket.window>1000){socket.window=Date.now();socket.count=0;}if(++socket.count>40){socket.close(1008,'Rate limit');return;}
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'create' || data.type === 'join') {
        if(socket.room) return;
        const code=String(data.code||'').toUpperCase();
        if(!/^[A-Z0-9]{6,12}$/.test(code))throw new Error('无效房间码。');
        if(data.type==='create'){if(rooms.size>=500)throw new Error('服务器房间已满。');if(rooms.has(code))throw new Error('房间码已存在，请重试。');rooms.set(code,{owner:socket.id,clients:new Map()});}
        const room=rooms.get(code);if(!room)throw new Error('房间不存在或房主已离开。');if(room.clients.size>=8)throw new Error('房间已满（最多 8 人）。');
        room.clients.set(socket.id,socket);socket.room=code;
        send(socket,{type:'welcome',id:socket.id,code,owner:room.owner});
      } else if(data.type==='relay') {
        const room=rooms.get(socket.room);if(!room)return;
        if(socket.id!==room.owner&&data.to!==room.owner)return;
        const target=room.clients.get(data.to);if(target)send(target,{type:'relay',from:socket.id,payload:data.payload});
      }
    }catch(error){send(socket,{type:'error',message:error.message||'消息无效。'});}
  });
  socket.on('close',()=>{
    const room=rooms.get(socket.room);if(!room)return;
    room.clients.delete(socket.id);
    if(room.owner===socket.id){rooms.delete(socket.room);for(const client of room.clients.values()){send(client,{type:'closed'});client.close();}}
    else {const host=room.clients.get(room.owner);if(host)send(host,{type:'left',id:socket.id});}
  });
  socket.on('error',()=>socket.close());
});
const heartbeat=setInterval(()=>{for(const socket of server.clients){if(!socket.alive){socket.terminate();continue;}socket.alive=false;socket.ping();}},30000);
server.on('close',()=>clearInterval(heartbeat));
console.log(`棋局工坊 v2房间服务器 ws://localhost:${server.address().port}`);
