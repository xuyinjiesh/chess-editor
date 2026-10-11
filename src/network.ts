import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { validateProject, type GameState, type Move, type Project, type Side } from './model';
export type Snapshot = { project: Project; state: GameState; revision: number };
export type Player = { id: string; name: string; side: Side | 'spectator' };
export type RoomInfo = { code: string; host: boolean; players: Player[]; side: Side | 'spectator'; mode: 'p2p' | 'server' };
export type NetworkConfig = { mode: 'p2p' | 'server'; server: string; signal: string; iceServers: string; name: string };
type Callbacks = { snapshot: () => Snapshot; update: (s: Snapshot) => void; info: (r: RoomInfo | null) => void; error: (s: string) => void; move: (m: Move, side: Side, revision: number) => Promise<void> };
type Packet = { type: string; [key: string]: unknown };
export class Room {
  private peer?: Peer;
  private ws?: WebSocket;
  private connections = new Map<string, DataConnection>();
  private players: Player[] = [];
  private self = 'host';
  private owner = '';
  private code = '';
  private host = false;
  private closed = false;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private readyReject?: (error: Error) => void;
  constructor(private config: NetworkConfig, private callbacks: Callbacks) {}
  async open(joinCode?: string): Promise<void> {
    this.host = !joinCode;
    this.code = joinCode?.trim().toUpperCase() || Array.from(crypto.getRandomValues(new Uint8Array(8)), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 31]).join('');
    if (!/^[A-Z0-9]{6,12}$/.test(this.code)) throw new Error('房间码需要 6–12 位字母或数字。');
    return new Promise((resolve,reject)=>{
      this.readyReject=reject;
      this.readyTimer=setTimeout(()=>{this.readyReject=undefined;this.close();reject(new Error('连接超时，请检查网络、房间码或服务器设置。'));},15000);
      const ready=()=>{clearTimeout(this.readyTimer);this.readyReject=undefined;this.emitInfo();resolve();};
      const fail=(message:string)=>{clearTimeout(this.readyTimer);this.readyReject=undefined;this.close();reject(new Error(message));};
      if(this.config.mode==='server') {
        let url:URL;try{url=new URL(this.config.server);if(!['ws:','wss:'].includes(url.protocol))throw new Error();}catch{fail('请输入有效的 ws:// 或 wss:// 服务器地址。');return;}
        if(location.protocol==='https:'&&url.protocol==='ws:'){fail('HTTPS 站点需要使用 wss:// 服务器。');return;}
        this.ws=new WebSocket(url);
        this.ws.onopen=()=>this.ws?.send(JSON.stringify({type:this.host?'create':'join',code:this.code}));
        this.ws.onerror=()=>fail('无法连接房间服务器，请检查地址和服务状态。');
        this.ws.onmessage=event=>{try{
          const msg=JSON.parse(event.data);
          if(msg.type==='error'){fail(String(msg.message));return;}
          if(msg.type==='welcome') {this.self=msg.id;this.owner=msg.owner;this.code=msg.code;if(this.host){this.players=[{id:this.self,name:this.config.name||'房主',side:'white'}];ready();}else this.send(this.owner,{type:'hello',name:this.config.name||'棋友'});}
          if(msg.type==='relay')this.receive(msg.from,msg.payload,ready);
          if(msg.type==='left')this.leave(msg.id);
          if(msg.type==='closed'){this.callbacks.error('房主已离开，联机结束。');this.close();}
        }catch{this.callbacks.error('服务器返回了无法识别的数据。');}};
        this.ws.onclose=()=>{if(!this.closed){this.callbacks.error('与服务器的连接已断开。');this.close();}};
      } else {
        let options:PeerOptions={debug:0};
        try{
          if(this.config.signal){const url=new URL(this.config.signal);if(!['http:','https:'].includes(url.protocol))throw new Error();options={...options,host:url.hostname,port:Number(url.port)||(url.protocol==='https:'?443:80),path:url.pathname,secure:url.protocol==='https:'};}
          if(this.config.iceServers){const servers=JSON.parse(this.config.iceServers);if(!Array.isArray(servers))throw new Error();options.config={iceServers:servers};}
        }catch{fail('信令地址或 ICE / TURN JSON 配置无效。');return;}
        this.peer=this.host?new Peer(`qijing-${this.code}`,options):new Peer(options);
        this.peer.on('open',id=>{this.self=id;if(this.host){this.owner=id;this.players=[{id,name:this.config.name||'房主',side:'white'}];ready();}else{this.owner=`qijing-${this.code}`;this.bind(this.peer!.connect(this.owner,{reliable:true}),ready);}});
        this.peer.on('connection',connection=>{if(this.host)this.bind(connection,ready);else connection.close();});
        this.peer.on('error',error=>{if(this.readyReject)fail(`联机失败：${error.type}。可尝试自定义服务器。`);else this.callbacks.error(`连接异常：${error.type}`);});
        this.peer.on('disconnected',()=>{if(!this.closed){this.callbacks.error('信令服务已断开，请重新创建或加入房间。');this.close();}});
      }
    });
  }
  private bind(connection:DataConnection, ready:()=>void) {
    if(this.connections.size>=7){connection.close();return;}
    this.connections.set(connection.peer,connection);
    connection.on('open',()=>{if(!this.host)this.send(this.owner,{type:'hello',name:this.config.name||'棋友'});});
    connection.on('data',data=>{if(data&&typeof data==='object'&&JSON.stringify(data).length<500000)this.receive(connection.peer,data as Packet,ready);});
    connection.on('close',()=>this.leave(connection.peer));
    connection.on('error',()=>this.leave(connection.peer));
  }
  private send(id:string,packet:Packet){
    if(this.closed)return;
    if(this.config.mode==='server'){if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:'relay',to:id,payload:packet}));}
    else {const c=this.connections.get(id);if(c?.open)c.send(packet);}
  }
  private receive(id:string,packet:Packet,ready:()=>void){
    if(!packet||typeof packet.type!=='string')return;
    if(this.host){
      if(packet.type==='hello'){
        if(this.players.some(p=>p.id===id)||this.players.length>=8)return;
        const side=this.players.some(p=>p.side==='black')?'spectator':'black';
        this.players.push({id,name:String(packet.name||'棋友').slice(0,20),side});
        this.send(id,{type:'welcome',side});this.broadcast(this.callbacks.snapshot());this.roster();
      }
      if(packet.type==='move'){
        const player=this.players.find(p=>p.id===id);
        if(!player||player.side==='spectator')return;
        void this.callbacks.move(packet.move as Move,player.side,Number(packet.revision)).catch(error=>this.send(id,{type:'rejected',message:error.message}));
      }
    }else if(id===this.owner){
      if(packet.type==='welcome')ready();
      if(packet.type==='roster'&&Array.isArray(packet.players)){this.players=(packet.players as Player[]).slice(0,8);this.emitInfo();}
      if(packet.type==='snapshot'){
        try{
          const s=packet.snapshot as Snapshot;
          const project=validateProject(s.project);
          if(!s.state||!Array.isArray(s.state.history)||s.state.history.length>10000||!s.state.history.every(h=>h&&typeof h.text==='string'&&h.text.length<200&&['white','black'].includes(h.side))||!['white','black'].includes(s.state.turn)||![null,'white','black','draw'].includes(s.state.winner)||!Number.isInteger(s.revision))throw new Error();
          validateProject({...project,pieces:s.state.pieces});
          this.callbacks.update({...s,project});
        }catch{this.callbacks.error('收到无效棋局，已忽略。');}
      }
      if(packet.type==='rejected')this.callbacks.error(String(packet.message).slice(0,200));
    }
  }
  private roster(){for(const p of this.players)if(p.id!==this.self)this.send(p.id,{type:'roster',players:this.players});this.emitInfo();}
  private emitInfo(){this.callbacks.info({code:this.code,host:this.host,mode:this.config.mode,players:this.players,side:this.host?'white':this.players.find(p=>p.id===this.self)?.side||'spectator'});}
  private leave(id:string){this.connections.delete(id);if(!this.host&&id===this.owner){this.callbacks.error('房主已离开，联机结束。');this.close();return;}this.players=this.players.filter(p=>p.id!==id);if(this.host)this.roster();}
  broadcast(snapshot:Snapshot){if(!this.host)return;for(const p of this.players)if(p.id!==this.self)this.send(p.id,{type:'snapshot',snapshot});}
  requestMove(move:Move,revision:number){if(!this.host)this.send(this.owner,{type:'move',move,revision});}
  close(){if(this.closed)return;this.closed=true;clearTimeout(this.readyTimer);this.readyReject?.(new Error('房间连接已取消。'));this.readyReject=undefined;this.connections.forEach(c=>c.close());this.peer?.destroy();this.ws?.close();this.callbacks.info(null);}
}
