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
let id=0;
function unit(kind,x,hp=.5){
  return {id:++id,type:'unit',team:'enemy',kind,hp:UNIT[kind].hp*hp,maxHp:UNIT[kind].hp,radius:UNIT[kind].radius,mesh:{position:new THREE.Vector3(x,0,0)}};
}
const tank=unit('tank',0),miner=unit('miner',2),ship=unit('frigate',60);
miner.mining=true;
const factory={id:100,kind:'warFactory',team:'enemy',hp:900,exitPoint:new THREE.Vector3(10,0,0),mesh:{position:new THREE.Vector3(10,0,-6)}};
const yard={id:101,kind:'shipyard',team:'enemy',hp:850,exitPoint:new THREE.Vector3(50,0,0),mesh:{position:new THREE.Vector3(50,0,-6)}};
const ctx={THREE,UNIT,STRUCTURE,enemyCredits:10,buildings:[factory,yard],units:[tank,miner,ship],HALF_X:120,HALF_Z:100,
  isAir:u=>Boolean(UNIT[u.kind]?.aircraft),isNaval:u=>Boolean(UNIT[u.kind]?.naval),
  active:b=>b.hp>0&&!b.buildLeft,blocked:()=>false,living:()=>ctx.units,stats:e=>UNIT[e.kind]||STRUCTURE[e.kind],
  distance:(a,b)=>a.mesh.position.distanceTo(b.mesh.position),visibleTo:()=>true,
  aiLog:()=>{},clearRoute:()=>{},baseOf:()=>({}),powerFor:()=>({low:false}),
  money:()=>ctx.enemyCredits,spend:(team,n)=>{ctx.enemyCredits-=n;},
  assignMining:u=>{u.mining=true;}};
vm.createContext(ctx);
const compatibility=source.slice(source.indexOf('  const serviceCompatible='),source.indexOf('  function updateYardRepairs('));
vm.runInContext(compatibility+['aiMove','aiRepairDestination','aiServiceDamagedUnits','updateYardRepairs'].map(extract).join('\n'),ctx);
ctx.aiServiceDamagedUnits(ctx.units,{retreat:.28});
assert(tank.aiRetreat&&miner.aiRetreat&&ship.aiRetreat,'idle half-health units seek service');
assert.equal(tank.aiRepairSource,factory.id);
assert.equal(ship.aiRepairSource,yard.id);
assert.equal(miner.mining,false);
assert(tank.destination.distanceTo(miner.destination)>tank.radius+miner.radius,'repair positions have clearance');
assert(tank.destination.distanceTo(factory.exitPoint)<STRUCTURE.warFactory.serviceRange);
tank.mesh.position.copy(tank.destination);
const hp=tank.hp,budget=ctx.enemyCredits;
ctx.updateYardRepairs(.1);
assert(tank.hp>hp,'actual repair loop heals returning vehicle');
assert(ctx.enemyCredits<budget,'repairs pay normal cost even below old 20-credit gate');
tank.hp=tank.maxHp;
miner.hp=miner.maxHp;
ctx.aiServiceDamagedUnits(ctx.units,{retreat:.28});
assert(!tank.aiRetreat&&!miner.aiRetreat&&miner.mining,'repaired units rejoin and miners resume work');

const crawler=unit('repair',10,1),patient=unit('heavy',0,.2);
ctx.buildings=[];ctx.units=[crawler,patient];ctx.enemyCredits=0;
ctx.aiServiceDamagedUnits(ctx.units,{retreat:.28});
assert(patient.aiRetreat&&patient.aiRepairSource===crawler.id,'crawler remains usable without credits');
crawler.hp=0;
ctx.units=[patient];
ctx.aiServiceDamagedUnits(ctx.units,{retreat:.28});
assert(!patient.aiRetreat,'lost repair source releases unit instead of permanent retreat');
const aircraft=unit('gunship',0,.2),infantry=unit('rifleman',0,.2);
ctx.units=[aircraft,infantry,crawler];crawler.hp=crawler.maxHp;
ctx.aiServiceDamagedUnits(ctx.units,{retreat:.28});
assert(!aircraft.aiRetreat&&!infantry.aiRetreat,'unsupported units never enter service loops');
const airfield={id:200,kind:'airfield',team:'enemy',hp:850,exitPoint:new THREE.Vector3(30,0,0),mesh:{position:new THREE.Vector3(30,0,-6)}};
const planes=['gunship','interceptor','bomber'].map(kind=>{
  const plane=unit(kind,0,.4);plane.mesh.position.y=UNIT[kind].altitude;return plane;
});
ctx.units=planes;ctx.buildings=[airfield];ctx.enemyCredits=1000;
ctx.aiServiceDamagedUnits(planes,{retreat:.28});
assert(planes.every(u=>u.aiRetreat&&u.aiRepairSource===airfield.id),'AI routes all aircraft types to airfield');
const plane=planes[0];
plane.mesh.position.copy(plane.destination);
const airHP=plane.hp;
ctx.updateYardRepairs(1);
assert.equal(plane.hp-airHP,30,'aircraft repaired at flight altitude using horizontal service distance');
ctx.powerFor=()=>({low:true});
const lowHP=plane.hp;ctx.updateYardRepairs(1);
assert.equal(plane.hp-lowHP,15,'low power halves aircraft repair rate');
ctx.enemyCredits=0;const unpaidHP=plane.hp;ctx.updateYardRepairs(1);assert.equal(plane.hp,unpaidHP);
ctx.enemyCredits=1000;airfield.buildLeft=4;ctx.updateYardRepairs(1);assert.equal(plane.hp,unpaidHP,'unfinished airfield cannot repair');
airfield.buildLeft=0;
ctx.units=[tank,ship];ctx.updateYardRepairs(1);
assert.equal(airfield.repairTarget,null,'airfield excludes ground and naval units');
ctx.units=planes;ctx.announce=()=>{};ctx.blocked=()=>true;
vm.runInContext(extract('orderYardRepair'),ctx);
ctx.orderYardRepair(airfield,planes,'enemy');
assert(planes.every(u=>u.destination&&u.destination.y===UNIT[u.kind].altitude),'player repair orders preserve aircraft flight heights');
plane.hp=plane.maxHp;
ctx.aiServiceDamagedUnits(planes,{retreat:.28});
assert(!plane.aiRetreat,'serviced aircraft returns to duty');
console.log('PASS idle vehicle/miner/ship repair dispatch, bay clearance, real healing/payment, low credits, recovery, crawler fallback and lost-service handling.');
