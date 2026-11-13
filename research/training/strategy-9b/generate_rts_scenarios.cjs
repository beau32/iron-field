'use strict';
// Synthetic heuristic supervision. Not human demonstrations or proven-optimal play.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const out=__dirname,game=process.argv[2]||'C:/Users/bogmk/Documents/Codex/2026-10-05/i-x20/outputs/iron-field';
const c=require(path.join(game,'commander.cjs'));
const old=path.join(out,'..','qwen35-9b-rts');
const benchmark=JSON.parse(fs.readFileSync(path.join(old,'rts_benchmark_results.json'),'utf8'));
const benchmarkHashes=new Set(benchmark.cases.map(x=>x.promptSha256));
const suffix='\nPlain names use game tactics; @left or @right chooses a flanking approach relative to our force facing the target.';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function rng(seed){let x=seed>>>0;return (a,b)=>{x^=x<<13;x^=x>>>17;x^=x<<5;return a+(x>>>0)%(b-a+1);};}
const families=['lost-miners','lost-refinery','base-under-attack','uncovered-air','expected-air','armor-gap','fortifications','air-attack','weak-hq','economy-growth','naval-gap','losing-raid','no-ore-defense','mixed-force','queued-air-defense','raid-economy','raid-production','flank-left','flank-right'];
function build(f,r){
 const credits=r(350,1250),elapsed=r(55,850),own={units:{miner:r(2,3),tank:r(4,7)},buildings:{base:1,power:r(1,3),refinery:1,garrison:1,warFactory:1},hqHealth:r(68,100)},opponent={units:{tank:r(1,3)},buildings:{base:1},hqHealth:r(65,100)},context={water:Boolean(r(0,1)),pressure:0,oreRemaining:r(2500,30000)};
 let feedback,profile,strategicMap,target;
 switch(f){
  case 'lost-miners':own.units.miner=0;target='economy';break;
  case 'lost-refinery':own.units.miner=1;delete own.buildings.refinery;target='economy';break;
  case 'base-under-attack':own.units.tank=r(2,4);own.hqHealth=r(20,43);opponent.units.tank=r(4,8);context.pressure=r(3,6);target='defend';break;
  case 'uncovered-air':opponent.units.gunship=r(3,7);target='anti-air';break;
  case 'expected-air':profile={games:4,forwardGames:0,navalGames:0,airGames:r(3,4),economyGames:0};target='anti-air';break;
  case 'armor-gap':opponent.units={heavy:r(4,8)};target='anti-armor';break;
  case 'fortifications':opponent.units={tank:r(2,4)};opponent.buildings.turret=r(3,6);opponent.buildings.warFactory=1;target='siege';break;
  case 'air-attack':opponent.units={tank:r(3,5)};opponent.buildings.turret=r(2,4);target='air';break;
  case 'weak-hq':own.units.tank=r(7,10);opponent.units={tank:1};opponent.hqHealth=r(10,35);target='rush';break;
  case 'economy-growth':own.units.miner=2;own.units.tank=r(3,5);opponent.units={tank:r(3,5)};target='economy';break;
  case 'naval-gap':context.water=true;opponent.units.frigate=r(2,4);target='naval';break;
  case 'losing-raid':opponent.units={tank:r(3,6)};feedback={operation:'rush',mode:'Regrouping',stalled:true,age:r(60,120),lostValue:r(900,1600),destroyedValue:r(0,100),income:r(80,300)};target='defend';break;
  case 'no-ore-defense':own.units.miner=0;own.units.tank=r(2,3);opponent.units={heavy:r(7,9)};context.oreRemaining=0;target='defend';break;
  case 'mixed-force':own.units.miner=r(3,4);opponent.units={tank:r(1,3)};target='balanced';break;
  case 'queued-air-defense':own.units.miner=r(3,4);own.units.rocket=1;own.queued={rocketTrooper:3};opponent.units={tank:1,gunship:r(2,3)};target='balanced';break;
  case 'raid-economy':own.units.tank=r(6,9);opponent.units={tank:1,miner:r(2,4)};opponent.buildings.refinery=1;target='raid-economy';break;
  case 'raid-production':own.units.tank=r(6,9);opponent.units={tank:1};opponent.buildings.warFactory=1;target='raid-production';break;
  case 'flank-left':case 'flank-right':{
   own.units={miner:2,tank:r(6,9)};opponent.units={tank:2,miner:2};opponent.buildings.refinery=1;opponent.buildings.warFactory=1;context.water=false;
   const threatNorth=f==='flank-right',threat=r(1,2);
   strategicMap={terrain:['.....','.....','.....','.....','.....'],friendly:['00000','00000',`${own.units.tank}0000`,'00000','00000'],enemy:[threatNorth?`00${threat}00`:'00000','00000','00000','00000',threatNorth?'00000':`00${threat}00`],sites:['A3:own-hq','E3:seen-refinery']};
   target='raid-economy@'+(threatNorth?'right':'left');break;
  }
 }
 return {state:{elapsed,credits,own,opponent,context,...(feedback?{feedback}:{}),...(profile?{profile}:{}),...(strategicMap?{strategicMap}:{})},target};
}
function generate(seed,perFamily,used){const r=rng(seed),rows=[],counts={},attempts={};for(const family of families){let made=0,tries=0;while(made<perFamily&&tries<perFamily*250){tries++;const x=build(family,r);let s;try{s=c.summarize(x.state);}catch{continue;}const opts=c.modelOptions(s);if(!opts.some(o=>o.name===x.target))continue;const prompt=c.promptFor(s,opts)+suffix,digest=sha(prompt);if(used.has(digest)||benchmarkHashes.has(digest))continue;used.add(digest);rows.push({messages:[{role:'user',content:prompt},{role:'assistant',content:JSON.stringify(x.target)}],source:'synthetic-rule',family});counts[x.target]=(counts[x.target]||0)+1;made++;}attempts[family]=tries;if(made!==perFamily)throw Error(`Could only generate ${made}/${perFamily} ${family} after ${tries} attempts`);}return {rows,counts,attempts};}
function write(name,rows){fs.writeFileSync(path.join(out,name),rows.map(x=>JSON.stringify(x)).join('\n')+'\n');}
const used=new Set(),train=generate(20261108,100,used),validation=generate(9120187,20,used);
const human=fs.readFileSync(path.join(old,'train.jsonl'),'utf8').trim().split('\n').map(line=>({...JSON.parse(line),source:'human-weak-heuristic',family:'single-match'}));
for(const row of human){const d=sha(row.messages[0].content);if(used.has(d)||benchmarkHashes.has(d))throw Error('Human data overlaps held-out examples');used.add(d);}
write('train_synthetic.jsonl',train.rows);write('train_human_weak.jsonl',human);write('train_combined.jsonl',[...train.rows,...human]);write('validation_synthetic.jsonl',validation.rows);
const manifest={generator:'Synthetic rule-based, not human-labeled or optimal',gameDecisionVersion:c.decisionVersion,trainingSeed:20261108,validationSeed:9120187,families,trainingSynthetic:train.rows.length,trainingHumanWeak:human.length,validationSynthetic:validation.rows.length,trainingLabels:train.counts,validationLabels:validation.counts,trainingAttempts:train.attempts,validationAttempts:validation.attempts,benchmarkPromptsExcluded:benchmarkHashes.size,split:'Different generated prompts and seeds; same scenario families. Not held-out human matches or proof of generalization.',risks:['Teacher rules are hand-authored heuristics and can be wrong.','The two observed human examples have weak inferred labels.','Repeated templates are correlated and do not establish real-game strength.','Flank labels encode a simplified synthetic map rule, not a proven reachable tactic.']};
fs.writeFileSync(path.join(out,'dataset_manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({training:train.rows.length,human:human.length,validation:validation.rows.length,labels:train.counts}));
