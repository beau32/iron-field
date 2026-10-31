'use strict';
// Jev/System One decision API. Keep its endpoint separate from Ollama chat.
const {summarize,candidates,planFor,decisionVersion}=require('./commander.cjs');
const fail=(status,message,retryAfterMs=5000)=>Object.assign(new Error(message),{status,retryAfterMs});
function validPort(value){const port=Number(value);if(!Number.isInteger(port)||port<1||port>65535)throw fail(400,'Enter a JEV port from 1 to 65535.');return port;}
function decisionRequest(input,model){
 const summary=summarize(input),offered=candidates(summary);
 // The choice protocol requires at least two alternatives. Holding the base is
 // always feasible when no specialist operation is warranted.
 if(offered.length===1)offered.push({name:'defend',why:'hold the base and assemble a stronger force'});
 return {summary,offered,body:{model,state:JSON.stringify(summary),questions:{strategy:{type:'choice',instructions:'Command our army to destroy the enemy HQ. Choose the best feasible operation. Protect a threatened base, recover broken income if ore remains, fill unmet counters including queues, and exploit an army advantage. Continue productive attacks; replace stalled or losing plans. Consider credits and completed producers.',criteria:Object.fromEntries(offered.map(c=>[c.name,c.why]))}}}};
}
function createCommander({port=process.env.JEV_PORT,model=process.env.JEV_MODEL||'nimble',fetchImpl=fetch,now=Date.now,timeoutMs=5000}={}){
 const configured=port!==undefined&&port!==''&&port!==null,selectedPort=configured?validPort(port):null;
 const base=configured?'http://127.0.0.1:'+selectedPort:null;
 let installed=[],until=0,busy=false,error='';
 const modelName=value=>{const name=value||model;if(typeof name!=='string'||!name.trim()||name.length>100)throw fail(400,'Invalid JEV model.');return name;};
 async function status(requested){
  const selected=modelName(requested);
  if(!configured)return {available:false,ready:false,models:[],model:selected,defaultModel:model,port:null,provider:'jev',decisionVersion,message:'Configure the separate JEV port first.'};
  if(now()>=until){
   try{
    let response=await fetchImpl(base+'/api/tags',{signal:AbortSignal.timeout(3000)}),data;
    if(response.status===404){response=await fetchImpl(base+'/v1/models',{signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error();data=await response.json();installed=(data.data||[]).map(m=>({name:m.id,size:0}));}
    else{if(!response.ok)throw Error();data=await response.json();installed=(data.models||[]).filter(m=>!m.capabilities||m.capabilities.includes('decision')).map(m=>({name:m.name,size:Number(m.size)||0}));}
    installed=installed.filter(m=>typeof m.name==='string'&&m.name.length>0&&m.name.length<=100).slice(0,100);error='';
   }catch{installed=[];error='JEV service is unavailable on port '+selectedPort+'.';}
   until=now()+5000;
  }
  const match=installed.find(m=>m.name===selected||m.name===selected+':latest'),available=Boolean(match);
  return {available,ready:available,models:installed.map(m=>({...m})),model:match?.name||selected,defaultModel:model,port:selectedPort,provider:'jev',decisionVersion,message:error||(!available?'Select an installed decision model.':'JEV service connected; decision support is checked on the next request.')};
 }
 async function plan(input,signal){
  const info=await status(modelName(input.model)),selected=info.model,request=decisionRequest(input,selected);
  if(!info.available)throw fail(503,info.message);
  if(busy)throw fail(429,'JEV is already deciding.',500);
  busy=true;const controller=new AbortController(),cancel=()=>controller.abort(),started=now();
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  const timer=setTimeout(cancel,timeoutMs);
  try{
   const response=await fetchImpl(base+'/v1/systemone',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.body),signal:controller.signal});
   if(!response.ok)throw fail(503,response.status===404?'JEV decision endpoint or model is missing. Check the service port and model.':'JEV rejected the decision. Select a compatible decision model.');
   const result=await response.json(),answer=result.answers?.strategy;
   if(answer?.type!=='choice'||typeof answer.choice!=='string'||!request.offered.some(c=>c.name===answer.choice))throw fail(503,'JEV returned an invalid or unavailable strategy.');
   return {plan:planFor(answer.choice,request.summary),model:selected,provider:'jev',decisionVersion,latencyMs:Math.max(0,now()-started)};
  }catch(e){if(signal.aborted)throw fail(499,'JEV decision cancelled.');if(e.status)throw e;throw fail(503,controller.signal.aborted?'JEV exceeded the five-second deadline.':'JEV connection failed. Keeping fallback tactics.');}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);busy=false;}
 }
 return {status,plan,warmup:async()=>{}};
}
module.exports={...createCommander(),createCommander,decisionRequest,validPort};
