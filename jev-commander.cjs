'use strict';
// Jev/System One decision API. Keep its endpoint separate from Ollama chat.
const {summarize,candidates,planFor,assess,decisionVersion}=require('./commander.cjs');
const fail=(status,message,retryAfterMs=5000)=>Object.assign(new Error(message),{status,retryAfterMs});
function validPort(value){const port=Number(value);if(!Number.isInteger(port)||port<1||port>65535)throw fail(400,'Enter a JEV port from 1 to 65535.');return port;}
function decisionRequest(input,model){
 const summary=summarize(input),offered=candidates(summary);
 // The choice protocol requires at least two alternatives. Holding the base is
 // always feasible when no specialist operation is warranted.
 if(offered.length===1)offered.push({name:'defend',why:'hold the base and assemble a stronger force'});
 return {summary,offered,body:{model,state:JSON.stringify(summary),questions:{strategy:{type:'choice',instructions:'Command our army to destroy the enemy HQ. Choose the best feasible operation. Protect a threatened base, recover broken income if ore remains, fill unmet counters including queues, and exploit an army advantage. Continue productive attacks; replace stalled or losing plans. Consider credits and completed producers.',criteria:Object.fromEntries(offered.map(c=>[c.name,c.why]))}}}};
}
function classificationRequest(summary,offered){
 const m=assess(summary),f=summary.feedback;
 const conditions={
  economy:'Ore remains available and our mining income needs recovery or expansion.',
  defend:'Our base is under threat, or our army is losing and needs to recover.',
  rush:'Our ground attack force is strong enough to pressure the enemy now.',
  'anti-air':'Enemy aircraft outnumber our anti-air counters, including queued counters.',
  'anti-armor':'The enemy has armored vehicles and our army lacks enough armor counters.',
  siege:'The enemy has multiple defensive structures and we need more long-range siege weapons.',
  air:'An air attack is feasible and can exploit weak enemy anti-air defenses.',
  naval:'Waterways are present and our fleet needs reinforcement.',
  balanced:'Our army can build a mixed force and attack exposed enemy economic targets.'
 };
 const premise=[
  `Our army has ${m.army} ground attackers, combat strength ${m.attackValue}, and ${summary.credits} credits. Enemy combat strength is ${m.enemyValue}.`,
  `Our HQ has ${summary.own.hqHealth}% health; enemy HQ has ${summary.opponent.hqHealth}%. ${summary.context.pressure} enemies threaten our base.`,
  `Ore remaining: ${summary.context.oreRemaining}. We have ${m.miners} miners including queues and ${summary.own.ready.refinery||0} completed refineries. Recent mining income: ${f.income}.`,
  `Enemy aircraft: ${m.air}; our anti-air including queues: ${m.aa}. Enemy armor: ${m.armor}; our armor counters: ${m.armorCounters}.`,
  `Enemy defensive structures: ${m.defenses}; our siege weapons: ${m.siege}. Enemy anti-air: ${m.enemyAA}. Waterways: ${summary.context.water?'present':'absent'}; our ships: ${m.ownShips}; enemy ships: ${m.ships}.`,
  `Recent losses cost ${f.lostValue}; enemy losses cost ${f.destroyedValue}. Previous operation ${f.operation||'none'} is ${f.stalled?'stalled':f.mode}.`,
  'Feasible operations after checking resources and technology: '+offered.map(c=>c.name+' ('+c.why+')').join('; ')+'.'
 ].join(' ');
 return {premise,choices:offered.map(c=>conditions[c.name])};
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
 let installed=[],until=0,busy=false,error='',protocol='systemone';
 const modelName=value=>{const name=value||model;if(typeof name!=='string'||!name.trim()||name.length>100)throw fail(400,'Invalid JEV model.');return name;};
 async function status(requested){
  const selected=modelName(requested);
  if(!configured)return {available:false,ready:false,models:[],model:selected,defaultModel:model,port:null,provider:'jev',decisionVersion,message:'Configure the separate JEV port first.'};
  if(now()>=until){
   try{
    const discoverySignal=AbortSignal.timeout(3000);
    let response=await fetchImpl(base+'/api/tags',{signal:discoverySignal}),data;protocol='systemone';
    if(response.status===404){
     response=await fetchImpl(base+'/v1/models',{signal:discoverySignal});
     if(response.status===404){
      response=await fetchImpl(base+'/health',{signal:discoverySignal});
      if(!response.ok)throw Error('No supported JEV API found.');data=await response.json();
      if(data.status!=='ready'||typeof data.adapter!=='string'||!data.adapter||typeof data.base_model!=='string')throw Error('OpenJEV classifier is not ready.');
      protocol='openjev-nli';installed=[{name:data.adapter,size:0}];
     }else{if(!response.ok)throw Error('Model discovery returned HTTP '+response.status+'.');data=await response.json();installed=(data.data||[]).map(m=>({name:m.id,size:0}));}
    }
    else{if(!response.ok)throw Error();data=await response.json();installed=(data.models||[]).filter(m=>!m.capabilities||m.capabilities.includes('decision')).map(m=>({name:m.name,size:Number(m.size)||0}));}
    installed=installed.filter(m=>typeof m.name==='string'&&m.name.length>0&&m.name.length<=100).slice(0,100);error='';
   }catch(e){installed=[];error='JEV port '+selectedPort+': '+(e.message==='fetch failed'?'cannot reach the service.':e.name==='TimeoutError'?'service discovery timed out.':String(e.message).slice(0,100));}
   until=now()+5000;
  }
  const match=installed.find(m=>m.name===selected||m.name===selected+':latest')||(protocol==='openjev-nli'&&(!requested||selected===model)?installed[0]:null),available=Boolean(match);
  return {available,ready:available,models:installed.map(m=>({...m})),model:match?.name||selected,defaultModel:protocol==='openjev-nli'?installed[0]?.name:model,port:selectedPort,provider:'jev',protocol,decisionVersion,message:error||(!available?'Select an installed decision model.':protocol==='openjev-nli'?'OpenJEV classifier ready.':'JEV service connected; decision support is checked on the next request.')};
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
