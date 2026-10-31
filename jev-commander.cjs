'use strict';
// Jev/System One decision API. Keep its endpoint separate from Ollama chat.
const {summarize,offeredOperations,operationEvidence,planFor,assess,decisionVersion}=require('./commander.cjs');
const fail=(status,message,retryAfterMs=5000)=>Object.assign(new Error(message),{status,retryAfterMs});
function validPort(value){const port=Number(value);if(!Number.isInteger(port)||port<1||port>65535)throw fail(400,'Enter a JEV port from 1 to 65535.');return port;}
function decisionRequest(input,model){
 const summary=summarize(input),offered=offeredOperations(summary);
 return {summary,offered,body:{model,state:JSON.stringify(summary),questions:{strategy:{type:'choice',instructions:'Command our army to destroy the enemy HQ. Choose the best feasible operation. Protect a threatened base, recover broken income if ore remains, fill unmet counters including queues, and exploit an army advantage. Continue productive attacks; replace stalled or losing plans. Consider credits and completed producers.',criteria:Object.fromEntries(offered.map(c=>[c.name,c.why]))}}}};
}
function classificationRequest(summary,offered){
 const m=assess(summary),f=summary.feedback;
 const premise=[
  `Our army has ${m.army} ground attackers, combat strength ${m.attackValue}, and ${summary.credits} credits. Enemy combat strength is ${m.enemyValue}.`,
  `Our HQ has ${summary.own.hqHealth}% health; enemy HQ has ${summary.opponent.hqHealth}%. ${summary.context.pressure} enemies threaten our base.`,
  `Ore remaining: ${summary.context.oreRemaining}. We have ${m.miners} miners including queues and ${summary.own.ready.refinery||0} completed refineries. Recent mining income: ${f.income}.`,
  `Enemy aircraft: ${m.air}; our anti-air including queues: ${m.aa}. Enemy armor: ${m.armor}; our armor counters: ${m.armorCounters}.`,
  `Enemy defensive structures: ${m.defenses}; our siege weapons: ${m.siege}. Enemy anti-air: ${m.enemyAA}. Waterways: ${summary.context.water?'present':'absent'}; our ships: ${m.ownShips}; enemy ships: ${m.ships}.`,
  `Recent losses cost ${f.lostValue}; enemy losses cost ${f.destroyedValue}. Previous operation ${f.operation||'none'} is ${f.stalled?'stalled':f.mode}.`,
  'Feasible operations after checking resources and technology: '+offered.map(c=>c.name+' ('+c.why+')').join('; ')+'.'
 ].join(' ');
 return {premise,choices:offered.map(c=>operationEvidence[c.name])};
}
function classificationChoice(result,body,offered){
 if(!Array.isArray(result.choices)||result.choices.length!==offered.length)throw fail(503,'OpenJEV returned an incomplete classification.');
 const ranked=result.choices.map((row,i)=>{
  const p=row?.nli?.probabilities,values=['entailment','contradiction','neutral'].map(k=>p?.[k]);
  if(row.text!==body.choices[i]||values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||Math.abs(values.reduce((a,b)=>a+b,0)-1)>.01)throw fail(503,'OpenJEV returned invalid classification scores.');
  return {name:offered[i].name,score:p.entailment-p.contradiction};
 });
 ranked.sort((a,b)=>b.score-a.score);return ranked[0].name;
}
function createCommander({port=process.env.JEV_PORT,model=process.env.JEV_MODEL||'nimble',fetchImpl=fetch,now=Date.now,timeoutMs=5000}={}){
 const configured=port!==undefined&&port!==''&&port!==null,selectedPort=configured?validPort(port):null;
 const base=configured?'http://127.0.0.1:'+selectedPort:null;
 let discovery={models:[],protocol:'systemone',activeModel:null,multiModel:false};
 let refresh=null,until=0,busy=false,error='';
 const modelName=value=>{const name=value||model;if(typeof name!=='string'||!name.trim()||name.length>100)throw fail(400,'Invalid JEV model.');return name;};
 async function discover(){
  const signal=AbortSignal.timeout(3000);
  const get=path=>fetchImpl(base+path,{signal});
  const tags=await get('/api/tags');
  if(tags.status!==404){
   if(!tags.ok)throw Error('Model discovery returned HTTP '+tags.status+'.');
   const data=await tags.json();
   const models=(data.models||[]).filter(m=>!m.capabilities||m.capabilities.includes('decision'))
    .map(m=>({name:m.name,size:Number(m.size)||0}));
   return {protocol:'systemone',models};
  }

  // Both protocols can expose /v1/models. The adapter identity in /health
  // distinguishes OpenJEV's classifier and identifies its currently loaded model.
  const list=await get('/v1/models');
  if(!list.ok&&list.status!==404)throw Error('Model discovery returned HTTP '+list.status+'.');
  const entries=list.ok?(await list.json()).data||[]:[];
  const models=entries.map(m=>({name:m.id,size:0}));
  const health=await get('/health');
  const info=health.ok?await health.json().catch(()=>null):null;
  const classifier=typeof info?.adapter==='string'&&info.adapter&&typeof info.base_model==='string';
  if(classifier){
   if(info.status!=='ready')throw Error('OpenJEV classifier is not ready.');
   return {protocol:'openjev-nli',activeModel:info.adapter,multiModel:list.ok,
    models:list.ok?models:[{name:info.adapter,size:0}]};
  }
  if(entries.some(m=>m.owned_by==='openjev')||(!list.ok&&health.ok))throw Error('OpenJEV classifier is not ready.');
  if(!list.ok)throw Error('No supported JEV API found.');
  return {protocol:'systemone',models};
 }
 async function status(requested){
  const selected=modelName(requested);
  if(!configured)return {available:false,ready:false,models:[],model:selected,defaultModel:model,port:null,provider:'jev',decisionVersion,message:'Configure the separate JEV port first.'};
  if(now()>=until){
   refresh??=discover().then(result=>{
    result.models=result.models.filter(m=>typeof m.name==='string'&&m.name.length>0&&m.name.length<=100).slice(0,100);
    discovery=result;
    error='';
   }).catch(e=>{
    discovery={models:[],protocol:'systemone'};
    error='JEV port '+selectedPort+': '+(e.message==='fetch failed'?'cannot reach the service.':e.name==='TimeoutError'?'service discovery timed out.':String(e.message).slice(0,100));
   }).finally(()=>{until=now()+5000;refresh=null;});
   await refresh;
  }
  const {models,protocol,activeModel,multiModel}=discovery;
  let match=models.find(m=>m.name===selected||m.name===selected+':latest');
  if(!match&&protocol==='openjev-nli'&&selected===model)match=models.find(m=>m.name===activeModel);
  const available=Boolean(match);
  return {available,ready:available,models:models.map(m=>({...m})),model:match?.name||selected,defaultModel:activeModel||model,port:selectedPort,provider:'jev',protocol,multiModel,decisionVersion,message:error||(!available?'Select an installed decision model.':protocol==='openjev-nli'?'OpenJEV classifier ready.':'JEV service connected; decision support is checked on the next request.')};
 }
 async function plan(input,signal){
  const info=await status(modelName(input.model)),selected=info.model,request=decisionRequest(input,selected);
  if(!info.available)throw fail(503,info.message);
  if(busy)throw fail(429,'JEV is already deciding.',500);
  busy=true;const controller=new AbortController(),cancel=()=>controller.abort(),started=now();
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  const timer=setTimeout(cancel,timeoutMs);
  try{
   const nli=info.protocol==='openjev-nli',body=nli?classificationRequest(request.summary,request.offered):request.body;
   if(nli&&info.multiModel)body.model=selected;
   const response=await fetchImpl(base+(nli?'/classify':'/v1/systemone'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   if(!response.ok)throw fail(503,response.status===404?'JEV decision endpoint or model is missing. Check the service port and model.':'JEV rejected the decision. Select a compatible decision model.');
   const result=await response.json(),answer=nli?{type:'choice',choice:classificationChoice(result,body,request.offered)}:result.answers?.strategy;
   if(answer?.type!=='choice'||typeof answer.choice!=='string'||!request.offered.some(c=>c.name===answer.choice))throw fail(503,'JEV returned an invalid or unavailable strategy.');
   return {plan:planFor(answer.choice,request.summary),model:selected,provider:'jev',protocol:info.protocol,decisionVersion,latencyMs:Math.max(0,now()-started)};
  }catch(e){if(signal.aborted)throw fail(499,'JEV decision cancelled.');if(e.status)throw e;throw fail(503,controller.signal.aborted?'JEV exceeded the five-second deadline.':'JEV connection failed. Keeping fallback tactics.');}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);busy=false;}
 }
 return {status,plan,warmup:async()=>{}};
}
module.exports={...createCommander(),createCommander,decisionRequest,classificationRequest,classificationChoice,validPort};
