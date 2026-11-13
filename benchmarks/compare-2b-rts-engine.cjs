'use strict';
// Isolated side-by-side test against the same scripted opponent. No game server writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),runner=require('./full-engine-benchmark.cjs');
const models=['qwen35-2b-openjev','qwen35-2b-rts-lookahead'];
async function main(){const args=process.argv.slice(2),get=(k,v)=>{const i=args.indexOf(k);return i<0?v:args[i+1];},port=Number(get('--port','18012')),output=path.resolve(get('--output',path.join(__dirname,'compare-2b-rts-engine.json'))),maps=get('--maps','classic,river,crossroads').split(',');
 if(fs.existsSync(output))throw Error('Output exists; refusing to overwrite');
 const list=await fetch(`http://127.0.0.1:${port}/v1/models`).then(r=>r.json());if(models.some(m=>!list.data.some(x=>x.id===m)))throw Error('Required models unavailable');
 const root=path.resolve(__dirname,'..'),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
 const out={createdAt:new Date().toISOString(),method:'Same current game engine and scripted opponent, same maps/seed and compact training-format JEV choices, lookahead enabled, decisions every 30 simulated seconds; simulation pauses during inference.',limitations:['One seed and one scripted opponent per map; not a head-to-head comparison or general win rate.','Normal solo AI assistance is enabled equally for both models.','The compact benchmark prompt differs from the live game JEV prompt.','Connector/network latency and five-second live fallback are not simulated.','Different decisions lead to different states; outcome differences do not establish causality.'],sourceHashes:Object.fromEntries(['game.js','commander.cjs','jev-commander.cjs','data.js','map.js','opponent.js'].map(n=>[n,sha(n)])),runs:[]};
 const server=runner.serve();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await runner.openBrowser();const url=`http://127.0.0.1:${server.address().port}/?benchmark=1`;
  for(const model of models){
   const warm=await fetch(`http://127.0.0.1:${port}/classify`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({model,premise:'Our refinery and miners are working.',choices:['Income is working.']})});if(!warm.ok)throw Error('Model warmup failed: '+await warm.text());
   for(const map of maps){const config={provider:'jev',model,jevPort:port,map,seed:1,lookahead:true,shared:true,seconds:600,window:30};const run=await runner.match(browser,url,config);out.runs.push(run);fs.writeFileSync(output,JSON.stringify(out,null,2));console.log('RESULT',model,map,run.winner||'timeout',Math.round(run.elapsed));}
  }
 }finally{await runner.closeBrowser(browser);server.close();}console.log('Saved',output);
}
main().catch(e=>{console.error(e);process.exitCode=1});
