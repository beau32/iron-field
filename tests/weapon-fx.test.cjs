'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const cosmeticMath=Object.create(Math);cosmeticMath.random=()=>{throw Error('Weapon art must not consume global randomness');};
const context={THREE,Math:cosmeticMath,window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../weapon-fx.js'),'utf8'),context);
const {WeaponFX,profiles}=context.window.FIELD_WEAPONS;
const make=()=>new WeaponFX(new THREE.Scene());
function impact(kind,extra={}){const fx=make();fx.emit({id:7,type:'impact',visual:kind,point:{x:1,y:1,z:2},...extra});return fx;}
const cannon=impact('cannon'),bomb=impact('bomb');assert(bomb.particles.length>cannon.particles.length,'bomb has a larger layered blast');
const water=impact('artillery',{surface:'water',surfaceY:.18});assert(water.particles.some(p=>p.mesh.geometry===water.ring&&p.mesh.position.y===.18),'water ripple lies on water');
const bridge=impact('heavyCannon',{surface:'bridge',surfaceY:2.935,point:{x:1,y:3.7,z:2}});assert(bridge.particles.some(p=>p.mesh.geometry===bridge.ring&&p.mesh.position.y===2.935),'bridge shockwave stays on deck');
const under=impact('bomb',{surface:'water',surfaceY:.18,ceiling:2.67});assert(under.particles.every(p=>p.mesh.material.clippingPlanes[0]?.constant===2.67),'under-bridge spray stays below deck');
under.emit({id:8,type:'impact',visual:'cannon',point:{x:10,y:1,z:10}});assert(under.particles.at(-1).mesh.material.clippingPlanes.length===0,'clipping does not leak to outdoor impacts');
const fx=make();let id=1;
for(let n=0;n<12;n++)for(const kind of Object.keys(profiles)){
 fx.emit({id:id++,type:'shot',visual:kind,origin:{x:0,y:1,z:0},aim:{x:5,y:1,z:5},duration:.1,arc:2});
 fx.emit({id:id++,type:'impact',visual:kind,point:{x:5,y:1,z:5}});
}
assert(fx.particles.length<=240&&fx.flights.length<=64&&fx.beams.length<=16,'effects remain bounded in large fights');
for(let i=0;i<300;i++)fx.update(1/30);
assert.equal(fx.particles.length+fx.flights.length+fx.beams.length,0,'effects expire');fx.clear();assert.equal(fx.root.children.length,0);
for(const x of [cannon,bomb,water,bridge,under])x.clear();
console.log('PASS distinct blasts, surface heights, bridge clipping, cosmetic RNG, bounded bursts and cleanup.');
