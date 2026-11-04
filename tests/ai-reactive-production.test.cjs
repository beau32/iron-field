'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {units:UNIT,buildings:STRUCTURE}=require('../data.js');
const src=fs.readFileSync(require.resolve('../game.js'),'utf8');
const start=src.indexOf('  function aiReactiveProduction('),end=src.indexOf('\n  function ',start+3);
const ctx={UNIT,STRUCTURE,elapsed:100,commander:{nextRecruit:0},remoteQueue:[],enemyCredits:2000,buildings:[],players:[],produced:[],
 unitsFor:()=>ctx.players,visibleTo:e=>e.visible!==false,stats:e=>UNIT[e.kind]||STRUCTURE[e.kind],isAir:u=>!!UNIT[u.kind].aircraft,isNaval:u=>!!UNIT[u.kind].naval,
 active:b=>!b.buildLeft,producerFor:()=>true,queueUnit:k=>ctx.produced.push(k),aiTactic:()=>{}};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
const enemy=(kind,n,visible=true)=>Array.from({length:n},()=>({kind,visible}));
const own=[],policy={cap:40,recruit:4};
let counts={};const count=k=>(counts[k]||0)+ctx.remoteQueue.filter(q=>q.kind===k).length;
const run=()=>ctx.aiReactiveProduction(own,count,policy);
ctx.players=enemy('tank',6);assert(run());assert.equal(ctx.produced.pop(),'destroyer');
ctx.commander.nextRecruit=0;ctx.remoteQueue=[{kind:'destroyer'},{kind:'destroyer'}];assert(!run(),'queued armor counters satisfy demand');
ctx.remoteQueue=[];ctx.players=enemy('tank',6,false);assert(!run(),'unseen threats do not prompt counter production');
ctx.players=[];ctx.buildings=Array.from({length:4},()=>({kind:'turret',team:'player'}));assert(run());assert.equal(ctx.produced.pop(),'artillery');
ctx.commander.nextRecruit=0;ctx.buildings=[];ctx.players=enemy('rifleman',4);assert(run());assert.equal(ctx.produced.pop(),'flame');
ctx.commander.nextRecruit=0;ctx.enemyCredits=0;assert(!run(),'cannot spend unavailable credits');
ctx.enemyCredits=2000;ctx.remoteQueue=[{kind:'tank'}];assert(!run(),'busy producer does not block other strategic work');
console.log('PASS reactive armor, siege and infantry counters; visibility, queues, credits and producer availability.');
