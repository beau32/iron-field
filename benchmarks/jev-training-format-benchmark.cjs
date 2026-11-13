'use strict';
// Controlled synthetic validation, using the format the 4B adapter was trained on.
// This deliberately differs from live game JEV prompts and is not a game benchmark.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),jev=require('../jev-commander.cjs');
const dataRoot='C:/Users/Public/openjev/outputs/qwen35-9b-rts-v2-synthetic',here=__dirname,model='adapter-final',port=Number(process.argv[2]||18011);
const previous=JSON.parse(fs.readFileSync(path.join(dataRoot,'evaluation_full_results.json'),'utf8'));
const rows=fs.readFileSync(path.join(dataRoot,'validation_synthetic.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse),counts={};
const selected=rows.filter(x=>{const n=counts[x.family]||0;counts[x.family]=n+1;return n<5;});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),baseKey=Object.keys(previous.models).find(k=>k.endsWith(':9b-rts-synthetic-full'));
if(!baseKey||selected.length!==95)throw Error('The historical 9B comparison or validation sample is missing.');
const inputs=selected.map((row,i)=>{
 const prompt=row.messages[0].content,prior=previous.cases[i];if(prior.id!==`heldout-${i}`||prior.promptSha256!==hash(prompt))throw Error('Validation sample does not match the prior 9B benchmark.');
 const marker='Return the selected name as a JSON string.',state=prompt.split(marker)[1];if(!state)throw Error('Missing state');
 const premise=state.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).filter((x,i,a)=>{const stop=a.findIndex(s=>s.startsWith('Approximate two-step worst-case ranking')||s.startsWith('Choose only:')||s.startsWith('Plain names use'));return stop<0||i<stop;}).join(' ');
 const offered=prior.allowed.map(name=>({name})),choices=offered.map(x=>`The synthetic game heuristic recommends this operation: ${x.name}.`),expected=JSON.parse(row.messages[1].content);
 return {id:prior.id,family:row.family,premise,choices,offered,expected};
});
async function run(){const health=await fetch(`http://127.0.0.1:${port}/health`).then(r=>r.json());if(health.status!=='ready'||health.adapter!==model)throw Error('Wrong JEV adapter active');let results=[];
 for(const test of inputs){const body={model,premise:test.premise,choices:test.choices},start=Date.now(),response=await fetch(`http://127.0.0.1:${port}/classify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)}),data=await response.json();if(!response.ok)throw Error(data.error||'Classification failed');
  const choice=jev.classificationChoice(data,body,test.offered),old=previous.models[baseKey].responses.find(x=>x.id===test.id);results.push({id:test.id,family:test.family,expected:test.expected,choice,correct:choice===test.expected,baselineChoice:old?.choice,baselineCorrect:old?.choice===test.expected,latencyMs:Date.now()-start,request:body,scores:data.choices});
  fs.writeFileSync(path.join(here,'jev4b-training-format-results.partial.json'),JSON.stringify({status:'in-progress',results},null,2));
  console.log(`${test.id} ${test.family}: ${choice===test.expected?'match':'miss'} ${Date.now()-start}ms`);
 }
 const times=results.map(x=>x.latencyMs).sort((a,b)=>a-b),out={createdAt:new Date().toISOString(),model,baseModel:health.base_model,precision:'NF4 4-bit with BF16 compute',method:'Same 95 previously evaluated held-out synthetic prompts, candidate names in the adapter training format; entailment minus contradiction ranking.',limitations:['Not the live game prompt or candidate wording.','Held-out generated prompts share scenario families and heuristic labels with training; not evidence of strategic strength or game win rate.','The 9B reference is from a prior Q8 generative evaluation; providers, precision, action spaces and timing differ.','Candidate lists include flank labels for synthetic comparison, although current JEV game integration does not offer flanking.'],summary:{total:results.length,jevCorrect:results.filter(x=>x.correct).length,qwen9bCorrect:results.filter(x=>x.baselineCorrect).length,medianMs:times[Math.floor((times.length-1)/2)],overFiveSeconds:times.filter(x=>x>5000).length},results};
 const json=path.join(here,'jev4b-training-format-results.json'),md=path.join(here,'jev4b-training-format-results.md');fs.writeFileSync(json,JSON.stringify(out,null,2));fs.writeFileSync(md,['# JEV 4B training-format synthetic scenario benchmark','',out.method,'',...out.limitations.map(x=>'- '+x),'',`4B agreement: **${out.summary.jevCorrect}/${out.summary.total}**. Prior 9B agreement: **${out.summary.qwen9bCorrect}/${out.summary.total}**.`,`4B median local request: ${out.summary.medianMs} ms; ${out.summary.overFiveSeconds} above 5 seconds.`,'','Detailed requests, scores and labels are in `jev4b-training-format-results.json`.',''].join('\n'));fs.unlinkSync(path.join(here,'jev4b-training-format-results.partial.json'));console.log('Summary',JSON.stringify(out.summary));}
if(process.argv.includes('--check-only')){fs.writeFileSync(path.join(here,'jev-training-inputs-check.json'),JSON.stringify(inputs));console.log('Validated',inputs.length,'historical scenarios and exported inputs for token checks.');}
else run().catch(e=>{console.error(e);process.exitCode=1});
