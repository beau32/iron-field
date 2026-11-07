'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const THREE=require('../vendor/three.min.js');
const {units:UNIT,buildings:STRUCTURE}=require('../data.js');
const {styles}=require('../opponent.js');
const source=fs.readFileSync(require.resolve('../game.js'),'utf8');
function gameFunction(name){
  const start=source.indexOf('  function '+name+'(');
  const end=source.indexOf('\n  function ',start+3);
  assert(start>=0&&end>start,name);
  return source.slice(start,end);
}
function battle(harassers,extraGuards=0,plan={focus:'hq'},blocked=()=>false){
  let id=0;
  const troops=[],buildings=[],shots=[];
  function create(kind,team,x){
    const def=UNIT[kind]||STRUCTURE[kind];
    const entity={id:++id,team,kind,type:UNIT[kind]?'unit':'building',hp:def.hp,maxHp:def.hp,
      cooldown:0,turret:{rotation:{}},body:{rotation:{}},mesh:{position:new THREE.Vector3(x,0,0)}};
    (UNIT[kind]?troops:buildings).push(entity);
    return entity;
  }
  create('base','enemy',0);
  const objective=create('base','player',70);
  const guard=create('tank','enemy',1);
  for(let i=0;i<8;i++)create('tank','enemy',30+i);
  for(let i=0;i<extraGuards;i++)create('tank','enemy',1+i);
  const threats=harassers.map(kind=>create(kind,'player',7));
  const stats=e=>UNIT[e.kind]||STRUCTURE[e.kind];
  const distance=(a,b)=>a.mesh.position.distanceTo(b.mesh.position);
  const noop=()=>{};
  const ctx={THREE,UNIT,buildings,HALF_X:120,HALF_Z:100,net:null,raids:true,elapsed:10,nextRaid:0,wave:0,enemyCredits:0,opponentStyle:'ollama',
    unitsFor:t=>troops.filter(u=>u.team===t&&u.hp>0),living:()=>[...troops,...buildings].filter(e=>e.hp>0),
    baseOf:t=>buildings.find(b=>b.team===t),aiPolicy:()=>styles.rush,currentModelPlan:()=>plan,
    active:b=>b.hp>0,distance,stats,isBuilding:e=>e.type==='building',isAir:e=>Boolean(UNIT[e.kind]?.aircraft),
    isNaval:()=>false,canAttack:(u,e)=>!UNIT[e.kind]?.aircraft||['all','air'].includes(stats(u).targets),
    reach:u=>stats(u).range,visibleTo:()=>true,aiStrength:e=>stats(e).damage*Math.sqrt(e.hp)/stats(e).reload,
    aiSuperweapons:noop,updateAIHistory:noop,requestModelPlan:noop,aiEconomy:noop,aiLog:noop,announce:noop,aiTactic:noop,
    serviceCompatible:()=>false,clearRoute:noop,blocked,rotateToward:noop,closestEnemy:()=>null,
    fire:(u,target)=>shots.push(target.id)};
  vm.createContext(ctx);
  vm.runInContext(['resetCommander','aiMove','aiAttack','aiFocusTarget','aiObjective','aiFlankWaypoint','aiEngagement','guardsForHarasser','guardsForThreats','raidHasStalled','aiRegroup','aiRepairDestination','aiServiceDamagedUnits','aiThreatensAsset','aiMinerShelter','updateCommander','updateCombat'].map(gameFunction).join('\n'),ctx);
  ctx.commander=ctx.resetCommander();
  ctx.updateCommander();
  return {ctx,guard,objective,threats,troops,shots};
}
const fight=battle(['scout']);
assert(fight.ctx.commander.raidSize>=4,'launch with a covered harasser');
assert(!fight.guard.raid&&fight.guard.attackTarget===fight.threats[0],'guard actually engages scout');
const raiders=fight.troops.filter(u=>u.raid);
assert(raiders.every(u=>u.attackTarget===fight.objective),'strike force receives HQ attack order');
fight.ctx.elapsed=12;fight.ctx.updateCommander();
for(const u of raiders)u.mesh.position.x=68;
fight.ctx.elapsed=78;fight.ctx.updateCommander();
assert(raiders.every(u=>u.raid),'advancing raid survives old fixed expiry');
fight.ctx.updateCombat(raiders[0],.02);
assert(fight.shots.includes(fight.objective.id),'combat loop fires on the selected objective');
fight.objective.hp-=10;fight.ctx.elapsed=130;fight.ctx.updateCommander();
assert(raiders.every(u=>u.raid),'objective damage extends a productive raid');
fight.ctx.elapsed=197;fight.ctx.updateCommander();
assert(raiders.every(u=>!u.raid),'stalled raid eventually regroups');
assert.equal(battle(['gunship']).ctx.commander.raidSize,0,'uncovered air threat keeps army home');
assert(battle(['scout','tank'],2).ctx.commander.raidSize>=4,'covered threats release remaining strike force');
assert.equal(battle(['gunship','gunship','gunship']).ctx.commander.raidSize,0,'uncovered threats retain defenders');
const navalAttack=battle([]);
assert(navalAttack.ctx.commander.raidSize>0,'force initially attacks');
navalAttack.troops.push({id:999,team:'player',kind:'battleship',type:'unit',hp:UNIT.battleship.hp,maxHp:UNIT.battleship.hp,mesh:{position:new THREE.Vector3(25,0,0)}});
navalAttack.ctx.elapsed=12;navalAttack.ctx.updateCommander();
assert.equal(navalAttack.ctx.commander.raidSize,0,'single uncovered long-range attacker recalls raid to protect base');
const flank=battle([],0,{focus:'hq',tactic:'flank-left'});assert.equal(flank.ctx.commander.tacticPhase,'moving');const waypoint=flank.ctx.commander.tacticWaypoint;assert(waypoint.z<0,'left flank is left relative to the direction of travel');const flankers=flank.troops.filter(u=>u.raid);assert(flankers.length>=4);assert(flankers.every(u=>u.destination?.distanceTo(waypoint)<.1),'model maneuver gives the strike force a waypoint');assert(!flank.guard.raid,'home defense remains reserved');
flankers.forEach(u=>u.mesh.position.copy(waypoint));flank.ctx.elapsed=12;flank.ctx.updateCommander();assert.equal(flank.ctx.commander.tacticPhase,'engaging');assert(flankers.every(u=>u.attackTarget===flank.objective),'force attacks after reaching the waypoint');
const stalled=battle([],0,{focus:'hq',tactic:'flank-right'});assert(stalled.ctx.commander.tacticWaypoint.z>0);stalled.ctx.elapsed=36;stalled.ctx.updateCommander();assert.equal(stalled.ctx.commander.tacticPhase,'blocked');assert(stalled.troops.some(u=>u.raid&&u.attackTarget===stalled.objective),'stalled maneuver falls back to normal attack');
const blockedFlank=battle([],0,{focus:'hq',tactic:'flank-left'},()=>true);assert.equal(blockedFlank.ctx.commander.tacticPhase,'blocked');assert(blockedFlank.troops.some(u=>u.raid&&u.attackTarget===blockedFlank.objective),'blocked waypoint falls back immediately');
console.log('PASS covered scout, guard and HQ attack orders, actual firing, productive long raid, stalled raid, uncovered and multiple threats.');
