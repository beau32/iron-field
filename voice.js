/* Browser speech for local commander alerts. Voices come from the browser/OS. */
(() => {
  const toggle=document.getElementById('voice-enabled'),volume=document.getElementById('voice-volume'),status=document.getElementById('voice-status');
  const supported='speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const synth=window.speechSynthesis;
  let saved={};try{saved=JSON.parse(localStorage.getItem('iron-field-voice')||'{}')||{};}catch{}
  let enabled=saved.enabled!==false,level=Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):.8;
  let unlocked=false,active=false,current=null,timer=null,serial=0,queue=[],last=new Map();
  const messages={queued:name=>`${name} queued for production.`,ready:name=>`${name} ready.`,unitsAttack:()=> 'Our units are under attack.',baseAttack:()=> 'Our base is under attack.',lowPower:()=> 'Low power. Build more power plants.'};
  function ui(){toggle.checked=enabled;toggle.disabled=volume.disabled=!supported;volume.value=Math.round(level*100);status.textContent=!supported?'Voice alerts are unavailable in this browser.':!enabled?'Voice alerts muted.':!unlocked?'Click the battlefield to activate voice alerts.':'Production, attack and power alerts enabled.';}
  function save(){try{localStorage.setItem('iron-field-voice',JSON.stringify({enabled,volume:level}));}catch{}}
  function stop(){serial++;clearTimeout(timer);timer=null;current=null;synth?.cancel();}
  function reset(){queue=[];last.clear();stop();}
  function setActive(value){if(active===value)return;active=value;if(!active){queue=[];stop();}}
  function discard(type){queue=queue.filter(item=>item.type!==type);if(current?.type===type){stop();pump();}}
  function pump(){
    if(current||!supported||!enabled||!unlocked||!active||document.hidden)return;
    queue=queue.filter(item=>item.until>Date.now());const item=queue.shift();if(!item)return;
    const id=++serial,utterance=new SpeechSynthesisUtterance(item.text);current=item;
    utterance.lang='en-US';utterance.rate=1.05;utterance.volume=level;
    const voices=synth.getVoices();utterance.voice=voices.find(v=>v.localService&&/^en\b/i.test(v.lang))||voices.find(v=>/^en\b/i.test(v.lang))||null;
    const finish=()=>{if(id!==serial)return;clearTimeout(timer);timer=null;current=null;pump();};
    utterance.onend=finish;utterance.onerror=e=>{if(id===serial&&enabled&&!['canceled','interrupted'].includes(e.error))status.textContent='Speech could not play. Check your browser audio permissions and installed English voices.';finish();};
    // Some platforms fail to emit an end event. Never let that block future alerts.
    timer=setTimeout(()=>{if(id===serial){stop();pump();}},6000);
    try{synth.speak(utterance);}catch{finish();}
  }
  function notify(event){
    if(!supported||!enabled||!unlocked||!active||document.hidden||!messages[event.type])return;
    const now=Date.now(),attack=event.type.endsWith('Attack'),power=event.type==='lowPower',cooldown=attack?8000:power?15000:event.type==='queued'?1500:700;
    if(now-(last.get(event.type)??-Infinity)<cooldown)return;
    last.set(event.type,now);
    const name=FIELD_DATA.units[event.kind]?.name||'Unit';
    const item={type:event.type,text:messages[event.type](name),priority:attack?3:power?2:1,until:now+3000};
    if(current&&item.priority>current.priority)stop();
    queue.push(item);queue.sort((a,b)=>b.priority-a.priority);queue=queue.slice(0,4);pump();
  }
  function unlock(){
    if(!supported||!enabled||unlocked)return;
    unlocked=true;ui();
  }
  toggle.onchange=()=>{enabled=toggle.checked;reset();if(enabled){unlocked=false;unlock();}save();ui();};
  volume.oninput=()=>{level=Number(volume.value)/100;save();ui();};
  const activate=e=>{if(e.target===toggle)return;unlock();};
  document.addEventListener('pointerdown',activate,{capture:true});document.addEventListener('keydown',activate,{capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  window.FieldVoice=Object.freeze({notify,reset,setActive,discard});ui();
})();
