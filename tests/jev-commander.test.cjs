'use strict';
const assert=require('node:assert/strict'),{createCommander,decisionRequest,validPort}=require('../jev-commander.cjs');
const battle={elapsed:300,credits:650,own:{units:{miner:2,tank:6},buildings:{base:1,power:2,refinery:1,garrison:1,warFactory:1}},opponent:{units:{tank:1},buildings:{base:1},hqHealth:25},context:{water:false,oreRemaining:10000,pressure:0}};
const abort=()=>new AbortController().signal;
(async()=>{
 for(const port of [0,-1,65536,'11435/path',1.5])assert.throws(()=>validPort(port));assert.equal(validPort('11435'),11435);
 let time=100,seen=[];
 const fetchImpl=async(url,opts)=>{seen.push({url,opts});if(url.endsWith('/api/tags'))return {ok:true,json:async()=>({models:[{name:'decision:test',capabilities:['decision']},{name:'chat:test',capabilities:['completion']}]})};time+=12;return {ok:true,json:async()=>({answers:{strategy:{type:'choice',choice:'rush',probabilities:{rush:.9,balanced:.1},confidence:.5}}})};};
 const agent=createCommander({port:11435,model:'decision:test',fetchImpl,now:()=>time});
 assert.deepEqual((await agent.status()).models.map(m=>m.name),['decision:test']);const answer=await agent.plan(battle,abort());assert.equal(answer.plan.focus,'hq');assert.equal(answer.latencyMs,12);assert.equal(answer.provider,'jev');
 const sent=seen.at(-1);assert.equal(sent.url,'http://127.0.0.1:11435/v1/systemone');const body=JSON.parse(sent.opts.body);assert.equal(body.questions.strategy.type,'choice');assert.deepEqual(Object.keys(body.questions.strategy.criteria),['rush','balanced']);assert.equal(JSON.parse(body.state).opponent.hqHealth,25);assert(!body.messages&&!body.format);
 assert(!decisionRequest(battle,'decision:test').body.questions.strategy.instructions.includes('Return JSON'));
 for(const invalid of [{type:'choice',choice:'naval'},{type:'choice',choice:'execute code'},null,{type:'score',score:9}]){
  const bad=createCommander({port:11435,model:'decision:test',fetchImpl:async(url,opts)=>url.endsWith('/api/tags')?fetchImpl(url,opts):{ok:true,json:async()=>({answers:{strategy:invalid}})}});await assert.rejects(bad.plan(battle,abort()),e=>e.status===503);
 }
 const unconfigured=createCommander({port:null,fetchImpl:async()=>{throw Error('Must not contact a service');}});assert.equal((await unconfigured.status()).available,false);
 const slow=createCommander({port:11435,model:'decision:test',timeoutMs:10,fetchImpl:async(url,opts)=>url.endsWith('/api/tags')?fetchImpl(url,opts):new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('timeout'))))});await assert.rejects(slow.plan(battle,abort()),e=>/deadline/.test(e.message));
 console.log('PASS JEV typed state/questions/criteria, separate loopback port, decision-model discovery, latency, strategy validation, missing configuration and timeout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
