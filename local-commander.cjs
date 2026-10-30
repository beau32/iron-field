'use strict';
// Relays bounded strategy jobs to a paired player's computer. Never contacts Ollama.
const crypto=require('node:crypto');
const {summarize}=require('./commander.cjs');
const {validPlan}=require('./opponent.js');
const definitions=require('./data.js');
function modelList(value){return Array.isArray(value)?value.filter(m=>m&&typeof m.name==='string'&&m.name.length>0&&m.name.length<=100).slice(0,100).map(m=>({name:m.name,size:Number.isFinite(m.size)&&m.size>=0?m.size:0})):[];}
const token=()=>crypto.randomBytes(24).toString('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status,retryAfterMs:5000});
const sessions=new Map(),workers=new Map(),codes=new Map(),limits=new Map();
function limit(ip){const now=Date.now(),v=limits.get(ip)||{at:now,count:0};if(now-v.at>60000){v.at=now;v.count=0;}if(++v.count>20)throw fail(429,'Too many pairing attempts. Try again in a minute.');limits.set(ip,v);}
function cleanup(){const now=Date.now();for(const [key,s]of sessions)if(now-s.touched>1800000){s.job?.reject(fail(503,'Local AI session expired.'));sessions.delete(key);workers.delete(s.workerToken);codes.delete(s.code);}for(const [ip,v]of limits)if(now-v.at>60000)limits.delete(ip);}
function session(req,worker=false){const key=(req.headers.authorization||'').replace(/^Bearer /,'');const s=(worker?workers:sessions).get(key);if(!s)throw fail(401,'Pair this computer again.');s.touched=Date.now();return s;}
async function handle(req,res,path,data,reply){
 cleanup();const now=Date.now();
 if(path==='session'){
  const provider=data.provider||'ollama';if(!['ollama','openai'].includes(provider))throw fail(400,'Unknown decision provider.');
  limit(req.socket.remoteAddress);if(sessions.size>=32)throw fail(503,'Local AI connections are full.');
  const clientToken=token(),code=crypto.randomBytes(6).toString('hex').toUpperCase();
  const s={clientToken,code,provider,touched:now,expires:now+300000,lastSeen:0,model:'',ready:false};sessions.set(clientToken,s);codes.set(code,s);
  reply(res,200,{clientToken,code,expires:s.expires,provider});return;
 }
 if(path==='connect'){
  limit(req.socket.remoteAddress);const s=codes.get(String(data.code||'').toUpperCase());
  if(!s||now>s.expires)throw fail(401,'Pairing code is invalid or expired.');
  if((data.provider||'ollama')!==s.provider)throw fail(400,'This pairing code is for '+s.provider+'. Start the matching connector.');
  codes.delete(s.code);s.workerToken=token();s.lastSeen=now;s.model=String(data.model||'').slice(0,100);s.ready=false;s.decisionVersion=data.decisionVersion===2?2:1;s.models=modelList(data.models);workers.set(s.workerToken,s);
  s.configPort=s.provider==='openai'&&Number.isInteger(data.configPort)&&data.configPort>0&&data.configPort<=65535?data.configPort:null;
  reply(res,200,{workerToken:s.workerToken});return;
 }
 const worker=path==='work'||path==='result',s=session(req,worker);
 if(path==='disconnect'){s.job?.reject(fail(503,'Local AI disconnected.'));sessions.delete(s.clientToken);workers.delete(s.workerToken);codes.delete(s.code);reply(res,200,{ok:true});return;}
 if(path==='status'){reply(res,200,{connected:now-s.lastSeen<15000,ready:s.ready,model:s.model,models:s.models||[],decisionVersion:s.decisionVersion||1,provider:s.provider,configPort:s.configPort,code:s.workerToken?null:s.code,expires:s.expires});return;}
 if(path==='work'){
  s.lastSeen=now;s.ready=Boolean(data.ready);s.decisionVersion=data.decisionVersion===2?2:1;s.models=modelList(data.models);s.model=String(data.model||s.model).slice(0,100);
  const job=s.job&&!s.job.dispatched?s.job:null;if(job)job.dispatched=true;
  reply(res,200,{job:job?{id:job.id,summary:job.summary,model:job.model}:null});return;
 }
 if(path==='result'){
  s.lastSeen=now;const job=s.job;if(!job||job.id!==data.id){reply(res,200,{ignored:true});return;}
  if(data.error)job.reject(Object.assign(fail(503,String(data.error).slice(0,160)),{retryAfterMs:Math.max(2000,Math.min(60000,Number(data.retryAfterMs)||5000))}));
  else {const plan=validPlan(data.plan,Object.keys(definitions.units),Object.keys(definitions.buildings).filter(k=>definitions.buildings[k].cost));if(!plan)job.reject(fail(503,'Local model returned an invalid plan.'));else job.resolve({plan,model:job.model||s.model,execution:'player',decisionVersion:s.decisionVersion});}
  reply(res,200,{ok:true});return;
 }
 if(path==='plan'){
  const summary=summarize(data);
  const model=s.provider==='ollama'?(data.model||s.model):undefined;
  if(s.provider==='ollama'&&model!==s.model&&!(s.models||[]).some(m=>m.name===model))throw fail(400,'Choose an installed model from this computer.');
  if(s.provider==='ollama'&&(typeof model!=='string'||model.length>100))throw fail(400,'Invalid Ollama model.');
  if(now-s.lastSeen>=15000)throw fail(503,'Start the local AI connector on this computer.');
  if(!s.ready&&(!model||model===s.model))throw fail(503,s.provider==='openai'?'Enter your key using API key setup below.':'Your computer is warming up Ollama.');
  if(s.job)throw fail(429,'Your computer is already planning.');
  const value=await new Promise((resolve,reject)=>{
   const job={id:token(),summary,model,dispatched:false};s.job=job;
   const finish=(fn,value)=>{clearTimeout(timer);res.off('close',cancel);if(s.job===job)s.job=null;fn(value);};
   const cancel=()=>job.reject(fail(499,'Planning cancelled.'));
   job.resolve=value=>finish(resolve,value);job.reject=error=>finish(reject,error);
   const timer=setTimeout(()=>job.reject(fail(503,'Your computer missed the planning deadline.')),5800);res.once('close',cancel);
  });
  if(!res.destroyed)reply(res,200,value);return;
 }
 throw fail(404,'Unknown local AI endpoint.');
}
module.exports={handle};
