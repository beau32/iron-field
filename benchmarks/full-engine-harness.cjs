'use strict';
// Used only by the isolated loopback benchmark server. Never deployed to the game server.
const hook=String.raw`
  // This hook exists only in the benchmark server's in-memory copy of game.js.
  let benchClock=0,benchLastEvent=0,benchMetrics=null;
  const benchEmpty=()=>({shots:{player:0,enemy:0},damage:{player:0,enemy:0}});
  window.__ironBenchMetrics=()=>benchMetrics;
  function benchPlayerBot(){
    const team='player',own=unitsFor(team),hq=baseOf(team),enemy=baseOf('enemy');if(!hq||!enemy)return;
    const has=kind=>buildings.some(b=>b.team===team&&b.kind===kind&&b.hp>0);
    const build=(kind,limit=1)=>{
      if(buildings.filter(b=>b.team===team&&b.kind===kind&&b.hp>0).length>=limit||money(team)<STRUCTURE[kind].cost)return false;
      for(const radius of [8,12,16,20,24])for(let i=0;i<16;i++){
        const angle=i*Math.PI/8,point=hq.mesh.position.clone().add(new THREE.Vector3(Math.cos(angle)*radius,0,Math.sin(angle)*radius));
        if(!placementError(kind,point,team)){placeBuilding(point,kind,team);return true;}
      }return false;
    };
    if(powerFor(team).low)build('power',4);
    if(!has('garrison'))build('garrison');else if(!has('warFactory'))build('warFactory');
    if(own.filter(u=>u.kind==='miner').length<2&&!queueFor(team).some(q=>q.kind==='miner'))queueUnit('miner',team);
    const producer=producerFor('tank',team)?'tank':producerFor('rifleman',team)?'rifleman':null;
    if(producer&&!queueFor(team).some(q=>UNIT[q.kind].producer===UNIT[producer].producer))queueUnit(producer,team);
    const fighters=own.filter(u=>UNIT[u.kind].damage>0),visible=living().filter(e=>e.team==='enemy'&&visibleTo(e,team)&&stats(e).damage>0);
    for(const unit of fighters){
      const defender=visible.filter(e=>canAttack(unit,e)&&distance(unit,e)<Math.max(24,stats(e).range+10)).sort((a,b)=>distance(unit,a)-distance(unit,b))[0];
      if(defender)aiAttack(unit,defender);
      else if(elapsed>=75&&fighters.length>=3&&canAttack(unit,enemy))aiAttack(unit,enemy);
    }
  }
  window.__ironBench={
    start(config){
      if(!Number.isInteger(config.seed)||config.seed<1)throw Error('Invalid seed');
      if(!FIELD_MAP.catalog.some(m=>m.id===config.map))throw Error('Unknown map');
      if($('map-dialog').open)$('map-dialog').close();
      chooseMap(config.map);opponentStyle='ollama';raids=true;seed=config.seed>>>0;startGame();
      benchClock=0;benchLastEvent=0;benchMetrics=benchEmpty();
      return {summary:{...modelBattleSummary(true),profile:null},snapshot:battleLogSnapshot()};
    },
    apply(plan,model){
      const checked=FIELD_OPPONENT.validPlan(plan,Object.keys(UNIT),Object.keys(STRUCTURE).filter(k=>STRUCTURE[k].cost>0));
      if(!checked)throw Error('Invalid commander plan');acceptAIPlan(checked,model);
    },
    step(seconds){
      if(!benchMetrics||!Number.isInteger(seconds)||seconds<1||seconds>60)throw Error('Invalid benchmark step');
      benchMetrics=benchEmpty();
      for(let i=0;i<seconds*60&&!outcome;i++){
        if(elapsed>=benchClock){benchPlayerBot();benchClock=elapsed+6;}
        simulate(1/60);
      }
      const log=battleLog.export(),events=(log?.events||[]).filter(e=>e.id>benchLastEvent);
      if(events.length)benchLastEvent=events.at(-1).id;
      const intensity={shots:benchMetrics.shots,damage:benchMetrics.damage,
        unitsProduced:{player:events.filter(e=>e.type==='unit-created'&&e.data.team==='player').length,enemy:events.filter(e=>e.type==='unit-created'&&e.data.team==='enemy').length},
        unitsDestroyed:{player:events.filter(e=>e.type==='entity-destroyed'&&e.data.type==='unit'&&e.data.team==='player').length,enemy:events.filter(e=>e.type==='entity-destroyed'&&e.data.type==='unit'&&e.data.team==='enemy').length},
        structuresDestroyed:{player:events.filter(e=>e.type==='entity-destroyed'&&e.data.type==='building'&&e.data.team==='player').length,enemy:events.filter(e=>e.type==='entity-destroyed'&&e.data.type==='building'&&e.data.team==='enemy').length}};
      return {elapsed,winner,outcome,summary:{...modelBattleSummary(true),profile:null},snapshot:battleLogSnapshot(),intensity,events};
    },
    finish(){return {elapsed,winner,outcome,snapshot:battleLogSnapshot(),log:battleLog.export()};}
  };
`;
function instrument(source){
 const replace=(a,b)=>{if(!source.includes(a))throw Error('Game source changed; missing benchmark hook: '+a);source=source.replace(a,b);};
 replace('  async function requestModelPlan() {','  async function requestModelPlan() {\n    return; // Decisions are injected by the benchmark runner.');
 replace('  function fire(e, target) {','  function fire(e, target) {\n    const m=window.__ironBenchMetrics?.();if(m&&Object.hasOwn(m.shots,e.team))m.shots[e.team]++;');
 replace('    e.hp = Math.max(0, e.hp - amount); if (!e.hp) {','    const m=window.__ironBenchMetrics?.();if(m&&Object.hasOwn(m.damage,attackerTeam)&&hostile(e.team,attackerTeam))m.damage[attackerTeam]+=Math.max(0,Math.min(e.hp,amount));\n    e.hp = Math.max(0, e.hp - amount); if (!e.hp) {');
 const marker='  requestAnimationFrame(frame);\n})();';replace(marker,hook+'\n})();');
 return source;
}
module.exports={instrument};
