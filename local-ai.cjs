'use strict';
// Outbound-only connector: Ollama remains bound to localhost on the player's computer.
const readline=require('node:readline/promises');
const args=process.argv.slice(2),argument=name=>args[args.indexOf(name)+1];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let keyUI;
async function main(){
 const input=readline.createInterface({input:process.stdin,output:process.stdout});
 const address=args.includes('--server')?argument('--server'):await input.question('Game server [http://192.168.4.142:8766]: ');
 const base=new URL(address||'http://192.168.4.142:8766');if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('Use an HTTP or HTTPS game server address.');
 const code=args.includes('--code')?argument('--code'):await input.question('Pairing code shown in the game: ');input.close();
 const provider=args.includes('--provider')?argument('--provider'):'ollama';
 if(!['ollama','openai'].includes(provider))throw Error('Choose provider ollama or openai.');
 let commander,preferred;
 if(provider==='openai'){
  commander=require('./openai-commander.cjs');preferred=commander.status().model;
  keyUI=await require('./local-key-ui.cjs').start(commander);
  console.log('OpenAI API key setup: '+keyUI.url);
 }else{
  const ollama=(process.env.OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/$/,'');
  const tags=await fetch(ollama+'/api/tags',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
  const models=(tags.models||[]).filter(m=>!m.capabilities||m.capabilities.includes('completion')).sort((a,b)=>a.size-b.size);
  preferred=process.env.OLLAMA_MODEL||models.find(m=>m.name==='qwen2.5:0.5b')?.name||models[0]?.name;
  if(!preferred)throw Error('No local model installed. Run: ollama pull qwen2.5:0.5b');
  process.env.OLLAMA_MODEL=preferred;process.env.OLLAMA_THINK='false';
  commander=require('./commander.cjs');
 }
 async function send(path,data,workerToken){
  const r=await fetch(new URL('/api/commander/local/'+path,base),{method:'POST',headers:{'Content-Type':'application/json',...(workerToken?{Authorization:'Bearer '+workerToken}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(7000)});
  const result=await r.json();if(!r.ok)throw Object.assign(Error(result.error||'Connection failed'),{status:r.status});return result;
 }
 const initialStatus=await commander.status();
 const {workerToken}=await send('connect',{decisionVersion:initialStatus.decisionVersion,models:initialStatus.models,code:String(code).trim(),model:preferred,provider,configPort:keyUI?.port});
 console.log('Paired with '+base.origin+'. Using '+(provider==='openai'?'OpenAI Decisions via this computer':'local Ollama')+' · '+preferred+'. Keep this connector running; Ctrl+C stops it.');
 let warming=false;
 while(true){
  try{
   const status=await commander.status(preferred);
   if(!status.ready&&!warming){warming=true;commander.warmup(preferred).finally(()=>warming=false);}
   const {job}=await send('work',{ready:status.ready,decisionVersion:status.decisionVersion,models:status.models,model:preferred,configPort:keyUI?.port},workerToken);
   if(job){
    if(provider==='ollama'&&job.model)preferred=job.model;
    const started=Date.now();let result;
    try{result=await commander.plan({...job.summary,...(provider==='ollama'?{model:preferred}:{})},new AbortController().signal);console.log('Local strategy completed in '+(Date.now()-started)+' ms.');}
    catch(error){result={error:error.message,retryAfterMs:error.retryAfterMs};console.log(error.message);}
    await send('result',{id:job.id,...result},workerToken);
   }
  }catch(error){if(error.status===401)throw error;console.log('Retrying: '+error.message);await sleep(2000);}
  await sleep(500);
 }
}
main().catch(error=>{keyUI?.server.close();console.error(error.message);process.exitCode=1;});
