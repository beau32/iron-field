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
const prefix='Choose the best RTS response. Return JSON {"strategy":"name"}. Names: balanced,rush,defend,economy,air,anti-air,siege,anti-armor,naval. Naval requires water. Base under pressure needs defense. Example: enemy aircraft -> {"strategy":"anti-air"}. Example: no miners -> {"strategy":"economy"}. Example: enemy turrets -> {"strategy":"siege"}.\nBattle: ';
const schema=options=>({type:'object',properties:{strategy:{type:'string',enum:options}},required:['strategy'],additionalProperties:false});
const integer=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max;
function counts(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))throw failure(400,'Invalid army summary.');
  const result={};for(const k of keys){const n=value[k]??0;if(!integer(n,400))throw failure(400,'Invalid unit count.');if(n)result[k]=n;}return result;
}
function summarize(value){
  if(!value||!integer(value.elapsed,86400)||!integer(value.credits,1000000))throw failure(400,'Invalid battle summary.');
  const side=v=>{if(!v)throw failure(400,'Missing army.');return {units:counts(v.units,units),buildings:counts(v.buildings,['base',...buildings])};};
  const context=value.context||{};if(typeof context!=='object'||Array.isArray(context)||!integer(context.pressure??0,400)||typeof (context.water??false)!=='boolean'||typeof (context.lowPower??false)!=='boolean')throw failure(400,'Invalid tactical context.');
  return {elapsed:value.elapsed,credits:value.credits,own:side(value.own),opponent:side(value.opponent),context:{pressure:context.pressure||0,water:Boolean(context.water),lowPower:Boolean(context.lowPower)}};
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
  return {available,model,defaultModel,models:installed.map(m=>({...m})),ready,message:discoveryError||(!available?`Model ${model} is not installed on the selected computer.`:state.error||(ready?'Ollama ready':'Model waiting to warm up.'))};
}
function facts(summary){
  const count=(side,predicate)=>Object.entries(side.units).reduce((n,[kind,amount])=>n+(predicate(definitions.units[kind])?amount:0),0);
  const own=summary.own,enemy=summary.opponent;
  const defenses=Object.entries(enemy.buildings).reduce((n,[kind,amount])=>n+(definitions.buildings[kind].defense?amount:0),0);
  // Stable enemy facts first: frequently changing own army size invalidates less cached text.
  return `enemy aircraft=${count(enemy,u=>u.aircraft)} turrets=${defenses} tanks=${count(enemy,u=>u.damage>0&&!u.aircraft&&!u.infantry&&!u.naval)}; own miners=${own.units.miner||0} army=${count(own,u=>u.damage>0)}; water=${summary.context?.water?1:0} enemy ships=${count(enemy,u=>u.naval)} base pressure=${summary.context?.pressure||0} low power=${summary.context?.lowPower?1:0}.`;
}
function relevantStrategies(summary){
  const total=(side,predicate)=>Object.entries(side.units).reduce((n,[k,v])=>n+(predicate(definitions.units[k])?v:0),0);
  const own=summary.own,enemy=summary.opponent;
  if((summary.context?.pressure||0)>=3)return total(enemy,u=>u.aircraft)>0?['anti-air','defend']:['defend','anti-armor'];
  if((own.units.miner||0)<2)return ['economy','defend'];
  if(total(enemy,u=>u.aircraft)>0)return ['anti-air','air'];
  if(summary.context?.water&&total(enemy,u=>u.naval)>=2)return ['naval','air'];
  const defenses=Object.entries(enemy.buildings).reduce((n,[k,v])=>n+(definitions.buildings[k].defense?v:0),0);
  if(defenses>=2)return ['siege','air'];
  if(total(own,u=>u.damage)<total(enemy,u=>u.damage)*.6)return ['defend','economy'];
  if(total(enemy,u=>u.damage&&!u.aircraft&&!u.infantry&&!u.naval)>=3)return ['anti-armor','siege','air'];
  return ['rush','air','economy'];
}
async function infer(model,battle,signal,options=Object.keys(choices)){
  const r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({model,stream:false,...((process.env.OLLAMA_THINK==='false'||installed.find(m=>m.name===model)?.thinking)?{think:false}:{}),format:schema(options),keep_alive:'30m',options:{temperature:0,num_predict:16,num_ctx:512,num_thread:4},messages:[{role:'user',content:prefix+battle+' Choose only: '+options.join(',')+'.'}]})});
  if(!r.ok)throw Error('Ollama unavailable');
  const result=await r.json();const parsed=JSON.parse(result.message?.content);
  if(!parsed||!options.includes(parsed.strategy)||!Object.hasOwn(choices,parsed.strategy))throw Error('Invalid model strategy');
  const selected={...choices[parsed.strategy]};
  if(parsed.strategy==='air'&&options.includes('anti-air'))selected.unit='interceptor';
  const decision=validPlan(selected,units,buildings);if(!decision)throw Error('Invalid model plan');
  return decision;
}
async function warmup(requested){
  const info=await status(requested);if(!info.available)return;
  const model=info.model,state=stateFor(model);
  if(busy||Date.now()<state.warmRetry)return;
  busy=true;state.warmRetry=Date.now()+60000;state.error='';
  try {
    // Prime this model's instruction prefix; discard the synthetic decision.
    await infer(model,'enemy aircraft=0 turrets=1 tanks=4; own miners=1 army=4.',AbortSignal.timeout(30000));
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
    const decision=await infer(model,facts(summary),controller.signal,relevantStrategies(summary));state.readyUntil=Date.now()+25*60000;state.error='';
    return {plan:decision,model};
  }catch(error){if(signal.aborted)throw failure(499,'Commander request cancelled.');throw failure(503,`${model} missed its five-second deadline or returned an invalid strategy. Try a smaller model.`);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);busy=false;nextAllowed=Date.now()+2000;}
}
module.exports={status,plan,summarize,warmup,relevantStrategies,choices};
