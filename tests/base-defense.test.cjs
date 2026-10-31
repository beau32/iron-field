'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const THREE=require('../vendor/three.min.js');
const {units:UNIT,buildings:STRUCTURE}=require('../data.js');
const source=fs.readFileSync(require.resolve('../game.js'),'utf8');
function extract(name){
  const start=source.indexOf('  function '+name+'(');
  return source.slice(start,source.indexOf('\n  function ',start+3));
}
let targets=[],built=[],waiting=0,placement=null;
const ctx={THREE,UNIT,STRUCTURE,elapsed:60,enemyCredits:200,commander:{nextBuild:0},buildings:[],
  unitsFor:()=>targets,visibleTo:()=>true,isAir:u=>Boolean(UNIT[u.kind].aircraft),
  isNaval:u=>Boolean(UNIT[u.kind].naval),stats:u=>UNIT[u.kind],
  active:b=>!b.buildLeft,aiBaseThreats:()=>[],
  aiBuild:kind=>(built.push(kind),true),aiTactic:()=>{},
  aiBudgetWait:()=>{waiting++;return true;},
  baseOf:()=>({}),missingStructures:()=>[],remoteQueue:[],
  producerFor:()=>({}),queueUnit:kind=>built.push('unit:'+kind)};
vm.createContext(ctx);
vm.runInContext(extract('aiMaintainDefenses')+extract('aiCommittedProduction'),ctx);
const own=[{kind:'tank'},{kind:'tank'},{kind:'tank'}];
const buildings=[{kind:'garrison'},{kind:'warFactory'},{kind:'turret'}];
const policy={defenses:3,cap:20,recruit:8};
assert.equal(ctx.aiMaintainDefenses(policy,own,buildings),false);
assert.deepEqual(built,['turret'],'build affordable coverage below old 450-credit threshold');
built=[];
ctx.aiMaintainDefenses(policy,own,[...buildings,{kind:'turret',buildLeft:4}]);
assert.equal(built.length,0,'construction does not reserve recruitment cycles');
ctx.enemyCredits=40;ctx.aiMaintainDefenses(policy,own,buildings);
assert.equal(waiting,1,'briefly save for missing basic coverage once army exists');
ctx.enemyCredits=350;ctx.commander.nextBuild=0;targets=[{kind:'gunship'}];
ctx.aiMaintainDefenses(policy,own,buildings);
assert.deepEqual(built,['missileBattery'],'counter aircraft with static anti-air');
targets=[{kind:'tank'},{kind:'heavy'},{kind:'tank'}];built=[];ctx.commander.nextBuild=0;
ctx.aiMaintainDefenses(policy,own,buildings);
assert.deepEqual(built,['teslaCoil'],'armor receives a matching defense');
built=[];ctx.commander.nextRecruit=0;
ctx.aiCommittedProduction({building:'turret',unit:'tank'},policy,own,buildings,()=>0);
assert.deepEqual(built,['unit:tank'],'defense plan still recruits while fortifications are handled separately');

// Exercise actual site selection, including the ordinary placement validator.
ctx.baseOf=team=>({mesh:{position:new THREE.Vector3(team==='enemy'?0:60,0,0)}});
ctx.enemyCredits=500;ctx.buildings=[];ctx.aiLog=()=>{};ctx.spend=()=>{};
ctx.placementError=(kind,p)=>(placement=p.clone(),false);
ctx.createBuilding=()=>{};ctx.MAP={water:[]};
vm.runInContext(extract('aiBuild'),ctx);
ctx.aiBuild('turret');
assert(placement.x>8&&Math.abs(placement.z)<.01,'defense faces enemy approach');
console.log('PASS affordable defense budget, parallel recruitment, queued construction, air/armor counters and forward legal placement.');
