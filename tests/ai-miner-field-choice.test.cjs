'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const {units:UNIT}=require('../data.js'),source=fs.readFileSync(require.resolve('../game.js'),'utf8');
function extract(name){const a=source.indexOf('  function '+name+'('),b=source.indexOf('\n  function ',a+3);assert(a>=0&&b>a,name);return source.slice(a,b);}
const obj=(x,z)=>({mesh:{position:new THREE.Vector3(x,0,z)}});
const refinery={...obj(0,0),team:'enemy',kind:'refinery',hp:500},near={...obj(20,0),amount:1000},far={...obj(0,40),amount:1000},hidden={...obj(0,10),amount:1000};
const miner={...obj(0,0),team:'enemy',kind:'miner',mining:true,mineState:'travel',field:near},enemy={...obj(15,0),team:'player',kind:'tank',hp:100};let visible=true,assigned=null;
const ctx={UNIT,commander:{oreThreats:[]},buildings:[refinery],fields:[near,far,hidden],enemyCredits:500,elapsed:10,active:()=>true,visibleTo:()=>visible,stats:e=>UNIT[e.kind],canAttack:()=>true,living:()=>[miner,enemy],unitsFor:t=>t==='enemy'?[miner]:[enemy],fog:{at:(t,x,z)=>!(x===0&&z===10)},distance:(a,b)=>a.mesh.position.distanceTo(b.mesh.position),isModelOpponent:()=>true,aiThreatensAsset:()=>false,assignMining:(u,f)=>{assigned=f;u.field=f;},aiMove:()=>{}};
vm.createContext(ctx);vm.runInContext(['aiRememberThreats','aiOreChoices','aiMinerTarget','aiManageMiner'].map(extract).join('\n'),ctx);
assert.equal(ctx.aiOreChoices(miner)[0].field,far,'avoid a visible threat near the closer ore field and travel corridor');assert(!ctx.aiOreChoices(miner).some(x=>x.field===hidden),'unexplored ore is not revealed to the AI');
ctx.aiManageMiner(miner,refinery);assert.equal(assigned,far,'miner changes to the materially safer known field');
miner.field=near;assigned=null;miner.mineState='return';ctx.aiManageMiner(miner,refinery);assert.equal(assigned,null,'a loaded miner keeps its delivery order');
visible=false;miner.mineState='travel';assert.equal(ctx.aiOreChoices(miner)[0].field,near,'hidden threats do not affect ore choice');
ctx.commander.oreThreats=[{id:77,kind:'tank',x:15,z:0,at:10}];assert(ctx.aiOreChoices(miner).find(x=>x.field===near).unsafe,'recently spotted danger remains unsafe after sight is lost');assert.equal(ctx.aiOreChoices(miner)[0].field,far,'prefer a safer field while the sighting is fresh');
ctx.elapsed=36;assert.equal(ctx.aiOreChoices(miner)[0].field,near,'stale sightings expire');ctx.commander.oreThreats=[];
enemy.id=77;visible=true;ctx.elapsed=40;ctx.aiRememberThreats();assert.equal(ctx.commander.oreThreats.length,1,'visible enemies are remembered');visible=false;ctx.fog.at=()=>false;ctx.elapsed=50;ctx.aiRememberThreats();assert.equal(ctx.commander.oreThreats.length,1,'sightings remain when the location is hidden');ctx.fog.at=()=>true;ctx.aiRememberThreats();assert.equal(ctx.commander.oreThreats.length,0,'a visible, empty location clears the sighting');ctx.fog.at=(t,x,z)=>!(x===0&&z===10);
assert.equal(ctx.aiMinerTarget({miners:2},[miner]),4,'nearby ore keeps the ordinary target');miner.field=far;assert.equal(ctx.aiMinerTarget({miners:2},[miner]),5,'a longer trip supports an additional miner');far.mesh.position.z=70;assert.equal(ctx.aiMinerTarget({miners:2},[miner]),6,'very long trips support a second additional miner, within the cap');
far.amount=0;assert.equal(ctx.aiMinerTarget({miners:2},[miner]),4,'depleted distant ore no longer raises the target');
console.log('PASS visible ore risk, fog, delivery preservation and distance-based miner targets.');
