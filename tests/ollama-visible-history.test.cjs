'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
(async()=>{
 const calls=[];const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'test-model',size:1}]}));return;}
  assert.equal(req.url,'/api/chat');const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));calls.push(body);res.end(JSON.stringify({message:{content:JSON.stringify(body.format.enum[0])}}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));process.env.OLLAMA_URL='http://127.0.0.1:'+server.address().port;
 try{
  const c=require('../commander.cjs');await c.warmup('test-model');
  const input={model:'test-model',elapsed:100,credits:400,own:{units:{tank:4,miner:2},buildings:{base:1,power:1,refinery:1,garrison:1,warFactory:1}},opponent:{units:{tank:3},buildings:{base:1}},contacts:[{kind:'tank',x:-10,z:20,health:60,distance:30}],profile:{games:2,forwardGames:1,navalGames:2,airGames:1,economyGames:2},context:{water:true,oreRemaining:1000}};
  const result=await c.plan(input,new AbortController().signal);assert(result.plan.operation);const body=calls.at(-1);assert(body.messages[0].content.includes('tank -10,20 60% 30'));assert(body.messages[0].content.includes('2+ ships 2/2'));assert(body.messages[0].content.includes('fielded multiple ships in 2/2'));assert.equal(body.options.num_ctx,1536);assert(body.format.enum.length>=2);assert.equal(result.decisionVersion,9);
  console.log('PASS Ollama request carries visible contacts and player history through chat API.');
 }finally{server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
