'use strict';
const assert=require('node:assert/strict');
const c=require('../commander.cjs'),b=require('../benchmarks/strategy-benchmark.cjs');
async function main(){
 const original=b.createState(b.scenarios[2],11),copy=JSON.stringify(original),summary=c.summarize(original);
 const plain=c.offeredOperations(summary,{lookahead:false}),normal=c.offeredOperations(summary),defaults=c.offeredOperations(summary,{lookahead:true});
 assert.deepEqual(normal,defaults,'default commander behavior stays enabled');
 assert(!c.promptFor(summary,plain,{lookahead:false}).includes('Approximate two-step worst-case ranking'),'disabled condition removes ranking');
 assert(c.promptFor(summary,normal).includes('Approximate two-step worst-case ranking'),'enabled condition preserves ranking');
 assert.equal(JSON.stringify(original),copy,'preparing a decision does not mutate the initial state');
 const first=await b.episode(b.scenarios[0],11,false,4,null),second=await b.episode(b.scenarios[0],11,false,4,null);
 assert.deepEqual(first,second,'headless rules and seeded scenario are reproducible');
 assert.equal(first.trace.length,4);assert(first.trace.every(r=>r.offered.includes(r.choice)&&r.plan.operation),'each recorded choice is legal');
 const results=await b.benchmark({seeds:1,steps:2});assert.equal(results.runs.length,b.scenarios.length*2);
 for(let i=0;i<results.runs.length;i+=2){assert.equal(results.runs[i].scenario,results.runs[i+1].scenario);assert.equal(results.runs[i].seed,results.runs[i+1].seed);assert.equal(results.runs[i].lookahead,false);assert.equal(results.runs[i+1].lookahead,true);assert.deepEqual(results.runs[i].trace[0].before,results.runs[i+1].trace[0].before);}
 assert(results.limitations.some(s=>s.includes('not actual Iron Field matches')));
 const report=b.reportFor(results,'trace.json');assert(report.includes('not actual Iron Field matches'));assert(report.includes('trace.json'));assert(report.includes('mining-recovery'));
 await assert.rejects(()=>b.benchmark({seeds:0}),/seeds and steps/);
 console.log('PASS paired seeds, reproducibility, legal decisions, lookahead isolation and proxy limitations.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
