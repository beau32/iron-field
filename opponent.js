/* Shared strategic policies. The model can choose priorities, never bypass game rules. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.FIELD_OPPONENT=value;})(globalThis,()=>{
  const styles={
    balanced:{name:'Balanced',description:'Mixed forces, protected miners, and measured attacks.',miners:2,defenses:3,firstRaid:90,interval:65,minForce:5,guards:2,maxRaid:7,recruit:8,cap:14,airAt:150,retreat:.28,focus:'economy'},
    rush:{name:'Rush commander',description:'Early, frequent attacks with cheaper ground units.',miners:2,defenses:1,firstRaid:45,interval:38,minForce:4,guards:1,maxRaid:8,recruit:4,cap:18,airAt:240,retreat:.18,focus:'production'},
    fortress:{name:'Fortress commander',description:'Layered defenses, extra guards, and larger counterattacks.',miners:2,defenses:5,firstRaid:150,interval:95,minForce:8,guards:4,maxRaid:8,recruit:9,cap:18,airAt:210,retreat:.4,focus:'army'},
    economy:{name:'Economy commander',description:'More miners first, then a large, well-equipped army.',miners:4,defenses:2,firstRaid:140,interval:75,minForce:7,guards:2,maxRaid:10,recruit:6,cap:22,airAt:140,retreat:.35,focus:'economy'},
    air:{name:'Air commander',description:'Early airfield, gunships and bombers, with ground escorts.',miners:3,defenses:2,firstRaid:110,interval:60,minForce:5,guards:2,maxRaid:9,recruit:6,cap:20,airAt:30,retreat:.3,focus:'production'}
  };
  const focuses=['economy','production','hq','army'];
  function validPlan(plan,units,buildings){
    if(!plan||typeof plan!=='object'||Array.isArray(plan)||!Object.hasOwn(styles,plan.style)||!focuses.includes(plan.focus)||!['auto',...units].includes(plan.unit)||!['auto',...buildings].includes(plan.building))return null;
    return {style:plan.style,focus:plan.focus,unit:plan.unit,building:plan.building};
  }
  return {styles,focuses,validPlan};
});
