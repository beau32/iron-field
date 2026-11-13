'use strict';
const assert=require('node:assert/strict'),runner=require('../benchmarks/full-engine-benchmark.cjs'),commander=require('../commander.cjs');
async function main(){const server=runner.serve();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;
try{browser=await runner.openBrowser();page=await runner.page(browser,`http://127.0.0.1:${server.address().port}/?benchmark=1`);
 const start=await page.cdp.eval("window.__ironBench.start({map:'river',seed:1})"),plan=commander.planFor('balanced',commander.summarize(start.summary));
 await page.cdp.eval(`window.__ironBench.apply(${JSON.stringify(plan)},'test')`);let results=[],last;const spawned=new Map(),moved=new Set();
 for(let i=0;i<12;i++){last=await page.cdp.eval('window.__ironBench.step(30)');results.push(...last.events);for(const e of last.events)if(e.type==='unit-created'&&e.data.team==='enemy'&&['patrolBoat','frigate','battleship'].includes(e.data.kind))spawned.set(e.data.id,e.data.position);for(const e of last.snapshot.teams.enemy.entities){const p=spawned.get(e.id);if(p&&Math.hypot(e.position.x-p.x,e.position.z-p.z)>3)moved.add(e.id);}if(last.winner)break;}
 const created=results.filter(e=>e.type==='unit-created'&&e.data.team==='enemy').map(e=>e.data.kind),fleet=created.filter(k=>['patrolBoat','frigate','battleship'].includes(k));
 assert(created.filter(k=>k==='miner').length>=2,'the AI builds at least two additional miners during a real match');
 assert(fleet.length,'the AI produces ships in a real river match');
 assert(moved.size,'at least one ship leaves its spawn point');
 assert(created.some(k=>['rifleman','rocketTrooper'].includes(k)),'the AI produces infantry in a real match');
 assert(created.some(k=>['heavy','gunship','interceptor','bomber'].includes(k)),'the AI adds armor or aircraft in a real match');
 console.log('PASS real-engine combined arms; ships moved:',moved.size,'fleet:',fleet.join(','),'produced:',created.join(','));
}finally{if(page)await runner.closePage(browser,page);await runner.closeBrowser(browser);server.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
