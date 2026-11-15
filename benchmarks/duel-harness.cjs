'use strict';
// Test-only: run the existing commander once from each team's perspective.
// The live game is not changed. No solo-only credits are granted.
const {instrument}=require('./full-engine-harness.cjs');
function duelInstrument(original){
 let source=instrument(original);
 function replace(a,b){if(!source.includes(a))throw Error('Missing duel hook: '+a);source=source.replace(a,b);}
 const hook=String.raw`
  let benchOther=null,benchOtherRaid=90,benchOtherWave=0,benchFlipped=false,benchTurn=0;
  function benchSwap(fn){
    for(const e of [...units,...buildings])if(e.team==='player'||e.team==='enemy')e.team=e.team==='player'?'enemy':'player';
    [credits,enemyCredits]=[enemyCredits,credits];[delivered,enemyDelivered]=[enemyDelivered,delivered];
    [queue,remoteQueue]=[remoteQueue,queue];[battleRewards.player,battleRewards.enemy]=[battleRewards.enemy,battleRewards.player];
    [fog.teams.player,fog.teams.enemy]=[fog.teams.enemy,fog.teams.player];
    [technology.player,technology.enemy]=[technology.enemy,technology.player];
    [commander,benchOther]=[benchOther,commander];[nextRaid,benchOtherRaid]=[benchOtherRaid,nextRaid];[wave,benchOtherWave]=[benchOtherWave,wave];
    localTeam=localTeam==='player'?'enemy':'player';benchFlipped=!benchFlipped;
    try{return fn();}finally{
      localTeam=localTeam==='player'?'enemy':'player';benchFlipped=!benchFlipped;
      [commander,benchOther]=[benchOther,commander];[nextRaid,benchOtherRaid]=[benchOtherRaid,nextRaid];[wave,benchOtherWave]=[benchOtherWave,wave];
      [fog.teams.player,fog.teams.enemy]=[fog.teams.enemy,fog.teams.player];
    [technology.player,technology.enemy]=[technology.enemy,technology.player];
      [queue,remoteQueue]=[remoteQueue,queue];[battleRewards.player,battleRewards.enemy]=[battleRewards.enemy,battleRewards.player];
      [credits,enemyCredits]=[enemyCredits,credits];[delivered,enemyDelivered]=[enemyDelivered,delivered];
      for(const e of [...units,...buildings])if(e.team==='player'||e.team==='enemy')e.team=e.team==='player'?'enemy':'player';
    }
  }
  function benchUpdateBoth(){if(!benchOther)return updateCommander();if(elapsed<commander.nextThink&&elapsed<benchOther.nextThink)return;if(benchTurn++%2){benchSwap(()=>updateCommander());updateCommander();}else{updateCommander();benchSwap(()=>updateCommander());}}
  function benchOreChoices(u){return u.team==='player'&&!benchFlipped?benchSwap(()=>aiOreChoices(u)):aiOreChoices(u);}
  function benchOtherSummary(){return benchSwap(()=>({...modelBattleSummary(true),profile:null}));}
  window.__ironDuel={
    summary:()=>({enemy:{...modelBattleSummary(true),profile:null},player:benchOtherSummary()}),
    apply(side,plan,model){const checked=FIELD_OPPONENT.validPlan(plan,Object.keys(UNIT),Object.keys(STRUCTURE).filter(k=>STRUCTURE[k].cost>0));if(!checked)throw Error('Invalid plan');if(side==='player')benchSwap(()=>acceptAIPlan(checked,model));else if(side==='enemy')acceptAIPlan(checked,model);else throw Error('Invalid side');}
  };
`;
 replace('  window.__ironBench={',hook+'\n  window.__ironBench={');
 replace("chooseMap(config.map);opponentStyle='ollama';raids=true;seed=config.seed>>>0;startGame();","chooseMap(config.map);opponentStyle='ollama';raids=true;seed=config.seed>>>0;startGame();benchOther=resetCommander();benchOtherRaid=nextRaid;benchOtherWave=0;benchTurn=0;");
 replace('if(elapsed>=benchClock){benchPlayerBot();benchClock=elapsed+6;}','');
 replace('    updateComputerAid(dt); updateSuperweapons(dt);','    updateSuperweapons(dt);');
 replace('    updateCommander();\n','    benchUpdateBoth();\n');
 replace("if(u.team==='enemy'&&!net?.active){\n        if(!u.aiOreCache", "if((u.team==='enemy'||u.team==='player')&&!net?.active){\n        if(!u.aiOreCache");
 replace('choices:aiOreChoices(u)};', 'choices:benchOreChoices(u)};');
 replace("if(!net?.active&&u.team==='enemy'&&u.aiRetreat){","if(!net?.active&&(u.team==='enemy'||u.team==='player')&&u.aiRetreat){");
 replace("if (!target && u.team === 'enemy' && !net?.active && (!raids || !u.aiControlled))", "if (!target && (u.team === 'enemy'||u.team === 'player') && !net?.active && (!raids || !u.aiControlled))");
 replace("commander.battleEvents||=[];commander.battleEvents.push({at:elapsed,team:e.team,kind:e.kind,value:stats(e).cost||600,visible:e.team==='enemy'||visibleTo(e,'enemy')});", "commander.battleEvents||=[];commander.battleEvents.push({at:elapsed,team:e.team,kind:e.kind,value:stats(e).cost||600,visible:e.team==='enemy'||visibleTo(e,'enemy')});if(benchOther){benchOther.battleEvents||=[];benchOther.battleEvents.push({at:elapsed,team:e.team==='player'?'enemy':'player',kind:e.kind,value:stats(e).cost||600,visible:e.team==='player'||visibleTo(e,'player')});}");
 return source;
}
module.exports={duelInstrument};
