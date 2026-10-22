/* Deterministic traffic shared by rendering and collision detection.
 * Plain JavaScript: works directly from disk and in the Node test runner. */
(function (root, factory) {
  const traffic = factory();
  if (typeof module === 'object' && module.exports) module.exports = traffic;
  else root.GateDashTraffic = traffic;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const WORLD_WIDTH = 780;
  const SUITCASE_RADIUS = 15;
  const MIN_CLEAR_SECONDS = 0.48;
  const laneCache = new Map();
  const cartPatterns = [
    [0.85, 1.15, 0.95, 1.70],
    [1.25, 0.80, 1.65, 0.90],
    [0.90, 0.90, 1.75, 1.05],
    [1.55, 0.85, 1.15, 0.95]
  ];
  const walkingPatterns = [
    [0.60, 0.80, 1.65, 1.15],
    [0.75, 0.65, 1.90, 0.90],
    [0.85, 1.55, 0.60, 1.20],
    [1.65, 0.65, 0.90, 1.00]
  ];
  function mod(n, m) { return ((n % m) + m) % m; }

  function difficultyFor(row) {
    const section = Math.floor(row / 12);
    const pressure = Math.min(section, 10);
    return {
      level: section + 1,
      pace: 1 + pressure * 0.10,
      crowd: pressure
    };
  }

  function laneAt(row) {
    if (!Number.isInteger(row) || row < 0) throw new RangeError('Lane row must be a non-negative integer.');
    if (laneCache.has(row)) return laneCache.get(row);
    const section = Math.floor(row / 12), part = row % 12;
    const difficulty = difficultyFor(row);
    const extraFootTraffic = difficulty.level >= 4 && part === 1;
    const extraCartTraffic = difficulty.level >= 6 && part === 10;
    let lane;
    if ([0, 1, 4, 7, 10, 11].includes(part) && !extraFootTraffic && !extraCartTraffic) {
      lane = { type: 'safe', gate: part === 0 && row > 0, row, speed: 0 };
    } else if (part === 5 || part === 6) {
      lane = { type: 'belt', row, speed: (part === 5 ? 58 : -76) * Math.min(difficulty.pace, 1.7) };
    } else {
      const passenger = extraFootTraffic || part === 8 || part === 9;
      const pair = section % 2 === 0 ? [0, 1] : [1, 0];
      const index = passenger ? (part === 8 ? pair[0] : part === 9 ? pair[1] : 2)
        : part === 2 ? pair[0] : part === 3 ? pair[1] : 2;
      const baseSpeed = (passenger ? [44, 58, 52] : [78, 104, 92])[index];
      const speed = (part % 2 ? -1 : 1) * baseSpeed * difficulty.pace;
      const width = passenger ? 30 : 105;
      const spacing = passenger ? 270 - difficulty.crowd * 5 : 390 - difficulty.crowd * 8;
      const patterns = passenger ? walkingPatterns : cartPatterns;
      const pattern = patterns[(section + part) % patterns.length];
      // Keep a real crossing window between every pair, including the cycle seam.
      const minimumGap = width + SUITCASE_RADIUS * 2 + Math.abs(speed) * MIN_CLEAR_SECONDS;
      const gaps = Object.freeze(pattern.map(factor => Math.max(spacing * factor, minimumGap)));
      let cycleLength = 0;
      const offsets = Object.freeze(gaps.map(gap => { const at = cycleLength; cycleLength += gap; return at; }));
      lane = {
        type: passenger ? 'people' : 'cart', row, speed, width, spacing,
        gaps, offsets, cycleLength, phase: row * 139,
        rhythm: baseSpeed === (passenger ? 58 : 104) ? 'express' : baseSpeed === (passenger ? 44 : 78) ? 'steady' : 'mixed'
      };
    }
    lane = Object.freeze(lane);
    laneCache.set(row, lane);
    return lane;
  }

  function obstaclesAt(lane, time) {
    if (lane.type !== 'cart' && lane.type !== 'people') return [];
    const offset = lane.phase + time * lane.speed;
    const wrap = Math.floor(offset / lane.cycleLength);
    const phase = mod(offset, lane.cycleLength);
    const count = lane.offsets.length;
    const items = [];
    for (let cycle = -1; cycle <= Math.ceil(WORLD_WIDTH / lane.cycleLength) + 1; cycle++) {
      for (let index = 0; index < count; index++) {
        const x = phase + cycle * lane.cycleLength + lane.offsets[index];
        // Recycle beyond the visible sprite/hitbox, never inside the playfield.
        if (x >= -80 && x <= WORLD_WIDTH + 80) {
          items.push({ x, id: (cycle - wrap) * count + index });
        }
      }
    }
    return items;
  }

  return Object.freeze({ WORLD_WIDTH, SUITCASE_RADIUS, MIN_CLEAR_SECONDS, difficultyFor, laneAt, obstaclesAt });
});
