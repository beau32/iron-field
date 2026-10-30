'use strict';
// Used by the server adapter and the player's local connector; browsers never choose upstream URLs.
const {validPlan}=require('./opponent.js');
const definitions=require('./data.js');
const units=Object.keys(definitions.units),buildings=Object.keys(definitions.buildings).filter(k=>definitions.buildings[k].cost>0);
const base=(process.env.OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/$/,'');
const defaultModel=process.env.OLLAMA_MODEL||'qwen2.5:0.5b';
const timeout=Math.max(1500,Math.min(5000,Number(process.env.OLLAMA_TIMEOUT_MS)||5000));
let busy=false,nextAllowed=0,installed=[],statusUntil=0,discoveryError='';
const modelStates=new Map();
const stateFor=model=>{if(!modelStates.has(model))modelStates.set(model,{readyUntil:0,warmRetry:0,error:''});return modelStates.get(model);};
function modelName(value){if(value===undefined||value==='')return defaultModel;if(typeof value!=='string'||value.length>100)throw failure(400,'Invalid Ollama model.');return value;}
const failure=(status,message,retryAfterMs=10000)=>Object.assign(new Error(message),{status,retryAfterMs});
// A language model selects one strategy; game rules expand it into concrete priorities.
const choices={
  balanced:{style:'balanced',focus:'economy',unit:'auto',building:'auto'},
  rush:{style:'rush',focus:'production',unit:'tank',building:'auto'},
  defend:{style:'fortress',focus:'army',unit:'auto',building:'turret'},
  economy:{style:'economy',focus:'economy',unit:'auto',building:'auto'},
  air:{style:'air',focus:'production',unit:'gunship',building:'airfield'},
  'anti-air':{style:'balanced',focus:'army',unit:'rocket',building:'missileBattery'},
  siege:{style:'balanced',focus:'production',unit:'artillery',building:'auto'},
  'anti-armor':{style:'balanced',focus:'army',unit:'destroyer',building:'auto'},
  naval:{style:'balanced',focus:'production',unit:'frigate',building:'shipyard'}
};
const decisionVersion=2;
const prefix='Command OUR army to destroy ENEMY HQ. Recover income, defend danger, fill counter gaps, exploit strength. Queued counters count. Keep productive plans; replace stalled or losing plans. Choose an offered strategy. Return only JSON {"strategy":"name"}.\n';
const schema=options=>({type:'object',properties:{strategy:{type:'string',enum:options}},required:['strategy'],additionalProperties:false});
const integer=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max;
function counts(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))throw failure(400,'Invalid army summary.');
  const result={};for(const k of keys){const n=value[k]??0;if(!integer(n,400))throw failure(400,'Invalid unit count.');if(n)result[k]=n;}return result;
}
function summarize(value){
  if(!value||!integer(value.elapsed,86400)||!integer(value.credits,1000000))throw failure(400,'Invalid battle summary.');
  const bounded=(v,fallback,max)=>{if(v===undefined)return fallback;if(!integer(v,max))throw failure(400,'Invalid strategic feedback.');return v;};
  const side=v=>{if(!v)throw failure(400,'Missing army.');const owned=counts(v.buildings,['base',...buildings]);return {units:counts(v.units,units),buildings:owned,ready:v.ready===undefined?owned:counts(v.ready,['base',...buildings]),queued:counts(v.queued||{},units),health:bounded(v.health,100,100),hqHealth:bounded(v.hqHealth,owned.base?100:0,100)};};
  const context=value.context||{};if(typeof context!=='object'||Array.isArray(context)||!integer(context.pressure??0,400)||typeof (context.water??false)!=='boolean'||typeof (context.lowPower??false)!=='boolean')throw failure(400,'Invalid tactical context.');
  const f=value.feedback||{};
  if(typeof f!=='object'||Array.isArray(f)||!['','balanced','rush','defend','economy','air','anti-air','siege','anti-armor','naval'].includes(f.operation||'')||!['Preparing','Building forces','Attacking','Defending','Regrouping'].includes(f.mode||'Preparing')||typeof(f.stalled??false)!=='boolean')throw failure(400,'Invalid operation feedback.');
  const feedback={operation:f.operation||'',mode:f.mode||'Preparing',stalled:f.stalled||false};
  for(const key of ['age','lostValue','destroyedValue','income','raidAge','raidSize'])feedback[key]=bounded(f[key],0,key==='raidSize'?400:1000000);
  return {elapsed:value.elapsed,credits:value.credits,own:side(value.own),opponent:side(value.opponent),context:{pressure:context.pressure||0,water:Boolean(context.water),lowPower:Boolean(context.lowPower),oreRemaining:bounded(context.oreRemaining,1,1000000)},feedback};
}
async function status(requested){
  const model=modelName(requested);
  if(Date.now()>=statusUntil){
    try{
      const r=await fetch(base+'/api/tags',{signal:AbortSignal.timeout(3000)});if(!r.ok)throw Error();const data=await r.json();
      installed=(data.models||[]).filter(m=>typeof m.name==='string'&&m.name.length<=100&&(!m.capabilities||m.capabilities.includes('completion'))).slice(0,100).map(m=>({name:m.name,size:Number(m.size)||0,thinking:Boolean(m.capabilities?.includes('thinking'))})).sort((a,b)=>a.size-b.size);
      discoveryError='';
    }catch{installed=[];discoveryError='Ollama is unavailable on the selected computer.';}
    statusUntil=Date.now()+15000;
  }
  const available=installed.some(m=>m.name===model),state=available?stateFor(model):null,ready=Boolean(state&&Date.now()<state.readyUntil);
  return {available,model,defaultModel,decisionVersion,models:installed.map(m=>({...m})),ready,message:discoveryError||(!available?`Model ${model} is not installed on the selected computer.`:state.error||(ready?'Ollama ready':'Model waiting to warm up.'))};
}
function assess(summary){
  const count=(side,test,queued=false)=>Object.entries(queued?side.queued:side.units).reduce((n,[k,v])=>n+(test(definitions.units[k],k)?v:0),0);
  const aa=u=>u.damage>0&&['air','all'].includes(u.targets),armor=u=>u.damage>0&&!u.aircraft&&!u.infantry&&!u.naval;
  const value=(side,ground=false)=>Math.round(Object.entries(side.units).reduce((n,[k,v])=>n+(definitions.units[k].damage&&(!ground||definitions.units[k].targets!=='air')?definitions.units[k].cost*v:0),0)*side.health/100);
  const own=summary.own,enemy=summary.opponent;
  return {ownValue:value(own),attackValue:value(own,true),enemyValue:value(enemy),army:count(own,u=>u.damage>0&&u.targets!=='air'),miners:(own.units.miner||0)+(own.queued.miner||0),
    air:count(enemy,u=>u.aircraft),aa:count(own,aa)+count(own,aa,true),enemyAA:count(enemy,aa)+(enemy.ready.missileBattery||0)*2,
    armor:count(enemy,armor),armorCounters:(own.units.destroyer||0)+(own.queued.destroyer||0),
    defenses:Object.entries(enemy.ready).reduce((n,[k,v])=>n+(definitions.buildings[k].defense?v:0),0),
    siege:(own.units.artillery||0)+(own.queued.artillery||0)+(own.units.battleship||0)+(own.queued.battleship||0),
    ships:count(enemy,u=>u.naval),ownShips:count(own,u=>u.naval)+count(own,u=>u.naval,true)};
}
function investmentCost(summary,unit){
  const visited=new Set(),own=summary.own;
  function buildingCost(kind){
    if(own.buildings[kind]||visited.has(kind))return 0;
    visited.add(kind);const def=definitions.buildings[kind];
    return def.cost+(def.requires||[]).reduce((n,k)=>n+buildingCost(k),0);
  }
  return definitions.units[unit].cost+buildingCost(definitions.units[unit].producer);
}
function candidates(summary){
  const m=assess(summary),own=summary.own,f=summary.feedback,pressure=summary.context.pressure;
  const income=Boolean(own.ready.refinery&&(own.units.miner||0)>0&&summary.context.oreRemaining&&(f.age<45||f.income>0));
  const canInvest=unit=>investmentCost(summary,unit)<=summary.credits+(income?350:0);
  const losing=f.lostValue>Math.max(200,f.destroyedValue*1.5),advantage=m.attackValue>Math.max(250,m.enemyValue*1.25);
  const list=[];const add=(name,score,why)=>list.push({name,score,why});
  add('balanced',35,'mixed force; attack exposed economy');
  if(summary.context.oreRemaining&&(m.miners<2||!own.buildings.refinery))add('economy',100,'restore ore income');
  else if(summary.context.oreRemaining&&m.miners<4&&pressure<2&&summary.credits>=120&&m.ownValue>=m.enemyValue*.8&&!(advantage&&m.army>=5))add('economy',42,'safe income expansion');
  if(pressure>=2||own.hqHealth<45&&pressure||losing||m.ownValue<m.enemyValue*.65)add('defend',pressure>=3?110:losing?65:55,'protect base and rebuild force');
  if(m.air>m.aa)add('anti-air',pressure?105:85,'aircraft exceed mobile anti-air, including queues');
  if(m.defenses>=2&&m.siege<Math.max(2,Math.ceil(m.defenses/2))&&canInvest('artillery'))add('siege',75,'outrange enemy defenses');
  if(m.armor>=3&&m.armorCounters<Math.ceil(m.armor/3)&&canInvest('destroyer'))add('anti-armor',70,'fill armor-counter gap');
  if(!pressure&&m.army>=3&&!losing&&m.attackValue>=m.enemyValue*.85)add('rush',advantage||summary.opponent.hqHealth<45?90:50,'pressure production or finish vulnerable HQ');
  if(!pressure&&income&&(!advantage||m.defenses>=2)&&m.enemyAA<Math.max(2,m.army/3)&&canInvest('gunship'))add('air',m.defenses>=2?60:40,'bypass ground defenses with air power');
  if(summary.context.water&&canInvest('frigate')&&m.ownShips<Math.max(2,m.ships))add('naval',m.ships>=2?75:38,'contest waterways and shore targets');
  // A successful operation gets continuity, not a permanent lock. Stalled/loss-heavy
  // operations lose their bonus; an emergency can still take precedence.
  for(const item of list)if(item.name===f.operation){
    if(f.stalled||losing)item.score-=35;
    else if(f.mode==='Attacking'||f.age<45||f.destroyedValue>f.lostValue)item.score+=12;
  }
  const finish=summary.opponent.hqHealth<=50&&advantage&&m.army>=3&&!pressure&&!losing;
  return list.filter(c=>!finish||['rush','balanced'].includes(c.name)).sort((a,b)=>b.score-a.score).slice(0,4);
}
function relevantStrategies(summary){return candidates(summary).map(c=>c.name);}
function facts(summary){
  const m=assess(summary),f=summary.feedback;
  const economy=!summary.context.oreRemaining?'ore exhausted':!summary.own.ready.refinery||!(summary.own.units.miner||0)?'broken':f.age>=45&&!f.income?'stalled':'working';
  const force=m.ownValue>m.enemyValue*1.25?'stronger':m.ownValue<m.enemyValue*.7?'weaker':'even';
  const gaps=[];if(m.air>m.aa)gaps.push('anti-air');if(m.armor>=3&&m.armorCounters<Math.ceil(m.armor/3))gaps.push('anti-armor');if(m.defenses>=2&&m.siege<Math.max(2,Math.ceil(m.defenses/2)))gaps.push('siege');
  const lines=[`Income ${economy}. Force ${force}. Cash ${summary.credits}. Base ${summary.context.pressure>=2?'threatened':'safe'}. Need ${gaps.join(',')||'no counters'}.`];
  if(summary.opponent.hqHealth<=50)lines.push(`Enemy HQ ${summary.opponent.hqHealth}%.`);
  if(summary.own.hqHealth<45)lines.push(`Our HQ ${summary.own.hqHealth}%.`);
  if(summary.context.lowPower)lines.push('Low power.');
  if(f.operation)lines.push(`Previous ${f.operation}: ${f.stalled?'stalled':f.lostValue>Math.max(200,f.destroyedValue*1.5)?'losing':f.mode==='Attacking'?'attacking':'building'}.`);
  return lines.join(' ');
}
function planFor(strategy,summary){
  const plan={...choices[strategy],operation:strategy},m=assess(summary),ready=summary.own.ready;
  if(strategy==='anti-air'){
    plan.unit=ready.airfield&&summary.credits>=definitions.units.interceptor.cost?'interceptor':ready.garrison&&(!ready.warFactory||summary.credits<definitions.units.rocket.cost)?'rocketTrooper':'rocket';
    plan.building=summary.context.pressure&&ready.warFactory&&!ready.missileBattery&&summary.credits>=definitions.buildings.missileBattery.cost?'missileBattery':'auto';
  }
  if(['balanced','rush'].includes(strategy)&&summary.opponent.hqHealth<=50&&m.attackValue>m.enemyValue*1.2)plan.focus='hq';
  return validPlan(plan,units,buildings);
}
function promptFor(summary,options=candidates(summary)){
  return prefix+facts(summary)+'\nChoose only: '+options.map(c=>c.name).join(',')+'.';
}
async function infer(model,summary,signal){
  const offered=candidates(summary),options=offered.map(c=>c.name);
  const r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({model,stream:false,...((process.env.OLLAMA_THINK==='false'||installed.find(m=>m.name===model)?.thinking)?{think:false}:{}),format:schema(options),keep_alive:'30m',options:{temperature:0,num_predict:16,num_ctx:512,num_thread:4},messages:[{role:'user',content:promptFor(summary,offered)}]})});
  if(!r.ok)throw Error('Ollama unavailable');
  const result=await r.json(),parsed=JSON.parse(result.message?.content);
  if(!parsed||!options.includes(parsed.strategy)||!Object.hasOwn(choices,parsed.strategy))throw Error('Invalid model strategy');
  const selected=planFor(parsed.strategy,summary);if(!selected)throw Error('Invalid model plan');
  return selected;
}
async function warmup(requested){
  const info=await status(requested);if(!info.available)return;
  const model=info.model,state=stateFor(model);
  if(busy||Date.now()<state.warmRetry)return;
  busy=true;state.warmRetry=Date.now()+60000;state.error='';
  try {
    // Prime this model's instruction prefix; discard the synthetic decision.
    await infer(model,summarize({elapsed:120,credits:400,own:{units:{miner:2,tank:4},buildings:{base:1,power:1,refinery:1,garrison:1,warFactory:1}},opponent:{units:{tank:3},buildings:{base:1,turret:2}}}),AbortSignal.timeout(30000));
    state.readyUntil=Date.now()+25*60000;
  }catch{state.readyUntil=0;state.error=`${model} could not warm up within 30 seconds or returned invalid output. Try a smaller model.`;}
  finally{busy=false;}
}
async function plan(input,signal){
  const summary=summarize(input),info=await status(input.model);
  if(!info.available)throw failure(503,info.message);
  const model=info.model,state=stateFor(model);
  if(busy||Date.now()<nextAllowed)throw failure(429,'Local AI is preparing or busy',2000);
  if(Date.now()>=state.readyUntil){
    if(Date.now()<state.warmRetry)throw failure(503,state.error||`${model} is warming up`,10000);
    void warmup(model);throw failure(503,`${model} is warming up`,2000);
  }
  busy=true;
  const controller=new AbortController(),cancel=()=>controller.abort();
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  const timer=setTimeout(cancel,timeout);
  try{
    const decision=await infer(model,summary,controller.signal);state.readyUntil=Date.now()+25*60000;state.error='';
    return {plan:decision,model,decisionVersion};
  }catch(error){if(signal.aborted)throw failure(499,'Commander request cancelled.');throw failure(503,`${model} missed its five-second deadline or returned an invalid strategy. Try a smaller model.`);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);busy=false;nextAllowed=Date.now()+2000;}
}
module.exports={status,plan,summarize,warmup,relevantStrategies,choices,assess,candidates,planFor,promptFor,decisionVersion};
