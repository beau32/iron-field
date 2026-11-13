'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {instrument}=require('../benchmarks/full-engine-harness.cjs'),runner=require('../benchmarks/full-engine-benchmark.cjs'),commander=require('../commander.cjs');
async function main(){
 const source=fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8'),patched=instrument(source);
 assert(patched.includes('window.__ironBench='));assert(patched.includes('window.__ironBenchMetrics?.()'));assert(source.includes('requestAnimationFrame(frame);\n})();'));
 assert.throws(()=>instrument('not the game'),/missing benchmark hook/);
 assert.throws(()=>runner.options(['--seconds','0']),/Invalid/);assert.throws(()=>runner.options(['--maps','unknown']),/Invalid/);
 const server=runner.serve();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;
 try{
  browser=await runner.openBrowser();page=await runner.page(browser,`http://127.0.0.1:${server.address().port}/?benchmark=1`);
  const start=await page.cdp.eval(`window.__ironBench.start({map:'river',seed:17})`),plan=commander.planFor('rush',commander.summarize(start.summary));
  const player=start.snapshot.teams.player,enemy=start.snapshot.teams.enemy;
  assert.equal(enemy.credits,player.credits,'solo players begin with equal credits');
  assert.deepEqual(enemy.units,player.units,'solo players begin with matching units');
  assert.deepEqual(enemy.structures,player.structures,'solo players begin with matching structures');
  await page.cdp.eval(`window.__ironBench.apply(${JSON.stringify(plan)},'test')`);
  const first=await page.cdp.eval('window.__ironBench.step(30)'),second=await page.cdp.eval('window.__ironBench.step(30)');
  assert(Math.abs(first.elapsed-30)<.001&&Math.abs(second.elapsed-60)<.001,'real fixed-step clock advances');
  assert(first.snapshot.teams.enemy.entities.length>0,'actual game entities are recorded');
  assert(first.intensity.unitsProduced.player+first.intensity.unitsProduced.enemy>0,'production events are counted');
  assert.equal(first.intensity.unitsProduced.player+first.intensity.unitsProduced.enemy,first.events.filter(e=>e.type==='unit-created').length,'intensity agrees with actual production log');
  let shots=second.intensity.shots.player+second.intensity.shots.enemy,damage=second.intensity.damage.player+second.intensity.damage.enemy;
  for(let i=0;i<5&&!damage;i++){const next=await page.cdp.eval('window.__ironBench.step(30)');shots+=next.intensity.shots.player+next.intensity.shots.enemy;damage+=next.intensity.damage.player+next.intensity.damage.enemy;}
  assert(shots>0,'actual engine fire events contribute to intensity');
  assert(damage>0,'actual damage contributes to intensity');
  const again=await page.cdp.eval(`window.__ironBench.start({map:'river',seed:17})`);
  assert.deepEqual(again.snapshot.teams,start.snapshot.teams,'same seed reproduces starting game state');
  const trace=[{startSeconds:0,endSeconds:30,intensity:first.intensity},{startSeconds:30,endSeconds:60,intensity:second.intensity}],runs=[false,true].map(lookahead=>({lookahead,elapsed:60,winner:null,final:second.snapshot,trace}));
  const report=runner.report({model:'test',seeds:1,maps:['river'],seconds:60,window:30,limitations:[],runs,summary:{off:runner.aggregate(runs,false),on:runner.aggregate(runs,true)}},'trace.json');
  assert(report.includes('Intensity over time')&&report.includes('Units destroyed per minute')&&report.includes('trace.json'),'report exposes time-varying intensity and trace');
  console.log('PASS real browser engine stepping, scripted production, combat intensity and seeded starting state.');
 }finally{if(page)await runner.closePage(browser,page);await runner.closeBrowser(browser);server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
