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
console.log('PASS bounded two-step adversarial lookahead, emergency safety, air counter, deterministic state, and model formats.');
