'use strict';
const assert=require('node:assert/strict'),maps=require('../map.js');
const {units,buildings}=require('../data.js');
const source=require('node:fs').readFileSync(require.resolve('../game.js'),'utf8');
const expansions=[...source.matchAll(/createField\((-?\d+),(-?\d+),(5500|6500),'(?:SOUTHWEST|NORTHEAST|NORTHWEST|SOUTHEAST) EXPANSION'\)/g)].map(m=>[Number(m[1]),Number(m[2]),Number(m[3])]);
assert.equal(expansions.length,8,'four mirrored expansion locations are defined in each mode');
for(const amount of [5500,6500])assert.deepEqual(expansions.filter(e=>e[2]===amount).map(e=>e.slice(0,2).join(',')).sort(),['-30,-28','-30,28','30,-28','30,28']);
assert.equal(expansions.filter(e=>e[2]===5500).reduce((sum,e)=>sum+e[2],0),22000,'solo shared ore total is unchanged');assert.equal(expansions.filter(e=>e[2]===6500).reduce((sum,e)=>sum+e[2],0),26000,'multiplayer shared ore total is unchanged');
const solo=source.slice(source.indexOf("createField(-73,28,6000,'WEST ORE')"),source.indexOf("spawnBuilding('base', 'player'"));const soloFields=[...solo.matchAll(/createField\((-?\d+),(-?\d+),\d+,'([^']+)'\)/g)].map(m=>m[3]);assert.equal(soloFields[0],'WEST ORE');assert.equal(soloFields[2],'EAST ORE','starting miner field indices are preserved');
for(const map of maps.catalog){
 assert.equal(map.halfWidth*2,186);assert.equal(map.halfDepth*2,148);
 for(const w of map.water){if(w.depth===16)assert.equal(w.width,map.halfWidth*2);else assert.equal(w.depth,map.halfDepth*2);}
 const check=(x,z,r,label)=>{
  assert(Math.abs(x)+r<map.halfWidth&&Math.abs(z)+r<map.halfDepth,label+' in bounds');
  assert(maps.navigable(map,x,z,r),label+' on walkable land');
  assert(!map.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+r),label+' clear of ridges');
 };
 for(const [sx,sz] of [[-1,1],[1,-1],[-1,-1],[1,1]]){
  for(const [kind,x,z] of [['base',39,29],['refinery',43,20],['power',29,34],['turret',28,23]])check((x+map.spawnOffsetX)*sx,(z+map.spawnOffsetZ)*sz,buildings[kind].radius,`${map.id} ${kind}`);
  for(const [kind,x,z] of [['scout',29,17],['tank',33,22],['tank',30,27],['artillery',35,35],['miner',39,14],['miner',44,14]])check((x+map.spawnOffsetX)*sx,(z+map.spawnOffsetZ)*sz,units[kind].radius,`${map.id} ${kind}`);
 }
 for(const [kind,x,z,team] of [['base',-17,12,1],['refinery',-22,3,1],['power',-8,17,1],['turret',-6,7,1],['base',17,-12,-1],['refinery',22,1,-1],['power',24,-17,-1],['turret',8,-9,-1],['warFactory',7,-21,-1]])check(x-map.baseOffsetX*team,z+map.baseOffsetZ*team,buildings[kind].radius,`${map.id} solo ${kind}`);
 const ore=[...expansions.filter(e=>e[2]===5500).map(([x,z])=>[x,z]),[-73,28],[73,-26]];
 for(const [x,z] of ore){check(x,z,4,`${map.id} ore`);assert(!map.bridges.some(b=>maps.inside(b,x,z,-8)),`${map.id} ore clear of bridge approaches`);for(const water of map.water){const dx=Math.max(0,Math.abs(x-water.x)-water.width/2),dz=Math.max(0,Math.abs(z-water.z)-water.depth/2);assert(Math.hypot(dx,dz)>=16,`${map.id} ore well inland`);}}
 for(let i=0;i<ore.length;i++)for(let j=i+1;j<ore.length;j++)assert(Math.hypot(ore[i][0]-ore[j][0],ore[i][1]-ore[j][1])>=30,`${map.id} ore fields are spread out`);
 const w=map.halfWidth*2+1,h=map.halfDepth*2+1,r=1.2,seen=new Uint8Array(w*h),queue=[];
 const allowed=(x,z)=>Math.abs(x)<=map.halfWidth-r&&Math.abs(z)<=map.halfDepth-r&&maps.navigable(map,x,z,r)&&!map.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+r);
 const index=(x,z)=>(z+map.halfDepth)*w+x+map.halfWidth;
 queue.push([-69,49]);seen[index(-69,49)]=1;
 for(let k=0;k<queue.length;k++){const [x,z]=queue[k];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=z+dz;if(!allowed(a,b))continue;const i=index(a,b);if(!seen[i]){seen[i]=1;queue.push([a,b]);}}}
 for(const [x,z] of [[69,-49],[-69,-49],[69,49]])assert(seen[index(x,z)],`${map.id}: reachable corner ${x},${z}`);
 for(const [x,z] of ore)assert(seen[index(x,z)],`${map.id}: accessible ore at ${x},${z}`);
 for(const b of map.bridges)assert(maps.navigable(map,b.x,b.z,r),`${map.id}: bridge passable`);
 console.log('PASS',map.id,'spawn clearance, all corners connected and bridges passable');
}
