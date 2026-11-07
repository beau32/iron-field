'use strict';
// Used by the server adapter and the player's local connector; browsers never choose upstream URLs.
const {validPlan}=require('./opponent.js');
const definitions=require('./data.js');
const units=Object.keys(definitions.units),buildings=Object.keys(definitions.buildings).filter(k=>definitions.buildings[k].cost>0);
const base=(process.env.OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/$/,'');
const defaultModel=process.env.OLLAMA_MODEL||'qwen2.5:0.5b';
const timeout=Math.max(1500,Math.min(5000,Number(process.env.OLLAMA_TIMEOUT_MS)||5000));
let busy=false,nextAllowed=0,installed=[],statusUntil=0,discoveryError='';
const modelStates=new Map();
const stateFor=model=>{if(!modelStates.has(model))modelStates.set(model,{readyUntil:0,warmRetry:0,error:''});return modelStates.get(model);};
function modelName(value){if(value===undefined||value==='')return defaultModel;if(typeof value!=='string'||value.length>100)throw failure(400,'Invalid Ollama model.');return value;}
const failure=(status,message,retryAfterMs=10000)=>Object.assign(new Error(message),{status,retryAfterMs});
// A language model selects one strategy; game rules expand it into concrete priorities.
const choices={
  balanced:{style:'balanced',focus:'economy',unit:'auto',building:'auto'},
  rush:{style:'rush',focus:'production',unit:'tank',building:'auto'},
  defend:{style:'fortress',focus:'army',unit:'auto',building:'turret'},
  economy:{style:'economy',focus:'economy',unit:'auto',building:'auto'},
  air:{style:'air',focus:'production',unit:'gunship',building:'airfield'},
  'anti-air':{style:'balanced',focus:'army',unit:'rocket',building:'missileBattery'},
  siege:{style:'balanced',focus:'production',unit:'artillery',building:'auto'},
  'anti-armor':{style:'balanced',focus:'army',unit:'destroyer',building:'auto'},
  naval:{style:'balanced',focus:'production',unit:'frigate',building:'shipyard'}
};
const decisionVersion=9;
// Each variant is still subject to its parent operation's feasibility checks.
const variants={
  'raid-economy':{operation:'rush',focus:'economy',unit:'scout',why:'Use fast scouts to raid enemy miners and refineries.'},
  'raid-production':{operation:'rush',focus:'production',unit:'tank',why:'Use tanks to attack enemy production buildings.'},
  'siege-production':{operation:'siege',focus:'production',unit:'artillery',why:'Use artillery to pressure enemy production behind defenses.'},
  'air-economy':{operation:'air',focus:'economy',unit:'gunship',why:'Use gunships to attack exposed miners and refineries.'},
  'defend-counterattack':{operation:'defend',style:'balanced',focus:'army',unit:'tank',why:'Defend against the enemy force and assemble tanks for a counterattack.'},
  'defend-air':{operation:'anti-air',style:'fortress',focus:'army',unit:'rocket',why:'Fortify the base and recruit anti-air against aircraft.'},
  'defend-armor':{operation:'anti-armor',style:'fortress',focus:'army',unit:'destroyer',why:'Fortify the base and recruit armor counters.'}
};
const operationEvidence={
  economy:'Ore remains available and our mining income needs recovery or expansion.',
  defend:'Our base is under threat, our army is losing, or past early attacks suggest preparation.',
  rush:'Our ground attack force is strong enough to pressure the enemy now.',
  'anti-air':'Enemy aircraft or a recurring past air threat call for more anti-air counters.',
  'anti-armor':'The enemy has armored vehicles and our army lacks enough armor counters.',
  siege:'The enemy has multiple defensive structures and we need more long-range siege weapons.',
  air:'An air attack is feasible and can exploit weak enemy anti-air defenses.',
  naval:'Waterways are present and our fleet needs reinforcement.',
  balanced:'Our army can build a mixed force and attack exposed enemy economic targets.'
 };
Object.assign(operationEvidence,{
  'raid-economy':'Enemy miners or refineries are valuable targets for a fast scout raid.',
  'raid-production':'Enemy production buildings are valuable targets for a tank raid.',
  'siege-production':'Enemy defenses protect production that artillery can pressure.',
  'air-economy':'Gunships can raid enemy miners or refineries while bypassing ground defenses.',
  'defend-counterattack':'Our base needs protection and tanks can prepare a counterattack.',
  'defend-air':'Our base is threatened and enemy aircraft call for a fortified anti-air defense.',
  'defend-armor':'Our base is threatened and enemy armor calls for a fortified anti-armor defense.'
});
// Keep the evidence dictionary fixed so Ollama can reuse its prompt prefix on a small CPU.
const prefix=[
  'Command our army. Match battle evidence to an offered operation. Defend immediate danger, then exploit a winning attack. Visible contacts are current; global estimates can include hidden enemies. Player history shows tendencies, not guarantees. Queued counters count. If tied, prefer the first option.',
  ...Object.entries(operationEvidence).map(([name, evidence]) => name+' = '+evidence),
  'Return the selected name as a JSON string.'
].join('\n');
const schema=options=>({type:'string',enum:options});
const integer=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max;
function counts(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))throw failure(400,'Invalid army summary.');
  const result={};for(const k of keys){const n=value[k]??0;if(!integer(n,400))throw failure(400,'Invalid unit count.');if(n)result[k]=n;}return result;
}
function summarize(value){
  if(!value||!integer(value.elapsed,86400)||!integer(value.credits,1000000))throw failure(400,'Invalid battle summary.');
  const bounded=(v,fallback,max)=>{if(v===undefined)return fallback;if(!integer(v,max))throw failure(400,'Invalid strategic feedback.');return v;};
  const side=v=>{if(!v)throw failure(400,'Missing army.');const owned=counts(v.buildings,['base',...buildings]);return {units:counts(v.units,units),buildings:owned,ready:v.ready===undefined?owned:counts(v.ready,['base',...buildings]),queued:counts(v.queued||{},units),health:bounded(v.health,100,100),hqHealth:bounded(v.hqHealth,owned.base?100:0,100)};};
  const context=value.context||{};if(typeof context!=='object'||Array.isArray(context)||!integer(context.pressure??0,400)||typeof (context.water??false)!=='boolean'||typeof (context.lowPower??false)!=='boolean')throw failure(400,'Invalid tactical context.');
  const f=value.feedback||{};
  if(typeof f!=='object'||Array.isArray(f)||!['','balanced','rush','defend','economy','air','anti-air','siege','anti-armor','naval'].includes(f.operation||'')||!['Preparing','Building forces','Attacking','Defending','Regrouping'].includes(f.mode||'Preparing')||typeof(f.stalled??false)!=='boolean')throw failure(400,'Invalid operation feedback.');
  const feedback={operation:f.operation||'',mode:f.mode||'Preparing',stalled:f.stalled||false};
  if(f.tactic!==undefined){if(!['rules','flank-left','flank-right'].includes(f.tactic)||!['idle','moving','engaging','blocked'].includes(f.tacticPhase))throw failure(400,'Invalid tactical feedback.');feedback.tactic=f.tactic;feedback.tacticPhase=f.tacticPhase;}
  for(const key of ['age','lostValue','destroyedValue','income','raidAge','raidSize'])feedback[key]=bounded(f[key],0,key==='raidSize'?400:1000000);
  let contacts=null;
  if(value.contacts!==undefined&&value.contacts!==null){
    if(!Array.isArray(value.contacts)||value.contacts.length>8)throw failure(400,'Invalid visible contacts.');
    contacts=value.contacts.map(c=>{
      if(!c||!['base',...units,...buildings].includes(c.kind)||!Number.isInteger(c.x)||Math.abs(c.x)>1024||!Number.isInteger(c.z)||Math.abs(c.z)>1024||!integer(c.health,100)||!integer(c.distance,4096))throw failure(400,'Invalid visible contact.');
      return {kind:c.kind,x:c.x,z:c.z,health:c.health,distance:c.distance};
    });
  }
  let strategicMap=null;
  if(value.strategicMap!==undefined&&value.strategicMap!==null){
    const m=value.strategicMap,validRows=(rows,re)=>Array.isArray(rows)&&rows.length===5&&rows.every(row=>typeof row==='string'&&re.test(row));
    if(!m||typeof m!=='object'||Array.isArray(m)||!validRows(m.terrain,/^[?.~^=]{5}$/)||!validRows(m.friendly,/^[0-9]{5}$/)||!validRows(m.enemy,/^[0-9]{5}$/)||!Array.isArray(m.sites)||m.sites.length>16||!m.sites.every(s=>typeof s==='string'&&/^[A-E][1-5]:(?:(?:own|seen)-(?:hq|refinery|producer|defense)|ore)$/.test(s)))throw failure(400,'Invalid strategic map.');
    strategicMap={terrain:[...m.terrain],friendly:[...m.friendly],enemy:[...m.enemy],sites:[...m.sites]};
  }
  let profile=null;
  if(value.profile!==undefined&&value.profile!==null){
    const p=value.profile,keys=['games','forwardGames','navalGames','airGames','economyGames'];
    if(!p||typeof p!=='object'||Array.isArray(p)||!keys.every(k=>integer(p[k],20))||!p.games||keys.slice(1).some(k=>p[k]>p.games))throw failure(400,'Invalid player history.');
    profile=Object.fromEntries(keys.map(k=>[k,p[k]]));
    if(p.learning!==undefined&&p.learning!==null){
      const l=p.learning,lk=['early','air','naval','miner'];
      if(!l||!integer(l.samples,5)||!l.samples||l.samples!==p.games||!lk.every(k=>integer(l[k],l.samples))||!l.outcomes||typeof l.outcomes!=='object'||Array.isArray(l.outcomes))throw failure(400,'Invalid observed player history.');
      const outcomes={};for(const [op,row] of Object.entries(l.outcomes)){if(!Object.hasOwn(choices,op)||!row||!integer(row.positive,100)||!integer(row.negative,100))throw failure(400,'Invalid operation history.');outcomes[op]={positive:row.positive,negative:row.negative};}
      profile.learning={samples:l.samples,...Object.fromEntries(lk.map(k=>[k,l[k]])),outcomes};
    }
    if(p.evidence!==undefined&&p.evidence!==null){
      const e=p.evidence,ek=['completedGames','wins','economySamples','fastEconomyGames','eventSamples','minerLossGames','productionLossGames','enemyProductionLossGames'];
      if(!e||typeof e!=='object'||Array.isArray(e)||!ek.every(k=>integer(e[k],p.games))||e.wins>e.completedGames||e.fastEconomyGames>e.economySamples||[e.minerLossGames,e.productionLossGames,e.enemyProductionLossGames].some(n=>n>e.eventSamples))throw failure(400,'Invalid player history evidence.');
      profile.evidence=Object.fromEntries(ek.map(k=>[k,e[k]]));
    }
  }
  return {elapsed:value.elapsed,credits:value.credits,own:side(value.own),opponent:side(value.opponent),contacts,strategicMap,profile,playerDescription:describePlayer(profile),context:{pressure:context.pressure||0,water:Boolean(context.water),lowPower:Boolean(context.lowPower),oreRemaining:bounded(context.oreRemaining,1,1000000)},feedback};
}
// Translate only measured history into tentative language. Never accept free-form player text.
function describePlayer(p){
  if(!p)return 'No saved player history; strengths and weaknesses are unknown.';
  if(p.learning){const l=p.learning,labels=[['early','armed units near our base early'],['air','aircraft'],['naval','ships'],['miner','miners']];const seen=labels.filter(([key])=>l[key]>0).map(([key,label])=>`${label} observed in ${l[key]}/${l.samples} recent matches`);return (seen.length?'Observed player style: '+seen.join('; ')+'.':'No listed player tactics were observed in recent matches.')+' Sightings are incomplete; absence is not proof. History is a tendency, not a guarantee.';}
  const repeated=n=>p.games>=2&&n>=2&&n/p.games>=.5,style=[];
  if(repeated(p.forwardGames))style.push(`moved armed units near our HQ early in ${p.forwardGames}/${p.games} matches`);
  if(repeated(p.navalGames))style.push(`fielded multiple ships in ${p.navalGames}/${p.games}`);
  if(repeated(p.airGames))style.push(`fielded multiple aircraft in ${p.airGames}/${p.games}`);
  if(repeated(p.economyGames))style.push(`expanded to at least four miners in ${p.economyGames}/${p.games}`);
  const parts=[style.length?'Observed player style: '+style.join('; ')+'.':'Player style: insufficient repeated evidence for a consistent tactic.'];
  const e=p.evidence,strength=[],weakness=[];
  if(e){
    if(e.wins)strength.push(`won ${e.wins}/${e.completedGames} completed matches`);
    if(e.fastEconomyGames)strength.push(`reached 3000 ore around minute three in ${e.fastEconomyGames}/${e.economySamples} eligible matches`);
    if(e.enemyProductionLossGames)strength.push(`opposing production was destroyed in ${e.enemyProductionLossGames}/${e.eventSamples} recorded matches`);
    if(e.minerLossGames)weakness.push(`lost at least two miners in ${e.minerLossGames}/${e.eventSamples} recorded matches`);
    if(e.productionLossGames)weakness.push(`lost production structures in ${e.productionLossGames}/${e.eventSamples} recorded matches`);
  }
  parts.push(strength.length?'Possible strengths: '+strength.join('; ')+'.':'Possible strengths: insufficient evidence.');
  parts.push(weakness.length?'Possible vulnerabilities: '+weakness.join('; ')+'.':'Possible vulnerabilities: insufficient evidence.');
  parts.push('Samples can miss events; these patterns are not guarantees.');return parts.join(' ');
}
function contactFacts(summary){
  if(summary.contacts===null)return 'Visible contacts unavailable.';
  if(!summary.contacts.length)return 'Visible contacts: none.';
  return 'Visible contacts (kind x,z health% distance from our HQ): '+summary.contacts.map(c=>`${c.kind} ${c.x},${c.z} ${c.health}% ${c.distance}`).join('; ')+'.';
}
function mapFacts(summary){
  const m=summary.strategicMap;if(!m)return 'Strategic map unavailable.';
  const rows=m.terrain.map((row,i)=>`${i+1} ${row} ${m.friendly[i]} ${m.enemy[i]}`).join('\n');
  return `Strategic map: north is row 1, west is column A; each sector is approximate, not a route. Terrain ? unknown, . explored, ~ water, ^ ridge, = bridge (features can share sectors). F is our combat units, E visible enemy combat units; counts cap at 9; 0 does not prove a sector is clear.\n  ABCDE F E\n${rows}\nSites: ${m.sites.length?m.sites.join(', '):'none seen'}.`;
}
function profileFacts(summary){
  const p=summary.profile;if(!p)return 'No saved player history.';
  if(p.learning){const l=p.learning,rows=Object.entries(l.outcomes).filter(([,r])=>r.positive+r.negative>=2).map(([op,r])=>`${op}: ${r.positive} favorable and ${r.negative} unfavorable combat windows`);return `Recent observed history (${l.samples} matches): ${summary.playerDescription} ${rows.length?'Past operation results (60-second combat indicators, not proof of causation): '+rows.join('; ')+'.':'Insufficient operation outcome evidence.'}`;}
  return `Past ${p.games} solo matches (tendencies, not current sightings): early forward force ${p.forwardGames}/${p.games}; 2+ ships ${p.navalGames}/${p.games}; 2+ aircraft ${p.airGames}/${p.games}; 4+ miners ${p.economyGames}/${p.games}. ${summary.playerDescription||describePlayer(p)}`;
}
async function status(requested){
  const model=modelName(requested);
  if(Date.now()>=statusUntil){
    try{
      const r=await fetch(base+'/api/tags',{signal:AbortSignal.timeout(3000)});if(!r.ok)throw Error();const data=await r.json();
      installed=(data.models||[]).filter(m=>typeof m.name==='string'&&m.name.length<=100&&(!m.capabilities||m.capabilities.includes('completion'))).slice(0,100).map(m=>({name:m.name,size:Number(m.size)||0,thinking:Boolean(m.capabilities?.includes('thinking'))})).sort((a,b)=>a.size-b.size);
      discoveryError='';
    }catch{installed=[];discoveryError='Ollama is unavailable on the selected computer.';}
    statusUntil=Date.now()+15000;
  }
  const available=installed.some(m=>m.name===model),state=available?stateFor(model):null,ready=Boolean(state&&Date.now()<state.readyUntil);
  return {available,model,defaultModel,decisionVersion,models:installed.map(m=>({...m})),ready,message:discoveryError||(!available?`Model ${model} is not installed on the selected computer.`:state.error||(ready?'Ollama ready':'Model waiting to warm up.'))};
}
function assess(summary){
  const count=(side,test,queued=false)=>Object.entries(queued?side.queued:side.units).reduce((n,[k,v])=>n+(test(definitions.units[k],k)?v:0),0);
  const aa=u=>u.damage>0&&['air','all'].includes(u.targets),armor=u=>u.damage>0&&!u.aircraft&&!u.infantry&&!u.naval;
  const value=(side,ground=false)=>Math.round(Object.entries(side.units).reduce((n,[k,v])=>n+(definitions.units[k].damage&&(!ground||definitions.units[k].targets!=='air')?definitions.units[k].cost*v:0),0)*side.health/100);
  const own=summary.own,enemy=summary.opponent;
  return {ownValue:value(own),attackValue:value(own,true),enemyValue:value(enemy),army:count(own,u=>u.damage>0&&u.targets!=='air'),miners:(own.units.miner||0)+(own.queued.miner||0),
    air:count(enemy,u=>u.aircraft),aa:count(own,aa)+count(own,aa,true),enemyAA:count(enemy,aa)+(enemy.ready.missileBattery||0)*2,
    armor:count(enemy,armor),armorCounters:(own.units.destroyer||0)+(own.queued.destroyer||0),
    defenses:Object.entries(enemy.ready).reduce((n,[k,v])=>n+(definitions.buildings[k].defense?v:0),0),
    siege:(own.units.artillery||0)+(own.queued.artillery||0)+(own.units.battleship||0)+(own.queued.battleship||0),
    ships:count(enemy,u=>u.naval),ownShips:count(own,u=>u.naval)+count(own,u=>u.naval,true)};
}
function investmentCost(summary,unit){
  const visited=new Set(),own=summary.own;
  function buildingCost(kind){
    if(own.buildings[kind]||visited.has(kind))return 0;
    visited.add(kind);const def=definitions.buildings[kind];
    return def.cost+(def.requires||[]).reduce((n,k)=>n+buildingCost(k),0);
  }
  return definitions.units[unit].cost+buildingCost(definitions.units[unit].producer);
}
function candidates(summary){
  const m=assess(summary),own=summary.own,f=summary.feedback,pressure=summary.context.pressure;
  const prior=key=>summary.profile?.games>=2&&summary.profile[key]>=2&&summary.profile[key]/summary.profile.games>=.5;
  const income=Boolean(own.ready.refinery&&(own.units.miner||0)>0&&summary.context.oreRemaining&&(f.age<45||f.income>0));
  const canInvest=unit=>investmentCost(summary,unit)<=summary.credits+(income?350:0);
  const losing=f.lostValue>Math.max(200,f.destroyedValue*1.5),advantage=m.attackValue>Math.max(250,m.enemyValue*1.25);
  const list=[];const add=(name,score,why)=>list.push({name,score,why});
  add('balanced',35,'mixed force; attack exposed economy');
  if(summary.context.oreRemaining&&(m.miners<2||!own.buildings.refinery))add('economy',100,'restore ore income');
  else if(summary.context.oreRemaining&&m.miners<4&&pressure<2&&summary.credits>=120&&m.ownValue>=m.enemyValue*.8&&!(advantage&&m.army>=5))add('economy',42,'safe income expansion');
  if(pressure>=2||own.hqHealth<45&&pressure||losing||m.ownValue<m.enemyValue*.65)add('defend',pressure>=3?110:losing?65:55,'protect base and rebuild force');
  else if(summary.elapsed<180&&prior('forwardGames'))add('defend',48,'prepare for previously observed early pressure');
  if(m.air>m.aa)add('anti-air',pressure?105:85,'aircraft exceed mobile anti-air, including queues');
  else if(!m.air&&m.aa<2&&income&&!pressure&&prior('airGames')&&canInvest('rocketTrooper'))add('anti-air',48,'prepare for recurring aircraft use');
  if(m.defenses>=2&&m.siege<Math.max(2,Math.ceil(m.defenses/2))&&canInvest('artillery'))add('siege',75,'outrange enemy defenses');
  if(m.armor>=3&&m.armorCounters<Math.ceil(m.armor/3)&&canInvest('destroyer'))add('anti-armor',70,'fill armor-counter gap');
  if(!pressure&&m.army>=3&&!losing&&m.attackValue>=m.enemyValue*.85)add('rush',advantage||summary.opponent.hqHealth<45?90:50,'pressure production or finish vulnerable HQ');
  if(!pressure&&income&&(!advantage||m.defenses>=2)&&m.enemyAA<Math.max(2,m.army/3)&&canInvest('gunship'))add('air',m.defenses>=2?60:40,'bypass ground defenses with air power');
  if(summary.context.water&&canInvest('frigate')&&m.ownShips<Math.max(2,m.ships))add('naval',m.ships>=2?75:prior('navalGames')?50:38,prior('navalGames')?'prepare for recurring naval use':'contest waterways and shore targets');
  // A successful operation gets continuity, not a permanent lock. Stalled/loss-heavy
  // operations lose their bonus; an emergency can still take precedence.
  for(const item of list)if(item.name===f.operation){
    if(f.stalled||losing)item.score-=35;
    else if(f.mode==='Attacking'||f.age<45||f.destroyedValue>f.lostValue)item.score+=12;
  }
  // A small, bounded preference based on repeated recent outcomes; tactical emergencies remain dominant.
  for(const item of list){const r=summary.profile?.learning?.outcomes?.[item.name];if(r&&r.positive+r.negative>=2)item.score+=Math.max(-8,Math.min(8,(r.positive-r.negative)*4));}
  const finish=summary.opponent.hqHealth<=50&&advantage&&m.army>=3&&!pressure&&!losing;
  return list.filter(c=>!finish||['rush','balanced'].includes(c.name)).sort((a,b)=>b.score-a.score).slice(0,4);
}
// Small adversarial macro-model. These transitions are hand-written estimates,
// not simulations of the game engine or predictions of the player's actions.
function strategicLookahead(summary,options){
  const m=assess(summary),clamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,v));
  const start={own:clamp(m.ownValue/100,0,80),enemy:clamp(m.enemyValue/100,0,80),hq:summary.own.hqHealth,enemyHQ:summary.opponent.hqHealth,
    income:summary.context.oreRemaining&&summary.own.ready.refinery?clamp((summary.own.units.miner||0),0,6):0,
    cash:clamp(summary.credits/100,0,30),air:m.air,aa:m.aa,armor:m.armor,counters:m.armorCounters,defenses:m.defenses,pressure:summary.context.pressure,shield:0,water:summary.context.water};
  const parent=name=>variants[name]?.operation||name;
  const project=(state,action,response)=>{
    const s={...state};s.shield=0;s.cash=clamp(s.cash+s.income*.7,0,30);
    const spend=(cost,gain)=>{if(s.cash>=cost){s.cash-=cost;s.own=clamp(s.own+gain,0,80);return true;}return false;};
    switch(parent(action)){
      case 'economy':if(s.cash>=1.5){s.cash-=1.5;s.income=clamp(s.income+1.5,0,6);}break;
      case 'defend':s.shield=4;spend(2,2);break;
      case 'anti-air':s.shield=1;if(spend(2.5,1.5))s.aa+=2;break;
      case 'anti-armor':if(spend(3,2))s.counters+=2;break;
      case 'siege':if(spend(2.5,2))s.defenses=Math.max(0,s.defenses-1);break;
      case 'air':spend(3,3);break;
      case 'naval':if(s.water)spend(3,2.5);break;
      case 'rush':{const attack=Math.max(0,s.own*.5-s.enemy*.22-s.defenses*.8);s.enemy=clamp(s.enemy-attack*.35,0,80);s.own=clamp(s.own-s.enemy*.08,0,80);s.enemyHQ=clamp(s.enemyHQ-attack*.45);break;}
      default:spend(2,2);
    }
    if(response==='assault'){
      const airGap=Math.max(0,s.air-s.aa)*1.3,armorGap=Math.max(0,s.armor-s.counters)*.3;
      const impact=Math.max(0,s.enemy*.18+airGap+armorGap+s.pressure*.6-s.own*.1-s.shield);
      s.hq=clamp(s.hq-impact*2);s.own=clamp(s.own-impact*.45,0,80);s.income=clamp(s.income-impact*.12,0,6);
    }else if(response==='expand')s.enemy=clamp(s.enemy+3.5,0,80);
    else {const raid=Math.max(0,2.5-s.shield*.45-s.own*.04);s.income=clamp(s.income-raid*.55,0,6);s.own=clamp(s.own-raid*.4,0,80);}
    return s;
  };
  const evaluate=s=>s.hq*2-s.enemyHQ*1.2+s.own*3-s.enemy*2.5+s.income*6+s.cash*.3;
  const actions=[...new Set(options.map(o=>o.name))].slice(0,6),responses=['assault','expand','raid'];
  return actions.map(name=>{
    let worst=Infinity;
    for(const response of responses){const next=project(start,name,response);let best=-Infinity;
      for(const follow of actions){let followWorst=Infinity;for(const reply of responses)followWorst=Math.min(followWorst,evaluate(project(next,follow,reply)));best=Math.max(best,followWorst);}
      worst=Math.min(worst,best);
    }
    return {name,value:Math.round(worst*10)/10};
  }).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name));
}
function offeredOperations(summary){
  const offered=candidates(summary);
  if(summary.context.pressure>=3&&summary.own.hqHealth<=45){
    const defensive=offered.filter(option=>['defend','anti-air','anti-armor'].includes(option.name));
    if(defensive.length>=2)return defensive;
  }
  // System One needs two options. Holding the base is always feasible.
  if(offered.length===1)offered.push({name:'defend',why:'hold the base and assemble a stronger force'});
  // Keep an emergency shortlist focused and preserve a finishing attack on a weak HQ.
  if(!(summary.context.pressure>=3&&summary.own.hqHealth<=45)&&summary.opponent.hqHealth>50){
    const available=new Set(offered.map(c=>c.name));
    const orderedVariants=Object.entries(variants).sort((a,b)=>summary.context.pressure?(Number(b[0].startsWith('defend-'))-Number(a[0].startsWith('defend-'))):0);
    for(const [name,variant] of orderedVariants){
      if(offered.length>=6)break;
      const enemy=summary.opponent;
      if((name==='defend-air'||name==='defend-armor')&&!summary.context.pressure)continue;
      const economyTarget=Boolean(enemy.units.miner||enemy.buildings.refinery);
      const productionTarget=Boolean(enemy.buildings.warFactory||enemy.buildings.garrison||enemy.buildings.airfield||enemy.buildings.shipyard);
      if((name==='raid-economy'||name==='air-economy')&&!economyTarget)continue;
      if((name==='raid-production'||name==='siege-production')&&!productionTarget)continue;
      if(available.has(variant.operation))offered.push({name,why:variant.why});
    }
  }
  // A modest tie-breaker among already-feasible options. Emergency and finishing
  // filters above remain authoritative; the model still makes the final choice.
  if(offered.length>1&&summary.context.pressure<3&&summary.own.hqHealth>45){
    const estimates=strategicLookahead(summary,offered),rank=new Map(estimates.map((e,i)=>[e.name,i]));
    offered.sort((a,b)=>((b.score??0)-(rank.get(b.name)??estimates.length)*2)-((a.score??0)-(rank.get(a.name)??estimates.length)*2));
  }
  return offered;
}
function relevantStrategies(summary){return candidates(summary).map(c=>c.name);}
function facts(summary){
  const m=assess(summary),f=summary.feedback;
  const economy=!summary.context.oreRemaining?'ore exhausted':!summary.own.ready.refinery||!(summary.own.units.miner||0)?'broken':f.age>=45&&!f.income?'stalled':'working';
  const force=m.ownValue>m.enemyValue*1.25?'stronger':m.ownValue<m.enemyValue*.7?'weaker':'even';
  const lines=[`Income ${economy}. Cash ${summary.credits}. Global force estimate ${force}. Attack ${m.army} units, ${m.attackValue} vs ${m.enemyValue}. Base threats ${summary.context.pressure}.`];
  if(m.air)lines.push(`Aircraft/counters ${m.air}/${m.aa}.`);
  if(m.armor>=3)lines.push(`Armor/counters ${m.armor}/${m.armorCounters}.`);
  if(m.defenses>=2)lines.push(`Defenses/siege ${m.defenses}/${m.siege}.`);
  if(summary.context.water)lines.push(`Ships ours/theirs ${m.ownShips}/${m.ships}.`);
  lines.push(`Enemy miners/refineries ${summary.opponent.units.miner||0}/${summary.opponent.buildings.refinery||0}; factories/garrisons/airfields/shipyards ${summary.opponent.buildings.warFactory||0}/${summary.opponent.buildings.garrison||0}/${summary.opponent.buildings.airfield||0}/${summary.opponent.buildings.shipyard||0}.`);
  if(summary.opponent.hqHealth<=50)lines.push(`Enemy HQ ${summary.opponent.hqHealth}%.`);
  if(summary.own.hqHealth<45)lines.push(`Our HQ ${summary.own.hqHealth}%.`);
  if(summary.context.lowPower)lines.push('Low power.');
  if(f.operation)lines.push(`Previous ${f.operation}: ${f.stalled?'stalled':f.lostValue>Math.max(200,f.destroyedValue*1.5)?'losing':f.mode==='Attacking'?'attacking':'building'}.`);
  if(f.tactic)lines.push(`Current maneuver ${f.tactic}: ${f.tacticPhase}.`);
  lines.push(contactFacts(summary));
  if(summary.strategicMap)lines.push(mapFacts(summary));
  lines.push(profileFacts(summary));
  return lines.join(' ');
}
function planFor(strategy,summary){
  const variant=variants[strategy],operation=variant?.operation||strategy;
  const plan={...choices[operation],operation,...(variant?{directive:strategy,focus:variant.focus,unit:variant.unit,...(variant.style?{style:variant.style}:{})}:{})},m=assess(summary),ready=summary.own.ready;
  if(strategy==='anti-air'){
    plan.unit=ready.airfield&&summary.credits>=definitions.units.interceptor.cost?'interceptor':ready.garrison&&(!ready.warFactory||summary.credits<definitions.units.rocket.cost)?'rocketTrooper':'rocket';
    plan.building=summary.context.pressure&&ready.warFactory&&!ready.missileBattery&&summary.credits>=definitions.buildings.missileBattery.cost?'missileBattery':'auto';
  }
  if(['balanced','rush'].includes(strategy)&&summary.opponent.hqHealth<=50&&m.attackValue>m.enemyValue*1.2)plan.focus='hq';
  return validPlan(plan,units,buildings);
}
function promptFor(summary,options=offeredOperations(summary)){
  const base=options.filter(o=>!o.name.includes('@'));
  const projected=strategicLookahead(summary,base).map(o=>o.name).join(' > ');
  return prefix+'\n'+facts(summary)+'\nApproximate two-step worst-case ranking (simplified, not a prediction): '+projected+'.\nChoose only: '+options.map(c=>c.name).join(',')+'.';
}
function modelOptions(summary,offered=offeredOperations(summary)){
  const options=offered.map(o=>({...o}));
  const ground=Object.entries(summary.own.units).reduce((n,[kind,count])=>{const u=definitions.units[kind];return n+(u.damage>0&&!u.aircraft&&!u.naval&&u.targets!=='air'?count:0);},0);
  if(ground>=3&&!summary.context.pressure)for(const o of offered){
    const operation=variants[o.name]?.operation||o.name;
    if(!['balanced','rush','siege'].includes(operation))continue;
    for(const side of ['left','right'])options.push({name:o.name+'@'+side,why:o.why+`; approach via a ${side} flank waypoint before attacking`});
  }
  return options;
}
function modelPlanFor(choice,summary){
  const [strategy,side,...extra]=choice.split('@');if(extra.length||side&&!['left','right'].includes(side))return null;
  const plan=planFor(strategy,summary);if(!plan)return null;
  return validPlan({...plan,tactic:side?'flank-'+side:'rules'},units,buildings);
}
async function infer(model,summary,signal){
  const offered=modelOptions(summary),options=offered.map(c=>c.name);
  const prompt=promptFor(summary,offered)+'\nPlain names use game tactics; @left or @right chooses a flanking approach relative to our force facing the target.';
  const r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({model,stream:false,...((process.env.OLLAMA_THINK==='false'||installed.find(m=>m.name===model)?.thinking)?{think:false}:{}),format:schema(options),keep_alive:'30m',options:{temperature:0,num_predict:24,num_ctx:1536,num_thread:4},messages:[{role:'user',content:prompt}]})});
  if(!r.ok)throw Error('Ollama unavailable');
  const result=await r.json(),parsed=JSON.parse(result.message?.content);
  if(!options.includes(parsed))throw Error('Invalid model strategy');
  const selected=modelPlanFor(parsed,summary);if(!selected)throw Error('Invalid model plan');
  return selected;
}
async function warmup(requested){
  const info=await status(requested);if(!info.available)return;
  const model=info.model,state=stateFor(model);
  if(busy||Date.now()<state.warmRetry)return;
  busy=true;state.warmRetry=Date.now()+60000;state.error='';
  try {
    // Prime this model's instruction prefix; discard the synthetic decision.
    await infer(model,summarize({elapsed:120,credits:400,own:{units:{miner:2,tank:4},buildings:{base:1,power:1,refinery:1,garrison:1,warFactory:1}},opponent:{units:{tank:3},buildings:{base:1,turret:2}}}),AbortSignal.timeout(30000));
    state.readyUntil=Date.now()+25*60000;
  }catch{state.readyUntil=0;state.error=`${model} could not warm up within 30 seconds or returned invalid output. Try a smaller model.`;}
  finally{busy=false;}
}
async function plan(input,signal){
  const summary=summarize(input),info=await status(input.model);
  if(!info.available)throw failure(503,info.message);
  const model=info.model,state=stateFor(model);
  if(busy||Date.now()<nextAllowed)throw failure(429,'Local AI is preparing or busy',2000);
  if(Date.now()>=state.readyUntil){
    if(Date.now()<state.warmRetry)throw failure(503,state.error||`${model} is warming up`,10000);
    void warmup(model);throw failure(503,`${model} is warming up`,2000);
  }
  busy=true;
  const controller=new AbortController(),cancel=()=>controller.abort();
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  const timer=setTimeout(cancel,timeout);
  try{
    const started=Date.now();
    const decision=await infer(model,summary,controller.signal);state.readyUntil=Date.now()+25*60000;state.error='';
    return {plan:decision,lookahead:strategicLookahead(summary,offeredOperations(summary)).map(o=>o.name),model,decisionVersion,provider:'ollama',latencyMs:Date.now()-started};
  }catch(error){if(signal.aborted)throw failure(499,'Commander request cancelled.');throw failure(503,`${model} missed its five-second deadline or returned an invalid strategy. Try a smaller model.`);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);busy=false;nextAllowed=Date.now()+2000;}
}
module.exports={offeredOperations,strategicLookahead,modelOptions,modelPlanFor,operationEvidence,status,plan,summarize,warmup,relevantStrategies,choices,assess,candidates,planFor,promptFor,contactFacts,mapFacts,profileFacts,decisionVersion};
