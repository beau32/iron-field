'use strict';
// Compare the models on exactly the same saved game states and legal choices.
// The compact evidence and classifier hypotheses match the adapter's training format.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const commander=require('../commander.cjs'),jev=require('../jev-commander.cjs');
const here=__dirname, useLookahead=process.argv.includes('--lookahead');
const argument=(flag,fallback)=>{const i=process.argv.indexOf(flag);return i<0?fallback:process.argv[i+1];};
const file=argument('--output',path.join(here,useLookahead?'shared-model-lookahead-comparison.json':'shared-model-comparison.json'));
const adapterPath=argument('--adapter','C:/Users/Public/openjev/outputs/qwen35-4b-rts-recommendation-nli/adapter-final');
const model9='qwen3.5:9b-rts-synthetic-full',model4=path.basename(adapterPath);
function input(summary,{lookahead=false}={}){
 const state=commander.summarize(summary),offered=commander.offeredOperations(state,{lookahead});
 const original=commander.promptFor(state,offered,{lookahead:false}),marker='Return the selected name as a JSON string.';
 const [head,rest]=original.split(marker);if(!rest)throw Error('Commander prompt format changed');
 const baseFacts=rest.split('\nChoose only:')[0].trim().split('Visible contacts')[0].trim();
 const forecast=lookahead?commander.strategicLookahead(state,offered):[],risks=commander.strategicTradeoffs(forecast);
 const facts=baseFacts+(lookahead?' Approximate two-step worst-case ranking (simplified, not a prediction): '+forecast.map(x=>x.name).join(' > ')+'.'+(risks?' Possible tradeoffs, not predictions: '+risks+'.':''):'');
 if(!facts.startsWith('Income ')||!facts.includes('Enemy miners/refineries'))throw Error('Unexpected state evidence');
 const names=offered.map(o=>o.name),prompt=head+marker+'\n'+facts+'\nChoose only: '+names.join(',')+'.';
 return {facts,names,offered,prompt,jevBody:{model:model4,premise:facts,choices:names.map(n=>`The synthetic game heuristic recommends this operation: ${n}.`)}};
}
function prepare({lookahead=useLookahead}={}){let cases=[],seen=new Set();for(const source of ['lookahead-v10-engine','jev4b-engine-results']){
 const data=JSON.parse(fs.readFileSync(path.join(here,source+'.json')));
 for(const run of data.runs)for(const step of run.trace){const x=input(step.summary,{lookahead}),key=crypto.createHash('sha256').update(JSON.stringify([x.facts,x.names])).digest('hex');if(seen.has(key))continue;seen.add(key);cases.push({id:key.slice(0,12),source,seed:run.seed,sourceLookahead:run.lookahead,seconds:step.startSeconds,...x});}
 }return {createdAt:new Date().toISOString(),lookahead,method:`Fixed real-engine states; identical compact facts and ordered operations; no flank variants; lookahead ${lookahead?'on':'off'}. Decisions are not scored as correct or incorrect.`,cases};}
async function run(provider,port){let data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):prepare();
 if(provider==='jev'){const health=await fetch(`http://127.0.0.1:${port}/health`).then(r=>r.json());if(health.status!=='ready'||health.adapter!==model4||health.base_model!=='Qwen/Qwen3.5-4B')throw Error('Wrong JEV model');data.jevService=health;data.jevAdapterDigest=crypto.createHash('sha256').update(fs.readFileSync(path.join(adapterPath,'adapter_model.safetensors'))).digest('hex');data.jevPrecision='NF4 4-bit base, BF16 compute';}
 else {const tags=await fetch('http://127.0.0.1:11434/api/tags').then(r=>r.json());const found=tags.models.find(m=>m.name===model9);if(!found)throw Error('Missing 9B model');data.ollamaDigest=found.digest;}
 for(let i=0;i<data.cases.length;i++){const c=data.cases[i];if(c[provider])continue;const start=Date.now();let choice,scores;
 if(provider==='ollama'){const r=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),body:JSON.stringify({model:model9,stream:false,think:false,format:{type:'string',enum:c.names},keep_alive:'30m',options:{temperature:0,num_predict:24,num_ctx:1536,num_thread:4},messages:[{role:'user',content:c.prompt}]})});const body=await r.json();if(!r.ok)throw Error(body.error);choice=JSON.parse(body.message.content);if(!c.names.includes(choice))throw Error('Invalid Ollama choice');}
 else {const r=await fetch(`http://127.0.0.1:${port}/classify`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify(c.jevBody)});const body=await r.json();if(!r.ok)throw Error(JSON.stringify(body));choice=jev.classificationChoice(body,c.jevBody,c.offered);scores=body.choices;}
 c[provider]={choice,latencyMs:Date.now()-start,...(scores?{scores}:{})};fs.writeFileSync(file,JSON.stringify(data,null,2));console.log(`${provider} ${i+1}/${data.cases.length}: ${choice} (${c[provider].latencyMs} ms)`);
 }console.log('Saved',file);
}
if(require.main===module){const provider=process.argv[2];if(!['ollama','jev','prepare'].includes(provider))throw Error('Use prepare, ollama, or jev');if(provider==='prepare'){if(fs.existsSync(file))throw Error('Refusing to overwrite previous comparison');const d=prepare();fs.writeFileSync(file,JSON.stringify(d,null,2));console.log('Prepared',d.cases.length,'fixed states');}else run(provider,Number(process.argv[3]||18011)).catch(e=>{console.error(e);process.exitCode=1});}
module.exports={input,prepare};
