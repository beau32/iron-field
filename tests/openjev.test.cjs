'use strict';
const assert=require('node:assert/strict');
const {createCommander,decisionRequest,classificationRequest,classificationChoice}=require('../jev-commander.cjs');
const battle={elapsed:300,credits:650,own:{units:{miner:2,tank:6},buildings:{base:1,power:2,refinery:1,garrison:1,warFactory:1}},opponent:{units:{tank:1},buildings:{base:1},hqHealth:25},context:{water:false,oreRemaining:10000,pressure:0}};
const response=(data,status=200)=>({ok:status===200,status,json:async()=>data});
(async()=>{
 const calls=[],agent=createCommander({port:8011,fetchImpl:async(url,opts)=>{
  calls.push({url,opts});
  if(url.endsWith('/api/tags')||url.endsWith('/v1/models'))return response({},404);
  if(url.endsWith('/health'))return response({status:'ready',adapter:'qwen25-05b-openjev',base_model:'Qwen/Qwen2.5-0.5B'});
  assert(url.endsWith('/classify'));const body=JSON.parse(opts.body);
  return response({choices:body.choices.map((text,i)=>({text,nli:{probabilities:i===0?{entailment:.9,contradiction:.05,neutral:.05}:{entailment:.1,contradiction:.1,neutral:.8}}}))});
 }});
 const status=await agent.status('nimble');assert(status.ready);assert.equal(status.model,'qwen25-05b-openjev');assert.equal(status.protocol,'openjev-nli');
 assert.equal((await agent.status('not-installed')).ready,false);
 const result=await agent.plan(battle,new AbortController().signal);assert.equal(result.plan.focus,'hq');assert.equal(result.model,'qwen25-05b-openjev');assert.equal(result.protocol,'openjev-nli');
 const sent=JSON.parse(calls.at(-1).opts.body);assert(sent.premise.includes('enemy HQ has 25%'));assert(sent.choices.length>=2);assert(!sent.model&&!sent.messages&&!sent.questions);
 assert.equal(calls.filter(c=>c.url.endsWith('/health')).length,1,'discovery cached');
 const models=['small-adapter','loaded-adapter'];
 let selected;
 const multi=createCommander({port:8011,fetchImpl:async(url,opts)=>{
  if(url.endsWith('/api/tags'))return response({},404);
  if(url.endsWith('/v1/models'))return response({data:models.map(id=>({id,owned_by:'openjev'}))});
  if(url.endsWith('/health'))return response({status:'ready',adapter:models[1],base_model:'Qwen'});
  assert(url.endsWith('/classify'));const body=JSON.parse(opts.body);selected=body.model;
  return response({choices:body.choices.map(text=>({text,nli:{probabilities:{entailment:.9,neutral:.1,contradiction:0}}}))});
 }});
 assert.equal((await multi.status()).model,models[1]);
 assert.deepEqual((await multi.status()).models.map(m=>m.name),models);
 assert.equal((await multi.plan({...battle,model:models[0]},new AbortController().signal)).model,models[0]);
 assert.equal(selected,models[0],'classifier receives explicitly selected adapter');
 const request=decisionRequest(battle,'x'),body=classificationRequest(request.summary,request.offered);
 const valid={choices:body.choices.map(text=>({text,nli:{probabilities:{entailment:.8,contradiction:.1,neutral:.1}}}))};
 assert.equal(classificationChoice(valid,body,request.offered),'rush','ties preserve ranked shortlist');
 for(const mutate of [r=>r.choices.pop(),r=>r.choices[0].text='another option',r=>r.choices[0].nli.probabilities.entailment=NaN,r=>r.choices[0].nli.probabilities.entailment=2,r=>r.choices[0].nli.probabilities.neutral=.5]){
  const invalid=structuredClone(valid);mutate(invalid);assert.throws(()=>classificationChoice(invalid,body,request.offered));
 }
 const notReady=createCommander({port:8011,fetchImpl:async(url)=>url.endsWith('/health')?response({status:'loading'}):response({},404)});const offline=await notReady.status();assert.equal(offline.ready,false);assert.match(offline.message,/not ready/);
 console.log('PASS OpenJEV health detection, actual adapter selection, premise/choices API, bounded score ranking, validation, cache and readiness errors.');
})().catch(e=>{console.error(e);process.exitCode=1;});
