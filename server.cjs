/* LAN room relay + static server. Requires Node.js 18+; no npm dependencies.
 * The host browser owns gameplay. This relay authenticates seats, gates the lobby,
 * forwards orders, and retains the latest snapshot for reconnecting browsers.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const ROOT = __dirname, PORT = Number(process.env.PORT || 8766), HOST = process.env.HOST || '0.0.0.0';
const rooms = new Map(), sessions = new Map(), creationLimits = new Map();
const version = 13;
const roles=['host','guest','guest2','guest3'], teams=['player','enemy','team3','team4'];
const seats=room=>roles.map(role=>room[role]).filter(Boolean);
const MAP = require('./map.js');
const definitions = require('./data.js');
const aiCommander = require('./commander.cjs');
const localCommander = require('./local-commander.cjs');
const openaiCommander = require('./openai-commander.cjs');
const unitKinds = Object.keys(definitions.units);
const buildingKinds = Object.keys(definitions.buildings).filter(kind => definitions.buildings[kind].cost > 0);
const token = () => crypto.randomBytes(24).toString('hex');
const fail = (status, message) => Object.assign(new Error(message), {status});
const reply = (res, status, value) => {res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
function send(seat, message) {
  const stream = seat?.stream;
  if (!stream || stream.destroyed || stream.writableEnded) return false;
  // A slow reader reconnects to a fresh snapshot instead of accumulating history.
  if (stream.writableLength > 1024 * 1024) {stream.destroy();return false;}
  return stream.write(`data: ${JSON.stringify(message)}\n\n`);
}
function status(room) {
  return {type:'room',code:room.code,phase:room.phase,epoch:room.epoch,mapId:room.mapId,
    hostVisible:room.hostVisible, players:seats(room).map(s=>({...publicSeat(s),role:s.role,team:s.team}))};
}
function publicSeat(seat) {return seat ? {name:seat.name,ready:seat.ready,online:Boolean(seat.stream)} : null;}
function broadcast(room) {const data=status(room);for(const seat of seats(room))send(seat,data);}
function closeRoom(room, reason) {
  for (const seat of seats(room)) if (seat) {
    send(seat,{type:'closed',message:reason});const stream=seat.stream;seat.stream=null;stream?.end();sessions.delete(seat.token);
  }
  rooms.delete(room.code);
}
function seatFor(room, role, name) {
  const seat={token:token(),room,role,team:teams[roles.indexOf(role)],name:String(name||'Commander').trim().slice(0,24)||'Commander',ready:role==='host',stream:null,seen:new Set(),window:Date.now(),lastAck:Date.now(),count:0};
  sessions.set(seat.token,seat);return seat;
}
function authenticate(req) {
  const seat=sessions.get((req.headers.authorization||'').replace(/^Bearer /,''));
  if (!seat || !rooms.has(seat.room.code)) throw fail(401,'Session expired. Create or join a room again.');
  seat.room.touched=Date.now();seat.lastAck=Date.now();return seat;
}
function live(room) {return seats(room).length>=2 && seats(room).every(s=>s.stream) && room.hostVisible;}
function validateAction(action) {
  if (!action || !['order','rally','stop','harvest','queue','cancelQueue','build','pause','repairStructure','sellStructure','superweapon'].includes(action.type)) throw fail(400,'Unknown action.');
  if (['repairStructure','sellStructure','superweapon'].includes(action.type)&&(!Array.isArray(action.ids)||action.ids.length!==1||!Number.isSafeInteger(action.ids[0])||action.ids[0]<1))throw fail(400,'Select one structure.');
  if (action.type==='repairStructure'&&typeof action.enabled!=='boolean')throw fail(400,'Invalid repair setting.');
  if (['order','rally','stop','harvest'].includes(action.type) && (!Array.isArray(action.ids)||action.ids.length>24||!action.ids.every(id=>Number.isSafeInteger(id)&&id>0))) throw fail(400,'Invalid selection.');
  if (['order','rally','build','superweapon'].includes(action.type) && (!action.point||!Number.isFinite(action.point.x)||!Number.isFinite(action.point.z)||Math.abs(action.point.x)>MAP.halfWidth||Math.abs(action.point.z)>MAP.halfDepth)) throw fail(400,'Invalid map position.');
  if ((action.type==='queue'||action.type==='cancelQueue'&&action.kind!=null)&&!unitKinds.includes(action.kind)) throw fail(400,'Unknown unit.');
  if (action.type==='build'&&!buildingKinds.includes(action.kind)) throw fail(400,'Unknown structure.');
  if (action.targetId!==undefined&&action.targetId!==null&&(!Number.isSafeInteger(action.targetId)||action.targetId<1)) throw fail(400,'Invalid target.');
  if (action.producerId!=null&&(!Number.isSafeInteger(action.producerId)||action.producerId<1))throw fail(400,'Invalid producer.');
}
async function body(req) {
  const chunks=[];let length=0;
  for await (const chunk of req) {length+=chunk.length;if(length>768*1024)throw fail(413,'Message too large.');chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch {throw fail(400,'Invalid JSON.');}
}
function lanLinks(req) {
  const addresses=Object.values(os.networkInterfaces()).flat().filter(i=>i&&i.family==='IPv4'&&!i.internal).map(i=>`http://${i.address}:${PORT}/`);
  return [...new Set(addresses)].slice(0,8);
}
const allowed=new Set(['index.html','style.css','data.js','map.js','ui-art.js','weapon-fx.js','music.js','voice.js','fog.js','game.js','network.js','opponent.js','README.md','MULTIPLAYER.md','preview.png','vendor/three.min.js','vendor/THREE-LICENSE.txt']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png'};
allowed.add('local-ai.zip');allowed.add('ai-link.js');mime['.zip']='application/zip';
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  try {
    const url=new URL(req.url,'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET','HEAD'].includes(req.method)) throw fail(405,'Method not allowed.');
      const file=decodeURIComponent(url.pathname.slice(1)||'index.html');
      if(!allowed.has(file))throw fail(404,'File not found.');
      const location=path.join(ROOT,file), stat=await fs.promises.stat(location);
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});
      if(req.method==='HEAD')res.end();else fs.createReadStream(location).pipe(res);return;
    }
    // No cross-origin control API. Tokens are carried in headers, never invite URLs.
    if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)throw fail(403,'Open the game on this server to connect.');
    if(url.pathname==='/api/info'&&req.method==='GET'){reply(res,200,{version,links:lanLinks(req),port:PORT});return;}
    if(url.pathname==='/api/commander/status'&&req.method==='GET'){reply(res,200,await aiCommander.status());return;}
    if(url.pathname==='/api/commander/openai/status'&&req.method==='GET'){reply(res,200,openaiCommander.status());return;}
    if(url.pathname==='/api/events'&&req.method==='GET') {
      const seat=authenticate(req),room=seat.room;
      const previous=seat.stream;if(previous)send(seat,{type:'replaced',message:'This seat was opened in another tab.'});seat.stream=null;previous?.end();seat.stream=res;
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.flushHeaders();send(seat,{type:'welcome',role:seat.role});
      if(room.state)send(seat,{type:'state',epoch:room.epoch,seq:room.seq,state:room.state,restore:true});
      broadcast(room);
      res.on('close',()=>{if(seat.stream===res){seat.stream=null;if(rooms.has(room.code))broadcast(room);}});return;
    }
    if(req.method!=='POST')throw fail(405,'Use POST.');
    if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'Use application/json.');
    const data=await body(req);
    if(url.pathname.startsWith('/api/commander/local/')){await localCommander.handle(req,res,url.pathname.slice('/api/commander/local/'.length),data,reply);return;}
    if(['/api/commander/plan','/api/commander/openai/plan'].includes(url.pathname)) {
      const controller=new AbortController();
      const cancel=()=>controller.abort();res.on('close',cancel);
      try {const result=await (url.pathname==='/api/commander/openai/plan'?openaiCommander:aiCommander).plan(data,controller.signal);if(!res.destroyed)reply(res,200,result);}
      finally {res.off('close',cancel);}return;
    }
    if(['/api/create','/api/join'].includes(url.pathname)&&data.version!==version)throw fail(409,'Game updated. Refresh this page before hosting or joining.');
    if(url.pathname==='/api/create') {
      const ip=req.socket.remoteAddress, now=Date.now();let limit=creationLimits.get(ip)||{time:now,count:0};
      if(now-limit.time>60000)limit={time:now,count:0};limit.count++;creationLimits.set(ip,limit);
      if(limit.count>20||rooms.size>=24)throw fail(429,'Too many rooms. Leave an existing room or try later.');
      let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
      if(!MAP.catalog.some(m=>m.id===data.mapId))throw fail(400,'Choose a valid map.');
      const room={mapId:data.mapId,code,phase:'lobby',epoch:0,hostVisible:true,state:null,seq:0,touched:now};
      room.host=seatFor(room,'host',data.name);room.guest=null;rooms.set(code,room);
      reply(res,200,{token:room.host.token,role:'host',team:'player',code});return;
    }
    if(url.pathname==='/api/join') {
      const room=rooms.get(String(data.code||'').trim().toUpperCase());
      if(!room)throw fail(404,'Room not found. Check the code and server address.');
      if(room.phase!=='lobby'||seats(room).length>=4)throw fail(409,'This room is full or the match has started.');
      const role=roles.find(r=>!room[r]);room[role]=seatFor(room,role,data.name);room.touched=Date.now();broadcast(room);
      reply(res,200,{token:room[role].token,role,team:room[role].team,code:room.code});return;
    }
    const seat=authenticate(req),room=seat.room;
    switch(url.pathname) {
      case '/api/ping':break;
      case '/api/map':
        if(seat.role!=='host')throw fail(403,'Only the host chooses the map.');
        if(room.phase!=='lobby')throw fail(409,'Map selection is locked during a match.');
        if(!MAP.catalog.some(m=>m.id===data.mapId))throw fail(400,'Unknown map.');
        room.mapId=data.mapId;for(const s of seats(room))s.ready=s.role==='host';broadcast(room);break;
      case '/api/ready':
        if(room.phase!=='lobby')throw fail(409,'The match has already started.');
        seat.ready=Boolean(data.ready);broadcast(room);break;
      case '/api/start':
        if(seat.role!=='host')throw fail(403,'Only the host can start.');
        if(room.phase!=='lobby'||!live(room)||!seats(room).every(s=>s.ready))throw fail(409,'All connected players must be ready (2–4 players).');
        room.phase='playing';room.epoch++;room.state=null;room.seq=0;for(const s of seats(room))s.seen.clear();
        broadcast(room);for(const s of seats(room))send(s,{type:'start',epoch:room.epoch});break;
      case '/api/state':
        if(seat.role!=='host')throw fail(403,'Only the host publishes game state.');
        if(data.epoch!==room.epoch||!['playing','ended'].includes(room.phase))throw fail(409,'This snapshot belongs to another match.');
        if(!Number.isSafeInteger(data.seq)||data.seq<=room.seq)throw fail(409,'Stale snapshot.');
        if(!data.state||!Array.isArray(data.state.entities)||data.state.entities.length>400||!Array.isArray(data.state.fields))throw fail(400,'Invalid snapshot.');
        if(data.state.mapId!==room.mapId)throw fail(400,'Snapshot map does not match the room.');
        room.seq=data.seq;room.state=data.state;for(const s of seats(room))if(s!==room.host)send(s,{type:'state',epoch:room.epoch,state:data.state});
        if(data.state.winner&&room.phase==='playing'){room.phase='ended';broadcast(room);}break;
      case '/api/action': {
        if(room.phase!=='playing'||data.epoch!==room.epoch||!live(room))throw fail(409,'Match is waiting for all players.');
        validateAction(data.action);
        if(data.action.type==='pause'&&seat.role!=='host')throw fail(403,'Only the host controls pause.');
        if(typeof data.id!=='string'||data.id.length>80)throw fail(400,'Invalid command ID.');
        if(Date.now()-seat.window>1000){seat.window=Date.now();seat.count=0;}if(++seat.count>40)throw fail(429,'Too many commands.');
        if(seat.seen.has(data.id)){reply(res,200,{ok:true,duplicate:true});return;}
        seat.seen.add(data.id);if(seat.seen.size>256)seat.seen.delete(seat.seen.values().next().value);
        send(room.host,{type:'action',epoch:room.epoch,team:seat.team,action:data.action});break;
      }
      case '/api/feedback':
        if(seat.role!=='host')throw fail(403,'Only host feedback is accepted.');
        send(seats(room).find(s=>s.team===data.team),{type:'feedback',message:String(data.message||'').slice(0,240)});break;
      case '/api/visibility':
        if(seat.role==='host'){room.hostVisible=Boolean(data.visible);broadcast(room);}break;
      case '/api/rematch':
        if(seat.role!=='host'||room.phase!=='ended')throw fail(409,'The host can request a rematch after the match ends.');
        room.phase='lobby';room.state=null;room.host.ready=true;for(const s of seats(room))if(s!==room.host)s.ready=false;broadcast(room);break;
      case '/api/leave':
        if(seat.role!=='host'&&room.phase==='lobby') {
          const stream=seat.stream;seat.stream=null;sessions.delete(seat.token);room[seat.role]=null;stream?.end();broadcast(room);
        } else closeRoom(room,'A player left. The room has closed.');break;
      default:throw fail(404,'Unknown endpoint.');
    }
    reply(res,200,{ok:true});
  } catch(error){if(!res.headersSent)reply(res,error.status||500,{error:error.status?error.message:'Server error.',...(error.retryAfterMs?{retryAfterMs:error.retryAfterMs}:{})});else res.end();}
});
server.requestTimeout=15000;server.headersTimeout=10000;
setInterval(()=>{
  for(const room of rooms.values()) {
    if(Date.now()-room.touched>20*60*1000){closeRoom(room,'Room expired after inactivity.');continue;}
    for(const seat of seats(room))if(seat?.stream&&Date.now()-seat.lastAck>8000){const stream=seat.stream;seat.stream=null;stream.destroy();broadcast(room);}
    for(const seat of seats(room))send(seat,{type:'heartbeat',time:Date.now()});
  }
  for(const [ip,limit]of creationLimits)if(Date.now()-limit.time>120000)creationLimits.delete(ip);
},3000).unref();
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${PORT} is already in use. Stop the other server or set PORT to another number.`:error.message);process.exitCode=1;});
server.listen(PORT,HOST,()=>{
  console.log(`Iron Field multiplayer: http://localhost:${PORT}/`);
  for(const link of lanLinks())console.log(`Same-network players: ${link}`);
  console.log('Keep this terminal open. Stop with Ctrl+C. No firewall rules are changed.');
});
