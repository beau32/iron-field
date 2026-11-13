'use strict';
// Deterministic strategic proxy, not the browser game engine or a match simulator.
const fs=require('node:fs'),path=require('node:path');
const c=require('../commander.cjs'),defs=require('../data.js');
const suffix='\nPlain names use game tactics; @left or @right chooses a flanking approach relative to our force facing the target.';
const baseBuildings={base:1,power:2,refinery:1,garrison:1,warFactory:1};
const scenarios=[
 {id:'mining-recovery',own:{miner:0,tank:4},enemy:{tank:3},credits:550,pressure:0,pattern:'raid'},
 {id:'base-assault',own:{miner:2,tank:3},enemy:{tank:6},credits:600,pressure:3,pattern:'assault'},
 {id:'air-attack',own:{miner:2,tank:5},enemy:{tank:3,gunship:4},credits:700,pressure:1,pattern:'air'},
 {id:'armor-push',own:{miner:2,tank:4},enemy:{heavy:5},credits:750,pressure:1,pattern:'assault'},
 {id:'fortified-base',own:{miner:3,tank:7},enemy:{tank:3},enemyBuildings:{turret:3},credits:800,pressure:0,pattern:'fortify'},
 {id:'naval-pressure',own:{miner:2,tank:5},enemy:{tank:3,frigate:3},credits:850,pressure:0,water:true,pattern:'naval'},
 {id:'vulnerable-enemy',own:{miner:2,tank:8},enemy:{tank:2},credits:600,enemyHQ:35,pressure:0,pattern:'raid'},
 {id:'exhausted-ore',own:{miner:0,tank:3},enemy:{heavy:6},credits:500,ore:0,pressure:2,pattern:'assault'}
];
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
function createState(s,seed){return {elapsed:240,credits:s.credits,own:{units:clone(s.own),buildings:{...baseBuildings},hqHealth:100},opponent:{units:clone(s.enemy),buildings:{base:1,...s.enemyBuildings},hqHealth:s.enemyHQ||100},context:{water:!!s.water,pressure:s.pressure,oreRemaining:s.ore??16000},feedback:{},_scenario:s.id,_pattern:s.pattern,_seed:seed,_step:0};}
function strength(units){return Object.entries(units).reduce((n,[k,count])=>{const d=defs.units[k];return n+(d?.damage||0)/(d?.reload||1)*Math.sqrt(d?.hp||0)*count;},0);}
function purchase(state,kind){const unit=defs.units[kind];if(!unit||!state.own.buildings[unit.producer]||state.credits<unit.cost)return false;state.credits-=unit.cost;state.own.units[kind]=(state.own.units[kind]||0)+1;return true;}
function removeValue(units,budget){let cost=0;for(const [kind] of Object.entries(units).sort((a,b)=>defs.units[a[0]].cost-defs.units[b[0]].cost)){const unit=defs.units[kind];while(units[kind]>0&&budget>=unit.hp){units[kind]--;budget-=unit.hp;cost+=unit.cost;}if(!units[kind])delete units[kind];}return cost;}
function tick(state,plan){
 // Deliberately separate from the lookahead's scoring/transitions. Uses game unit
 // prices and weapon stats but abstracts away pathing, range and individual HP.
 const s=state,op=plan.operation,step=s._step++,enemy=s.opponent.units,own=s.own.units;
 const ore=Math.min(s.context.oreRemaining,(own.miner||0)*45);s.context.oreRemaining-=ore;s.credits=Math.min(5000,s.credits+ore);
 if(op==='economy'&&s.context.oreRemaining)purchase(s,'miner');
 else {const desired=plan.unit&&defs.units[plan.unit]?plan.unit:({defend:'tank',rush:'tank','anti-air':'rocketTrooper','anti-armor':'destroyer',siege:'artillery',air:'gunship',naval:'frigate'})[op]||'tank';
  const producer=defs.units[desired].producer;if(!s.own.buildings[producer]&&defs.buildings[producer]&&s.credits>=defs.buildings[producer].cost){s.credits-=defs.buildings[producer].cost;s.own.buildings[producer]=1;}purchase(s,desired);}
 const cycle=(s._seed*17+step*13)%7;
 if(step%2===1){const recruit=s._pattern==='air'?'gunship':s._pattern==='naval'?'frigate':s._pattern==='assault'?'heavy':'tank';enemy[recruit]=(enemy[recruit]||0)+1;}
 const onAttack=['rush','siege','air','balanced'].includes(op),underAttack=s.context.pressure>0||((s._pattern==='assault'||s._pattern==='air')&&step%3!==2)||s._pattern==='raid'&&step%4===2;
 const ourPower=strength(own),enemyPower=strength(enemy),air=enemy.gunship||0,aa=(own.rocket||0)+(own.rocketTrooper||0)+(own.interceptor||0);
 const fortifications=s.opponent.buildings.turret||0, ourFactor=(op==='defend'?1.3:1)*(op==='anti-air'&&air?1.18:1),theirFactor=1+Math.max(0,air-aa)*.1+(onAttack?fortifications*.09:0);
 let lost=0,destroyed=0;
 if(onAttack||underAttack){
  lost=removeValue(own,enemyPower*.12*theirFactor*(underAttack?1.15:1));
  destroyed=removeValue(enemy,ourPower*.12*ourFactor);
  if(underAttack)s.own.hqHealth=clamp(s.own.hqHealth-Math.max(0,Math.round((enemyPower*theirFactor-ourPower*ourFactor)*.012))-(op==='defend'?0:1),0,100);
  if(onAttack)s.opponent.hqHealth=clamp(s.opponent.hqHealth-Math.max(0,Math.round((ourPower-enemyPower*theirFactor)*.012))-(cycle===0?1:0),0,100);
  if(underAttack&&op!=='defend'&&cycle===0&&(own.miner||0)>0){own.miner--;lost+=defs.units.miner.cost;}
 }
 if(op==='siege'&&fortifications&&cycle<3)s.opponent.buildings.turret--;
 s.context.pressure=underAttack?Math.min(5,Object.values(enemy).reduce((a,b)=>a+b,0)):0;
 s.elapsed+=30;s.feedback={operation:op,mode:onAttack?'Attacking':underAttack?'Defending':'Building forces',age:30,lostValue:lost,destroyedValue:destroyed,income:ore,stalled:false};
 return {income:ore,lost,destroyed};
}
function summary(state){const {_scenario,_pattern,_seed,_step,...input}=state;return c.summarize(input);}
async function choose(state,enabled,model){
 const s=summary(state),offered=c.offeredOperations(s,{lookahead:enabled}),options=c.modelOptions(s,offered);
 if(!model){const choice=options[0].name;return {choice,plan:c.modelPlanFor(choice,s),promptMs:0,offered:options.map(o=>o.name)};}
 const prompt=c.promptFor(s,options,{lookahead:enabled})+suffix,start=Date.now();
 const r=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({model,stream:false,think:false,format:{type:'string',enum:options.map(o=>o.name)},keep_alive:'30m',options:{temperature:0,num_predict:24,num_ctx:1536,num_thread:4},messages:[{role:'user',content:prompt}]})});
 const d=await r.json();if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);const choice=JSON.parse(d.message?.content);if(!options.some(o=>o.name===choice))throw Error('Model returned an invalid choice');
 return {choice,plan:c.modelPlanFor(choice,s),promptMs:Date.now()-start,offered:options.map(o=>o.name)};
}
async function episode(scenario,seed,enabled,steps,model){const state=createState(scenario,seed),trace=[];let totalIncome=0,lost=0,destroyed=0;
 for(let i=0;i<steps&&state.own.hqHealth>0&&state.opponent.hqHealth>0;i++){const before=clone(state),choice=await choose(state,enabled,model),effect=tick(state,choice.plan);totalIncome+=effect.income;lost+=effect.lost;destroyed+=effect.destroyed;trace.push({step:i,before,choice:choice.choice,plan:choice.plan,offered:choice.offered,decisionMs:choice.promptMs,effect,after:clone(state)});}
 return {scenario:scenario.id,seed,lookahead:enabled,final:{ownHQ:state.own.hqHealth,enemyHQ:state.opponent.hqHealth,credits:state.credits,income:totalIncome,lostValue:lost,destroyedValue:destroyed,ownArmyValue:Object.entries(state.own.units).reduce((n,[k,v])=>n+defs.units[k].cost*v,0)},trace};}
async function benchmark({seeds=2,steps=8,model=null,onProgress=()=>{}}={}){
 if(!Number.isInteger(seeds)||seeds<1||seeds>100||!Number.isInteger(steps)||steps<1||steps>100)throw Error('seeds and steps must be integers from 1 to 100');
 let runs=[];for(const scenario of scenarios)for(let seed=1;seed<=seeds;seed++)for(const enabled of [false,true]){const run=await episode(scenario,seed,enabled,steps,model);runs.push(run);onProgress(run);}
 const summarize=enabled=>{const selected=runs.filter(r=>r.lookahead===enabled),avg=k=>selected.reduce((n,r)=>n+r.final[k],0)/selected.length;return Object.fromEntries(['ownHQ','enemyHQ','income','lostValue','destroyedValue','ownArmyValue'].map(k=>[k,Math.round(avg(k)*10)/10]));};
 return {createdAt:new Date().toISOString(),mode:model?'ollama':'heuristic',model,seeds,steps,limitations:['Strategic proxy only: not actual Iron Field matches, not a game-engine rollout, and not a win-rate estimate.','Combat, income, production and scripted enemy responses are simplified; no movement, terrain, fog, routing, technology prerequisites or building placement.','Both conditions share seeds and starting states, but the proxy can favor or penalize either method for reasons unrelated to real games.','A model can choose differently on sequential runs; temperature zero does not guarantee repeatability on all hardware.'],summary:{withoutLookahead:summarize(false),withLookahead:summarize(true)},runs};
}
function reportFor(result,jsonName){
 const lines=['# Iron Field headless strategy benchmark','',`Mode: ${result.mode}${result.model?' · model: '+result.model:''}. ${result.seeds} seed(s) per scenario; up to ${result.steps} decision windows per run.`, '',...result.limitations.map(x=>'- '+x),'','## Mean proxy outcomes','','| Metric | Lookahead off | Lookahead on |','|---|---:|---:|'];
 for(const [label,key] of [['Own HQ remaining (%)','ownHQ'],['Enemy HQ remaining (%)','enemyHQ'],['Ore delivered','income'],['Own asset value lost','lostValue'],['Enemy unit value destroyed','destroyedValue'],['Own remaining unit value','ownArmyValue']])lines.push(`| ${label} | ${result.summary.withoutLookahead[key]} | ${result.summary.withLookahead[key]} |`);
 lines.push('','## Paired scenarios','','| Scenario | Seed | Own HQ off / on | Enemy HQ off / on | Choices differed* |','|---|---:|---:|---:|---:|');
 for(let i=0;i<result.runs.length;i+=2){let a=result.runs[i],b=result.runs[i+1],n=Math.min(a.trace.length,b.trace.length),changed=0;for(let j=0;j<n;j++)if(a.trace[j].choice!==b.trace[j].choice)changed++;
  lines.push(`| ${a.scenario} | ${a.seed} | ${a.final.ownHQ} / ${b.final.ownHQ} | ${a.final.enemyHQ} / ${b.final.enemyHQ} | ${changed}/${n} |`);}
 lines.push('','*Choices compare corresponding decision windows. Once the runs diverge, their states can differ, so this is not a controlled count of decisions caused by lookahead.','',`Each run’s states, decisions, offered choices, latency and effects are recorded in ${jsonName}.`,'');return lines.join('\n');
}
if(require.main===module){const args=process.argv.slice(2),value=key=>{const i=args.indexOf(key);return i<0?null:args[i+1]};if(args.includes('--help')){console.log('node benchmarks/strategy-benchmark.cjs [--model OLLAMA_MODEL] [--seeds 2] [--steps 8] [--output FILE]');process.exit(0);}
 const output=value('--output')||path.join(__dirname,'strategy-results.json');benchmark({model:value('--model'),seeds:Number(value('--seeds')||2),steps:Number(value('--steps')||8),onProgress:r=>console.log(`${r.scenario} seed=${r.seed} lookahead=${r.lookahead?'on':'off'} HQ ${r.final.ownHQ}/${r.final.enemyHQ}`)}).then(result=>{const report=output.replace(/(?:\.json)?$/i,'.md');if(path.resolve(report)===path.resolve(output))throw Error('Output filename must not end in .md');fs.writeFileSync(output,JSON.stringify(result,null,2));fs.writeFileSync(report,reportFor(result,path.basename(output)));console.log('Summary:',JSON.stringify(result.summary));console.log('Saved:',output,'and',report);}).catch(e=>{console.error(e);process.exitCode=1});}
module.exports={scenarios,createState,tick,episode,benchmark,reportFor};
