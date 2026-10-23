/* Original procedural soundtracks. Auto follows visible combat, entirely on this client. */
(() => {
  const toggle=document.getElementById('music-toggle'),slider=document.getElementById('music-volume'),selector=document.getElementById('music-track');
  const tracks={
    calm:{name:'Frontier Dawn',mood:'Calm',bpm:72,chords:[[38,50,57,60],[41,53,57,60],[36,48,55,60],[34,50,53,57]],melody:[0,null,7,null,12,null,10,null,7,null,3,null,2,null,0,null]},
    ore:{name:'Ore & Iron',mood:'Skirmish',bpm:92,chords:[[38,50,53,57],[34,46,50,53],[41,53,57,60],[36,48,52,55]],melody:[0,null,7,5,3,null,2,null,0,null,3,7,10,7,5,null]},
    advance:{name:'Armored Advance',mood:'Battle',bpm:116,chords:[[38,50,53,57],[38,50,57,60],[34,46,53,57],[36,48,55,58]],melody:[0,7,null,10,7,5,null,3,0,0,7,null,12,10,7,5]},
    redline:{name:'Redline',mood:'Intense',bpm:140,chords:[[38,50,53,57],[39,51,55,58],[34,46,50,53],[36,48,52,55]],melody:[12,7,12,10,7,3,5,7,12,12,10,7,5,3,2,0]}
  };
  let saved={};try{saved=JSON.parse(localStorage.getItem('iron-field-music')||'{}')||{};}catch{}
  let enabled=saved.enabled!==false,volume=Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):.25;
  let mode=saved.mode==='auto'||Object.hasOwn(tracks,saved.mode)?saved.mode:'auto';
  let current=mode==='auto'?'calm':mode,pending=current,autoLevel=0,heat=0,active=false,lastHeat=performance.now(),lastSwitch=-Infinity;
  let context,master,bus,noise,echo,timer=null,step=0,nextTime=0,starting=false,error='';
  for(const [id,track] of Object.entries(tracks)){const option=document.createElement('option');option.value=id;option.textContent=track.name;selector.append(option);}selector.value=mode;
  const frequency=midi=>440*2**((midi-69)/12);
  function save(){try{localStorage.setItem('iron-field-music',JSON.stringify({enabled,volume,mode}));}catch{}}
  function ui(){
    const playing=enabled&&context?.state==='running';
    toggle.textContent=playing?'♫ Music on':enabled?'♫ Music':'♫ Music off';
    toggle.setAttribute('aria-pressed',String(playing));
    toggle.setAttribute('aria-label',playing?'Mute background music':'Play background music');
    const title=error||`${tracks[current].name} · ${tracks[current].bpm} BPM${pending!==current?' · next: '+tracks[pending].name:''}`;
    toggle.title=selector.title=title;selector.options[0].textContent='Auto · '+tracks[['calm','ore','advance','redline'][autoLevel]].mood;
    slider.value=Math.round(volume*100);slider.setAttribute('aria-valuetext',`${Math.round(volume*100)} percent`);
  }
  function decay(){const now=performance.now();heat*=Math.exp(-Math.max(0,now-lastHeat)/8000);lastHeat=now;return now;}
  function updateMood(){
    const now=decay(),thresholds=[0,3,12,26],levels=['calm','ore','advance','redline'];
    let next=heat>=26?3:heat>=12?2:heat>=3?1:0;
    if(!active)next=0;
    if(next>autoLevel&&now-lastSwitch>=4000||next<autoLevel&&(!active||heat<thresholds[autoLevel]*.7&&now-lastSwitch>=12000)){
      autoLevel=next;lastSwitch=now;
    }
    const desired=mode==='auto'?levels[autoLevel]:mode;
    if(pending!==desired){pending=desired;ui();}
  }
  function combat(weight=1){if(!active||document.hidden)return;decay();heat=Math.min(48,heat+Math.max(0,Math.min(3,weight)));updateMood();}
  function setBattleState(running){active=Boolean(running);if(!active)heat=0;updateMood();}
  function reset(){heat=0;autoLevel=0;lastHeat=performance.now();lastSwitch=-Infinity;pending=mode==='auto'?'calm':mode;ui();}
  function tone(midi,time,duration,level,type='triangle',cutoff=1400,attack=.012){
    const oscillator=context.createOscillator(),filter=context.createBiquadFilter(),gain=context.createGain();
    oscillator.type=type;oscillator.frequency.value=frequency(midi);filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.6;
    gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(level,time+attack);
    gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    oscillator.connect(filter);filter.connect(gain);gain.connect(bus);oscillator.start(time);oscillator.stop(time+duration+.02);
    oscillator.onended=()=>{oscillator.disconnect();filter.disconnect();gain.disconnect();};
  }
  function drum(time,kind){
    const gain=context.createGain();gain.connect(bus);
    if(kind==='kick'){
      const oscillator=context.createOscillator();oscillator.frequency.setValueAtTime(115,time);oscillator.frequency.exponentialRampToValueAtTime(42,time+.13);
      gain.gain.setValueAtTime(.36,time);gain.gain.exponentialRampToValueAtTime(.0001,time+.23);oscillator.connect(gain);oscillator.start(time);oscillator.stop(time+.25);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }else{
      const source=context.createBufferSource(),filter=context.createBiquadFilter();source.buffer=noise;filter.type=kind==='hat'?'highpass':'bandpass';filter.frequency.value=kind==='hat'?6500:1700;
      const duration=kind==='hat'?.055:.14;gain.gain.setValueAtTime(kind==='hat'?.035:.1,time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
      source.connect(filter);filter.connect(gain);source.start(time);source.stop(time+duration+.01);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    }
  }
  function schedule(index,time){
    const track=tracks[current],beat=60/track.bpm,bar=Math.floor(index/8)%32,eighth=index%8,chord=track.chords[Math.floor(bar/2)%4],full=bar>=4&&bar<28;
    if(current==='calm'){
      if(eighth===0)for(const note of chord.slice(1))tone(note,time,beat*4.5,.028,'sine',800,.6);
      if(eighth===0||eighth===4)tone(chord[0],time,beat*1.6,.12,'sine',500,.08);
      const note=track.melody[(bar%2)*8+eighth];if(note!==null)tone(62+note,time,beat*1.4,.045,'sine',1500,.025);
      if(bar%4===3&&eighth===6)drum(time,'hat');return;
    }
    if(current==='advance'||current==='redline'){
      const intense=current==='redline',breakdown=bar%16>=14;
      if(eighth===0)for(const note of chord.slice(1))tone(note,time,beat*3.8,.027,'triangle',1200,.12);
      if(!breakdown||eighth%2===0)tone(chord[0]+(eighth===3||eighth===7?12:0),time,beat*.36,.13,'sawtooth',intense?950:650);
      if((intense?[0,3,4,7]:[0,4,7]).includes(eighth))drum(time,'kick');
      if(eighth===2||eighth===6)drum(time,'snare');if(!breakdown)drum(time,'hat');
      const note=track.melody[(bar%2)*8+eighth];if(note!==null&&!breakdown)tone(62+note,time,beat*.52,intense?.048:.04,intense?'square':'triangle',intense?1600:2200,.015);
      if(intense&&eighth%2===1)tone(chord[2]+12,time,beat*.18,.022,'triangle',2600);return;
    }
    if(eighth===0) for(const note of chord.slice(1))tone(note,time,beat*4.3,.035,'sine',900,.5);
    if([0,3,4,6].includes(eighth))tone(chord[0]+(eighth===6?7:0),time,beat*.62,.19,'triangle',650);
    if(full){
      if(eighth===0||eighth===4||(bar%4===3&&eighth===7))drum(time,'kick');
      if(eighth===2||eighth===6)drum(time,'snare');
      drum(time,'hat');
      const order=[0,2,1,2,0,1,2,1];tone(chord.slice(1)[order[eighth]]+12,time,beat*.45,.035,'triangle',2200);
    }
    if((bar>=8&&bar<16)||(bar>=24&&bar<28)){
      const melody=track.melody;
      const offset=melody[(bar%2)*8+eighth];if(offset!==null)tone(62+offset,time,beat*.95,.055,'triangle',1800,.035);
    }
  }
  function tick(){
    if(!enabled||document.hidden||context.state!=='running')return;
    if(nextTime<context.currentTime)nextTime=context.currentTime+.04;
    updateMood();
    while(nextTime<context.currentTime+.18){
      if(step%8===0&&pending!==current){current=pending;step=0;bus.gain.setTargetAtTime(.12,nextTime,.045);bus.gain.setTargetAtTime(1,nextTime+.15,.25);echo.delayTime.setTargetAtTime(60/tracks[current].bpm*.75,nextTime,.2);ui();}
      schedule(step,nextTime);step=(step+1)%256;nextTime+=30/tracks[current].bpm;
    }
  }
  function init(){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Web Audio unavailable');
    context=new Audio();bus=context.createGain();master=context.createGain();
    const compressor=context.createDynamicsCompressor();compressor.threshold.value=-18;compressor.ratio.value=4;
    bus.connect(compressor);compressor.connect(master);master.connect(context.destination);master.gain.value=volume*.55;
    const delay=echo=context.createDelay(1),feedback=context.createGain(),send=context.createGain(),filter=context.createBiquadFilter();
    delay.delayTime.value=60/tracks[current].bpm*.75;feedback.gain.value=.22;send.gain.value=.16;filter.type='lowpass';filter.frequency.value=1800;
    bus.connect(send);send.connect(delay);delay.connect(filter);filter.connect(compressor);filter.connect(feedback);feedback.connect(delay);
    noise=context.createBuffer(1,context.sampleRate*.3,context.sampleRate);const samples=noise.getChannelData(0);let seed=42;
    for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=seed/2147483648-1;}
    context.onstatechange=ui;
  }
  async function play(){
    if(!enabled||document.hidden||starting||context?.state==='running')return;
    starting=true;
    try{if(!context)init();await context.resume();if(!enabled||document.hidden){await context.suspend();return;}error='';nextTime=context.currentTime+.06;clearInterval(timer);timer=setInterval(tick,80);tick();}
    catch{error='Music could not start. Click to try again.';}
    finally{starting=false;ui();}
  }
  async function stop(){clearInterval(timer);timer=null;if(context?.state==='running')await context.suspend();ui();}
  toggle.addEventListener('click',()=>{if(enabled&&context?.state==='running'){enabled=false;void stop();}else{enabled=true;void play();}save();ui();});
  slider.addEventListener('input',()=>{volume=Number(slider.value)/100;if(master)master.gain.setTargetAtTime(volume*.55,context.currentTime,.04);save();ui();});
  selector.addEventListener('change',()=>{mode=selector.value;updateMood();save();ui();if(enabled)void play();});
  const gesture=e=>{if(!e.target.closest?.('.music-controls')&&enabled)void play();};
  document.addEventListener('pointerdown',gesture);document.addEventListener('keydown',gesture);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)void stop();else if(context&&enabled)void play();});
  window.addEventListener('pagehide',()=>{void stop();});
  window.IronFieldMusic=Object.freeze({combat,setBattleState,reset,snapshot:()=>({enabled,volume,mode,track:current,pending,intensity:autoLevel,heat,state:context?.state||'waiting',step,bpm:tracks[current].bpm})});
  ui();
})();
