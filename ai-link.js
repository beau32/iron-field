/* Player-local AI pairing and same-origin relay. No browser requests to localhost. */
(() => {
 const $=id=>document.getElementById(id);let mode='player',session=null,provider='ollama',opponent='balanced',jevEnabled=false,jevPort='';
 let modelChoices={server:'',player:''},models=[],modelRequestId=0;
 try{Object.assign(modelChoices,JSON.parse(localStorage.getItem('iron-field-ollama-models')||'{}'));}catch{}
 try{jevEnabled=localStorage.getItem('iron-field-jev-enabled')==='true';jevPort=localStorage.getItem('iron-field-jev-port')||'';Object.assign(modelChoices,JSON.parse(localStorage.getItem('iron-field-ai-models')||'{}'));}catch{}
 const choiceKey=()=>provider==='jev'?'jev-'+mode:mode;
 const modelChoice=()=>modelChoices[choiceKey()]||'';
 const serverPath=()=>'/api/commander/'+(provider==='jev'?'jev/':'');
 const panel=$('opponent-panel');
 try{panel.open=localStorage.getItem('iron-field-opponent-panel')==='open';}catch{}
 panel.addEventListener('toggle',event=>{
  if(event.target!==panel)return;
  try{localStorage.setItem('iron-field-opponent-panel',panel.open?'open':'closed');}catch{}
 });
 try{mode=localStorage.getItem('iron-field-ai-location')||'player';}catch{}
 if(!['player','server'].includes(mode))mode='player';
 const storageKey=()=>provider==='openai'?'iron-field-local-ai-openai':provider==='jev'?'iron-field-local-ai-jev':'iron-field-local-ai';
 const restore=()=>{try{session=JSON.parse(sessionStorage.getItem(storageKey())||'null');}catch{session=null;}};
 const save=()=>{try{sessionStorage.setItem(storageKey(),JSON.stringify(session));}catch{}};
 restore();
 async function api(path,data={},signal,token=session?.clientToken){
  return fetch('/api/commander/local/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal});
 }
 function changed(reason='connection'){window.dispatchEvent(new CustomEvent('field-ai-change',{detail:{reason}}));}
 function showModels(list,defaultModel='',message=''){
  models=Array.isArray(list)?list:[];
  const select=$('ollama-model'),choice=modelChoice();
  const options=[{name:'',label:defaultModel?'Automatic · '+defaultModel:'Automatic'}];
  for(const model of models)options.push({name:model.name,label:model.name+(model.size?' · '+(model.size/1e9).toFixed(2)+' GB':'')});
  if(choice&&!models.some(m=>m.name===choice))options.push({name:choice,label:choice+' · unavailable'});
  const signature=JSON.stringify(options);if(select.dataset.options!==signature){select.replaceChildren(...options.map(o=>new Option(o.label,o.name)));select.dataset.options=signature;}
  select.value=choice;select.disabled=!models.length;
  $('ollama-model-status').textContent=message||(choice&&!models.some(m=>m.name===choice)?'Selected model is unavailable. Choose an installed model.':models.length?'':provider==='jev'?'No decision models available.':'No completion models available.');
 }
 async function refreshModels(){
  const id=++modelRequestId,location=mode,service=provider;if(service==='openai')return;
  $('ollama-model-controls').hidden=false;$('ollama-model-refresh').disabled=true;
  showModels([], '', 'Loading installed models…');
  try{
   if(location==='player'&&!session?.clientToken){showModels([], '', 'Pair the local connector to list models on this computer.');return;}
   const response=location==='server'?await fetch(serverPath()+'status'+(modelChoice()?'?model='+encodeURIComponent(modelChoice()):''),{signal:AbortSignal.timeout(5000)}):await api('status',{},AbortSignal.timeout(5000));
   const result=await response.json();if(id!==modelRequestId||mode!==location||provider!==service)return;
   if(!response.ok)throw Error(result.error||'Could not load installed models.');
   if(service==='jev'&&location==='server'){$('jev-port').value=result.port||'';$('jev-port-status').textContent=result.port?'Server port · configured by the host.':'Host must configure JEV_PORT and restart the game server.';}
   showModels(location==='player'&&!result.connected?[]:result.models,result.defaultModel||result.model,location==='player'&&!result.connected?'Connect the local AI connector first.':location==='player'&&!result.models?.length?(service==='jev'?result.serviceMessage||'No JEV model reported. Check the connector terminal.':'Download and restart the updated AI connector to choose models.'):result.available===false?result.message:result.models?.length?'':result.message);
  }catch(e){if(id===modelRequestId&&mode===location&&provider===service)showModels([], '', e.message);}
  finally{if(id===modelRequestId)$('ollama-model-refresh').disabled=false;}
 }
 $('ollama-model-refresh').onclick=refreshModels;
 $('ollama-model').onchange=()=>{modelChoices[choiceKey()]=$('ollama-model').value;try{localStorage.setItem('iron-field-ai-models',JSON.stringify(modelChoices));}catch{}changed('model');void refreshModels();};
 function render(){
  $('jev-toggle-label').hidden=opponent!=='ollama';$('jev-enabled').checked=jevEnabled;
  $('jev-port-controls').hidden=provider!=='jev';$('jev-port').readOnly=mode==='server';$('jev-port').value=mode==='player'?jevPort:'';
  $('jev-port-status').textContent=mode==='server'?'Reading server configuration…':session?.port&&String(session.port)!==jevPort?'Port changed. Create a new pairing code.':'Port of the decision service on this computer.';
  $('ai-model-label').textContent=provider==='jev'?'JEV MODEL':'OLLAMA MODEL';
  $('ollama-model-controls').hidden=provider==='openai';if(provider!=='openai')void refreshModels();
  $('ai-location').value=mode;$('ai-pairing').hidden=mode!=='player';
  $('ai-jev-help').hidden=provider!=='jev';$('ai-ollama-help').hidden=provider!=='ollama';$('ai-openai-help').hidden=provider!=='openai';
  $('ai-cloud-notice').hidden=provider!=='openai';$('ai-server-info').hidden=mode!=='server';
  $('ai-server-info').textContent=provider==='openai'?'Game server mode requires OPENAI_API_KEY on the server. To enter a key in the UI, use This computer.':provider==='jev'?'Uses the JEV-compatible service on the game server’s configured port.':'Uses Ollama installed on the game server.';
  $('ai-key-setup').hidden=true;
  $('ai-pair-code').textContent=session?.code&&Date.now()<session.expires?session.code:'Not paired';
  $('ai-connection').textContent=provider==='openai'?'Start the OpenAI connector, then use API key setup.':provider==='jev'?'Start Start-JEV-AI.cmd and pair it below.':'Start the local Ollama connector and pair it below.';
 }
 $('jev-enabled').onchange=()=>{jevEnabled=$('jev-enabled').checked;try{localStorage.setItem('iron-field-jev-enabled',String(jevEnabled));}catch{}window.FieldLocalAI.setProvider(opponent);changed('provider');};
 $('jev-port').oninput=()=>{if(mode!=='player')return;jevPort=$('jev-port').value;try{localStorage.setItem('iron-field-jev-port',jevPort);}catch{}$('jev-port-status').textContent='Create a new pairing code to use this port.';changed('port');};
 $('ai-location').onchange=()=>{mode=$('ai-location').value;try{localStorage.setItem('iron-field-ai-location',mode);}catch{}render();changed();};
 $('ai-pair').onclick=async()=>{
  const pairingProvider=provider;
  $('ai-pair').disabled=true;
  try{
   if(pairingProvider==='jev'&&!$('jev-port').reportValidity())return;
   if(pairingProvider==='jev'&&(!Number.isInteger(Number(jevPort))||Number(jevPort)<1||Number(jevPort)>65535))throw Error('Enter the port of your JEV decision service first.');
   if(session?.clientToken)await api('disconnect');
   const response=await api('session',{provider:pairingProvider,...(pairingProvider==='jev'?{port:Number(jevPort)}:{})},AbortSignal.timeout(5000),null),result=await response.json();
   if(!response.ok)throw Error(result.error||'Could not create a pairing code.');
   if(provider!==pairingProvider){await api('disconnect',{},AbortSignal.timeout(3000),result.clientToken);return;}
   session=result;save();render();$('ai-connection').textContent='Enter this code in the connector on your computer (valid for 5 minutes).';changed();
  }catch(e){$('ai-connection').textContent=e.message;}
  finally{$('ai-pair').disabled=false;}
 };
 async function poll(){
  if(mode!=='player'||!session?.clientToken||document.hidden||$('ai-settings').hidden)return;
  const token=session.clientToken,service=provider;
  try{
   const response=await api('status',{},AbortSignal.timeout(3000),token),result=await response.json();if(session?.clientToken!==token||mode!=='player'||provider!==service)return;
   if(response.status===401){session=null;save();render();$('ai-connection').textContent='Connection expired. Pair this computer again.';return;}
   if(!response.ok)throw Error(result.error||'Connection unavailable.');
   const becameReady=result.connected&&result.ready&&!session.ready;
   session.ready=Boolean(result.connected&&result.ready);session.code=result.code;save();
   $('ai-pair-code').textContent=result.connected?'Paired':result.code&&Date.now()<result.expires?result.code:'Not paired';
   const keySetup=provider==='openai'&&result.connected&&Number.isInteger(result.configPort)&&result.configPort>0&&result.configPort<=65535;
   $('ai-key-setup').hidden=!keySetup;
   if(keySetup)$('ai-key-setup').href=`http://127.0.0.1:${result.configPort}/`;
   $('ai-connection').textContent=result.connected?provider==='openai'?`${result.ready?'Connector ready · key configured':'Connector paired · enter API key'} · ${result.model}`:`${result.ready?'Connected':provider==='jev'?'Check service port and model':'Warming up'} · ${result.model} · on your computer`:result.code&&Date.now()<result.expires?'Waiting for your local connector.':'Connector offline. Restart it, or pair again.';
   if(provider==='jev'&&result.connected)$('ai-connection').textContent=result.ready?`Connected to ${result.protocol==='openjev-nli'?'OpenJEV classifier':'JEV'} on port ${result.port} · ${result.model}`:'Connector paired · '+(result.serviceMessage||'Check the service port and model.');
   if(provider==='ollama'&&result.connected)$('ai-connection').textContent+=result.decisionVersion>=2?' · Strategy v2':' · Update AI connector: download, extract and restart it for smarter strategy.';
   if(provider!=='openai')showModels(result.connected?result.models:[],result.model,!result.connected?'Connect the local AI connector first.':!result.models?.length?(provider==='jev'?result.serviceMessage||'No JEV model reported. Check the connector terminal.':'Download and restart the updated AI connector to choose models.'):'');
   if(becameReady)changed('ready');
  }catch(e){$('ai-connection').textContent='Local AI connection unavailable. Gameplay continues with fallback tactics.';}
 }
 window.FieldLocalAI={
  get mode(){return mode;},
  get provider(){return provider;},
  setProvider(value){opponent=value;$('jev-toggle-label').hidden=value!=='ollama';$('jev-enabled').disabled=$('opponent-style').disabled;const next=value==='openai'?'openai':jevEnabled?'jev':'ollama';if(next===provider)return;provider=next;restore();render();void poll();},
  async plan(summary,signal){
   if(provider!=='openai'&&modelChoice())summary={...summary,model:modelChoice()};
   if(provider==='jev'&&mode==='player'&&session&&String(session.port)!==jevPort)throw Error('JEV port changed. Create a new pairing code.');
   if(mode==='server')return fetch(provider==='openai'?'/api/commander/openai/plan':serverPath()+'plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(summary),signal});
   if(!session?.clientToken)throw Error('Pair your computer below to use '+(provider==='openai'?'OpenAI Decisions':provider==='jev'?'local JEV':'local Ollama'));
   return api('plan',summary,signal);
  }
 };
 render();setInterval(poll,4000);
})();
