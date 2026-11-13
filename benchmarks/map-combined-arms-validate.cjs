'use strict';
// Validates generated synthetic situations against the actual commander shortlist.
const readline=require('node:readline'),c=require('../commander.cjs'),maps=require('../map.js');
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on('line',line=>{try{const x=JSON.parse(line),map=maps.catalog.find(m=>m.id===x.map);if(!map)throw Error('Unknown map');if(x.state.context.water!==Boolean(map.water.length))throw Error('Water does not match map');
 const s=c.summarize(x.state),offered=c.offeredOperations(s,{lookahead:true}),names=offered.map(o=>o.name);
 if(!x.variants.every(v=>names.includes(v.target)))return console.log(JSON.stringify({id:x.id,accepted:false,offered:names}));
 const marker='Return the selected name as a JSON string.',raw=c.promptFor(s,offered,{lookahead:false}).split(marker)[1];
 if(!raw)throw Error('Unexpected commander prompt');const facts=raw.split('\nChoose only:')[0].trim().split('Visible contacts')[0].trim();
 const ranked=c.strategicLookahead(s,offered),risks=c.strategicTradeoffs(ranked);
 const forecast='Approximate two-step worst-case ranking (simplified, not a prediction): '+ranked.map(o=>o.name).join(' > ')+'.'+(risks?' Possible tradeoffs, not predictions: '+risks+'.':'');
 const terrain=`Map layout: ${map.water.length} waterway${map.water.length===1?'':'s'}, ${map.bridges.length} bridge${map.bridges.length===1?'':'s'}, ${map.obstacles.length} ridge obstacles; exact routes require scouting.`;
 console.log(JSON.stringify({id:x.id,accepted:true,offered:names,facts,terrain,forecast}));
}catch(e){console.log(JSON.stringify({accepted:false,error:e.message}));}});
