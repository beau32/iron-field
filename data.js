/* Unit and building definitions: change these numbers to explore balance.
   Speeds are world units/second; durations are simulation seconds. */
(() => {
const data = {
  units: {
    patrolBoat: { name:'Reef patrol boat', role:'Fast naval scout · rapid deck cannon · shore and ship targets', naval:true, producer:'shipyard', cost:160, time:6, hp:180, speed:6, damage:18, range:12, reload:.75, radius:1.2, icon:'⚓' },
    frigate: { name:'Tide missile frigate', role:'Fleet escort · missiles against ships, ground and aircraft', naval:true, producer:'shipyard', targets:'all', cost:320, time:10, hp:340, speed:4.2, damage:52, range:20, reload:2.8, radius:1.5, splash:1.7, weapon:'rocket', icon:'↗' },
    battleship: { name:'Storm bombardment ship', role:'Heavy twin guns · long-range shore bombardment · no anti-air', naval:true, producer:'shipyard', cost:480, time:16, hp:620, speed:2.8, damage:95, range:30, reload:4.5, radius:1.8, splash:3.6, weapon:'shell', icon:'▰' },
    gunship: { name:'Falcon gunship', role:'VTOL ground attack · rapid autocannon · flies over ridges', aircraft:true, altitude:8, producer:'airfield', cost:320, time:10, hp:180, speed:7, damage:18, range:10, reload:.65, radius:1.2, icon:'✦' },
    interceptor: { name:'Swift interceptor', role:'Air superiority · guided anti-air missiles · air targets only', aircraft:true, targets:'air', altitude:10, producer:'airfield', cost:280, time:9, hp:140, speed:11, damage:48, range:15, reload:2, radius:1.1, weapon:'rocket', icon:'➤' },
    bomber: { name:'Thunder bomber', role:'VTOL bomber · heavy ground-area damage · vulnerable to anti-air', aircraft:true, altitude:9, producer:'airfield', cost:440, time:14, hp:220, speed:5.5, damage:90, range:6, reload:4.5, radius:1.5, splash:3.5, weapon:'bomb', icon:'▼' },
    rifleman: { name: 'Rifleman', role: 'Affordable infantry · rapid rifle fire', infantry: true, producer: 'garrison', cost: 60, time: 3, hp: 60, speed: 3.6, damage: 7, range: 7, reload: .55, radius: .4, icon: '♟' },
    rocketTrooper: { name: 'Rocket trooper', role: 'Portable rockets · area damage · fragile', infantry: true, producer: 'garrison', cost: 110, time: 5, hp: 70, speed: 3, damage: 32, range: 10, reload: 2.6, radius: .45, splash: 1.8, weapon: 'rocket', icon: '↗' },
    sniper: { name: 'Sniper', role: 'Long-range precision rifle · low health', infantry: true, producer: 'garrison', cost: 140, time: 6, hp: 45, speed: 3.2, damage: 42, range: 14, reload: 3, radius: .4, weapon: 'rail', icon: '⌖' },
    scout: { name: 'Scout buggy', role: 'Fast reconnaissance · light armor', cost: 80, time: 3, hp: 75, speed: 6.5, damage: 8, range: 7.5, reload: .48, radius: .65, icon: '◇' },
    tank: { name: 'Battle tank', role: 'Balanced frontline armor', cost: 140, time: 5, hp: 160, speed: 4.1, damage: 24, range: 9, reload: 1.1, radius: .9, icon: '▰' },
    heavy: { name: 'Heavy tank', role: 'Twin cannons · durable breakthrough unit', cost: 260, time: 8, hp: 330, speed: 2.8, damage: 44, range: 9.5, reload: 1.5, radius: 1.15, icon: '▣' },
    artillery: { name: 'Siege artillery', role: 'Long range · area damage · fragile', cost: 220, time: 7, hp: 105, speed: 3.1, damage: 48, range: 15, reload: 3.2, radius: .9, splash: 2.8, icon: '↗' },
    destroyer: { name: 'Tank destroyer', role: 'Long-range precision cannon · light armor', cost: 280, time: 9, hp: 140, speed: 3.5, damage: 78, range: 14, reload: 2.8, radius: .95, weapon: 'rail', icon: '➤' },
    rocket: { name: 'Rocket carrier', role: 'Long-range rockets · area damage', cost: 320, time: 10, hp: 150, speed: 3.3, damage: 60, range: 17, reload: 3.8, radius: 1, splash: 3.5, weapon: 'rocket', icon: '⋮' },
    tesla: { name: 'Tesla tank', role: 'Heavy electric bursts · medium range', cost: 360, time: 11, hp: 250, speed: 3.4, damage: 68, range: 8.5, reload: 1.9, radius: 1, weapon: 'tesla', icon: 'ϟ' },
    flame: { name: 'Flame tank', role: 'Close-range flame spray · area damage', cost: 200, time: 7, hp: 260, speed: 3.8, damage: 13, range: 5.5, reload: .38, radius: 1, splash: 2.5, weapon: 'flame', icon: '♨' },
    repair: { name: 'Repair crawler', role: 'Automatically repairs one nearby friendly vehicle · unarmed', cost: 180, time: 6, hp: 130, speed: 4.2, damage: 0, range: 7, reload: 1, radius: .85, repairRate: 14, icon: '✚' },
    miner: { name: 'Ore miner', role: 'Harvests ore · carries 90 credits · unarmed', cost: 120, time: 5, hp: 190, speed: 3.7, damage: 0, range: 0, reload: 1, radius: .95, capacity: 90, harvestRate: 18, icon: '◆' }
  },
  buildings: {
    missileSilo: { name:'Tempest missile silo', description:'Superweapon · 120s recharge · 4s warning · 450 area damage · 60 power · one per commander', superweapon:true, cost:1200, time:25, hp:900, radius:3, load:60, recharge:120, warning:4, strikeRadius:9, strikeDamage:450, icon:'▲' },
    empArray: { name:'Blackout EMP array', description:'Superweapon · 90s recharge · 3s warning · disables vehicles and defenses for 10s · 50 power · one per commander', superweapon:true, cost:900, time:20, hp:750, radius:2.7, load:50, recharge:90, warning:3, strikeRadius:11, disableTime:10, icon:'◎' },
    shipyard: { name:'Naval shipyard', description:'Produces and repairs ships at its exit · 25 power', serviceRange:5, serviceRate:35, cost:300, time:12, hp:850, radius:2.4, load:25, icon:'⚓' },
    airfield: { name:'Airfield', description:'Produces and repairs aircraft at its exit · 30 power', serviceRange:5.5, serviceRate:30, cost:400, time:15, hp:850, radius:4.5, load:30, icon:'✈' },
    base: { name: 'Command factory', hp: 1200, radius: 3.3, load: 20 },
    warFactory: { name: 'War factory', description: 'Produces and repairs ground vehicles at its exit · 25 power', serviceRange:4.5, serviceRate:25, cost: 300, time: 12, hp: 900, radius: 3, load: 25, icon: '▰' },
    garrison: { name: 'Troop garrison', description: 'Unlocks riflemen, rocket troopers and snipers · 10 power', cost: 180, time: 8, hp: 700, radius: 2.3, load: 10, icon: '♟' },
    refinery: { name: 'Refinery', description: 'Miners unload ore here', cost: 240, time: 9, hp: 650, radius: 2.3, load: 15, icon: '◆' },
    power: { name: 'Power plant', description: '+60 power for your base', cost: 150, time: 7, hp: 450, radius: 2, supply: 60, icon: 'ϟ' },
    turret: { name: 'Guard turret', description: 'Balanced automatic gun defense · 20 power', defense: true, cost: 180, time: 7, hp: 420, radius: 1.25, load: 20, damage: 22, range: 11, reload: 1, icon: '⌖' },
    teslaCoil: { name: 'Tesla coil', description: 'Heavy electric bursts against armor · 35 power', defense: true, cost: 300, time: 11, hp: 600, radius: 1.6, load: 35, damage: 72, range: 10, reload: 2.2, weapon: 'tesla', height: 5.1, fireHeight: 4.1, icon: 'ϟ' },
    missileBattery: { name: 'Missile battery', description: 'Long-range rockets with area damage · 25 power', defense: true, cost: 280, time: 10, hp: 360, radius: 1.6, load: 25, damage: 52, range: 19, reload: 3.8, splash: 3.2, weapon: 'rocket', icon: '⋮' },
    flameBunker: { name: 'Flame bunker', description: 'Tough close-range area defense · 10 power', defense: true, cost: 200, time: 8, hp: 750, radius: 1.65, load: 10, damage: 14, range: 6.5, reload: .45, splash: 2.5, weapon: 'flame', fireHeight: 1.5, height: 3.3, icon: '♨' }
  }
};
for (const [kind, unit] of Object.entries(data.units)) unit.producer ||= kind === 'miner' ? 'base' : 'warFactory';
const prerequisites={missileSilo:['airfield','power'],empArray:['airfield','power'],power:['base'],refinery:['power'],garrison:['power'],warFactory:['refinery','garrison'],airfield:['warFactory'],shipyard:['refinery','power'],turret:['garrison'],flameBunker:['garrison'],missileBattery:['warFactory'],teslaCoil:['warFactory','power']};
for(const [kind,requires] of Object.entries(prerequisites))data.buildings[kind].requires=requires;
for (const kind of ['rocket','rocketTrooper']) data.units[kind].targets='all';
data.buildings.missileBattery.targets='all';
data.units.rocket.role += ' · anti-air'; data.units.rocketTrooper.role += ' · anti-air';
data.buildings.missileBattery.description='Ground and anti-air missiles · 25 power';
if (typeof module !== 'undefined' && module.exports) module.exports = data;
else window.FIELD_DATA = data;
})();
