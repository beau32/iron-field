/* IRON FIELD — a small, readable 3D RTS.
 * Open index.html directly. No build tools, server, accounts, or network required.
 * Three.js handles rendering. All game rules below are ordinary JavaScript.
 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  let MAP = FIELD_MAP.get('river');
  const HALF_X = MAP.halfWidth, HALF_Z = MAP.halfDepth;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (error) {
    $('announcement').textContent = 'The 3D renderer could not start. Open this folder’s index.html in Chrome or Edge with hardware acceleration enabled.';
    console.error(error);
    return;
  }

  // 1. SCENE, CAMERA, LIGHTS. Coordinates: X = east, Y = up, Z = south.
  // A scene is a tree of objects. A camera describes which part becomes an image.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#78959a');
  scene.fog = new THREE.Fog('#78959a', 210, 420);
  const ortho = new THREE.OrthographicCamera(-36, 36, 30, -30, 0.1, 200);
  const perspective = new THREE.PerspectiveCamera(44, 1, 0.1, 200);
  let camera = ortho;
  const view = { x: 0, z: 0, yaw: 0.27, span: 57 };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  scene.add(new THREE.HemisphereLight('#e8f4ed', '#424b38', 1.9));
  const sun = new THREE.DirectionalLight('#ffe2ac', 3.1);
  sun.position.set(-50, 90, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);

  const materials = [];
  function material(color, extra = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, ...extra });
    materials.push(m);
    return m;
  }
  const mat = {
    ground: material('#91a681'), edge: material('#6f8465'), sand: material('#b8b994'),
    road: material('#919783'), concrete: material('#b3bba8'), dark: material('#304946'),
    metal: material('#68786b'), teal: material('#388d79'), mint: material('#a6ead3'),
    red: material('#b95141'), coral: material('#ef9276'), leaf: material('#4b765c'),
    leafLight: material('#729273'), trunk: material('#685f48'), rock: material('#899781'),
    ore: material('#dbc179', { metalness: 0.25 }), black: material('#263633'),
    window: material('#b7e4d2', { emissive: '#7dcbb2', emissiveIntensity: 0.25 })
  };
  const friendlyRing = new THREE.MeshBasicMaterial({ color: '#7dff8d', side: THREE.DoubleSide, depthWrite: false });
  const targetRing = new THREE.MeshBasicMaterial({ color: '#fdc382', transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const shellMaterial = new THREE.MeshBasicMaterial({ color: '#fff5bb' });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const wheelGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 8);
  const shellGeometry = new THREE.SphereGeometry(0.12, 6, 4);
  const ringGeometry = new THREE.RingGeometry(1.1, 1.17, 40);
  const selectionRingGeometry = new THREE.RingGeometry(1.08, 1.24, 48);
  const burstGeometry = new THREE.IcosahedronGeometry(1, 0);

  function mesh(geometry, m, parent, x = 0, y = 0, z = 0) {
    const obj = new THREE.Mesh(geometry, m);
    obj.position.set(x, y, z);
    obj.castShadow = obj.receiveShadow = true;
    parent.add(obj);
    return obj;
  }
  function box(parent, m, x, y, z, sx, sy, sz) {
    const obj = mesh(boxGeometry, m, parent, x, y, z);
    obj.scale.set(sx, sy, sz);
    return obj;
  }
  function cylinder(parent, m, x, y, z, radius, height, sides = 10) {
    return mesh(new THREE.CylinderGeometry(radius, radius, height, sides), m, parent, x, y, z);
  }
  function ring(parent, m, radius = 1) {
    const obj = mesh(m === friendlyRing ? selectionRingGeometry : ringGeometry, m, parent, 0, 0.09, 0);
    obj.rotation.x = -Math.PI / 2;
    obj.scale.setScalar(radius);
    obj.castShadow = obj.receiveShadow = false;
    return obj;
  }

  // 2. WORLD ART. Primitive meshes, lit and shaded, become an entire little map.
  const world = new THREE.Group();
  scene.add(world);
  box(world, mat.edge, 0, -0.85, 0, HALF_X * 2 + 4, 1.6, HALF_Z * 2 + 4);
  const ground = box(world, mat.ground, 0, -0.08, 0, HALF_X * 2 + 4, 0.16, HALF_Z * 2 + 4);
  ground.castShadow = false;
  const road = box(world, mat.road, 0, 0.008, 0, 90, 0.025, 4.5);
  road.rotation.y = 0.58;
  for (let i = -42; i <= 42; i += 3) {
    const dash = box(world, mat.sand, i * Math.cos(0.58), 0.029, -i * Math.sin(0.58), 1.3, 0.013, 0.1);
    dash.rotation.y = 0.58;
  }
  const gridPoints = [];
  for (let x = -HALF_X; x <= HALF_X; x += 2) gridPoints.push(x, 0, -HALF_Z, x, 0, HALF_Z);
  for (let z = -HALF_Z; z <= HALF_Z; z += 2) gridPoints.push(-HALF_X, 0, z, HALF_X, 0, z);
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const grid = new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: '#c1d0b6' }));
  grid.position.y = 0.065;
  grid.material.transparent = true;
  grid.material.opacity = 0.4;
  grid.visible = false;
  scene.add(grid);

  // Seeded randomness keeps the landscape identical after every restart.
  let seed = 23;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function tree(x, z, size) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.scale.setScalar(size);
    cylinder(group, mat.trunk, 0, 0.6, 0, 0.13, 1.2, 5);
    mesh(new THREE.ConeGeometry(0.9, 2.1, 6), mat.leaf, group, 0, 1.8, 0);
    mesh(new THREE.ConeGeometry(0.66, 1.8, 6), mat.leafLight, group, 0, 2.65, 0);
    world.add(group);
  }
  for (let i = 0; i < 150; i++) {
    const x = (random() - 0.5) * (HALF_X * 2 + 1);
    const z = (random() - 0.5) * (HALF_Z * 2 + 1);
    if (Math.abs(z) > HALF_Z - 3 || Math.abs(x) > HALF_X - 2) tree(x, z, 0.7 + random() * 0.6);
  }
  for (let i = 0; i < 48; i++) {
    const x = (random() - 0.5) * (HALF_X * 2);
    const z = (i % 2 ? 1 : -1) * (HALF_Z - 2.3 + random() * 2.2);
    const rock = mesh(new THREE.DodecahedronGeometry(0.6 + random() * 0.75, 0), mat.rock, world, x, 0.3, z);
    rock.scale.y = 0.65;
    rock.rotation.set(random(), random(), random());
  }
  // Procedural textures stay offline and deterministic; they never consume gameplay RNG.
  function surfaceTexture(kind, size = 512) {
    const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
    let value = 1907; const noise = () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
    ctx.fillStyle = kind === 'water' ? '#476e77' : kind === 'road' ? '#726e59' : '#788959'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < (kind === 'water' ? 1300 : 17000); i++) {
      const x = noise() * size, y = noise() * size, shade = noise();
      if (kind === 'water') { ctx.fillStyle = `rgba(171,210,206,${.03 + shade * .13})`; ctx.fillRect(x, y, 4 + noise() * 25, 1); }
      else { ctx.fillStyle = kind === 'road' ? (shade > .5 ? '#b0a68b33' : '#242b2225') : (shade > .6 ? '#c3bb7940' : shade > .25 ? '#284c3422' : '#a3aa6330'); ctx.fillRect(x, y, 1 + noise() * 5, 1 + noise() * 3); }
    }
    if (kind === 'grass') for (let i = 0; i < 130; i++) {
      const x = noise() * size, y = noise() * size, radius = 8 + noise() * 45;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius); g.addColorStop(0, i % 2 ? '#b2a27438' : '#31573830'); g.addColorStop(1, '#0000'); ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }
  mat.ground.map = surfaceTexture('grass', 1024); mat.ground.color.set('#d2d9b0'); mat.ground.roughness = 1;
  mat.road.map = surfaceTexture('road'); mat.road.map.repeat.set(5, 1); mat.road.color.set('#c0b699');
  mat.teal.roughness = mat.red.roughness = .48; mat.teal.metalness = mat.red.metalness = .28;
  mat.metal.roughness = .36; mat.metal.metalness = .65;
  const shore = box(world, mat.sand, 0, -1.05, 0, HALF_X * 2 + 8, .7, HALF_Z * 2 + 8); shore.castShadow = false;
  const waterTexture = surfaceTexture('water'); waterTexture.repeat.set(24, 24);
  const waterMat = material('#8ec4c7', { map: waterTexture, roughness: .38, metalness: .15 });
  const water = box(world, waterMat, 0, -1.55, 0, 900, .1, 900); water.castShadow = false; water.receiveShadow = false;
  // Low vegetation and pebble clusters use instancing to keep draw calls small.
  const grassMat = material('#566e42'), pebbleMat = material('#8b8c73');
  const grassTufts = new THREE.InstancedMesh(new THREE.ConeGeometry(.22, .45, 3), grassMat, 700);
  const pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.42, 0), pebbleMat, 100);
  const decorationTransform = new THREE.Object3D(); let visualSeed = 39;
  const visualRandom = () => { visualSeed = (visualSeed * 1664525 + 1013904223) >>> 0; return visualSeed / 4294967296; };
  for (const [instanced, count] of [[grassTufts, 700], [pebbles, 100]]) for (let i = 0; i < count; i++) {
    let x, z;
    do { x = (visualRandom() - .5) * HALF_X * 2; z = (visualRandom() - .5) * HALF_Z * 2; }
    while (Math.abs(z + x * .61) < 5 || Math.hypot(x + 40, z - 18) < 16 || Math.hypot(x - 40, z + 18) < 16 || Math.abs(z) < 10);
    decorationTransform.position.set(x, instanced === grassTufts ? .17 : .1, z);
    decorationTransform.rotation.set(0, visualRandom() * 6.28, 0); decorationTransform.scale.setScalar(.4 + visualRandom()); decorationTransform.updateMatrix(); instanced.setMatrixAt(i, decorationTransform.matrix);
  }
  grassTufts.receiveShadow = true; pebbles.castShadow = pebbles.receiveShadow = true; world.add(grassTufts, pebbles);
  for (const [cx, cz] of [[-33, -29], [-4, -33], [23, 30], [44, 26]]) for (let i = 0; i < 7; i++) tree(cx + (visualRandom() - .5) * 7, cz + (visualRandom() - .5) * 6, .7 + visualRandom() * .6);

  // Impassable stepped ridges: geometry and navigation share the same footprints.
  const terrainBlocked=(x,z,r=0)=>MAP.obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+r+.2);
  const cliffMat=material('#6e7569'),cliffTop=material('#9a9b7d');
  let terrainArt=new THREE.Group();scene.add(terrainArt);
  function rebuildTerrain(){
    for(const obj of world.children)if(obj.isGroup)obj.visible=!FIELD_MAP.waterAt(MAP,obj.position.x,obj.position.z);
    for(const obj of [grassTufts,pebbles]){
      obj.userData.dryMatrices ||= obj.instanceMatrix.array.slice();
      obj.instanceMatrix.array.set(obj.userData.dryMatrices);
      for(let i=0;i<obj.count;i++){
        const a=obj.instanceMatrix.array,n=i*16;
        if(FIELD_MAP.waterAt(MAP,a[n+12],a[n+14]))for(const k of [0,1,2,4,5,6,8,9,10])a[n+k]=0;
      }
      obj.instanceMatrix.needsUpdate=true;
    }
    terrainArt.traverse(o=>{if(o.geometry&&o.geometry!==boxGeometry)o.geometry.dispose();});
    scene.remove(terrainArt);terrainArt=new THREE.Group();scene.add(terrainArt);
    for(const w of MAP.water){
      const surface=box(terrainArt,waterMat,w.x,.11,w.z,w.width,.1,w.depth);surface.castShadow=false;
      for(const side of [-1,1]){
        if(w.width>w.depth)box(terrainArt,mat.sand,w.x,.08,w.z+side*(w.depth/2+.25),w.width,.12,.5);
        else box(terrainArt,mat.sand,w.x+side*(w.width/2+.25),.08,w.z,.5,.12,w.depth);
      }
    }
    for(const b of MAP.bridges){
      // Open steel spans: ships pass under the road, ground units use its deck.
      box(terrainArt,mat.concrete,b.x,2.8,b.z,b.width,.22,b.depth);
      const alongZ=b.depth>b.width;
      for(const side of [-1,1])box(terrainArt,mat.dark,b.x+(alongZ?side*(b.width/2-.2):0),3.25,b.z+(alongZ?0:side*(b.depth/2-.2)),alongZ?.16:b.width,.65,alongZ?b.depth:.16);
      for(const side of [-1,1]){
        const ramp=box(terrainArt,mat.road,b.x+(alongZ?0:side*(b.width/2+3)),1.4,b.z+(alongZ?side*(b.depth/2+3):0),alongZ?b.width:6.6,.18,alongZ?6.6:b.depth);
        if(alongZ)ramp.rotation.x=side*.43;else ramp.rotation.z=-side*.43;
      }
    }
    for(const o of MAP.obstacles){
    const ridge=new THREE.Group();ridge.position.set(o.x,0,o.z);terrainArt.add(ridge);
    const base=mesh(new THREE.CylinderGeometry(o.radius*.78,o.radius,o.height*.6,10),cliffMat,ridge,0,o.height*.3,0);
    base.rotation.y=.2;
    mesh(new THREE.CylinderGeometry(o.radius*.58,o.radius*.78,o.height*.4,9),cliffTop,ridge,0,o.height*.8,0);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;const rock=mesh(new THREE.DodecahedronGeometry(o.radius*.16,0),mat.rock,ridge,Math.sin(a)*o.radius*.78,.6,Math.cos(a)*o.radius*.78);rock.scale.y=1.4;}
  }

  }
  rebuildTerrain();
  function chooseMap(id){
    const next=FIELD_MAP.get(id);if(next.id===MAP.id)return;
    MAP=next;rebuildTerrain();navVersion++;wallGrids.clear();
  }
  const waterAt=(x,z)=>FIELD_MAP.waterAt(MAP,x,z);
  const bridgeRails = new Map();
  function bridgeSideBounds() {
    if(!bridgeRails.has(MAP.id))bridgeRails.set(MAP.id,MAP.bridges.flatMap(b=>{
      const alongZ=b.depth>b.width;
      return [-1,1].map(side=>{
        const x=b.x+(alongZ?side*(b.width/2-.2):0),z=b.z+(alongZ?0:side*(b.depth/2-.2));
        const hx=alongZ?.08:b.width/2+6,hz=alongZ?b.depth/2+6:.08;
        return {minX:x-hx,maxX:x+hx,minZ:z-hz,maxZ:z+hz};
      });
    }));
    return bridgeRails.get(MAP.id);
  }
  function bridgeSidesClear(a,b,r) {
    // The raised deck and ramps can only be entered at their ends, not through their sides.
    for(const wall of bridgeSideBounds()){
      let near=0,far=1;
      for(const axis of ['x','z']){
        const lo=wall[axis==='x'?'minX':'minZ']-r-.08,hi=wall[axis==='x'?'maxX':'maxZ']+r+.08,d=b[axis]-a[axis];
        if(Math.abs(d)<1e-9){if(a[axis]<lo||a[axis]>hi){near=2;break;}}
        else {const t1=(lo-a[axis])/d,t2=(hi-a[axis])/d;near=Math.max(near,Math.min(t1,t2));far=Math.min(far,Math.max(t1,t2));}
      }
      if(near<=far)return false;
    }
    return true;
  }
  const terrainAllows=(x,z,r,naval=false)=>FIELD_MAP.navigable(MAP,x,z,r,naval)&&(naval||bridgeSidesClear({x,z},{x,z},r));
  function bridgeHeight(x,z){
    for(const b of MAP.bridges){
      const alongZ=b.depth>b.width,cross=alongZ?Math.abs(x-b.x):Math.abs(z-b.z),half=alongZ?b.width/2:b.depth/2;
      const along=alongZ?Math.abs(z-b.z):Math.abs(x-b.x),length=alongZ?b.depth/2:b.width/2;
      if(cross<=half&&along<length+6)return 2.91*Math.max(0,Math.min(1,(length+6-along)/6));
    }
    return 0;
  }

  // 3. ENTITY DATA AND MODELS. Definitions live in data.js; meshes are only visuals.
  const { units: UNIT, buildings: STRUCTURE } = FIELD_DATA;
  const BUILDABLE = Object.keys(STRUCTURE).filter(kind => STRUCTURE[kind].cost > 0);
  const actors = new THREE.Group(), effects = new THREE.Group(), deposits = new THREE.Group();
  scene.add(actors, effects, deposits);
  let units = [], buildings = [], fields = [], shells = [], bursts = [], markers = [];
  let selected = new Set(), nextId = 1, queue = [];
  let credits = 600, enemyCredits = 160, delivered = 0, enemyDelivered = 0, elapsed = 0;
  let computerAid = { passive:0, emergency:0, nextGrant:90 };
  let battleRewards = {player:0,enemy:0,team3:0,team4:0}, lastRewards = {}, rewardUntil = 0;
  let voiceEvents=[],nextVoiceId=1,lastVoiceId=0,attackAlertAt={};
  let powerAlertState={},powerAlertClock=0;
  let localTeam = 'player', net = null, applyingCommand = false, commandTeam = null, winner = null;
  let remoteQueue = [], nextShotId = 1;
  let extraEconomies = {}, eliminated = [], matchTeams = ['player','enemy'];
  const teamColors = {player:'#6ce6b1',enemy:'#f67962',team3:'#6fb7ff',team4:'#f3cf65'};
  const teamMaterials = { player:[mat.teal,mat.mint], enemy:[mat.red,mat.coral], team3:[material('#377bcc'),material('#a8d7ff')], team4:[material('#b99329'),material('#ffe19a')] };
  const fog = new FieldFog(MAP); let fogClock = 0;
  const hostile = (a,b) => Boolean(b && b !== 'neutral' && a !== b);
  const visibleTo = (e,team=localTeam) => e.team===team || fog.at(team,e.mesh.position.x,e.mesh.position.z);
  function refreshFog() {
    fog.update(living()); fog.display(localTeam);
    for(const e of living()) e.mesh.visible=visibleTo(e);
    for(const f of fields) f.mesh.visible=fog.at(localTeam,f.mesh.position.x,f.mesh.position.z,true);
  }
  const shadedRoots=new WeakSet();
  function shadeScene() {
    const shade=(root,conceal)=>{if(shadedRoots.has(root))return;root.traverse(o=>{if(o.material)for(const m of (Array.isArray(o.material)?o.material:[o.material]))fog.shade(m,conceal);});shadedRoots.add(root);};
    for(const root of scene.children) {
      if(root===actors||root===deposits||root===effects||root===weaponFX.root)for(const child of root.children)shade(child,root===effects||root===weaponFX.root);
      else shade(root,false);
    }
  }
  const deliveredFor = team => team==='player'?delivered:team==='enemy'?enemyDelivered:extraEconomies[team]?.delivered||0;
  const weaponFX = new FIELD_WEAPONS.WeaponFX(scene);
  let fxEvents = [], nextFXId = 1, lastVisualEvent = 0;
  function emitWeaponEvent(event) {
    const record = { ...event, id: nextFXId++, time: elapsed };
    fxEvents.push(record); if (fxEvents.length > 128) fxEvents.shift();
    playWeaponEvent(record);
  }
  function playWeaponEvent(event, restoring=false) {
    lastVisualEvent = Math.max(lastVisualEvent, event.id);
    const point=event.origin||event.point||event.position;
    if(point&&!fog.at(localTeam,point.x,point.z))return;
    weaponFX.emit(event);
    if (event.type === 'shot') {
      if(!restoring&&!paused&&!winner&&elapsed-event.time<1)window.IronFieldMusic?.combat(['artillery','rocket','tesla','bomb'].includes(event.visual)?2:1);
      const e = living().find(e => e.id === event.shooterId);
      if (e) {
        e.recoilLeft = .24; e.flashLeft = FIELD_WEAPONS.profiles[event.visual].flash;
        if (e.muzzle && event.muzzle) e.muzzle.position.set(...event.muzzle);
      }
    }
  }
  const money = team => team === 'player' ? credits : team === 'enemy' ? enemyCredits : extraEconomies[team]?.credits||0;
  const spend = (team, amount) => { if (team === 'player') credits -= amount; else if(team==='enemy') enemyCredits -= amount; else extraEconomies[team].credits -= amount; };
  const queueFor = team => team === 'player' ? queue : team === 'enemy' ? remoteQueue : extraEconomies[team].queue;
  const unitsFor = team => units.filter(u => u.team === team);
  function sendAction(action) { if (!net?.active || applyingCommand) return false; net.command(action); return true; }
  let paused = false, outcome = '', simSpeed = 1, alertUntil = 0, keys = new Set();
  let raids = true, nextRaid = 90, wave = 0;
  let opponentStyle = 'balanced';
  try {const saved=localStorage.getItem('iron-field-opponent');if(['ollama','openai'].includes(saved)||Object.hasOwn(FIELD_OPPONENT.styles,saved))opponentStyle=saved;}catch{}
  let commander = resetCommander();
  let modelRequest = null;
  let placement = null, placementPoint = null, navVersion = 0;
  const ghostMat = new THREE.MeshBasicMaterial({ color: '#9dffc6', transparent: true, opacity: .4, depthWrite: false });
  const ghost = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), ghostMat);
  ghost.visible = false; scene.add(ghost);
  const defenseRange = new THREE.Mesh(new THREE.RingGeometry(1, 1.009, 96), new THREE.MeshBasicMaterial({ color: '#ffd97e', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false }));
  defenseRange.rotation.x = -Math.PI / 2; defenseRange.position.y = .12; defenseRange.visible = false; scene.add(defenseRange);
  const serviceRange=defenseRange.clone();serviceRange.material=defenseRange.material.clone();serviceRange.material.color.set('#97ffb5');serviceRange.raycast=()=>{};scene.add(serviceRange);
  const rallyGuide = new THREE.Group();scene.add(rallyGuide);rallyGuide.visible=false;
  const rallyRing=ring(rallyGuide,targetRing,1.2);
  const rallyPole=box(rallyGuide,mat.metal,0,1,0,.08,2,.08);
  box(rallyGuide,mat.mint,.45,1.8,0,.9,.5,.06);
  const rallyLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineDashedMaterial({color:'#a6ead3',dashSize:1,gapSize:.7,transparent:true,opacity:.8}));
  rallyLine.visible=false;scene.add(rallyLine);
  const bulletMat = new THREE.MeshBasicMaterial({ color: '#fff8b5' });
  const repairLineMat = new THREE.LineBasicMaterial({ color: '#97ffb5', transparent: true, opacity: .8 });
  const boltMat = new THREE.MeshBasicMaterial({ color: '#99efff' });
  const rocketMat = new THREE.MeshBasicMaterial({ color: '#ffc975' });
  const artilleryMat = new THREE.MeshBasicMaterial({ color: '#ffb265' });
  const isBuilding = e => e?.type === 'building';
  const active = e => e.hp > 0 && !e.buildLeft;
  // Completed friendly structures extend the construction area. Lost structures
  // stop contributing; surviving outposts retain their own building radius.
  const constructionSources = team => buildings.filter(b => b.team === team && active(b));
  const constructionRadius = b => b.kind === 'base' ? MAP.buildRadius : MAP.expansionRadius;
  const inConstructionTerritory = (point, team) => Boolean(baseOf(team)) && constructionSources(team).some(b => Math.hypot(point.x-b.mesh.position.x,point.z-b.mesh.position.z) <= constructionRadius(b));
  const territoryCanvas = document.createElement('canvas');
  territoryCanvas.width = HALF_X * 4; territoryCanvas.height = HALF_Z * 4;
  const territoryContext = territoryCanvas.getContext('2d'), territoryTexture = new THREE.CanvasTexture(territoryCanvas);
  const territoryGuide = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X*2,HALF_Z*2),new THREE.MeshBasicMaterial({map:territoryTexture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  territoryGuide.rotation.x=-Math.PI/2; territoryGuide.position.y=.24; territoryGuide.renderOrder=1; territoryGuide.visible=false; territoryGuide.raycast=()=>{}; scene.add(territoryGuide);
  let territorySignature='';
  function updateTerritoryGuide() {
    territoryGuide.visible=Boolean(placement && baseOf(localTeam));
    if(!territoryGuide.visible)return;
    const sources=constructionSources(localTeam), signature=localTeam+sources.map(b=>`${b.id}:${b.kind}:${b.mesh.position.x}:${b.mesh.position.z}`).join('|');
    if(signature===territorySignature)return;
    territorySignature=signature;
    const ctx=territoryContext,w=territoryCanvas.width,h=territoryCanvas.height;
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#fff';
    for(const b of sources){ctx.beginPath();ctx.arc((b.mesh.position.x+HALF_X)*2,(b.mesh.position.z+HALF_Z)*2,constructionRadius(b)*2,0,Math.PI*2);ctx.fill();}
    const img=ctx.getImageData(0,0,w,h), mask=new Uint8Array(w*h);
    for(let i=0;i<mask.length;i++)mask[i]=img.data[i*4+3]>127?1:0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x,on=mask[i],edge=on&&(!x||!y||x===w-1||y===h-1||!mask[i-1]||!mask[i+1]||!mask[i-w]||!mask[i+w]);
      img.data.set([100,245,190,on?(edge?210:28):0],i*4);
    }
    ctx.putImageData(img,0,0);territoryTexture.needsUpdate=true;
  }
  const stats = e => isBuilding(e) ? STRUCTURE[e.kind] : UNIT[e.kind];
  const living = () => [...units, ...buildings].filter(e => e.hp > 0);
  const friendlyUnits = () => unitsFor(localTeam);
  const combatUnits = team => units.filter(u => u.team === team && u.kind !== 'miner');
  const baseOf = team => buildings.find(b => b.team === team && b.kind === 'base' && active(b));
  function powerFor(team) {
    let supply = 0, used = 0;
    buildings.filter(b => b.team === team && active(b)).forEach(b => {
      supply += STRUCTURE[b.kind].supply || 0; used += STRUCTURE[b.kind].load || 0;
    });
    return { supply, used, low: used > supply };
  }
  function announce(text) {
    if (net?.isHost && commandTeam && commandTeam !== localTeam) { net.feedback(commandTeam, text); return; }
    $('announcement').textContent = text; alertUntil = performance.now() + 5500;
  }
  function showReward(amount, receipt) {
    $('reward-notice').textContent = `+${amount} credits · ${receipt?.amount===amount?receipt.target+' destroyed':'Battle rewards'}`;
    $('reward-notice').hidden = false; rewardUntil = performance.now() + 5000;
  }
  function emitVoiceAlert(team,type,kind=null) {
    if((net?.active&&!net.isHost)||!matchTeams.includes(team)||eliminated.includes(team))return;
    if(type.endsWith('Attack')){
      const key=team+':'+type;if(elapsed-(attackAlertAt[key]??-Infinity)<10)return;
      attackAlertAt[key]=elapsed;
    }
    const event={id:nextVoiceId++,time:elapsed,team,type,kind};
    voiceEvents.push(event);voiceEvents=voiceEvents.filter(e=>elapsed-e.time<12).slice(-64);
    lastVoiceId=event.id;if(team===localTeam){syncVoiceState();window.FieldVoice?.notify(event);}
  }
  function awardBattleReward(target, team) {
    // The killing projectile owns the bounty, even if its shooter has since died.
    // Eliminated armies, friendly fire and non-combat removals cannot earn credits.
    if ((net?.active && !net.isHost) || !matchTeams.includes(team) || !hostile(team,target.team) || !baseOf(team)) return;
    const amount = target.kind==='base' ? 300 : Math.floor((stats(target).cost || 0) * .5);
    if (!amount) return;
    spend(team,-amount); battleRewards[team]=(battleRewards[team]||0)+amount;
    lastRewards[team]={amount,target:stats(target).name};
    if(team===localTeam)showReward(amount,lastRewards[team]);
  }
  function label(e, name) {
    const node = document.createElement('div');
    node.className = `world-label ${hostile(localTeam,e.team) ? 'enemy' : ''} ${e.type === 'unit' ? 'tank-label' : ''} ${e.type === 'ore' ? 'ore-label' : ''}`;
    const title = document.createElement('span'); title.textContent = name;
    const bar = document.createElement('div'); bar.className = 'health';
    const fill = document.createElement('div'); bar.append(fill);
    node.append(title, bar); $('labels').append(node);
    let selectionFrame = null;
    if (e.type !== 'ore') {
      selectionFrame = document.createElement('div'); selectionFrame.className = 'selection-frame'; selectionFrame.hidden = true;
      selectionFrame.innerHTML = '<i></i><i></i><i></i><i></i><b>✓</b>';
      $('labels').append(selectionFrame);
    }
    Object.assign(e, { label: node, labelTitle: title, healthFill: fill, selectionFrame });
  }
  function createField(x, z, amount, name) {
    if(waterAt(x,z)){
      let best=null;
      for(let r=4;r<40&&!best;r+=2)for(let i=0;i<32;i++){
        const a=i*Math.PI/16,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;
        if(Math.abs(px)<HALF_X-5&&Math.abs(pz)<HALF_Z-5&&terrainAllows(px,pz,4)&&!waterAt(px,pz)&&!terrainBlocked(px,pz,4)&&!MAP.bridges.some(b=>FIELD_MAP.inside(b,px,pz,-6))&&fields.every(f=>Math.hypot(px-f.mesh.position.x,pz-f.mesh.position.z)>9)){best={x:px,z:pz};break;}
      }
      if(best){x=best.x;z=best.z;}
    }
    const group = new THREE.Group(); group.position.set(x, 0, z); deposits.add(group);
    const patch = mesh(new THREE.CylinderGeometry(2.4, 2.4, .03, 12), mat.sand, group, 0, .02, 0);
    patch.castShadow = false;
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4, r = .5 + random() * 1.4;
      const ore = mesh(new THREE.OctahedronGeometry(.38 + random() * .35), mat.ore, group, Math.cos(a) * r, .45, Math.sin(a) * r);
      ore.scale.y = 1.7; ore.rotation.y = a;
    }
    const field = { id: nextId++, type: 'ore', kind: 'ore', team: 'neutral', mesh: group, amount, initialAmount: amount, name };
    group.userData.entity = field; fields.push(field); label(field, name);
    return field;
  }
  const isAir = e => e?.type==='unit' && Boolean(UNIT[e.kind].aircraft);
  const canAttack = (attacker,target) => stats(attacker).damage>0 && (isAir(target) ? ['air','all'].includes(stats(attacker).targets) : stats(attacker).targets!=='air');
  const isNaval = e => e?.type==='unit' && Boolean(UNIT[e.kind].naval);
  const isProducer = b => ['warFactory','garrison','airfield','shipyard'].includes(b?.kind);
  const producerFor = (kind, team) => buildings.find(b => b.team === team && b.kind === UNIT[kind].producer && active(b));
  const missingStructures = (kind,team) => (STRUCTURE[kind].requires||[]).filter(required=>!buildings.some(b=>b.team===team&&b.kind===required&&active(b)));
  const prerequisiteMessage = (kind,team) => {const missing=missingStructures(kind,team);return missing.length?`Requires completed ${missing.map(k=>STRUCTURE[k].name).join(' + ')}.`:'';};
  const currentProduction = (production, kind) => production.find(q => UNIT[q.kind].producer === UNIT[kind].producer);
  function navalExit(point){
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const p=point.clone().add(new THREE.Vector3(dx*5.3,0,dz*5.3));
      if(terrainAllows(p.x,p.z,2,true)&&!terrainBlocked(p.x,p.z,2)&&Math.abs(p.x)<HALF_X-2&&Math.abs(p.z)<HALF_Z-2)return p;
    }
    return null;
  }
  const buildingMat={wall:material('#a4aa9e'),roof:material('#53646a'),glass:material('#315466',{metalness:.4,roughness:.26}),pipe:material('#8c999b',{metalness:.55,roughness:.5}),hazard:material('#d4b25b'),brick:material('#747c72')};
  function buildingLink(parent,m,a,b,width=.09){
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.sub(from),mid=from.addScaledVector(delta,.5);
    const beam=box(parent,m,mid.x,mid.y,mid.z,width,delta.length(),width);beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return beam;
  }
  function buildingLadder(parent,x,z,height){
    for(const side of [-1,1])box(parent,buildingMat.pipe,x+side*.16,height/2,z,.045,height,.045);
    for(let y=.3;y<height;y+=.3)box(parent,buildingMat.pipe,x,y,z,.35,.045,.045);
  }
  function detailBuilding(group,kind,color,trim,turret,rotor){
    const radius=STRUCTURE[kind].radius;
    // Foundation edging, entry lights and panel seams retain readable team colors.
    if(kind!=='shipyard')for(const side of [-1,1]){
      box(group,buildingMat.brick,side*(radius-.15),.19,0,.14,.15,radius*1.7);
      box(group,lampMat,side*Math.min(radius*.7,1.7),.32,radius*.85,.16,.08,.16);
    }
    if(kind==='base'){
      // Raised command room, glazed observation band and communications array.
      armoredBox(group,buildingMat.wall,.75,2.65,-.35,2.4,1.05,2.2);
      box(group,buildingMat.glass,.75,2.83,.79,2.12,.36,.06);
      for(const side of [-1,1])box(group,buildingMat.glass,.75+side*1.23,2.83,-.35,.05,.36,1.8);
      box(group,color,.75,3.25,-.35,2.64,.18,2.4);
      for(const x of [-1.9,-.5,.95,2])box(group,buildingMat.wall,x,.95,1.91,.16,1.65,.16);
      for(let z=-1.5;z<=1.5;z+=.5)box(group,buildingMat.pipe,-2.43,1.04,z,.05,.08,.3);
      box(group,buildingMat.hazard,-1.2,.2,2.1,1.45,.05,.35);
      buildingLadder(group,2,1.98,2.1);
      cylinder(group,buildingMat.pipe,1.3,3.8,-.5,.035,1.2,6);box(group,trim,1.3,4.25,-.5,.85,.045,.045);
      box(group,buildingMat.roof,2.5,1.5,-1.5,.72,.12,.72);
    }else if(kind==='refinery'){
      // Distillation column, pressure bands, ladders and an ore intake conveyor.
      for(const y of [.55,1.15,1.85,2.45])cylinder(group,buildingMat.pipe,.85,y,-.55,.79,.09,12);
      const cap=mesh(new THREE.ConeGeometry(.76,.48,12),buildingMat.roof,group,.85,2.92,-.55);
      cylinder(group,buildingMat.roof,-.9,3.65,-.7,.26,.18,8);
      for(const z of [-.9,.55]){
        buildingLink(group,buildingMat.pipe,[-1.55,.65,z],[-1.55,2.2,z],.13);
        buildingLink(group,buildingMat.pipe,[-1.55,2.2,z],[.85,2.2,z],.13);
      }
      box(group,buildingMat.roof,-.4,.23,1.65,1.3,.13,1.15);
      for(let z=1.2;z<2.25;z+=.17)box(group,buildingMat.pipe,-.4,.32,z,1.1,.055,.055);
      for(const x of [-1.1,.3])box(group,buildingMat.hazard,x,.48,1.65,.09,.35,1.1);
      box(group,buildingMat.wall,-.5,2.03,0,2.15,.12,2.6);
      for(let x=-1.4;x<.5;x+=.45)box(group,buildingMat.pipe,x,2.27,1.25,.04,.5,.04);
      box(group,buildingMat.pipe,-.5,2.52,1.25,2,.04,.04);buildingLadder(group,-1.45,1.34,2.55);
      box(group,buildingMat.glass,-.65,1.33,1.31,.75,.3,.05);
    }else if(kind==='power'){
      // Two tapered cooling stacks with dark open rims, a turbine and switchgear.
      for(const x of [-.72,.72]){
        const profile=[new THREE.Vector2(.66,0),new THREE.Vector2(.54,.4),new THREE.Vector2(.38,1.25),new THREE.Vector2(.44,1.95),new THREE.Vector2(.54,2.35)];
        mesh(new THREE.LatheGeometry(profile,12),buildingMat.wall,group,x,.75,-.3);
        cylinder(group,mat.black,x,3.0,-.3,.48,.035,12);
        const rim=mesh(new THREE.TorusGeometry(.53,.065,5,12),trim,group,x,3.12,-.3);rim.rotation.x=Math.PI/2;
        for(const side of [-1,1])box(group,color,x+side*.52,1.07,-.3,.09,.65,.65);
      }
      box(group,buildingMat.roof,0,1.12,1.05,2.45,.32,.65);
      for(const x of [-.8,-.4,0,.4,.8])box(group,buildingMat.pipe,x,1.3,1.06,.15,.045,.5);
      for(const side of [-1,1]){cylinder(group,buildingMat.pipe,side*1.45,1.05,-1,.13,1.5,8);for(let y=.9;y<1.65;y+=.2)cylinder(group,trim,side*1.45,y,-1,.21,.08,8);}
      box(group,buildingMat.hazard,0,.63,1.38,.65,.52,.05);
      buildingLink(group,buildingMat.roof,[-.12,.81,1.42],[.14,.6,1.42],.08);buildingLink(group,buildingMat.roof,[.14,.6,1.42],[-.1,.4,1.42],.08);
    }else if(kind==='warFactory'){
      // Sawtooth clerestory roof, garage shutters, exhausts and a side workshop.
      for(const z of [-1.25,0,1.25]){
        const roof=box(group,buildingMat.roof,0,2.94,z,4.9,.12,1.2);roof.rotation.x=.35;
        box(group,buildingMat.glass,0,2.97,z+.57,4.5,.44,.055);
      }
      for(const x of [-2,-1,0,1,2])box(group,buildingMat.pipe,x,3.02,0,.055,.06,4);
      for(const y of [1.52,1.77,2.02])box(group,buildingMat.pipe,0,y,2.11,2.9,.09,.08);
      for(const side of [-1,1]){
        box(group,buildingMat.wall,side*2.38,1.18,0,.14,2.2,3.85);
        for(let z=-1.5;z<=1.5;z+=.6)box(group,color,side*2.48,1.15,z,.1,2,.15);
        box(group,lampMat,side*1.63,2.35,2.25,.24,.15,.12);
        for(let z=2.4;z<3.7;z+=.3){const stripe=box(group,buildingMat.hazard,side*1.23,.24,z,.22,.03,.14);stripe.rotation.y=side*.5;}
      }
      cylinder(group,buildingMat.roof,-1.7,3.67,-1.2,.33,.12,10);buildingLadder(group,-2.6,.8,3.2);
      box(group,buildingMat.roof,1.7,2.66,-1.3,.7,.28,.9);
    }else if(kind==='garrison'){
      // Low barracks with a pitched roof, protected windows, crates and sandbags.
      for(const side of [-1,1]){const roof=box(group,buildingMat.roof,side*.93,2.28,0,2.15,.14,3.45);roof.rotation.z=-side*.27;
        for(const z of [-1.05,0,1.05]){box(group,buildingMat.glass,side*1.83,1.15,z,.045,.4,.53);box(group,trim,side*1.86,1.15,z,.05,.44,.06);}
        for(let z=-1.1;z<1.8;z+=.47)armoredBox(group,buildingMat.wall,side*1.93,.39,z,.4,.3,.42);
      }
      box(group,color,0,2.59,0,.25,.12,3.5);box(group,buildingMat.hazard,0,1.67,1.7,.75,.24,.08);
      for(const x of [-.5,.5])box(group,lampMat,x,1.75,1.72,.12,.12,.12);
      box(group,buildingMat.roof,-1.35,.73,2,.55,.08,.5);box(group,trim,-1.35,.42,2.28,.05,.45,.03);
    }else if(kind==='shipyard'){
      // Open slipway, dock fenders, gantry bracing, crane trolley and service cabin.
      for(const side of [-1,1]){
        box(group,buildingMat.wall,side*1.9,.61,0,.8,.14,4.7);
        box(group,buildingMat.hazard,side*1.52,.7,0,.09,.03,4.45);
        for(const z of [-1.6,-.6,.6,1.6]){cylinder(group,buildingMat.roof,side*2.18,.48,z,.13,.45,8);cylinder(group,buildingMat.pipe,side*1.95,.85,z,.07,.32,8);}
        for(const z of [-.42,.42])buildingLink(group,buildingMat.hazard,[side*1.7,.6,z],[side*1.7,4.15,-z],.07);
        buildingLink(group,buildingMat.hazard,[side*1.7,3.4,0],[side*.95,4.3,0],.13);
      }
      box(group,buildingMat.roof,.7,4.47,0,.65,.25,.7);box(group,buildingMat.hazard,.7,2.2,0,.45,.25,.3);
      buildingLink(group,buildingMat.pipe,[.7,2.12,0],[.7,1.82,0],.075);buildingLink(group,buildingMat.pipe,[.7,1.82,0],[.92,1.82,0],.075);
      box(group,buildingMat.roof,0,1.83,-1.5,3.9,.12,1.3);buildingLadder(group,-1.7,-.5,4.25);
      for(const x of [-.8,0,.8])box(group,trim,x,1.35,-.79,.06,.42,.05);
      const life=mesh(new THREE.TorusGeometry(.22,.06,5,12),buildingMat.hazard,group,1.1,1.15,-.78);
    }else if(kind==='airfield'){
      // Rear hangar, glazed tower and pad lights leave the VTOL center clear.
      box(group,buildingMat.wall,1.75,.96,-2.65,3.2,1.5,1.75);
      const roof=mesh(new THREE.CylinderGeometry(1.65,1.65,1.85,12,1,false,-Math.PI/2,Math.PI),buildingMat.roof,group,1.75,1.52,-2.65);roof.rotation.x=-Math.PI/2;
      box(group,buildingMat.roof,1.75,.91,-1.73,2.66,1.38,.05);
      for(let y=.36;y<1.6;y+=.23)box(group,buildingMat.pipe,1.75,y,-1.68,2.56,.05,.035);
      box(group,buildingMat.wall,-2.4,2.1,-2.2,1.15,2,1.25);box(group,buildingMat.glass,-2.4,3.08,-2.2,1.7,.66,1.6);box(group,color,-2.4,3.48,-2.2,1.95,.15,1.85);
      if(rotor)rotor.position.y=4.1;
      for(const x of [-3.45,3.45])for(const z of [-3,-1.5,0,1.5,3])box(group,lampMat,x,.34,z,.12,.07,.12);
      for(const x of [-2.5,-1.9]){const tank=cylinder(group,buildingMat.pipe,x,.66,2.7,.23,1.3,10);tank.rotation.x=Math.PI/2;}
      buildingLadder(group,-3.05,-1.25,3.5);
    }else if(kind==='turret'){
      for(const side of [-1,1]){const brace=box(group,buildingMat.wall,side*.74,.64,0,.36,1.2,1.1);brace.rotation.z=-side*.22;box(turret,color,side*.65,.15,-.1,.2,.55,.8);}
      box(turret,buildingMat.glass,0,.4,.42,.35,.18,.08);box(group,buildingMat.roof,0,.3,-.84,.65,.4,.45);buildingLadder(group,0,-.69,1.8);
      for(const x of [-.27,.27]){const collar=cylinder(turret,buildingMat.pipe,x,.15,1.5,.12,.14,8);collar.rotation.x=Math.PI/2;}
    }else if(kind==='missileBattery'){
      for(const side of [-1,1]){
        buildingLink(group,buildingMat.pipe,[side*.3,1.4,0],[side*1.15,.3,.72],.14);
        box(group,buildingMat.wall,side*1.12,.25,.72,.6,.22,.65);
        box(turret,buildingMat.hazard,side*.64,.88,-.15,.7,.06,.65);
        for(let z=-.6;z<.6;z+=.35)box(turret,buildingMat.pipe,side*1.08,.43,z,.08,.7,.08);
      }
      box(group,buildingMat.glass,0,.85,.96,.44,.24,.05);
    }else if(kind==='teslaCoil'){
      for(let i=0;i<4;i++){const a=i*Math.PI/2,x=Math.sin(a)*1.04,z=Math.cos(a)*1.04;cylinder(group,buildingMat.pipe,x,.95,z,.18,1.1,8);for(const y of [.8,1.05,1.3])cylinder(group,energyMat,x,y,z,.23,.08,8);buildingLink(group,buildingMat.roof,[x,.4,z],[0,.6,0],.15);}
      for(const side of [-1,1])box(group,buildingMat.hazard,side*1.35,.23,0,.12,.08,2.4);
    }else if(kind==='flameBunker'){
      for(const side of [-1,1]){const wall=box(group,buildingMat.wall,side*1.25,.75,0,.4,1.08,2.3);wall.rotation.z=-side*.18;
        for(const z of [-.7,0,.7])box(group,buildingMat.roof,side*1.44,.75,z,.04,.17,.35);
        buildingLink(group,buildingMat.pipe,[side*.85,.9,-.75],[side*.55,1.32,.18],.1);
      }
      for(const x of [-.75,-.25,.25,.75])box(group,buildingMat.hazard,x,.28,1.18,.27,.08,.19);
      box(turret,buildingMat.glass,0,.2,.5,.23,.12,.07);
    }
    batchStaticBoxes(group);if(turret)batchStaticBoxes(turret);if(rotor)batchStaticBoxes(rotor);
    return {base:5.3,refinery:4.2,power:4.1,warFactory:4.2,garrison:4.1,shipyard:5.2,airfield:5.1,teslaCoil:5.1}[kind]||3.9;
  }

  function createBuilding(kind, team, x, z, underConstruction = false) {
    const def = STRUCTURE[kind], group = new THREE.Group();
    group.position.set(x, 0, z); actors.add(group);
    const color = teamMaterials[team][0];
    const trim = teamMaterials[team][1];
    if(kind!=='shipyard')box(group, mat.concrete, 0, .08, 0, def.radius * 2, .16, def.radius * 1.85);
    let turret = null, rotor = null;
    if (kind === 'base') {
      box(group, mat.dark, 0, 1, 0, 4.8, 1.8, 3.6);
      box(group, color, 0, 2.03, 0, 5.05, .4, 3.85);
      box(group, mat.metal, -1.15, 2.6, -.45, 1.5, .85, 1.5);
      box(group, mat.window, 1.05, 1.25, 1.82, 1.5, .65, .05);
      box(group, mat.black, -1.2, .7, 1.84, 1.2, 1.15, .07);
      for (let i = 0; i < 3; i++) box(group, mat.metal, .7 + i * .55, 2.3, -.5, .25, .18, 1.3);
      cylinder(group, mat.dark, -1.1, 3.5, -.45, .08, 1.8, 6);
      rotor = new THREE.Group(); rotor.position.set(-1.1, 4.2, -.45);
      const dish = mesh(new THREE.CylinderGeometry(.75, .45, .2, 12), color, rotor); dish.rotation.x = 1.05;
      group.add(rotor);
      cylinder(group, color, 2.5, .7, -1.5, .6, 1.4);
    } else if (kind === 'refinery') {
      box(group, color, -.5, .9, 0, 2, 1.7, 2.5);
      cylinder(group, mat.metal, .85, 1.3, -.55, .75, 2.5);
      cylinder(group, trim, .85, 2.6, -.55, .78, .22);
      box(group, mat.black, -.4, .55, 1.3, 1.4, .8, .12);
      box(group, mat.ore, .8, .3, 1.2, 1.4, .35, .85);
      cylinder(group, mat.dark, -.9, 2.65, -.7, .22, 2.3, 8);
      box(group, trim, -.5, 1.85, 0, 2.15, .18, 2.6);
    } else if (kind === 'power') {
      box(group,color,0,.55,0,2.9,.95,2.7);
      rotor=new THREE.Group();rotor.position.set(0,1.31,1.05);
      cylinder(group,mat.dark,0,1.27,1.05,.25,.08,10);
      box(rotor,trim,0,0,0,.62,.035,.1);box(rotor,trim,0,0,0,.1,.035,.62);group.add(rotor);
    } else if (kind === 'shipyard') {
      for(const side of [-1,1])box(group,mat.dark,side*1.9,.3,0,.7,.5,4.5);
      box(group,color,0,1,-1.5,3.8,1.5,1.2);
      box(group,mat.window,0,1.35,-.85,2.4,.4,.08);
      for(const side of [-1,1])box(group,trim,side*1.7,2.4,0,.25,4, .25);
      box(group,mat.ore,0,4.3,0,4.2,.3,.35);
      cylinder(group,mat.dark,.7,3.3,0,.06,2,6);
      box(group,mat.metal,.7,2.3,0,.4,.3,.4);
    } else if (kind === 'airfield') {
      box(group,mat.dark,0,.16,0,7.6,.2,7.6);
      for(const x of [-3.3,3.3])for(const z of [-3,0,3])box(group,trim,x,.3,z,.25,.08,.5);
      const pad=ring(group,trim,2.15);pad.position.y=.3;
      box(group,trim,-.65,.29,0,.15,.04,2);box(group,trim,.65,.29,0,.15,.04,2);box(group,trim,0,.29,0,1.3,.04,.15);
      box(group,color,-2.4,1.1,-2.2,2.1,1.8,2);
      box(group,mat.window,-2.4,1.75,-1.15,1.7,.4,.08);
      cylinder(group,mat.dark,-2.4,2.6,-2.2,.08,1.5,6);
      rotor=new THREE.Group();rotor.position.set(-2.4,3.3,-2.2);box(rotor,trim,0,0,0,1.5,.15,.5);group.add(rotor);
    } else if (kind === 'warFactory') {
      box(group, mat.dark, 0, 1.2, 0, 4.8, 2.3, 4);
      box(group, color, 0, 2.45, 0, 5.1, .35, 4.3);
      box(group, mat.black, 0, 1.05, 2.04, 3, 1.8, .08);
      for (const x of [-1.7, 1.7]) box(group, trim, x, 1.25, 2.1, .3, 2.5, .25);
      box(group, mat.concrete, 0, .2, 2.4, 3, .2, 1);
      box(group, trim, 0, 2.72, 0, .45, .1, 3);
      cylinder(group, mat.metal, -1.7, 2.8, -1.2, .27, 1.7);
      box(group, mat.window, 1.5, 1.7, 2.08, .55, .35, .1);
    } else if (kind === 'garrison') {
      box(group, color, 0, .95, 0, 3.6, 1.8, 3.1);
      const roof=box(group, trim, 0, 2, 0, 4, .5, 3.5); roof.rotation.z=.06;
      box(group, mat.dark, 0, .8, 1.6, .8, 1.5, .12);
      for(const x of [-1.2,1.2]) box(group, mat.window, x, 1.2, 1.6, .6, .45, .1);
      cylinder(group, mat.metal, 1.7, 2.5, -1.2, .045, 2.7, 6);
      box(group, color, 2.05, 3.5, -1.2, .75, .5, .06);
      for(const x of [-1.4,1.4]) box(group, mat.ore, x, .35, 2, .65, .6, .5);
    } else if (kind === 'teslaCoil') {
      cylinder(group, color, 0, .5, 0, 1.2, .9, 8);
      for (const side of [-1, 1]) box(group, mat.metal, side * .88, .8, 0, .3, .9, 1.45);
      cylinder(group, mat.dark, 0, 1.65, 0, .43, 2.5, 10);
      turret = new THREE.Group(); turret.position.y = 1.25;
      for (let i = 0; i < 6; i++) cylinder(turret, i % 2 ? energyMat : trim, 0, .4 + i * .36, 0, .76 - i * .065, .13, 12);
      mesh(new THREE.SphereGeometry(.4, 12, 8), energyMat, turret, 0, 2.9, 0);
      group.add(turret);
    } else if (kind === 'missileBattery') {
      armoredBox(group, color, 0, .65, 0, 2.25, 1.05, 1.85);
      cylinder(group, mat.dark, 0, 1.3, 0, .62, .5, 10);
      turret = new THREE.Group(); turret.position.y = 1.65;
      for (const side of [-1, 1]) {
        const pod = armoredBox(turret, color, side * .64, .45, 0, .82, .83, 1.65); pod.rotation.x = -.24;
        for (const x of [-.18, .18]) for (const y of [.28, .6]) {
          const opening = cylinder(turret, mat.black, side * .64 + x, y, .88, .105, .1, 8); opening.rotation.x = Math.PI / 2;
          const tip = cylinder(turret, mat.ore, side * .64 + x, y, .94, .05, .04, 8); tip.rotation.x = Math.PI / 2;
        }
      }
      group.add(turret);
    } else if (kind === 'flameBunker') {
      armoredBox(group, mat.metal, 0, .7, 0, 2.6, 1.15, 2.25);
      box(group, color, 0, 1.32, 0, 2.7, .25, 2.35);
      for (const side of [-1, 1]) cylinder(group, mat.ore, side * .85, .92, -.75, .24, .95, 10);
      turret = new THREE.Group(); turret.position.y = 1.45;
      armoredBox(turret, color, 0, .05, 0, 1, .38, .9);
      for (const x of [-.27, .27]) { box(turret, mat.black, x, .05, .95, .21, .19, 1.3); box(turret, lampMat, x, .05, 1.55, .12, .11, .08); }
      group.add(turret);
    } else if (kind === 'turret') {
      cylinder(group, mat.dark, 0, 1, 0, .65, 1.9, 8);
      cylinder(group, color, 0, 1.8, 0, .85, .4, 8);
      turret = new THREE.Group(); turret.position.y = 2;
      box(turret, color, 0, .1, 0, 1.15, .5, 1.1);
      for (const x of [-.27, .27]) box(turret, mat.black, x, .15, .85, .15, .15, 1.4);
      box(turret, trim, 0, .39, -.2, .5, .08, .5); group.add(turret);
    }
    const hasExit=['warFactory','garrison','airfield','shipyard'].includes(kind);
    const seaExit=kind==='shipyard'?navalExit(group.position):null;
    if(hasExit){
      group.rotation.y=seaExit?Math.atan2(seaExit.x-x,seaExit.z-z):(z>0?Math.PI:0);
      const apron=box(group,mat.concrete,0,.11,def.radius+1.1,kind==='garrison'?1.6:2.8,.12,2.2);apron.castShadow=false;
      for(const side of [-1,1])box(group,trim,side*(kind==='garrison'?.65:1.2),.19,def.radius+1.1,.1,.04,2);
      for(const side of [-1,1]){const chevron=box(group,trim,side*.3,.2,def.radius+1.4,.12,.04,.8);chevron.rotation.y=side*.7;}
    }
    const muzzle = def.damage ? mesh(burstGeometry, lampMat, turret) : null; if (muzzle) { muzzle.visible = false; muzzle.scale.setScalar(.25); }
    const selectionRing = ring(group, friendlyRing, def.radius / 1.1); selectionRing.visible = false;
    if(kind==='shipyard')selectionRing.position.y=.24;
    const e = { id: nextId++, type: 'building', kind, team, mesh: group, rotor, turret, muzzle, flashLeft: 0, ring: selectionRing,
      hp: def.hp, maxHp: def.hp, radius: def.radius, buildLeft: underConstruction ? def.time : 0, cooldown: 0 };
    e.exitPoint=seaExit || (hasExit?new THREE.Vector3(x,0,z+(z>0?-1:1)*(def.radius+2.2)):null);
    e.rallyPoint=null;
    if(def.serviceRange){
      e.repairTarget=null;e.repairBeam=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),repairLineMat);
      e.repairBeam.visible=false;e.repairBeam.raycast=()=>{};group.add(e.repairBeam);
      box(group,repairMat,0,2.8,0,.9,.05,.2);box(group,repairMat,0,2.81,0,.2,.05,.9);
    }
    e.visualHeight=detailBuilding(group,kind,color,trim,turret,rotor);
    if (underConstruction) group.scale.y = .15;
    group.userData.entity = e; buildings.push(e); label(e, team !== localTeam && kind === 'base' ? 'ENEMY HQ' : def.name.toUpperCase());
    navVersion++; return e;
  }
  // Beveled armor and instanced tread plates keep silhouettes readable up close.
  function armoredBox(parent, m, x, y, z, width, height, length) {
    const shape = new THREE.Shape(); shape.moveTo(-width / 2, -height / 2); shape.lineTo(width / 2, -height / 2); shape.lineTo(width / 2, height / 2); shape.lineTo(-width / 2, height / 2); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .08, bevelThickness: .06 }); geometry.translate(0, 0, -length / 2);
    return mesh(geometry, m, parent, x, y, z);
  }
  const lampMat = material('#fff0b1', { emissive: '#ffd988', emissiveIntensity: 1.4, roughness: .2 });
  const energyMat = material('#83ecff', { emissive: '#3acbff', emissiveIntensity: 1.7, metalness: .3, roughness: .25 });
  const repairMat = material('#b2ffad', { emissive: '#63d775', emissiveIntensity: .9 });
  // Role-specific silhouettes; team paint stays visible on every chassis.
  const groundMat={steel:material('#718087',{metalness:.5,roughness:.55}),sand:material('#b8b69a'),industrial:material('#cfa348'),fuel:material('#a95837'),rubber:material('#20272b'),glass:material('#244a59',{metalness:.4,roughness:.22})};
  function groundWheels(body,width,zs,radius){
    for(const side of [-1,1])for(const z of zs){
      const tire=mesh(wheelGeometry,groundMat.rubber,body,side*width,radius,z);tire.rotation.z=Math.PI/2;tire.scale.set(radius/.24,2.1,radius/.24);
      const hub=cylinder(body,groundMat.steel,side*(width+.18),radius,z,radius*.48,.06,8);hub.rotation.z=Math.PI/2;
    }
  }
  function groundTracks(body,width,length,split=false){
    for(const side of [-1,1]){
      if(split)for(const z of [-length*.27,length*.27])armoredBox(body,groundMat.rubber,side*width,.36,z,.48,.5,length*.45);
      else armoredBox(body,groundMat.rubber,side*width,.36,0,.43,.5,length);
      for(let i=0;i<5;i++){const wheel=mesh(wheelGeometry,groundMat.steel,body,side*(width+.2),.35,(i-2)*length*.19);wheel.rotation.z=Math.PI/2;}
      for(let i=0;i<10;i++)box(body,groundMat.steel,side*width,.64,(i-4.5)*length/10,.49,.055,length/16);
    }
  }
  function groundBarrel(parent,from,to,radius=.07,m=groundMat.steel){
    const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),d=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(.5);
    const barrel=cylinder(parent,m,mid.x,mid.y,mid.z,radius,d.length(),8);barrel.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());
    const muzzle=cylinder(parent,groundMat.rubber,b.x,b.y,b.z,radius*1.4,.11,8);muzzle.quaternion.copy(barrel.quaternion);
  }
  function buildGroundModel(body,turret,kind,color,trim){
    const rig={mountY:.85,muzzle:[0,.3,1.7],spread:0,cargoMesh:null,drill:null};
    const heavy=kind==='heavy',truck=kind==='rocket',miner=kind==='miner',scout=kind==='scout';
    const length=heavy?2.85:truck?3.3:miner?2.9:scout?1.95:kind==='artillery'?2.75:2.35;
    const width=heavy?1.05:miner?.91:scout?.73:truck?.84:.83;
    if(scout||truck||miner)groundWheels(body,width,scout?[-.66,.66]:truck?[-1.2,-.45,.45,1.2]:[-.95,0,.95],miner?.42:scout?.36:.32);
    else groundTracks(body,width,length,heavy);
    armoredBox(body,color,0,scout?.49:.65,0,width*1.65,scout?.26:.38,length*.88);
    for(const side of [-1,1]){
      box(body,lampMat,side*width*.65,.76,length*.45,.18,.12,.06);
      box(body,mat.red,side*width*.65,.66,-length*.45,.15,.09,.05);
    }
    if(kind==='scout'){
      // Open reconnaissance buggy: four exposed tires, roll cage and roof machine gun.
      box(body,groundMat.sand,0,.81,-.14,1.08,.28,.94);box(body,groundMat.glass,0,.97,.36,.87,.25,.05);
      for(const x of [-.5,.5])for(const z of [-.62,.34])box(body,groundMat.steel,x,1.07,z,.055,.65,.055);
      box(body,color,0,1.38,-.14,1.15,.08,1.12);box(body,mat.dark,0,.62,.88,1,.15,.12);
      cylinder(body,mat.dark,-.45,1.58,-.65,.023,1.1,5);
      const spare=mesh(wheelGeometry,groundMat.rubber,body,0,.87,-1);spare.rotation.x=Math.PI/2;spare.scale.set(1.3,1.3,1.3);
      rig.mountY=1.4;rig.muzzle=[0,.17,1.02];box(turret,groundMat.steel,0,.12,0,.28,.2,.36);groundBarrel(turret,[0,.17,.1],rig.muzzle,.035);
    }else if(kind==='tank'){
      // Main battle tank: sloping glacis, angular turret, skirts and single cannon.
      const glacis=box(body,trim,0,.86,.7,1.25,.12,.7);glacis.rotation.x=.25;
      for(const side of [-1,1])box(body,color,side*.95,.7,0,.12,.38,1.85);
      armoredBox(turret,color,0,.24,-.12,1.22,.46,1.12);cylinder(turret,trim,-.28,.53,-.32,.19,.08,8);
      rig.muzzle=[0,.3,1.95];groundBarrel(turret,[0,.3,.35],rig.muzzle,.075);
      box(turret,groundMat.sand,0,.26,-.78,.83,.32,.24);cylinder(turret,mat.dark,.44,.8,-.35,.02,.85,5);
    }else if(heavy){
      // Wide breakthrough chassis with four tread pods and twin heavy barrels.
      armoredBox(body,trim,0,.89,.55,1.72,.22,1.25);
      armoredBox(turret,color,0,.29,-.12,1.65,.57,1.45);rig.mountY=1.02;rig.spread=.34;rig.muzzle=[0,.32,2];
      for(const side of [-1,1]){groundBarrel(turret,[side*.34,.32,.4],[side*.34,.32,2],.105);box(turret,groundMat.steel,side*.78,.34,-.12,.19,.42,1.04);}
      for(const x of [-.5,0,.5])for(const z of [-.45,0])box(turret,trim,x,.61,z,.38,.12,.32);
      for(const side of [-1,1])for(const z of [-.9,-.3,.3,.9])box(body,color,side*1.05,.84,z,.43,.24,.44);
    }else if(kind==='artillery'){
      // Open gun carriage, raised breech, elevated howitzer and rear stabilizers.
      rig.mountY=.8;rig.muzzle=[0,1.22,2.45];
      for(const side of [-1,1]){box(body,groundMat.sand,side*.57,1,-.65,.2,.62,1.15);const spade=box(body,groundMat.steel,side*.67,.36,-1.58,.4,.19,.62);spade.rotation.x=-.35;}
      cylinder(turret,groundMat.steel,0,.15,0,.6,.2,10);box(turret,color,0,.47,-.2,.68,.58,1.05);
      for(const side of [-1,1])box(turret,trim,side*.47,.46,.05,.16,.7,.75);
      groundBarrel(turret,[0,.55,.3],rig.muzzle,.11);groundBarrel(turret,[.2,.45,.25],[.2,.8,1.3],.045);
    }else if(kind==='destroyer'){
      // Low wedge tank hunter with a long precision gun and exposed recoil rails.
      rig.mountY=.65;rig.muzzle=[0,.3,3.03];
      const wedge=box(body,trim,0,.78,.7,1.38,.17,.95);wedge.rotation.x=.23;
      armoredBox(turret,color,0,.19,-.2,1.22,.3,1.4);groundBarrel(turret,[0,.3,.15],rig.muzzle,.065);
      for(const side of [-1,1]){box(turret,groundMat.steel,side*.15,.3,1.18,.08,.14,1.9);box(turret,energyMat,side*.2,.34,.2,.04,.045,.48);}
      box(turret,groundMat.glass,.38,.39,-.28,.24,.16,.3);
    }else if(truck){
      // Eight-wheel missile truck: forward cab and elevated paired launch boxes.
      box(body,color,0,1.02,1.04,1.34,.72,.92);box(body,groundMat.glass,0,1.2,1.51,1.1,.3,.035);
      for(const side of [-1,1])box(body,groundMat.glass,side*.68,1.2,1.08,.03,.27,.52);
      rig.mountY=1.15;rig.spread=.39;rig.muzzle=[0,.79,.93];
      cylinder(turret,groundMat.steel,0,.05,-.2,.57,.14,10);
      for(const side of [-1,1]){const pod=new THREE.Group();pod.position.set(side*.39,.36,-.2);pod.rotation.x=-.32;turret.add(pod);armoredBox(pod,groundMat.sand,0,0,0,.62,.58,2.05);
        for(const x of [-.15,.15])for(const y of [-.14,.14]){const port=cylinder(pod,mat.dark,x,y,1.05,.095,.07,8);port.rotation.x=Math.PI/2;}
        box(pod,color,0,.32,0,.52,.04,1.6);
      }
    }else if(kind==='tesla'){
      // Electrical tank: broad capacitor banks and a tall luminous coil.
      for(const side of [-1,1])for(const z of [-.66,-.18,.3]){cylinder(body,groundMat.steel,side*.58,1,z,.18,.6,8);cylinder(body,energyMat,side*.58,1.22,z,.19,.09,8);}
      cylinder(turret,color,0,.16,0,.52,.28,10);cylinder(turret,groundMat.steel,0,.81,0,.13,1.25,8);
      for(let i=0;i<5;i++)cylinder(turret,i%2?energyMat:trim,0,.43+i*.21,0,.43-i*.035,.11,10);
      mesh(new THREE.SphereGeometry(.24,10,7),energyMat,turret,0,1.53,0);rig.muzzle=[0,1.53,0];
    }else if(kind==='flame'){
      // Armored flame vehicle: exposed fuel drums and a broad dozer blade.
      for(const side of [-1,1]){const drum=cylinder(body,groundMat.fuel,side*.47,1.04,-.65,.29,1.03,10);drum.rotation.x=Math.PI/2;for(const z of [-1.02,-.3]){const strap=cylinder(body,groundMat.steel,side*.47,1.04,z,.3,.09,10);strap.rotation.x=Math.PI/2;}}
      const blade=box(body,groundMat.steel,0,.42,1.32,2.08,.62,.16);blade.rotation.x=-.22;
      for(const x of [-.8,-.4,0,.4,.8])box(body,groundMat.sand,x,.16,1.45,.16,.12,.2);
      armoredBox(turret,color,0,.2,.2,1,.34,.75);rig.spread=.25;rig.muzzle=[0,.28,1.52];
      for(const side of [-1,1]){groundBarrel(turret,[side*.25,.28,.45],[side*.25,.28,1.52],.085);box(turret,lampMat,side*.25,.22,1.5,.08,.07,.06);}
    }else if(kind==='repair'){
      // Recovery crawler: offset service cab, tool lockers and an articulated crane.
      box(body,groundMat.sand,-.35,1.05,.36,.75,.66,.95);box(body,groundMat.glass,-.35,1.15,.85,.59,.25,.035);
      for(const side of [-1,1]){box(body,color,side*.64,.99,-.65,.32,.54,.75);box(body,repairMat,side*.82,1.02,-.65,.04,.32,.09);box(body,repairMat,side*.83,1.02,-.65,.04,.09,.32);}
      rig.mountY=1.02;cylinder(turret,groundMat.steel,.25,.17,-.25,.24,.32,8);
      groundBarrel(turret,[.25,.2,-.25],[.45,1.02,-.4],.1,groundMat.industrial);groundBarrel(turret,[.45,1.02,-.4],[.45,.82,1],.085,groundMat.industrial);
      for(const side of [-1,1])box(turret,groundMat.steel,.45+side*.13,.65,1,.06,.4,.12);
      box(turret,repairMat,.45,.83,1,.23,.16,.17);rig.muzzle=[.45,.83,1];
    }else if(miner){
      // Industrial six-wheel ore truck with open hopper and a rotating cutter drum.
      box(body,groundMat.industrial,-.35,1.13,.78,.87,.94,1.04);box(body,groundMat.glass,-.35,1.32,1.31,.69,.33,.04);
      box(body,color,-.35,1.65,.78,1,.09,1.13);box(body,groundMat.steel,.48,1,.75,.55,.62,.9);
      box(body,groundMat.steel,0,.72,-.62,1.48,.2,1.55);
      for(const side of [-1,1])box(body,groundMat.industrial,side*.72,1.05,-.62,.14,.7,1.55);box(body,groundMat.industrial,0,1.05,-1.4,1.55,.7,.14);
      rig.cargoMesh=box(body,mat.ore,0,1.02,-.62,1.15,.6,1.3);rig.cargoMesh.visible=false;rig.cargoMesh.userData.dynamic=true;
      rig.drill=new THREE.Group();rig.drill.position.set(0,.48,1.76);body.add(rig.drill);
      const drum=cylinder(rig.drill,groundMat.steel,0,0,0,.34,1.7,10);drum.rotation.z=Math.PI/2;
      for(const x of [-.65,-.22,.22,.65])for(let i=0;i<6;i++){const a=i*Math.PI/3;const tooth=box(rig.drill,groundMat.industrial,x,Math.sin(a)*.36,Math.cos(a)*.36,.14,.16,.16);tooth.rotation.x=-a;}
      batchStaticBoxes(rig.drill);turret.visible=false;
    }
    if(!scout&&!miner)for(let i=0;i<4;i++)box(body,groundMat.rubber,-.32+i*.21,.88,-length*.36,.1,.035,.35);
    turret.position.y=rig.mountY;batchStaticBoxes(body);batchStaticBoxes(turret);return rig;
  }

  function buildInfantryModel(body,turret,kind,color,trim){
    const legs=[];
    for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.19,.68,0);body.add(leg);box(leg,color,0,-.25,0,.22,.5,.25);box(leg,groundMat.rubber,0,-.52,.09,.26,.16,.4);legs.push(leg);}
    turret.position.y=.75;armoredBox(turret,color,0,.35,0,.6,.66,.37);
    for(const side of [-1,1])box(turret,color,side*.36,.31,.16,.19,.42,.23);
    cylinder(turret,groundMat.sand,0,.95,0,.21,.32,8);
    if(kind==='sniper'){
      // Hooded cape, long scoped rifle and a folded bipod.
      const cloak=mesh(new THREE.CylinderGeometry(.28,.52,.88,7,1,true),trim,turret,0,.38,-.16);cloak.scale.z=.75;
      mesh(new THREE.SphereGeometry(.29,8,6),trim,turret,0,1.04,-.04);box(turret,groundMat.rubber,0,1.04,.22,.28,.17,.035);
      groundBarrel(turret,[.27,.35,.2],[.27,.35,1.66],.035);box(turret,groundMat.sand,.27,.35,.4,.14,.15,.5);
      groundBarrel(turret,[.27,.51,.44],[.27,.51,.77],.065);for(const side of [-1,1])box(turret,groundMat.steel,.27+side*.05,.27,1.04,.025,.18,.23);
    }else{
      mesh(new THREE.SphereGeometry(.29,8,5,0,Math.PI*2,0,Math.PI/2),color,turret,0,1.08,0);box(turret,groundMat.glass,0,1,.21,.31,.1,.04);
      box(turret,groundMat.sand,0,.39,.23,.45,.44,.1);for(const x of [-.15,0,.15])box(turret,trim,x,.24,.31,.11,.18,.08);
      if(kind==='rocketTrooper'){
        box(turret,groundMat.steel,0,.4,-.32,.53,.66,.26);
        for(const x of [-.2,.2])groundBarrel(turret,[x,.05,-.49],[x,.87,-.49],.09,groundMat.industrial);
        groundBarrel(turret,[.36,.63,-.42],[.36,.63,1.08],.15);box(turret,color,.36,.63,.24,.33,.33,.64);
        const tip=mesh(new THREE.ConeGeometry(.12,.28,8),mat.ore,turret,.36,.63,1.09);tip.rotation.x=Math.PI/2;
      }else{
        box(turret,groundMat.sand,0,.34,-.31,.45,.51,.23);box(turret,mat.dark,.24,.35,.48,.13,.15,.51);
        groundBarrel(turret,[.24,.35,.54],[.24,.35,1.1],.032);box(turret,mat.dark,.24,.2,.5,.09,.23,.13);
      }
    }
    batchStaticBoxes(turret);return legs;
  }

  // Naval silhouettes are purpose-built: launch, missile escort, and gun battleship.
  const navalMat={hull:material('#4d626b',{metalness:.45,roughness:.52}),deck:material('#a0b0af'),wood:material('#b5a589'),cabin:material('#c9d3cb'),rubber:material('#202e32'),glass:material('#244b62',{metalness:.45,roughness:.22}),wake:material('#b0e0df',{transparent:true,opacity:.48,depthWrite:false})};
  function navalHull(parent,length,width,deckMat){
    const outline=[[0,.5],[.32,.38],[.5,.12],[.48,-.32],[.36,-.5],[-.36,-.5],[-.48,-.32],[-.5,.12],[-.32,.38]];
    const vertices=[],indices=[],n=outline.length;
    for(const [y,s] of [[.1,.68],[.56,1]])for(const [x,z] of outline)vertices.push(x*width*s,y,z*length*(s===1?1:.94));
    for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+j,i,n+j,n+i);}
    const hull=new THREE.BufferGeometry();hull.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));hull.setIndex(indices);hull.computeVertexNormals();mesh(hull,navalMat.hull,parent);
    const shape=new THREE.Shape();outline.forEach(([x,z],i)=>shape[i?'lineTo':'moveTo'](x*width*.95,z*length*.97));shape.closePath();
    const deck=new THREE.ExtrudeGeometry(shape,{depth:.09,bevelEnabled:false});deck.rotateX(Math.PI/2);mesh(deck,deckMat,parent,0,.61,0);
  }
  // Batch repeated static boxes by material to keep detailed ships inexpensive to draw.
  function batchStaticBoxes(parent){
    const groups=new Map();
    for(const child of [...parent.children])if(child.isMesh&&child.geometry===boxGeometry&&!child.userData.dynamic){const list=groups.get(child.material)||[];list.push(child);groups.set(child.material,list);}
    for(const [m,list] of groups)if(list.length>1){
      const instanced=new THREE.InstancedMesh(boxGeometry,m,list.length);instanced.castShadow=instanced.receiveShadow=true;
      list.forEach((o,i)=>{o.updateMatrix();instanced.setMatrixAt(i,o.matrix);parent.remove(o);});parent.add(instanced);
    }
  }
  function navalGun(parent,color,width=.65,barrels=1){
    cylinder(parent,navalMat.rubber,0,0,0,width*.55,.16,12);
    armoredBox(parent,color,0,.2,0,width,.32,width*.85);
    for(let i=0;i<barrels;i++){
      const x=(i-(barrels-1)/2)*.19;
      const barrel=cylinder(parent,mat.metal,x,.27,.68,.045,1.1,8);barrel.rotation.x=Math.PI/2;
      const bore=cylinder(parent,navalMat.rubber,x,.27,1.24,.048,.035,8);bore.rotation.x=Math.PI/2;
    }
  }
  function buildNavalModel(body,turret,kind,color,trim){
    const patrol=kind==='patrolBoat',frigate=kind==='frigate';
    const length=patrol?3.1:frigate?4.35:5,width=patrol?1.18:frigate?1.58:2.12;
    const rig={mountZ:patrol?.91:frigate?.64:1.5,mountY:.64,secondary:[],radar:null,wake:null};
    navalHull(body,length,width,patrol?navalMat.cabin:frigate?navalMat.deck:navalMat.wood);
    for(const side of [-1,1]){
      box(body,color,side*width*.46,.48,-.18,.07,.18,length*.48);
      box(body,trim,side*width*.47,.58,-.18,.045,.045,length*.46);
    }
    // Bollards, anchor chain and narrow deck railings make the scale readable.
    for(const z of [-length*.4,length*.3])for(const side of [-1,1])cylinder(body,mat.dark,side*width*.25,.7,z,.055,.17,6);
    box(body,mat.dark,0,.64,length*.35,.025,.025,length*.12);
    if(patrol){
      // Low coastal launch: enclosed wheelhouse, rubber fenders and exposed aft deck.
      const cabin=armoredBox(body,navalMat.cabin,0,.91,-.23,.74,.56,.89);cabin.rotation.x=-.07;
      box(body,navalMat.glass,0,1.03,.24,.61,.26,.035);
      for(const side of [-1,1]){
        box(body,navalMat.glass,side*.39,1.04,-.23,.03,.2,.6);
        for(const z of [-.65,-.2,.3]){const fender=cylinder(body,navalMat.rubber,side*.55,.5,z,.09,.25,8);fender.rotation.z=Math.PI/2;}
      }
      box(body,color,0,1.24,-.25,.87,.09,1.05);
      cylinder(body,mat.metal,-.22,1.54,-.55,.025,.58,5);
      box(body,navalMat.cabin,-.22,1.8,-.55,.52,.045,.07);
      const life=mesh(new THREE.TorusGeometry(.16,.04,5,12),mat.ore,body,.41,.93,-.4);life.rotation.y=Math.PI/2;
      box(body,mat.dark,0,.68,-1.12,.55,.14,.38);
      navalGun(turret,mat.dark,.42,1);
    }else if(frigate){
      // Modern missile escort: angular bridge, sensor mast, launcher bank and aft helipad.
      armoredBox(body,navalMat.cabin,0,.91,-.05,1.02,.6,1.12);
      armoredBox(body,navalMat.hull,0,1.25,-.13,.72,.32,.72);
      box(body,navalMat.glass,0,1.22,.55,.88,.18,.04);
      for(const side of [-1,1])box(body,navalMat.glass,side*.53,1.22,.12,.035,.18,.67);
      cylinder(body,navalMat.hull,0,1.75,-.22,.1,1.05,6);
      for(const side of [-1,1]){const panel=box(body,navalMat.glass,side*.17,1.82,-.22,.25,.36,.36);panel.rotation.z=-side*.16;}
      rig.radar=new THREE.Group();rig.radar.position.set(0,2.23,-.22);body.add(rig.radar);box(rig.radar,mat.metal,0,0,0,.75,.14,.12);
      box(body,navalMat.hull,0,1.03,-.85,.55,.75,.46);box(body,mat.dark,0,1.43,-.85,.58,.06,.49);
      box(body,mat.dark,0,.64,-1.48,1.12,.04,.75);
      for(const side of [-1,1])box(body,navalMat.cabin,side*.21,.67,-1.48,.045,.02,.4);
      box(body,navalMat.cabin,0,.67,-1.48,.43,.02,.045);
      // Two angled launch pods remain the real animated weapon mount.
      for(const side of [-1,1]){
        const pod=new THREE.Group();pod.position.set(side*.3,.12,0);pod.rotation.x=-.4;turret.add(pod);
        armoredBox(pod,navalMat.hull,0,.18,0,.42,.42,.78);
        for(const x of [-.1,.1])for(const y of [.09,.28]){const port=cylinder(pod,mat.dark,x,y,.43,.065,.035,8);port.rotation.x=Math.PI/2;}
      }
      for(let x=-.3;x<=.3;x+=.2)for(const z of [1.35,1.59])box(body,mat.dark,x,.65,z,.13,.04,.16);
    }else{
      // Broad gunship: timber deck, raised forward battery, aft battery, twin funnels.
      armoredBox(body,navalMat.cabin,0,1.04,-.25,.93,.82,1.15);
      box(body,navalMat.glass,0,1.28,.35,.83,.2,.04);
      armoredBox(body,navalMat.hull,0,1.57,-.16,.65,.32,.63);
      cylinder(body,mat.metal,0,1.95,-.16,.055,.75,8);
      box(body,mat.metal,0,2.14,-.16,.85,.06,.08);
      for(const z of [-.66,-1.08]){cylinder(body,navalMat.hull,0,1.25,z,.21,.9,10);cylinder(body,mat.dark,0,1.73,z,.23,.09,10);}
      navalGun(turret,color,.84,3);
      for(const [z,y] of [[.68,.89],[-1.72,.64]]){
        const secondary=new THREE.Group();secondary.position.set(0,y,z);body.add(secondary);navalGun(secondary,color,.73,3);rig.secondary.push(secondary);
      }
      for(const side of [-1,1]){
        const boat=cylinder(body,navalMat.cabin,side*.75,.83,-.66,.12,.68,8);boat.rotation.x=Math.PI/2;
        for(const z of [-.2,.34]){cylinder(body,mat.dark,side*.82,.76,z,.14,.18,8);box(body,mat.metal,side*.85,.89,z+.2,.04,.04,.32);}
        box(body,navalMat.cabin,side*.9,.88,-.2,.025,.025,2.5);
        for(let z=-1.4;z<1.2;z+=.43)box(body,navalMat.cabin,side*.9,.74,z,.025,.28,.025);
      }
    }
    // A light stern wake uses two shared-geometry strips, with no particle simulation.
    const wake=new THREE.Group();wake.position.z=-length*.5;body.add(wake);rig.wake=wake;
    for(const side of [-1,1]){const foam=box(wake,navalMat.wake,side*.22,.18,-.6,.12,.015,1.4);foam.rotation.y=side*.2;foam.castShadow=foam.receiveShadow=false;}
    wake.visible=false;
    turret.position.set(0,rig.mountY,rig.mountZ);
    batchStaticBoxes(body);batchStaticBoxes(turret);
    return rig;
  }

  const damageVariants=new WeakMap(),damageTransform=new THREE.Object3D();
  const damageSoot=material('#242725');
  const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=32;
  const smokeContext=smokeCanvas.getContext('2d'),smokeGradient=smokeContext.createRadialGradient(16,16,0,16,16,16);
  smokeGradient.addColorStop(0,'rgba(255,255,255,.9)');smokeGradient.addColorStop(.45,'rgba(255,255,255,.6)');smokeGradient.addColorStop(1,'rgba(255,255,255,0)');
  smokeContext.fillStyle=smokeGradient;smokeContext.fillRect(0,0,32,32);
  const damageSmoke=new THREE.MeshBasicMaterial({color:'#494944',map:new THREE.CanvasTexture(smokeCanvas),transparent:true,opacity:.65,depthWrite:false});
  const smokeGeometry=new THREE.PlaneGeometry(1,1),damageFlameGeometry=new THREE.ConeGeometry(1,2,5);
  const damageFire=new THREE.MeshBasicMaterial({color:'#ff9d32',toneMapped:false});
  function wornMaterial(original,stage){
    if(!stage||!original.isMeshStandardMaterial)return original;
    let variants=damageVariants.get(original);
    if(!variants){variants=[original];damageVariants.set(original,variants);}
    if(!variants[stage]){
      const m=original.clone();delete m.userData.fieldFog;
      m.color.lerp(new THREE.Color('#302d29'),[0,.22,.4,.58][stage]);
      m.roughness=Math.max(m.roughness,.94);m.metalness*=.6;m.emissiveIntensity*=1-stage*.22;
      fog.shade(m);materials.push(m);variants[stage]=m;
    }
    return variants[stage];
  }
  function createDamageVisual(u){
    const surfaces=[];
    for(const root of [u.body,u.turret])root.traverse(o=>{
      if(o.isMesh&&o!==u.muzzle)surfaces.push({mesh:o,material:o.material});
    });
    // Place scorch marks on the actual model surface, including different hull shapes.
    u.mesh.updateMatrixWorld(true);
    const hits=[],r=new THREE.Raycaster(),size=Math.max(.4,u.radius),infantry=UNIT[u.kind].infantry;
    for(const [x,z] of [[0,-.65],[.35,.15],[-.35,.55]]){
      const top=u.body.localToWorld(new THREE.Vector3(x*size,12,z*size));
      r.set(top,new THREE.Vector3(0,-1,0));
      const hit=r.intersectObjects(u.body.children,true).find(h=>h.object!==u.flightRotor&&!u.flightRotor?.children.includes(h.object));
      hits.push(hit?u.body.worldToLocal(hit.point.clone()).add(new THREE.Vector3(0,.025,0)):new THREE.Vector3(x*size,.7,z*size));
    }
    const root=new THREE.Group();u.body.add(root);
    const scars=new THREE.InstancedMesh(burstGeometry,damageSoot,3);scars.raycast=()=>{};root.add(scars);
    hits.forEach((point,i)=>{damageTransform.position.copy(point);damageTransform.rotation.set(0,i*1.7,0);damageTransform.scale.set(size*(infantry?.25:.42),.035,size*.26);damageTransform.updateMatrix();scars.setMatrixAt(i,damageTransform.matrix);});
    const smoke=new THREE.InstancedMesh(smokeGeometry,damageSmoke,4);smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);smoke.frustumCulled=false;smoke.raycast=()=>{};root.add(smoke);
    const fire=new THREE.Mesh(damageFlameGeometry,damageFire);fire.raycast=()=>{};root.add(fire);
    shadedRoots.delete(u.mesh);
    return {root,surfaces,scars,smoke,fire,anchor:hits[0],size,infantry,stage:-1,time:0,orientation:new THREE.Quaternion()};
  }
  function updateUnitDamage(u,dt){
    const health=u.hp/u.maxHp,stage=health<=.25?3:health<=.5?2:health<.8?1:0;
    if(!u.damageVisual&&!stage)return;
    const fx=u.damageVisual||(u.damageVisual=createDamageVisual(u));
    if(fx.stage!==stage){
      for(const entry of fx.surfaces)entry.mesh.material=Array.isArray(entry.material)?entry.material.map(m=>wornMaterial(m,stage)):wornMaterial(entry.material,stage);
      fx.stage=stage;fx.root.visible=stage>0;fx.scars.count=stage===1?1:3;
    }
    if(!stage||!u.mesh.visible)return;
    fx.time+=dt;
    fx.smoke.visible=!fx.infantry&&stage>=2;fx.fire.visible=!fx.infantry&&stage===3;
    if(fx.smoke.visible){
      fx.smoke.count=$('graphics-quality').value==='performance'?2:4;
      u.body.getWorldQuaternion(fx.orientation).invert().multiply(camera.quaternion);
      for(let i=0;i<fx.smoke.count;i++){
        const t=(fx.time*.6+i/fx.smoke.count+u.id*.17)%1;
        damageTransform.position.copy(fx.anchor);damageTransform.position.y+=.15+t*(stage===3?3.5:2.4);
        damageTransform.position.x+=Math.sin(i*2+fx.time)*t*.35;damageTransform.position.z-=t*(isAir(u)?2.2:.45);
        damageTransform.quaternion.copy(fx.orientation);
        damageTransform.scale.setScalar(Math.sin(t*Math.PI)*fx.size*(stage===3?2.3:1.5));damageTransform.updateMatrix();fx.smoke.setMatrixAt(i,damageTransform.matrix);
      }
      fx.smoke.instanceMatrix.needsUpdate=true;
    }
    if(fx.fire.visible){const flicker=.85+Math.sin(fx.time*19+u.id)*.15;fx.fire.position.copy(fx.anchor);fx.fire.position.y+=fx.size*.45;fx.fire.scale.set(fx.size*.26,flicker*fx.size*.7,fx.size*.3);fx.fire.rotation.y=fx.time*2;}
  }
  function releaseUnitDamage(u){
    const fx=u.damageVisual;if(!fx)return;
    fx.scars.dispose();fx.smoke.dispose();fx.root.removeFromParent();u.damageVisual=null;
  }

  function createUnit(kind, team, x, z) {
    const def = UNIT[kind], group = new THREE.Group(), body = new THREE.Group(), turret = new THREE.Group();
    group.position.set(x, 0, z); group.add(body, turret); actors.add(group);
    const [color,trim] = teamMaterials[team];
    let cargoMesh = null, drill = null, legs = [], flightRotor=null, navalRig=null, groundRig=null;
    if(def.naval){
      navalRig=buildNavalModel(body,turret,kind,color,trim);
    } else if(def.aircraft){
      group.position.y=def.altitude;
      armoredBox(body,color,0,.3,0,kind==='bomber'?1.5:.85,.6,3.1);
      box(body,mat.window,0,.65,.75,.65,.25,.85);
      box(body,color,0,.3,-1.35,2.2,.15,.65);
      for(const side of [-1,1]){
        const wing=box(body,trim,side*1.5,.25,-.1,2.2,.12,kind==='bomber'?1.8:.8);wing.rotation.y=side*.2;
        cylinder(body,mat.dark,side*1.4,.05,-.1,.3,.5,10);
        box(body,mat.ore,side*1.35,.02,.65,.18,.18,.7);
      }
      if(kind==='gunship'){
        flightRotor=new THREE.Group();flightRotor.position.y=1.1;body.add(flightRotor);
        cylinder(body,mat.metal,0,.85,0,.09,.5,6);
        box(flightRotor,mat.dark,0,0,0,5.2,.06,.2);box(flightRotor,mat.dark,0,0,0,.2,.06,5.2);
      }else{const tail=box(body,color,0,.75,-1.3,.12,1.1,.8);tail.rotation.x=-.25;}
      turret.position.y=.1;
      box(turret,mat.dark,0,0,1.25,.18,.18,1);
    } else if (def.infantry) {
      legs=buildInfantryModel(body,turret,kind,color,trim);
    } else {
      groundRig=buildGroundModel(body,turret,kind,color,trim);cargoMesh=groundRig.cargoMesh;drill=groundRig.drill;
    }
    const muzzle = mesh(burstGeometry, def.weapon === 'tesla' ? energyMat : lampMat, turret, 0, kind === 'tesla' ? 1.46 : .3, kind === 'tesla' ? 0 : 1.65); muzzle.scale.setScalar(.28); muzzle.visible = false;
    const beamGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const repairBeam = kind === 'repair' ? new THREE.Line(beamGeometry, repairLineMat) : null;
    if (repairBeam) { group.add(repairBeam); repairBeam.visible = false; repairBeam.raycast = () => {}; } else beamGeometry.dispose();
    const selectionRing = ring(group, friendlyRing, Math.max(1.5, def.radius * 1.25)); selectionRing.visible = false;
    const u = { id: nextId++, type: 'unit', kind, team, mesh: group, body, turret, ring: selectionRing, cargoMesh, drill, legs, flightRotor, navalRig, groundRig, muzzle, flashLeft: 0, repairBeam, repairTarget: null,
      hp: def.hp, maxHp: def.hp, radius: def.radius, cooldown: random(), destination: null, attackTarget: null,
      path: [], pathVersion: -1, pathGoal: null, repath: 0, state: 'Idle', cargo: 0, mining: kind === 'miner', field: null, mineState: 'travel', unload: 0, raid: false };
    if(def.aircraft)selectionRing.position.y=.09-group.position.y;
    group.userData.entity = u; units.push(u); label(u, kind === 'miner' ? 'MINER' : kind === 'artillery' ? 'SIEGE' : kind === 'heavy' ? 'HEAVY' : '');
    return u;
  }

  // 4. NAVIGATION. A* routes around buildings; circular separation handles traffic.
  const CELL = 1.5, COLS = Math.round(HALF_X * 2 / CELL) + 1, ROWS = Math.round(HALF_Z * 2 / CELL) + 1;
  function blocked(x, z, r, naval=false) {
    return Math.abs(x) > HALF_X - r || Math.abs(z) > HALF_Z - r || !terrainAllows(x,z,r,naval) || terrainBlocked(x,z,r) || buildings.some(b => b.hp > 0 && Math.hypot(x - b.mesh.position.x, z - b.mesh.position.z) < b.radius + r + .2);
  }
  function clearSegment(a, b, r, naval=false) {
    if(!naval&&!bridgeSidesClear(a,b,r))return false;
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / .6));
    for (let i = 1; i <= n; i++) if (blocked(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n, r, naval)) return false;
    return true;
  }
  const cellPoint = n => new THREE.Vector3(-HALF_X + n % COLS * CELL, 0, -HALF_Z + Math.floor(n / COLS) * CELL);
  const cellIndex = p => THREE.MathUtils.clamp(Math.round((p.z + HALF_Z) / CELL), 0, ROWS - 1) * COLS + THREE.MathUtils.clamp(Math.round((p.x + HALF_X) / CELL), 0, COLS - 1);
  let wallVersion=-1;const wallGrids=new Map();
  function routeWalls(radius, naval=false) {
    const key=radius+":"+naval;
    if(wallVersion!==navVersion){wallGrids.clear();wallVersion=navVersion;}
    if(!wallGrids.has(key)){
      const walls=new Uint8Array(COLS*ROWS);
      for(let i=0;i<walls.length;i++)walls[i]=blocked(-HALF_X+i%COLS*CELL,-HALF_Z+Math.floor(i/COLS)*CELL,radius,naval)?1:0;
      wallGrids.set(key,walls);
    }
    return wallGrids.get(key).slice(); // Opening this route's start cell must not mutate the cached map.
  }
  function route(start, goal, radius, naval=false) {
    start=start.clone();goal=goal.clone();start.y=goal.y=0;
    if (clearSegment(start, goal, radius, naval)) return [goal.clone()];
    const total = COLS * ROWS, walls = routeWalls(radius,naval);
    const begin = cellIndex(start); walls[begin] = 0;
    let end = cellIndex(goal);
    if (walls[end]) {
      let best = Infinity;
      for (let i = 0; i < total; i++) if (!walls[i]) { const d = cellPoint(i).distanceToSquared(goal); if (d < best) { best = d; end = i; } }
    }
    const score = new Float64Array(total).fill(Infinity), parent = new Int32Array(total).fill(-1), closed = new Uint8Array(total);
    const open=[],endX=end%COLS,endZ=Math.floor(end/COLS);score[begin]=0;
    const heuristic=i=>{const dx=Math.abs(i%COLS-endX),dz=Math.abs(Math.floor(i/COLS)-endZ);return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);};
    const push=(id,g)=>{const node={id,g,f:g+heuristic(id)};let i=open.length;open.push(node);while(i){const parent=(i-1)>>1;if(open[parent].f<=node.f)break;open[i]=open[parent];i=parent;}open[i]=node;};
    const pop=()=>{const first=open[0],last=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let child=i*2+1;if(child+1<open.length&&open[child+1].f<open[child].f)child++;if(open[child].f>=last.f)break;open[i]=open[child];i=child;}open[i]=last;}return first;};
    push(begin,0);let reached = false;
    while (open.length) {
      const node=pop(),current=node.id;if(closed[current]||node.g!==score[current])continue;
      if (current === end) { reached = true; break; }
      closed[current] = 1;
      const cx = current % COLS, cz = Math.floor(current / COLS);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx, z = cz + dz, next = z * COLS + x;
        if (x < 0 || x >= COLS || z < 0 || z >= ROWS || walls[next] || closed[next]) continue;
        if (dx && dz && (walls[cz * COLS + x] || walls[z * COLS + cx])) continue;
        if(current===begin&&!clearSegment(start,cellPoint(next),radius,naval))continue;
        if (!naval && current!==begin && !bridgeSidesClear(cellPoint(current),cellPoint(next),radius)) continue;
        const g = score[current] + (dx && dz ? Math.SQRT2 : 1);
        if (g < score[next]) { score[next] = g; parent[next] = current; push(next,g); }
      }
    }
    if (!reached) return [];
    const path = [];
    for (let n = end; n !== begin && n >= 0; n = parent[n]) path.unshift(cellPoint(n));
    if (!blocked(goal.x, goal.z, radius,naval)) path.push(goal.clone());
    // String-pulling removes needless grid zigzags without cutting through a wall.
    const smooth = []; let from = start;
    for (let i = 0; i < path.length;) {
      let furthest = i;
      for (let j = i + 1; j < path.length && clearSegment(from, path[j], radius,naval); j++) furthest = j;
      smooth.push(path[furthest]); from = path[furthest]; i = furthest + 1;
    }
    return smooth;
  }
  function rotateToward(obj, angle, dt) {
    const delta = Math.atan2(Math.sin(angle - obj.rotation.y), Math.cos(angle - obj.rotation.y));
    obj.rotation.y += delta * Math.min(1, dt * 9);
  }
  function moveToward(u, target, dt, tolerance = .4) {
    const pos = u.mesh.position;
    if(!isAir(u))pos.y=0;
    target=target.clone();target.y=pos.y;
    if(isAir(u)){
      const direction=target.clone().sub(pos),d=direction.length();
      if(d<tolerance)return true;
      pos.addScaledVector(direction.normalize(),Math.min(UNIT[u.kind].speed*dt,d));
      rotateToward(u.body,Math.atan2(direction.x,direction.z),dt);u.state='Flying';return false;
    }
    if(!isNaval(u)&&!bridgeSidesClear(pos,pos,u.radius)){
      // Older saved matches may have units overlapping the newly enforced bridge sides.
      let recovered=null;
      for(let radius=.25;radius<=3&&!recovered;radius+=.25)for(let i=0;i<16;i++){
        const angle=i*Math.PI/8,p=pos.clone().add(new THREE.Vector3(Math.cos(angle)*radius,0,Math.sin(angle)*radius));
        if(!blocked(p.x,p.z,u.radius)){recovered=p;break;}
      }
      if(recovered){pos.copy(recovered);clearRoute(u);}
    }
    if (pos.distanceTo(target) < tolerance) return true;
    u.repath -= dt;
    if(u.repath<=0&&u.path.length){
      // Traffic can push a unit past a corner. Skip cleared corners instead of turning back into the queue.
      while(u.path.length>1&&clearSegment(pos,u.path[1],u.radius,isNaval(u)))u.path.shift();
      if(u.navProgress&&pos.distanceToSquared(u.navProgress)<.16)clearRoute(u);
      u.navProgress=pos.clone();u.repath=u.path.length?.75:0;
    }
    if (u.pathVersion !== navVersion || !u.pathGoal || u.pathGoal.distanceTo(target) > 1.3 || !u.path.length && u.repath <= 0) {
      u.path = route(pos, target, u.radius, isNaval(u)); u.pathGoal = target.clone(); u.pathVersion = navVersion; u.repath = 1;
    }
    if (!u.path.length) { u.state = 'Route blocked'; return false; }
    let waypoint = u.path[0];
    if (pos.distanceTo(waypoint) < .35 && (u.path.length===1||clearSegment(pos,u.path[1],u.radius,isNaval(u)))) { u.path.shift(); waypoint = u.path[0]; }
    if (!waypoint) return pos.distanceTo(target) < Math.max(1.8, tolerance);
    const direction = waypoint.clone().sub(pos), d = direction.length();
    const next=pos.clone().addScaledVector(direction.normalize(), Math.min(UNIT[u.kind].speed * dt, d));
    if(!clearSegment(pos,next,u.radius,isNaval(u))){clearRoute(u);u.state='Finding clear route';return false;}
    pos.copy(next);
    rotateToward(u.body, Math.atan2(direction.x, direction.z), dt); u.state = 'Moving';
    return false;
  }
  function clearRoute(u) { u.path = []; u.pathGoal = null; u.repath = 0; u.navProgress=null; }
  function resolveCollisions() {
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const safePosition=u.mesh.position.clone();
      for (let j = i + 1; j < units.length; j++) {
        const v = units[j];if(isAir(u)!==isAir(v)||isNaval(u)!==isNaval(v))continue;
        const delta = u.mesh.position.clone().sub(v.mesh.position), min = u.radius + v.radius + .1;
        const d = delta.length();
        if (d < min) {
          if (d < .001) delta.set(1, 0, 0); else delta.divideScalar(d);
          const push = Math.min(.2, (min - d) * .5);
          const up=u.mesh.position.clone().addScaledVector(delta,push),vp=v.mesh.position.clone().addScaledVector(delta,-push);
          if(isAir(u)||!blocked(up.x,up.z,u.radius,isNaval(u)))u.mesh.position.copy(up);
          if(isAir(v)||!blocked(vp.x,vp.z,v.radius,isNaval(v)))v.mesh.position.copy(vp);
        }
      }
      for (const b of buildings) if (!isAir(u) && b.hp > 0) {
        const delta = u.mesh.position.clone().sub(b.mesh.position), min = b.radius + u.radius + .05;
        if (delta.length() < min) { if (delta.lengthSq() < .001) delta.set(1, 0, 0); u.mesh.position.copy(b.mesh.position).addScaledVector(delta.normalize(), min); }
      }
      if(!isAir(u))for(const o of MAP.obstacles){const dx=u.mesh.position.x-o.x,dz=u.mesh.position.z-o.z,d=Math.hypot(dx,dz),min=o.radius+u.radius+.22;
        if(d<min){u.mesh.position.x=o.x+(d?dx/d:1)*min;u.mesh.position.z=o.z+(d?dz/d:0)*min;}}
      if(!isAir(u)&&!terrainAllows(u.mesh.position.x,u.mesh.position.z,u.radius,isNaval(u)))u.mesh.position.copy(safePosition);
      u.mesh.position.x = THREE.MathUtils.clamp(u.mesh.position.x, -HALF_X + u.radius, HALF_X - u.radius);
      u.mesh.position.z = THREE.MathUtils.clamp(u.mesh.position.z, -HALF_Z + u.radius, HALF_Z - u.radius);
    }
  }

  // 5. ECONOMY. Cargo becomes credits only after a living miner reaches a refinery.
  function findField(u) {
    return fields.filter(f => f.amount > .01 && fog.at(u.team,f.mesh.position.x,f.mesh.position.z,true)).sort((a, b) => a.mesh.position.distanceTo(u.mesh.position) - b.mesh.position.distanceTo(u.mesh.position))[0] || null;
  }
  function assignMining(u, field = null) {
    u.preferredRefinery = null;
    u.mineAccess = null; u.mineRetry = null; u.mineAvoid = null;
    u.mining = true; u.field = field?.amount > .01 ? field : findField(u);
    u.destination = null; u.attackTarget = null; u.mineState = u.cargo > 0 ? 'return' : 'travel'; u.unload = 0; clearRoute(u);
  }
  function miningAccess(u, sites, phase) {
    const pos=u.mesh.position, previous=u.mineAccess;
    if(previous&&previous.phase===phase&&previous.version===navVersion&&sites.includes(previous.site)&&!blocked(previous.point.x,previous.point.z,u.radius)){
      const d=pos.distanceTo(previous.point);
      if(d<previous.distance-.3){previous.distance=d;previous.progressAt=elapsed;}
      const servicing=phase==='return'?u.mineState==='unload':u.mineState==='harvest';
      if(d<.6||servicing&&d<1.2||elapsed-previous.progressAt<3)return previous;
      // A stationary vehicle can obstruct a lane even though the terrain route is valid.
      u.mineAvoid={point:previous.point,until:elapsed+8};
    }
    u.mineAccess=null;
    if(u.mineRetry?.phase===phase&&u.mineRetry.version===navVersion&&elapsed<u.mineRetry.at)return null;
    for(const site of sites){
      const radius=phase==='return'?site.radius+u.radius+.65:2.7;
      const points=Array.from({length:12},(_,i)=>{
        const angle=i*Math.PI/6;return site.mesh.position.clone().add(new THREE.Vector3(Math.cos(angle)*radius,0,Math.sin(angle)*radius));
      }).sort((a,b)=>pos.distanceToSquared(a)-pos.distanceToSquared(b));
      for(const point of points){
        if(blocked(point.x,point.z,u.radius)||u.mineAvoid?.until>elapsed&&point.distanceTo(u.mineAvoid.point)<2)continue;
        if(units.some(v=>v!==u&&v.hp>0&&!isAir(v)&&!isNaval(v)&&(
          point.distanceTo(v.mesh.position)<u.radius+v.radius+.15||
          v.mining&&v.mineAccess?.phase===phase&&v.mineAccess.site===site&&point.distanceTo(v.mineAccess.point)<u.radius+v.radius+.25)))continue;
        const path=route(pos,point,u.radius);
        // A* may return a nearby cell for blocked goals; require the actual service point.
        if(!path.length||path[path.length-1].distanceTo(point)>.1)continue;
        u.path=path;u.pathGoal=point.clone();u.pathVersion=navVersion;u.repath=1;u.navProgress=null;u.mineRetry=null;
        return u.mineAccess={site,point,phase,version:navVersion,distance:pos.distanceTo(point),progressAt:elapsed};
      }
    }
    clearRoute(u);u.mineRetry={phase,version:navVersion,at:elapsed+2};return null;
  }
  function updateMiner(u, dt) {
    if (u.destination) { if (moveToward(u, u.destination, dt)) u.destination = null; return; }
    if (!u.mining) { u.state = 'Idle'; return; }
    const def = UNIT.miner;
    if ((!u.field || u.field.amount <= .01) && u.mineState !== 'return' && u.mineState !== 'unload') {
      u.field = findField(u);
      if (u.cargo > 0) u.mineState = 'return'; else u.mineState = 'travel';
    }
    if (u.mineState === 'return' || u.mineState === 'unload') {
      const refineries = buildings.filter(b => b.kind === 'refinery' && b.team === u.team && active(b));
      refineries.sort((a,b)=>(a===u.preferredRefinery?-1:b===u.preferredRefinery?1:a.mesh.position.distanceTo(u.mesh.position)-b.mesh.position.distanceTo(u.mesh.position)));
      if (!refineries.length) { u.mineAccess=null;u.state = 'Waiting for refinery'; return; }
      const access=miningAccess(u,refineries,'return');
      if(!access){u.mineState='return';u.unload=0;u.state='Waiting for clear refinery access';return;}
      if(u.mineState==='unload'&&(u.unloadAccess?.site!==access.site||u.unloadAccess.point.distanceTo(access.point)>.1)){u.mineState='return';u.unload=0;}
      if(u.mineState==='unload')u.unloadAccess=access;
      const dock=access.point;
      // A destroyed refinery or a traffic push must not allow remote unloading.
      if (u.mineState === 'unload' && u.mesh.position.distanceTo(dock) > 1.7) { u.mineState = 'return'; u.unload = 0; clearRoute(u); }
      if (u.mineState === 'return') {
        if (moveToward(u, dock, dt, .6)&&u.mesh.position.distanceTo(dock)<1.2) { u.mineState = 'unload'; u.unload = 0;u.unloadAccess=access; }
        u.state = 'Returning ore';
      } else {
        u.state = 'Unloading'; u.unload += dt * (powerFor(u.team).low ? .5 : 1);
        if (u.unload >= 1.1) {
          if (u.team === 'player') { credits += u.cargo; delivered += u.cargo; } else if(u.team==='enemy') { enemyCredits += u.cargo; enemyDelivered += u.cargo; } else {extraEconomies[u.team].credits+=u.cargo;extraEconomies[u.team].delivered+=u.cargo;}
          u.cargo = 0; u.mineState = 'travel';u.mineAccess=null;u.unloadAccess=null; clearRoute(u);
        }
      }
    } else {
      if (!u.field) { u.state = 'Ore depleted'; return; }
      const oreSites=[u.field,...fields.filter(f=>f!==u.field&&f.amount>.01&&fog.at(u.team,f.mesh.position.x,f.mesh.position.z,true)).sort((a,b)=>distance(u,a)-distance(u,b))];
      const access=miningAccess(u,oreSites,'travel');
      if(!access){u.state='Waiting for clear ore access';return;}
      if(u.field!==access.site){u.field=access.site;u.mineState='travel';}
      const target=access.point;
      if(u.mineState==='harvest'&&u.mesh.position.distanceTo(target)>1.5)u.mineState='travel';
      if (u.mineState === 'travel') {
        if (moveToward(u, target, dt, .6)&&u.mesh.position.distanceTo(target)<1.2) u.mineState = 'harvest';
        u.state = 'Driving to ore';
      } else {
        u.state = 'Harvesting';
        // Ore/credits are whole units; accumulate fractional harvest time separately.
        u.harvestAccumulator = (u.harvestAccumulator || 0) + def.harvestRate * dt;
        const amount = Math.min(Math.floor(u.harvestAccumulator + 1e-8), def.capacity - u.cargo, u.field.amount);
        u.harvestAccumulator -= amount;
        u.cargo += amount; u.field.amount = Math.max(0, u.field.amount - amount);
        u.drill.rotation.x += dt * 9;
        const direction = u.field.mesh.position.clone().sub(u.mesh.position); rotateToward(u.body, Math.atan2(direction.x, direction.z), dt);
        if (u.cargo >= def.capacity - .01 || u.field.amount <= .01) { u.harvestAccumulator = 0; u.mineState = 'return';u.mineAccess=null; clearRoute(u); }
      }
    }
    u.cargoMesh.visible = u.cargo > 0; u.cargoMesh.scale.y = .6 * Math.max(.08, u.cargo / def.capacity);
  }
  function queueUnit(kind, team = localTeam, producerId = null) {
    if (!Object.hasOwn(UNIT, kind)) return;
    if(!applyingCommand&&team===localTeam)producerId=[...selected].find(b=>b.team===team&&b.kind===UNIT[kind].producer&&active(b))?.id||producerId;
    if (sendAction({ type: 'queue', kind, producerId })) return;
    const def = UNIT[kind], production = queueFor(team);
    if(producerId&&!buildings.some(b=>b.id===producerId&&b.team===team&&b.kind===def.producer&&active(b))){announce('Choose a completed production building of your own.');return;}
    if (outcome || !baseOf(team)) return;
    if (!producerFor(kind, team)) { announce(`Complete a ${STRUCTURE[def.producer].name.toLowerCase()} first.`); return; }
    if (money(team) < def.cost) { announce('Not enough credits. Mine ore or earn battle rewards.'); return; }
    if (unitsFor(team).length + production.length >= 24) { announce('Unit limit reached (24, including queued units).'); return; }
    spend(team, def.cost); if(team==='enemy'&&!net?.active)aiLog(`Queued ${def.name}`); production.push({ kind, progress: 0, producerId:producerId||producerFor(kind,team).id }); if(team===localTeam) announce(`${def.name} queued.`); updateUI();
    emitVoiceAlert(team,'queued',kind);
  }
  function cancelQueue(team = localTeam, kind = null) {
    if (sendAction({ type: 'cancelQueue', kind })) return;
    const production = queueFor(team);
    const index = kind ? production.map(q => q.kind).lastIndexOf(kind) : production.length - 1;
    if (index >= 0 && !outcome) { const [item] = production.splice(index, 1); spend(team, -UNIT[item.kind].cost); announce(`${UNIT[item.kind].name} cancelled. Credits refunded.`); updateUI(); }
  }
  const repairPrice = b => (STRUCTURE[b.kind].cost || 600) * .5 / b.maxHp;
  const saleValue = b => Math.floor((STRUCTURE[b.kind].cost || 0) * .5 * b.hp / b.maxHp);
  function repairStructure(b, enabled, team=localTeam) {
    if(!b||!isBuilding(b)||b.team!==team||b.hp<=0||outcome||!baseOf(team))return;
    if(sendAction({type:'repairStructure',ids:[b.id],enabled}))return;
    if(b.buildLeft || enabled&&b.hp>=b.maxHp)return;
    b.repairing=enabled;
    announce(enabled?'Repairs enabled. Credits are spent as health is restored.':'Repairs stopped.');updateUI();
  }
  function sellStructure(b, team=localTeam) {
    if(!b||!isBuilding(b)||b.team!==team||b.hp<=0||b.kind==='base'||outcome||!baseOf(team))return;
    if(sendAction({type:'sellStructure',ids:[b.id]}))return;
    const refund=saleValue(b);spend(team,-refund);
    // Selling is a removal, not a combat kill: no bounty or elimination event.
    b.hp=0;b.repairing=false;b.mesh.visible=false;b.label.remove();b.selectionFrame?.remove();selected.delete(b);navVersion++;
    refreshFog();if(team===localTeam)announce(`${STRUCTURE[b.kind].name} sold. ${refund} credits refunded.`);updateUI();
  }
  function updateStructureRepair(b,dt) {
    if(!b.repairing||!active(b))return;
    const price=repairPrice(b),available=Math.max(0,money(b.team));
    const healed=Math.min(b.maxHp-b.hp,25*dt,available/price);
    if(healed>0){spend(b.team,Math.min(available,healed*price));b.hp=Math.min(b.maxHp,b.hp+healed);}
    if(b.maxHp-b.hp<1e-7){b.hp=b.maxHp;b.repairing=false;}
  }
  const serviceCompatible=(b,u)=>Boolean(STRUCTURE[b.kind]?.serviceRange&&u?.type==='unit'&&u.team===b.team&&u.hp>0&&!isAir(u)&&!UNIT[u.kind].infantry&&(b.kind==='shipyard'?isNaval(u):!isNaval(u)));
  function updateYardRepairs(dt){
    const serviced=new Set();
    for(const b of buildings){
      const def=STRUCTURE[b.kind];if(!def.serviceRange)continue;
      b.repairTarget=null;
      if(!active(b)||!baseOf(b.team)||money(b.team)<=0)continue;
      let target=null;
      for(const u of units)if(serviceCompatible(b,u)&&u.hp<u.maxHp&&!serviced.has(u.id)&&u.mesh.position.distanceTo(b.exitPoint)<=def.serviceRange&&(!target||u.hp/u.maxHp<target.hp/target.maxHp))target=u;
      if(!target)continue;
      const available=Math.max(0,money(b.team)),price=UNIT[target.kind].cost*.5/target.maxHp;
      const healed=Math.min(target.maxHp-target.hp,def.serviceRate*dt*(powerFor(b.team).low?.5:1),available/price);
      if(healed>0){spend(b.team,Math.min(available,healed*price));target.hp=Math.min(target.maxHp,target.hp+healed);b.repairTarget=target;serviced.add(target.id);}
    }
  }
  function orderYardRepair(b,squad,team){
    const compatible=squad.filter(u=>serviceCompatible(b,u)),reserved=[];
    if(!compatible.length){announce(b.kind==='shipyard'?'Naval shipyards repair ships only.':'War factories repair ground vehicles, including miners.');return;}
    if(!active(b)){announce('Complete the repair building first.');return;}
    for(const u of compatible){
      let spot=null;
      for(const r of [0,2.5,4]){
        for(let i=0;i<(r?16:1);i++){
          const a=i*Math.PI/8,p=b.exitPoint.clone().add(new THREE.Vector3(Math.sin(a)*r,0,Math.cos(a)*r));
          if(!blocked(p.x,p.z,u.radius,isNaval(u))&&reserved.every(v=>p.distanceTo(v.p)>u.radius+v.radius+.3)&&units.every(v=>v===u||v.hp<=0||isAir(v)||p.distanceTo(v.mesh.position)>u.radius+v.radius+.3)){spot=p;break;}
        }
        if(spot)break;
      }
      // An arriving group may fill the bay; leave other orders intact until space opens.
      if(!spot)continue;
      reserved.push({p:spot,radius:u.radius});clearRoute(u);u.supportIds=[];u.mining=false;u.attackTarget=null;u.destination=spot;
    }
    announce(reserved.length?'Moving to repair bay. Repairs use credits automatically.':'Repair bay is crowded. Move nearby units to clear space.');
  }
  function makeWayForExit(base,kind,origin) {
    if(elapsed<(base.clearExitAt||0))return;
    base.clearExitAt=elapsed+.5;
    const def=UNIT[kind],forward=origin.clone().sub(base.mesh.position).setY(0);
    if(forward.lengthSq()<.01)forward.set(0,0,base.mesh.position.z>0?-1:1);else forward.normalize();
    const side=new THREE.Vector3(forward.z,0,-forward.x);
    const sameLayer=u=>Boolean(def.aircraft)===isAir(u)&&Boolean(def.naval)===isNaval(u);
    const inLane=(p,r)=>{
      const offset=p.clone().sub(origin).setY(0),along=offset.dot(forward);
      return along>-def.radius-r-.6&&along<5+def.radius+r&&Math.abs(offset.dot(side))<def.radius+r+.6;
    };
    const blockers=units.filter(u=>u.hp>0&&u.team===base.team&&sameLayer(u)&&inLane(u.mesh.position,u.radius)&&!u.exitYield&&elapsed>=(u.exitPriorityUntil||0));
    for(const u of blockers){
      const preferred=u.mesh.position.clone().sub(origin).dot(side)>=0?1:-1;
      let point=null;
      for(const lateral of [def.radius+u.radius+1,def.radius+u.radius+3,def.radius+u.radius+5]){
        for(const sign of [preferred,-preferred]){
          for(const along of [0,3,6,-2]){
            const candidate=origin.clone().addScaledVector(side,lateral*sign).addScaledVector(forward,along);
            candidate.y=u.mesh.position.y;
            if(inLane(candidate,u.radius)||Math.abs(candidate.x)>HALF_X-u.radius||Math.abs(candidate.z)>HALF_Z-u.radius)continue;
            if(!isAir(u)&&(blocked(candidate.x,candidate.z,u.radius,isNaval(u))||!clearSegment(u.mesh.position,candidate,u.radius,isNaval(u))))continue;
            if(units.some(v=>v!==u&&v.hp>0&&sameLayer(v)&&(Math.hypot(candidate.x-v.mesh.position.x,candidate.z-v.mesh.position.z)<u.radius+v.radius+.4||v.exitYield&&candidate.distanceTo(v.exitYield.point)<u.radius+v.radius+.4)))continue;
            point=candidate;break;
          }
          if(point)break;
        }
        if(point)break;
      }
      if(!point)continue;
      // Keep mining, attack and escort orders. Only an idle/arriving parking position moves aside.
      if(!u.mining&&!u.attackTarget&&!u.supportIds?.length&&u.destination&&inLane(u.destination,u.radius))u.destination=point.clone();
      u.exitYield={point,until:elapsed+6};clearRoute(u);
    }
  }
  function updateExitYield(u,dt) {
    if(!u.exitYield)return false;
    const yielding=u.exitYield;
    if(elapsed>=yielding.until||moveToward(u,yielding.point,dt,.3)){u.exitYield=null;clearRoute(u);}
    u.state='Clearing production exit';return true;
  }
  function spawnUnit(kind, team, producerId=null) {
    const base=buildings.find(b=>b.id===producerId&&b.team===team&&b.kind===UNIT[kind].producer&&active(b))||producerFor(kind,team);if(!base)return null;
    const def=UNIT[kind],candidates=[];
    if(base.exitPoint){
      // Units use the marked front door, never an arbitrary side of the building.
      if(def.aircraft)candidates.push(base.mesh.position.clone());
      else candidates.push(base.exitPoint.clone());
    }else for(let i=0;i<48;i++){const a=i*Math.PI/12;candidates.push(base.mesh.position.clone().add(new THREE.Vector3(Math.sin(a)*5.4,0,Math.cos(a)*5.4)));}
    const legal=candidates.filter(p=>def.aircraft||!blocked(p.x,p.z,def.radius,Boolean(def.naval)));
    const point=legal.find(p=>units.every(u=>u.hp<=0||Boolean(def.aircraft)!==isAir(u)||Boolean(def.naval)!==isNaval(u)||Math.hypot(u.mesh.position.x-p.x,u.mesh.position.z-p.z)>u.radius+def.radius+.2));
    if(legal.length)makeWayForExit(base,kind,point||legal[0]);
    if(!point)return null; // A finished unit waits safely when the exit is occupied.
    const u=createUnit(kind,team,point.x,point.z);
    u.exitPriorityUntil=elapsed+4;
    if(def.aircraft)u.mesh.position.y=.5;
    if(base.exitPoint){u.destination=(base.rallyPoint||base.exitPoint.clone().add(base.exitPoint.clone().sub(base.mesh.position).setY(0).normalize().multiplyScalar(4))).clone();}
    if(kind==='miner')assignMining(u);
    return u;
  }
  function setRally(point,producers,team=localTeam){
    if(!point||Math.abs(point.x)>HALF_X-2||Math.abs(point.z)>HALF_Z-2)return;
    const own=producers.filter(b=>b.team===team&&isProducer(b)&&active(b));if(!own.length)return;
    if(own.some(b=>b.kind!=='airfield'&&blocked(point.x,point.z,b.kind==='shipyard'?1.8:.9,b.kind==='shipyard'))){announce('Set a rally point on clear water for ships or clear ground for land units.');return;}
    if(sendAction({type:'rally',ids:own.map(b=>b.id),point:{x:point.x,z:point.z}}))return;
    for(const b of own)b.rallyPoint=new THREE.Vector3(point.x,0,point.z);
    announce('Rally point set. New units will leave the marked exit and move there.');
  }
  function placementError(kind, point, team = localTeam) {
    const def = STRUCTURE[kind], base = baseOf(team);
    const requirement=prerequisiteMessage(kind,team);if(requirement)return requirement;
    if (!point || !base) return 'Point at the battlefield.';
    if (!fog.at(team,point.x,point.z)) return 'Scout this territory before building here.';
    if (money(team) < def.cost) return 'Not enough credits.';
    if (Math.abs(point.x) + def.radius > HALF_X - 1 || Math.abs(point.z) + def.radius > HALF_Z - 1) return 'Keep the structure inside the island.';
    if(kind==='shipyard'){
      if(!MAP.water.length)return 'Choose a water map to build a navy.';
      if(!terrainAllows(point.x,point.z,def.radius,true))return 'Place the shipyard fully in water near shore.';
      if(MAP.bridges.some(b=>FIELD_MAP.inside(b,point.x,point.z,-def.radius-6)))return 'Keep the bridge and its approaches clear.';
      let shore=false;for(let i=0;i<16;i++){const a=i*Math.PI/8;if(!waterAt(point.x+Math.cos(a)*7,point.z+Math.sin(a)*7))shore=true;}
      if(!shore)return 'Build the shipyard closer to shore.';
      const exit=navalExit(point);if(!exit||blocked(exit.x,exit.z,2,true)||fields.some(f=>Math.hypot(exit.x-f.mesh.position.x,exit.z-f.mesh.position.z)<3.5))return 'Leave open water at the shipyard exit.';
    }else{
      if(!terrainAllows(point.x,point.z,def.radius)||waterAt(point.x,point.z))return 'This structure requires dry land.';
      if(MAP.bridges.some(b=>FIELD_MAP.inside(b,point.x,point.z,-def.radius-6)))return 'Keep bridge approaches clear.';
    }
    if (terrainBlocked(point.x,point.z,def.radius)) return 'Rocky ridges cannot support buildings.';
    if (!inConstructionTerritory(point,team)) return 'Outside construction territory. Complete a building closer to this location.';
    if (buildings.some(b => b.hp > 0 && b.mesh.position.distanceTo(point) < b.radius + def.radius + 1.6)) return 'Leave room between structures.';
    if (fields.some(f => f.mesh.position.distanceTo(point) < def.radius + 3.5)) return 'Leave the ore field clear.';
    if (units.some(u => !isAir(u) && u.mesh.position.distanceTo(point) < u.radius + def.radius + .4)) return 'Move vehicles out of the construction area.';
    if(buildings.some(b=>b.hp>0&&b.exitPoint&&Math.hypot(point.x-b.exitPoint.x,point.z-b.exitPoint.z)<def.radius+1.6))return 'Keep production exits clear.';
    if(['warFactory','garrison','airfield'].includes(kind)){
      const exit=point.clone().add(new THREE.Vector3(0,0,(point.z>0?-1:1)*(def.radius+2.2)));
      if(blocked(exit.x,exit.z,1.3)||fields.some(f=>Math.hypot(exit.x-f.mesh.position.x,exit.z-f.mesh.position.z)<3.5))return 'Leave clear ground in front of the production exit.';
    }
    if (kind !== 'power' && buildings.filter(b => b.team === team && b.kind === kind && b.hp > 0).length >= 6) return `Limit: 6 ${def.name.toLowerCase()} structures.`;
    return '';
  }
  function cancelPlacement() { placement = null; placementPoint = null; ghost.visible = false; territoryGuide.visible=false; $('cancel-build').hidden = true; $('build-status').textContent = ''; }
  function beginPlacement(kind) {
    if (outcome) return;
    const requirement=prerequisiteMessage(kind,localTeam);if(requirement){announce(requirement);return;}
    placement = kind; placementPoint = null; ghost.visible = false;
    $('cancel-build').hidden = false; $('build-status').textContent = `Place ${STRUCTURE[kind].name.toLowerCase()} · green = valid`;
    updateTerritoryGuide(); announce('Build inside the mint territory. Completed structures extend it. Escape cancels.');
  }
  function placeBuilding(point, kind = placement, team = localTeam) {
    if (!BUILDABLE.includes(kind)) return;
    const error = placementError(kind, point, team);
    if (error) { announce(error); return; }
    if (sendAction({ type: 'build', kind, point: { x: point.x, z: point.z } })) { cancelPlacement(); return; }
    spend(team, STRUCTURE[kind].cost); createBuilding(kind, team, point.x, point.z, true);
    if (team === localTeam) cancelPlacement(); announce(`${STRUCTURE[kind].name} under construction.`); updateUI();
  }

  // 6. INPUT AND SELECTION. Raycast either a unit, building, ore field, or the ground.
  function setSelection(list) {
    selected = new Set(list.filter(e => e.team === localTeam && e.hp > 0));
    const building = selected.size === 1 ? [...selected][0] : null;
    if (building && isBuilding(building) && Object.values(UNIT).some(def => def.producer === building.kind)) {
      $('play-tab').click();
      filterRoster({ garrison: 'infantry', airfield: 'air', shipyard: 'navy' }[building.kind] || null, building.kind);
    }
    living().forEach(e => e.ring.visible = selected.has(e)); updateUI();
  }
  function selectArmy() { setSelection(combatUnits(localTeam)); }
  function selectMiners() { setSelection(friendlyUnits().filter(u => u.kind === 'miner')); }
  function harvestSelected(squad = [...selected]) {
    if (sendAction({ type: 'harvest', ids: squad.map(u => u.id) })) return;
    const miners = squad.filter(u => u.kind === 'miner');
    miners.forEach(u => assignMining(u)); announce(miners.length ? `${miners.length} miners assigned to ore.` : 'Select a miner first.');
  }
  function stopSelected(squad = [...selected]) {
    if (sendAction({ type: 'stop', ids: squad.map(u => u.id) })) return;
    squad.forEach(u => { if (u.type !== 'unit') return; u.exitYield=null;u.destination = null; u.attackTarget = null; u.supportIds=[];u.mining = false; u.raid = false; clearRoute(u); });
    announce('Orders cleared. Combat vehicles will defend their position.');
  }
  const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    let entity = null;
    for (const hit of raycaster.intersectObjects([...actors.children, ...deposits.children], true)) {
      let obj = hit.object;
      if (obj === obj.parent?.userData?.entity?.ring) continue;
      while (obj && !obj.userData.entity) obj = obj.parent;
      const e = obj?.userData.entity;
      if (e && visibleTo(e) && (e.hp > 0 || e.type === 'ore')) { entity = e; break; }
    }
    const point = raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3());
    if (!entity && point) entity = fields.find(f => visibleTo(f) && point.distanceTo(f.mesh.position) < 2.5) || null;
    return { entity, point };
  }
  function issueOrder(point, target = null, selection = [...selected], team = localTeam) {
    if(target&&!visibleTo(target,team))target=null;
    const squad = selection.filter(e => e.type === 'unit');
    if(outcome||!point)return;
    if(!squad.length){setRally(point,selection,team);return;}
    if(target&&hostile(team,target.team)&&squad.every(u=>!canAttack(u,target))){announce(isAir(target)?'These units cannot attack aircraft. Use interceptors or missiles.':'Interceptors attack aircraft only.');return;}
    if (Math.abs(point.x) > HALF_X || Math.abs(point.z) > HALF_Z) { announce('Give orders inside the island.'); return; }
    if (sendAction({ type: 'order', ids: squad.map(u => u.id), point: { x: point.x, z: point.z }, targetId: target?.id || null })) return;
    squad.forEach(u=>{u.exitYield=null;});
    if(target?.team===team&&isBuilding(target)&&STRUCTURE[target.kind].serviceRange){orderYardRepair(target,squad,team);return;}
    const escorts=squad.filter(u=>u.kind!=='repair'&&!isAir(u)&&!isNaval(u)&&stats(u).damage>0);
    if(!escorts.length&&target?.team===team&&target.type==='unit'&&!isAir(target)&&!isNaval(target)&&stats(target).damage>0)escorts.push(target);
    const crawlers=squad.filter(u=>u.kind==='repair');
    const formation=escorts.length?squad.filter(u=>u.kind!=='repair'):squad;
    const columns = Math.ceil(Math.sqrt(formation.length));
    formation.forEach((u, i) => {
      clearRoute(u);
      u.supportIds=[];
      if(isNaval(u)&&!hostile(team,target?.team)&&!terrainAllows(point.x,point.z,u.radius,true)){u.destination=null;u.attackTarget=null;return;}
      if (u.kind === 'miner' && target?.type === 'ore') { assignMining(u, target); return; }
      if (u.kind === 'miner' && target?.kind === 'refinery' && target.team === team) {
        u.mining = true; u.mineState = 'return'; u.destination = null; u.preferredRefinery = target;
        u.mineAccess=null;u.mineRetry=null;u.mineAvoid=null;u.unload=0;return;
      }
      u.mining = false;
      u.attackTarget = hostile(team,target?.team) && canAttack(u,target) ? target : null;
      u.destination = u.attackTarget ? null : new THREE.Vector3(
        THREE.MathUtils.clamp(point.x + (i % columns - (columns - 1) / 2) * 2.65, -HALF_X + 2, HALF_X - 2), 0,
        THREE.MathUtils.clamp(point.z + (Math.floor(i / columns) - (Math.ceil(formation.length / columns) - 1) / 2) * 2.65, -HALF_Z + 2, HALF_Z - 2));
    });
    if(escorts.length)crawlers.forEach((u,i)=>setRepairEscort(u,escorts,point,(i-(crawlers.length-1)/2)*2.4));
    if(team===localTeam){const marker = ring(effects, targetRing, target && isBuilding(target) ? target.radius : 1.2);
    marker.position.set(point.x,waterAt(point.x,point.z)?.24+bridgeHeight(point.x,point.z):.09,point.z); markers.push({ mesh: marker, life: 1.2 });}
    announce(squad.some(isNaval)&&!waterAt(point.x,point.z)&&!hostile(team,target?.team)?'Ships need a destination in water.':target?.type === 'ore' ? 'Miners assigned to ore. Cargo is delivered automatically.' : hostile(team,target?.team) ? 'Attack order confirmed.' : 'Move order confirmed.');
  }
  let drag = null, pointer = null;
  const controlGroups = new Map();
  let lastGroup = '', lastGroupTime = 0;
  function onScreen(e) {
    const p = screenPosition(e.mesh.position), r = canvas.getBoundingClientRect();
    return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  }
  function matchingSelection(entity, additive) {
    const matches = friendlyUnits().filter(u => u.kind === entity.kind && onScreen(u));
    setSelection(additive ? [...selected, ...matches] : matches);
  }
  function panPixels(dx, dy) {
    const scale = view.span / Math.max(1, canvas.clientHeight);
    view.x = THREE.MathUtils.clamp(view.x - (dx * Math.cos(view.yaw) + dy * Math.sin(view.yaw) / .78) * scale, -HALF_X + 4, HALF_X - 4);
    view.z = THREE.MathUtils.clamp(view.z - (-dx * Math.sin(view.yaw) + dy * Math.cos(view.yaw) / .78) * scale, -HALF_Z + 2, HALF_Z - 2);
    updateCamera();
  }
  function finishPointer() { drag = null; $('selection-box').hidden = true; }
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.focus({ preventScroll: true }); if (![0, 1, 2].includes(e.button)) return;
    e.preventDefault();
    drag = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey, touch: e.pointerType === 'touch', panned: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    pointer = { x: e.clientX, y: e.clientY };
    if (drag && (drag.button === 1 || drag.button === 2) && !placement) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7) drag.panned = true;
      if (drag.panned) { panPixels(e.clientX - drag.lastX, e.clientY - drag.lastY); canvas.style.cursor = 'grabbing'; }
      drag.lastX = e.clientX; drag.lastY = e.clientY; return;
    }
    const hit = pick(e.clientX, e.clientY);
    if (placement) {
      placementPoint = hit.point;
      if (placementPoint) {
        ghost.visible = true; ghost.position.copy(placementPoint); ghost.position.y = .6;
        ghost.scale.set(STRUCTURE[placement].radius, 1.2, STRUCTURE[placement].radius);
        const error = placementError(placement, placementPoint); ghostMat.color.set(error ? '#ff675c' : '#9dffc6');
        canvas.style.cursor = error ? 'not-allowed' : 'copy';
        $('build-status').textContent = error || `Left-click to deploy · ${STRUCTURE[placement].cost} credits`;
      }
      return;
    }
    const canOrder = [...selected].some(u => u.type === 'unit' || isProducer(u));
    canvas.style.cursor = hit.entity?.team === localTeam ? 'pointer' : canOrder && [...selected].some(u => u.type === 'unit' && UNIT[u.kind].damage > 0) && hostile(localTeam,hit.entity?.team) ? 'crosshair' : canOrder && hit.entity?.type === 'ore' && [...selected].some(u => u.kind === 'miner') ? 'copy' : canOrder ? 'cell' : 'default';
    if (!drag || drag.button !== 0 || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7) return;
    const rect = canvas.getBoundingClientRect(), box = $('selection-box'); box.hidden = false;
    Object.assign(box.style, { left: `${Math.min(e.clientX, drag.x) - rect.left}px`, top: `${Math.min(e.clientY, drag.y) - rect.top}px`, width: `${Math.abs(e.clientX - drag.x)}px`, height: `${Math.abs(e.clientY - drag.y)}px` });
  });
  canvas.addEventListener('pointerleave', () => { pointer = null; ghost.visible = false; });
  canvas.addEventListener('pointerup', e => {
    if (!drag) return;
    const down = drag; finishPointer(); canvas.style.cursor = 'default';
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (down.panned || down.button === 1) return;
    const hit = pick(e.clientX, e.clientY);
    if (placement) { if (down.button === 2) cancelPlacement(); else if (hit.point) placeBuilding(hit.point); return; }
    if (down.button === 2) {
      if (selected.size && hit.point) issueOrder(hit.entity ? hit.entity.mesh.position.clone() : hit.point, hit.entity);
      return;
    }
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) {
      const found = friendlyUnits().filter(u => {
        const p = screenPosition(u.mesh.position.clone().add(new THREE.Vector3(0, .5, 0)));
        return p.x >= Math.min(down.x, e.clientX) && p.x <= Math.max(down.x, e.clientX) && p.y >= Math.min(down.y, e.clientY) && p.y <= Math.max(down.y, e.clientY);
      });
      setSelection(down.shift ? [...selected, ...found] : found); return;
    }
    if (down.touch && selected.size && hit.entity?.team !== localTeam && hit.point) { issueOrder(hit.entity ? hit.entity.mesh.position.clone() : hit.point, hit.entity); return; }
    if (hit.entity?.team === localTeam) {
      if (down.ctrl && hit.entity.type === 'unit') { matchingSelection(hit.entity, down.shift); return; }
      const list = new Set(down.shift ? selected : []);
      list.has(hit.entity) ? list.delete(hit.entity) : list.add(hit.entity); setSelection([...list]);
    } else {
      if (!down.shift) setSelection([]);
      if (hit.entity?.type === 'ore') announce(`${hit.entity.name}: ${Math.ceil(hit.entity.amount)} ore remaining. Right-click with miners selected to harvest.`);
    }
  });
  canvas.addEventListener('dblclick', e => {
    if (e.button !== 0 || placement) return;
    const entity = pick(e.clientX, e.clientY).entity;
    if (entity?.team === localTeam && entity.type === 'unit') matchingSelection(entity, e.shiftKey);
  });
  canvas.addEventListener('pointercancel', finishPointer);
  window.addEventListener('blur', () => { finishPointer(); pointer = null; });

  // Radar uses the same world coordinates as the battlefield and network orders.
  const radar = $('radar'), radarContext = radar.getContext('2d');
  const radarPoint = (x, z) => ({ x: (x + HALF_X) / (HALF_X * 2) * radar.width, y: (z + HALF_Z) / (HALF_Z * 2) * radar.height });
  function radarWorld(e) {
    const rect = radar.getBoundingClientRect();
    return new THREE.Vector3(THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1) * HALF_X * 2 - HALF_X, 0, THREE.MathUtils.clamp((e.clientY - rect.top) / rect.height, 0, 1) * HALF_Z * 2 - HALF_Z);
  }
  function radarPan(e) { const p = radarWorld(e); view.x = p.x; view.z = p.z; updateCamera(); }
  radar.addEventListener('contextmenu', e => e.preventDefault());
  radar.addEventListener('pointerdown', e => {
    e.preventDefault(); radar.focus();
    if (e.button === 0) { radar.setPointerCapture(e.pointerId); radarPan(e); }
    if (e.button === 2 && !placement) {
      const p = radarWorld(e), target = [...living(), ...fields].find(u => visibleTo(u) && u.mesh.position.distanceTo(p) < (u.radius || 2.5));
      issueOrder(p, target);
    }
  });
  radar.addEventListener('pointermove', e => { if (radar.hasPointerCapture(e.pointerId) && (e.buttons & 1)) radarPan(e); });
  radar.addEventListener('pointerup', e => { if (radar.hasPointerCapture(e.pointerId)) radar.releasePointerCapture(e.pointerId); });
  function drawRadar() {
    const ctx = radarContext, w = radar.width, h = radar.height;
    ctx.fillStyle = '#18271f'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2c4031'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += w / 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += h / 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const sight=fog.team(localTeam);
    for(let z=0;z<fog.height;z++)for(let x=0;x<fog.width;x++){const i=z*fog.width+x;const px=x*fog.size+1-HALF_X,pz=z*fog.size+1-HALF_Z,rock=terrainBlocked(px,pz),sea=waterAt(px,pz),bridge=sea&&terrainAllows(px,pz,0);ctx.fillStyle=sight.visible[i]?(bridge?'#c1bda2':sea?'#397d99':rock?'#9c9c88':'#496044'):sight.seen[i]?(sea?'#1d3e51':rock?'#53584d':'#27362e'):'#05090d';ctx.fillRect(x*w/fog.width,z*h/fog.height,w/fog.width+1,h/fog.height+1);}
    for (const f of fields) if (f.amount > 0 && fog.at(localTeam,f.mesh.position.x,f.mesh.position.z,true)) { const p = radarPoint(f.mesh.position.x, f.mesh.position.z); ctx.fillStyle = '#e6c764'; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
    for (const u of living().filter(e=>visibleTo(e))) { const p = radarPoint(u.mesh.position.x, u.mesh.position.z), size = isBuilding(u) ? 6 : 3; ctx.fillStyle = selected.has(u) ? '#ffffff' : teamColors[u.team]; if(isAir(u)){ctx.beginPath();ctx.moveTo(p.x,p.y-4);ctx.lineTo(p.x+3,p.y+3);ctx.lineTo(p.x-3,p.y+3);ctx.closePath();ctx.fill();}else ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size); }
    ctx.strokeStyle = '#f4ecc0'; ctx.lineWidth = 1.5; ctx.beginPath();
    let first = true;
    for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera); const v = raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3());
      if (!v) continue; const p = radarPoint(v.x, v.z); first ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); first = false;
    }
    ctx.closePath(); ctx.stroke();
    const center = radarPoint(view.x, view.z); ctx.fillStyle = '#fff6cc'; ctx.fillRect(center.x - 1, center.y - 1, 2, 2);
  }
  canvas.addEventListener('wheel', e => { e.preventDefault(); view.span = THREE.MathUtils.clamp(view.span + e.deltaY * .035, 22, Math.max(85, fitSpan() * 1.35)); updateCamera(); }, { passive: false });

  function syncVoiceState(){window.FieldVoice?.setActive(!paused&&!winner&&(!net?.active||net.playable));}
  function updatePause() { syncVoiceState();$('pause').textContent = paused ? 'Resume' : 'Pause'; $('pause').setAttribute('aria-pressed', String(paused)); }
  function togglePause() { if (sendAction({ type: 'pause' })) return; paused = !paused; updatePause(); }
  $('select-all').onclick = selectArmy; $('select-miners').onclick = selectMiners; $('harvest').onclick = () => harvestSelected(); $('stop').onclick = () => stopSelected();
  $('pause').onclick = togglePause; $('reset').onclick = $('play-again').onclick = () => { if (net?.active) { if (net.isHost && outcome) net.control('rematch'); else net.open(); } else openMapSetup(); };
  $('structure-repair').onclick=()=>{const b=[...selected][0];repairStructure(b,!b?.repairing);};
  $('structure-sell').onclick=()=>sellStructure([...selected][0]);
  $('home').onclick = homeCamera;
  $('zoom-in').onclick = () => { view.span = Math.max(22, view.span - 5); updateCamera(); };
  $('zoom-out').onclick = () => { view.span = Math.min(Math.max(85, fitSpan() * 1.35), view.span + 5); updateCamera(); };
  $('cancel-build').onclick = cancelPlacement;
  for (const which of ['play', 'build', 'defense', 'learn']) $(`${which}-tab`).onclick = () => {
    for (const panel of ['play', 'build', 'defense', 'learn']) {
      $(`${panel}-panel`).hidden = panel !== which; $(`${panel}-tab`).classList.toggle('active', panel === which); $(`${panel}-tab`).setAttribute('aria-pressed', String(panel === which));
    }
    cancelPlacement();
    $('catalog-help').textContent = which === 'play' ? 'Left-click to produce. Right-click a unit icon to cancel one of that type and refund it.' : which === 'learn' ? 'Explore the renderer and simulation with the learning tools.' : 'Choose a blueprint, then left-click the battlefield to deploy. Right-click cancels placement.';
    document.querySelector('.sidebar').scrollTop = 0;
  };
  $('wireframe').onchange = e => materials.forEach(m => m.wireframe = e.target.checked);
  $('graphics-quality').onchange = () => { applyGraphics(); try {localStorage.setItem('iron-field-graphics',$('graphics-quality').value);} catch {} };
  $('grid').onchange = e => grid.visible = e.target.checked;
  $('perspective').onchange = e => { camera = e.target.checked ? perspective : ortho; updateCamera(); };
  $('speed').oninput = e => { simSpeed = Number(e.target.value); $('speed-value').textContent = `${simSpeed}×`; };
  $('opponent-style').value=opponentStyle;
  window.addEventListener('field-ai-change',event=>{
    if(event.detail?.reason==='ready'){
      if(!currentModelPlan()&&!commander.pending)commander.nextModel=0;
    }else{modelRequest?.abort();modelRequest=null;commander=resetCommander();}
    updateUI();
  });
  $('opponent-style').onchange=e=>{
    if(net?.active)return;
    opponentStyle=e.target.value;
    try{localStorage.setItem('iron-field-opponent',opponentStyle);}catch{}
    modelRequest?.abort();modelRequest=null;aiRegroup();commander=resetCommander();
    nextRaid=elapsed+aiPolicy().firstRaid;
    announce(`${isModelOpponent()?modelProvider()+' AI':aiPolicy().name} selected. New strategy takes effect now.`);updateUI();
  };
  $('raids').onchange = e => {
    raids = e.target.checked; nextRaid = elapsed + aiPolicy().firstRaid;
    modelRequest?.abort();modelRequest=null;commander={...commander,pending:false,plan:null,nextModel:0,modelStatus:''};
    if (!raids) { aiRegroup(); unitsFor('enemy').forEach(u => {u.aiControlled=false;u.aiRetreat=false;u.raid=false;u.attackTarget=null;u.destination=null;clearRoute(u);if(u.kind==='miner'){u.aiFleeUntil=0;assignMining(u);}}); }
    announce(raids ? 'Computer strategy and raids enabled.' : 'Raids and reinforcements disabled. Enemies still defend their base.');
  };
  $('filter-all').textContent = `All · ${Object.keys(UNIT).length}`;
  const rosterRoles = { armor: ['scout', 'tank', 'heavy', 'tesla', 'flame'], siege: ['artillery', 'destroyer', 'rocket'], support: ['miner', 'repair'], infantry: ['rifleman', 'rocketTrooper', 'sniper'], air:['gunship','interceptor','bomber'],navy:['patrolBoat','frigate','battleship'] };
  function filterRoster(role = 'all', producer = null) {
    for (const tab of ['all', 'armor', 'siege', 'support', 'infantry', 'air', 'navy']) { $(`filter-${tab}`).classList.toggle('active', tab === role); $(`filter-${tab}`).setAttribute('aria-pressed', String(tab === role)); }
    for (const [kind, def] of Object.entries(UNIT)) $(`train-${kind}`).hidden = producer ? def.producer !== producer : role !== 'all' && !rosterRoles[role].includes(kind);
    $('production-heading').textContent = producer ? `${STRUCTURE[producer].name} · Units` : 'Unit production';
    $('unit-catalog').scrollTop = 0;
  }
  for (const role of ['all', 'armor', 'siege', 'support', 'infantry', 'air', 'navy']) $(`filter-${role}`).onclick = () => filterRoster(role);
  for (const [kind, def] of Object.entries(UNIT)) {
    const button = document.createElement('button'); button.id = `train-${kind}`; button.className = 'unit-option';
    const role = kind === 'miner' ? `Harvests ore · carries ${def.capacity} credits · unarmed` : def.role;
    button.className = 'build-card';
    button.innerHTML = `<span class="portrait">${FIELD_PORTRAIT(kind)}<b class="build-count" hidden></b><span class="card-progress"></span></span><strong>${def.name}</strong><span class="card-meta"><em>$${def.cost}</em><small>${def.time}s</small></span><span class="card-state">READY</span>`;
    button.title = `${def.name} — ${role}. Left-click to queue; right-click to cancel one.`;
    button.onmouseenter = button.onfocus = () => $('catalog-help').textContent = `${def.name} · ${role} · Requires ${STRUCTURE[def.producer].name} · $${def.cost} · ${def.time}s. RMB cancels one of this type.`;
    button.onclick = () => queueUnit(kind);
    button.oncontextmenu = e => { e.preventDefault(); cancelQueue(localTeam, kind); };
    $('unit-catalog').append(button);
  }
  for (const kind of BUILDABLE) {
    const def = STRUCTURE[kind], button = document.createElement('button'); button.id = `build-${kind}`; button.className = 'build-card';
    button.innerHTML = `<span class="portrait">${FIELD_PORTRAIT(kind)}<b class="build-count" hidden></b><span class="card-progress"></span></span><strong>${def.name}</strong><span class="card-meta"><em>$${def.cost}</em><small>${def.time}s</small></span><span class="card-state">DEPLOY</span>`;
    if (def.defense) button.querySelector('.card-meta small').textContent = `${def.time}s · ${def.load}⚡`;
    button.title = `${def.name} — ${def.description}${def.range ? ` · Range ${def.range}` : ''}`;
    button.onmouseenter = button.onfocus = () => $('catalog-help').textContent = `${def.name} · ${def.description}${def.range ? ` · Range ${def.range}` : ''} · $${def.cost}. Left-click to choose a footprint; right-click to cancel.`;
    button.onclick = () => beginPlacement(kind); button.oncontextmenu = e => { e.preventDefault(); cancelPlacement(); };
    $(def.defense ? 'defense-catalog' : 'building-catalog').append(button);
  }
  function useGroup(number, assign = false) {
    if (assign) { controlGroups.set(number, [...selected].filter(u => u.type === 'unit').map(u => u.id)); announce(`Control group ${number} assigned.`); }
    else {
      const squad = (controlGroups.get(number) || []).map(id => units.find(u => u.id === id && u.team === localTeam && u.hp > 0)).filter(Boolean);
      setSelection(squad);
      if (lastGroup === number && performance.now() - lastGroupTime < 400 && squad.length) {
        view.x = squad.reduce((sum, u) => sum + u.mesh.position.x, 0) / squad.length; view.z = squad.reduce((sum, u) => sum + u.mesh.position.z, 0) / squad.length; updateCamera();
      }
      lastGroup = number; lastGroupTime = performance.now();
    }
    updateUI();
  }
  for (let i = 1; i <= 9; i++) $(`group-${i}`).onclick = e => useGroup(String(i), e.ctrlKey || e.metaKey);
  window.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.closest('dialog')) return;
    if (/^Digit[1-9]$/.test(e.code)) { e.preventDefault(); if (!e.repeat) useGroup(e.code.slice(-1), e.ctrlKey || e.metaKey); return; }
    if (e.target.tagName === 'BUTTON' && ['Space', 'Enter'].includes(e.code)) return;
    if (['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyF','KeyM','KeyH','KeyX','KeyT','Space','Escape'].includes(e.code)) { e.preventDefault(); keys.add(e.code); }
    if (e.repeat) return;
    if (e.code === 'KeyF') selectArmy(); if (e.code === 'KeyM') selectMiners(); if (e.code === 'KeyH') harvestSelected();
    if (e.code === 'KeyT') queueUnit('tank'); if (e.code === 'KeyX') stopSelected(); if (e.code === 'Space') togglePause();
    if (e.code === 'Escape') { cancelPlacement(); setSelection([]); }
  });
  window.addEventListener('keyup', e => keys.delete(e.code)); window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => { keys.clear(); lastTime = performance.now(); });

  // 7. COMBAT. Unit definitions control weapons; artillery impacts a fixed point.
  const distance = (a, b) => Math.hypot(a.mesh.position.x-b.mesh.position.x,a.mesh.position.z-b.mesh.position.z);
  const reach = (attacker, target) => stats(attacker).range + (isBuilding(target) ? target.radius * .65 : 0);
  function closestEnemy(e, range) {
    let best = range, result = null;
    for (const other of living()) {
      if (other.team === e.team || !canAttack(e,other) || !visibleTo(other,e.team)) continue;
      const d = distance(e, other) - (isBuilding(other) ? other.radius * .65 : 0);
      if (d < best) { best = d; result = other; }
    }
    return result;
  }
  function explode(point, size = 1) {
    const m = new THREE.MeshBasicMaterial({ color: size > 1 ? '#ffb568' : '#fff0b0', transparent: true });
    const obj = mesh(burstGeometry, m, effects); obj.position.copy(point); obj.position.y += .9;
    bursts.push({ mesh: obj, life: .5, size });
  }
  function damage(e, amount, attackerTeam = null) {
    if (e.hp <= 0) return;
    if(amount>0&&hostile(e.team,attackerTeam))emitVoiceAlert(e.team,isBuilding(e)?'baseAttack':'unitsAttack');
    e.hp = Math.max(0, e.hp - amount); if (!e.hp) { awardBattleReward(e,attackerTeam); destroy(e); }
  }
  function destroy(e) {
    releaseUnitDamage(e);
    explode(e.mesh.position, isBuilding(e) ? 3 : 1.8); e.mesh.visible = false; e.label.remove(); e.selectionFrame?.remove(); selected.delete(e);
    units = units.filter(u => u.hp > 0); navVersion++;
    if (e.kind === 'base') {
      eliminated.push(e.team); queueFor(e.team).length=0;
      // Losing an HQ eliminates this army, but the remaining commanders keep playing.
      for(const ally of living().filter(a=>a.team===e.team)){releaseUnitDamage(ally);ally.hp=0;ally.mesh.visible=false;ally.label.remove();ally.selectionFrame?.remove();selected.delete(ally);}
      units=units.filter(u=>u.hp>0);
      const survivors=matchTeams.filter(t=>!eliminated.includes(t));
      if(survivors.length<=1)winner=survivors[0]||'draw';
      outcome=winner?(winner===localTeam?'victory':'defeat'):'';
      if(e.team===localTeam)cancelPlacement();
      showResult(); announce(winner?'Battle complete.':`${e.team===localTeam?'Your':'A rival'} HQ was destroyed. ${survivors.length} commanders remain.`);
    } else if (e.team === localTeam && (e.kind === 'miner' || e.kind === 'refinery')) announce(`${stats(e).name} lost. Enemy kills earn credits to help rebuild.`);
  }
  function showResult() {
    $('result').hidden=!winner;
    if(winner){$('result-title').textContent=outcome==='victory'?'Field secured.':'Command lost.';
      $('result-detail').textContent=outcome==='victory'?'All rival headquarters eliminated. You are the last commander standing.':'Your headquarters has fallen. The host can request a rematch after the battle.';}
  }
  // Damage projectiles remain host-owned. WeaponFX renders short-lived cosmetics on both peers.
  function projectile() { const obj = new THREE.Object3D(); effects.add(obj); return obj; }
  function muzzleOffset(e, side) {
    if(e.groundRig){const p=e.groundRig.muzzle;return [p[0]+side*e.groundRig.spread,p[1],p[2]];}
    const offsets = {
      patrolBoat:[0,.27,1.26],frigate:[side*.3,.47,.39],battleship:[side*.19,.27,1.26],
      rifleman:[.24,.35,1.1], sniper:[.27,.35,1.66], rocketTrooper:[.36,.63,1.23],
      artillery:[0,.59,2.47], destroyer:[0,.3,2.9], heavy:[side*.26,.3,1.6],
      rocket:[side*.55,.54,.96], missileBattery:[side*.64,.5,.98],
      tesla:[0,1.46,0], teslaCoil:[0,2.9,0], flame:[side*.26,.3,1.6],
      flameBunker:[side*.27,.05,1.6], turret:[side*.27,.15,1.55]
    };
    return offsets[e.kind] || [0,.3,1.6];
  }
  function fire(e, target) {
    if(!canAttack(e,target))return;
    const def = stats(e), visual = FIELD_WEAPONS.kinds[e.kind] || 'cannon', profile = FIELD_WEAPONS.profiles[visual];
    const weapon = def.weapon || (def.splash ? 'shell' : 'bullet');
    const aim = target.mesh.position.clone(); aim.y += isBuilding(target) ? 1.2 : (target.body?.position.y||0)+(UNIT[target.kind].infantry ? 1.1 : .8);
    const direction = aim.clone().sub(e.mesh.position); e.turret.rotation.y = Math.atan2(direction.x, direction.z);
    // Alternate paired barrels and rocket pods. Launch from their actual world-space tip.
    e.shotSide = -(e.shotSide || -1); const muzzle = muzzleOffset(e, e.shotSide);
    e.mesh.updateMatrixWorld(true);
    const origin = e.turret.localToWorld(new THREE.Vector3(...muzzle));
    const obj = projectile(); obj.position.copy(origin);
    const arc = visual === 'artillery' ? Math.min(8, origin.distanceTo(aim)*.38) : visual === 'rocket' ? 1.5 : 0;
    const duration = Math.max(.025, origin.distanceTo(aim) / profile.speed);
    shells.push({ id: nextShotId++, mesh: obj, target, team: e.team, damage: def.damage, splash: def.splash || 0, targetAir:isAir(target), weapon, visual, arc, origin, aim, age: 0, duration });
    emitWeaponEvent({type:'shot', shooterId:e.id, visual, origin:{x:origin.x,y:origin.y,z:origin.z}, aim:{x:aim.x,y:aim.y,z:aim.z}, muzzle, arc, duration});
    e.cooldown = def.reload * (isBuilding(e) && powerFor(e.team).low ? 2 : 1);
  }
  function setRepairEscort(u,escorts,point,slot=0) {
    const ids=escorts.filter(e=>e.hp>0&&e.team===u.team&&!isAir(e)&&!isNaval(e)&&stats(e).damage>0).map(e=>e.id);
    const changed=JSON.stringify(u.supportIds)!==JSON.stringify(ids);
    u.supportIds=ids;u.supportSlot=slot;u.attackTarget=null;u.supportCheck=0;
    const center=new THREE.Vector3();escorts.forEach(e=>center.add(e.mesh.position));center.divideScalar(Math.max(1,escorts.length));
    const heading=point.clone().sub(center);heading.y=0;
    if(heading.length()>2)u.supportHeading=heading.normalize();
    else u.supportHeading ||= new THREE.Vector3(Math.sin(escorts[0]?.body?.rotation.y||0),0,Math.cos(escorts[0]?.body?.rotation.y||0));
    if(changed){u.destination=null;clearRoute(u);}
  }
  function updateRepairEscort(u,dt) {
    if(!u.supportIds?.length)return;
    u.supportCheck=(u.supportCheck||0)-dt;if(u.supportCheck>0)return;u.supportCheck=.35;
    const escorts=units.filter(e=>u.supportIds.includes(e.id)&&e.team===u.team&&e.hp>0&&!isAir(e)&&!isNaval(e)&&stats(e).damage>0);
    if(!escorts.length){u.supportIds=[];u.destination=null;clearRoute(u);return;}
    const center=new THREE.Vector3();escorts.forEach(e=>center.add(e.mesh.position));center.divideScalar(escorts.length);
    const aims=escorts.map(e=>e.attackTarget?.hp>0?e.attackTarget.mesh.position:e.destination).filter(Boolean);
    if(aims.length){const heading=new THREE.Vector3();aims.forEach(p=>heading.add(p));heading.divideScalar(aims.length).sub(center);heading.y=0;if(heading.length()>2)u.supportHeading=heading.normalize();}
    const forward=u.supportHeading||new THREE.Vector3(0,0,1),side=new THREE.Vector3(forward.z,0,-forward.x);
    const rear=Math.min(...escorts.map(e=>e.mesh.position.clone().sub(center).dot(forward)));
    let point=null;
    // Search behind the rearmost escort; an obstructed rear position never becomes a front slot.
    for(const back of [4.5,6.5,8.5]){for(const lateral of [0,2.5,-2.5,5,-5]){
      const p=center.clone().addScaledVector(forward,rear-back).addScaledVector(side,(u.supportSlot||0)+lateral);
      if(!blocked(p.x,p.z,u.radius)){point=p;break;}
    }if(point)break;}
    if(!point){u.destination=null;clearRoute(u);return;}
    if(!u.destination||u.destination.distanceTo(point)>1){u.destination=point;}
  }
  function updateRepair(u, dt) {
    u.state = 'Support ready'; u.attackTarget = null;
    updateRepairEscort(u,dt);
    if (u.destination && moveToward(u, u.destination, dt)) u.destination = null;
    // One target at a time; cannot repair itself, enemies, structures or destroyed units.
    u.repairTarget = units.filter(v => v !== u && !UNIT[v.kind].infantry && !isAir(v) && !isNaval(v) && v.team === u.team && v.hp > 0 && v.hp < v.maxHp && distance(u, v) <= UNIT.repair.range).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || null;
    if (u.repairTarget) {
      u.repairTarget.hp = Math.min(u.repairTarget.maxHp, u.repairTarget.hp + UNIT.repair.repairRate * dt);
      const direction = u.repairTarget.mesh.position.clone().sub(u.mesh.position); rotateToward(u.turret, Math.atan2(direction.x, direction.z), dt); u.state = 'Repairing';
    } else if (u.destination) u.state = u.supportIds?.length?'Following behind squad':'Moving to support';
  }
  function animateVehicles(dt) {
    for (const u of units) {
      updateUnitDamage(u,dt);
      if(!isAir(u)){
        u.body.position.y=isNaval(u)?Math.sin(elapsed*2+u.id)*.04:bridgeHeight(u.mesh.position.x,u.mesh.position.z);
        u.turret.position.y=(isNaval(u)?u.navalRig.mountY:u.groundRig?u.groundRig.mountY:.75)+u.body.position.y;
        if(u.navalRig){
          const rig=u.navalRig;if(rig.radar)rig.radar.rotation.y+=dt*.9;
          for(const gun of rig.secondary)gun.rotation.y=u.turret.rotation.y-u.body.rotation.y;
          rig.wake.visible=Boolean(u.destination||u.path.length);rig.wake.scale.z=.85+Math.sin(elapsed*5+u.id)*.15;
        }
        u.ring.position.y=isNaval(u)?.24:.09+u.body.position.y;
      }
      if(isAir(u)){u.ring.position.y=.09-u.mesh.position.y;if(u.flightRotor)u.flightRotor.rotation.y+=dt*30;u.body.position.y=Math.sin(elapsed*3+u.id)*.06;}
      if (u.legs?.length) u.legs.forEach((leg,i) => { leg.rotation.x = u.destination || u.path.length ? Math.sin(elapsed*10+i*Math.PI)*.5 : 0; });

      if (u.repairBeam) {
        const target = u.repairTarget; u.repairBeam.visible = Boolean(target && target.hp > 0 && distance(u, target) <= UNIT.repair.range + .5);
        if (u.repairBeam.visible) { const a = u.repairBeam.geometry.attributes.position; const tip=new THREE.Vector3(...u.groundRig.muzzle).applyAxisAngle(new THREE.Vector3(0,1,0),u.turret.rotation.y);a.setXYZ(0,tip.x,tip.y+u.turret.position.y,tip.z); a.setXYZ(1, target.mesh.position.x - u.mesh.position.x, 1+(target.body?.position.y||0), target.mesh.position.z - u.mesh.position.z); a.needsUpdate = true; u.repairBeam.geometry.computeBoundingSphere(); }
      }
    }
    for (const e of living()) if (e.muzzle) {
      const profile=FIELD_WEAPONS.profiles[FIELD_WEAPONS.kinds[e.kind]];
      // WeaponFX supplies each weapon's flash; avoid overlaying the same glowing ball on every gun.
      e.flashLeft=Math.max(0,(e.flashLeft||0)-dt); e.muzzle.visible=false;
      e.recoilLeft=Math.max(0,(e.recoilLeft||0)-dt);
      const recoil=profile ? profile.recoil*Math.sin(Math.PI*e.recoilLeft/.24) : 0;
      e.turret.position.x=(e.navalRig?Math.sin(e.body.rotation.y)*e.navalRig.mountZ:0)-Math.sin(e.turret.rotation.y)*recoil;
      e.turret.position.z=(e.navalRig?Math.cos(e.body.rotation.y)*e.navalRig.mountZ:0)-Math.cos(e.turret.rotation.y)*recoil;
    }
    for(const b of buildings)if(b.repairBeam){
      const target=b.repairTarget;b.repairBeam.visible=Boolean(active(b)&&target?.hp>0&&visibleTo(target)&&target.mesh.position.distanceTo(b.exitPoint)<=STRUCTURE[b.kind].serviceRange);
      if(b.repairBeam.visible){const end=target.mesh.position.clone().sub(b.mesh.position).applyAxisAngle(new THREE.Vector3(0,1,0),-b.mesh.rotation.y);const a=b.repairBeam.geometry.attributes.position;a.setXYZ(0,0,2.8,0);a.setXYZ(1,end.x,1+(target.body?.position.y||0),end.z);a.needsUpdate=true;b.repairBeam.geometry.computeBoundingSphere();}
    }
    waterTexture.offset.x += dt * .002; waterTexture.offset.y += dt * .0007;
  }
  function updateCombat(u, dt) {
    if(isAir(u)&&u.mesh.position.y<UNIT[u.kind].altitude){u.mesh.position.y=Math.min(UNIT[u.kind].altitude,u.mesh.position.y+dt*3);u.state='Taking off';return;}
    u.cooldown -= dt; u.state = isAir(u)?'Air patrol':'Guarding';
    if (u.attackTarget && (u.attackTarget.hp <= 0 || !canAttack(u,u.attackTarget) || !visibleTo(u.attackTarget,u.team))) { u.attackTarget = null; clearRoute(u); }
    let target = u.attackTarget;
    if (!target && u.team === 'enemy' && !net?.active && (!raids || !u.aiControlled)) target = closestEnemy(u, 13);
    if (u.destination) { if (moveToward(u, u.destination, dt)) u.destination = null; }
    else if (target && distance(u, target) > reach(u, target) - .3) {
      const offset = u.mesh.position.clone().sub(target.mesh.position); offset.y = 0;
      if (!offset.lengthSq()) offset.set(1, 0, 0);
      const standoff = target.mesh.position.clone().addScaledVector(offset.normalize(), Math.max(3, reach(u, target) - 1));
      standoff.y=u.mesh.position.y;moveToward(u, standoff, dt, .3);
    }
    const inRange = target && distance(u, target) <= reach(u, target);
    const fireTarget = inRange ? target : closestEnemy(u, UNIT[u.kind].range);
    if (fireTarget) {
      const direction = fireTarget.mesh.position.clone().sub(u.mesh.position);
      rotateToward(u.turret, Math.atan2(direction.x, direction.z), dt); u.state = 'Attacking';
      if (u.cooldown <= 0) fire(u, fireTarget);
    } else rotateToward(u.turret, u.body.rotation.y, dt);
  }
  function updateEffects(dt) {
    fxEvents = fxEvents.filter(event => elapsed - event.time < 1.5);
    for (const shell of [...shells]) {
      shell.age += dt;
      const fraction = Math.min(1, shell.age / Math.max(.05, shell.duration));
      const aim = shell.splash ? shell.aim : shell.target.mesh.position.clone().add(new THREE.Vector3(0, .8+(shell.target.body?.position.y||0), 0));
      shell.mesh.position.lerpVectors(shell.origin, aim, fraction);
      if (shell.arc) shell.mesh.position.y += Math.sin(fraction * Math.PI) * shell.arc;
      shell.mesh.lookAt(aim);
      if (fraction >= 1) {
        emitWeaponEvent({type:'impact', visual:shell.visual || 'cannon', point:{x:aim.x,y:aim.y,z:aim.z}});
        if (shell.splash) {
          for (const e of living()) if (e.team !== shell.team && isAir(e)===Boolean(shell.targetAir)) {
            const d = Math.hypot(e.mesh.position.x - aim.x, e.mesh.position.z - aim.z);
            if (d <= shell.splash + (isBuilding(e) ? e.radius * .5 : 0)) damage(e, shell.damage * (isBuilding(e) ? 1.4 : Math.max(.35, 1 - d / (shell.splash + 1))), shell.team);
          }
        } else damage(shell.target, shell.damage, shell.team);
        effects.remove(shell.mesh); shells.splice(shells.indexOf(shell), 1);
        if (outcome) break;
      }
    }
    for (const burst of [...bursts]) {
      burst.life -= dt; burst.mesh.scale.setScalar(burst.size * (1 - burst.life / .5) + .1); burst.mesh.material.opacity = Math.max(0, burst.life / .5);
      if (burst.life <= 0) { effects.remove(burst.mesh); burst.mesh.material.dispose(); bursts.splice(bursts.indexOf(burst), 1); }
    }
    for (const m of [...markers]) { m.life -= dt; if (m.life <= 0) { effects.remove(m.mesh); markers.splice(markers.indexOf(m), 1); } }
  }
  function updateDefense(b, dt) {
    if (!active(b) || !STRUCTURE[b.kind].damage) return;
    b.cooldown -= dt; const target = closestEnemy(b, STRUCTURE[b.kind].range);
    if (target) {
      const direction = target.mesh.position.clone().sub(b.mesh.position); rotateToward(b.turret, Math.atan2(direction.x, direction.z), dt);
      if (b.cooldown <= 0) fire(b, target);
    }
  }
  // Solo commander: periodic decisions, ordinary credits/construction/production rules.
  function resetCommander() {
    return { nextThink: 0, nextBuild: 6, nextRecruit: 0, mode: 'Preparing', intent:'', events:[], decisions:0, plan:null, planAt:0, nextModel:0, pending:false, modelStatus:'', model:'', targetId: null, raidSize: 0, raidStarted: 0, regroupUntil: 0 };
  }
  function isModelOpponent(){return ['ollama','openai'].includes(opponentStyle);}
  function modelProvider(){return opponentStyle==='openai'?'OpenAI Decisions':'Ollama';}
  function currentModelPlan() {
    return isModelOpponent() && commander.plan && performance.now()-commander.planAt<180000 ? commander.plan : null;
  }
  function aiPolicy() {
    const policy=FIELD_OPPONENT.styles[currentModelPlan()?.style || (isModelOpponent()?'balanced':opponentStyle)] || FIELD_OPPONENT.styles.balanced;
    return isModelOpponent()?{...policy,cap:Math.max(20,policy.cap),maxRaid:Math.max(10,policy.maxRaid)}:policy;
  }
  function modelBattleSummary() {
    const side=team=>{
      const count=list=>list.reduce((result,e)=>{result[e.kind]=(result[e.kind]||0)+1;return result;},{});
      return {units:count(unitsFor(team).filter(u=>u.hp>0)),buildings:count(buildings.filter(b=>b.team===team&&b.hp>0))};
    };
    return {elapsed:Math.floor(elapsed),credits:Math.floor(enemyCredits),own:side('enemy'),opponent:side('player'),context:{water:MAP.water.length>0,lowPower:powerFor('enemy').low,pressure:aiBaseThreats().length}};
  }
  function aiPlanName(plan) {
    return plan.unit==='frigate'?'Naval operation':plan.unit==='rocket'?'Anti-air screen':plan.unit==='destroyer'?'Armor hunters':plan.unit==='artillery'?'Siege operation':FIELD_OPPONENT.styles[plan.style].name;
  }
  function aiLog(message) {
    if(net?.active)return;
    commander.events.unshift({at:Math.floor(elapsed),message});commander.events.length=Math.min(commander.events.length,5);
  }
  function acceptAIPlan(plan,model) {
    const changed=JSON.stringify(commander.plan)!==JSON.stringify(plan);
    commander.plan=plan;commander.planAt=performance.now();commander.model=String(model||modelProvider()).slice(0,80);commander.modelStatus='AI plan active';commander.decisions++;
    if(changed) {
      aiLog(`${modelProvider()} ordered: ${aiPlanName(plan)}`);commander.intent='Putting the new order into action';
      commander.nextBuild=Math.min(commander.nextBuild,elapsed);commander.nextRecruit=Math.min(commander.nextRecruit,elapsed);
      // A strategy refresh changes spending and objectives, not the progress of a live attack.
      if(!commander.raidSize)nextRaid=Math.min(nextRaid,elapsed+(plan.style==='rush'?8:20));
    }
    if(commander.raidSize){const target=aiObjective(unitsFor('enemy').filter(u=>u.raid));commander.targetId=target?.id||null;}
  }
  async function requestModelPlan() {
    if(net?.active||!raids||outcome||!isModelOpponent()||commander.pending||performance.now()<commander.nextModel)return;
    const state=commander,controller=new AbortController();modelRequest=controller;
    state.pending=true;state.modelStatus=modelProvider()+' is planning';
    const timer=setTimeout(()=>controller.abort(),6500);
    let retryAfterMs=10000;
    try {
      const response=await FieldLocalAI.plan(modelBattleSummary(),controller.signal);
      const result=await response.json();if(!response.ok){retryAfterMs=Math.max(2000,Math.min(60000,Number(result.retryAfterMs)||10000));throw Error(result.error||modelProvider()+' unavailable');}
      const plan=FIELD_OPPONENT.validPlan(result.plan,Object.keys(UNIT),Object.keys(STRUCTURE).filter(k=>STRUCTURE[k].cost>0));
      if(!plan)throw Error(modelProvider()+' returned an invalid plan');
      if(state!==commander||controller.signal.aborted||net?.active||!raids||!isModelOpponent())return;
      acceptAIPlan(plan,result.model);
      state.nextModel=performance.now()+30000;
    } catch(error) {
      if(state!==commander||net?.active||!raids||!isModelOpponent())return;
      if(!currentModelPlan())state.plan=null;state.modelStatus=error.name==='AbortError'?modelProvider()+' timed out':String(error.message).slice(0,140);state.nextModel=performance.now()+retryAfterMs;
    } finally {clearTimeout(timer);state.pending=false;if(modelRequest===controller)modelRequest=null;}
  }
  function updateOpponentUI() {
    const multiplayer=Boolean(net?.active),model=isModelOpponent(),plan=currentModelPlan();
    $('opponent-style').disabled=multiplayer;
    $('ai-settings').hidden=!model||multiplayer;
    window.FieldLocalAI?.setProvider(opponentStyle);
    $('opponent-description').textContent=multiplayer?'Human opponents control this multiplayer match.':model?modelProvider()+' chooses operations; local tactics counter threats, coordinate fire and avoid losing fights.':FIELD_OPPONENT.styles[opponentStyle].description;
    $('opponent-aid').hidden=multiplayer||!raids;
    const label=$('opponent-status');label.hidden=!model||multiplayer;label.dataset.live=String(Boolean(plan)&&raids);
    label.textContent=!raids?'Computer strategy is off. Enable it in Lab.':plan?`AI order: ${aiPlanName(plan)}${commander.pending?' · refreshing…':commander.modelStatus!=='AI plan active'?' · last plan (refresh unavailable)':''}`:`${commander.modelStatus||'Waiting for '+modelProvider()} · Balanced fallback active`;
    $('opponent-order').hidden=multiplayer||!model||!raids;
    $('opponent-order').textContent='Tactics: '+(commander.intent||'Assessing the battlefield');
    $('opponent-log').hidden=multiplayer||!model;
    $('opponent-events').textContent=commander.events.map(e=>`${Math.floor(e.at/60)}:${String(e.at%60).padStart(2,'0')} ${e.message}`).join('\n')||'No orders executed yet.';
  }
  function aiMove(u, point) {
    const goal=point.clone(); goal.x=THREE.MathUtils.clamp(goal.x,-HALF_X+2,HALF_X-2);goal.z=THREE.MathUtils.clamp(goal.z,-HALF_Z+2,HALF_Z-2);
    if (!u.destination || u.destination.distanceTo(goal)>2) {u.destination=goal;clearRoute(u);}
  }
  function aiAttack(u,target) {
    if(!canAttack(u,target)){u.attackTarget=null;return;}
    // Strategic knowledge may name an unseen objective. Travel there; only fire after spotting it.
    if(!visibleTo(target,u.team)){u.attackTarget=null;aiMove(u,target.mesh.position);return;}
    if(u.attackTarget!==target || u.destination) {u.attackTarget=target;u.destination=null;clearRoute(u);}
  }
  function aiBuild(kind) {
    const base=baseOf('enemy'); if(!base)return false;
    const missing=missingStructures(kind,'enemy');if(missing.length)return aiBuild(missing[0]);
    if(enemyCredits<STRUCTURE[kind].cost) return false;
    if(buildings.some(b=>b.team==='enemy'&&b.kind===kind&&b.hp>0&&b.buildLeft))return false;
    if(kind==='shipyard'){
      for(let x=-HALF_X+6;x<HALF_X-6;x+=2)for(let z=-HALF_Z+6;z<HALF_Z-6;z+=2){
        const point=new THREE.Vector3(x,0,z);if(!placementError(kind,point,'enemy')){spend('enemy',STRUCTURE[kind].cost);createBuilding(kind,'enemy',x,z,true);aiLog('Building Naval shipyard');return true;}
      }
      // Expand toward the nearest bank so the next completed outpost reaches water.
      for(const r of [23,19,15])for(let i=0;i<32;i++){
        const a=i*Math.PI/16,p=base.mesh.position.clone().add(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r));
        if(MAP.water.some(w=>Math.abs(p.x-w.x)<w.width/2+14&&Math.abs(p.z-w.z)<w.depth/2+14)&&!placementError('power',p,'enemy')){spend('enemy',STRUCTURE.power.cost);createBuilding('power','enemy',p.x,p.z,true);return true;}
      }
      return false;
    }
    // Test legal sites near HQ, tending toward its front for defenses.
    for(const radius of [9,15,21,27]) for(let i=0;i<16;i++) {
      const angle=-Math.PI/2+i*Math.PI/8,point=base.mesh.position.clone().add(new THREE.Vector3(Math.sin(angle)*radius,0,Math.cos(angle)*radius));
      if(!placementError(kind,point,'enemy')) {spend('enemy',STRUCTURE[kind].cost);createBuilding(kind,'enemy',point.x,point.z,true);aiLog(`Building ${STRUCTURE[kind].name}`);return true;}
    }
    return false;
  }
  // Optional investments can reserve income briefly, but must not block the army indefinitely.
  function aiBudgetWait(key,cost,name) {
    commander.budgetWaits||={};
    commander.budgetWaits[key]??=elapsed;
    const waiting=elapsed-commander.budgetWaits[key]<35;
    commander.intent=waiting?`Saving for ${name}: $${Math.floor(enemyCredits)} / $${cost}`:`Deferring ${name}: using affordable forces`;
    return waiting;
  }
  function aiPriorityBuild(kind) {
    if(!baseOf('enemy'))return false;
    const missing=missingStructures(kind,'enemy');if(missing.length)return aiPriorityBuild(missing[0]);
    const current=buildings.find(b=>b.team==='enemy'&&b.kind===kind&&b.hp>0&&b.buildLeft);
    if(current){commander.intent=`Constructing ${STRUCTURE[kind].name} · ${Math.ceil(current.buildLeft)}s`;return true;}
    if(enemyCredits<STRUCTURE[kind].cost)return aiBudgetWait('build:'+kind,STRUCTURE[kind].cost,STRUCTURE[kind].name);
    if(elapsed<commander.nextBuild){commander.intent=`Preparing ${STRUCTURE[kind].name}`;return true;}
    if(aiBuild(kind)){if(commander.budgetWaits)delete commander.budgetWaits['build:'+kind];commander.nextBuild=elapsed+8;commander.intent=`Constructing ${STRUCTURE[kind].name}`;return true;}
    commander.intent=`No clear site for ${STRUCTURE[kind].name}`;return false;
  }
  function aiCommittedProduction(plan,policy,own,ownBuildings,count) {
    const has=kind=>ownBuildings.some(b=>b.kind===kind);
    const defenseCount=ownBuildings.filter(b=>STRUCTURE[b.kind].defense).length;
    const build=plan.building!=='auto'&&(!has(plan.building)||(STRUCTURE[plan.building].defense&&defenseCount<policy.defenses))?plan.building:null;
    if(build&&aiPriorityBuild(build))return true;
    if(plan.unit==='auto')return false;
    const kind=plan.unit,def=UNIT[kind],quota=def.aircraft?4:3;
    if(count(kind)>=quota){commander.intent=`${def.name} group assembled · supporting the force`;return false;}
    if(!producerFor(kind,'enemy'))return aiPriorityBuild(def.producer);
    if(own.length+remoteQueue.length>=policy.cap){commander.intent='Army limit reached · committing existing forces';return false;}
    if(remoteQueue.some(q=>UNIT[q.kind].producer===def.producer))return false;
    if(enemyCredits<def.cost)return aiBudgetWait('unit:'+kind,def.cost,def.name);
    if(elapsed<commander.nextRecruit){commander.intent=`Preparing ${def.name}`;return true;}
    queueUnit(kind,'enemy');if(commander.budgetWaits)delete commander.budgetWaits['unit:'+kind];commander.nextRecruit=elapsed+policy.recruit;commander.intent=`Producing ${def.name}`;return true;
  }
  function aiRecoverIncome(own,ownBuildings,count) {
    const has=kind=>ownBuildings.some(b=>b.kind===kind);
    const missingRefinery=!has('refinery'),missingMiner=!count('miner');
    commander.recovering=missingRefinery||missingMiner;
    if(!commander.recovering)return false;
    // Use the same refunds as the player. Preserve the HQ, power and ore infrastructure.
    const budget=(missingRefinery?STRUCTURE.refinery.cost+(!has('power')?STRUCTURE.power.cost:0):0)+(missingMiner?UNIT.miner.cost:0);
    for(const b of ownBuildings)b.repairing=false;
    for(let i=remoteQueue.length-1;i>=0&&enemyCredits<budget;i--){
      if(remoteQueue[i].kind==='miner')continue;
      const [item]=remoteQueue.splice(i,1);spend('enemy',-UNIT[item.kind].cost);aiLog(`Cancelled ${UNIT[item.kind].name} to restore income`);
    }
    const surplus=ownBuildings.filter(b=>!['base','power','refinery'].includes(b.kind)&&saleValue(b)>0).sort((a,b)=>saleValue(b)-saleValue(a));
    while(enemyCredits<budget&&surplus.length){
      const b=surplus.shift();sellStructure(b,'enemy');aiLog(`Sold ${STRUCTURE[b.kind].name} to restore income`);
    }
    if(missingRefinery){aiPriorityBuild('refinery');return true;}
    if(missingMiner&&producerFor('miner','enemy')&&enemyCredits>=UNIT.miner.cost&&own.length+remoteQueue.length<24){
      queueUnit('miner','enemy');aiTactic('Restoring income: replacing the last miner');return true;
    }
    aiTactic('Income recovery: seek an exposed target for battle rewards');return true;
  }
  function aiEconomy() {
    const policy=aiPolicy(),plan=currentModelPlan();
    const own=unitsFor('enemy'),ownBuildings=buildings.filter(b=>b.team==='enemy'&&b.hp>0);
    const count=kind=>own.filter(u=>u.kind===kind).length+remoteQueue.filter(q=>q.kind===kind).length;
    const has=kind=>ownBuildings.some(b=>b.kind===kind);
    if(aiRecoverIncome(own,ownBuildings,count))return;
    // The first miner must never wait behind a factory or optional technology.
    let necessary = powerFor('enemy').low ? 'power' : null;
    if(necessary) {
      if(plan)aiPriorityBuild(necessary);
      else if(elapsed>=commander.nextBuild && aiBuild(necessary)) commander.nextBuild=elapsed+12;
      // Save for essential infrastructure; don't spend the refinery recovery budget on tanks.
      return;
    }
    if(aiEmergencyProduction(own,count,policy))return;
    if(count('miner')<policy.miners && own.length+remoteQueue.length<24 && producerFor('miner','enemy')) {
      if(enemyCredits>=UNIT.miner.cost){queueUnit('miner','enemy');commander.intent=`Expanding ore income · ${count('miner')} / ${policy.miners} miners`;return;}
      if(plan&&aiBudgetWait('miner',UNIT.miner.cost,'miner'))return;
    }
    if(!has('warFactory')&&aiPriorityBuild('warFactory'))return;
    if(plan&&aiCommittedProduction(plan,policy,own,ownBuildings,count))return;
    if(elapsed>=commander.nextBuild && enemyCredits>450) {
      const defenseCount=ownBuildings.filter(b=>STRUCTURE[b.kind].defense).length;
      const modelBuilding=null; // Committed model construction was handled before discretionary spending.
      const kind=MAP.water.length&&elapsed>90&&!has('shipyard')?'shipyard':unitsFor('player').some(isAir)&&!has('missileBattery')?'missileBattery':modelBuilding||
        (elapsed>policy.airAt&&!has('airfield')?'airfield':policy.name===FIELD_OPPONENT.styles.fortress.name&&defenseCount<policy.defenses?(!has('missileBattery')?'missileBattery':!has('teslaCoil')?'teslaCoil':'turret'):!has('garrison')?'garrison':defenseCount<policy.defenses?'turret':null);
      if(kind&&aiBuild(kind)) {commander.nextBuild=elapsed+20;return;}
    }
    if(elapsed<commander.nextRecruit || remoteQueue.length>=3 || own.length+remoteQueue.length>=policy.cap)return;
    const fighters=own.filter(u=>UNIT[u.kind].damage>0), opponents=unitsFor('player');
    const armor=opponents.filter(u=>!UNIT[u.kind].infantry&&UNIT[u.kind].damage>0).length;
    const infantry=opponents.filter(u=>UNIT[u.kind].infantry).length;
    const defenses=buildings.filter(b=>b.team==='player'&&active(b)&&STRUCTURE[b.kind].defense).length;
    let preferences;
    if(has('shipyard')&&count('patrolBoat')+count('frigate')+count('battleship')<3)preferences=!count('patrolBoat')?['patrolBoat']:!count('frigate')?['frigate']:['battleship'];
    else if(opponents.some(isAir)&&count('interceptor')+count('rocket')+count('rocketTrooper')<3) preferences=['interceptor','rocket','rocketTrooper'];
    else if(has('airfield')&&count('gunship')+count('bomber')<(policy.name===FIELD_OPPONENT.styles.air.name?7:2)) preferences=count('gunship')>count('bomber')?['bomber','gunship']:['gunship','bomber'];
    else if(policy.name===FIELD_OPPONENT.styles.rush.name&&fighters.length<8) preferences=['tank','rifleman','scout'];
    else if(fighters.length>=3 && !count('repair')) preferences=['repair','tank'];
    else if(fighters.filter(u=>stats(u).range<12).length<3) preferences=['tank','heavy','rifleman'];
    else if(defenses>=2 && count('artillery')+count('rocket')<Math.ceil(fighters.length/3)) preferences=['artillery','rocket'];
    else if(infantry>armor && count('flame')<2) preferences=['flame','rifleman'];
    else if(armor>=3 && count('destroyer')<Math.ceil(fighters.length/3)) preferences=['destroyer','rocketTrooper','tank'];
    else preferences=count('tank')<=count('heavy')+1?['tank','rifleman']:['heavy','rocketTrooper','scout'];
    const kind=preferences.find(k=>producerFor(k,'enemy')&&enemyCredits>=UNIT[k].cost&&!remoteQueue.some(q=>UNIT[q.kind].producer===UNIT[k].producer));
    if(kind) {queueUnit(kind,'enemy');commander.nextRecruit=elapsed+policy.recruit;}
  }
  function aiBaseThreats(){
    const assets=buildings.filter(b=>b.team==='enemy'&&active(b));
    return living().filter(e=>e.team==='player'&&stats(e).damage>0&&visibleTo(e,'enemy')&&assets.some(b=>distance(e,b)<Math.max(16,stats(e).range+2)));
  }
  const aiStrength=e=>stats(e).damage?Math.sqrt(Math.max(0,e.hp))*stats(e).damage/Math.max(.3,stats(e).reload)*(1+(stats(e).range||0)/30):0;
  function aiEngagement(army,target){
    const capable=army.filter(u=>canAttack(u,target)&&(!isNaval(u)||MAP.water.some(w=>Math.hypot(Math.max(0,Math.abs(target.mesh.position.x-w.x)-w.width/2+u.radius),Math.max(0,Math.abs(target.mesh.position.z-w.z)-w.depth/2+u.radius))<=reach(u,target)-1)));
    const defenders=living().filter(e=>e.team==='player'&&stats(e).damage&&visibleTo(e,'enemy')&&distance(e,target)<stats(e).range+6&&capable.some(u=>canAttack(e,u)));
    const own=capable.reduce((n,u)=>n+aiStrength(u),0);
    const hostile=defenders.reduce((n,e)=>n+aiStrength(e)*(isBuilding(e)&&capable.some(u=>stats(u).range>stats(e).range+3)?.5:1),0);
    return {own,hostile,viable:capable.length>0&&own>=hostile*.9};
  }
  function aiTactic(message){
    commander.intent=message;
    if(commander.lastTactic!==message&&elapsed-(commander.tacticAt||-10)>6){aiLog(message);commander.lastTactic=message;commander.tacticAt=elapsed;}
  }
  function aiEmergencyProduction(own,count,policy){
    const seen=unitsFor('player').filter(u=>visibleTo(u,'enemy'));
    const air=seen.filter(isAir).length,pressure=aiBaseThreats();
    const aa=own.filter(u=>stats(u).damage&&['air','all'].includes(stats(u).targets)).length+remoteQueue.filter(q=>['air','all'].includes(UNIT[q.kind].targets)).length;
    let kind=null;
    if(air&&aa<Math.min(4,Math.max(2,air)))kind=producerFor('rocketTrooper','enemy')?'rocketTrooper':producerFor('rocket','enemy')?'rocket':'rocketTrooper';
    else if(pressure.length>=2&&own.filter(u=>stats(u).damage>0).length<pressure.length+3)kind=producerFor('tank','enemy')?'tank':'rifleman';
    if(!kind||own.length+remoteQueue.length>=policy.cap)return false;
    if(!producerFor(kind,'enemy'))return aiPriorityBuild(UNIT[kind].producer);
    // Do not stall all other production while this factory is busy or funds are insufficient.
    if(remoteQueue.some(q=>UNIT[q.kind].producer===UNIT[kind].producer)||enemyCredits<UNIT[kind].cost)return false;
    queueUnit(kind,'enemy');commander.nextRecruit=elapsed+2;
    aiTactic(air?'Air threat spotted: reinforcing anti-air':'Base under pressure: reinforcing defenders');return true;
  }
  function aiFocusTarget(u,candidates,assigned){
    return candidates.filter(e=>canAttack(u,e)).sort((a,b)=>{
      const score=e=>{
        const committed=assigned.get(e.id)||0,kill=committed>=e.hp?100:0;
        const counter=isAir(e)&&['air','all'].includes(stats(u).targets)?-8:0;
        return distance(u,e)*.45+(e.hp-committed)/Math.max(1,stats(u).damage)*2+kill+counter-(stats(e).damage?5:0);
      };return score(a)-score(b);
    })[0]||null;
  }
  function aiObjective(army) {
    if(!army.length)return null;
    const center=new THREE.Vector3();army.forEach(u=>center.add(u.mesh.position));center.divideScalar(army.length);
    const opponents=living().filter(e=>e.team==='player');
    const focus=currentModelPlan()?.focus||aiPolicy().focus;
    const value=e=>{
      const basic=e.kind==='miner'?45:e.kind==='refinery'?40:e.kind==='power'?32:e.kind==='warFactory'?30:e.kind==='garrison'||e.kind==='airfield'?22:e.kind==='base'?12:0;
      return basic+(focus==='hq'&&e.kind==='base'?70:focus==='production'&&['warFactory','garrison','airfield'].includes(e.kind)?40:focus==='army'&&stats(e).damage>0?60:focus==='economy'&&['miner','refinery'].includes(e.kind)?15:0);
    };
    const score=e=>{
      const cover=opponents.reduce((n,v)=>n+(v!==e&&stats(v).damage&&distance(v,e)<stats(v).range+3?(isBuilding(v)?24:9):0),0);
      return value(e)+(1-e.hp/e.maxHp)*16-center.distanceTo(e.mesh.position)*.3-cover;
    };
    const ranked=opponents.filter(e=>value(e)>0).map(e=>{const fight=aiEngagement(army,e);return {e,fight,score:score(e)-(fight.viable?0:65)};});
    const viable=ranked.filter(r=>r.fight.viable);
    return (viable.length?viable:ranked.filter(r=>r.fight.own>0)).sort((a,b)=>b.score-a.score)[0]?.e||null;
  }
  function aiRegroup() {
    commander.targetId=null;commander.raidSize=0;commander.regroupUntil=elapsed+18;commander.mode='Regrouping';
    for(const u of unitsFor('enemy')) if(u.raid){u.raid=false;u.attackTarget=null;u.destination=null;clearRoute(u);}
  }
  function updateCommander() {
    if(net?.active || !raids || !baseOf('enemy') || elapsed<commander.nextThink)return;
    commander.nextThink=elapsed+1.5;
    requestModelPlan();
    const policy=aiPolicy();
    commander.intent='Balancing the army and protecting miners';
    aiEconomy();
    const base=baseOf('enemy'), own=unitsFor('enemy'),fighters=own.filter(u=>UNIT[u.kind].damage>0);
    const assets=[...buildings.filter(b=>b.team==='enemy'&&active(b)),...own.filter(u=>u.kind==='miner')];
    const threats=unitsFor('player').filter(u=>UNIT[u.kind].damage>0&&assets.some(a=>distance(a,u)<(a.kind==='miner'?12:14)));
    const rally=base.mesh.position.clone().add(new THREE.Vector3(-8,0,5));
    for(const b of buildings.filter(b=>b.team==='enemy'&&active(b)&&b.hp<b.maxHp*.65&&!b.repairing)){if(!commander.recovering&&enemyCredits>180){b.repairing=true;aiLog('Repairing '+STRUCTURE[b.kind].name);}}
    for(const miner of own.filter(u=>u.kind==='miner')) {
      const threat=living().find(e=>e.team==='player'&&stats(e).damage>0&&distance(e,miner)<11);
      if(threat&&stats(threat).damage) {miner.aiFleeUntil=elapsed+8;miner.mining=false;aiMove(miner,base.mesh.position.clone().add(new THREE.Vector3(6,0,4)));}
      else if(miner.aiFleeUntil && elapsed>=miner.aiFleeUntil) {miner.aiFleeUntil=0;assignMining(miner);}
      if(!miner.aiFleeUntil && (!miner.field || !miner.field.amount || miner.mineState==='travel')) {
        const safe=fields.filter(f=>f.amount>0).sort((a,b)=>{
          const risk=f=>unitsFor('player').filter(u=>UNIT[u.kind].damage>0&&distance(u,f)<14).length*35+distance(miner,f);
          return risk(a)-risk(b);
        })[0];
        if(safe&&safe!==miner.field)assignMining(miner,safe);
      }
    }
    for(const u of fighters) {
      const repairable=own.some(v=>v.kind==='repair'&&!isAir(u)&&!isNaval(u))||buildings.some(b=>active(b)&&serviceCompatible(b,u)&&enemyCredits>20);
      if(!UNIT[u.kind].infantry && u.hp/u.maxHp<policy.retreat&&repairable) {u.aiRetreat=true;u.raid=false;}
      if(!repairable)u.aiRetreat=false;
      if(u.aiRetreat&&u.hp/u.maxHp>.75)u.aiRetreat=false;
    }
    let raiders=fighters.filter(u=>u.raid&&!u.aiRetreat);
    if(commander.raidSize && (raiders.length<Math.ceil(commander.raidSize*.55)||elapsed-commander.raidStarted>65||threats.length>=3)) {aiRegroup();raiders=[];}
    if(!raiders.length && elapsed>=nextRaid && elapsed>=commander.regroupUntil && !threats.length) {
      const available=fighters.filter(u=>!u.aiRetreat&&u.hp/u.maxHp>(commander.recovering?.25:.55));
      // Each style reserves its own number of guards near the miners.
      available.sort((a,b)=>distance(b,base)-distance(a,base));
      const opportunistic=commander.recovering||elapsed-(commander.lastLaunch??policy.firstRaid)>45;
      const reserve=opportunistic?Math.min(1,Math.max(0,available.length-2)):policy.guards;
      if(available.length>=(opportunistic?2:policy.minForce)) {
        raiders=available.slice(0,Math.min(policy.maxRaid,available.length-reserve));
        const target=aiObjective(raiders);
        if(target&&aiEngagement(raiders,target).viable) {raiders.forEach(u=>u.raid=true);commander.targetId=target.id;commander.raidSize=raiders.length;commander.raidStarted=elapsed;commander.lastLaunch=elapsed;wave++;nextRaid=elapsed+policy.interval;aiLog(`Sent ${raiders.length} units against ${stats(target).name}`);announce(`Enemy strike force targeting your ${stats(target).name.toLowerCase()}.`);}
        else {raiders=[];nextRaid=elapsed+10;aiTactic('Holding attack: build a stronger force or strike an exposed target');}
      } else nextRaid=elapsed+10;
    }
    let objective=living().find(e=>e.id===commander.targetId);
    if(raiders.length&&!objective) {objective=aiObjective(raiders);commander.targetId=objective?.id||null;}
    commander.mode=threats.length?'Defending':raiders.length?'Attacking':elapsed<commander.regroupUntil?'Regrouping':'Building forces';
    const assigned=new Map();
    for(const u of fighters) {
      u.aiControlled=true;
      if(u.aiRetreat) {
        const yard=buildings.filter(b=>active(b)&&serviceCompatible(b,u)).sort((a,b)=>distance(u,a)-distance(u,b))[0];
        const crawler=own.find(v=>v.kind==='repair'&&!isAir(u)&&!isNaval(u));
        u.attackTarget=null;aiMove(u,yard?.exitPoint||crawler?.mesh.position||rally);continue;
      }
      const nearby=living().filter(v=>v.team==='player'&&visibleTo(v,'enemy')&&distance(u,v)<stats(u).range+4);
      const localThreat=aiFocusTarget(u,nearby,assigned);
      const nearbyEnemy=nearby.filter(e=>stats(e).damage&&canAttack(e,u));
      const allies=fighters.filter(v=>distance(u,v)<14);
      if(!threats.length&&nearbyEnemy.length>=2&&nearbyEnemy.reduce((n,e)=>n+aiStrength(e),0)>allies.reduce((n,e)=>n+aiStrength(e),0)*1.6){u.attackTarget=null;u.raid=false;aiMove(u,rally);aiTactic('Outmatched locally: regrouping before another attack');continue;}
      const compatibleObjective=objective&&canAttack(u,objective)?objective:unitsFor('player').filter(v=>canAttack(u,v)).sort((a,b)=>distance(u,a)-distance(u,b))[0];
      const target=localThreat||(u.raid?compatibleObjective:aiFocusTarget(u,threats,assigned));
      if(target) {
        aiAttack(u,target);assigned.set(target.id,(assigned.get(target.id)||0)+stats(u).damage);
        if(stats(u).range>=12 && localThreat && distance(u,localThreat)<stats(u).range*.55) {
          const away=u.mesh.position.clone().sub(localThreat.mesh.position).normalize(),back=u.mesh.position.clone().addScaledVector(away,4);if(isAir(u)||!blocked(back.x,back.z,u.radius,isNaval(u)))aiMove(u,back);
        }
      } else {u.attackTarget=null;const guard=rally.clone().add(new THREE.Vector3((u.id%3-1)*3,0,Math.floor(u.id%6/3)*3));if(u.mesh.position.distanceTo(guard)>4)aiMove(u,guard);}
    }
    for(const crawler of own.filter(u=>u.kind==='repair')) {
      if(crawler.hp/crawler.maxHp<.3) {crawler.supportIds=[];aiMove(crawler,rally);continue;}
      const escorts=(raiders.length?raiders:fighters).filter(u=>!isAir(u)&&!isNaval(u)&&!UNIT[u.kind].infantry);
      if(escorts.length)setRepairEscort(crawler,escorts,objective?.mesh.position||rally);
      else {crawler.supportIds=[];if(crawler.mesh.position.distanceTo(rally)>3)aiMove(crawler,rally);}
    }
  }

  function updateComputerAid(dt) {
    if(net?.active||!raids||paused||outcome||!baseOf('enemy'))return;
    // Modest solo-only advantage: a trickle below a cash reserve, plus bounded recovery help.
    const grant=Math.min(2*dt,Math.max(0,600-enemyCredits));enemyCredits+=grant;computerAid.passive+=grant;
    const lostIncome=!buildings.some(b=>b.team==='enemy'&&b.hp>0&&b.kind==='refinery')||!unitsFor('enemy').some(u=>u.kind==='miner'&&u.hp>0)&&!remoteQueue.some(q=>q.kind==='miner');
    if(lostIncome&&enemyCredits<120&&elapsed>=computerAid.nextGrant){
      enemyCredits+=180;computerAid.emergency+=180;computerAid.nextGrant=elapsed+90;aiLog('Emergency resupply: +180 credits');
    }
  }
  function simulate(dt) {
    if (paused || outcome || (net?.active && !net.playable)) return;
    elapsed += dt; fogClock+=dt; if(fogClock>=.12){refreshFog();fogClock=0;}
    updateComputerAid(dt);
    for (const b of buildings) {
      if (b.hp <= 0) continue;
      if (b.buildLeft > 0) {
        b.buildLeft = Math.max(0, b.buildLeft - dt); b.mesh.scale.y = .15 + .85 * (1 - b.buildLeft / STRUCTURE[b.kind].time);
        if (!b.buildLeft && b.team === localTeam) announce(`${STRUCTURE[b.kind].name} online.`);
        continue;
      }
      if (b.rotor) b.rotor.rotation.y += dt * .75;
      updateStructureRepair(b,dt);
      if (STRUCTURE[b.kind].damage) updateDefense(b, dt);
    }
    for (const team of (net?.active ? matchTeams : raids ? ['player','enemy'] : ['player'])) {
      const production = queueFor(team);
      if (production.length && baseOf(team)) {
        const lines = new Set();
        for (const item of [...production]) {
          const def=UNIT[item.kind]; if(lines.has(def.producer)) continue; lines.add(def.producer);
          if (!producerFor(item.kind,team)) continue;
          item.progress = Math.min(def.time, item.progress + dt * (powerFor(team).low ? .45 : 1));
          if(item.progress >= def.time && spawnUnit(item.kind,team,item.producerId)) { production.splice(production.indexOf(item),1); emitVoiceAlert(team,'ready',item.kind); if(team===localTeam) announce(`${def.name} ready.`);else if(team==='enemy'&&!net?.active)aiLog(`${def.name} ready`); }
        }
      }
    }
    updateCommander();
    for (const u of units) { if(updateExitYield(u,dt))continue; if (u.kind === 'miner') updateMiner(u, dt); else if (u.kind === 'repair') updateRepair(u, dt); else updateCombat(u, dt); }
    resolveCollisions(); updateYardRepairs(dt); updateEffects(dt);
    powerAlertClock+=dt;if(powerAlertClock>=.5){checkPowerAlerts();powerAlertClock=0;}
  }
  function checkPowerAlerts() {
    for(const team of matchTeams){
      if(!baseOf(team))continue;
      const low=powerFor(team).low,prior=powerAlertState[team];
      if(low&&!prior?.low){emitVoiceAlert(team,'lowPower');powerAlertState[team]={low:true,at:elapsed};}
      else if(!low){powerAlertState[team]={low:false,at:elapsed};if(team===localTeam)window.FieldVoice?.discard('lowPower');}
    }
  }

  let mapSetupPaused=false;
  function openMapSetup(){
    mapSetupPaused=paused;paused=true;updatePause();$('map-cancel').hidden=elapsed===0||Boolean(outcome);$('map-select').value=MAP.id;renderMapPreview();$('map-dialog').showModal();
  }
  function renderMapPreview(){
    const map=FIELD_MAP.get($('map-select').value),c=$('map-preview'),ctx=c.getContext('2d'),sx=c.width/(HALF_X*2),sz=c.height/(HALF_Z*2);
    ctx.fillStyle='#506b4d';ctx.fillRect(0,0,c.width,c.height);
    const rect=(r,color)=>{ctx.fillStyle=color;ctx.fillRect((r.x-r.width/2+HALF_X)*sx,(r.z-r.depth/2+HALF_Z)*sz,r.width*sx,r.depth*sz);};
    map.water.forEach(r=>rect(r,'#438eae'));map.bridges.forEach(r=>rect(r,'#c6c4ab'));
    for(const o of map.obstacles){ctx.fillStyle='#9a9b7d';ctx.beginPath();ctx.ellipse((o.x+HALF_X)*sx,(o.z+HALF_Z)*sz,o.radius*sx,o.radius*sz,0,0,Math.PI*2);ctx.fill();}
    for(const [x,z,color] of [[-49,37,'#6ce6b1'],[49,-37,'#f67962'],[-49,-37,'#6fb7ff'],[49,37,'#f3cf65']]){ctx.fillStyle=color;ctx.fillRect((x+HALF_X)*sx-4,(z+HALF_Z)*sz-4,8,8);}
    $('map-description').textContent=map.description;
  }
  for(const id of ['map-select','network-map'])for(const map of FIELD_MAP.catalog){const option=document.createElement('option');option.value=map.id;option.textContent=map.name;$(id).append(option);}
  $('network-map').value=MAP.id;
  $('map-select').onchange=renderMapPreview;
  $('map-dialog').addEventListener('cancel',e=>e.preventDefault());
  $('map-cancel').onclick=()=>{$('map-dialog').close();paused=mapSetupPaused;updatePause();};
  $('map-start').onclick=()=>{chooseMap($('map-select').value);$('network-map').value=MAP.id;$('map-dialog').close();startGame();};
  $('map-multiplayer').onclick=()=>{$('network-map').value=$('map-select').value;$('map-dialog').close();net.open();};
  function startGame() {
    window.IronFieldMusic?.reset();
    window.FieldVoice?.reset();voiceEvents=[];nextVoiceId=1;lastVoiceId=0;attackAlertAt={};
    powerAlertState={};powerAlertClock=0;
    units.forEach(releaseUnitDamage);
    const shared = new Set([boxGeometry, wheelGeometry, ringGeometry, selectionRingGeometry, burstGeometry, smokeGeometry, damageFlameGeometry]), disposed = new Set();
    for (const root of [actors, deposits]) root.traverse(o => {
      if (o.geometry && !shared.has(o.geometry) && !disposed.has(o.geometry)) { disposed.add(o.geometry); o.geometry.dispose(); }
    });
    weaponFX.clear(); fxEvents=[]; nextFXId=1; lastVisualEvent=0;
    bursts.forEach(b => b.mesh.material.dispose()); actors.clear(); deposits.clear(); effects.clear(); $('labels').replaceChildren();
    units = []; buildings = []; fields = []; shells = []; bursts = []; markers = []; queue = []; selected.clear(); keys.clear(); controlGroups.clear(); pointer = null; finishPointer();
    filterRoster();
    nextId = 1; nextShotId = 1; credits = 600; enemyCredits = net?.active ? 600 : 160; delivered = 0; enemyDelivered = 0; remoteQueue = []; winner = null; elapsed = 0; nextRaid = 90; wave = 0; modelRequest?.abort(); modelRequest=null; commander = resetCommander(); nextRaid=aiPolicy().firstRaid;
    computerAid={passive:0,emergency:0,nextGrant:90};
    extraEconomies={team3:{credits:600,delivered:0,queue:[]},team4:{credits:600,delivered:0,queue:[]}};
    battleRewards={player:0,enemy:0,team3:0,team4:0};lastRewards={};rewardUntil=0;$('reward-notice').hidden=true;
    eliminated=[];matchTeams=net?.active?(net.room?.players?.map(p=>p.team)||['player','enemy']):['player','enemy'];
    fog.reset();fogClock=0;
    paused = false; outcome = ''; $('result').hidden = true; cancelPlacement();
    // Move whole base clusters together, preserving local mining routes and clearances.
    const spawn = (make, kind, team, x, z) => {
      const side = team === 'player' ? 1 : -1;
      return make(kind, team, x - MAP.baseOffsetX * side, z + MAP.baseOffsetZ * side);
    };
    const spawnBuilding = (...args) => spawn(createBuilding, ...args);
    const spawnUnit = (...args) => spawn(createUnit, ...args);
    if (net?.active) {
      // Mirrored corner bases: equal ore access, open central scouting lanes.
      const corners={player:[-1,1],enemy:[1,-1],team3:[-1,-1],team4:[1,1]};
      for(const team of ['player','enemy','team3','team4']) {
        const [sx,sz]=corners[team];createField((42+MAP.spawnOffsetX)*sx,(10+MAP.spawnOffsetZ)*sz,6000,`${team.toUpperCase()} ORE`);
      }
      createField(0,0,14000,'CENTRAL ORE');createField(-17,0,6000,'WEST EXPANSION');createField(17,0,6000,'EAST EXPANSION');
      for(const team of matchTeams){
        const [sx,sz]=corners[team];
        createBuilding('base',team,(39+MAP.spawnOffsetX)*sx,(29+MAP.spawnOffsetZ)*sz);createBuilding('refinery',team,(43+MAP.spawnOffsetX)*sx,(20+MAP.spawnOffsetZ)*sz);
        createBuilding('power',team,(29+MAP.spawnOffsetX)*sx,(34+MAP.spawnOffsetZ)*sz);createBuilding('turret',team,(28+MAP.spawnOffsetX)*sx,(23+MAP.spawnOffsetZ)*sz);
        createUnit('scout',team,(29+MAP.spawnOffsetX)*sx,(17+MAP.spawnOffsetZ)*sz);createUnit('tank',team,(33+MAP.spawnOffsetX)*sx,(22+MAP.spawnOffsetZ)*sz);
        createUnit('tank',team,(30+MAP.spawnOffsetX)*sx,(27+MAP.spawnOffsetZ)*sz);createUnit('artillery',team,(35+MAP.spawnOffsetX)*sx,(35+MAP.spawnOffsetZ)*sz);
        const field=fields[['player','enemy','team3','team4'].indexOf(team)];
        assignMining(createUnit('miner',team,(39+MAP.spawnOffsetX)*sx,(14+MAP.spawnOffsetZ)*sz),field);assignMining(createUnit('miner',team,(44+MAP.spawnOffsetX)*sx,(14+MAP.spawnOffsetZ)*sz),field);
      }
    } else {
    createField(-53,13,6000,'WEST ORE');createField(0,0,10000,'CENTRAL ORE');createField(53,-11,6000,'EAST ORE');
    createField(-25,5,6000,'WEST EXPANSION');createField(25,-5,6000,'EAST EXPANSION');
    spawnBuilding('base', 'player', -17, 12); spawnBuilding('refinery', 'player', -22, 3);
    spawnBuilding('power', 'player', -8, 17); spawnBuilding('turret', 'player', -6, 7);
    spawnBuilding('base', 'enemy', 17, -12); spawnBuilding('refinery', 'enemy', 22, 1);
    spawnBuilding('power', 'enemy', 24, -17); spawnBuilding('turret', 'enemy', 8, -9);
    spawnUnit('scout', 'player', -10, 8); spawnUnit('tank', 'player', -13, 7); spawnUnit('tank', 'player', -10, 11); spawnUnit('artillery', 'player', -12, 16);
    const miner1 = spawnUnit('miner', 'player', -18, 0), miner2 = spawnUnit('miner', 'player', -20, -2);
    assignMining(miner1, fields[0]); assignMining(miner2, fields[0]);
    createBuilding('warFactory', 'enemy', 39, -41);
    spawnUnit('tank', 'enemy', 13, -7); spawnUnit('tank', 'enemy', 18, -6); spawnUnit('scout', 'enemy', 10, -14); spawnUnit('heavy', 'enemy', 22, -10);
    const enemyMiner = spawnUnit('miner', 'enemy', 24, 6); assignMining(enemyMiner, fields[2]);
    }
    refreshFog(); shadeScene(); homeCamera(); updatePause(); updateUI(); announce('Miners are harvesting. Build your army and protect the supply line.');
  }

  // 8. CAMERA + HTML OVERLAY. A 3D position can also be projected back to pixels.
  function updateCamera() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const aspect = width / Math.max(1, height);
    ortho.left = -view.span * aspect / 2; ortho.right = view.span * aspect / 2;
    ortho.top = view.span / 2; ortho.bottom = -view.span / 2;
    ortho.updateProjectionMatrix();
    perspective.aspect = aspect; perspective.updateProjectionMatrix();
    const target = new THREE.Vector3(view.x, 0, view.z);
    const distance = camera === perspective ? view.span * 1.28 : 150;
    scene.fog.near = distance + 50; scene.fog.far = distance + 300;
    camera.far = distance + HALF_X * 2 + HALF_Z * 2 + 100; camera.updateProjectionMatrix();
    camera.position.set(target.x + Math.sin(view.yaw) * distance * 0.62, distance * 0.78,
      target.z + Math.cos(view.yaw) * distance * 0.62);
    camera.lookAt(target); camera.updateMatrixWorld();
  }
  function fitSpan() { return Math.max(HALF_Z * 2 + 30, (HALF_X * 2 + 32) * canvas.clientHeight / Math.max(1, canvas.clientWidth)); }
  function homeCamera() { const p=baseOf(localTeam)?.mesh.position; Object.assign(view, { x: p?.x||0, z: p?.z||0, yaw: 0.27, span: 48 }); updateCamera(); }
  let previousFit = 0;
  function resize() {
    renderer.setSize($('viewport').clientWidth, $('viewport').clientHeight, false);
    const fit = fitSpan();
    if (previousFit) view.span *= fit / previousFit;
    previousFit = fit;
    updateCamera();
  }
  function applyGraphics() {
    const quality=$('graphics-quality').value;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,quality==='performance'?1:quality==='balanced'?1.25:2));
    renderer.shadowMap.enabled=quality!=='performance';
    const shadowSize=quality==='high'?2048:1024;
    if(sun.shadow.mapSize.x!==shadowSize){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(shadowSize,shadowSize);}
    renderer.shadowMap.needsUpdate=true;
    resize();
  }
  new ResizeObserver(resize).observe($('viewport'));
  function screenPosition(position) {
    const point = position.clone().project(camera), rect = canvas.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2, visible: point.z >= -1 && point.z <= 1 };
  }
  function updateLabels() {
    const selectedDefense = selected.size === 1 ? [...selected][0] : null;
    const rallyBuilding=selectedDefense&&isProducer(selectedDefense)&&active(selectedDefense)?selectedDefense:null;
    rallyGuide.visible=rallyLine.visible=Boolean(rallyBuilding&&!placement);
    if(rallyLine.visible){const end=rallyBuilding.rallyPoint||rallyBuilding.exitPoint.clone().add(rallyBuilding.exitPoint.clone().sub(rallyBuilding.mesh.position).setY(0).normalize().multiplyScalar(4));
      rallyGuide.position.copy(end);rallyGuide.position.y=.24;const a=rallyLine.geometry.attributes.position;a.setXYZ(0,rallyBuilding.exitPoint.x,.24,rallyBuilding.exitPoint.z);a.setXYZ(1,end.x,.24,end.z);a.needsUpdate=true;rallyLine.geometry.computeBoundingSphere();rallyLine.computeLineDistances();}
    const rangeKind = placement ? (STRUCTURE[placement].defense && ghost.visible ? placement : null) : selectedDefense && isBuilding(selectedDefense) && STRUCTURE[selectedDefense.kind].defense ? selectedDefense.kind : null;
    const rangePosition = placement ? placementPoint : selectedDefense?.mesh.position;
    defenseRange.visible = Boolean(rangeKind && rangePosition);
    if (defenseRange.visible) { defenseRange.position.set(rangePosition.x, .12, rangePosition.z); defenseRange.scale.setScalar(STRUCTURE[rangeKind].range); }
    const yard=selectedDefense&&isBuilding(selectedDefense)&&selectedDefense.team===localTeam&&active(selectedDefense)&&STRUCTURE[selectedDefense.kind].serviceRange?selectedDefense:null;
    serviceRange.visible=Boolean(yard&&!placement);if(yard){serviceRange.position.copy(yard.exitPoint);serviceRange.position.y=yard.kind==='shipyard'?.25:.12;serviceRange.scale.setScalar(STRUCTURE[yard.kind].serviceRange);}
    const rect = canvas.getBoundingClientRect();
    for (const e of [...living(), ...fields]) {
      const height = e.type === 'ore' ? 2 : isBuilding(e) ? (e.visualHeight || STRUCTURE[e.kind].height || (e.kind === 'base' ? 5.3 : 3.9)) : e.kind === 'tesla' ? 3.4 : ['miner', 'rocket', 'repair'].includes(e.kind) ? 2.6 : 2;
      const p = screenPosition(e.mesh.position.clone().add(new THREE.Vector3(0, height+(e.body?.position.y||0), 0)));
      e.label.hidden = !visibleTo(e) || !p.visible || p.x < rect.left || p.x > rect.right || p.y < rect.top || p.y > rect.bottom;
      e.label.style.left = `${p.x - rect.left}px`; e.label.style.top = `${p.y - rect.top}px`;
      e.healthFill.style.width = `${Math.max(0, e.type === 'ore' ? e.amount / e.initialAmount * 100 : e.hp / e.maxHp * 100)}%`;
      const isSelected = selected.has(e);
      e.label.classList.toggle('is-selected', isSelected);
      if (e.selectionFrame) {
        e.selectionFrame.hidden = !isSelected || e.label.hidden;
        if (isSelected && !e.label.hidden) {
          const radius = isBuilding(e) ? e.radius : Math.max(1.5, e.radius * 1.25), points = [];
          for (const x of [-radius, radius]) for (const z of [-radius, radius]) for (const y of [0, height - .3])
            points.push(screenPosition(e.mesh.position.clone().add(new THREE.Vector3(x, y, z))));
          const left = Math.min(...points.map(p => p.x)) - rect.left - 4, top = Math.min(...points.map(p => p.y)) - rect.top - 4;
          const width = Math.max(26, Math.max(...points.map(p => p.x)) - rect.left - left + 4);
          const frameHeight = Math.max(22, Math.max(...points.map(p => p.y)) - rect.top - top + 4);
          Object.assign(e.selectionFrame.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${frameHeight}px` });
          e.label.style.top = `${top - 5}px`;
        }
      }
      if (e.type === 'ore') {
        e.labelTitle.textContent = `${e.name} · ${Math.ceil(e.amount).toLocaleString()}`;
        e.mesh.children.slice(1).forEach(o => o.visible = e.amount > 0);
      } else if (isBuilding(e)) {
        e.labelTitle.textContent = e.buildLeft ? `BUILDING · ${Math.ceil(e.buildLeft)}s` : (e.team !== localTeam && e.kind === 'base' ? 'ENEMY HQ' : STRUCTURE[e.kind].name.toUpperCase())+(e.repairing?' · REPAIRING':'')+(e.repairTarget?' · UNIT REPAIR':'');
      } else if (e.kind === 'miner') e.labelTitle.textContent = `${Math.floor(e.cargo)} / ${UNIT.miner.capacity}`;
      else e.labelTitle.textContent = isSelected ? UNIT[e.kind].name.toUpperCase() : e.kind === 'artillery' ? 'SIEGE' : e.kind === 'heavy' ? 'HEAVY' : '';
    }
  }
  function updateUI() {
    updateTerritoryGuide();
    if(placement && placementPoint && ghost.visible){const error=placementError(placement,placementPoint);ghostMat.color.set(error?'#ff675c':'#9dffc6');$('build-status').textContent=error||`Left-click to deploy · ${STRUCTURE[placement].cost} credits`;}
    document.querySelector('.swatch.friendly').style.background=teamColors[localTeam];
    const myCredits = money(localTeam), myQueue = queueFor(localTeam), myDelivered = deliveredFor(localTeam);
    const held = Boolean(net?.active && !net.playable);
    const friendly = friendlyUnits(), miners = friendly.filter(u => u.kind === 'miner'), power = powerFor(localTeam);
    $('credits').textContent = Math.floor(myCredits).toLocaleString(); $('army').textContent = `${friendly.length} / 24`;
    $('income').textContent = `${Math.floor(myDelivered)} ore · ${battleRewards[localTeam]||0} rewards`;
    $('income').title = 'Ore deliveries + battle rewards earned. Enemy kills pay 50% of build cost; HQs pay 300. No refinery needed for rewards.';
    if(performance.now()>rewardUntil)$('reward-notice').hidden=true;
    $('power').textContent = `${power.supply} / ${power.used}`; $('power').classList.toggle('low-power', power.low);
    $('power').title = 'Supply / usage';
    $('mining-status').textContent = `${miners.filter(u => u.mining).length} / ${miners.length} miners working`;
    $('selected-count').textContent = `${selected.size} selected`;
    const selection = [...selected], first = selection[0];
    const structure=selection.length===1&&isBuilding(first)&&first.team===localTeam&&first.hp>0?first:null;
    $('structure-actions').hidden=!structure;
    if(structure){
      $('structure-action-name').textContent=`${STRUCTURE[structure.kind].name} · ${Math.ceil(structure.hp)} / ${structure.maxHp} HP`;
      const needed=Math.ceil((structure.maxHp-structure.hp)*repairPrice(structure));
      $('structure-repair').textContent=structure.repairing?'Stop repairs':`Repair · $${needed}`;
      $('structure-repair').setAttribute('aria-pressed',String(Boolean(structure.repairing)));
      $('structure-repair').disabled=Boolean(outcome)||held||Boolean(structure.buildLeft)||(!structure.repairing&&structure.hp>=structure.maxHp);
      $('structure-sell').textContent=structure.kind==='base'?'HQ cannot be sold':`Sell · +$${saleValue(structure)}`;
      $('structure-sell').disabled=Boolean(outcome)||held||structure.kind==='base';
      $('structure-action-help').textContent=structure.repairing?(myCredits>0?'Repairing: 25 health/sec. Stops at full health.':'Repairs waiting for credits; resumes automatically.'):structure.buildLeft?'Repairs unlock when construction finishes. Selling returns half its cost, adjusted for damage.':structure.kind==='base'?'HQ repairs cost credits as health returns. Your HQ cannot be sold.':'Repair: pay as health returns (25 HP/sec). Sell: 50% value, reduced for damage. Production orders stay queued.';
      if(STRUCTURE[structure.kind].serviceRange&&!structure.buildLeft){const def=STRUCTURE[structure.kind];$('structure-action-help').textContent+=` Auto repair: ${structure.repairTarget?UNIT[structure.repairTarget.kind].name:myCredits<=0?'waiting for credits':structure.kind==='shipyard'?'bring ships into the green bay':'bring vehicles into the green bay'}. One unit at ${def.serviceRate} HP/sec (half on low power). Cost: half its build price for a full health bar. Select units, then right-click this building.`;}
    }
    $('selection-name').textContent = first ? selected.size === 1 ? stats(first).name : `${selected.size} units selected` : 'Command your force';
    if (first) {
      const hp = selection.reduce((s, u) => s + u.hp, 0), maxHp = selection.reduce((s, u) => s + u.maxHp, 0);
      $('selection-detail').textContent = selected.size === 1 && isBuilding(first)
        ? `${Math.ceil(hp)} / ${maxHp} health · ${first.buildLeft ? `Online in ${Math.ceil(first.buildLeft)}s` : isProducer(first)?'Right-click clear ground to set the rally point.':'Operational'}`
        : `${Math.ceil(hp)} / ${maxHp} health · ${selection.every(u => u.kind === 'miner') ? 'Right-click gold ore to harvest.' : selection.every(u => u.kind === 'repair') ? 'Unarmed support. Move with combat units to follow behind, or right-click a friendly vehicle to escort it.' : 'Right-click ground to move or an enemy to attack.'}`;
      const counts = new Map(); selection.forEach(u => counts.set(u.kind, (counts.get(u.kind) || 0) + 1));
      $('selection-extra').textContent = [...counts].map(([kind, count]) => `${count} ${UNIT[kind]?.name || STRUCTURE[kind].name}`).join(' · ');
      if (first.kind === 'miner' && selection.length === 1) $('selection-extra').textContent = `${first.state} · cargo ${Math.floor(first.cargo)} / ${UNIT.miner.capacity}`;
    } else {
      $('selection-detail').textContent = 'Left-click / drag to select. Right-click to command. Double-click selects matching units.'; $('selection-extra').textContent = '';
    }
    for (const [kind, def] of Object.entries(UNIT)) {
      const button = $(`train-${kind}`), count = myQueue.filter(q => q.kind === kind).length, current = currentProduction(myQueue, kind)?.kind === kind ? currentProduction(myQueue, kind) : null;
      const locked = !producerFor(kind, localTeam);
      const unavailable = locked || myCredits < def.cost || friendly.length + myQueue.length >= 24;
      button.disabled = Boolean(outcome) || held || (unavailable && !count);
      button.classList.toggle('locked', locked);
      button.title = `${def.name} — ${def.role}. ${locked ? 'Requires completed ' : 'Produced at '}${STRUCTURE[def.producer].name}. Right-click refunds a queued unit.`;
      button.classList.toggle('unavailable', unavailable); button.classList.toggle('producing', Boolean(current));
      button.querySelector('.build-count').hidden = !count; button.querySelector('.build-count').textContent = count;
      button.querySelector('.card-state').textContent = locked ? `${count ? 'PAUSED · ' : 'NEEDS '}${STRUCTURE[def.producer].name.toUpperCase()}` : current ? current.progress>=def.time?'EXIT BLOCKED':`${Math.floor(current.progress / def.time * 100)}%` : count ? 'QUEUED' : unavailable ? 'UNAVAILABLE' : 'READY';
      button.style.setProperty('--progress', current ? Math.min(1, current.progress / def.time) : 0);
    }
    for (const kind of BUILDABLE) {
      const button = $(`build-${kind}`), def = STRUCTURE[kind], pending = buildings.filter(b => b.team === localTeam && b.kind === kind && b.hp > 0 && b.buildLeft > 0);
      const missing=missingStructures(kind,localTeam);
      button.disabled = Boolean(outcome) || held || myCredits < def.cost || missing.length>0 || kind==='shipyard'&&!MAP.water.length;
      button.classList.toggle('locked',missing.length>0);button.title=missing.length?prerequisiteMessage(kind,localTeam):`${def.name} · $${def.cost}`;
      button.classList.toggle('deploying', placement === kind);
      button.querySelector('.build-count').hidden = !pending.length; button.querySelector('.build-count').textContent = pending.length;
      button.querySelector('.card-state').textContent = kind==='shipyard'&&!MAP.water.length?'WATER MAP ONLY':missing.length?'NEEDS '+missing.map(k=>STRUCTURE[k].name).join(' + ').toUpperCase():placement === kind ? 'PLACE' : pending.length ? 'BUILDING' : 'DEPLOY';
      button.style.setProperty('--progress', pending.length ? 1 - pending[0].buildLeft / def.time : 0);
    }
    for (let i = 1; i <= 9; i++) {
      const ids = (controlGroups.get(String(i)) || []).filter(id => friendly.some(u => u.id === id));
      $(`group-${i}`).classList.toggle('assigned', Boolean(ids.length));
      $(`group-${i}`).setAttribute('aria-label', `Group ${i}: ${ids.length} units. Control-click to assign.`);
    }
    drawRadar();
    $('stop').disabled = !selection.some(u => u.type === 'unit') || Boolean(outcome);
    $('harvest').disabled = !selection.some(u => u.kind === 'miner') || Boolean(outcome);
    $('raid-status').textContent = net?.active ? (held ? 'Network match paused — open Multiplayer' : `${matchTeams.length} commanders · ${matchTeams.length-eliminated.length} remain · ${eliminated.includes(localTeam)?'HQ lost':paused?'paused':'connected'}`) : raids ? `Enemy: ${commander.mode} · ${commander.mode === 'Attacking' ? 'strike force active' : `next push ≥ ${Math.max(0, Math.ceil(nextRaid - elapsed))}s`}` : 'Raids off · enemies defend their base';
    $('inspector').textContent = first ? `${stats(first).name} #${first.id}\nstate  ${first.buildLeft ? 'Construction' : first.state || 'Operational'}\nx  ${first.mesh.position.x.toFixed(2)}  z  ${first.mesh.position.z.toFixed(2)}\nhealth  ${Math.ceil(first.hp)} / ${first.maxHp}${first.kind === 'miner' ? `\ncargo  ${Math.floor(first.cargo)} / ${UNIT.miner.capacity}\nfield  ${first.field?.name || 'none'}\ncycle  ${first.mineState}` : first.type === 'unit' ? `\nrange  ${stats(first).range}  damage  ${stats(first).damage}\npath  ${first.path.length} waypoints` : ''}` : 'Select a unit or building to inspect it.';
    if (net?.active) { $('pause').disabled = !net.isHost || held; $('reset').textContent = outcome && net.isHost ? 'Rematch' : 'Lobby'; $('play-again').textContent = net.isHost ? 'Request rematch' : 'Open lobby'; }
    else { $('pause').disabled = false; $('reset').textContent = 'New battle'; $('play-again').textContent = 'Choose next map'; }
    updateOpponentUI();
    $('speed').disabled = Boolean(net?.active); $('raids').disabled = Boolean(net?.active);
    if (performance.now() > alertUntil) $('announcement').textContent = placement ? 'Click to place the structure · Escape cancels' : paused ? 'Simulation paused. Explore the camera or queue orders.' : power.low ? 'Low power. Build another power plant.' : 'F: army · M: miners · H: harvest · Right-click: command';
  }

  // NETWORK ADAPTER. Only the host advances rules; a guest renders snapshots.
  // Commands identify units, but ownership is always checked against the seat.
  function applyNetworkCommand(team, action) {
    if (!net?.isHost || !net.playable || outcome || (eliminated.includes(team)&&action.type!=='pause')) return;
    const squad = (action.ids || []).map(id => (['rally','repairStructure','sellStructure'].includes(action.type)?buildings:units).find(u => u.id === id && u.team === team && u.hp>0)).filter(Boolean);
    if (action.ids && squad.length !== new Set(action.ids).size) { net.feedback(team, 'Order rejected: you can only command your own units or buildings.'); return; }
    applyingCommand = true; commandTeam = team;
    try {
      if (action.type === 'rally')setRally(new THREE.Vector3(action.point.x,0,action.point.z),squad,team);
      if (action.type === 'queue') queueUnit(action.kind, team, action.producerId);
      if (action.type === 'cancelQueue') cancelQueue(team, action.kind);
      if (action.type === 'repairStructure') repairStructure(squad[0],action.enabled,team);
      if (action.type === 'sellStructure') sellStructure(squad[0],team);
      if (action.type === 'stop') stopSelected(squad);
      if (action.type === 'harvest') harvestSelected(squad);
      if (action.type === 'pause' && team === 'player') togglePause();
      if (action.type === 'build') placeBuilding(new THREE.Vector3(action.point.x, 0, action.point.z), action.kind, team);
      if (action.type === 'order') {
        const target = [...living(), ...fields].find(e => e.id === action.targetId) || null;
        issueOrder(new THREE.Vector3(action.point.x, 0, action.point.z), target, squad, team);
      }
    } finally { applyingCommand = false; commandTeam = null; lastPublished=0; }
  }
  function networkMode(team) {
    networkRenderTime=null;networkFogAt=0;lastPublished=0;
    localTeam = team; simSpeed = 1; $('speed').value = 1; $('speed-value').textContent = '1×';
    cancelPlacement(); startGame();
  }
  const vectorJSON = v => v ? { x: Math.round(v.x*1000)/1000, y: Math.round(v.y*1000)/1000, z: Math.round(v.z*1000)/1000 } : null;
  const fromJSON = v => v ? new THREE.Vector3(v.x, v.y || 0, v.z) : null;
  function exportNetworkState() {
    return { mapId:MAP.id, matchTeams, extraEconomies, eliminated, battleRewards, lastRewards, voiceEvents:voiceEvents.filter(e=>elapsed-e.time<12), nextVoiceId, attackAlertAt, powerAlertState, fogExplored:fog.save(true), elapsed, credits, enemyCredits, delivered, enemyDelivered, queue, remoteQueue, paused, winner, seed, nextId, nextShotId, nextFXId, fxEvents,
      fields: fields.map(f => ({ id: f.id, amount: f.amount, initialAmount:f.initialAmount,name:f.name,x:f.mesh.position.x,z:f.mesh.position.z })),
      entities: living().map(e => ({ id: e.id, kind: e.kind, type: e.type, team: e.team, position: vectorJSON(e.mesh.position), hp: e.hp, rallyPoint:vectorJSON(e.rallyPoint),
        buildLeft: e.buildLeft || 0, repairing:Boolean(e.repairing), body: e.body?.rotation.y || 0, turret: e.turret?.rotation.y || 0, rotor: e.rotor?.rotation.y || 0,
        cooldown: e.cooldown, shotSide: e.shotSide || 1, flashLeft: e.flashLeft || 0, repairTargetId: e.repairTarget?.id, cargo: e.cargo, mining: e.mining, mineState: e.mineState, state: e.state,
        fieldId: e.field?.id, preferredRefineryId: e.preferredRefinery?.id, unload: e.unload,
        supportIds:e.supportIds, supportHeading:vectorJSON(e.supportHeading), supportSlot:e.supportSlot,
        harvestAccumulator: e.harvestAccumulator || 0, destination: vectorJSON(e.destination), targetId: e.attackTarget?.id,
        path: e.path?.map(vectorJSON), pathGoal: vectorJSON(e.pathGoal), repath: e.repath })),
      shells: shells.map(s => ({ id: s.id, targetId: s.target.id, team: s.team, damage: s.damage, splash: s.splash, targetAir:s.targetAir, weapon: s.weapon, visual: s.visual, arc: s.arc,
        origin: vectorJSON(s.origin), aim: vectorJSON(s.aim), position: vectorJSON(s.mesh.position), age: s.age, duration: s.duration })),
      bursts: bursts.map(b => ({ position: vectorJSON(b.mesh.position), life: b.life, size: b.size })) };
  }
  function importNetworkState(state, restoring = false) {
    if (!state || !Array.isArray(state.entities)) return;
    chooseMap(state.mapId);
    networkSampleAt=performance.now();networkSampleElapsed=state.elapsed;
    if(restoring||networkRenderTime===null)networkRenderTime=state.elapsed-.075;
    matchTeams=state.matchTeams;extraEconomies=structuredClone(state.extraEconomies);eliminated=[...state.eliminated];
    if(fields.length!==state.fields.length || fields.some((f,i)=>f.id!==state.fields[i].id || f.mesh.position.x!==state.fields[i].x || f.mesh.position.z!==state.fields[i].z)){
      for(const f of fields){deposits.remove(f.mesh);f.label.remove();}fields=[];
      for(const f of state.fields){const field=createField(f.x,f.z,f.initialAmount,f.name);field.id=f.id;}
    }
    fog.restore(state.fogExplored);
    credits = state.credits; enemyCredits = state.enemyCredits; delivered = state.delivered; enemyDelivered = state.enemyDelivered;
    const oldRewards=battleRewards[localTeam]||0;
    battleRewards={...(state.battleRewards||{})};lastRewards=structuredClone(state.lastRewards||{});
    const gained=(battleRewards[localTeam]||0)-oldRewards;
    if(!restoring&&gained>0)showReward(gained,lastRewards[localTeam]);
    queue = state.queue.map(q => ({ ...q })); remoteQueue = state.remoteQueue.map(q => ({ ...q }));
    paused = state.paused; elapsed = state.elapsed; seed = state.seed; winner = state.winner;
    if($('pause').getAttribute('aria-pressed')!==String(paused))updatePause();
    const byId = new Map(living().map(e => [e.id, e])), keep = new Set(state.entities.map(e => e.id));
    for (const e of living()) if (!keep.has(e.id)) { releaseUnitDamage(e);e.hp = 0; e.mesh.visible = false; actors.remove(e.mesh); e.label.remove(); e.selectionFrame?.remove(); selected.delete(e); }
    units = units.filter(e => keep.has(e.id)); buildings = buildings.filter(e => keep.has(e.id));
    for (const data of state.entities) {
      let e = byId.get(data.id), fresh = !e;
      if (!e) {
        e = data.type === 'building' ? createBuilding(data.kind, data.team, data.position.x, data.position.z) : createUnit(data.kind, data.team, data.position.x, data.position.z);
        e.id = data.id; byId.set(e.id, e);
      }
      const position = fromJSON(data.position); e.netPosition = position;
      if (fresh || restoring || net?.isHost) {e.mesh.position.copy(position);e.netSamples=[];}
      e.netSamples ||= [];const sample={time:state.elapsed,position,body:data.body,turret:data.turret,rotor:data.rotor};
      if(e.netSamples.at(-1)?.time===state.elapsed)e.netSamples[e.netSamples.length-1]=sample;else e.netSamples.push(sample);
      if(e.netSamples.length>6)e.netSamples.shift();
      if(e.type==='building')e.rallyPoint=fromJSON(data.rallyPoint);
      e.hp = data.hp; e.buildLeft = data.buildLeft; e.mesh.scale.y = data.buildLeft ? .15 + .85 * (1 - data.buildLeft / STRUCTURE[e.kind].time) : 1;
      e.repairing=Boolean(data.repairing);
      if(fresh||restoring||net?.isHost){if(e.body)e.body.rotation.y=data.body;if(e.turret)e.turret.rotation.y=data.turret;if(e.rotor)e.rotor.rotation.y=data.rotor;}
      for (const key of ['cooldown','shotSide','flashLeft','cargo','mining','mineState','state','unload','harvestAccumulator','repath']) if (data[key] !== undefined) e[key] = data[key];
      if (e.type === 'unit') {
        e.supportIds=[...(data.supportIds||[])];e.supportHeading=fromJSON(data.supportHeading);e.supportSlot=data.supportSlot||0;
        e.destination = fromJSON(data.destination); e.path = (data.path || []).map(fromJSON); e.pathGoal = fromJSON(data.pathGoal); e.pathVersion = -1;
        e.field = fields.find(f => f.id === data.fieldId) || null;
        if (e.cargoMesh) { e.cargoMesh.visible = e.cargo > 0; e.cargoMesh.scale.y = .6 * Math.max(.08, e.cargo / UNIT.miner.capacity); }
      }
    }
    for (const data of state.entities) {
      const e = byId.get(data.id); e.attackTarget = keep.has(data.targetId) ? byId.get(data.targetId) : null;
      e.repairTarget = keep.has(data.repairTargetId) ? byId.get(data.repairTargetId) : null;
      e.preferredRefinery = keep.has(data.preferredRefineryId) ? byId.get(data.preferredRefineryId) : null;
    }
    for (const f of state.fields) { const field = fields.find(e => e.id === f.id); if (field) field.amount = f.amount; }
    for (const shell of shells) effects.remove(shell.mesh);
    shells = [];
    for (const s of state.shells || []) {
      const target = byId.get(s.targetId); if (!target || !keep.has(target.id)) continue;
      const obj = projectile(s.weapon, s.splash); obj.position.copy(fromJSON(s.position)); obj.lookAt(fromJSON(s.aim));
      shells.push({ ...s, mesh: obj, target, origin: fromJSON(s.origin), aim: fromJSON(s.aim) });
    }
    for (const b of bursts) { effects.remove(b.mesh); b.mesh.material.dispose(); }
    bursts = [];
    for (const b of state.bursts || []) {
      explode(fromJSON(b.position), b.size); const burst = bursts[bursts.length - 1]; burst.life = b.life;
      burst.mesh.scale.setScalar(b.size * (1 - b.life / .5) + .1); burst.mesh.material.opacity = Math.max(0, b.life / .5);
    }
    if(restoring||networkSampleAt-networkFogAt>=100){refreshFog();networkFogAt=networkSampleAt;}
    fxEvents=(state.fxEvents || []).map(event => ({...event})); nextFXId=state.nextFXId || 1;
    for (const event of fxEvents) if(event.id>lastVisualEvent) playWeaponEvent(event,restoring);
    nextId = state.nextId; nextShotId = state.nextShotId; seed = state.seed; navVersion++;
    voiceEvents=(state.voiceEvents||[]).map(e=>({...e}));nextVoiceId=state.nextVoiceId||1;attackAlertAt={...(state.attackAlertAt||{})};
    powerAlertState=structuredClone(state.powerAlertState||{});
    syncVoiceState();if(!powerFor(localTeam).low)window.FieldVoice?.discard('lowPower');
    if(restoring){window.FieldVoice?.reset();lastVoiceId=nextVoiceId-1;}
    else for(const event of voiceEvents)if(event.id>lastVoiceId){lastVoiceId=event.id;if(event.team===localTeam&&state.elapsed-event.time<3&&(event.type!=='lowPower'||powerFor(localTeam).low))window.FieldVoice?.notify(event);}
    outcome = winner ? winner === localTeam ? 'victory' : 'defeat' : '';
    showResult(); shadeScene();
    living().forEach(e => e.ring.visible = selected.has(e)); if(restoring){updatePause();updateUI();}
  }
  function interpolateNetwork(dt) {
    if(networkRenderTime===null)return;
    const hold=paused||outcome||!net.playable;
    const desired=networkSampleElapsed+Math.min(.1,(performance.now()-networkSampleAt)/1000)-.075;
    if(hold)networkRenderTime=networkSampleElapsed;
    else {networkRenderTime+=dt;const drift=desired-networkRenderTime;networkRenderTime+=Math.abs(drift)>.25?drift:THREE.MathUtils.clamp(drift,-dt*.1,dt*.1);}
    for(const e of living()){
      const samples=e.netSamples;if(!samples?.length)continue;
      let a=samples[0],b=a;for(const sample of samples){b=sample;if(sample.time>=networkRenderTime)break;a=sample;}
      const alpha=b.time>a.time?THREE.MathUtils.clamp((networkRenderTime-a.time)/(b.time-a.time),0,1):1;
      e.mesh.position.copy(a.position).lerp(b.position,alpha);
      for(const key of ['body','turret','rotor'])if(e[key]&&Number.isFinite(a[key])&&Number.isFinite(b[key]))e[key].rotation.y=a[key]+Math.atan2(Math.sin(b[key]-a[key]),Math.cos(b[key]-a[key]))*alpha;
    }
  }
  // One render-driven fixed-step loop for solo and the authoritative host.
  // The explicit visibility gate still pauses network play when the host is hidden.
  let lastPublished=0,networkRenderTime=null,networkSampleAt=0,networkSampleElapsed=0,networkFogAt=0;

  // 9. FIXED-STEP LOOP. State changes use simulation time; the camera uses real time.
  let lastTime = performance.now(), accumulator = 0, uiTimer = 0, fpsTimer = 0, frames = 0;
  const FIXED_STEP = 1 / 60;
  function frame(now) {
    requestAnimationFrame(frame);
    syncVoiceState();
    if (document.hidden) { lastTime = now; return; }
    const realDt = Math.min((now - lastTime) / 1000, .1); lastTime = now;
    let edgeX = 0, edgeZ = 0;
    if (pointer && !drag && !document.querySelector('dialog[open]')) {
      const r = canvas.getBoundingClientRect(), margin = 18;
      if (pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom) {
        edgeX = pointer.x < r.left + margin ? -1 : pointer.x > r.right - margin ? 1 : 0;
        edgeZ = pointer.y < r.top + margin ? -1 : pointer.y > r.bottom - margin ? 1 : 0;
      }
    }
    const dx = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + edgeX, dz = Number(keys.has('KeyS')) - Number(keys.has('KeyW')) + edgeZ;
    view.x = THREE.MathUtils.clamp(view.x + (dx * Math.cos(view.yaw) + dz * Math.sin(view.yaw)) * realDt * 30, -HALF_X + 4, HALF_X - 4);
    view.z = THREE.MathUtils.clamp(view.z + (-dx * Math.sin(view.yaw) + dz * Math.cos(view.yaw)) * realDt * 30, -HALF_Z + 2, HALF_Z - 2);
    view.yaw += (Number(keys.has('KeyE')) - Number(keys.has('KeyQ'))) * realDt;
    if (dx || dz || keys.has('KeyE') || keys.has('KeyQ')) updateCamera();
    if (!net?.active || net.isHost&&net.playable) {
      accumulator += realDt * (net?.active?1:simSpeed);
      while (accumulator >= FIXED_STEP) { simulate(FIXED_STEP); accumulator -= FIXED_STEP; }
    } else {accumulator=0;if(!net.isHost)interpolateNetwork(realDt);}
    if(net?.canPublish&&now-lastPublished>=50){lastPublished=now;net.publish(exportNetworkState());}
    const visualDt = paused || outcome || (net?.active && !net.playable) ? 0 : realDt * (net?.active ? 1 : simSpeed);
    weaponFX.update(visualDt); animateVehicles(visualDt); shadeScene(); renderer.render(scene, camera); updateLabels();
    uiTimer += realDt; fpsTimer += realDt; frames++;
    if (uiTimer > .12) { window.IronFieldMusic?.setBattleState(!paused&&!winner&&(!net?.active||net.playable));updateUI(); uiTimer = 0; }
    if (fpsTimer > .8) { $('render-stats').textContent = `${Math.round(frames / fpsTimer)} FPS · ${renderer.info.render.triangles.toLocaleString()} TRIANGLES · WEBGL`; fpsTimer = 0; frames = 0; }
  }
  // Console diagnostics return copies, so inspection cannot alter the simulation.
  window.IronField = Object.freeze({
    snapshot: () => ({ version: 12, matchTeams:[...matchTeams],eliminated:[...eliminated],winner,fog:fog.summary(localTeam), map: { id:MAP.id,name:MAP.name,water:MAP.water,bridges:MAP.bridges,width: HALF_X * 2, depth: HALF_Z * 2, buildRadius: MAP.buildRadius }, localTeam, network: { active: Boolean(net?.active), role: net?.role, code: net?.session?.code, phase: net?.room?.phase, playable: Boolean(net?.playable) }, credits: money(localTeam), delivered: deliveredFor(localTeam), rewards: battleRewards[localTeam]||0, enemyCredits, queue: queueFor(localTeam).map(q => ({ ...q })), paused, outcome, elapsed,
      camera: camera.type, cameraView: { ...view }, power: powerFor(localTeam), raids, nextRaid, wave, ai: net?.active ? null : {style:opponentStyle,policy:aiPolicy().name,plan:currentModelPlan()?{...currentModelPlan()}:null,intent:commander.intent,decisions:commander.decisions,events:commander.events.map(e=>({...e})),model:commander.model,pending:commander.pending,status:commander.modelStatus,mode:commander.mode,targetId:commander.targetId,queue:remoteQueue.map(q=>({...q}))}, placement, selected: [...selected].map(u => u.id),
      fields: fields.map(f => ({ id: f.id, name: f.name, amount: f.amount, x: f.mesh.position.x, z: f.mesh.position.z })),
      entities: living().map(e => ({ visible:visibleTo(e),rendered:e.mesh.visible,labelHidden:e.label.hidden,id: e.id, type: e.type, kind: e.kind, team: e.team, hp: e.hp, maxHp: e.maxHp,
        x: e.mesh.position.x, y:e.mesh.position.y, z: e.mesh.position.z, exitPoint:vectorJSON(e.exitPoint),rallyPoint:vectorJSON(e.rallyPoint),state: e.state, cargo: e.cargo, mining: e.mining, mineState: e.mineState,
        field: e.field?.id, buildLeft: e.buildLeft, repairing:Boolean(e.repairing), destination: e.destination ? { x: e.destination.x, z: e.destination.z } : null,
        supportIds:[...(e.supportIds||[])],supportHeading:vectorJSON(e.supportHeading),repairTarget: e.repairTarget?.id, attackTarget: e.attackTarget?.id, pathLength: e.path?.length })) }),
    project: (x, y, z) => screenPosition(new THREE.Vector3(x, y, z))
  });
  try {const saved=localStorage.getItem('iron-field-graphics');if(['high','balanced','performance'].includes(saved))$('graphics-quality').value=saved;} catch {}
  applyGraphics();
  resize(); startGame();
  net = new FieldNetwork({ mode: networkMode, solo: () => { raids = $('raids').checked; startGame(); }, start: () => { $('map-dialog').close();chooseMap(net.room.mapId);simSpeed = 1; startGame(); }, state: importNetworkState, command: applyNetworkCommand, notice: announce, status: () => { updatePause(); updateUI(); } });
  if(!sessionStorage.getItem('iron-field-room')&&!new URLSearchParams(location.search).has('room'))openMapSetup();
  requestAnimationFrame(frame);
})();


