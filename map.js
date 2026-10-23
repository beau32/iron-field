/* Shared map catalogue and terrain rules for browsers and the LAN relay. */
(() => {
  const obstacles=[];
  for(const x of [-18,18])for(const z of [-20,20])obstacles.push({x,z,radius:6,height:4.5});
  for(const x of [-38,38])obstacles.push({x,z:0,radius:5,height:3.5});
  for(const z of [-38,38])obstacles.push({x:0,z,radius:6,height:5});
  const common={halfWidth:66,halfDepth:52,buildRadius:32,expansionRadius:14,baseOffsetX:32,baseOffsetZ:20,spawnOffsetX:10,spawnOffsetZ:8};
  const river={x:0,z:0,width:132,depth:16};
  const crossings=[-30,30].map(x=>({x,z:0,width:8,depth:21}));
  const catalog=[
    {id:'classic',name:'Iron Valley',description:'The original dry battlefield. Rocky ridges and open ground; land and air combat.',water:[],bridges:[]},
    {id:'river',name:'River Front',description:'A river divides the battlefield. Two bridges carry ground forces; ships sail beneath them.',water:[river],bridges:crossings},
    {id:'crossroads',name:'Four Shores',description:'Crossed waterways connect four shores. Four bridges keep every base accessible by land.',water:[river,{x:0,z:0,width:16,depth:104}],bridges:[...crossings,...[-28,28].map(z=>({x:0,z,width:21,depth:8}))]}
  ].map(m=>Object.freeze({...common,...m,obstacles:Object.freeze(obstacles.filter(o=>!m.water.some(w=>Math.abs(o.x-w.x)<w.width/2+o.radius+2&&Math.abs(o.z-w.z)<w.depth/2+o.radius+2)))}));
  const inside=(rect,x,z,margin=0)=>Math.abs(x-rect.x)<=rect.width/2-margin&&Math.abs(z-rect.z)<=rect.depth/2-margin;
  const waterAt=(map,x,z)=>map.water.some(w=>inside(w,x,z));
  const samples=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)]);
  function navigable(map,x,z,r,naval=false){
    if(!map.water.length)return !naval;
    const valid=(px,pz)=>naval?waterAt(map,px,pz):!waterAt(map,px,pz)||map.bridges.some(b=>inside(b,px,pz));
    if(!valid(x,z))return false;
    for(const [dx,dz] of samples)if(!valid(x+dx*r,z+dz*r))return false;
    return true;
  }
  const get=id=>catalog.find(m=>m.id===id)||catalog[0];
  const api=Object.freeze({...catalog[0],catalog:Object.freeze(catalog),get,waterAt,navigable,inside});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.FIELD_MAP=api;
})();
