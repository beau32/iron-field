'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const {units:UNIT}=require('../data.js'),source=fs.readFileSync(require.resolve('../game.js'),'utf8');
function extract(name){const start=source.indexOf('  function '+name+'('),end=source.indexOf('\n  function ',start+3);assert(start>=0&&end>start,name);return source.slice(start,end);}
// Match-log positions: the second miner lies inside navigation clearance of turret 88.
const miner={kind:'miner',team:'enemy',radius:.95,hp:190,mesh:{position:new THREE.Vector3(66.7,0,-34.6)}};
const turret={kind:'turret',radius:1.25,hp:420,mesh:{position:new THREE.Vector3(66.2,0,-32.3)}};
const ctx={THREE,UNIT,units:[miner],buildings:[turret],MAP:{obstacles:[]},HALF_X:93,HALF_Z:74,
 terrainAllows:()=>true,terrainBlocked:()=>false,isAir:()=>false,isNaval:()=>false};
vm.createContext(ctx);vm.runInContext(['blocked','resolveCollisions'].map(extract).join('\n'),ctx);
assert(ctx.blocked(miner.mesh.position.x,miner.mesh.position.z,miner.radius),'logged miner starts inside the routing safety clearance');
ctx.resolveCollisions();assert(!ctx.blocked(miner.mesh.position.x,miner.mesh.position.z,miner.radius),'collision resolution must clear the same space required by the pathfinder');
const q=[],own=[{kind:'miner'},{kind:'miner'}],policy={miners:2},minerCtx={UNIT,fields:[{amount:1000}],enemyCredits:200,remoteQueue:q,isModelOpponent:()=>true,aiMinerTarget:policy=>Math.max(policy.miners,minerCtx.enemyCredits>=UNIT.miner.cost+300?4:3),producerFor:()=>true,queueUnit:(kind,team)=>q.push({kind,team}),aiBudgetWait:()=>false,commander:{}};
vm.createContext(minerCtx);vm.runInContext(extract('aiEnsureMiners'),minerCtx);
const count=k=>own.filter(x=>x.kind===k).length+q.filter(x=>x.kind===k).length;
assert(minerCtx.aiEnsureMiners(policy,{operation:'rush'},own,count),'model commander should add a third miner when resources allow');assert.equal(q[0].kind,'miner');
q.length=0;own.push({kind:'miner'});minerCtx.enemyCredits=500;assert(minerCtx.aiEnsureMiners(policy,{operation:'rush'},own,count),'healthy reserves allow a fourth miner');
q.length=0;minerCtx.isModelOpponent=()=>false;minerCtx.aiMinerTarget=policy=>policy.miners;assert.equal(minerCtx.aiEnsureMiners(policy,null,own,count),false,'preset style retains its own miner target');
q.length=0;minerCtx.isModelOpponent=()=>true;minerCtx.fields[0].amount=0;assert.equal(minerCtx.aiEnsureMiners(policy,{},own,count),false,'do not build miners after ore is exhausted');
const field={amount:1000},worker={kind:'miner',team:'enemy',mining:true,field,mineState:'harvest'},threat={kind:'tank',team:'player'};
let seen=false,resumed=0;
const retreatCtx={UNIT,fields:[field],elapsed:1,living:()=>[worker,threat],unitsFor:()=>[threat],visibleTo:()=>seen,aiThreatensAsset:()=>true,aiMinerShelter:()=>({}),aiMove:()=>{},assignMining:m=>{m.mining=true;resumed++;},aiOreChoices:()=>[{field,score:1}],distance:()=>0};
vm.createContext(retreatCtx);vm.runInContext(extract('aiManageMiner'),retreatCtx);
retreatCtx.aiManageMiner(worker,{});assert(worker.mining,'an unseen enemy must not interrupt mining');
seen=true;retreatCtx.aiManageMiner(worker,{});assert(!worker.mining&&worker.aiFleeUntil===9,'a visible threat sends the miner to shelter');
seen=false;retreatCtx.elapsed=8;retreatCtx.aiManageMiner(worker,{});assert.equal(resumed,0,'the miner waits for the safety interval');
retreatCtx.elapsed=10;retreatCtx.aiManageMiner(worker,{});assert(worker.mining&&resumed===1,'mining resumes after the threat clears');
console.log('PASS logged turret clearance, miner production and threat recovery.');
