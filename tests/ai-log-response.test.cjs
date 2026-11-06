'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const {units:UNIT,buildings:STRUCTURE}=require('../data.js'),FIELD_MAP=require('../map.js'),source=fs.readFileSync(require.resolve('../game.js'),'utf8');
function extract(name){let a=source.indexOf('  function '+name+'('),b=source.indexOf('\n  function ',a+3);assert(a>=0&&b>a,name);return source.slice(a,b);}
const MAP=FIELD_MAP.get('river'),base={team:'enemy',kind:'base',hp:1000,radius:STRUCTURE.base.radius,mesh:{position:new THREE.Vector3(69,0,-47)}},buildings=[base],built=[];
const ctx={THREE,UNIT,STRUCTURE,MAP,HALF_X:MAP.halfWidth,HALF_Z:MAP.halfDepth,buildings,elapsed:0,navVersion:0,commander:{},enemyCredits:2000,active:b=>b.hp>0&&!b.buildLeft,baseOf:()=>base,missingStructures:()=>[],aiLog:()=>{},spend:(team,cost)=>ctx.enemyCredits-=cost,
 createBuilding:(kind,team,x,z)=>{const b={team,kind,hp:100,radius:STRUCTURE[kind].radius,mesh:{position:new THREE.Vector3(x,0,z)},buildLeft:8};buildings.push(b);built.push(b);return b;}};
Object.assign(ctx,{FIELD_MAP,material:()=>({}),localTeam:'enemy',units:[],fields:[{mesh:{position:new THREE.Vector3(73,0,-26)}}],
 fog:{at:(team,x,z)=>buildings.some(b=>ctx.active(b)&&Math.hypot(x-b.mesh.position.x,z-b.mesh.position.z)<13)},money:()=>ctx.enemyCredits,prerequisiteMessage:()=>'',
 waterAt:(x,z)=>FIELD_MAP.waterAt(MAP,x,z),terrainAllows:(x,z,r,n)=>FIELD_MAP.navigable(MAP,x,z,r,n),
 terrainBlocked:(x,z,r=0)=>MAP.obstacles.some(o=>Math.hypot(o.x-x,o.z-z)<o.radius+r+.2),isAir:()=>false,
 inConstructionTerritory:p=>buildings.some(b=>ctx.active(b)&&b.mesh.position.distanceTo(p)<(b.kind==='base'?MAP.buildRadius:MAP.expansionRadius))});
ctx.blocked=(x,z,r,naval=false)=>Math.abs(x)>MAP.halfWidth-r||Math.abs(z)>MAP.halfDepth-r||!ctx.terrainAllows(x,z,r,naval)||ctx.terrainBlocked(x,z,r)||buildings.some(b=>b.hp>0&&Math.hypot(x-b.mesh.position.x,z-b.mesh.position.z)<b.radius+r+.2);
vm.createContext(ctx);vm.runInContext(extract('navalExit')+extract('placementError')+extract('aiBuild'),ctx);
let it=0;while(!built.some(b=>b.kind==='shipyard')&&it++<8){assert(ctx.aiBuild('shipyard'),'can extend to the bank');assert(!ctx.aiBuild('shipyard'),'wait for unfinished power outpost');built.at(-1).buildLeft=0;}
assert(built.some(b=>b.kind==='shipyard'),'constructs shipyard from distant enlarged-map base');assert(built.filter(b=>b.kind==='power').length>=2,'multiple legal outposts bridge the distance');
const threatCtx={THREE,UNIT,stats:e=>UNIT[e.kind]||STRUCTURE[e.kind],canAttack:(e,a)=>e.kind!=='interceptor'||!!UNIT[a.kind]?.aircraft,distance:(a,b)=>a.mesh.position.distanceTo(b.mesh.position),reach:(a,b)=>UNIT[a.kind].range+(b.type==='building'?b.radius*.65:0),blocked:()=>false};
vm.createContext(threatCtx);vm.runInContext(extract('aiThreatensAsset')+extract('aiMinerShelter'),threatCtx);
const miner={kind:'miner',radius:UNIT.miner.radius,mesh:{position:new THREE.Vector3(0,0,-24)}};
const battleship={kind:'battleship',mesh:{position:new THREE.Vector3(0,0,0)}};
assert(threatCtx.aiThreatensAsset(battleship,miner),'detect battleship beyond old 11-unit miner danger radius');
assert(!threatCtx.aiThreatensAsset({kind:'interceptor',mesh:battleship.mesh},miner),'air-only interceptor is not a ground threat');
const shelter=threatCtx.aiMinerShelter(miner,{mesh:{position:new THREE.Vector3(0,0,-40)}},[battleship]);
assert(shelter.distanceTo(battleship.mesh.position)>40,'retreats behind the base, away from bombardment');
console.log('PASS staged shore expansion and long-range naval threat/miner shelter.');
const econBuilt=[];
const econOwn=[{kind:'miner'},{kind:'miner'},{kind:'tank'},{kind:'tank'},{kind:'tank'}],econBuildings=[{team:'enemy',kind:'warFactory',hp:1},{team:'enemy',kind:'refinery',hp:1}];
const econ={UNIT,STRUCTURE,FIELD_OPPONENT:require('../opponent.js'),elapsed:40,enemyCredits:1000,remoteQueue:[],fields:[{amount:1000}],buildings:econBuildings,MAP:{water:[]},commander:{nextBuild:0,nextRecruit:0},
 aiPolicy:()=>({name:'Balanced',miners:2,defenses:2,cap:20,recruit:8,airAt:150}),currentModelPlan:()=>null,unitsFor:t=>t==='enemy'?econOwn:[],aiRecoverIncome:()=>false,powerFor:()=>({low:false}),aiEmergencyProduction:()=>false,producerFor:()=>true,aiPriorityBuild:()=>false,aiMaintainDefenses:()=>false,aiReactiveProduction:()=>false,
 aiBuild:k=>(econBuilt.push('building:'+k),true),aiTactic:()=>{},queueUnit:k=>econBuilt.push('unit:'+k),isAir:()=>false};
vm.createContext(econ);vm.runInContext(extract('aiEconomy'),econ);econ.aiEconomy();
assert(econBuilt.includes('building:garrison'),'early garrison unlocks defenses before naval expansion');assert(econBuilt.some(s=>s.startsWith('unit:')),'garrison construction does not pause recruitment');
console.log('PASS early defense unlock alongside recruiting.');
