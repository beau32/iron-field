'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../game.js'),'utf8'),start=source.indexOf('  async function requestModelPlan()'),end=source.indexOf('  function updateOpponentUI()',start);
assert(start>=0&&end>start);
let now=100,generation=1,reply,events=[];const summary={elapsed:60,credits:300},plan={operation:'rush',style:'rush',focus:'hq',unit:'tank',building:'auto'};
const state={net:null,raids:true,outcome:'',elapsed:60,modelRequest:null,performance:{now:()=>now},AbortController,setTimeout,clearTimeout,UNIT:{tank:{}},STRUCTURE:{power:{cost:100}},isModelOpponent:()=>true,modelProvider:()=> 'JEV',modelBattleSummary:()=>summary,
 FieldLocalAI:{mode:'player',plan:async(value)=>{assert.equal(value,summary);return reply();}},FIELD_OPPONENT:{validPlan:p=>p},battleLog:{info:()=>({generation}),event:(at,type,data)=>{events.push({at,type,data});return events.length;}},
 currentModelPlan:()=>state.commander.plan||null,acceptAIPlan:(p,m)=>{state.commander.plan=p;state.commander.model=m;state.commander.modelStatus='AI plan active';}};
state.window={FieldLocalAI:state.FieldLocalAI};vm.createContext(state);vm.runInContext(source.slice(start,end),state);
function reset(){events=[];state.commander={pending:false,nextModel:0,plan:null};now+=100;}
(async()=>{
 reset();reply=async()=>{now+=830;return {ok:true,json:async()=>({plan,model:'test-classifier',latencyMs:700})};};await state.requestModelPlan();assert.equal(events[0].type,'ai-request');assert.equal(events[1].type,'ai-decision');assert.equal(events[1].data.requestId,1);assert.equal(events[1].data.roundTripMs,830);assert.equal(events[1].data.serviceMs,700);assert.equal(state.commander.pending,false);
 reset();state.commander.plan=plan;reply=async()=>({ok:false,json:async()=>({error:'Service offline',retryAfterMs:5000})});await state.requestModelPlan();assert.equal(events[1].type,'ai-error');assert.equal(events[1].data.fallback,false);assert.equal(events[1].data.retainedPlan,plan);assert.equal(events[1].data.retryAfterMs,5000);
 reset();reply=async()=>{throw Error('No pairing');};await state.requestModelPlan();assert.equal(events[1].data.fallback,true);
 reset();reply=async()=>{state.commander={pending:false,nextModel:0};return {ok:true,json:async()=>({plan})};};await state.requestModelPlan();assert.equal(events[1].type,'ai-cancelled');assert(!state.commander.plan);
 reset();reply=async()=>{generation++;state.commander={pending:false,nextModel:0};return {ok:true,json:async()=>({plan})};};await state.requestModelPlan();assert.equal(events.length,1,'old request must not enter the next match log');
 console.log('PASS AI input/result correlation, measured latency, retained-plan and fallback errors, configuration cancellation and match isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
