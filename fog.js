/* Shared team sight grid. Rendering is cosmetic; orders also check this grid. */
(() => {
  class FieldFog {
    constructor(map) {
      this.map=map; this.size=2; this.width=Math.ceil(map.halfWidth*2/this.size); this.height=Math.ceil(map.halfDepth*2/this.size); this.teams={};
      this.pixels=new Uint8Array(this.width*this.height*4);
      this.texture=new THREE.DataTexture(this.pixels,this.width,this.height,THREE.RGBAFormat);
      this.texture.magFilter=THREE.LinearFilter; this.texture.minFilter=THREE.LinearFilter;
    }
    reset() { this.teams={}; }
    team(id) { return this.teams[id] ||= {seen:new Uint8Array(this.width*this.height), visible:new Uint8Array(this.width*this.height),revision:0}; }
    index(x,z) { const ix=Math.floor((x+this.map.halfWidth)/this.size), iz=Math.floor((z+this.map.halfDepth)/this.size); return ix<0||iz<0||ix>=this.width||iz>=this.height?-1:iz*this.width+ix; }
    at(team,x,z,explored=false) { return Boolean(this.team(team)[explored?'seen':'visible'][this.index(x,z)]); }
    update(entities) {
      for(const t of Object.values(this.teams)) t.visible.fill(0);
      for(const e of entities) {
        if(e.hp<=0 || e.buildLeft) continue;
        const t=this.team(e.team), p=e.mesh.position;
        const radius=e.kind==='scout'?18:e.type==='building'?Math.max(13,(FIELD_DATA.buildings[e.kind].range||0)+3):Math.max(11,(FIELD_DATA.units[e.kind].range||0)+3);
        const x0=Math.max(0,Math.floor((p.x-radius+this.map.halfWidth)/this.size)), x1=Math.min(this.width-1,Math.ceil((p.x+radius+this.map.halfWidth)/this.size));
        const z0=Math.max(0,Math.floor((p.z-radius+this.map.halfDepth)/this.size)), z1=Math.min(this.height-1,Math.ceil((p.z+radius+this.map.halfDepth)/this.size));
        for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++) if((x*this.size+1-this.map.halfWidth-p.x)**2+(z*this.size+1-this.map.halfDepth-p.z)**2<=radius*radius) {const i=z*this.width+x;if(!t.seen[i]){t.seen[i]=1;t.revision++;}t.visible[i]=1;}
      }
    }
    display(team) {
      const t=this.team(team);
      for(let i=0;i<t.seen.length;i++){const value=t.visible[i]?255:t.seen[i]?85:0;this.pixels.fill(value,i*4,i*4+3);this.pixels[i*4+3]=255;}
      this.texture.needsUpdate=true;
    }
    save(compact=false) { return Object.fromEntries(Object.entries(this.teams).map(([id,t])=>{
      if(!compact)return [id,Array.from(t.seen).join('')];
      if(t.encodedRevision!==t.revision){const bytes=new Uint8Array(Math.ceil(t.seen.length/8));for(let i=0;i<t.seen.length;i++)if(t.seen[i])bytes[i>>3]|=1<<(i&7);t.encoded='b:'+btoa(String.fromCharCode(...bytes));t.encodedRevision=t.revision;}
      return [id,t.encoded];
    })); }
    restore(data) { for(const [id,bits] of Object.entries(data||{})) {const t=this.team(id);if(t.lastRestored===bits)continue;const packed=bits.startsWith('b:')?atob(bits.slice(2)):null;for(let i=0;i<t.seen.length;i++)t.seen[i]=packed!==null?((packed.charCodeAt(i>>3)>>(i&7))&1):bits[i]==='1'?1:0;t.revision++;t.lastRestored=bits;} }
    summary(team) {const t=this.team(team);return {explored:t.seen.reduce((a,b)=>a+b,0),visible:t.visible.reduce((a,b)=>a+b,0),total:t.seen.length};}
    // World-space fog shades terrain, trees and effects at their actual position.
    shade(material,conceal=false) {
      if(!material || material.userData.fieldFog)return;
      material.userData.fieldFog=true;
      material.onBeforeCompile=shader=>{
        shader.uniforms.fieldFog={value:this.texture};
        shader.vertexShader='varying vec2 fogXZ;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 fogWorld=vec4(transformed,1.0);
          #ifdef USE_INSTANCING
          fogWorld=instanceMatrix*fogWorld;
          #endif
          fogXZ=(modelMatrix*fogWorld).xz;
          #include <project_vertex>`);
        shader.fragmentShader='uniform sampler2D fieldFog; varying vec2 fogXZ;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
          vec2 fogUV=(fogXZ+vec2(${this.map.halfWidth.toFixed(1)},${this.map.halfDepth.toFixed(1)}))/vec2(${(this.map.halfWidth*2).toFixed(1)},${(this.map.halfDepth*2).toFixed(1)});
          if(fogUV.x>=0.0&&fogUV.x<=1.0&&fogUV.y>=0.0&&fogUV.y<=1.0){
            float sight=texture2D(fieldFog,fogUV).r;
            ${conceal?'if(sight<0.99)discard;':''}
            gl_FragColor.rgb=mix(vec3(0.018,0.027,0.035),gl_FragColor.rgb,sight);
          }`);
      };
      material.customProgramCacheKey=()=> 'field-fog-v1-'+conceal; material.needsUpdate=true;
    }
  }
  window.FieldFog=FieldFog;
})();
