# Iron Field v0.5 — LAN multiplayer

Two to four players can play a **free-for-all match** from separate browsers on the same Wi-Fi or local network. Each gets a mirrored base, the same starting units, two miners, and 600 credits. Seats use mint (southwest), coral (northeast), blue (northwest), and gold (southeast). Each commander has independent fog of war.

## Start the server

On the computer hosting the game, open **Start-Multiplayer.cmd** in this folder. It runs:

```text
node server.cjs
```

This needs Node.js 18 or newer. There are no npm dependencies. The terminal prints a local address and the host's network addresses. Leave that terminal open while playing; Ctrl+C stops the server.

Open **http://localhost:8766/** on the host computer. On the other computer, open the host's Wi-Fi/Ethernet address printed in the terminal, for example `http://192.168.1.25:8766/`. Use the actual printed address, not this example. The lobby also lists available addresses under “Connecting another computer.” Virtual adapters may have additional addresses; choose the adapter shared by all computers.

`localhost` on the other computer points to that other computer, so it will not connect to the host. All players must open the same running server.

If Windows asks about Node.js network access, allow the connection on the private network you intend to use. This project does not change firewall rules or router settings. If the guest cannot load the page, check the address, the server terminal, the host's private-network firewall permission, and whether Wi-Fi client isolation prevents devices from reaching each other.

## Host and join

1. The first player clicks **Multiplayer**, enters a commander name, and chooses **Host a match**.
2. Share the invite address or six-character room code. The invite contains no session credentials.
3. Up to three other players open that host address, enter the room code, and choose **Join match**.
4. Each joining player clicks **Ready**. The host starts ready but can toggle readiness too.
5. Once 2–4 players are connected and everyone is ready, the host clicks **Start match**.

The host starts southwest; joining players occupy the northeast, northwest, and southeast corners. **F** selects your combat army; **M** selects your miners. All ten ground vehicle types, three infantry types, three aircraft types, and all four defenses (guard turret, Tesla coil, missile battery, flame bunker) are available to all players. Production, ore, health, construction, weapon effects, and repair targets are synchronized. Each player must finish their own war factory to unlock vehicles and troop garrison to unlock infantry. Their factory, garrison, airfield, and HQ miner production lines run independently. Destroying a producer pauses its line until rebuilt; progress and prerequisites survive browser refresh. No multiplayer seat runs the solo enemy AI.

The host controls shared pause. Simulation speed is fixed at 1×, and AI raid controls are disabled for multiplayer. Local camera, wireframe, and grid settings remain independent. Destroy every rival command factory to win. An HQ loss eliminates that army while the other players continue fighting. Keep the host tab connected even if its army is eliminated.

After the match, the host can choose **Rematch**. All players return to the lobby and all guests must ready up again. Leaving a live match closes its room and returns all players to solo mode.

## Disconnections and refresh

The host browser runs the gameplay simulation. **Keep its game tab open and visible.** Moving it to the background pauses the shared match. Returning to the tab resumes it if all connections are healthy and the host has not manually paused.

The relay pauses command acceptance when any player disconnects. Browsers reconnect automatically. Refreshing the same tab restores its seat and the most recent server snapshot, including cargo, queues, units, building progress, rally points, aircraft altitude, and explored territory. A refresh can roll back approximately one snapshot interval. Refresh recovery is not a save system: stopping or restarting the server loses its rooms.

The server retains inactive rooms for up to 20 minutes. There is no host migration: another player does not take over simulation if the host leaves. To abandon a disconnected room, open Multiplayer and choose Leave room.

## How networking works

This is a **host-authoritative prototype**:

- `server.cjs` is a small Node HTTP server. It serves only the game files, creates rooms, assigns authenticated seats, and relays messages.
- `network.js` handles the lobby, browser session, reconnect logic, commands, and streaming snapshots.
- `game.js` contains the network adapter alongside the existing simulation. Only the host advances gameplay; the guest reconstructs and interpolates the host's state.
- A player sends an order containing unit IDs and a destination, rather than sending a new health or credit value.
- The relay assigns the sender's team from its session. The host checks ownership, costs, population limits, and construction placement before applying the order.
- The host simulates on its render loop with fixed 1/60-second steps and publishes up to **20 snapshots per second**. Only one publication can be in flight, so a slow connection does not accumulate a snapshot backlog. Snapshots include compact cached exploration grids, all economies, unit transforms, health, cargo, production, buildings, ore, and projectiles. Guests buffer about 75 ms of movement and interpolate positions and rotations between timestamped samples; they stop at the latest known position if updates are delayed.
- Recent shot and impact events travel with snapshots. Each client renders weapon effects locally and deduplicates events by ID, preserving brief rifle tracers and Tesla arcs between network updates. Damage remains authoritative on the host.
- The host applies its own commands immediately through the same gameplay ownership checks. Guest commands use authenticated HTTP POST requests; updates use a streaming HTTP response. No external signaling service, account, package download, or cloud service is involved.

Room sessions use random bearer tokens kept in each tab's session storage. Tokens travel in headers and are not included in the invite link. The relay rejects guest state publication, guest pause requests, stale match epochs, malformed positions, unknown unit types, oversized messages, and excessive command rates. A command ID prevents duplicate application of the same received command.

Fog of war conceals unseen enemies in the normal UI and gates targeting, but full world snapshots are still sent to every browser. Modified clients or developer tools can inspect that data. This is intended for trusted LAN play. The host has authority over the result; this is not an anti-cheat system or a public matchmaking service. HTTP is used on the local network. Public internet deployment, accounts, encrypted hosting, spectator slots, matchmaking, saved matches, and host migration are not included.

Official references: [Node HTTP server](https://nodejs.org/api/http.html) and [browser readable streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams).

## Different port or bind address

The default server listens on port 8766 on all network interfaces. To use another port from PowerShell:

```powershell
$env:PORT = '8770'
node server.cjs
```

For a test restricted to this computer:

```powershell
$env:HOST = '127.0.0.1'
node server.cjs
```

The connection addresses printed by the server reflect the selected port. Use the same port on the second computer. Close the terminal or clear these environment variables before returning to the default configuration.

## Solo still works

Opening `index.html` directly continues to provide the offline solo game. Its Multiplayer button explains how to launch the server. The earlier static preview server on port 8765 cannot host rooms; use the multiplayer server on port 8766.


Each selectable battlefield is 132 × 104 units; Iron Valley retains the original eight ridges. Ground navigation respects the ridges; aircraft fly over them. Complete an airfield to unlock aircraft. Select a production building and right-click to set its rally point. Exit placement, rally ownership, aircraft prerequisites, and target compatibility are checked by the host. Refresh every client after updating: protocol v12 prevents older game versions from creating or joining new rooms.

## Frame rate and responsiveness

If the whole game feels slow, choose **Lab → Graphics quality → Performance** on the affected computer, especially the host. This renders at up to 1× pixel density and turns off dynamic shadows. Balanced uses up to 1.25× density with 1024-pixel shadows; High retains the original up-to-2× density and 2048-pixel shadows. Each browser remembers its own choice. Game rules, fog, and unit counts are unchanged.

The host computer still runs the simulation; the Debian server relays it. A host that cannot keep up can slow every player. The battlefield footer displays local FPS. Keep the host tab visible, and use a stable LAN connection. The performance update caches navigation grids until buildings change, uses a heap for A* search, avoids repeated scene/material traversal, and reduces redundant guest UI/fog work.

In a local two-browser smoke benchmark, a 24-route batch fell from 179 ms to 46 ms and a starting two-player snapshot from 15.1 KB to 9.2 KB. These measure that test scene on the development computer, not a guaranteed frame rate or network latency on other hardware. Four-player production, fog, and host/guest refresh recovery are also covered by browser regression tests.

## Battle rewards

Enemy kills pay 50% of build cost (HQ: 300 credits) directly to the team landing the final hit, even without a refinery. All four seats use the same rules. A gold notice shows the payout; the resource bar tracks cumulative rewards separately from ore. Only the host calculates rewards. Balances and reward totals survive host/guest refresh without double payment. Eliminated teams and armies removed as part of HQ elimination receive no additional payouts. All players must refresh for protocol v12.

## Voice alerts

Production and under-attack events originate on the host and travel in snapshots. Each client speaks only its own team's events, with duplicate suppression and no historical speech on reconnect. **Lab → Voice alerts / Voice volume** controls each browser independently. Click once after loading to activate speech. Browser/system voice support is required; speech does not use the server's Ollama model.

## Structure repair and sale

Select your structure for **Repair / Sell** below the production tabs. Repair restores 25 HP/second for proportional credit cost, waiting when funds run out. Sell refunds half the build price adjusted for remaining health; HQs cannot be sold. The host validates ownership, updates the economy and world, and preserves repair state across reconnects. Selling a producer keeps its queue paused until another producer is available.

## Tech tree, power warnings, and repair escorts

Construction now requires your own completed prerequisites: HQ → Power → Refinery + Garrison → War factory → Airfield. Garrison unlocks turret/flame defenses; war factory unlocks missiles, and war factory + power unlocks Tesla coils. Existing structures remain operational if a prerequisite is sold or destroyed. Locked icons explain what is missing. The host enforces requirements for all four teams.

Low-power speech is team-specific and rate-limited. Mixed ground-army orders assign repair crawlers rear escort positions; a crawler can also escort a friendly combat vehicle by right-clicking it. Direct crawler-only movement or Stop clears its escort. Power warning and escort state survive host/guest refresh.

## Map selection and navy

The host chooses Iron Valley (dry), River Front (two bridges), or Four Shores (crossed waterways, four bridges) before starting. Guests see the selection but cannot edit it. A host map change resets guests to not ready. Map changes during play and snapshots with a different map ID are rejected by the relay. New matches and reconnects apply the same terrain definition to every seat.

Naval shipyards require a completed refinery and power plant, scouted water near shore, construction territory, and a clear launch point. The host validates all placements and rally orders. Patrol boats, missile frigates and bombardment ships use water-only navigation; ground units use bridges and aircraft fly overhead. Shipyard production pauses at a blocked exit. Ships, queues, rally points, power, and fog survive reconnects. The 24-unit limit includes ships. Refresh all browsers after upgrading to protocol v12.
