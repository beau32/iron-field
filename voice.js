/* Browser speech for local commander alerts. Voices come from the browser/OS. */
(() => {
  const toggle=document.getElementById('voice-enabled'),volume=document.getElementById('voice-volume'),status=document.getElementById('voice-status');
  const speechSupported='speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const Audio=window.AudioContext||window.webkitAudioContext,supported=speechSupported||Boolean(Audio);
  let soundContext=null,tones=[];
  function stopTones(){for(const tone of tones){try{tone.stop();}catch{}}tones=[];}
  function powerTone(){
    if(!soundContext||soundContext.state!=='running'||level<=0)return;
    const now=soundContext.currentTime;
    for(let i=0;i<4;i++){const osc=soundContext.createOscillator(),gain=soundContext.createGain(),at=now+i*.21;osc.type='triangle';osc.frequency.value=i%2?440:660;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level*.2,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.17);osc.connect(gain);gain.connect(soundContext.destination);osc.onended=()=>{osc.disconnect();gain.disconnect();tones=tones.filter(t=>t!==osc);};tones.push(osc);osc.start(at);osc.stop(at+.18);}
  }
  const synth=window.speechSynthesis;
  let saved={};try{saved=JSON.parse(localStorage.getItem('iron-field-voice')||'{}')||{};}catch{}
  let enabled=saved.enabled!==false,level=Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):.8;
  let unlocked=false,active=false,current=null,timer=null,serial=0,queue=[],last=new Map();
  const messages={superIncoming:name=>`Warning. Incoming ${name}.`,superReady:name=>`${name} ready.`,queued:name=>`${name} queued for production.`,ready:name=>`${name} ready.`,unitsAttack:()=> 'Our units are under attack.',baseAttack:()=> 'Our base is under attack.',techReady:()=> 'New technology unlocked.',lowPower:()=> 'Low power. Build more power plants.'};
  function ui(){toggle.checked=enabled;toggle.disabled=volume.disabled=!supported;volume.value=Math.round(level*100);status.textContent=!supported?'Voice alerts are unavailable in this browser.':!enabled?'Voice alerts muted.':!unlocked?'Click the battlefield to activate voice alerts.':speechSupported?'Production, attack and power alerts enabled.':'Low-power sound enabled. Speech is unavailable.';}
  function save(){try{localStorage.setItem('iron-field-voice',JSON.stringify({enabled,volume:level}));}catch{}}
  function stop(){serial++;clearTimeout(timer);timer=null;current=null;synth?.cancel();}
  function reset(){queue=[];last.clear();stop();stopTones();}
  function setActive(value){if(active===value)return;active=value;if(!active){queue=[];stop();stopTones();}}
  function discard(type){if(type==='lowPower')stopTones();queue=queue.filter(item=>item.type!==type);if(current?.type===type){stop();pump();}}
  function pump(){
    if(current||!speechSupported||!enabled||!unlocked||!active||document.hidden)return;
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
    const now=Date.now(),attack=event.type.endsWith('Attack')||event.type==='superIncoming',power=event.type==='lowPower',cooldown=attack?8000:power?15000:event.type==='queued'?1500:700;
    if(now-(last.get(event.type)??-Infinity)<cooldown)return;
    last.set(event.type,now);
    if(power)powerTone();
    if(!speechSupported)return;
    const name=FIELD_DATA.units[event.kind]?.name||FIELD_DATA.buildings[event.kind]?.name||'Unit';
    const item={type:event.type,text:messages[event.type](name),priority:attack?3:power?2:1,until:now+3000};
    if(current&&item.priority>current.priority)stop();
    queue.push(item);queue.sort((a,b)=>b.priority-a.priority);queue=queue.slice(0,4);pump();
  }
  function unlock(){
    if(!supported||!enabled||unlocked)return;
    unlocked=true;
    if(Audio){try{soundContext ||= new Audio();if(soundContext.state==='suspended')soundContext.resume().catch(()=>{});}catch{}}
    ui();
  }
  toggle.onchange=()=>{enabled=toggle.checked;reset();if(enabled){unlocked=false;unlock();}save();ui();};
  volume.oninput=()=>{level=Number(volume.value)/100;save();ui();};
  const activate=e=>{if(e.target===toggle)return;unlock();};
  document.addEventListener('pointerdown',activate,{capture:true});document.addEventListener('keydown',activate,{capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  window.FieldVoice=Object.freeze({notify,reset,setActive,discard});ui();
})();
