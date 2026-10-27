# Iron Field — Land, Air & Navy + LAN

An original 3D strategy prototype for learning how an RTS works. Build a mixed army, gather finite ore, expand a base, manage power, and destroy the enemy headquarters.

**New: 2–4 player LAN multiplayer and fog of war.** Run `Start-Multiplayer.cmd`, open the server address, then use Multiplayer → Host / Join. See [MULTIPLAYER.md](MULTIPLAYER.md) for setup, reconnect behavior, and the networking source walkthrough. The rest of this guide describes the solo game and shared controls.

Each battlefield is **132 × 104 world units**, with widely separated bases, shared ore deposits, and rocky ridges. Choose Iron Valley, River Front, or Four Shores before starting. Use WASD to pan, the mouse wheel to zoom, and Home to return to your base. `map.js` defines shared movement and server boundaries.

Ground units cross bridges through the ramp ends and stay within the deck edges. Routes account for unit size, check corners before turning, and recover from traffic pushing a unit past a waypoint. Ships continue to pass beneath bridges, and aircraft can fly over them.

The compact status below the radar shows the enemy commander’s current activity and next-push countdown in solo play, or connection and surviving-commander status in multiplayer.

## Start playing

From a Git checkout, run `node server.cjs` with Node.js 18 or newer, then open **http://localhost:8766/**. No npm dependencies or build step are required. On Windows, you can also run `Start-Multiplayer.cmd`. The bundled `local-ai.zip` supplies the optional player-local AI connector; see the AI setup sections below. Three.js is included under its MIT license in `vendor/THREE-LICENSE.txt`.

Open **index.html** in Chrome or Edge. The complete folder works offline: no installation, account, build tools, or server needed. The browser needs WebGL enabled. Choose a map on the opening screen, then click **Start solo battle**, or open **Multiplayer lobby**. **New battle** opens map selection again; **Return to battle** resumes the current match.

You start with **600 credits**, a scout buggy, two battle tanks, artillery, and two miners. Your base has a command factory, refinery, power plant, and guard turret.

1. Watch miners fill their cargo beds and return. Credits increase **only when ore is unloaded**.
2. Build a **Troop garrison** in **Structures** to unlock infantry, then a **War factory** to unlock vehicles. Then use **Units** to produce your army. Miners remain available from HQ.
3. Use **Structures** for refineries and power plants, or **Defenses** for guard turrets, Tesla coils, missile batteries, and flame bunkers. A green footprint is valid; red means choose another location. The gold circle shows firing range.
4. Press **F** to select combat vehicles. Right-click the ground to move or an enemy to attack. Left-click empty ground clears selection.
5. Protect your miners when the raid countdown ends. Destroy the enemy HQ to win; losing your own HQ ends the game.

**Lab** contains wireframe, a world grid, perspective, slow motion, and a live object inspector. Turn off raids and reinforcements for a quieter learning session; enemies still defend their base.

## Recognizing ground units

Ground units have distinct procedural models and matching vehicle production portraits. The scout is a four-wheel roll-cage buggy; the battle tank has sloped armor and a single cannon; the heavy tank has a broad chassis, split track pods, and twin guns. Siege artillery uses an open carriage and elevated howitzer, while the tank destroyer has a low wedge silhouette and long precision cannon. The rocket carrier is an eight-wheel truck with raised launch boxes. Tesla tanks carry capacitor banks and a glowing coil; flame tanks have orange fuel drums and a dozer blade. Repair crawlers have a service cab and articulated crane, and miners have a yellow ore hopper and rotating cutter drum with visible cargo.

Riflemen wear helmets and body armor, rocket troopers carry shoulder launchers and spare rockets, and snipers wear hooded capes with scoped rifles. Team colors remain visible on all units. These appearance changes preserve unit costs, health, movement footprints, weapon damage, and repair behavior. Repeated static details share geometry and are batched to keep rendering lightweight.

## Recognizing buildings

All eleven structures have distinct procedural models. HQ has a raised command room and antenna mast; power plants have twin tapered cooling towers and a turbine housing; refineries have pipework, a pressure column, and an ore conveyor. War factories use a sawtooth roof, reinforced walls, and a shuttered vehicle entrance. Troop garrisons have pitched roofs, windows, and sandbags. Airfields have a curved hangar and glazed control tower beside the landing pad. Naval shipyards have an open water slipway, dock fittings, and a braced gantry crane.

Defenses also have role-specific details: guard turrets carry armor and sights, missile batteries have reinforced launch pods and stabilizers, Tesla coils have surrounding capacitor towers, and flame bunkers have fuel pipes and reinforced walls. Build portraits match the new designs. Team colors, selection indicators, exits, repair bays, and construction progress remain visible. Static box details are batched by material; the visual update does not change costs, collision footprints, production, or combat rules.

## Building tech tree

Open **Structures → Building requirements** to see the build order. Locked icons list missing prerequisites. Only your own completed, surviving structures count, and the host checks requirements again when you place a building.

| Build | Requires |
| --- | --- |
| Power plant | HQ |
| Refinery | Power plant |
| Troop garrison | Power plant |
| War factory | Refinery + troop garrison |
| Airfield | War factory |
| Naval shipyard | Refinery + power plant; water near shore |
| Guard turret / flame bunker | Troop garrison |
| Missile battery | War factory |
| Tesla coil | War factory + power plant |

These are construction prerequisites. Selling or losing a prerequisite locks new construction that directly requires it; existing buildings and paid construction continue working under the normal power rules. Existing factories still produce their units. You can always rebuild power from HQ, then restore the economy. Starting structures are provided as part of the starting army. Solo AI commanders follow the same dependencies and build missing prerequisites first.

## Production buildings and unlocks

Left-click one of your production buildings to open its unit roster automatically: troop garrison → infantry, war factory → vehicles, airfield → aircraft, naval shipyard → ships, and HQ → miners. The heading names the producer, and clicking a unit icon queues it at that selected building when it is operational. **All** and the role filters let you browse other units at any time. Unfinished buildings show their roster with the normal production locks; construction must finish before they can produce units. Repair/sell controls and right-click rally orders remain available.

The **War factory** costs 300 credits, takes 12 seconds to erect, and consumes 25 power. Once complete, it unlocks all nine combat/support vehicles. The **Troop garrison** costs 180 credits, takes 8 seconds, and consumes 10 power. It trains riflemen, rocket troopers, and snipers; it is a production building, without troop occupancy mechanics.

You start with your existing army and miners, but must build these facilities to produce more troops and vehicles. Locked icons name the building you need. Each team needs its own completed, surviving building; enemy buildings and unfinished construction do not count. Miners remain available from HQ to let you recover your economy.

Factory vehicles, garrison infantry, and HQ miners each have a separate production line and can build simultaneously. Extra copies of a building provide redundancy, not additional lines. If every building for a line is destroyed, its paid orders pause with progress preserved. Rebuild to resume, or right-click the unit icon to cancel and refund it. Units spawn at their production building; nearby friendly units step aside to clear the exit. If no safe space is available, production waits at 100%.

## Infantry

| Troop | Cost | Training | Health | Range | Role |
| --- | ---: | ---: | ---: | ---: | --- |
| Rifleman | 60 | 3 s | 60 | 7 | Affordable, rapid rifle fire |
| Rocket trooper | 110 | 5 s | 70 | 10 | Portable rockets with area damage |
| Sniper | 140 | 6 s | 45 | 14 | Long-range precision fire, low health |

Infantry use the same selection, movement, attack, and control-group commands as vehicles. They count toward the shared 24-unit limit. Use the **Infantry** filter to see their three production icons.

## Vehicles

| Vehicle | Cost | Build time | Health | Speed | Range | Role |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Scout buggy | 80 | 3 s | 75 | 6.5 | 7.5 | Fast; rapid, light fire |
| Battle tank | 140 | 5 s | 160 | 4.1 | 9 | Balanced frontline armor |
| Heavy tank | 260 | 8 s | 330 | 2.8 | 9.5 | Durable twin-cannon vehicle |
| Siege artillery | 220 | 7 s | 105 | 3.1 | 15 | Area damage; bonus against buildings |
| Tank destroyer | 280 | 9 s | 140 | 3.5 | 14 | Long-range precision cannon; fragile |
| Rocket carrier | 320 | 10 s | 150 | 3.3 | 17 | Long-range rockets with area damage |
| Tesla tank | 360 | 11 s | 250 | 3.4 | 8.5 | Powerful electric bursts |
| Flame tank | 200 | 7 s | 260 | 3.8 | 5.5 | Close-range flame spray with area damage |
| Repair crawler | 180 | 6 s | 130 | 4.2 | 7 | Unarmed; repairs 14 health per second |
| Ore miner | 120 | 5 s | 190 | 3.7 | — | Unarmed; carries 90 ore |

Speeds/ranges use world units. A world-grid square is 2 units across. Build times assume sufficient power. The **24-unit limit** includes miners and queued vehicles. Right-click a vehicle icon to cancel the last queued vehicle of that type for a full refund. Counts and progress appear on each production icon; right-clicking also refunds a partly produced vehicle when it is the last queued vehicle of that type.

There are **ten vehicle types and three infantry types**. Use the **Armor**, **Siege**, **Support**, and **Infantry** filters to find a role quickly. The roster scrolls independently of the selection controls; all production counts and progress stay on the icons.

When given a move or attack order alongside ground combat units, **repair crawlers follow behind the rearmost member of that squad**, with separate rear positions for multiple crawlers. Right-click a friendly combat vehicle with a crawler selected to escort it. They follow turns, keep using ground navigation, and do not chase an injured front-line unit past the squad. A direct move with only crawlers selected overrides escorting; Stop clears it. If all escorts are lost, the crawler stops. Escort state survives multiplayer refresh. Solo AI crawlers use the same rear-follow behavior.

Repair crawlers automatically repair one damaged friendly vehicle within seven world units, prioritizing the lowest health percentage. They cannot repair themselves, infantry, structures, enemies, or destroyed units. Multiple crawlers can support a frontline, but they are unarmed: keep them behind your armor. Repairs consume no credits. The green beam identifies the current repair target. Rockets and flame spray damage nearby enemies; friendly units take no splash damage.

## Graphics

**Lab → Graphics quality** offers High, Balanced, and Performance. For a slow frame rate, choose Performance: it limits pixel density and disables dynamic shadows. The setting is saved per browser and also works in multiplayer. High preserves the original visuals.

The battlefield uses locally generated grass, gravel, and animated water textures, a sandy shoreline, instanced vegetation and pebbles, and additional tree clusters. Vehicles have beveled hulls, tread plates, lights, exhausts, and role-specific turrets. Energy bolts, flame projectiles, rockets, and muzzle flashes make weapon types easier to distinguish. The game still uses original procedural art and works offline.

Weapons fire from their barrel or launcher tips. Paired guns and missile pods alternate sides. Each weapon family has its own firing effect:

- Rifles fire short moving tracers; scout machine guns and autocannons use staggered tracer bursts with ejected brass. Autocannon tracers are heavier. Snipers leave a fine, brief precision trace.
- Tank cannons have directional muzzle flashes, expanding pressure rings, recoil, and bright shells. Heavy cannons use larger flashes and debris-producing impacts. Artillery fires visible metal shells in high arcs with a faint trail and dusty explosions.
- Rockets have metal bodies, tail fins, launch exhaust, and persistent smoke trails. Bombers drop dark finned bombs that accelerate downward without engine smoke or a muzzle flash.
- Tank destroyers fire a cyan-white rail streak with fading ion motes and sharp blue impact sparks. Tesla weapons use branching electrical arcs with a crackling discharge at the target.
- Flamethrowers produce expanding orange plumes and rising fire at impact, without a cannon-style explosion.

Tracer bursts are cosmetic: they do not add damage or change firing rates. Damage, splash amounts, and targeting remain defined in `data.js`. The renderer caps effects at 240 particles, 64 projectiles/tracers, and 16 beams, and clears them when they expire.

`weapon-fx.js` handles cosmetic particles, projectiles, and arcs separately from damage. Effects use bounded counts and release temporary materials when finished. Their random variation does not change the simulation's random sequence. Multiplayer retains brief shot/impact events between snapshots, so even shots shorter than one network update are visible to the guest; event IDs prevent duplicate playback. All effects pause with the battle.

## Background music

Choose **Auto** or a specific tune from the selector beside **♫ Music** in the top bar. Four original 32-bar instrumental scores are synthesized locally with Web Audio; no recordings, downloads, or model requests are needed.

| Track | Tempo | Character / Auto use |
| --- | ---: | --- |
| Frontier Dawn | 72 BPM | Sparse plucked melody and soft pads; exploration and quiet building |
| Ore & Iron | 92 BPM | The original electronic bass, percussion, and melody; skirmishes |
| Armored Advance | 116 BPM | Driving bass and marching percussion; sustained battles |
| Redline | 140 BPM | Faster drums, sharper lead, and denser rhythm; intense fighting |

Auto follows recent visible gunfire, with heavier weapons contributing more. Activity fades over time; escalation has a four-second hold and de-escalation uses lower thresholds and a twelve-second hold to prevent rapid switching. Pauses, lobbies, and finished battles settle back to calm music. Hidden combat and old or restored network events do not raise intensity. Track changes occur at bar boundaries with a brief volume dip, rather than cutting mid-beat. Selecting a named track keeps it playing regardless of combat intensity.

Playback starts after your first click/key press, or by pressing **♫ Music**. Use the adjacent slider for volume. Track mode, mute, and volume are saved in this browser; choosing a track while muted keeps it muted. Music suspends while the tab is hidden and resumes when you return. Each multiplayer client controls its own soundtrack, with no extra server work.

## Voice alerts

Your commander speaks when a unit is accepted into production, when it is produced, and when your units or base take enemy damage, and when your power supply falls below demand. Ready announcements include the unit name. Blocked factory exits do not announce completion until the unit can spawn. Failed purchase requests do not announce production.

Voice alerts are enabled by default and activate silently after your first click or key press. Use **Lab → Voice alerts** to mute them, or the **Voice volume** slider to adjust them separately from music. Settings are remembered by this browser. Speech uses available browser/system voices, preferring a local English voice; no Ollama request is involved. The voice and availability depend on the browser and installed voices. If speech cannot play, the Lab panel reports it; normal visual notices remain available.

In solo and multiplayer you hear only your own team's alerts during an active, unpaused battle. Attack warnings interrupt production speech and are limited to once per ten simulation seconds for units and for buildings. Low power is announced once when a shortage begins; it does not repeat while the shortage persists. Restoring power clears any pending power warning, and a later shortage can trigger a new warning, subject to a local cooldown for rapid power flicker. Rapid production notices are throttled, the speech queue is bounded, and waiting messages expire after three seconds. Muting, pausing, restarting, hiding the tab, entering a lobby, or ending the battle cancels speech. Resuming and reconnecting do not replay old alerts. The persistent power display still shows shortages even when speech is silent.

## Battle rewards — income without a refinery

Destroying an enemy unit or building pays **50% of its build cost** straight into the attacking team's credit balance. A command factory pays **300 credits**. For example, a battle tank pays 70, a heavy tank pays 130, a rifleman pays 30, and a refinery pays 120. No miner, refinery, power, or pickup action is needed. Keep fighting with your surviving army or defenses to fund a replacement refinery.

The team that lands the killing hit receives the reward; splash weapons can earn separate rewards for each enemy destroyed. A gold battlefield notice shows new credits, and the resource bar tracks cumulative ore deliveries and battle rewards separately. Credits can be spent immediately on any available unit or structure. The solo computer earns rewards under the same rules.

Each enemy pays once. Friendly fire, non-combat removals, and units cleared when an HQ falls do not pay extra. An eliminated team cannot earn further rewards. In multiplayer only the host awards credits; snapshots preserve reward totals and balances across refreshes without replaying payouts. Restarting a match resets totals. Rewards supplement mining; they are not passive income.

## Mining

Five finite deposits supply the economy. Miners travel, harvest, return, and unload automatically. Their cargo is visible on the vehicle and above it. Destroyed miners lose undelivered cargo.

- **M** selects miners. Right-click an ore field to assign it; **H** resumes harvesting a nearby field.
- Right-click a friendly refinery with miners selected to specify an unloading refinery. Otherwise returning miners choose the nearest operating refinery.
- **X** stops miners. They retain cargo but provide no income until work resumes.
- Depleted fields cause miners to seek another deposit. Without a working refinery, loaded miners wait.
- Refineries under construction cannot accept deliveries. The enemy also mines ore to pay for reinforcements.

## Repair bays for vehicles and ships

Completed **war factories** automatically repair your ground vehicles, including miners and repair crawlers, within **4.5 units of the marked exit**. Completed **naval shipyards** repair your ships within **5 units of their exit**. Select a building to see its green repair area. Select units and right-click the matching building to send them to available spaces in that bay, or move them there yourself. This stops miners' harvesting orders; use **H** to send them back to work afterward. Crowded bays need space cleared, and repaired units stay nearby until you give another order.

Each building services one damaged unit at a time, prioritizing the lowest health percentage. War factories restore **25 HP per simulation second**, shipyards **35 HP/sec**; low power halves these rates. Repairs charge only for health restored, at **50% of the unit's build price per full health bar**. They stop at full health or when credits run out and resume automatically when funds return. Move units outside the green area to stop their repairs. Overlapping bays cannot stack their repair rates on the same unit.

A green beam and **UNIT REPAIR** label indicate active servicing. Production continues while a bay repairs units. Unfinished, sold, or destroyed buildings cannot repair; enemy units, infantry, aircraft, and structures are ineligible. Unit repair is separate from the structure's own **Repair** button. Multiplayer hosts apply the healing and spending, and guests receive the resulting health, credits, and repair indicators.

## Repairing and selling structures

Select one of your structures. **Repair** and **Sell** appear directly below the production tabs, alongside its health.

- **Repair** restores 25 health per simulation second, charging only for the health restored. The displayed price estimates the credits needed for its current damage. Restoring a full health bar costs 50% of build price; HQ repair uses a 600-credit reference price (300 credits for a full bar). Stop repairs at any time. Repairs wait when credits run out, resume when income returns, and switch off at full health. Pause also pauses repair spending. Construction must finish before repairs can start.
- **Sell** immediately removes the structure and refunds `floor(build cost × 50% × remaining health / maximum health)`. The button shows the refund. The same rule applies to unfinished structures. Selling gives no combat bounty. Power, fog vision, construction territory, and blocked movement update immediately.
- **HQs can be repaired but cannot be sold.** Selling your last factory, garrison, or airfield pauses its production line with orders paid and progress preserved. Another completed producer resumes that line; you can also cancel queued orders through their unit icons. Selling a refinery removes it as an unloading location.

In multiplayer the host checks ownership and applies each action. Repair state, health, credits, and sales survive host/guest refreshes. Players cannot repair or sell another team's structures.

## Base construction and power

| Structure | Cost | Construction | Purpose |
| --- | ---: | ---: | --- |
| War factory | 300 | 12 s | Produces and repairs vehicles; consumes 25 power |
| Troop garrison | 180 | 8 s | Unlocks infantry; consumes 10 power |
| Refinery | 240 | 9 s | Receives cargo; consumes 15 power |
| Power plant | 150 | 7 s | Supplies 60 power |
| Guard turret | 180 | 7 s | Automatic defense; consumes 20 power |
| Tesla coil | 300 | 11 s | Heavy electric bursts, range 10; consumes 35 power |
| Missile battery | 280 | 10 s | Long-range rockets with area damage, range 19; consumes 25 power |
| Flame bunker | 200 | 8 s | Durable close-range area defense, range 6.5; consumes 10 power |

The command factory consumes 20 power. The top bar shows **supply / usage**. Low power reduces all unit production to 45% speed, doubles unloading time, and halves every defense's firing rate. A completed power plant restores normal operation if it supplies enough power.

The guard turret is a balanced gun defense with range 11. Tesla coils hit a single target hard; missile batteries cover a larger area but fire slowly; flame bunkers have 750 health and work best at chokepoints. Rockets and flame damage nearby enemies without hurting friendly units. All defenses automatically target enemies after construction finishes. Select a defense or place its blueprint to see its gold firing-range circle. Defenses consume power only when complete.

Your HQ grants a 32-unit construction radius. Every completed friendly structure, including defenses, adds a 14-unit radius around itself. Chain buildings outward to expand across the island. Unfinished or destroyed buildings contribute no territory; surviving outposts retain their own radius, and your HQ must remain alive. The mint area and boundary appear while placing a blueprint. You must still scout the placement location. Placement checks bounds and clearance from ore, buildings, and vehicles. Credits are charged only after valid placement. Escape or right-click cancels an unplaced footprint. Structures can be attacked during construction. Power plants have no per-type count limit, so power supply can grow with your base. Other constructible types have a limit of six. The same rules are checked by the host for all multiplayer commanders.

## Controls

| Action | Control |
| --- | --- |
| Select a unit or friendly building | Left-click |
| Select several units | Drag a rectangle |
| Add/remove selection | Shift-click |
| Select army / miners | F / M |
| Move, attack, assign ore | Right-click |
| Select matching units on screen | Double-click or Ctrl-click a unit |
| Assign / recall control group | Ctrl + 1–9 / 1–9 (double-tap to center) |
| Mouse camera pan | Right-drag, middle-drag, or move to a battlefield edge |
| Minimap camera / order | Left-click or drag / right-click |
| Cancel one vehicle of a specific type | Right-click its production icon; full refund |
| Resume harvesting | H or Harvest |
| Stop orders | X or Stop |
| Queue a battle tank | T |
| Pan / rotate / zoom | WASD / Q and E / mouse wheel |
| Reset view | Home button |
| Pause | Space or Pause |
| Clear selection / cancel placement | Escape |

Pause freezes simulation time while allowing camera movement and queued orders. Restart resets the battle and economy while retaining learning settings. Touch users can use selection buttons and tap destinations; mouse/keyboard provide full camera controls.

Attack timing and recruitment depend on the selected opponent style. See [Choose a computer opponent](#choose-a-computer-opponent) for the policy tables, local decision loop, and Ollama integration. The battlefield timer shows the earliest attack opportunity, not a guaranteed wave.

## Computer opponent

All solo opponents use paid production, construction prerequisites, power, terrain navigation, and shared tactical rules, with modest credit assistance to keep the battle active. Choose a preset for a fixed strategic policy or **AI commander · Ollama** for model-selected operations. The model chooses a high-level plan; the browser handles immediate movement and combat. See the [opponent logic guide](#choose-a-computer-opponent) below for the exact division of responsibilities and fallback behavior.

## Source walkthrough

Three.js **0.160.1** handles rendering. Models, gameplay, controls, economy, AI, and UI are custom JavaScript. Models are real meshes built from primitives, with no Red Alert assets.

- **index.html:** battlefield, radar, production categories, and selected-force controls.
- **ui-art.js:** original SVG portraits for production icons.
- **music.js:** original procedural soundtrack, audio scheduling, and saved volume/mute controls.
- **weapon-fx.js:** weapon profiles, tracers, electrical arcs, muzzle effects, smoke trails, and impacts.
- **map.js:** shared map boundaries for the browser and LAN relay.
- **style.css:** layout and colors.
- **data.js:** unit/building definitions and producer prerequisites; start experimenting here.
- **game.js:** implementation, divided into numbered sections.
- **vendor/three.min.js:** renderer; you do not need to edit it.
- **vendor/THREE-LICENSE.txt:** Three.js MIT license.

### Scene and models — sections 1–3

Objects have position, rotation, and scale. X is east, Y is up, and Z is south. Wheels, hull, turret, and barrel are grouped. Moving the group moves the vehicle; turning its turret does not turn the hull.

The camera projects the 3D scene onto the canvas. The initial orthographic camera preserves apparent size at different distances; perspective makes distant objects smaller. Materials, lights, and shadows give surfaces their appearance. Wireframe exposes the triangles.

### Navigation — section 4

`route()` uses A* on a 1.5-unit navigation grid. Building footprints block cells. A smoothing pass removes unnecessary turns. Routes are invalidated when buildings appear or disappear; local circle separation reduces vehicle overlap.

Movement combines direction, speed, and elapsed time with `Vector3.addScaledVector()`. Facing interpolates toward the travel direction.

### Miner state machine — section 5

`updateMiner()` switches between **travel → harvest → return → unload**. Its state determines the next action. Cargo and ore are whole numbers; a fractional timer accumulates work between simulation ticks. Credits transfer only after a miner spends enough time near a working refinery's unloading lane.

Vehicle position, cargo capacity, remaining ore, building health, power, and player orders all affect this cycle. It is a simulation, not just a looping animation.

### Input — section 6

`pick()` casts a ray through the mouse position to find a vehicle, building, field, or ground point. `issueOrder()` changes unit data; later simulation steps move the model.

### Combat and AI — section 7

Definitions specify health, speed, range, damage, and reload time. Ordinary shots track their target. Artillery travels in an arc to a fixed impact point, damaging enemies nearby; moving targets can evade it. Turrets use weapon rules without movement.

The solo commander manages economy, production, defense, repairs, and raid objectives. `updateCommander()` coordinates these decisions; `aiEconomy()` spends real credits, and `aiObjective()` scores targets by value, distance, and nearby cover.

### Camera, UI, and loop — sections 8–9

Every browser frame processes camera input, advances simulation, renders, and updates labels. World positions are projected back to screen pixels for health bars and cargo labels.

Simulation uses fixed 1/60-second steps. The speed slider changes simulation time while the camera remains at normal speed. Long browser stalls are capped; hidden tabs stop advancing.

## Experiments

Change one value, save, and refresh:

1. In **data.js**, raise `miner.capacity` to 150. Compare longer mining stops against fewer return trips.
2. Raise `artillery.splash` to 4.5. Watch damage to clustered vehicles.
3. Raise `power.supply` to 100. Build turrets and observe when production slows.
4. In `createUnit()` in **game.js**, change a barrel's length. The model changes; weapon range does not. Visuals and rules are separate.

Browser-console tools: `IronField.snapshot()` returns copies of positions, cargo, fields, queues, power, and AI state. `IronField.project(x, y, z)` returns a world point's screen position.

Official reference: [Three.js documentation](https://threejs.org/docs/).

## Prototype limits

There is no save system, imported art, or combat sound effects. Navigation handles building footprints and the large stepped rocky ridges. Small decorative trees and pebbles do not block vehicles. Dense groups may congest narrow routes. Solo opponents use preset strategies or an optional Ollama model for high-level decisions; movement and combat still use game rules. There is no learning between matches. Multiplayer supports 2–4 players in a free-for-all with a trusted host; public matchmaking and host migration are not included. Restart starts a new match; progress is not saved.


## Scouting and fog of war

The battlefield begins under black shroud. Your completed buildings and units reveal nearby ground; scout buggies have an 18-unit sight radius. Other units see at least 11 units, with longer sight for long-range weapons. Buildings see at least 13. Sight is circular and does not model trees or structures blocking vision.

Explored ground stays visible but dimmed when your army leaves. Enemy units and buildings, health labels, shots, and radar blips disappear outside current sight. Ore markers remain on explored radar cells. Direct attack orders require a visible target, and construction requires current sight at the placement point. You can order units onto unexplored ground to scout it. Miners automatically choose discovered ore fields.

`fog.js` maintains separate visibility and exploration grids for each commander. The material shader shades the terrain in world coordinates; the same grid gates picking, combat acquisition, placement, and the minimap. Exploration travels in network snapshots and survives reconnecting in the same match. A restart or rematch clears exploration.

LAN matches use four corner spawn locations (mint southwest, coral northeast, blue northwest, gold southeast), with a dedicated ore deposit for each corner and three shared deposits. A lobby starts with 2–4 ready commanders. Each has their own economy and production. Losing your HQ removes your remaining forces; other commanders keep fighting until only one HQ survives. The host must remain connected even if their HQ is eliminated.

This remains a trusted-player learning prototype: complete world snapshots reach each browser. Fog hides information in ordinary play but does not protect it against modified clients or developer tools.


## Production exits, rally points, and air power

War factories and troop garrisons have a marked apron and front exit facing toward the middle of the battlefield. Finished vehicles and infantry leave through that exit. When production finishes, friendly units occupying the exit or the lane just ahead move to safe nearby spots; shipyards and airfields use the same courtesy movement on water or in the air. Mining, attack, escort and distant movement orders resume afterward. A unit parking in the exit parks to the side instead. Movement uses normal speed and terrain checks, never teleports or orders enemy units aside. If enemies or impassable terrain still obstruct the exit, its production icon reads **EXIT BLOCKED** and the finished unit waits without another credit charge. Newly placed buildings cannot obstruct another producer's exit. In multiplayer the host handles courtesy movement for every player and sends the resulting positions to guests.

Select a completed war factory, garrison, or airfield, then **right-click clear ground** to set its rally point. A flag and dashed line show the destination while the building is selected. New units go there automatically. Select the intended production building before queueing to choose which building supplies those units. Each producer type still has one shared production line; if a chosen building is destroyed, another completed building of the same type can take over. Rally points and the chosen producer travel in multiplayer snapshots.

Build an **Airfield** under Structures ($400, 15 seconds, 30 power), then choose **Air** in the unit menu:

| Aircraft | Cost | Build time | Role |
|---|---:|---:|---|
| Falcon gunship | 320 | 10 s | Ground attacks with a rapid autocannon |
| Swift interceptor | 280 | 9 s | Fast aircraft hunter with guided anti-air missiles; air targets only |
| Thunder bomber | 440 | 14 s | Slower ground attacker with heavy area-damage bombs |

Aircraft lift vertically from the airfield, climb to cruising height, and fly over buildings and ridges. All three use simplified VTOL/hover movement; there are no runway approach, fuel, or rearming systems. They count toward the 24-unit army limit. Aircraft appear as triangles on radar, obey fog of war, and can use ordinary selection, movement, and attack orders. Interceptors, missile batteries, rocket carriers, and rocket troopers can attack aircraft. Other ground weapons cannot. Bombs and other ground explosions do not damage aircraft overhead. Repair crawlers service ground vehicles only.

The solo commander can build airfields later in a match and responds to aircraft with missile defenses and anti-air units. Ridges restrict movement and building placement; they do not block weapon fire or line of sight. All commanders use the same static terrain layout, collision rules, and enlarged map boundaries.

## Choose a computer opponent

Use **Computer opponent**, directly below the radar. Your choice is saved in this browser and can change during a solo match. Switching styles recalls existing raiders, clears the previous model plan, and schedules the next attack opportunity using the new style's first-raid delay. It does not grant credits or units. **Lab → Computer strategy & raids** disables strategic orders, construction, recruitment, and raids; mining and local defensive combat continue. Re-enabling it uses the selected style's first-raid delay again.

Computer opponents are **solo-only**. Human multiplayer disables the selector and makes no model planning requests; empty multiplayer seats do not become computer players.

### What each style changes

The five presets use the same economy, navigation, targeting, and tactical code. A style supplies priorities and thresholds rather than a separate AI implementation. Preset styles run entirely in the browser and do not call a language model.

| Style | Main behavior | Default target focus |
| --- | --- | --- |
| Balanced | Builds a mixed army with repair support, a modest economy, and measured attacks | Economy: miners and refineries |
| Rush commander | Makes earlier attack attempts, recruits more often, and favors cheap tanks, riflemen, and scouts early | Production buildings |
| Fortress commander | Builds more defenses, retains more guards, and waits for a larger available force | Enemy combat units |
| Economy commander | Expands to four miners before investing in a larger army | Economy: miners and refineries |
| Air commander | Considers an airfield earlier and aims for up to seven gunships/bombers instead of the usual two | Production buildings |
| AI commander · Ollama | Uses a model-selected preset and explicit production priorities, with the same local tactical code | Supplied by the chosen operation |
| AI commander · OpenAI Decisions | Chooses from all applicable operation packages with full validated economy/count context | Supplied by the chosen operation |

These are preferences. Every style can counter aircraft, build ships on water maps, defend its base, and use ground units. Production still depends on credits, completed prerequisites, power, available producers, and clear exits.

Solo opponents receive **2 bonus credits per simulation second (120/minute)** while their cash is below $600. If they have lost their refinery or all miners, have less than $120, and have no miner queued, they can also receive a **$180 emergency resupply**, at most once every 90 simulation seconds (first eligible at 90 seconds). A missing refinery alone also qualifies, even if a miner is queued. Emergency grants appear in Commander activity. These are deliberate, modest AI advantages requested for a more active opponent; combat statistics and construction times are unchanged. Assistance stops when the battle is paused or finished, the HQ is lost, or computer strategy is disabled. Human multiplayer receives no AI assistance.

The preset values in `opponent.js` are:

| Style | Miner target | Defense target | Normal recruitment cap* | Recruitment spacing | Airfield considered after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Balanced | 2 | 3 | 14 | 8 s | 150 s |
| Rush | 2 | 1 | 18 | 4 s | 240 s |
| Fortress | 2 | 5 | 18 | 9 s | 210 s |
| Economy | 4 | 2 | 22 | 6 s | 140 s |
| Air | 3 | 2 | 20 | 6 s | 30 s |

| Style | First raid opportunity | Interval after a launch | Minimum available fighters | Guards retained | Maximum raiders | Retreat below health |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Balanced | 90 s | 65 s | 5 | 2 | 7 | 28% |
| Rush | 45 s | 38 s | 4 | 1 | 8 | 18% |
| Fortress | 150 s | 95 s | 8 | 4 | 8 | 40% |
| Economy | 140 s | 75 s | 7 | 2 | 10 | 35% |
| Air | 110 s | 60 s | 5 | 2 | 9 | 30% |

All times in these two tables are **simulation seconds**. Recruitment spacing is a delay between normal queue decisions, not a unit's construction duration. Emergency reinforcement and miner recovery can use different pacing. Airfield time is an eligibility threshold; discretionary construction also needs sufficient credits and a legal site. It does not guarantee an airfield at that time.

*The normal recruitment cap counts living units plus queued units. Miner recovery has its own check against the game's 24-unit limit, so a style's normal cap is not an absolute population ceiling. In Ollama mode, the normal cap becomes `max(20, selected preset cap)`—20 for most presets, 22 for Economy—and the maximum raid size becomes 10. The ordinary 24-unit game limit still applies.

Raid timers indicate the earliest opportunity. The commander needs enough non-retreating fighters above 55% health, keeps the style's guard reserve, checks the proposed fight, and delays when its base needs defense. Non-infantry combat units retreat below the style's health threshold and leave that retreat state only above 75% health. Repair crawlers service ground vehicles; ships and aircraft do not receive crawler repairs.

### Decisions handled locally by the game

`updateCommander()` runs every **1.5 simulation seconds** while the solo commander is enabled and its HQ survives. Unit movement, production progress, weapon fire, and damage continue through the regular simulation loop. None of these actions waits for an LLM response.

The economy logic checks priorities in this order:

1. Restore income first. When the refinery or last miner is lost, cancel non-miner production for its ordinary refund, then sell nonessential structures if needed using the same health-scaled sale price as the player. Preserve the HQ, power plants and refineries, suspend structure repairs during recovery, and replace the refinery and first miner before buying a new factory. This recovery uses existing funds and refunds alongside the bounded solo credit assistance above; units are still paid for and produced normally.
2. Restore adequate power, including missing prerequisites.
3. Respond to urgent threats. Visible aircraft can trigger rocket troopers or rocket carriers; nearby pressure can trigger extra ground defenders. These are paid production orders, not instant spawns.
4. Recruit miners toward the selected style's economy target, then restore the war factory.
5. Execute an active model plan's building and unit priorities, if there is one.
6. Spend remaining opportunities on expansion, defenses, air/naval production, and a balanced counter-force. Counters include anti-air, siege against defenses, flame against infantry, and tank destroyers against armor. On water maps the commander can extend construction territory toward the bank, establish a shipyard, and recruit a patrol boat, frigate, and bombardment ship.

A model priority may reserve incoming credits for up to 35 simulation seconds. After that, an unaffordable optional investment yields to affordable production; its priority is still retried when funds allow. A busy producer also allows other producers to work. Missing producers and prerequisites are built first. A prioritized unit normally stops at three living/queued units, or four for aircraft, allowing other recruitment to resume. This is a production preference quota, not a hard per-type limit. Essential recovery and urgent reinforcement can take precedence over the model's requested investment.

Shared tactical rules also:

- Move threatened miners toward safety and resume harvesting after the danger period.
- Enable normal paid repairs for completed structures below 65% health when the computer has more than 180 credits.
- Send badly damaged vehicles to a compatible factory or shipyard repair bay, or a repair crawler. Without an available repair option, do not leave them permanently flagged as retreating.
- Score objectives using value, target focus, damage already taken, distance, and defensive cover. Ships are excluded from objectives beyond their approximate coastal firing reach.
- Compare estimated combat strength before launching a raid. Strength uses current health, damage, reload time, and range; visible defenders that can retaliate are counted, with a discount for defenses outranged by siege units. Launch requires estimated attacking strength of at least 90% of that defense estimate.
- Prefer viable objectives over higher-value targets that the force cannot beat. During income recovery, or when no raid has launched for 45 seconds beyond the first-raid time or last launch, allow an opportunity attack with as few as two units and at most one home guard. The strength check still applies. If no assets can fund income recovery, these attacks can earn the same kill rewards as the player.
- Regroup when a raid loses roughly half its force, lasts over 65 seconds, or home threats demand a recall. The regroup delay is 18 simulation seconds. A failed attack opportunity is retried after about 10 simulation seconds.
- Withdraw from a local fight away from home when at least two visible attackers have more than 1.6 times nearby allied strength. Long-range units try to back away without entering blocked terrain.
- Coordinate targets using an estimate of assigned volley damage: finish vulnerable enemies, avoid assigning excessive shots to one target, and favor aircraft for compatible anti-air weapons. This estimate is recomputed each commander update; it is not a guarantee of perfect focus fire.

### What Ollama sees and decides

In **Game server** mode, the browser sends `POST /api/commander/plan` a structured summary. In **This computer** mode, it sends the same summary to the paired local connector through `/api/commander/local/plan`. The summary contains: elapsed time, computer credits, both sides' unit/building counts, and context flags for water, low power, and pressure near the computer's base. The relay validates these fields; the selected inference adapter reduces them to a short prompt. **Elapsed time, credits, and the full count dictionaries are not all forwarded verbatim.** The current model prompt contains:

- Human aircraft, armed ground-vehicle count, defensive-building count, and ship count.
- Computer miner count and total armed-unit count.
- Whether the map has waterways, whether the computer is short of power, and how many visible armed enemies threaten completed computer structures.

The model receives no screenshot, terrain grid, routes, exact coordinates, unit health, or shot-by-shot history. Low power is included as context; the game's essential-infrastructure rule handles power recovery directly.

Before inference, `relevantStrategies()` constructs a shortlist. **The first matching row wins**:

| Condition | Choices offered to the model |
| --- | --- |
| At least 3 enemies pressuring the computer's base, and human aircraft exist | `anti-air`, `defend` |
| At least 3 enemies pressuring the base, without human aircraft | `defend`, `anti-armor` |
| Computer has fewer than 2 miners | `economy`, `defend` |
| Human has any aircraft | `anti-air`, `air` |
| Water map and human has at least 2 naval units | `naval`, `air` |
| Human has at least 2 defensive structures | `siege`, `air` |
| Computer has fewer than 60% as many armed units as the human | `defend`, `economy` |
| Human has at least 3 armed ground vehicles, excluding infantry and ships | `anti-armor`, `siege`, `air` |
| Otherwise | `rush`, `air`, `economy` |

The model returns one small JSON choice, for example `{"strategy":"naval"}`. It selects an operation from this shortlist. The server maps that choice to a validated plan:

| Operation | Preset | Target focus | Unit priority | Building priority |
| --- | --- | --- | --- | --- |
| `balanced` | Balanced | Economy | Auto | Auto |
| `rush` | Rush | Production | Battle tank | Auto |
| `defend` | Fortress | Army | Auto | Guard turret |
| `economy` | Economy | Economy | Auto | Auto |
| `air` | Air | Production | Gunship* | Airfield |
| `anti-air` | Balanced | Army | Rocket carrier | Missile battery |
| `siege` | Balanced | Production | Siege artillery | Auto |
| `anti-armor` | Balanced | Army | Tank destroyer | Auto |
| `naval` | Balanced | Production | Missile frigate | Naval shipyard |

*When `air` is selected from a shortlist containing `anti-air`, the unit priority becomes **interceptor**. `Auto` delegates that priority to the ordinary economy/recruitment rules. `balanced` is a defined package, but the current live shortlist does not offer it; Balanced is also the no-plan fallback policy. The validator supports HQ focus, although no current package selects it.

A changed model plan updates spending and target priorities without recalling an attack already in progress. When there is no active raid, it can bring the next attack opportunity forward to within 8 seconds for Rush or 20 seconds for other plans. Readiness, defense, and strength checks still apply. Manually switching the opponent selector still resets the commander as described above.

The LLM cannot execute code, issue arbitrary unit commands, alter rules, or grant resources. The server accepts only allowlisted strategies and plan fields; the browser validates the resulting plan again. Actual construction and recruitment still pay costs and obey technology, power, population, placement, and producer rules.

### Timing, fallback, and the small server

| Setting | Current behavior |
| --- | --- |
| Default model | `qwen2.5:0.5b` |
| Model request limits | 512-token context, at most 16 generated tokens, temperature 0, 4 threads |
| Successful-plan refresh | Eligible 30 **real seconds after completion**; dispatched on a subsequent commander update |
| Plan lifetime | 180 real seconds after acceptance |
| Live inference deadline | 5 seconds by default and at most 5 seconds on the server; browser timeout 6.5 seconds |
| Failed request retry | Normally 10 real seconds; busy/warming responses request a 2-second retry |
| Shared server capacity | One inference/warm-up at a time, with a 2-second cooldown after a live attempt |
| Warm-up | Background synthetic request, up to 30 seconds; its result is discarded |
| Model residency | Requests ask Ollama to keep the model loaded for 30 idle minutes |

Inference is asynchronous. When a refresh times out, returns invalid output, or cannot reach Ollama, the game keeps the last **unexpired** plan. Without one, it uses Balanced fallback with Ollama mode's larger recruitment/raid caps. Local tactics continue in either case. Cached prompt prefixes can reduce work, but the deadline does not guarantee a model response on every request. Several solo players share the server's inference capacity.

Pausing stops simulation time and commander updates. Plan expiry and request timers use real time, so a plan may expire during a pause; an already-running request can still complete. Requests resume through the commander loop after play resumes.

### Reading the opponent panel

In Ollama mode, **AI order** identifies the selected operation and indicates refreshing, retained-plan, or fallback status. **Tactics** shows the current execution step, such as saving for a producer, reinforcing anti-air, or holding an unfavorable attack. It remains visible when the model is unavailable. **Commander activity** lists the five most recent logged events, including model orders, construction, queued/completed units, repairs, and attacks. A valid model response alone does not mean its requested unit has finished building.

### Strategic knowledge and limits

The computer is a prototype opponent with global strategic knowledge: its army summaries and objective scoring can inspect both sides' units and buildings beyond the fog. Some older base-defense and miner-risk checks also use world positions. Visible-contact checks gate emergency anti-air, the new base-pressure summary, local focus fire, and the defenders used in strength estimates. Combat acquisition/fire and building placement still obey visibility rules. An unseen strategic objective causes movement toward its position until it can be attacked.

There is no training or persistent learning between matches, and no search through simulated future battles. The small LLM chooses among handcrafted operations; local rules perform the combat. Its richer behavior comes from those rules plus the operation choice. This explains why Ollama may resemble a preset for a while, especially when funds, prerequisites, a shortlist, or a fallback constrain its choices.

### Run with your own Ollama

The game's default integration expects Ollama on the server machine with `qwen2.5:0.5b` installed:

```sh
ollama pull qwen2.5:0.5b
node server.cjs
```

Select **AI commander · Ollama → Send AI requests through → Game server** to use the server adapter above. Preset opponents work offline in the browser. Model modes require a Node game server; a static file server alone does not provide the planning endpoints. Ollama uses no cloud API key.

| Server environment variable | Default / purpose |
| --- | --- |
| `OLLAMA_URL` | `http://127.0.0.1:11434`; may point to another trusted machine running Ollama |
| `OLLAMA_MODEL` | `qwen2.5:0.5b`; must match an installed model name |
| `OLLAMA_TIMEOUT_MS` | `5000`; clamped to 1,500–5,000 ms |

### Run Ollama on the player's computer

**This computer** is the default Ollama execution option. It moves model inference off the Debian game server while leaving the normal browser game and LAN hosting in place. AI opponents remain a **solo-play** feature; multiplayer currently has human opponents only.

1. Install/run Ollama and have a local model available. The connector prefers `qwen2.5:0.5b`, then the smallest installed completion model. It does not download models automatically. Set `OLLAMA_MODEL` before launching to choose another installed model.
2. In the game, choose **AI commander · Ollama → This computer → Connect this computer**. Download and extract **AI connector** (`local-ai.zip`). It requires Node.js 18 or newer.
3. Click **Create pairing code**, then run `Start-Local-AI.cmd` on Windows or `node local-ai.cjs` on macOS/Linux. Enter the game server address and the 12-character code. The code expires in five minutes and can be used once.
4. Keep the connector running. The game reports the local model and whether it is warming up, connected, or offline. The pairing survives page reloads in that browser tab. Re-pair after a game-server restart or session expiry.

The connector makes outbound requests to the game server and contacts Ollama on its own `127.0.0.1:11434`. It opens no listening port and requires no Ollama CORS changes or LAN exposure. The game server relays only the validated battle summary and model plan; it does not perform inference for **This computer** requests. Separate browser and connector tokens isolate each pairing. Pairing codes are displayed to the player; tokens are kept out of URLs.

The connector disables optional model thinking for these small structured decisions. It warms the model in the background, retains the five-second inference deadline, and uses the existing strategy shortlist and plan validation. The relay allows one outstanding job per pairing with a 5.8-second timeout. Disconnects, invalid output, and missed deadlines use the existing last-plan/balanced fallback; **This computer never silently falls back to server inference**. Game simulation continues while the model warms or plans.

For unattended launch: `node local-ai.cjs --server http://192.168.4.142:8766 --code YOUR_PAIRING_CODE`. Stop with Ctrl+C. The pairing relay stores sessions in memory, bounds connections to 32, and expires sessions after 30 minutes without browser or connector activity.

Browsers contact the game server in both modes. **Game server** uses `GET /api/commander/status` and `POST /api/commander/plan`; **This computer** uses the paired `/api/commander/local/*` relay. Rendering, simulation, and tactical execution stay in the browser.

### OpenAI Decisions and UI key setup

Select **AI commander · OpenAI Decisions → This computer**. This uses the [OpenAI Decisions API](https://developers.openai.com/api/docs/guides/decisions), with `gpt-6-luna`. No Ollama installation is needed for this option. Game summaries go to OpenAI and API usage is billed to your account.

1. Expand **Connect this computer**, download and extract the updated **AI connector**, and click **Create pairing code**.
2. Run `Start-OpenAI-AI.cmd` on Windows, or `node local-ai.cjs --provider openai` on macOS/Linux (Node.js 18+). Enter the game server address and pairing code.
3. Click **API key setup** in the game, or open the setup URL printed by the connector. Enter your key in the masked field and click **Use key for this session**.
4. Return to the game and keep the connector running. **Key configured** confirms entry; successful API access is confirmed when an **AI order** arrives. Errors appear in the opponent status. **Forget key** clears the key; closing the connector clears the session too.

The setup page listens only on `127.0.0.1` on your computer. It keeps the key in connector memory, never sends it to the game server, and does not store it in browser storage or a file. Only the connector sends it to OpenAI over HTTPS. A key already present in the connector's `OPENAI_API_KEY` environment variable also works. Each launch creates a fresh local setup address. Ollama and OpenAI pairings are separate; use the matching launcher.

OpenAI receives the full validated summary: elapsed time, credits, both sides' unit/building counts, and water, power, and visible base-pressure context. Unlike the Ollama shortlist above, it chooses from all nine operation packages (eight on dry maps). One named choice question selects the strategy; the answer maps to the same predefined plans and tactical rules. The OpenAI air package uses gunships; Ollama's conditional interceptor substitution does not apply. Both model modes use the larger recruitment/raid caps described above. Neither provider learns between matches or changes combat rules.

The connector permits one request at a time and no more than one attempt every 30 real seconds. Successful plans refresh after 30 seconds and expire after 180 seconds. Requests have a five-second deadline. Slow responses, missing/invalid keys, refusals, quota errors, and disconnects retain the last unexpired plan or Balanced fallback. Quota errors request a 60-second retry delay. Tactical play continues while waiting. An aborted request may already have reached OpenAI and incurred usage.

**Game server** mode uses `/api/commander/openai/status` and `/api/commander/openai/plan` and requires `OPENAI_API_KEY` in that server process. UI key entry uses **This computer** and does not configure a server key. The server adapter shares one request slot and cooldown across players. These modes remain solo-only; human multiplayer makes no model requests.

Implementation: `openai-commander.cjs` handles Decisions requests and answer validation; `local-key-ui.cjs` provides memory-only key entry. Both are included in the downloadable connector. They are not exposed as standalone files by the game web server.

### Where to change the logic

| Source | Responsibility |
| --- | --- |
| [opponent.js](opponent.js) | Preset numbers, allowed focus categories, and plan validation |
| `commander.cjs` (server and local connector source) | Summary validation, compact prompt, ordered shortlist, operation mappings, Ollama calls, deadlines, and warm-up |
| [game.js](game.js): `aiPolicy`, `requestModelPlan`, `acceptAIPlan` | Selected policy, Ollama cap adjustments, refresh/fallback behavior, and applying a plan |
| `game.js`: `aiEconomy`, `aiEmergencyProduction`, `aiCommittedProduction`, `aiBuild` | Paid production, threat counters, saved-up investments, and prerequisite-aware construction |
| `game.js`: `aiObjective`, `aiEngagement`, `aiFocusTarget`, `updateCommander` | Objective scores, strength estimates, targeting, guards, retreat, repairs, and raid timing |

`commander.cjs` is included in the source folder and downloadable connector bundle, but is not exposed as a standalone web endpoint. `local-commander.cjs` implements the pairing/job relay, `local-ai.cjs` runs on the player’s computer, and `ai-link.js` manages the browser connection UI. When changing a policy, check both its table in `opponent.js` and any shared tactical overrides in `game.js`; changing the prompt alone does not change the combat rules.


### Visible unit damage

Below 80% health, units show darker, worn materials and scorch marks. At 50% health or less, vehicles, ships, and aircraft emit smoke; at 25% or less they also show flickering fire. Infantry use worn armor and scorch marks without smoke or flames. Repairing through these thresholds removes the effects and restores the original materials. These are visual effects only and do not change combat statistics.

Damage visuals follow replicated health in multiplayer and stay hidden with their unit under fog of war. Smoke uses a fixed pool of four billboards per damaged vehicle (two in Performance graphics mode), without additional lights or shadow passes.

### Miner access and recovery

Miners reserve reachable loading and unloading positions around ore deposits and refineries. They avoid occupied positions and try another lane after three simulation seconds without progress. A blocked refinery can be approached from another side, or another completed friendly refinery can be used. If no access is available, they wait and retry rather than lose their cargo. Building changes invalidate cached access routes.

Exhausting the last ore deposit does not interrupt unloading a final load. Destroying a refinery preserves carried ore until a replacement is reachable. A miner displaced while harvesting returns to an access point before collecting more ore. These rules run in the multiplayer host simulation as well as solo play.

## Maps and naval warfare

- **Iron Valley** is the original dry map, with eight ridges and no naval construction.
- **River Front** has an east–west waterway and two bridges.
- **Four Shores** adds a north–south waterway and two more bridges, for four connected starting shores.

Ground forces navigate over bridges; ships sail beneath them and cannot drive onto land. Aircraft can cross either terrain. Ore remains on dry ground. Waterways and bridges appear on the radar under the existing fog rules. The map preview shows the layout before a battle; exploration still starts hidden during play.

Complete a refinery and power plant, scout the bank, and choose **Structures → Naval shipyard**. It costs **300 credits**, takes **12 seconds**, and consumes **25 power**. Place its footprint fully in water near shore, within construction territory, with clear water at its marked exit. Completed shore buildings can extend your territory toward the water. Bridges and their approaches cannot be built over.

Then choose **Units → Navy**:

| Unit | Cost | Build time | Role |
| --- | ---: | ---: | --- |
| Reef patrol boat | 160 | 6 s | Fast scouting and rapid deck cannon; ships and shore targets |
| Tide missile frigate | 320 | 10 s | Guided missiles against ships, ground units and aircraft |
| Storm bombardment ship | 480 | 16 s | Durable, long-range artillery with splash damage; no anti-air |

Each class has its own model and matching production portrait. The patrol boat is a compact coastal launch with a low wheelhouse, rubber fenders, and a single bow cannon. The longer frigate has an angular bridge, rotating radar, twin missile pods, and an aft landing-pad marking. The broad bombardment ship has a timber-colored deck, twin funnels, and three triple-gun turrets. Ships leave a light stern wake while moving. These details are visual; unit costs, weapon damage, and movement rules are unchanged.

Ships share the 24-unit army limit. Select them and right-click water to move, or a visible enemy to attack. They can bombard land targets within range while staying in water. Select a shipyard and right-click clear water to set its rally point. A blocked exit holds completed production until space clears. Selling or losing the shipyard pauses its pending line until another completed shipyard is available. Repair crawlers escort and repair land vehicles only. Solo computer opponents can expand to the shore, build shipyards, and recruit naval units.

Multiplayer hosts choose the map in the lobby. Changing it clears guests' ready status. The map is locked once the match starts, checked by the relay, and restored together with naval units after host or guest reconnects. All players must refresh for protocol v13.


## Superweapons

Complete an **Airfield** and **Power plant**, then build a superweapon from **Structures**. Each commander may own one of each, including structures under construction. Select the building or use the **Superweapons** panel to target a currently visible location. Left-click launches; right-click or Escape cancels. Scout first: explored but currently hidden territory cannot be targeted.

| Structure | Cost / power | Recharge | Strike |
| --- | --- | --- | --- |
| Tempest missile silo | 1,200 / 60 | 120 seconds | 4-second warning, radius 9, 450 damage at the center falling to 180 at the edge. Hits enemy units and buildings, including aircraft. |
| Blackout EMP array | 900 / 50 | 90 seconds | 3-second warning, radius 11, disables enemy vehicles, miners, aircraft, ships and defenses for 10 seconds. Infantry and economy buildings are unaffected. |

Construction takes 25 / 20 seconds respectively. Charging starts empty after completion. Low power pauses charging and prevents launches, even when charged. Match pauses freeze all timers. Firing consumes the full charge; selling and rebuilding starts empty. A launched strike continues if its launcher is sold or destroyed. Strikes do not harm friendly units. EMP preserves orders, so affected units resume after recovery; already-fired projectiles still land.

The sidebar displays recharge and incoming-strike countdowns, with battlefield warning rings, distinct missile/EMP effects and optional voice alerts. All four multiplayer seats use the same host-validated targeting, power and charge rules; strikes and EMP expiry are replicated in snapshots. Network protocol is now 13: every player must refresh after updating.

Solo opponents can invest in superweapons after six minutes when they have an airfield, at least six combat units and 400 credits left over. Their local tactical controller targets worthwhile visible enemy groups with the same recharge and vision restrictions. This targeting works with every opponent style, including Ollama and OpenAI; it does not require a separate LLM request.


### Choose an Ollama model

Open **Computer opponent → AI commander · Ollama**. Under **Send AI requests through**, choose **Game server** or **This computer**, then use **Ollama model**. The list shows installed completion models and download size; the refresh button reloads discovery (the backend caches discovery for up to 15 seconds). No model is downloaded by choosing it. Larger models may miss the existing five-second planning deadline.

Choices are remembered separately for server and player execution in this browser. **Automatic** uses the server's configured default or the connector's current model. Server choices travel with each planning request, so one player's choice does not change another player's model. Each model warms up independently; inference is still serialized on each Ollama adapter to avoid overloading the computer. Changing a model clears the previous game plan and requests a fresh one on the next active planning cycle. Paused games wait until resumed.

For **This computer**, download and restart the updated `local-ai.zip` connector, then pair it. It reports installed model names and sizes through the authenticated relay and uses the model requested by that browser. Older connectors still work with their default model, but cannot populate the dropdown. OpenAI mode keeps its existing model configuration and does not show the Ollama selector.
