/* Cosmetic weapon effects. Separate from damage, targeting, and the simulation RNG. */
(() => {
  const profiles = {
    rifle: { speed: 120, recoil: .035, flash: .065 },
    machinegun: { speed: 100, recoil: .05, flash: .07 },
    cannon: { speed: 48, recoil: .22, flash: .12 },
    heavyCannon: { speed: 44, recoil: .32, flash: .15 },
    autocannon: { speed: 65, recoil: .12, flash: .09 },
    artillery: { speed: 19, recoil: .4, flash: .18 },
    railgun: { speed: 140, recoil: .3, flash: .13 },
    sniper: { speed: 180, recoil: .06, flash: .05 },
    rocket: { speed: 20, recoil: .035, flash: .14 },
    tesla: { speed: 1000, recoil: 0, flash: .24 },
    flame: { speed: 15, recoil: 0, flash: .28 },
    bomb: { speed: 12, recoil: 0, flash: .04 }
  };
  const kinds = { patrolBoat:'autocannon',frigate:'rocket',battleship:'artillery', gunship:'autocannon',interceptor:'rocket',bomber:'bomb', rifleman:'rifle', scout:'machinegun', tank:'cannon', heavy:'heavyCannon', turret:'autocannon', artillery:'artillery', destroyer:'railgun', sniper:'sniper', rocket:'rocket', rocketTrooper:'rocket', missileBattery:'rocket', tesla:'tesla', teslaCoil:'tesla', flame:'flame', flameBunker:'flame' };
  const impactStyles={
    cannon:{radius:1.8,fire:.4,smoke:.45,debris:4},
    heavyCannon:{radius:2.9,fire:.55,smoke:.65,debris:6},
    artillery:{radius:4.2,fire:.65,smoke:.9,debris:8},
    rocket:{radius:3.1,fire:.6,smoke:.7,debris:5},
    bomb:{radius:5.2,fire:.85,smoke:1.1,debris:10}
  };
  class WeaponFX {
    constructor(scene) {
      this.root = new THREE.Group(); scene.add(this.root);
      this.particles = []; this.flights = []; this.beams = [];
      this.particlePool = new Map();
      this.particleBatches = new Map();
      this.sphere = new THREE.IcosahedronGeometry(1, 1);
      this.ring = new THREE.RingGeometry(.85, 1, 40);
      this.disc = new THREE.CircleGeometry(1,32);
      this.chip = new THREE.BoxGeometry(1,1,1);
      this.cone = new THREE.ConeGeometry(1,2,6).rotateX(Math.PI/2);
      this.metal = new THREE.MeshStandardMaterial({color:0xc7c6ad,metalness:.6,roughness:.4});
      this.dark = new THREE.MeshStandardMaterial({color:0x3b4541,metalness:.5,roughness:.5});
      this.hot = new THREE.MeshBasicMaterial({color:0xffdc8e});
      this.seed = 1;
      this.ceiling = null;
    }
    random() { this.seed = (Math.imul(this.seed,1664525)+1013904223)>>>0; return this.seed/4294967296; }
    vector(v) { return new THREE.Vector3(v.x,v.y,v.z); }
    removeParticle(p) {
      this.root.remove(p.mesh);
      const pool=this.particlePool.get(p.poolKey)||[];
      if(pool.length<32){pool.push(p.mesh);this.particlePool.set(p.poolKey,pool);}else p.mesh.material.dispose();
    }
    particle(point, velocity, color, size, life, options={}) {
      if(this.particles.length >= 240) this.removeParticle(this.particles.shift());
      const geometry=options.disc?this.disc:options.ring?this.ring:options.chip?this.chip:options.cone?this.cone:this.sphere,poolKey=geometry.id+':'+Boolean(options.glow)+':'+(this.ceiling??'open');
      let mesh=this.particlePool.get(poolKey)?.pop();
      if(!mesh)mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,blending:options.glow?THREE.AdditiveBlending:THREE.NormalBlending,side:THREE.DoubleSide,clippingPlanes:this.ceiling===null?[]:[new THREE.Plane(new THREE.Vector3(0,-1,0),this.ceiling)]}));
      mesh.material.color.set(color);mesh.material.opacity=options.opacity??.8;mesh.rotation.set(0,0,0);mesh.position.copy(point);mesh.scale.set(size,size,size*(options.stretch||1));
      if(options.ring||options.disc) {mesh.rotation.x=-Math.PI/2;mesh.rotation.z=options.yaw||0;if(options.height!==undefined)mesh.position.y=options.height;}
      if(options.flatStretch)mesh.scale.set(size,size*options.flatStretch,size);
      if(options.direction){mesh.position.copy(point);mesh.lookAt(point.clone().add(options.direction));}
      mesh.visible=!options.delay;
      this.particles.push({mesh,poolKey,velocity,fresh:true,stretch:options.stretch||1,flatStretch:options.flatStretch||1,age:-(options.delay||0),life,size,end:options.end??size*2,opacity:options.opacity??.8,gravity:options.gravity||0,drag:options.drag||0,from:new THREE.Color(color),to:new THREE.Color(options.to??color)});
    }
    syncParticles(camera) {
      // Particle meshes hold simulation transforms only. Render matching shapes/blends
      // together, with a separate color and opacity for every instance.
      for(const batch of this.particleBatches.values())batch.items.length=0;
      for(const p of this.particles){
        if(!p.mesh.visible)continue;
        let batch=this.particleBatches.get(p.poolKey);
        if(!batch){
          const geometry=p.mesh.geometry.clone(),colors=new THREE.InstancedBufferAttribute(new Float32Array(240*4),4);
          colors.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('color',colors);
          const material=p.mesh.material.clone();material.color.set(0xffffff);material.opacity=1;material.vertexColors=true;
          const mesh=new THREE.InstancedMesh(geometry,material,240);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;
          batch={mesh,colors,items:[]};this.particleBatches.set(p.poolKey,batch);this.root.add(mesh);
        }
        batch.items.push(p);
      }
      for(const batch of this.particleBatches.values()){
        // Transparent instances need their own back-to-front order within a batch.
        if(camera){const e=camera.matrixWorldInverse.elements;for(const p of batch.items){const v=p.mesh.position;p.depth=e[2]*v.x+e[6]*v.y+e[10]*v.z+e[14];}batch.items.sort((a,b)=>a.depth-b.depth);}
        batch.mesh.count=batch.items.length;batch.mesh.visible=batch.items.length>0;
        batch.items.forEach((p,i)=>{p.mesh.updateMatrix();batch.mesh.setMatrixAt(i,p.mesh.matrix);const c=p.mesh.material.color;batch.colors.setXYZW(i,c.r,c.g,c.b,p.mesh.material.opacity);});
        batch.mesh.instanceMatrix.needsUpdate=true;batch.colors.needsUpdate=true;
      }
    }
    smoke(point, count=3, size=.3, dark=false) {
      for(let i=0;i<count;i++) this.particle(point,new THREE.Vector3((this.random()-.5)*.9,.6+this.random(),(this.random()-.5)*.9),dark?0x444945:0x74796e,size,.7+this.random()*.6,{end:size*3,opacity:dark?.45:.33,to:0xabb0a0,delay:i*.025});
    }
    groundWave(point, color, radius, life, surfaceY, opacity=.35) {
      this.particle(point,new THREE.Vector3(),color,.18,life,{ring:true,height:surfaceY,end:radius,opacity});
    }
    splash(point,kind,surfaceY) {
      const heavy=['artillery','bomb','heavyCannon'].includes(kind),size=heavy?2.5:kind==='rocket'?1.7:.8;
      const p=point.clone();p.y=surfaceY;
      this.groundWave(p,0xc5e9eb,size*2.5,1.1,surfaceY,.55);
      this.particle(p,new THREE.Vector3(0,2.2,0),0xe3f9f4,size*.35,.75,{end:size*.6,stretch:3,opacity:.65,gravity:5});
      for(let i=0;i<(heavy?12:6);i++){
        const a=this.random()*Math.PI*2,s=(1+this.random()*2)*size;
        this.particle(p,new THREE.Vector3(Math.cos(a)*s,3+this.random()*6,Math.sin(a)*s),0xc2e9e8,.06,.45+this.random()*.3,{end:.025,stretch:2,gravity:11,opacity:.8});
      }
    }
    beam(origin,aim,kind) {
      if(this.beams.length>=16) this.removeBeam(this.beams.shift());
      const electric=kind==='tesla', points=[],delta=aim.clone().sub(origin);
      const material=new THREE.MeshBasicMaterial({color:electric?0x39d9ff:kind==='railgun'?0x99ffff:0xfff5cf,transparent:true,opacity:.95,depthWrite:false,toneMapped:false,blending:electric?THREE.NormalBlending:THREE.AdditiveBlending,clippingPlanes:this.ceiling===null?[]:[new THREE.Plane(new THREE.Vector3(0,-1,0),this.ceiling)]});
      const n=electric?12:1;
      const group=new THREE.InstancedMesh(this.sphere,material,n+Math.floor(n/3)),segment=new THREE.Object3D();let next=0;
      for(let i=0;i<=n;i++) {
        const p=origin.clone().addScaledVector(delta,i/n);
        if(i&&i<n) p.add(new THREE.Vector3((this.random()-.5)*.8,(this.random()-.5)*.7,(this.random()-.5)*.8));
        points.push(p);
      }
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i],line=segment;
        line.position.copy(a).lerp(b,.5);line.lookAt(b);line.scale.set(electric?.13:kind==='railgun'?.11:.035,electric?.13:kind==='railgun'?.11:.035,a.distanceTo(b)/2);line.updateMatrix();group.setMatrixAt(next++,line.matrix);
        if(electric&&i%3===0) {const twig=segment,end=a.clone().add(new THREE.Vector3(this.random()-.5,.5,this.random()-.5));twig.position.copy(a).lerp(end,.5);twig.lookAt(end);twig.scale.set(.055,.055,a.distanceTo(end)/2);twig.updateMatrix();group.setMatrixAt(next++,twig.matrix);}
      }
      group.count=next;group.computeBoundingSphere();
      this.root.add(group);this.beams.push({group,material,fresh:true,life:electric?.38:kind==='railgun'?.32:.14,age:0,electric});
    }
    removeBeam(b) { this.root.remove(b.group);b.group.dispose();b.material.dispose(); }
    muzzle(point, direction, kind) {
      if(kind==='tesla') {this.particle(point,new THREE.Vector3(),0x8cefff,.45,.32,{glow:true,end:1.1});return;}
      if(kind==='rocket') {
        // Launch exhaust comes from the tube, not a cannon-style fireball.
        this.particle(point,direction.clone().multiplyScalar(-3),0xffb850,.3,.27,{cone:true,direction:direction.clone().negate(),stretch:3,end:.08,glow:true});
        this.smoke(point,4,.35);return;
      }
      if(kind==='flame') {
        for(let i=0;i<20;i++) {
          const spread=.35+i*.025, velocity=direction.clone().multiplyScalar(11+this.random()*5).add(new THREE.Vector3((this.random()-.5)*spread,(this.random()-.5)*spread+.25,(this.random()-.5)*spread));
          this.particle(point,velocity,i%3?0xff8a18:0xffda71,.22,.42+this.random()*.16,{end:1.05,opacity:.85,stretch:1.6,to:0xb82f08,delay:i*.009,drag:.7});
        }
        this.smoke(point,2,.16);return;
      }
      const big=['cannon','heavyCannon','artillery','railgun'].includes(kind),size=kind==='artillery'?.9:kind==='heavyCannon'?.7:big?.5:.17;
      this.particle(point,direction.clone().multiplyScalar(2),kind==='railgun'?0xb5ffff:0xffdf93,size,big?.22:.1,{cone:true,direction,stretch:big?3.5:2.5,end:.02,glow:true});
      if(big) {
        this.particle(point,new THREE.Vector3(),kind==='railgun'?0x77eaff:0xe9d4a8,.18,.22,{ring:true,direction,end:size*3,opacity:.45});
        this.smoke(point,kind==='artillery'?6:3,size*.7);
      } else if(kind!=='sniper') {
        const side=new THREE.Vector3(direction.z,0,-direction.x);
        this.particle(point.clone().addScaledVector(side,.2),side.multiplyScalar(2).add(new THREE.Vector3(0,1.8,0)),0xc5a55d,.055,.4,{chip:true,stretch:2,end:.055,gravity:9,opacity:1});
      }
    }
    addFlight(flight) {
      if(this.flights.length>=64)this.root.remove(this.flights.shift().mesh);
      flight.fresh=true;this.root.add(flight.mesh);this.flights.push(flight);
    }
    tracers(origin,aim,kind) {
      const count=kind==='rifle'?1:3;
      for(let i=0;i<count;i++) {
        const mesh=new THREE.Mesh(this.sphere,this.hot),width=kind==='autocannon'?.09:.045;
        mesh.scale.set(width,width,kind==='autocannon'?1.1:.65);mesh.position.copy(origin);mesh.lookAt(aim);mesh.visible=i===0;
        this.addFlight({mesh,origin,aim,kind:'tracer',arc:0,duration:Math.max(.08,origin.distanceTo(aim)/100),age:-i*.045,trail:0});
      }
    }
    shot(event) {
      this.seed=event.id*7919;const origin=this.vector(event.origin),aim=this.vector(event.aim),direction=aim.clone().sub(origin).normalize(),kind=event.visual;
      if(kind!=='bomb')this.muzzle(origin,direction,kind);
      if(['rifle','machinegun','autocannon'].includes(kind)){this.tracers(origin,aim,kind);return;}
      if(['tesla','sniper','railgun'].includes(kind)) {
        this.beam(origin,aim,kind);
        if(kind==='railgun')for(let i=1;i<=8;i++)this.particle(origin.clone().lerp(aim,i/9),new THREE.Vector3(0,.4,0),0x79deff,.12,.45,{end:.35,glow:true,delay:i*.008});
        return;
      }
      if(kind==='flame') return;
      const group=new THREE.Group(),rocket=kind==='rocket',bomb=kind==='bomb',shell=kind==='artillery';
      const body=new THREE.Mesh(this.sphere,bomb?this.dark:rocket||shell?this.metal:this.hot);body.scale.set(bomb?.24:rocket||shell?.13:.09,bomb?.24:rocket||shell?.13:.09,bomb?.6:rocket||shell?.48:.38);group.add(body);
      if(rocket||bomb) {
        for(let i=0;i<4;i++){const fin=new THREE.Mesh(this.chip,this.dark);fin.position.set(Math.sin(i*Math.PI/2)*.19,Math.cos(i*Math.PI/2)*.19,-.3);fin.scale.set(.07,.3,.24);fin.rotation.z=i*Math.PI/2;group.add(fin);}
      }
      if(rocket) {
        const exhaust=new THREE.Mesh(this.sphere,this.hot);exhaust.position.z=-.65;exhaust.scale.set(.2,.2,.7);group.add(exhaust);
      }
      group.position.copy(origin);group.lookAt(aim);
      this.addFlight({mesh:group,origin,aim,kind,arc:event.arc||0,duration:Math.max(.06,event.duration),age:0,trail:0});
    }
    impact(event) {
      this.seed=event.id*3571;const p=this.vector(event.point),kind=event.visual;
      const surfaceY=event.surfaceY??.08,grounded=event.surface!=='air'&&p.y-surfaceY<4;
      if(event.surface==='water'&&grounded&&kind!=='tesla'&&kind!=='flame'){
        this.splash(p,kind,surfaceY);
        // Hot fragments remain visible above the spray without a land dust cloud.
        this.particle(p,new THREE.Vector3(0,.5,0),0xffdba1,.15,.12,{glow:true,end:.45});
        return;
      }
      if(kind==='tesla') {
        this.particle(p,new THREE.Vector3(),0xeeffff,.13,.12,{end:.4,glow:true});
        this.particle(p,new THREE.Vector3(),0x5ee5ff,.4,.4,{end:1.4,glow:true});
        if(grounded)this.groundWave(p,0x58dfff,2,.4,surfaceY,.65);
        for(let i=0;i<3;i++)this.beam(p,p.clone().add(new THREE.Vector3((this.random()-.5)*4, this.random()*2.5,(this.random()-.5)*4)),'tesla');
        return;
      }
      if(kind==='flame') {
        for(let i=0;i<5;i++)this.particle(p,new THREE.Vector3((this.random()-.5)*1.4,1+this.random(),(this.random()-.5)*1.4),0xff9c29,.35,.65,{end:.8,to:0xa72b08,opacity:.65});
        for(let i=0;i<3;i++)this.particle(p,new THREE.Vector3((this.random()-.5)*.7,1.6+this.random(),(this.random()-.5)*.7),0xffc253,.035,.65,{end:.01,glow:true,drag:.3});
        this.smoke(p,2,.23);return;
      }
      if(['rifle','machinegun','autocannon','sniper','railgun'].includes(kind)) {
        const rail=kind==='railgun',count=rail?10:kind==='autocannon'?6:3;
        for(let i=0;i<count;i++)this.particle(p,new THREE.Vector3((this.random()-.5)*5,this.random()*3,(this.random()-.5)*5),rail?0x9cfaff:0xffd88a,.035,.16+this.random()*.15,{stretch:3,end:.01,gravity:5,glow:true});
        if(rail){this.particle(p,new THREE.Vector3(),0xd9ffff,.16,.12,{end:.65,glow:true});if(grounded)this.groundWave(p,0x7cdce5,.85,.24,surfaceY,.55);}
        this.smoke(p,rail?2:1,rail?.18:.09);return;
      }
      const style=impactStyles[kind]||impactStyles.cannon,r=style.radius;
      this.particle(p,new THREE.Vector3(0,.5,0),0xffefb0,r*.2,.16,{end:r*.35,glow:true,opacity:.7});
      // Saturated fire lobes last long enough to read at the usual RTS zoom.
      for(let i=0;i<3;i++){
        const a=i*Math.PI*2/3;
        this.particle(p.clone().add(new THREE.Vector3(Math.cos(a)*r*.16,0,Math.sin(a)*r*.16)),new THREE.Vector3(Math.cos(a)*.4,1.2+i*.3,Math.sin(a)*.4),i===0?0xffd16a:0xff741c,r*.24,style.fire,{end:r*.5,to:0x8c2e14,opacity:.9,delay:i*.025});
      }
      for(let i=0;i<style.debris;i++){
        const a=this.random()*Math.PI*2,v=r*(1.3+this.random());
        this.particle(p,new THREE.Vector3(Math.cos(a)*v,2+this.random()*r,Math.sin(a)*v),i%2?0xffb347:0xffe9aa,.085,.5+this.random()*.3,{stretch:4,end:.025,glow:true,gravity:10});
        if(i%2===0)this.particle(p,new THREE.Vector3(Math.cos(a)*v*.65,2+this.random()*3,Math.sin(a)*v*.65),0x625c50,.17,.9,{chip:true,end:.07,gravity:9});
      }
      // Chunky smoke is shape and opacity rather than hundreds of tiny particles.
      for(let i=0;i<4;i++)this.particle(p.clone().add(new THREE.Vector3((this.random()-.5)*r*.5,.3,(this.random()-.5)*r*.5)),new THREE.Vector3((this.random()-.5)*.6,1.2+i*.4,(this.random()-.5)*.6),0x40433f,style.smoke,1.4+i*.18,{end:r*.5,to:0x7b8076,opacity:.58,delay:.15+i*.07,drag:.3});
      if(grounded){
        this.groundWave(p,0xe3ba75,r*1.4,.7,surfaceY,.65);
        if(kind==='bomb'||kind==='artillery')this.groundWave(p,0xd6c1a0,r*1.9,1.05,surfaceY,.4);
        this.particle(p,new THREE.Vector3(),0xffa13c,r*.3,.35,{disc:true,height:surfaceY+.015,end:r*.75,glow:true,opacity:.35});
        this.particle(p,new THREE.Vector3(),0x282b26,r*.35,7,{disc:true,height:surfaceY,end:r*.45,opacity:.5});
        for(let i=0;i<4;i++){
          const a=i*Math.PI/2;
          this.particle(new THREE.Vector3(p.x,surfaceY+.15,p.z),new THREE.Vector3(Math.cos(a)*r*.8,.15,Math.sin(a)*r*.8),0xb7a27e,r*.12,.9,{end:r*.4,opacity:.35,drag:1.5});
        }
      }
    }
    emit(event) {
      this.ceiling=event.ceiling??null;
      try{if(event.type==='shot')this.shot(event);else this.impact(event);}finally{this.ceiling=null;}
    }
    update(dt,camera) {
      if(dt<=0){this.syncParticles(camera);return;}
      for(let i=this.flights.length-1;i>=0;i--) {
        const f=this.flights[i];if(f.fresh){f.fresh=false;continue;}f.age+=dt;if(f.age<0)continue;f.mesh.visible=true;f.trail+=dt;const t=Math.min(1,f.age/f.duration),travel=f.kind==='rocket'?t*(.55+.45*t):f.kind==='bomb'?t*t:t;
        const previous=f.mesh.position.clone();f.mesh.position.lerpVectors(f.origin,f.aim,travel);f.mesh.position.y+=Math.sin(t*Math.PI)*f.arc;
        const tangent=f.mesh.position.clone().sub(previous);if(tangent.lengthSq()) f.mesh.lookAt(f.mesh.position.clone().add(tangent));
        if(['rocket','artillery'].includes(f.kind)&&f.trail>.045) {f.trail=0;this.particle(f.mesh.position,new THREE.Vector3(0,.35,0),f.kind==='rocket'?0xabb1a5:0xb9b4a1,f.kind==='rocket'?.27:.1,f.kind==='rocket'?.9:.35,{end:f.kind==='rocket'?.8:.23,opacity:f.kind==='rocket'?.45:.15});}
        if(t>=1) {this.root.remove(f.mesh);this.flights.splice(i,1);}
      }
      for(let i=this.beams.length-1;i>=0;i--) {const b=this.beams[i];if(b.fresh){b.fresh=false;continue;}b.age+=dt;b.material.opacity=Math.max(0,1-b.age/b.life)*(b.electric?(.65+.35*Math.sin(b.age*160)**2):1);if(b.age>=b.life){this.removeBeam(b);this.beams.splice(i,1);}}
      for(let i=this.particles.length-1;i>=0;i--) {
        const p=this.particles[i];if(p.fresh){p.fresh=false;continue;}p.age+=dt;if(p.age<0)continue;p.mesh.visible=true;
        const t=Math.min(1,p.age/p.life);p.velocity.y-=p.gravity*dt;p.velocity.multiplyScalar(Math.exp(-p.drag*dt));p.mesh.position.addScaledVector(p.velocity,dt);
        const size=THREE.MathUtils.lerp(p.size,p.end,t);p.mesh.scale.set(size,size*p.flatStretch,size*p.stretch);if(p.stretch!==1)p.mesh.lookAt(p.mesh.position.clone().add(p.velocity));p.mesh.material.opacity=p.opacity*(1-t);p.mesh.material.color.lerpColors(p.from,p.to,t);
        if(t>=1){this.removeParticle(p);this.particles.splice(i,1);}
      }
      this.syncParticles(camera);
    }
    clear() {for(const p of this.particles)this.removeParticle(p);for(const b of this.beams)this.removeBeam(b);for(const pool of this.particlePool.values())for(const mesh of pool)mesh.material.dispose();for(const {mesh} of this.particleBatches.values()){mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();}this.particlePool.clear();this.particleBatches.clear();this.root.clear();this.particles=[];this.beams=[];this.flights=[];}
  }
  // Movement has its own small budget so smoke trails cannot evict combat effects.
  class MotionFX extends WeaponFX {
    particle(...args){if(this.particles.length<96)super.particle(...args);}
    trail({id,tick,point,direction,domain,wide=false,ceiling=null}){
      this.seed=(id*7919+tick*3571)>>>0;this.ceiling=ceiling;
      const p=this.vector(point),forward=this.vector(direction),side=new THREE.Vector3(forward.z,0,-forward.x);
      try{
        if(domain==='water'){
          for(const sign of [-1,1])this.particle(p.clone().addScaledVector(side,sign*(wide?.6:.35)),side.clone().multiplyScalar(sign*.7).addScaledVector(forward,-.35),0xc5eae2,wide?.3:.2,1.5,{disc:true,height:.19,end:wide?.7:.5,flatStretch:2.2,yaw:Math.atan2(forward.x,forward.z),opacity:.28});
        }else if(domain==='air'){
          this.particle(p,forward.clone().multiplyScalar(-2),0x83dbff,.18,.23,{cone:true,direction:forward.clone().negate(),stretch:3,end:.04,glow:true,opacity:.65});
          this.particle(p.clone().addScaledVector(forward,-.7),new THREE.Vector3(0,.08,0),0xd6e4df,.15,1.15,{end:.5,opacity:.22});
        }else{
          for(const sign of [-1,1])this.particle(p.clone().addScaledVector(side,sign*.45),forward.clone().multiplyScalar(-.6).add(new THREE.Vector3(sign*.2,.35,0)),0xb8a27a,wide?.25:.16,.85,{end:wide?.85:.55,opacity:.3,drag:1});
        }
      }finally{this.ceiling=null;}
    }
  }
  window.FIELD_WEAPONS={profiles,kinds,impactStyles,WeaponFX,MotionFX};
})();
