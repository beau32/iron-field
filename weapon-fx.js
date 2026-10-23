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
  class WeaponFX {
    constructor(scene) {
      this.root = new THREE.Group(); scene.add(this.root);
      this.particles = []; this.flights = []; this.beams = [];
      this.sphere = new THREE.IcosahedronGeometry(1, 1);
      this.ring = new THREE.RingGeometry(.85, 1, 40);
      this.chip = new THREE.BoxGeometry(1,1,1);
      this.cone = new THREE.ConeGeometry(1,2,6).rotateX(Math.PI/2);
      this.metal = new THREE.MeshStandardMaterial({color:0xc7c6ad,metalness:.6,roughness:.4});
      this.dark = new THREE.MeshStandardMaterial({color:0x3b4541,metalness:.5,roughness:.5});
      this.hot = new THREE.MeshBasicMaterial({color:0xffdc8e});
      this.seed = 1;
    }
    random() { this.seed = (Math.imul(this.seed,1664525)+1013904223)>>>0; return this.seed/4294967296; }
    vector(v) { return new THREE.Vector3(v.x,v.y,v.z); }
    removeParticle(p) { this.root.remove(p.mesh);p.mesh.material.dispose(); }
    particle(point, velocity, color, size, life, options={}) {
      if(this.particles.length >= 240) this.removeParticle(this.particles.shift());
      const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:options.opacity??.8,depthWrite:false,blending:options.glow?THREE.AdditiveBlending:THREE.NormalBlending,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(options.ring?this.ring:options.chip?this.chip:options.cone?this.cone:this.sphere,material);mesh.position.copy(point);mesh.scale.set(size,size,size*(options.stretch||1));
      if(options.ring) {mesh.rotation.x=-Math.PI/2;mesh.position.y=.13;}
      if(options.direction){mesh.position.copy(point);mesh.lookAt(point.clone().add(options.direction));}
      mesh.visible=!options.delay;this.root.add(mesh);
      this.particles.push({mesh,velocity,fresh:true,stretch:options.stretch||1,age:-(options.delay||0),life,size,end:options.end??size*2,opacity:options.opacity??.8,gravity:options.gravity||0,drag:options.drag||0,from:new THREE.Color(color),to:new THREE.Color(options.to??color)});
    }
    smoke(point, count=3, size=.3) {
      for(let i=0;i<count;i++) this.particle(point,new THREE.Vector3((this.random()-.5)*.9,.6+this.random(),(this.random()-.5)*.9),0x74796e,size,.7+this.random()*.6,{end:size*3,opacity:.33,to:0xabb0a0,delay:i*.025});
    }
    beam(origin,aim,kind) {
      if(this.beams.length>=16) this.removeBeam(this.beams.shift());
      const electric=kind==='tesla', group=new THREE.Group(), points=[],delta=aim.clone().sub(origin);
      const material=new THREE.MeshBasicMaterial({color:electric?0x39d9ff:kind==='railgun'?0x99ffff:0xfff5cf,transparent:true,opacity:.95,depthWrite:false,toneMapped:false,blending:electric?THREE.NormalBlending:THREE.AdditiveBlending});
      const n=electric?12:1;
      for(let i=0;i<=n;i++) {
        const p=origin.clone().addScaledVector(delta,i/n);
        if(i&&i<n) p.add(new THREE.Vector3((this.random()-.5)*.8,(this.random()-.5)*.7,(this.random()-.5)*.8));
        points.push(p);
      }
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i],line=new THREE.Mesh(this.sphere,material);
        line.position.copy(a).lerp(b,.5);line.lookAt(b);line.scale.set(electric?.055:kind==='railgun'?.055:.022,electric?.055:.025,a.distanceTo(b)/2);group.add(line);
        if(electric&&i%3===0) {const twig=new THREE.Mesh(this.sphere,material),end=a.clone().add(new THREE.Vector3(this.random()-.5,.5,this.random()-.5));twig.position.copy(a).lerp(end,.5);twig.lookAt(end);twig.scale.set(.025,.025,a.distanceTo(end)/2);group.add(twig);}
      }
      this.root.add(group);this.beams.push({group,material,fresh:true,life:electric?.24:kind==='railgun'?.18:.1,age:0,electric});
    }
    removeBeam(b) { this.root.remove(b.group);b.material.dispose(); }
    muzzle(point, direction, kind) {
      if(kind==='tesla') {this.particle(point,new THREE.Vector3(),0x8cefff,.3,.24,{glow:true,end:.6});return;}
      if(kind==='rocket') {
        // Launch exhaust comes from the tube, not a cannon-style fireball.
        this.particle(point,direction.clone().multiplyScalar(-3),0xffb850,.18,.18,{cone:true,direction:direction.clone().negate(),stretch:3,end:.08,glow:true});
        this.smoke(point,4,.2);return;
      }
      if(kind==='flame') {
        for(let i=0;i<20;i++) {
          const spread=.35+i*.025, velocity=direction.clone().multiplyScalar(11+this.random()*5).add(new THREE.Vector3((this.random()-.5)*spread,(this.random()-.5)*spread+.25,(this.random()-.5)*spread));
          this.particle(point,velocity,i%3?0xff8a18:0xffda71,.13,.3+this.random()*.16,{end:.7,opacity:.85,stretch:1.6,to:0xb82f08,delay:i*.009,drag:.7});
        }
        this.smoke(point,2,.16);return;
      }
      const big=['cannon','heavyCannon','artillery','railgun'].includes(kind),size=kind==='artillery'?.52:kind==='heavyCannon'?.42:big?.29:.11;
      this.particle(point,direction.clone().multiplyScalar(2),kind==='railgun'?0xb5ffff:0xffdf93,size,big?.13:.065,{cone:true,direction,stretch:big?2.5:2,end:.02,glow:true});
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
        const mesh=new THREE.Mesh(this.sphere,this.hot),width=kind==='autocannon'?.06:.028;
        mesh.scale.set(width,width,kind==='autocannon'?.65:.4);mesh.position.copy(origin);mesh.lookAt(aim);mesh.visible=i===0;
        this.addFlight({mesh,origin,aim,kind:'tracer',arc:0,duration:Math.max(.08,origin.distanceTo(aim)/100),age:-i*.045,trail:0});
      }
    }
    shot(event) {
      this.seed=event.id*7919;const origin=this.vector(event.origin),aim=this.vector(event.aim),direction=aim.clone().sub(origin).normalize(),kind=event.visual;
      if(kind!=='bomb')this.muzzle(origin,direction,kind);
      if(['rifle','machinegun','autocannon'].includes(kind)){this.tracers(origin,aim,kind);return;}
      if(['tesla','sniper','railgun'].includes(kind)) {
        this.beam(origin,aim,kind);
        if(kind==='railgun')for(let i=1;i<=8;i++)this.particle(origin.clone().lerp(aim,i/9),new THREE.Vector3(0,.4,0),0x79deff,.07,.3,{end:.22,glow:true,delay:i*.008});
        return;
      }
      if(kind==='flame') return;
      const group=new THREE.Group(),rocket=kind==='rocket',bomb=kind==='bomb',shell=kind==='artillery';
      const body=new THREE.Mesh(this.sphere,bomb?this.dark:rocket||shell?this.metal:this.hot);body.scale.set(bomb?.24:rocket||shell?.13:.09,bomb?.24:rocket||shell?.13:.09,bomb?.6:rocket||shell?.48:.38);group.add(body);
      if(rocket||bomb) {
        for(let i=0;i<4;i++){const fin=new THREE.Mesh(this.chip,this.dark);fin.position.set(Math.sin(i*Math.PI/2)*.19,Math.cos(i*Math.PI/2)*.19,-.3);fin.scale.set(.07,.3,.24);fin.rotation.z=i*Math.PI/2;group.add(fin);}
      }
      if(rocket) {
        const exhaust=new THREE.Mesh(this.sphere,this.hot);exhaust.position.z=-.65;exhaust.scale.set(.1,.1,.3);group.add(exhaust);
      }
      group.position.copy(origin);group.lookAt(aim);
      this.addFlight({mesh:group,origin,aim,kind,arc:event.arc||0,duration:Math.max(.06,event.duration),age:0,trail:0});
    }
    impact(event) {
      this.seed=event.id*3571;const p=this.vector(event.point),kind=event.visual;
      if(kind==='tesla') {
        this.particle(p,new THREE.Vector3(),0x5ee5ff,.25,.26,{end:.8,glow:true});
        for(let i=0;i<3;i++)this.beam(p,p.clone().add(new THREE.Vector3((this.random()-.5)*2, this.random()*1.5,(this.random()-.5)*2)),'tesla');
        return;
      }
      if(kind==='flame') {
        for(let i=0;i<5;i++)this.particle(p,new THREE.Vector3((this.random()-.5)*1.4,1+this.random(),(this.random()-.5)*1.4),0xff9c29,.22,.45,{end:.45,to:0xa72b08,opacity:.65});
        this.smoke(p,2,.23);return;
      }
      if(['rifle','machinegun','autocannon','sniper','railgun'].includes(kind)) {
        const rail=kind==='railgun',count=rail?10:kind==='autocannon'?6:3;
        for(let i=0;i<count;i++)this.particle(p,new THREE.Vector3((this.random()-.5)*5,this.random()*3,(this.random()-.5)*5),rail?0x9cfaff:0xffd88a,.035,.16+this.random()*.15,{stretch:3,end:.01,gravity:5,glow:true});
        this.smoke(p,rail?2:1,rail?.18:.09);return;
      }
      const big=['artillery','rocket','heavyCannon','bomb'].includes(kind),cannon=big||kind==='cannon'||kind==='railgun',electric=kind==='tesla',flame=kind==='flame';
      for(let i=0;i<(big?14:7);i++) {
        const a=this.random()*Math.PI*2,speed=(big?4:2)*(this.random()+.3);
        this.particle(p,new THREE.Vector3(Math.cos(a)*speed,1+this.random()*(big?4:2),Math.sin(a)*speed),electric?0x84efff:i%2?0xffd68b:0xff8e31,big?.14:.06,.18+this.random()*.3,{end:.02,glow:true,gravity:7});
      }
      if(cannon) {
        this.particle(p,new THREE.Vector3(0,.3,0),0xffd587,big?.7:.38,.2,{end:big?1.8:.8,glow:true,to:0xe8702c});
        this.smoke(p,big?7:4,big?.5:.3);
        if(['artillery','bomb','heavyCannon'].includes(kind))for(let i=0;i<6;i++)this.particle(p,new THREE.Vector3((this.random()-.5)*6,2+this.random()*4,(this.random()-.5)*6),0x686354,.09,.6,{chip:true,end:.04,gravity:10,opacity:.8});
        if(p.y<3)this.particle(p,new THREE.Vector3(),0xc6b48a,.35,.4,{ring:true,end:big?2.6:1.4,opacity:.45});
      } else if(flame) this.smoke(p,2,.23);
      else if(!electric) this.smoke(p,1,.1);
    }
    emit(event) { if(event.type==='shot')this.shot(event);else this.impact(event); }
    update(dt) {
      if(dt<=0)return;
      for(let i=this.flights.length-1;i>=0;i--) {
        const f=this.flights[i];if(f.fresh){f.fresh=false;continue;}f.age+=dt;if(f.age<0)continue;f.mesh.visible=true;f.trail+=dt;const t=Math.min(1,f.age/f.duration),travel=f.kind==='rocket'?t*(.55+.45*t):f.kind==='bomb'?t*t:t;
        const previous=f.mesh.position.clone();f.mesh.position.lerpVectors(f.origin,f.aim,travel);f.mesh.position.y+=Math.sin(t*Math.PI)*f.arc;
        const tangent=f.mesh.position.clone().sub(previous);if(tangent.lengthSq()) f.mesh.lookAt(f.mesh.position.clone().add(tangent));
        if(['rocket','artillery'].includes(f.kind)&&f.trail>.045) {f.trail=0;this.particle(f.mesh.position,new THREE.Vector3(0,.35,0),f.kind==='rocket'?0xabb1a5:0xb9b4a1,f.kind==='rocket'?.16:.06,f.kind==='rocket'?.65:.2,{end:f.kind==='rocket'?.5:.14,opacity:f.kind==='rocket'?.45:.15});}
        if(t>=1) {this.root.remove(f.mesh);this.flights.splice(i,1);}
      }
      for(let i=this.beams.length-1;i>=0;i--) {const b=this.beams[i];if(b.fresh){b.fresh=false;continue;}b.age+=dt;b.material.opacity=Math.max(0,1-b.age/b.life)*(b.electric?(.65+.35*Math.sin(b.age*160)**2):1);if(b.age>=b.life){this.removeBeam(b);this.beams.splice(i,1);}}
      for(let i=this.particles.length-1;i>=0;i--) {
        const p=this.particles[i];if(p.fresh){p.fresh=false;continue;}p.age+=dt;if(p.age<0)continue;p.mesh.visible=true;
        const t=Math.min(1,p.age/p.life);p.velocity.y-=p.gravity*dt;p.velocity.multiplyScalar(Math.exp(-p.drag*dt));p.mesh.position.addScaledVector(p.velocity,dt);
        const size=THREE.MathUtils.lerp(p.size,p.end,t);p.mesh.scale.set(size,size,size*p.stretch);if(p.stretch!==1)p.mesh.lookAt(p.mesh.position.clone().add(p.velocity));p.mesh.material.opacity=p.opacity*(1-t);p.mesh.material.color.lerpColors(p.from,p.to,t);
        if(t>=1){this.removeParticle(p);this.particles.splice(i,1);}
      }
    }
    clear() {for(const p of this.particles)this.removeParticle(p);for(const b of this.beams)this.removeBeam(b);this.root.clear();this.particles=[];this.beams=[];this.flights=[];}
  }
  window.FIELD_WEAPONS={profiles,kinds,WeaponFX};
})();
