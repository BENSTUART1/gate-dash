'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WORLD_WIDTH, SUITCASE_RADIUS, MIN_CLEAR_SECONDS, laneAt, difficultyFor, obstaclesAt } = require('../traffic.js');
const sections = [0, 1, 2, 3, 5, 10, 20];
const movingRows = sections.flatMap(section => [1, 2, 3, 8, 9, 10].map(part => section * 12 + part))
  .filter(row => ['cart', 'people'].includes(laneAt(row).type));

function blocked(row, x, time) {
  const lane = laneAt(row);
  if (lane.type !== 'cart' && lane.type !== 'people') return false;
  return obstaclesAt(lane, time).some(item => Math.abs(item.x - x) < lane.width / 2 + SUITCASE_RADIUS);
}

test('lanes have varied, fixed speeds and unequal, repeating gaps', () => {
  for (const section of sections) {
    const a = laneAt(section * 12 + 2), b = laneAt(section * 12 + 3);
    assert.notEqual(Math.abs(a.speed), Math.abs(b.speed));
    assert.ok(a.speed > 0 && b.speed < 0);
    assert.notEqual(Math.abs(laneAt(section * 12 + 8).speed), Math.abs(laneAt(section * 12 + 9).speed));
    for (const row of [section * 12 + 2, section * 12 + 3, section * 12 + 8, section * 12 + 9]) {
      const lane = laneAt(row);
      assert.ok(new Set(lane.gaps).size >= 3);
      assert.ok(Math.max(...lane.gaps) / Math.min(...lane.gaps) > 1.4);
      assert.equal(laneAt(row), lane);
      assert.ok(Object.isFrozen(lane) && Object.isFrozen(lane.gaps));
      const period = lane.cycleLength / Math.abs(lane.speed);
      const positions = t => obstaclesAt(lane, t).map(item => item.x).sort((x, y) => x - y);
      const original = positions(3.7), repeated = positions(3.7 + period);
      assert.equal(original.length, repeated.length);
      original.forEach((x, i) => assert.ok(Math.abs(x - repeated[i]) < 1e-8));
    }
  }
});

test('all gaps, including pattern seams, retain a usable crossing window', () => {
  for (let row = 0; row < 600; row++) {
    const lane = laneAt(row);
    if (!lane.gaps) continue;
    assert.ok(Math.abs(lane.gaps.reduce((a, b) => a + b, 0) - lane.cycleLength) < 1e-8);
    lane.gaps.forEach((gap, i) => {
      const next = i === lane.offsets.length - 1 ? lane.cycleLength : lane.offsets[i + 1];
      assert.ok(Math.abs(next - lane.offsets[i] - gap) < 1e-8);
      const clearTime = (gap - lane.width - SUITCASE_RADIUS * 2) / Math.abs(lane.speed);
      assert.ok(clearTime >= MIN_CLEAR_SECONDS - 1e-10, `Unsafe gap on row ${row}`);
    });
  }
});

test('object identity and velocity stay continuous when a pattern wraps', () => {
  for (const row of movingRows) {
    const lane = laneAt(row);
    const wrapTime = ((lane.speed > 0 ? 2 : -2) * lane.cycleLength - lane.phase) / lane.speed;
    for (const time of [0, .001, 1.7, 16, 80, wrapTime - .001]) {
      const a = obstaclesAt(lane, time), b = obstaclesAt(lane, time + .002);
      for (const item of a) {
        const next = b.find(candidate => candidate.id === item.id);
        if (next) assert.ok(Math.abs(next.x - item.x - lane.speed * .002) < 1e-8);
      }
      assert.ok(a.every(item => item.x >= -80 && item.x <= WORLD_WIDTH + 80));
    }
  }
});

test('restarts are identical; progress cannot accelerate an existing lane', () => {
  const path = require.resolve('../traffic.js');
  delete require.cache[path];
  const freshRun = require('../traffic.js');
  for (const row of movingRows) {
    const originalSpeed = laneAt(row).speed;
    for (const time of [0, 4.5, 25, 110]) {
      assert.deepEqual(obstaclesAt(laneAt(row), time), freshRun.obstaclesAt(freshRun.laneAt(row), time));
    }
    laneAt(row + 1200);
    assert.equal(laneAt(row).speed, originalSpeed);
  }
  assert.equal(difficultyFor(0).pace, 1);
  assert.equal(difficultyFor(120).pace, 2);
  assert.equal(difficultyFor(1200).pace, 2);
  for (const section of sections) {
    for (const part of [0, 4, 7, 11]) assert.equal(laneAt(section * 12 + part).type, 'safe');
    assert.equal(laneAt(section * 12 + 1).type, section >= 3 ? 'people' : 'safe');
    assert.equal(laneAt(section * 12 + 10).type, section >= 5 ? 'cart' : 'safe');
    assert.ok(Math.abs(laneAt(section * 12 + 5).speed) <= 58 * 1.7 + 1e-10);
    assert.ok(Math.abs(laneAt(section * 12 + 6).speed) <= 76 * 1.7 + 1e-10);
  }
});

// Time-expanded route search: real 0.16 s inputs (slower than the game's
// 0.14 s input limit), checked at 0.02 s intervals during every move/wait.
// Search blocks between safe rows; conveyors between these blocks are safe.
function routeExists(startRow, endRow, startColumn, arrivalTime) {
  const dt = .02, ticksPerMove = 8, moves = 75, columns = 13;
  const ticks = moves * ticksPerMove + 1;
  const rows = endRow - startRow + 1;
  const occupied = Array.from({ length: rows * columns }, () => new Uint16Array(ticks + 1));
  for (let row = startRow; row <= endRow; row++) {
    if (laneAt(row).type === 'safe') continue;
    for (let tick = 0; tick < ticks; tick++) {
      const lane = laneAt(row), positions = obstaclesAt(lane, arrivalTime + tick * dt);
      for (let col = 0; col < columns; col++) {
        const p = occupied[(row - startRow) * columns + col];
        const hit = positions.some(item => Math.abs(item.x - (30 + col * 60)) < lane.width / 2 + SUITCASE_RADIUS);
        p[tick + 1] = p[tick] + Number(hit);
      }
    }
  }
  let frontier = new Set([startColumn]);
  for (let step = 0; step < moves; step++) {
    const next = new Set(), first = step * ticksPerMove, last = first + ticksPerMove;
    for (const key of frontier) {
      const r = Math.floor(key / columns), col = key % columns;
      for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr, nc = col + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= columns) continue;
        const path = occupied[nr * columns + nc];
        if (path[last + 1] - path[first] > 0) continue;
        if (nr === rows - 1) return true;
        next.add(nr * columns + nc);
      }
    }
    frontier = next;
  }
  return false;
}

test('early and late multi-lane blocks have routes at varied arrival times', () => {
  let samples = 0;
  for (const section of [0, 1, 3, 5, 10, 20]) {
    for (const [start, end] of [[0, 4], [7, 11]]) {
      for (const column of Array.from({ length: 13 }, (_, i) => i)) {
        for (const arrival of [0, 7.5, 19, 43, 80, 140]) {
          assert.ok(routeExists(section * 12 + start, section * 12 + end, column, arrival),
            `No route within 12 seconds: section ${section}, rows ${start}-${end}, column ${column}, time ${arrival}`);
          samples++;
        }
      }
    }
  }
  assert.equal(samples, 936);
});

test('collision intervals agree with obstacle positions and leave safe gaps', () => {
  for (const row of movingRows) {
    const lane = laneAt(row);
    for (const time of [0, 3, 14, 77]) {
      for (const item of obstaclesAt(lane, time)) {
        if (item.x < 80 || item.x > WORLD_WIDTH - 80) continue;
        assert.ok(blocked(row, item.x, time));
        assert.equal(blocked(row, item.x + lane.width / 2 + SUITCASE_RADIUS + 1, time), false);
        assert.equal(blocked(row, item.x - lane.width / 2 - SUITCASE_RADIUS - 1, time), false);
      }
    }
  }
});
