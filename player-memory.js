/* Compact local-only history for solo matches; no model training or account identity. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {let storage=null;try{storage=root.localStorage;}catch{}root.FieldPlayerMemory=api.create(storage,root.FIELD_DATA);}
})(globalThis,()=>{
  const KEY='iron-field-player-history-v1',LIMIT=20;
  function summarizeMatch(match,defs){
    if(!match||match.metadata?.mode!=='solo'||!match.ended||match.ended.gameSeconds<60||!Array.isArray(match.snapshots)||!defs?.units)return null;
    let peakShips=0,peakAircraft=0,peakMiners=0,forward=false,economyAtThree=null;
    for(const snap of match.snapshots){
      const state=snap?.state,player=state?.teams?.player,enemy=state?.teams?.enemy;
      if(!player||!enemy)continue;
      const count=player.units||{};
      peakShips=Math.max(peakShips,Object.entries(count).reduce((n,[kind,v])=>n+(defs.units[kind]?.naval&&Number.isFinite(v)?v:0),0));
      peakAircraft=Math.max(peakAircraft,Object.entries(count).reduce((n,[kind,v])=>n+(defs.units[kind]?.aircraft&&Number.isFinite(v)?v:0),0));
      peakMiners=Math.max(peakMiners,Number(count.miner)||0);
      if(economyAtThree===null&&snap.gameSeconds>=180&&snap.gameSeconds<195&&Number.isFinite(player.oreDelivered))economyAtThree=Math.max(0,Math.min(1000000,Math.floor(player.oreDelivered)));
      const hq=(enemy.entities||[]).find(e=>e.kind==='base'&&e.position)?.position;
      if(hq&&snap.gameSeconds<=180&&(player.entities||[]).some(e=>e.type==='unit'&&defs.units[e.kind]?.damage>0&&e.position&&Math.hypot(e.position.x-hq.x,e.position.z-hq.z)<=35))forward=true;
    }
    let minerLosses=null,productionLosses=null,enemyProductionLosses=null;
    if(Array.isArray(match.events)&&match.dropped?.events===0){
      const deaths=match.events.filter(e=>e.type==='entity-destroyed').map(e=>e.data||{}),production=['refinery','garrison','warFactory','airfield','shipyard'];
      minerLosses=deaths.filter(e=>e.team==='player'&&e.kind==='miner').length;
      productionLosses=deaths.filter(e=>e.team==='player'&&production.includes(e.kind)).length;
      enemyProductionLosses=deaths.filter(e=>e.team==='enemy'&&production.includes(e.kind)).length;
    }
    const clamp=n=>Math.max(0,Math.min(400,Math.floor(n)));
    return {id:String(match.startedAt||'').slice(0,40),duration:Math.min(86400,Math.floor(match.ended.gameSeconds)),result:['victory','defeat'].includes(match.ended.reason)?match.ended.reason:'unfinished',peakShips:clamp(peakShips),peakAircraft:clamp(peakAircraft),peakMiners:clamp(peakMiners),forward,economyAtThree,minerLosses:minerLosses===null?null:clamp(minerLosses),productionLosses:productionLosses===null?null:clamp(productionLosses),enemyProductionLosses:enemyProductionLosses===null?null:clamp(enemyProductionLosses)};
  }
  function create(storage,defs){
    let state={enabled:true,matches:[]},available=Boolean(storage);
    try{const saved=JSON.parse(storage?.getItem(KEY)||'null');if(saved&&typeof saved.enabled==='boolean'&&Array.isArray(saved.matches)){state.enabled=saved.enabled;state.matches=saved.matches.filter(m=>m&&typeof m.id==='string'&&typeof m.forward==='boolean'&&['victory','defeat','unfinished'].includes(m.result)&&['duration','peakShips','peakAircraft','peakMiners'].every(k=>Number.isInteger(m[k])&&m[k]>=0&&m[k]<=86400)).slice(-LIMIT);}}catch{available=false;}
    const persist=()=>{try{if(!storage)throw Error();storage.setItem(KEY,JSON.stringify(state));available=true;}catch{available=false;}};
    function profile(){
      if(!state.enabled||!state.matches.length)return null;const a=state.matches,completed=a.filter(m=>m.result!=='unfinished');
      const economy=a.filter(m=>Number.isInteger(m.economyAtThree)),events=a.filter(m=>['minerLosses','productionLosses','enemyProductionLosses'].every(k=>Number.isInteger(m[k])));
      return {games:a.length,forwardGames:a.filter(m=>m.forward).length,navalGames:a.filter(m=>m.peakShips>=2).length,airGames:a.filter(m=>m.peakAircraft>=2).length,economyGames:a.filter(m=>m.peakMiners>=4).length,
        evidence:{completedGames:completed.length,wins:completed.filter(m=>m.result==='victory').length,economySamples:economy.length,fastEconomyGames:economy.filter(m=>m.economyAtThree>=3000).length,eventSamples:events.length,minerLossGames:events.filter(m=>m.minerLosses>=2).length,productionLossGames:events.filter(m=>m.productionLosses>=1).length,enemyProductionLossGames:events.filter(m=>m.enemyProductionLosses>=1).length}};
    }
    return {profile,enabled:()=>state.enabled,available:()=>available,setEnabled(value){state.enabled=Boolean(value);persist();},clear(){state.matches=[];persist();},
      record(match){if(!state.enabled)return false;const item=summarizeMatch(match,defs);if(!item||!item.id||state.matches.some(m=>m.id===item.id))return false;state.matches.push(item);state.matches=state.matches.slice(-LIMIT);persist();return true;},
      describe(){const p=profile(),last=state.matches.at(-1);if(!state.enabled)return 'Learning is off. Saved history is not used.';if(!available)return 'Browser storage unavailable; history lasts only until this page closes.';if(!p)return 'No solo matches saved yet. Finish a match or start a new one after at least one minute.';const lastResult=last.result==='unfinished'?'unfinished':last.result==='victory'?'victory':'defeat';const losses=Number.isInteger(last.minerLosses)?` Lost ${last.minerLosses} miners and ${last.productionLosses} production structures; ${last.enemyProductionLosses} enemy production structures lost.`:'';return `${p.games} solo ${p.games===1?'match':'matches'} saved. Early forward pressure ${p.forwardGames}/${p.games}; 2+ ships ${p.navalGames}/${p.games}; 2+ aircraft ${p.airGames}/${p.games}; 4+ miners ${p.economyGames}/${p.games}. Last: ${lastResult}, ${Math.floor(last.duration/60)}m ${last.duration%60}s; peak ${last.peakShips} ships, ${last.peakAircraft} aircraft, ${last.peakMiners} miners.${losses}`;}
    };
  }
  return {create,summarizeMatch,LIMIT};
});
