'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../game.js'),'utf8'),FIELD_OPPONENT=require('../opponent.js'),{buildings:STRUCTURE}=require('../data.js');
function extract(name){const a=source.indexOf('  function '+name+'('),b=source.indexOf('\n  function ',a+3);assert(a>=0&&b>a,name);return source.slice(a,b);}
const buildings=[],ctx={FIELD_OPPONENT,STRUCTURE,buildings,opponentStyle:'ollama',commander:{plan:{style:'balanced'},nextBuild:0},elapsed:10,enemyCredits:2000,baseOf:()=>true,missingStructures:()=>[],aiBudgetWait:()=>true,aiBuild:()=>true,currentModelPlan:()=>({style:'balanced'})};
vm.createContext(ctx);vm.runInContext(['isModelOpponent','aiPolicy','aiPriorityBuild'].map(extract).join('\n'),ctx);
assert.equal(ctx.aiPolicy().cap,24,'model commanders may fill the full unit limit');
ctx.opponentStyle='balanced';assert.equal(ctx.aiPolicy().cap,FIELD_OPPONENT.styles.balanced.cap,'preset caps are unchanged');ctx.opponentStyle='ollama';
buildings.push({team:'enemy',kind:'airfield',hp:100,buildLeft:5});assert.equal(ctx.aiPriorityBuild('airfield'),false,'ongoing construction does not block production');
buildings.length=0;assert.equal(ctx.aiPriorityBuild('airfield'),false,'starting construction does not block production');
ctx.enemyCredits=0;assert.equal(ctx.aiPriorityBuild('airfield'),true,'the AI can still save for an unaffordable priority');
console.log('PASS model force limit and production alongside priority construction.');
