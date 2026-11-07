'use strict';
const http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms)),root=path.resolve(__dirname,'..'),seen=[];
const mock=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'qwen2.5:0.5b',size:100},{name:'other:latest',size:200}]}));return;}
 if(req.url==='/api/chat'){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));seen.push(body);
  res.end(JSON.stringify({message:{content:JSON.stringify(body.format.enum[0])}}));return;
 }
 res.writeHead(404);res.end('{}');
});
(async()=>{
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const env={...process.env,HOST:'127.0.0.1',PORT:'8773',OLLAMA_URL:`http://127.0.0.1:${mock.address().port}`};delete env.OLLAMA_MODEL;
 const server=spawn(process.execPath,['server.cjs'],{cwd:root,env,windowsHide:true,stdio:'ignore'});let worker,output='';
 const post=async(route,data={},token)=>{const r=await fetch('http://127.0.0.1:8773/api/commander/local/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {status:r.status,...await r.json()};};
 try{
  let online=false;for(let i=0;i<50;i++){try{online=(await fetch('http://127.0.0.1:8773/api/info')).ok;if(online)break;}catch{}await delay(100);}assert(online);
  const session=await post('session',{provider:'ollama'});assert.equal(session.status,200);
  worker=spawn(process.execPath,['local-ai.cjs','--server','http://127.0.0.1:8773','--code',session.code],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  worker.stdout.on('data',data=>output+=data);worker.stderr.on('data',data=>output+=data);
  let state;for(let i=0;i<100;i++){state=await post('status',{},session.clientToken);if(state.ready)break;await delay(100);}assert(state.ready,output);
  assert.equal(state.model,'qwen2.5:0.5b');await post('status',{model:'other:latest'},session.clientToken);
  for(let i=0;i<100;i++){state=await post('status',{},session.clientToken);if(state.model==='other:latest'&&state.ready)break;await delay(100);}
  assert.equal(state.model,'other:latest');assert(state.ready,output);assert.equal(state.defaultModel,'qwen2.5:0.5b');assert.match(output,/Model selected in game: other:latest/);
  const battle={elapsed:300,credits:650,own:{units:{miner:2,tank:6},buildings:{base:1,power:2,refinery:1,garrison:1,warFactory:1}},opponent:{units:{tank:1},buildings:{base:1},hqHealth:25},context:{water:false,oreRemaining:10000,pressure:0},strategicMap:{terrain:['?????','?????','??=??','.....','.....'],friendly:['00000','00000','00000','00100','00000'],enemy:['00000','00000','00100','00000','00000'],sites:['C4:own-hq']},profile:{games:2,forwardGames:2,navalGames:0,airGames:2,economyGames:0,learning:{samples:2,early:2,air:2,naval:0,miner:0,outcomes:{rush:{positive:2,negative:0}}}}};
  const result=await post('plan',{...battle,model:'other:latest'},session.clientToken);
  assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.model,'other:latest');assert.equal(seen.at(-1).model,'other:latest');assert.match(output,/Local strategy completed with other:latest/);
  assert.match(seen.at(-1).messages[0].content,/rush: 2 favorable/,'observed outcomes reach the actual Ollama request through the relay');
  assert.match(seen.at(-1).messages[0].content,/3 \?\?=\?\? 00000 00100/,'sector map reaches the Ollama prompt through the relay');
  await post('status',{model:''},session.clientToken);
  for(let i=0;i<100;i++){state=await post('status',{},session.clientToken);if(state.model==='qwen2.5:0.5b')break;await delay(100);}
  assert.equal(state.model,'qwen2.5:0.5b');assert.match(output,/Game selected Automatic; using connector default: qwen2.5:0.5b/);
  console.log('PASS Ollama connector follows game model selection, reports actual decision model, and restores Automatic.');
 }finally{worker?.kill();server.kill();mock.closeAllConnections();mock.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
