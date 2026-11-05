'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const THREE=require('../vendor/three.min.js'),FIELD_MAP=require('../map.js');
const src=fs.readFileSync(require.resolve('../game.js'),'utf8');
const rails=src.slice(src.indexOf('  const bridgeRails ='),src.indexOf('  function bridgeHeight('));
const routing=src.slice(src.indexOf('  const CELL = 1.5,'),src.indexOf('  function rotateToward('));
for(const id of ['river','crossroads']){
 const MAP=FIELD_MAP.get(id),HALF_X=MAP.halfWidth,HALF_Z=MAP.halfDepth;
 const ctx={THREE,FIELD_MAP,MAP,HALF_X,HALF_Z,buildings:[],navVersion:0,terrainBlocked:(x,z,r)=>MAP.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+r+.2)};
 vm.createContext(ctx);vm.runInContext(rails+'\n'+routing+'\nthis.testRoute=route;this.testClear=clearSegment;',ctx);
 for(const [a,b] of [[[-69,49],[69,-49]],[[-69,49],[-69,-49]],[[-69,49],[69,49]]]){
  const start=new THREE.Vector3(a[0],0,a[1]),goal=new THREE.Vector3(b[0],0,b[1]),path=ctx.testRoute(start,goal,1.2);
  assert(path.length,`${id} ${a} -> ${b} path`);let prev=start;
  for(const p of path){assert(ctx.testClear(prev,p,1.2),`${id} route segment is clear`);prev=p;}
  assert(prev.distanceTo(goal)<2,`${id} path reaches destination`);
 }
 console.log('PASS',id,'actual A* and bridge side clearance across expanded map');
}
