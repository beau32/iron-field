'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const {units:UNIT,buildings:STRUCTURE}=require('../data.js'),source=fs.readFileSync(require.resolve('../game.js'),'utf8');
function extract(name){const start=source.indexOf('  function '+name+'('),end=source.indexOf('\n  function ',start+3);assert(start>=0&&end>start,name);return source.slice(start,end);}
let serial=0;const unit=(kind,team,x,z=0)=>({id:++serial,type:'unit',kind,team,hp:UNIT[kind].hp,maxHp:UNIT[kind].hp,radius:UNIT[kind].radius,mesh:{position:new THREE.Vector3(x,0,z)}});
const ship=unit('frigate','enemy',0),hidden=unit('patrolBoat','player',18),seen=unit('patrolBoat','player',30),inland={id:100,type:'building',kind:'base',team:'player',hp:1000,maxHp:1000,mesh:{position:new THREE.Vector3(100,0,100)}};
const ctx={THREE,UNIT,MAP:{water:[{x:0,z:0,width:100,depth:12}]},elapsed:200,navVersion:1,enemyCredits:2000,remoteQueue:[],commander:{},
 isAir:u=>Boolean(UNIT[u.kind]?.aircraft),isNaval:u=>Boolean(UNIT[u.kind]?.naval),stats:e=>UNIT[e.kind]||STRUCTURE[e.kind],
 unitsFor:t=>[ship,hidden,seen].filter(u=>u.team===t&&u.hp>0),living:()=>[ship,hidden,seen,inland].filter(e=>e.hp>0),visibleTo:e=>e!==hidden,
 canAttack:()=>true,reach:u=>UNIT[u.kind].range,distance:(a,b)=>a.mesh.position.distanceTo(b.mesh.position),
 producerFor:()=>true,queueUnit:k=>ctx.remoteQueue.push({kind:k}),aiLog:()=>{},
 aiMove:(u,p)=>{u.destination=p.clone();},aiAttack:(u,t)=>{u.attackTarget=t;u.destination=null;},
 navalShoreDestination:(u,p)=>new THREE.Vector3(Math.max(-45,Math.min(45,p.x)),0,0)};
vm.createContext(ctx);vm.runInContext(['aiCombinedArmsProduction','aiFleetSetback','aiAvoidNavalLosses','aiNavalProduction','aiFocusTarget','aiNavalOrder'].map(extract).join('\n'),ctx);
const own=[unit('tank','enemy',0),unit('tank','enemy',1),unit('tank','enemy',2)],count=k=>own.filter(u=>u.kind===k).length+ctx.remoteQueue.filter(q=>q.kind===k).length;
ctx.aiNavalProduction(own,count,{cap:30});assert.equal(ctx.remoteQueue[0].kind,'patrolBoat','fleet begins with a patrol boat');
ctx.aiCombinedArmsProduction(own,count,{cap:30});assert.equal(ctx.remoteQueue[1].kind,'rifleman','infantry can be queued alongside ships');
ctx.remoteQueue=[];ctx.commander.nextCombinedRecruit=0;own.push(unit('rifleman','enemy',0),unit('rocketTrooper','enemy',0));ctx.aiCombinedArmsProduction(own,count,{cap:30});assert.equal(ctx.remoteQueue[0].kind,'heavy','the mixed force can add heavy armor');
ctx.remoteQueue=[];ctx.commander.nextCombinedRecruit=0;own.push(unit('heavy','enemy',0));ctx.aiCombinedArmsProduction(own,count,{cap:30});assert.equal(ctx.remoteQueue[0].kind,'gunship','the mixed force can add aircraft');
ctx.remoteQueue=[];ctx.commander.nextNavalRecruit=0;ctx.enemyCredits=100;ctx.aiNavalProduction(own,count,{cap:30});assert.equal(ctx.remoteQueue.length,0,'unaffordable naval production does not spend reserves');
ctx.enemyCredits=2000;ctx.commander.battleEvents=[{team:'enemy',kind:'patrolBoat',at:180},{team:'enemy',kind:'patrolBoat',at:190}];ctx.aiNavalProduction(own,count,{cap:30});assert.equal(ctx.remoteQueue[0].kind,'frigate','recent repeated patrol losses prompt a stronger ship');ctx.remoteQueue=[];ctx.commander.nextNavalRecruit=0;ctx.elapsed=300;ctx.aiNavalProduction(own,count,{cap:30});assert.equal(ctx.remoteQueue[0].kind,'patrolBoat','patrols become available after losses age out');ctx.remoteQueue=[];
ctx.commander.nextNavalRecruit=0;ctx.commander.battleEvents=[{team:'enemy',kind:'patrolBoat',at:280},{team:'enemy',kind:'frigate',at:290},{team:'enemy',kind:'battleship',at:295}];ctx.aiNavalProduction(own,count,{cap:30});assert.equal(ctx.remoteQueue.length,0,'the whole fleet pauses after costly recent losses');assert(ctx.aiAvoidNavalLosses('frigate'),'model-directed ship production also respects the pause');ctx.commander.nextCombinedRecruit=0;ctx.aiCombinedArmsProduction(own,count,{cap:30});assert.equal(ctx.remoteQueue[0].kind,'gunship','visible ships prompt an air counter while fleet production pauses');ctx.remoteQueue=[];ctx.commander.battleEvents.push({team:'player',kind:'battleship',at:299,visible:true,value:1500});assert(!ctx.aiFleetSetback(),'a favorable naval exchange does not cause a pause');
ctx.enemyCredits=2000;ctx.aiNavalOrder(ship,inland,new Map());assert.equal(ship.attackTarget,seen,'ships select visible reachable targets, not hidden units');
seen.hp=0;ctx.elapsed+=13;ctx.aiNavalOrder(ship,inland,new Map());assert.equal(ship.attackTarget,null);assert(ship.destination&&ship.destination.z===0&&ship.destination.x<=45,'ships scout to reachable water, not an inland HQ');
console.log('PASS mixed production, naval budgets, visible target selection and water-only scouting.');
