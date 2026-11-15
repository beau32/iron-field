'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js'),UNIT=require('../data.js').units;
const context={THREE,window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../weapon-fx.js'),'utf8'),context);
const {MotionFX,WeaponFX}=context.window.FIELD_WEAPONS,motionFX=new MotionFX(new THREE.Scene());
const source=fs.readFileSync(require.resolve('../game.js'),'utf8'),a=source.indexOf('  function updateMotionVisual('),b=source.indexOf('  function animateVehicles(',a);
const scope={THREE,UNIT,motionFX,MAP:{bridges:[{x:0,z:0,width:8,depth:20}]},FIELD_MAP:require('../map.js'),BRIDGE_DECK_BOTTOM:2.69,$:()=>({value:'balanced'}),isAir:u=>Boolean(UNIT[u.kind].aircraft),isNaval:u=>Boolean(UNIT[u.kind].naval)};
vm.runInNewContext(source.slice(a,b)+'\nthis.sample=updateMotionVisual;',scope);
const unit=(kind,x=20,z=10)=>{const mesh=new THREE.Group(),body=new THREE.Group();mesh.add(body);mesh.position.set(x,0,z);return {id:1,kind,hp:100,mesh,body};};
const tank=unit('tank');scope.sample(tank,.2);scope.sample(tank,.2);assert.equal(motionFX.particles.length,0,'idle tanks emit no dust');
tank.mesh.position.x+=.5;scope.sample(tank,.2);assert(motionFX.particles.length>0,'moving tank emits dust');motionFX.clear();
tank.mesh.visible=false;tank.mesh.position.x+=.5;scope.sample(tank,.2);assert.equal(motionFX.particles.length,0,'unseen units emit no trails');
const bridge=unit('tank',0,0);scope.sample(bridge,.2);bridge.mesh.position.z+=.5;scope.sample(bridge,.2);assert.equal(motionFX.particles.length,0,'no soil dust on bridges');
for(const [kind,y] of [['frigate',.19],['interceptor',10]]){const u=unit(kind);u.mesh.position.y=y;scope.sample(u,.2);u.mesh.position.z+=.5;scope.sample(u,.2);assert(motionFX.particles.length>0,kind+' emits motion trail');motionFX.clear();}
const combat=new WeaponFX(new THREE.Scene());combat.emit({id:1,type:'impact',visual:'bomb',point:{x:0,y:1,z:0}});const count=combat.particles.length;
for(let i=0;i<200;i++)motionFX.trail({id:i,tick:1,point:{x:i,y:.19,z:0},direction:{x:0,y:0,z:1},domain:'water'});
assert(motionFX.particles.length<=96,'movement particles are bounded');assert.equal(combat.particles.length,count,'movement cannot evict combat effects');
for(let i=0;i<100;i++)motionFX.update(1/30);assert.equal(motionFX.particles.length,0,'trails expire');motionFX.clear();combat.clear();
console.log('PASS actual movement, idle/hidden/bridge handling, aircraft/ship trails, separate budgets and cleanup.');
