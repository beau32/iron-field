/* Networking deliberately stays separate from game rules and rendering.
 * Commands travel to the host via authenticated POST requests. A streaming
 * response carries lobby changes and authoritative world snapshots back.
 */
window.FieldNetwork = class FieldNetwork {
  constructor(hooks) {
    this.hooks=hooks;this.session=null;this.room=null;this.connected=false;this.seq=0;this.epoch=0;this.startedEpoch=0;this.lastMessage=0;this.pendingState=false;this.closed=false;
    this.$=id=>document.getElementById(id);
    this.$('network-open').onclick=()=>this.open();this.$('network-close').onclick=()=>this.$('network-dialog').close();
    this.$('network-host').onclick=()=>this.enter('create');this.$('network-join').onclick=()=>this.enter('join');
    this.$('network-ready').onclick=()=>this.control('ready',{ready:!this.room?.players?.find(p=>p.role===this.role)?.ready});
    this.$('network-start').onclick=()=>this.control('start');this.$('network-leave').onclick=()=>this.leave();
    this.$('network-map').onchange=()=>{if(this.active)this.control('map',{mapId:this.$('network-map').value});else this.render();};
    this.$('network-code').value=new URLSearchParams(location.search).get('room')||'';
    this.$('network-copy').onclick=async()=>{
      const text=this.$('network-invite').value;
      try {await navigator.clipboard.writeText(text);this.message('Invite copied.');}
      catch {this.$('network-invite').focus();this.$('network-invite').select();this.message('Select and copy the invite address.');}
    };
    document.addEventListener('visibilitychange',()=>{if(this.isHost)this.post('visibility',{visible:!document.hidden}).catch(()=>{});});
    setInterval(()=>{if(this.active&&this.connected&&Date.now()-this.lastMessage>9000)this.abort?.abort();},1000);
    setInterval(()=>{
      if(!this.active||!this.connected||this.pinging)return;
      const session=this.session;this.pinging=true;
      this.post('ping').catch(()=>{if(this.session===session)this.abort?.abort();}).finally(()=>this.pinging=false);
    },2000);
    let saved;try{saved=JSON.parse(sessionStorage.getItem('iron-field-room'));}catch{}
    if(saved?.token&&saved?.role)setTimeout(()=>{this.adopt(saved);this.$('network-dialog').showModal();},0);
    else if(this.$('network-code').value)setTimeout(()=>this.open(),0);
  }
  get active(){return Boolean(this.session);}
  get role(){return this.session?.role;}
  get isHost(){return this.role==='host';}
  get canPublish(){return this.isHost&&this.connected&&this.room&&['playing','ended'].includes(this.room.phase)&&!this.pendingState&&this.startedEpoch>0;}
  get team(){return this.session?.team||'player';}
  get playable(){return this.connected&&this.room?.phase==='playing'&&this.room.players?.length>=2&&this.room.players.every(p=>p.online)&&this.room.hostVisible&&this.startedEpoch===this.room.epoch;}
  message(text){this.$('network-message').textContent=text;}
  async open(){
    if(!this.$('network-dialog').open)this.$('network-dialog').showModal();
    try{
      const response=await fetch('/api/info',{cache:'no-store'});if(!response.ok)throw Error();
      const info=await response.json();if(info.version!==12)throw Error('Game updated. Refresh this page before hosting or joining.');
      this.links=info.links;this.$('network-server-help').hidden=true;this.$('network-actions').hidden=this.active;
      const list=this.$('network-addresses');list.replaceChildren();
      for(const url of info.links){const item=document.createElement('div');item.textContent=url;list.append(item);}
      this.render();
    }catch(error){
      this.$('network-server-help').hidden=false;this.$('network-actions').hidden=true;
      this.$('network-server-link').href=`http://${location.hostname||'localhost'}:8766/`;
      this.message(error.message?.startsWith('Game updated.')?error.message:'Open the multiplayer server to host or join. Solo mode still works here.');
    }
  }
  async post(endpoint,data={},auth=true){
    const response=await fetch(`/api/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth&&this.session?{Authorization:`Bearer ${this.session.token}`}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});
    const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'Network request failed.'),{status:response.status});return result;
  }
  async enter(endpoint){
    if(this.entering||this.active)return;this.entering=true;this.message('Connecting…');
    try{const session=await this.post(endpoint,{version:12,name:this.$('network-name').value,mapId:this.$('network-map').value,code:this.$('network-code').value},false);this.adopt(session);}
    catch(error){this.message(error.message);}finally{this.entering=false;}
  }
  adopt(session){
    this.$('map-dialog').close();
    this.session=session;this.closed=false;this.epoch=0;this.startedEpoch=0;this.room=null;this.seq=0;
    try{sessionStorage.setItem('iron-field-room',JSON.stringify(session));}catch{}
    this.hooks.mode(this.team);this.render();this.stream();
  }
  async stream(){
    const session=this.session;if(!session)return;
    this.abort=new AbortController();
    try{
      const response=await fetch('/api/events',{headers:{Authorization:`Bearer ${session.token}`},signal:this.abort.signal,cache:'no-store'});
      if(!response.ok){if(response.status===401){this.clear('The room expired. Create or join another room.');return;}throw Error('Connection unavailable.');}
      this.connected=true;this.lastMessage=Date.now();this.render();
      if(this.isHost)this.post('visibility',{visible:!document.hidden}).catch(()=>{});
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      while(this.session===session){
        const {done,value}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true});if(buffer.length>1536*1024)throw Error('Invalid stream.');
        let end;while((end=buffer.indexOf('\n\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(line.startsWith('data: '))this.receive(JSON.parse(line.slice(6)));}
      }
    }catch(error){if(this.session===session)this.message('Connection interrupted. Reconnecting…');}
    if(this.session!==session)return;
    this.connected=false;this.render();this.hooks.status();
    setTimeout(()=>{if(this.session===session)this.stream();},1200);
  }
  receive(message){
    this.lastMessage=Date.now();
    if(message.type==='room'){
      const previous=this.room?.phase;this.room=message;this.epoch=message.epoch;
      if(message.phase==='lobby'&&previous&&previous!=='lobby')this.$('network-dialog').showModal();
      this.render();this.hooks.status();return;
    }
    if(message.type==='start'){
      this.epoch=message.epoch;this.startedEpoch=message.epoch;this.seq=0;
      this.hooks.start();this.$('network-dialog').close();this.render();return;
    }
    if(message.type==='state'){
      this.epoch=message.epoch;this.startedEpoch=message.epoch;
      if(message.restore)this.seq=message.seq||0;
      if(!this.isHost||message.restore)this.hooks.state(message.state,Boolean(message.restore));
      if(message.restore)this.hooks.status();return;
    }
    if(message.type==='action'&&this.isHost&&message.epoch===this.epoch)this.hooks.command(message.team,message.action);
    if(message.type==='feedback')this.hooks.notice(message.message);
    if(message.type==='closed')this.clear(message.message);
    if(message.type==='replaced')this.clear(message.message);
  }
  async control(type,data={}){try{await this.post(type,data);}catch(error){this.message(error.message);this.hooks.notice(error.message);}}
  command(action){
    if(!this.playable){this.hooks.notice('Match paused: waiting for all players and the host tab.');return;}
    if(this.isHost){this.hooks.command(this.team,action);return;}
    const id=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.post('action',{epoch:this.epoch,id,action}).catch(error=>this.hooks.notice(error.message));
  }
  publish(state){
    if(!this.canPublish)return;
    this.pendingState=true;
    this.post('state',{epoch:this.epoch,seq:++this.seq,state}).catch(error=>{
      if(error.status!==409)this.hooks.notice('Snapshot connection interrupted. Waiting to reconnect.');
    }).finally(()=>this.pendingState=false);
  }
  feedback(team,message){this.post('feedback',{team,message}).catch(()=>{});}
  async leave(){
    try{if(this.active)await this.post('leave');}catch{}
    this.clear('Left the room. Solo mode is ready.');
  }
  clear(message){
    this.session=null;this.room=null;this.connected=false;this.startedEpoch=0;this.abort?.abort();
    try{sessionStorage.removeItem('iron-field-room');}catch{}
    this.hooks.mode('player');this.hooks.solo();this.render();this.message(message);
  }
  render(){
    const room=this.room,active=this.active;
    this.$('network-actions').hidden=active;this.$('network-room').hidden=!active;
    this.$('network-open').textContent=active?`${this.session.code} · ${this.connected?'LAN':'reconnecting'}`:'Multiplayer';
    this.$('network-map').disabled=active&&(!this.isHost||room?.phase!=='lobby');
    if(room?.mapId)this.$('network-map').value=room.mapId;
    this.$('network-map-description').textContent=FIELD_MAP.get(this.$('network-map').value).description;
    if(!active)return;
    this.$('network-room-code').textContent=this.session.code;
    this.$('network-seat').textContent=`${this.isHost?'Host':'Commander'} · ${{player:'Mint / southwest',enemy:'Coral / northeast',team3:'Blue / northwest',team4:'Gold / southeast'}[this.team]}`;
    const preferred=this.links?.find(x=>!x.includes('192.168.56.')&&!x.includes('172.'))||this.links?.[0];
    const base=location.hostname==='localhost'||location.hostname==='127.0.0.1'?(preferred||location.origin+'/'):location.origin+'/';
    this.$('network-invite').value=`${base}?room=${this.session.code}`;
    for(const [i,role] of ['host','guest','guest2','guest3'].entries()){
      const seat=room?.players?.find(p=>p.role===role);this.$(`network-${role}-status`).textContent=seat?`${['Mint','Coral','Blue','Gold'][i]} · ${seat.name} · ${seat.online?'connected':'reconnecting'} · ${seat.ready?'ready':'not ready'}`:`Seat ${i+1} · open`;
    }
    this.$('network-ready').hidden=room?.phase!=='lobby';this.$('network-ready').textContent=room?.players?.find(p=>p.role===this.role)?.ready?'Not ready':'Ready';
    this.$('network-start').hidden=!this.isHost||room?.phase!=='lobby';
    this.$('network-start').disabled=!(this.connected&&room?.players?.length>=2&&room.players.every(p=>p.online&&p.ready));
    this.$('network-phase').textContent=!this.connected?'Reconnecting — match paused':room?.phase==='lobby'?'2–4 commanders · everyone must be ready':!room?.players?.every(p=>p.online)?'Player disconnected — match paused':!room?.hostVisible?'Host tab is in the background — match paused':room?.phase==='ended'?'Match complete':'Match connected';
    this.message('');
  }
};
