'use strict';
// Fixed Decisions endpoint; credentials and prompts are never supplied by remote players.
const {summarize,choices}=require('./commander.cjs');
const {validPlan}=require('./opponent.js');
const definitions=require('./data.js');
const MODEL='gpt-6-luna';
const descriptions={
 balanced:'Maintain a mixed army and attack exposed economy.',
 rush:'Use battle tanks for early pressure on production.',
 defend:'Protect the base with guards and turrets against immediate pressure.',
 economy:'Restore miners and income, then expand the army.',
 air:'Invest in an airfield and gunships to bypass terrain and hit production.',
 'anti-air':'Build rocket carriers and missile batteries against aircraft.',
 siege:'Build artillery to outrange static defenses.',
 'anti-armor':'Build tank destroyers against heavy ground armor.',
 naval:'Build a shipyard and missile frigates to control waterways and bombard shore targets.'
};
const fail=(status,message,retryAfterMs=30000)=>Object.assign(new Error(message),{status,retryAfterMs});
function createCommander({fetchImpl=fetch,initialKey=process.env.OPENAI_API_KEY||'',timeoutMs=5000,now=Date.now}={}){
 let key=initialKey.trim(),busy=false,nextAllowed=0;
 function setKey(value){
  if(typeof value!=='string'||value.length>512||/[\s\x00-\x1f\x7f]/.test(value)||!value.trim())throw fail(400,'Enter a valid API key without spaces.');
  key=value; // Never log, return or persist this value.
 }
 function clearKey(){key='';}
 function status(){return {available:Boolean(key),ready:Boolean(key),model:MODEL,provider:'openai',message:key?'API key configured; access is checked on the next decision.':'Supply an OpenAI API key in the connector setup page.'};}
 async function plan(input,signal){
  const summary=summarize(input);
  if(!key)throw fail(503,'Open the connector API key setup page first.');
  if(busy||now()<nextAllowed)throw fail(429,'OpenAI decision cooldown; keeping the current strategy.',Math.max(2000,nextAllowed-now()));
  busy=true;nextAllowed=now()+30000;
  const controller=new AbortController(),cancel=()=>controller.abort();
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  const timer=setTimeout(cancel,timeoutMs);
  try{
   const options=Object.keys(choices).filter(name=>name!=='naval'||summary.context.water);
   const response=await fetchImpl('https://api.openai.com/v1/decisions',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},signal:controller.signal,
    body:JSON.stringify({model:MODEL,input:JSON.stringify(summary),questions:[{
     type:'choice',name:'strategy',
     instructions:'Choose the best next high-level operation for our computer army in a fictional RTS game. own is our army; opponent is the human. Credits, production buildings, miners, power and visible base pressure matter. Recover income if miners or refinery are lost; defend immediate threats; otherwise exploit enemy weaknesses. Avoid expensive technology without income or prerequisites. Use naval only when water exists. Ordinary local tactics handle movement, combat and recovery. Choose one operation.',
     choices:options.map(value=>({value,description:descriptions[value]}))
    }]})
   });
   if(!response.ok){
    if([401,403].includes(response.status))throw fail(503,'OpenAI rejected the key or Decisions access. Check your key and project permissions.');
    if(response.status===429)throw fail(503,'OpenAI quota or rate limit reached. Check API billing and limits.',60000);
    throw fail(503,'OpenAI Decisions is unavailable. Keeping fallback tactics.');
   }
   const data=await response.json();
   const answer=Array.isArray(data.answers)?data.answers.find(a=>a?.name==='strategy'):null;
   if(answer?.type==='refusal')throw fail(503,'OpenAI declined this decision. Keeping fallback tactics.');
   if(answer?.type!=='choice'||typeof answer.choice!=='string'||!options.includes(answer.choice))throw fail(503,'OpenAI returned an invalid strategy choice.');
   const plan=validPlan(choices[answer.choice],Object.keys(definitions.units),Object.keys(definitions.buildings).filter(k=>definitions.buildings[k].cost));
   if(!plan)throw fail(503,'OpenAI returned an invalid plan.');
   return {plan,model:MODEL,provider:'openai'};
  }catch(error){
   if(signal.aborted)throw fail(499,'Decision cancelled.');
   if(error.status)throw error;
   throw fail(503,controller.signal.aborted?'OpenAI missed the five-second deadline.':'OpenAI connection failed. Keeping fallback tactics.');
  }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);busy=false;}
 }
 return {status,plan,setKey,clearKey,warmup:async()=>{}};
}
module.exports={...createCommander(),createCommander};
