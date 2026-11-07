/* Compact local-only history for solo matches; no model training or account identity. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {let storage=null;try{storage=root.localStorage;}catch{}root.FieldPlayerMemory=api.create(storage,root.FIELD_DATA);}
})(globalThis,()=>{
  const KEY='iron-field-player-history-v1',LIMIT=20;
  const operations=['balanced','rush','defend','economy','air','anti-air','siege','anti-armor','naval'];
  function observedLearning(match,defs){
    const samples=[];
    for(const snap of match.snapshots||[])if(Array.isArray(snap?.state?.ai?.contacts))samples.push({time:snap.gameSeconds,contacts:snap.state.ai.contacts});
    for(const event of match.events||[])if(event.type==='ai-request'&&Array.isArray(event.data?.summary?.contacts))samples.push({time:event.gameSeconds,contacts:event.data.summary.contacts});
    if(!samples.length)return null;
    const observed={early:false,air:false,naval:false,miner:false};
    for(const sample of samples)for(const c of sample.contacts){
      const unit=defs.units[c.kind];if(!unit)continue;
      if(sample.time<=180&&unit.damage>0&&c.distance<=35)observed.early=true;
      if(unit.aircraft)observed.air=true;if(unit.naval)observed.naval=true;if(c.kind==='miner')observed.miner=true;
    }
    const outcomes={};
    if(match.dropped?.events===0){
      const decisions=(match.events||[]).filter(e=>e.type==='ai-decision'&&operations.includes(e.data?.plan?.operation)&&Number.isFinite(e.gameSeconds));
      const signature=e=>{const p=e.data.plan;return [p.operation,p.directive,p.style,p.focus,p.unit,p.building,p.tactic].join('|');};
      const changes=decisions.filter((e,i)=>!i||signature(e)!==signature(decisions[i-1]));
      const deaths=(match.events||[]).filter(e=>e.type==='entity-destroyed'&&Number.isFinite(e.gameSeconds));
      for(let i=0;i<changes.length;i++){
        const decision=changes[i],end=decision.gameSeconds+60;
        if(end>match.ended.gameSeconds||(changes[i+1]&&changes[i+1].gameSeconds<end))continue;
        let lost=0,dealt=0,hidden=false;
        for(const e of deaths)if(e.gameSeconds>decision.gameSeconds&&e.gameSeconds<=end){const value=Math.max(0,Math.min(10000,Number(e.data?.value)||0));if(e.data?.team==='enemy')lost+=value;else if(e.data?.team==='player'){if(e.data.visibleToComputer===true)dealt+=value;else hidden=true;}}
        if(hidden)continue;
        const result=dealt>=150&&dealt>lost*1.5?'positive':lost>=150&&lost>dealt*1.5?'negative':null;
        if(result){const row=outcomes[decision.data.plan.operation]||={positive:0,negative:0};row[result]++;}
      }
    }
    return {observed,outcomes};
  }
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
    return {id:String(match.startedAt||'').slice(0,40),duration:Math.min(86400,Math.floor(match.ended.gameSeconds)),result:['victory','defeat'].includes(match.ended.reason)?match.ended.reason:'unfinished',peakShips:clamp(peakShips),peakAircraft:clamp(peakAircraft),peakMiners:clamp(peakMiners),forward,economyAtThree,minerLosses:minerLosses===null?null:clamp(minerLosses),productionLosses:productionLosses===null?null:clamp(productionLosses),enemyProductionLosses:enemyProductionLosses===null?null:clamp(enemyProductionLosses),learning:observedLearning(match,defs)};
  }
  function create(storage,defs){
    let state={enabled:true,matches:[]},available=Boolean(storage);
    try{const saved=JSON.parse(storage?.getItem(KEY)||'null');if(saved&&typeof saved.enabled==='boolean'&&Array.isArray(saved.matches)){state.enabled=saved.enabled;state.matches=saved.matches.filter(m=>m&&typeof m.id==='string'&&typeof m.forward==='boolean'&&['victory','defeat','unfinished'].includes(m.result)&&['duration','peakShips','peakAircraft','peakMiners'].every(k=>Number.isInteger(m[k])&&m[k]>=0&&m[k]<=86400)).slice(-LIMIT);}}catch{available=false;}
    const persist=()=>{try{if(!storage)throw Error();storage.setItem(KEY,JSON.stringify(state));available=true;}catch{available=false;}};
    function profile(){
      if(!state.enabled||!state.matches.length)return null;const a=state.matches,completed=a.filter(m=>m.result!=='unfinished');
      const economy=a.filter(m=>Number.isInteger(m.economyAtThree)),events=a.filter(m=>['minerLosses','productionLosses','enemyProductionLosses'].every(k=>Number.isInteger(m[k])));
      const recent=a.slice(-5).filter(m=>m.learning?.observed),learning=recent.length?{samples:recent.length,early:0,air:0,naval:0,miner:0,outcomes:{}}:null;
      if(learning)for(const m of recent){for(const k of ['early','air','naval','miner'])if(m.learning.observed[k]===true)learning[k]++;for(const op of operations){const r=m.learning.outcomes?.[op];if(!r)continue;const row=learning.outcomes[op]||={positive:0,negative:0};for(const k of ['positive','negative'])row[k]=Math.min(100,row[k]+Math.floor(Math.max(0,Math.min(100,Number(r[k])||0))));}}
      return {games:a.length,forwardGames:a.filter(m=>m.forward).length,navalGames:a.filter(m=>m.peakShips>=2).length,airGames:a.filter(m=>m.peakAircraft>=2).length,economyGames:a.filter(m=>m.peakMiners>=4).length,...(learning?{learning}:{}),
        evidence:{completedGames:completed.length,wins:completed.filter(m=>m.result==='victory').length,economySamples:economy.length,fastEconomyGames:economy.filter(m=>m.economyAtThree>=3000).length,eventSamples:events.length,minerLossGames:events.filter(m=>m.minerLosses>=2).length,productionLossGames:events.filter(m=>m.productionLosses>=1).length,enemyProductionLossGames:events.filter(m=>m.enemyProductionLosses>=1).length}};
    }
    function observedProfile(){const p=profile(),l=p?.learning;if(!l)return null;return {games:l.samples,forwardGames:l.early,navalGames:l.naval,airGames:l.air,economyGames:0,learning:l};}
    return {profile,observedProfile,enabled:()=>state.enabled,available:()=>available,setEnabled(value){state.enabled=Boolean(value);persist();},clear(){state.matches=[];persist();},
      record(match){if(!state.enabled)return false;const item=summarizeMatch(match,defs);if(!item||!item.id||state.matches.some(m=>m.id===item.id))return false;state.matches.push(item);state.matches=state.matches.slice(-LIMIT);persist();return true;},
      describe(){const p=profile(),last=state.matches.at(-1);if(!state.enabled)return 'Learning is off. Saved history is not used.';if(!available)return 'Browser storage unavailable; history lasts only until this page closes.';if(!p)return 'No solo matches saved yet. Finish a match or start a new one after at least one minute.';const lastResult=last.result==='unfinished'?'unfinished':last.result==='victory'?'victory':'defeat';const losses=Number.isInteger(last.minerLosses)?` Lost ${last.minerLosses} miners and ${last.productionLosses} production structures; ${last.enemyProductionLosses} enemy production structures lost.`:'';const l=p.learning,learning=l?` AI observed history: ${l.samples} recent matches; early pressure ${l.early}/${l.samples}, aircraft ${l.air}/${l.samples}, ships ${l.naval}/${l.samples}.`:' AI observation history starts with new matches.';return `${p.games} solo ${p.games===1?'match':'matches'} saved. Early forward pressure ${p.forwardGames}/${p.games}; 2+ ships ${p.navalGames}/${p.games}; 2+ aircraft ${p.airGames}/${p.games}; 4+ miners ${p.economyGames}/${p.games}. Last: ${lastResult}, ${Math.floor(last.duration/60)}m ${last.duration%60}s; peak ${last.peakShips} ships, ${last.peakAircraft} aircraft, ${last.peakMiners} miners.${losses}${learning}`;}
    };
  }
  return {create,summarizeMatch,LIMIT};
});
