'use strict';
const assert=require('node:assert/strict');
const {createCommander}=require('../openai-commander.cjs');
const battle={elapsed:300,credits:800,own:{units:{miner:2,tank:8},buildings:{base:1,power:2,refinery:1,garrison:1,warFactory:1}},opponent:{units:{miner:2,tank:2},buildings:{base:1,refinery:1,warFactory:1},hqHealth:100},context:{water:false,oreRemaining:10000,pressure:0}};
const signal=()=>new AbortController().signal;
(async()=>{
 let body;
 const make=(choice)=>createCommander({initialKey:'test-key',fetchImpl:async(url,opts)=>{body=JSON.parse(opts.body);return {ok:true,json:async()=>({answers:[{name:'strategy',type:'choice',choice}]})};}});
 const result=await make('raid-economy').plan(battle,signal());
 assert.equal(result.plan.directive,'raid-economy');assert.equal(result.plan.focus,'economy');assert.equal(result.plan.unit,'scout');
 const options=body.questions[0].choices;assert(options.some(c=>c.value==='raid-economy'&&c.description));assert(options.some(c=>c.value==='air'));assert(!options.some(c=>c.value==='naval'));
 const base=await make('anti-air').plan(battle,signal());assert.equal(base.plan.operation,'anti-air');assert.equal(base.plan.unit,'rocket');
 await assert.rejects(make('naval').plan(battle,signal()),/invalid strategy/);
 const noTargets={...battle,opponent:{units:{tank:2},buildings:{base:1},hqHealth:100}};
 await assert.rejects(make('raid-economy').plan(noTargets,signal()),/invalid strategy/);
 console.log('PASS OpenAI full operations, eligible rich directives, executable mapping and invalid-answer rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
