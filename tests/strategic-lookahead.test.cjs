'use strict';
const assert=require('node:assert/strict'),c=require('../commander.cjs'),jev=require('../jev-commander.cjs');
function situation(own,enemy,context={},hq=100){return c.summarize({elapsed:240,credits:650,own:{units:{miner:2,...own},buildings:{base:1,power:1,refinery:1,garrison:1,warFactory:1},hqHealth:hq},opponent:{units:enemy,buildings:{base:1,refinery:1}},context:{oreRemaining:9000,pressure:0,...context}});}
const compare=(state,names)=>c.strategicLookahead(state,names.map(name=>({name,why:'test'})));
const crisis=situation({tank:2},{tank:8},{pressure:4},25),emergency=c.offeredOperations(crisis);assert(emergency.every(o=>['defend','anti-air','anti-armor'].includes(o.name)),'emergency shortlist remains defensive');
const risk=compare(crisis,['defend','rush']);assert.equal(risk[0].name,'defend','lookahead favors defending a threatened base over an unsupported rush');
const air=situation({tank:5},{tank:4,gunship:3}),airScore=compare(air,['anti-air','rush']);assert.equal(airScore[0].name,'anti-air','lookahead considers an unanswered air threat');
const balanced=situation({tank:5},{tank:4});const candidates=c.offeredOperations(balanced),before=JSON.stringify(balanced),first=c.strategicLookahead(balanced,candidates),second=c.strategicLookahead(balanced,candidates);
assert.deepEqual(first,second,'lookahead is deterministic');assert.equal(JSON.stringify(balanced),before,'lookahead does not mutate battle state');assert(first.length<=6);assert(first.every(o=>Number.isFinite(o.value)));
assert.match(c.promptFor(balanced,candidates),/Approximate two-step worst-case ranking/);const request=jev.decisionRequest(balanced,'test');assert.deepEqual(JSON.parse(request.body.state).lookahead,c.strategicLookahead(balanced,request.offered).map(x=>x.name));assert.match(jev.classificationRequest(balanced,request.offered).premise,/not a prediction/);
assert(c.strategicLookahead(balanced,[]).length===0);assert.deepEqual(c.strategicLookahead(balanced,Array.from({length:50},(_,i)=>({name:['balanced','rush','economy','defend','air','siege'][i%6]}))).length,6,'search width is bounded');
const targets=c.summarize({elapsed:240,credits:650,own:{units:{miner:2,tank:8},buildings:{base:1,power:1,refinery:1,garrison:1,warFactory:1}},opponent:{units:{tank:2,miner:3},buildings:{base:1,refinery:1,warFactory:1}},context:{oreRemaining:9000}});
const raids=compare(targets,['rush','raid-economy','raid-production']);assert.equal(new Set(raids.map(r=>r.value)).size,3,'different raid targets receive distinct bounded projections');
assert(raids.some(r=>r.risks.includes('miners exposed to raids')),'risks identify unprotected income');
assert.match(c.promptFor(targets),/Possible tradeoffs, not predictions:/,'Ollama receives tentative risks alongside the ranking');
assert(!c.promptFor(targets,c.offeredOperations(targets,{lookahead:false}),{lookahead:false}).includes('Possible tradeoffs'),'disabled lookahead sends no forecast information');
const jevRequest=jev.decisionRequest(targets,'test');assert.equal(JSON.parse(jevRequest.body.state).lookaheadTradeoffs,c.strategicTradeoffs(c.strategicLookahead(targets,jevRequest.offered)),'JEV receives the same tentative tradeoffs');
function recovery(refinery,ore){return c.summarize({elapsed:100,credits:150,own:{units:{tank:2},buildings:{base:1,power:1,...(refinery?{refinery:1}:{})}},opponent:{units:{},buildings:{base:1}},context:{oreRemaining:ore}});}
const economyValue=s=>compare(s,['economy','balanced']).find(x=>x.name==='economy').value;
assert(economyValue(recovery(true,5000))>economyValue(recovery(false,5000)),'forecast does not invent miner income without funds for a refinery');
assert.equal(economyValue(recovery(false,5000)),economyValue(recovery(true,0)),'forecast does not invent income after ore is exhausted');
const pending=c.summarize({elapsed:100,credits:150,own:{units:{miner:1,tank:2},buildings:{base:1,power:1,refinery:1},ready:{base:1,power:1}},opponent:{units:{},buildings:{base:1}},context:{oreRemaining:5000}});
const absent=c.summarize({elapsed:100,credits:150,own:{units:{miner:1,tank:2},buildings:{base:1,power:1},ready:{base:1,power:1}},opponent:{units:{},buildings:{base:1}},context:{oreRemaining:5000}});
assert(compare(pending,['balanced'])[0].value>compare(absent,['balanced'])[0].value,'an existing refinery can complete after switching to another operation');
console.log('PASS bounded two-step adversarial lookahead, emergency safety, air counter, deterministic state, and model formats.');
