'use strict';
const http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms)),root=path.resolve(__dirname,'..');
const seen=[],models=[{name:'nimble:latest',capabilities:['decision']},{name:'alternate:test',capabilities:['decision']}];
const battle={elapsed:300,credits:650,own:{units:{miner:2,tank:6},buildings:{base:1,power:2,refinery:1,garrison:1,warFactory:1}},opponent:{units:{tank:1},buildings:{base:1},hqHealth:25},context:{water:false,oreRemaining:10000,pressure:0}};
const mock=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/api/tags'){res.end(JSON.stringify({models}));return;}
 assert.equal(req.url,'/v1/systemone');const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));seen.push(body);
 res.end(JSON.stringify({answers:{strategy:{type:'choice',choice:'rush'}}}));
});
(async()=>{
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));const port=mock.address().port;
 const env={...process.env,HOST:'127.0.0.1',PORT:'8773',JEV_PORT:String(port),JEV_MODEL:'nimble'};
 const server=spawn(process.execPath,['server.cjs'],{cwd:root,env,windowsHide:true,stdio:'ignore'});let worker;
 const post=async(route,data={},token)=>{const r=await fetch('http://127.0.0.1:8773/api/commander/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {status:r.status,...await r.json()};};
 try{
  let online=false;for(let i=0;i<50;i++){try{online=(await fetch('http://127.0.0.1:8773/api/info')).ok;if(online)break;}catch{}await delay(100);}assert(online);
  const status=await fetch('http://127.0.0.1:8773/api/commander/jev/status').then(r=>r.json());assert(status.ready);assert.equal(status.port,port);assert.equal(status.model,'nimble:latest');
  const direct=await post('jev/plan',battle);assert.equal(direct.status,200);assert.equal(direct.plan.focus,'hq');assert.equal(direct.model,'nimble:latest');assert(Number.isFinite(direct.latencyMs));
  assert.equal((await post('local/session',{provider:'jev',port:0})).status,400);
  const session=await post('local/session',{provider:'jev',port});assert.equal(session.port,port);
  assert.equal((await post('local/connect',{code:session.code,provider:'ollama'})).status,400);
  worker=spawn(process.execPath,['local-ai.cjs','--server','http://127.0.0.1:8773','--code',session.code,'--provider','jev'],{cwd:root,env:{...env,JEV_PORT:'1'},windowsHide:true,stdio:'ignore'});
  let local;for(let i=0;i<40;i++){local=await post('local/status',{},session.clientToken);if(local.ready)break;await delay(100);}
  assert(local.connected&&local.ready);assert.equal(local.port,port);assert.equal(local.models.length,2);
  const result=await post('local/plan',{...battle,model:'alternate:test'},session.clientToken);assert.equal(result.status,200);assert.equal(result.provider,'jev');assert.equal(result.execution,'player');assert.equal(result.model,'alternate:test');assert.equal(result.plan.focus,'hq');assert(Number.isFinite(result.latencyMs));
  assert.equal(seen.at(-1).model,'alternate:test');assert.equal(JSON.parse(seen.at(-1).state).opponent.hqHealth,25);assert(seen.at(-1).questions.strategy.criteria.rush);assert(!seen.at(-1).messages);
  assert.equal((await post('local/plan',{...battle,model:'bad'},session.clientToken)).status,400);
  assert.equal((await post('local/status',{},'invalid')).status,401);
  await post('local/disconnect',{},session.clientToken);assert.equal((await post('local/plan',battle,session.clientToken)).status,401);
  console.log('PASS JEV server route, canonical model, port validation, provider isolation, real connector using paired port, model switching, typed request, latency relay and disconnect.');
 }finally{worker?.kill();server.kill();mock.closeAllConnections();mock.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
