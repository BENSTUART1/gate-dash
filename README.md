# Gate Dash

A local, offline airport arcade prototype inspired by Skyscanner, for school careers fairs.

## Play

Open `index.html` in a current browser on Mac or Windows. All assets are local; no installation, network connection, account or server is required.

Use arrow keys or WASD to hop. On touchscreens use the arrow buttons below the game. Avoid baggage carts and passengers. Conveyors move the suitcase sideways and stop safely at the visible end rails. Reaching a screen edge does not end the run; only collisions with baggage carts or passengers do. You earn one point for every new furthest row. Escape pauses; switching windows pauses automatically. Sound starts muted. Use the Sound button below the game or press M to toggle it.

The right panel displays the actual source of five functions from `game.js`, with brief event highlights. It is an educational view of game events rather than a debugger that steps through every frame.

The leaderboard holds five scores in this browser's local storage and resets on a new local calendar day. Use three letters/numbers, not full names. Scores are separate per laptop/browser. If storage is unavailable, the board lasts for the session. The dynamic traffic course uses its own v3 board; earlier v1/v2 boards remain stored separately and are not mixed with new scores. A fixed course and starting obstacle positions are used for each run; there is no random generation. Browser-local scores are suitable for friendly stand competition and are not tamper resistant.

## Files

- `index.html`: screen structure and controls.
- `style.css`: 65/35 desktop layout, responsive layout and colours.
- `game.js`: canvas artwork, simulation, controls, live code and leaderboard.
- `traffic.js`: deterministic lane speeds, traffic groups and shared obstacle positions.
- `tests/traffic.test.cjs`: Node tests for repeatability, gaps, motion continuity and routes.

For an HTTP preview, run `python3 -m http.server 8765 --bind 127.0.0.1` from this folder and open `http://127.0.0.1:8765`.

This is a local careers-fair prototype. The Skyscanner logo uses the original SVG artwork from the header of [Skyscanner’s official media page](https://www.skyscanner.com/us/en-gb/usd/media), saved as `assets/skyscanner-logo.svg` for offline use. Its path geometry is unchanged; website-only classes were removed and its blue fill made explicit. The game can be operated with keyboard or pointer; gameplay still relies on vision and timing. Further accessibility review and school-fair playtesting should precede event use.

## Difficulty and artwork

Every 12 rows begins a new gate and raises the pace multiplier by 10 percentage points, capped at 2× after 10 sections. Neighbouring cart lanes use different base speeds (78 and 104 logical units/second); passenger lanes use 44 and 58. Their order alternates between sections, and later extra lanes use intermediate speeds. Each lane has a four-obstacle repeating pattern with unequal gaps and a longer breathing space. Speeds stay fixed for that lane throughout a run, including on revisits: there is no acceleration based on proximity, score or elapsed time.

At level 4 an extra passenger lane appears; at level 6 an extra cart lane appears. Gate rows and rows 4, 7 and 11 in every section remain safe. Conveyor speeds increase gently to a capped multiplier of 1.7×, and their end stops remain safe. All traffic comes from row number and simulation time, with the same starting positions and timings in each attempt. Every individual gap, including where the repeating pattern joins, guarantees at least 0.48 seconds of collision-free crossing time at a fixed horizontal position. That minimum gap alone is not a promise that an arbitrary decision inside multiple hazardous lanes is safe; the route tests also search for valid crossings of each multi-lane block at sampled arrival times.

The canvas artwork is original: ribbed luggage, luggage labels, wheels and blinking expressions, passengers with varied skin tones, outfits and walking animations, detailed baggage tugs, tiled floors, belt rollers, destination signs and floor markings. Reduced-motion settings disable the suitcase bounce/tilt, facial blink and walking animation; moving game obstacles remain necessary to play. Conveyor end stops remain safe.

### Research references

- [EvanBacon/Expo-Crossy-Road](https://github.com/EvanBacon/Expo-Crossy-Road): MIT-licensed Crossy Road reference using Expo/Three.js; reviewed as a possible direction for a future 3D version.
- [SepraDC/crossy-js](https://github.com/SepraDC/crossy-js): another Three.js reference.

No code, character artwork or game assets from those repositories were copied into this version. It retains its dependency-free Canvas implementation and offline operation.

## Live leaderboard target

A compact target and progress bar sit beside the score, outside the game canvas. With five scores recorded, it first targets the score needed to enter the top five. Once qualified (or on a partially filled board), it targets the nearest opponent ahead, then first place. Ties require one additional row. Within five rows the target turns amber; taking the lead turns it green. An empty board invites the first score. The target freezes on game over so saving your own score does not make you compete against yourself, and resets for the next student.

## Optional audio, destination themes and code recap

Sound is synthesized locally using Web Audio: a soft hop, a three-note boarding chime when reaching a new 12-row gate, and a distinct celebration when first overtaking the saved leader. It starts off on every page load, can be toggled below the game or with M, and does not require downloads. Muting or pausing stops queued notes immediately. Browsers without usable Web Audio keep the game playable with a disabled sound button. The preference remains for the next student until the page reloads.

Each 12-row section has a fixed destination theme: Edinburgh, Barcelona, Tokyo, New York, Singapore and Reykjavik, repeating thereafter. Floor, road, walkway, conveyor and gate colours change by section. Decorative floor motifs depict castles, sun and waves, blossom, a skyline, gardens and mountains. Their geometry is decorative; collision rules and course difficulty are unchanged.

After a run, the existing code panel becomes a recap of an action actually recorded in that run. It prioritizes a gate milestone, then a conveyor ride, then hopping; the source shown is the real function. Tabs allow exploring scoring and collision lessons too. Recaps stay visible until the next run, while leaderboard saving and retry remain on the result screen. No replay or simulated history is presented as actual gameplay.

## Visual direction: miniature airport diorama

The visual overhaul is original Canvas/CSS artwork with no third-party game art or runtime dependencies. Faceted toy luggage, expressive block passengers, baggage tugs, layered shadows and raised platform edges create depth without a 3D engine. Each destination has its own floor treatment: stone paving, warm mosaic tiles, blossom details, terrazzo, garden motifs or icy geometric tiles.

The rendered canvas now includes clearly separated scenery strips outside the 780-unit playable world. Window bays, small city silhouettes, gate displays, benches, plants and coffee kiosks are decorative and outside the playable lanes. All graphics inside safe walking areas are flat floor markings. The canvas is 900 units wide including scenery; its horizontal drawing translation does not alter scoring, lane speeds, input, collision geometry or conveyor bounds.

The 65/35 desktop layout uses a paper-and-brass game surround, the original official Skyscanner logo, a dark live-code panel and a departures-style leaderboard. All five scores fit at typical laptop sizes. Reduced-motion settings retain the existing subdued animations policy. Screenshots showing a full leaderboard use explicitly identified example scores from an isolated browser session; real scores are not replaced.

## Traffic checks

Run `node --test tests/traffic.test.cjs` from this folder. No package installation is needed. The same `obstaclesAt` positions drive both drawing and collision checks, and stable object IDs keep vehicle/character appearances consistent as they leave the screen.

## Final display and credit

The boarding ticket is centered over the game/title area, leaving the right column free to start higher on desktop. The 65/35 split remains on laptop screens. The code editor grows naturally to show the complete selected function without an internal vertical scrollbar, and every tab has a short visible description (Hop, Score, Conveyor, Collision and Level). Smaller screens stack the panels to retain readable code.

The interface uses Skyscanner's official Backpack colour values: accent blue `#0062e3`, primary navy `#05203c`, white and subtle blue `#e3f0ff`. Palette reference: https://raw.githubusercontent.com/Skyscanner/backpack/main/token-sync/css/theme-backpack-light.css. The original official logo and destination game artwork are retained. The bottom-right credit is Ben Stuart.
