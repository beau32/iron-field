'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('../vendor/three.min.js');
const src=fs.readFileSync(require.resolve('../game.js'),'utf8');
const start=src.indexOf('  function miningAccess('),end=src.indexOf('\n  function updateMiner(',start);
const site={radius:3,mesh:{position:new THREE.Vector3(0,0,0)}};
const u={radius:1,mesh:{position:new THREE.Vector3(10,0,0)},mineState:'return',path:[]};
const oldPoint=new THREE.Vector3(3,0,0);
const ctx={THREE,elapsed:0,navVersion:1,units:[u],blocked:()=>false,isAir:()=>false,isNaval:()=>false,clearRoute:()=>{},route:(start,end)=>[end.clone()]};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
u.mineAccess={site,point:oldPoint,phase:'return',version:1,distance:7,progressAt:0,progressPoint:u.mesh.position.clone()};
const first=u.mineAccess;
for(let i=1;i<=6;i++){ctx.elapsed=i;u.mesh.position.x=10+i;assert.equal(ctx.miningAccess(u,[site],'return'),first,'valid detour away from destination should not be abandoned');}
ctx.elapsed=10;const replacement=ctx.miningAccess(u,[site],'return');assert(replacement&&replacement!==first,'a stationary blocked miner seeks another access point');assert(replacement.point.distanceTo(oldPoint)>=2);
console.log('PASS mining detours retain their route and stationary miners choose another access point.');
