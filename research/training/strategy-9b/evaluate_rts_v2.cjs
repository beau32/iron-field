'use strict';
// In-family synthetic examples and the earlier separately authored scenarios.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=__dirname, old=path.join(root,'..','qwen35-9b-rts');
const game=process.argv.slice(2).find(x=>!x.startsWith('--'))||'C:/Users/bogmk/Documents/Codex/2026-10-05/i-x20/outputs/iron-field';
const c=require(path.join(game,'commander.cjs')), cases=require(path.join(old,'rts_benchmark_cases.cjs'));
const full=process.argv.includes('--full');
const models=['iron-field-qwen35:9b-base-q8-control',full?'qwen3.5:9b-rts-synthetic-full':'iron-field-qwen35:9b-rts-synthetic-v2'];
const read=name=>fs.readFileSync(path.join(root,name),'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const training=read('train_combined.jsonl'), validation=read('validation_synthetic.jsonl');
const trainHashes=new Set(training.map(x=>hash(x.messages[0].content)));
if(validation.some(x=>trainHashes.has(hash(x.messages[0].content))))throw Error('Exact training/validation overlap');
let perFamily={};
const generated=validation.filter(x=>{let n=perFamily[x.family]||0;perFamily[x.family]=n+1;return n<5;}).map((x,i)=>{
 const prompt=x.messages[0].content, match=prompt.match(/Choose only: ([^.\n]+)\./);
 if(!match)throw Error('Missing candidate list');
 return {id:'heldout-'+i,family:x.family,prompt,allowed:match[1].split(','),expected:JSON.parse(x.messages[1].content),kind:'generated'};
});
const suffix='\nPlain names use game tactics; @left or @right chooses a flanking approach relative to our force facing the target.';
const benchmark=cases.map(t=>{let state=c.summarize(t.state),options=c.modelOptions(state),allowed=options.map(o=>o.name),plans=options.map(o=>c.modelPlanFor(o.name,state));
 const acceptable=p=>t.expected.includes(p.operation)&&(!t.requiredFocus||p.focus===t.requiredFocus);
 return {id:t.id,family:t.title,prompt:c.promptFor(state,options)+suffix,allowed,kind:'benchmark',state,expected:t.expected,requiredFocus:t.requiredFocus||null,discriminating:plans.some(p=>!acceptable(p))};
});
const tests=[...generated,...benchmark];
if(benchmark.some(t=>trainHashes.has(hash(t.prompt))))throw Error('Benchmark overlaps training');
const output=path.join(root,full?'evaluation_full_results.json':'evaluation_results.json'),report=path.join(root,full?'evaluation_full_report.md':'evaluation_report.md');
let result={version:1,method:'Identical full game prompts and structured choice schema, warm models, one deterministic response per case. Synthetic validation is held out by exact prompt and seed but uses the same templates and rules. Benchmark rubric is separately authored but synthetic.',testCount:tests.length,generatedCount:generated.length,benchmarkCount:benchmark.length,cases:tests.map(({prompt,state,...x})=>({...x,promptSha256:hash(prompt)})),models:{}};
function save(){fs.writeFileSync(output,JSON.stringify(result,null,2))}
async function api(route,body,timeout){const r=await fetch('http://127.0.0.1:11434/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});let data=await r.json();if(!r.ok)throw Error(data.error||`HTTP ${r.status}`);return data;}
async function run(){
 const tags=await fetch('http://127.0.0.1:11434/api/tags').then(r=>r.json());
 for(const model of models){
  const tag=tags.models.find(x=>x.name===model);if(!tag)throw Error('Missing model '+model);
  result.models[model]={digest:tag.digest,responses:[]};
  try{
   console.log('Warming',model);
   const send=(t,timeout)=>api('chat',{model,stream:false,think:false,format:{type:'string',enum:t.allowed},keep_alive:'5m',options:{temperature:0,num_predict:24,num_ctx:1536,num_thread:4},messages:[{role:'user',content:t.prompt}]},timeout);
   await send(tests[0],90000);
   for(const t of tests){const start=Date.now();let row={id:t.id,kind:t.kind,family:t.family};try{
     const body=await send(t,5000), choice=JSON.parse(body.message.content);
     if(!t.allowed.includes(choice))throw Error('Choice outside candidate set');
     const plan=t.kind==='benchmark'?c.modelPlanFor(choice,t.state):null;
     row={...row,valid:true,choice,correct:t.kind==='generated'?choice===t.expected:(t.expected.includes(plan.operation)&&(!t.requiredFocus||t.requiredFocus===plan.focus)),wallMs:Date.now()-start,modelMs:Math.round((body.total_duration||0)/1e6)};
    }catch(e){row.valid=false;row.error=e.name==='TimeoutError'?'Five-second deadline exceeded':String(e.message);row.wallMs=Date.now()-start;}
    result.models[model].responses.push(row);save();console.log(model,t.id,row.valid?`${row.choice} ${row.correct?'ok':'miss'} ${row.wallMs}ms`:row.error);
   }
  }finally{try{await api('generate',{model,keep_alive:0},10000)}catch{}}
 }
 result.summary={};
 for(const model of models){const rows=result.models[model].responses,gen=rows.filter(x=>x.kind==='generated'),bench=rows.filter(x=>x.kind==='benchmark'),diag=bench.filter(x=>tests.find(t=>t.id===x.id).discriminating),times=rows.filter(x=>x.valid).map(x=>x.wallMs).sort((a,b)=>a-b);
  result.summary[model]={valid:rows.filter(x=>x.valid).length,total:rows.length,syntheticCorrect:gen.filter(x=>x.correct).length,syntheticTotal:gen.length,benchmarkCorrect:bench.filter(x=>x.correct).length,benchmarkTotal:bench.length,diagnosticCorrect:diag.filter(x=>x.correct).length,diagnosticTotal:diag.length,medianMs:times[Math.floor((times.length-1)/2)]};
 }
 result.completedAt=new Date().toISOString();save();
 const [a,b]=models.map(m=>result.summary[m]);
 const lines=['# RTS model evaluation','',result.method,'','Synthetic labels reflect hand-written heuristics and may be wrong; these results are not match win rates. Both models use the same base and Q8 quantization.','', '| Measure | Base Q8 | Synthetic-trained Q8 |','|---|---:|---:|',`| Valid responses | ${a.valid}/${a.total} | ${b.valid}/${b.total} |`,`| Generated validation label agreement | ${a.syntheticCorrect}/${a.syntheticTotal} | ${b.syntheticCorrect}/${b.syntheticTotal} |`,`| Existing benchmark acceptable | ${a.benchmarkCorrect}/${a.benchmarkTotal} | ${b.benchmarkCorrect}/${b.benchmarkTotal} |`,`| Existing discriminating cases acceptable | ${a.diagnosticCorrect}/${a.diagnosticTotal} | ${b.diagnosticCorrect}/${b.diagnosticTotal} |`,`| Median warm wall time | ${a.medianMs} ms | ${b.medianMs} ms |`,'','Training and validation differ in generated random state, but share scenario templates and labeling rules; the earlier benchmark is also synthetic and was known when designing training. Evaluate against held-out human games and AI matches before claiming stronger play.','', `Per-case responses and prompt hashes are in ${path.basename(output)}.`];
 fs.writeFileSync(report,lines.join('\n')+'\n');console.log('Saved',report);
}
run().catch(e=>{save();console.error(e);process.exitCode=1;});
