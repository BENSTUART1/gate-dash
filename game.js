'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const W = 780, VIEW_W = 900, WORLD_X = 60, CELL = 60, ROW = 64;
  const { difficultyFor, laneAt, obstaclesAt } = window.GateDashTraffic;
  let H = 650;
  function resizeCanvas() {
    H = Math.round(VIEW_W * canvas.clientHeight / canvas.clientWidth) || 650;
    canvas.width = VIEW_W;
    canvas.height = H;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const directions = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
  const destinationThemes = [
    { name: 'EDINBURGH', motif: 'castle', floor: '#e0e4df', gate: '#95b8b2', road: '#526d79', walk: '#c2d0c9', belt: '#304c5b', accent: '#538e8c', ink: '#214f5b', sky: '#c4dce0' },
    { name: 'BARCELONA', motif: 'sun', floor: '#f4debc', gate: '#dfb483', road: '#806f68', walk: '#e8c9a0', belt: '#555f65', accent: '#c46c46', ink: '#78482f', sky: '#f1cda6' },
    { name: 'TOKYO', motif: 'blossom', floor: '#eee5eb', gate: '#d7afc6', road: '#645f7c', walk: '#d4c6df', belt: '#403e5b', accent: '#ac6494', ink: '#594360', sky: '#e9cfdf' },
    { name: 'NEW YORK', motif: 'skyline', floor: '#dfe7e3', gate: '#c7bf86', road: '#425c6e', walk: '#bfcfcb', belt: '#2d465a', accent: '#b99037', ink: '#314b5c', sky: '#b9d2dd' },
    { name: 'SINGAPORE', motif: 'garden', floor: '#e3ead9', gate: '#9fc8a1', road: '#526e69', walk: '#c2d6b7', belt: '#31594f', accent: '#4e9466', ink: '#315f4f', sky: '#bcded1' },
    { name: 'REYKJAVIK', motif: 'mountain', floor: '#e7eef0', gate: '#acceda', road: '#627d8e', walk: '#c9dce2', belt: '#405c70', accent: '#5f9cb6', ink: '#385c77', sky: '#d1e8ef' }
  ];
  function destinationFor(row) { return destinationThemes[mod(Math.floor(row / 12), destinationThemes.length)]; }
  let runEvidence = { hops: 0, conveyorRow: null, gateRow: null };
  let soundEnabled = false, audioContext = null;
  const activeTones = new Map();
  const traveller = { x: 390, row: 0, onConveyor: false };
  const run = { score: 0, state: 'ready', time: 0, lastHop: -1, camera: 0, hopUntil: 0, saved: false };
  let previousTime = 0, shownFunction = '', highlightUntil = 0, nextSignalAt = 0;
  let storageAvailable = true, leaderboard = [], boardDay = localDay();
  const notes = {
    hop: 'Input → movement. Your key press just moved the suitcase.',
    awardDistance: 'New ground! Your furthest row becomes your score.',
    rideConveyor: 'The belt adds its speed to your position each frame.',
    finishRun: 'Collision detected. The game stops and keeps your score.',
    difficultyFor: 'New gate: mixed lane speeds and staggered groups ahead.'
  };

  // These five functions are also displayed, directly from their source,
  // in the live code panel. They are part of the running game.
  function hop(direction) {
    if (run.state !== 'playing') return;
    const [dx, dy] = directions[direction];
    traveller.x = clamp(traveller.x + dx * CELL, 30, 750);
    traveller.row = Math.max(0, traveller.row + dy);
    signal('hop');
    awardDistance();
  }

  function awardDistance() {
    if (traveller.row > run.score) {
      run.score = traveller.row;
      updateScore();
      playProgressSound();
      if (run.score % 12 === 0) runEvidence.gateRow = run.score;
      signal(run.score % 12 === 0 ? 'difficultyFor' : 'awardDistance');
    }
  }

  function rideConveyor(dt) {
    if (traveller.onConveyor) {
      const nextX = traveller.x + currentLane().speed * dt;
      traveller.x = clamp(nextX, 30, 750);
      signal('rideConveyor');
    }
  }

  function finishRun(reason) {
    if (run.state !== 'playing') return;
    run.state = 'finished';
    signal('finishRun');
    showResult(reason);
  }

  const functions = { hop, awardDistance, rideConveyor, finishRun, difficultyFor };
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function mod(n, m) { return ((n % m) + m) % m; }
  function localDay() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  function refreshDay() {
    if (localDay() !== boardDay) { boardDay = localDay(); loadBoard(); }
  }
  function loadBoard() {
    try {
      const stored = JSON.parse(localStorage.getItem('gate-dash-board-v3') || 'null');
      leaderboard = stored && stored.day === boardDay && Array.isArray(stored.entries)
        ? stored.entries.filter(e => /^[A-Z0-9]{1,3}$/.test(e.tag) && Number.isInteger(e.score) && e.score > 0).slice(0, 5) : [];
      leaderboard.sort((a, b) => b.score - a.score);
    } catch { storageAvailable = false; leaderboard = []; }
    renderBoard();
  }
  function renderBoard() {
    const list = $('leaders');
    list.replaceChildren();
    if (!leaderboard.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-board';
      empty.textContent = 'First flight of the day? Set the score to beat.';
      list.append(empty);
    }
    leaderboard.forEach((entry, i) => {
      const li = document.createElement('li');
      for (const [className, content] of [['rank', String(i + 1).padStart(2, '0')], ['tag', entry.tag], ['', String(entry.score).padStart(3, '0')]]) {
        const item = document.createElement(className ? 'span' : 'strong');
        item.className = className; item.textContent = content; li.append(item);
      }
      list.append(li);
    });
    $('best').textContent = leaderboard.length ? String(leaderboard[0].score).padStart(3, '0') : '—';
    $('board-note').textContent = storageAvailable ? 'Saved on this browser · A fresh board each day.' : 'Browser storage is unavailable · Scores last for this session.';
    if (run.state !== 'finished') updateRaceTarget();
  }
  function updateRaceTarget() {
    const panel = $('race-target');
    const message = $('target-message');
    const progress = $('target-progress');
    const fullBoard = leaderboard.length === 5;
    const cutoff = fullBoard ? leaderboard[4] : null;
    // Equal scores keep the earlier entrant ahead, so beat the score by one.
    const opponent = [...leaderboard].reverse().find(entry => entry.score >= run.score);
    const qualifying = cutoff && run.score <= cutoff.score;
    const target = qualifying ? cutoff : opponent;
    let state = 'chasing';
    let label = '↗ NEXT TO BEAT';
    if (!leaderboard.length) {
      state = 'empty'; label = '↗ FIRST FLIGHT';
      message.textContent = 'Set the first score!';
      progress.max = 1; progress.value = 0;
    } else if (!target) {
      state = 'leading'; label = '★ OUT IN FRONT';
      message.textContent = 'You’re in first place!';
      progress.max = 1; progress.value = 1;
    } else {
      const needed = target.score + 1 - run.score;
      const rows = needed === 1 ? 'row' : 'rows';
      message.textContent = qualifying
        ? `${needed} ${rows} to the top five`
        : `${needed} ${rows} to beat ${target.tag}`;
      if (qualifying) label = '↗ TOP FIVE IN SIGHT';
      if (needed <= 5) { state = 'close'; label = '↗ SO CLOSE!'; }
      progress.max = target.score + 1; progress.value = run.score;
    }
    panel.dataset.state = state;
    $('target-label').textContent = label;
    progress.setAttribute('aria-label', message.textContent);
  }
  function updateScore() {
    $('score').textContent = String(run.score).padStart(3, '0');
    $('var-score').textContent = run.score;
    updateRaceTarget();
  }
  function syncTraveller() {
    traveller.onConveyor = currentLane().type === 'belt';
    $('var-row').textContent = traveller.row;
    $('var-belt').textContent = String(traveller.onConveyor);
    const level = difficultyFor(traveller.row).level;
    $('zone').textContent = `LEVEL ${String(level).padStart(2, '0')} · ${destinationFor(traveller.row).name}`;
    $('gate-sign').textContent = `${12 - mod(traveller.row, 12)} ROWS TO NEXT GATE ↑`;
  }
  function signal(name) {
    const now = performance.now();
    if (name === 'rideConveyor' && now < nextSignalAt) return;
    // Briefly hold each event so a human can follow it. Hop highlights first;
    // score highlights a moment later if the same move earned a point.
    if (name === 'awardDistance' && shownFunction === 'hop' && now < highlightUntil) {
      pendingScore = true; return;
    }
    if (name === 'rideConveyor') nextSignalAt = now + 1500;
    if (name === 'difficultyFor') pendingScore = false;
    showCode(name, true);
    highlightUntil = now + (name === 'finishRun' ? 4000 : 850);
    $('event-caption').textContent = notes[name];
  }
  let pendingScore = false;
  function showCode(name, active = false) {
    shownFunction = name;
    $('source-file').textContent = name === 'difficultyFor' ? 'traffic.js' : 'game.js';
    const pre = $('source'); pre.replaceChildren();
    functions[name].toString().split('\n').forEach((text, index) => {
      const row = document.createElement('span');
      row.className = 'code-line' + (active && index > 0 && index < functions[name].toString().split('\n').length - 1 ? ' lit' : '');
      const number = document.createElement('span'); number.className = 'line-number'; number.textContent = index + 1;
      row.append(number);
      // Remove the enclosing file's indentation without altering the function.
      const line = index ? text.replace(/^  /, '') : text;
      for (const part of line.split(/('[^']*'|\b(?:function|if|return|const|let|false|true)\b|\b\d+\b)/g)) {
        const token = document.createElement('span'); token.textContent = part;
        token.className = /^'/.test(part) ? 'token-string' : /^(function|if|return|const|let|false|true)$/.test(part) ? 'token-keyword' : /^\d+$/.test(part) ? 'token-number' : '';
        row.append(token);
      }
      pre.append(row);
    });
    document.querySelectorAll('[data-code]').forEach(button => {
      const selected = button.dataset.code === name;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function currentLane() { return laneAt(traveller.row); }
  function obstacles(lane) {
    return obstaclesAt(lane, run.time);
  }
  function obstacleXs(lane) { return obstacles(lane).map(item => item.x); }
  function tryHop(direction) {
    if (run.state !== 'playing' || run.time - run.lastHop < .14) return;
    run.lastHop = run.time; run.hopUntil = run.time + .16;
    const oldX = traveller.x, oldRow = traveller.row;
    hop(direction);
    if (traveller.x !== oldX || traveller.row !== oldRow) {
      runEvidence.hops++;
      if (run.score % 12 !== 0 || traveller.row <= oldRow) playSound('hop');
    }
    syncTraveller(); checkCollision();
  }
  function checkCollision() {
    if (run.state !== 'playing') return;
    const lane = currentLane();
    if (lane.type === 'cart' || lane.type === 'people') {
      if (obstacleXs(lane).some(x => Math.abs(x - traveller.x) < lane.width / 2 + 15)) {
        finishRun(lane.type === 'cart' ? 'A baggage cart caught up with you.' : 'You bumped into a fellow traveller.');
      }
    }
  }
  function showOverlay(id) {
    $('overlay').classList.remove('hidden');
    ['welcome', 'paused', 'finished'].forEach(name => $(name).classList.toggle('hidden', name !== id));
  }
  function startRun() {
    refreshDay();
    runEvidence = { hops: 0, conveyorRow: null, gateRow: null };
    $('recap').classList.add('hidden');
    document.querySelector('.code-panel').classList.remove('recap-mode');
    $('code-title').textContent = 'You move. Code runs.';
    $('code-mode').textContent = '● LIVE';
    Object.assign(traveller, { x: 390, row: 0, onConveyor: false });
    Object.assign(run, { score: 0, state: 'playing', time: 0, lastHop: -1, camera: 0, hopUntil: 0, saved: false, leadCelebrated: false });
    pendingScore = false; nextSignalAt = 0; highlightUntil = 0;
    $('overlay').classList.add('hidden'); $('pause').disabled = false; $('pause').textContent = 'Ⅱ';
    $('pause').setAttribute('aria-label', 'Pause game');
    $('score-form').classList.remove('hidden'); $('save-status').textContent = ''; $('nickname').value = '';
    updateScore(); syncTraveller(); showCode('hop');
    $('event-caption').textContent = 'You’re ready to go. Press ↑ to take your first hop.';
    document.activeElement?.blur();
  }
  function pauseRun() {
    if (run.state !== 'playing') return;
    stopSounds();
    run.state = 'paused'; $('pause').textContent = '▶'; $('pause').setAttribute('aria-label', 'Resume game'); showOverlay('paused');
  }
  function resumeRun() {
    if (run.state !== 'paused') return;
    run.state = 'playing'; $('overlay').classList.add('hidden'); $('pause').textContent = 'Ⅱ'; $('pause').setAttribute('aria-label', 'Pause game');
  }
  function showResult(reason) {
    pendingScore = false; $('pause').disabled = true;
    $('result').textContent = `${reason} You travelled ${run.score} ${run.score === 1 ? 'row' : 'rows'}.`;
    showOverlay('finished');
    showRunRecap();
    if (!run.score) { $('score-form').classList.add('hidden'); $('save-status').textContent = 'Take another flight to set your first score.'; }
  }
  function updateSoundButton() {
    $('sound-toggle').textContent = soundEnabled ? '♪ Sound on' : '♪ Sound off';
    $('sound-toggle').setAttribute('aria-pressed', String(soundEnabled));
    $('sound-toggle').title = soundEnabled ? 'Mute sound (M)' : 'Enable sound (M)';
  }
  async function toggleSound() {
    soundEnabled = !soundEnabled;
    updateSoundButton();
    if (!soundEnabled) { stopSounds(); return; }
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio unavailable');
      if (!audioContext) audioContext = new Audio();
      if (audioContext.state === 'suspended') await audioContext.resume();
      if (soundEnabled) playSound('hop');
    } catch {
      soundEnabled = false; stopSounds();
      $('sound-toggle').textContent = 'Sound unavailable';
      $('sound-toggle').setAttribute('aria-pressed', 'false');
      $('sound-toggle').title = 'This browser could not enable audio';
      $('sound-toggle').disabled = true;
    }
  }
  function stopSounds() {
    for (const [oscillator, gain] of activeTones) {
      try { gain.gain.cancelScheduledValues(audioContext.currentTime); gain.gain.setValueAtTime(0, audioContext.currentTime); oscillator.stop(); } catch { /* Already ended. */ }
    }
    activeTones.clear();
  }
  function playSound(kind) {
    if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
    const notes = kind === 'gate' ? [523.25, 659.25, 783.99] : kind === 'lead' ? [659.25, 783.99, 1046.5, 1318.5] : [520];
    const duration = kind === 'hop' ? .07 : .17;
    try {
      notes.forEach((frequency, i) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const at = audioContext.currentTime + i * .12;
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, at);
        if (kind === 'hop') oscillator.frequency.exponentialRampToValueAtTime(360, at + duration);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(kind === 'hop' ? .035 : .055, at + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        activeTones.set(oscillator, gain);
        oscillator.onended = () => { activeTones.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at); oscillator.stop(at + duration + .02);
      });
    } catch { stopSounds(); }
  }
  function playProgressSound() {
    const takingLead = leaderboard.length > 0 && run.score > leaderboard[0].score && !run.leadCelebrated;
    if (takingLead) { run.leadCelebrated = true; playSound('lead'); }
    else if (run.score % 12 === 0) playSound('gate');
  }
  function showRunRecap(requested) {
    const selected = requested || (runEvidence.gateRow !== null ? 'difficultyFor' : runEvidence.conveyorRow !== null ? 'rideConveyor' : runEvidence.hops ? 'hop' : 'finishRun');
    const gate = runEvidence.gateRow;
    const lessons = {
      hop: ['Your controls became movement.', runEvidence.hops ? `You made ${runEvidence.hops} ${runEvidence.hops === 1 ? 'hop' : 'hops'}. This function turned each direction into a new suitcase position.` : 'Each direction moves the suitcase one step. This run ended before you made a hop.'],
      awardDistance: ['New ground became points.', `You reached ${run.score} ${run.score === 1 ? 'row' : 'rows'}. This function only adds points for a new furthest row, so moving back and forth cannot build your score.`],
      rideConveyor: ['The belt moved your suitcase.', runEvidence.conveyorRow !== null ? `On row ${runEvidence.conveyorRow}, the conveyor added its speed to your position each frame. The clamp keeps you safely inside the edges.` : 'This function carries the suitcase sideways when it is on a conveyor. You did not ride one during this run.'],
      difficultyFor: ['Your next gate got tougher.', gate !== null ? `At row ${gate}, you entered level ${difficultyFor(gate).level}. This function selected a ${difficultyFor(gate).pace.toFixed(2)}× pace multiplier. Each lane uses it to set a steady speed and a repeating traffic rhythm.` : `Your run reached row ${run.score}. Every 12 rows, this function tunes the next section’s mixed speeds and traffic groups.`],
      finishRun: ['A collision stopped the game.', 'When a collision was detected, this function changed the game state to finished and showed your result.'
      ]
    };
    const [title, explanation] = lessons[selected];
    $('recap-title').textContent = title; $('recap-text').textContent = explanation;
    $('recap').classList.remove('hidden');
    document.querySelector('.code-panel').classList.add('recap-mode');
    $('code-title').textContent = 'Your run, explained.'; $('code-mode').textContent = 'RECAP';
    pendingScore = false; showCode(selected, true); highlightUntil = 0;
  }
  function roundRect(x, y, w, h, radius, fill) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  }
  function text(value, x, y, size, colour, align = 'center') {
    ctx.fillStyle = colour; ctx.font = `700 ${size}px Arial, sans-serif`; ctx.textAlign = align; ctx.fillText(value, x, y);
  }
  // Original toy-airport artwork. Scene coordinates do not alter collision geometry.
  const colourCache = new Map();
  function shade(hex, amount) {
    const key = hex + ':' + amount;
    if (colourCache.has(key)) return colourCache.get(key);
    const value = parseInt(hex.slice(1), 16);
    const target = amount > 0 ? 255 : 0, mix = Math.abs(amount);
    const channels = [16, 8, 0].map(shift => Math.round(((value >> shift) & 255) * (1 - mix) + target * mix));
    const result = '#' + channels.map(n => n.toString(16).padStart(2, '0')).join('');
    colourCache.set(key, result); return result;
  }
  function ellipse(x, y, rx, ry, colour) {
    ctx.fillStyle = colour; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function line(x1, y1, x2, y2, colour, width = 1) {
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function polygon(points, colour) {
    ctx.fillStyle = colour; ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.fill();
  }
  function block(x, y, w, d, h, colour) {
    const left = x - w / 2, right = x + w / 2, back = y - d / 2, front = y + d / 2, skew = 4;
    polygon([[left,back-h],[right,back-h],[right+skew,front-h],[left+skew,front-h]], shade(colour,.24));
    polygon([[right,back-h],[right+skew,front-h],[right+skew,front],[right,back]], shade(colour,-.22));
    polygon([[left+skew,front-h],[right+skew,front-h],[right+skew,front],[left+skew,front]], colour);
    line(left+skew,front-h,right+skew,front-h,shade(colour,.36),1);
  }
  function plant(x, y, theme) {
    ellipse(x+5,y+11,18,7,'#193e4930');
    block(x,y,22,17,17,'#e6d9bb');
    block(x,y-18,27,20,4,'#f4e9d0');
    block(x-4,y-23,24,18,18,'#4e977a');
    block(x+6,y-30,20,18,19,'#67aa84');
    block(x-4,y-40,19,15,15,'#7fba91');
  }
  function drawSuitcase(x, y) {
    const hopProgress = clamp((run.hopUntil - run.time) / .16, 0, 1);
    const bounce = reducedMotion ? 0 : Math.sin(hopProgress * Math.PI) * 10;
    ellipse(x+3,y+17,24-bounce*.3,8,'#15364739');
    ellipse(x+1,y+16,16-bounce*.15,4,'#15364725');
    ctx.save(); ctx.translate(x,y-bounce);
    if (!reducedMotion) ctx.rotate(Math.sin(hopProgress*Math.PI)*.045);
    block(-11,15,8,9,9,'#254251'); block(12,15,8,9,9,'#254251');
    roundRect(-13,10,3,5,1,'#8ba0a3'); roundRect(10,10,3,5,1,'#8ba0a3');
    // Retractable handle sits behind a broad, expressive front face.
    roundRect(-8,-59,5,21,2,'#314d5d'); roundRect(6,-59,5,21,2,'#314d5d');
    roundRect(-8,-61,19,5,2,'#254251');
    block(0,0,39,25,35,'#edac35');
    block(-1,-2,36,23,34,'#ffc64b');
    line(-11,-23,-11,7,'#e6a631',2); line(13,-23,13,7,'#e6a631',2);
    roundRect(-14,-24,3,30,1,'#ffe59a'); roundRect(15,-23,3,29,1,'#e9a537');
    const blink = !reducedMotion && mod(run.time,6)>5.82;
    roundRect(-8,-17,7,blink?2:10,3,'#263d4b'); roundRect(6,-17,7,blink?2:10,3,'#263d4b');
    if (!blink) { roundRect(-7,-16,3,3,1,'#fff8dc'); roundRect(7,-16,3,3,1,'#fff8dc'); }
    ellipse(-11,-5,3,2,'#f49e55'); ellipse(16,-5,3,2,'#f49e55');
    ctx.strokeStyle='#79572a';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(3,-5,3,0,Math.PI);ctx.stroke();
    ellipse(-7,4,5,5,'#0872db'); text('✈',-7,6,7,'#ffffff');
    roundRect(5,1,11,7,1,'#fff6d6'); text('GD',10,6,5,'#426579');
    line(20,-22,25,-14,'#5a624b',1); block(23,-8,7,5,12,'#fff6de');
    line(21,-16,26,-16,'#c6be9c');
    ctx.restore();
  }
  function drawBag(x,y,colour,size=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    roundRect(-5,-27,10,8,2,shade(colour,-.45));roundRect(-2,-25,4,4,1,'#d9ded3');
    block(0,0,18,12,24,colour);
    line(-4,-16,-4,3,shade(colour,.4),2);line(6,-16,6,3,shade(colour,-.2));
    roundRect(0,-8,6,5,1,'#fff2d2');
    ctx.restore();
  }
  function drawCart(x,y,direction,id=0) {
    const variant=mod(id,3);
    const paint=['#248fd1','#df7657','#5aa48c'][variant];
    ctx.save();ctx.translate(x,y);ctx.scale(direction,1);
    ellipse(0,16,56,10,'#122f433d');
    for(const wx of [-44,-12,21,44]){block(wx,16,9,10,11,'#243947');roundRect(wx-2,10,4,5,1,'#8b9b9d');}
    block(-22,6,62,25,9,'#afc2be');block(-22,-3,62,25,5,'#e8ece0');
    block(-22,-9,59,22,4,'#cbd8d1');
    const colours=[['#df9264','#7e83b8'],['#56a99d','#e3bd62'],['#739cc0','#b67a9d']][variant];
    drawBag(-39,-7,colours[0],.86);drawBag(-17,-8,colours[1],.93);drawBag(0,-7,'#d4b287',.59);
    line(-51,-15,-51,8,'#718f95',3);line(8,-15,8,8,'#718f95',3);
    line(10,10,19,10,'#314b55',3);
    block(33,4,34,24,17,'#e7eadb');block(33,1,34,23,16,paint);
    block(31,-11,23,20,22,shade(paint,.2));
    // Glass cab, inset driver and a cream roof give the tug its toy silhouette.
    polygon([[22,-27],[40,-27],[43,-17],[25,-17]],'#bddde4');
    roundRect(28,-26,7,7,2,'#c79f7a');roundRect(27,-28,9,3,1,'#4f4c46');
    line(23,-17,42,-17,'#4a839a',2);block(31,-31,26,23,4,'#f0eee1');
    roundRect(25,-19,17,9,1,'#83bfce');roundRect(29,-18,6,6,1,'#c79f7a');roundRect(28,-19,8,2,1,'#40525b');
    roundRect(29,-40,8,5,2,'#f1b74f');
    block(48,2,7,20,9,shade(paint,-.1));
    roundRect(48,-5,5,5,1,'#fff2aa');roundRect(48,4,5,3,1,'#e9b661');
    line(43,11,53,11,'#294657',3);
    text(String(mod(id,80)+10),32,7,6,'#eff9f6');
    ctx.restore();
  }
  function drawPerson(x,y,row,id=0) {
    const seed=mod(row*3+id,6);
    const skin=['#ecc49c','#c8916e','#9e7056','#f1d0b1','#b78363','#d6a27b'][seed];
    const shirt=['#a68bc3','#e1935c','#64a48d','#729fc2','#bda564','#d07e87'][seed];
    const hair=['#4a3c36','#554036','#2f343b','#b08753','#433834','#79513b'][seed];
    const walk=reducedMotion?0:Math.sin(run.time*9+id*2)*2.5;
    ellipse(x+4,y+18,18,7,'#193a4b36');
    block(x-6,y+15+walk,7,9,14,'#374c62');block(x+6,y+15-walk,7,9,14,'#374c62');
    block(x-6,y+18+walk,9,11,5,'#e9e6d8');block(x+6,y+18-walk,9,11,5,'#e9e6d8');
    block(x,y+3,24,16,22,shirt);
    block(x-13,y+4+walk*.5,5,7,17,skin);block(x+13,y+4-walk*.5,5,7,17,skin);
    block(x,y-18,21,15,20,skin);block(x-1,y-35,23,17,7,hair);
    block(x-10,y-25,4,12,12,hair);
    roundRect(x-5,y-26,3,4,1,'#2a3f4a');roundRect(x+5,y-26,3,4,1,'#2a3f4a');
    if(seed===0){line(x-7,y-25,x+9,y-25,'#314451',2);line(x-1,y-25,x+3,y-25,'#314451',1);}
    line(x-1,y-19,x+4,y-19,shade(skin,-.25),1);
    if(seed===1){block(x,y-39,27,20,4,'#d9c49a');block(x-1,y-43,19,15,8,'#e7d6b2');}
    if(seed===2){
      polygon([[x-10,y-13],[x-4,y-13],[x+1,y+8],[x-7,y+8]],'#e9d96a');
      polygon([[x+5,y-13],[x+10,y-13],[x+12,y+8],[x+5,y+8]],'#e9d96a');
      line(x-7,y-2,x+10,y-2,'#f4f0db',2);
    }else if(seed%2===0){line(x-3,y-13,x+3,y-2,'#f0ead6');line(x+7,y-13,x+3,y-2,'#f0ead6');block(x+2,y+4,6,3,8,'#eee8d3');}
    else{line(x-6,y-14,x+7,y+6,shade(shirt,-.35),3);block(x+7,y+7,9,6,9,shade(shirt,-.2));}
    line(x+15,y+3,x+20,y+9,'#566267',1);drawBag(x+20,y+17,['#d5b45e','#729ab3','#af86a8'][seed%3],.55);
  }
  function laneY(row){return H-120-(row-run.camera)*ROW;}
  function drawLaneFloor(lane,y) {
    const theme=destinationFor(lane.row),tile=60;
    if(lane.type==='safe'){
      ctx.fillStyle=lane.gate||lane.row===0?theme.gate:theme.floor;ctx.fillRect(0,y-32,W,ROW);
      if(!lane.gate&&lane.row!==0){
        for(let col=0;col<13;col++){
          const x=col*tile;
          ctx.fillStyle=shade(theme.floor,mod(col+lane.row,3)===0?-.035:.025);ctx.fillRect(x+1,y-31,58,56);
          line(x,y-31,x,y+25,shade(theme.floor,-.12));
          if(theme.motif==='sun'){
            polygon([[x+30,y-15],[x+40,y-5],[x+30,y+5],[x+20,y-5]],shade(theme.accent,.65));
            ellipse(x+9,y+12,2,2,shade(theme.accent,.45));ellipse(x+50,y-22,2,2,shade(theme.accent,.45));
          }else if(theme.motif==='blossom'){
            line(x+4,y-24,x+55,y-24,shade(theme.accent,.7),2);
            if(col%3===0){ellipse(x+12,y+9,3,1.5,shade(theme.accent,.48));ellipse(x+17,y+6,2,3,shade(theme.accent,.48));}
          }else if(theme.motif==='skyline'){
            for(let j=0;j<3;j++){const xx=x+mod(col*13+j*19,53)+4,yy=y+mod(col*7+j*11,42)-22;roundRect(xx,yy,3,2,0,shade(theme.ink,.76));}
          }else if(theme.motif==='garden'){
            if(col%2===0){ellipse(x+30,y-6,10,4,shade(theme.accent,.77));line(x+21,y-6,x+39,y-6,shade(theme.accent,.6));}
          }else if(theme.motif==='mountain'){
            polygon([[x+10,y+12],[x+30,y-15],[x+50,y+12]],shade(theme.accent,.83));
          }else{line(x+3,y-3,x+56,y-3,shade(theme.floor,-.07));}
        }
      }
      // A shallow slab edge adds depth while keeping all walking space clear.
      ctx.fillStyle=shade(theme.floor,-.18);ctx.fillRect(0,y+26,W,6);
      line(0,y+25,W,y+25,'#fff7de',2);
      if(lane.gate||lane.row===0){
        line(0,y-27,W,y-27,shade(theme.ink,.25),2);line(0,y+23,W,y+23,shade(theme.ink,.25),2);
        for(let x=22;x<W;x+=30)roundRect(x,y-31,15,3,0,'#f8f1d7');
      }
    }else if(lane.type==='belt'){
      ctx.fillStyle=shade(theme.belt,-.25);ctx.fillRect(0,y-32,W,ROW);
      ctx.fillStyle=theme.belt;ctx.fillRect(0,y-24,W,49);
      const shift=mod(run.time*lane.speed,26);
      for(let x=-26+shift;x<W+26;x+=26){
        polygon([[x,y-22],[x+16,y-22],[x+24,y+20],[x+8,y+20]],shade(theme.belt,.12));
        line(x+17,y-22,x+25,y+20,shade(theme.belt,-.18),2);
      }
      for(let x=105;x<W;x+=185)text(lane.speed>0?'››':'‹‹',x,y+7,25,'#b2c9c69e');
      for(const edge of [-31,25]){
        roundRect(0,y+edge,W,6,0,'#f0cc65');
        for(let x=0;x<W;x+=22)polygon([[x,y+edge],[x+8,y+edge],[x+14,y+edge+6],[x+6,y+edge+6]],'#3c4b55');
      }
      block(7,y,12,54,5,'#c4d2c9');block(W-10,y,12,54,5,'#c4d2c9');
      roundRect(22,y-10,64,20,2,'#203c4d');text('BELT 0'+(mod(lane.row,12)-4),54,y+3,8,'#e0e8dc');
    }else{
      ctx.fillStyle=lane.type==='cart'?theme.road:theme.walk;ctx.fillRect(0,y-32,W,ROW);
      line(0,y-31,W,y-31,shade(theme.ink,-.15),2);line(0,y+31,W,y+31,shade(theme.ink,-.15));
      if(lane.type==='cart'){
        for(let x=12;x<W;x+=72)roundRect(x,y+27,32,3,0,'#f8deb5');
        for(let x=92;x<W;x+=230){
          const dir=Math.sign(lane.speed);ctx.save();ctx.translate(x,y+1);ctx.scale(dir,1);
          polygon([[-14,-3],[3,-3],[3,-9],[17,0],[3,9],[3,3],[-14,3]],'#b3c1bf62');ctx.restore();
        }
        line(0,y-14,W,y-14,'#132f4012',3);line(0,y+12,W,y+12,'#132f4012',3);
      }else{
        for(let x=0;x<W;x+=60){line(x,y-30,x,y+29,shade(theme.walk,-.1));roundRect(x+8,y-25,42,3,0,'#f7eedaa1');}
        for(let x=100;x<W;x+=220)text(lane.speed>0?'→':'←',x,y+5,17,shade(theme.walk,-.16));
      }
    }
  }
  function drawDestinationStamp(x, y, theme) {
    // Low-contrast floor motifs are decoration, not collision objects.
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = .5;
    ellipse(0, 0, 24, 24, theme.gate);
    const ink = theme.accent;
    if (theme.motif === 'castle') {
      roundRect(-15, -1, 30, 13, 1, ink);
      for (const dx of [-13, -3, 9]) { roundRect(dx, -12, 7, 15, 0, ink); line(dx + 3, -18, dx + 3, -12, ink, 2); }
      roundRect(-3, 4, 6, 8, 3, theme.floor);
    } else if (theme.motif === 'sun') {
      ellipse(0, -6, 7, 7, ink);
      for (const dx of [-15, -5, 5, 15]) { line(dx - 4, 8, dx, 11, ink, 2); line(dx, 11, dx + 4, 8, ink, 2); }
      for (const dx of [-14, 0, 14]) line(dx, -20, dx, -16, ink, 2);
    } else if (theme.motif === 'blossom') {
      line(-12, 15, 0, -8, ink, 3); line(-5, 2, 12, -3, ink, 2);
      for (const [dx, dy] of [[0,-9],[12,-3],[-10,0]]) {
        for (let i=0;i<5;i++) ellipse(dx + Math.cos(i*1.256)*4, dy + Math.sin(i*1.256)*4, 3, 3, ink);
        ellipse(dx,dy,2,2,theme.floor);
      }
    } else if (theme.motif === 'skyline') {
      for (const [dx,h] of [[-16,15],[-8,26],[1,20],[10,13]]) roundRect(dx, 12-h, 7, h, 0, ink);
      line(-5,-22,-5,-14,ink,2); line(-20,13,20,13,ink,2);
    } else if (theme.motif === 'garden') {
      line(0, 15, 0, -7, ink, 4); line(-14, 14, 14, 14, ink, 2);
      for (const [dx,dy,r] of [[-9,-4,8],[8,-7,10],[0,-14,9]]) ellipse(dx,dy,r,r*.7,ink);
    } else {
      ctx.fillStyle=ink;ctx.beginPath();ctx.moveTo(-20,13);ctx.lineTo(-3,-17);ctx.lineTo(7,1);ctx.lineTo(14,-8);ctx.lineTo(23,13);ctx.closePath();ctx.fill();
      ctx.fillStyle=theme.floor;ctx.beginPath();ctx.moveTo(-9,-6);ctx.lineTo(-3,-17);ctx.lineTo(3,-6);ctx.lineTo(-1,-9);ctx.lineTo(-5,-6);ctx.fill();
    }
    ctx.restore();
  }
  function drawLaneDetail(lane,y) {
    if(lane.type!=='safe')return;
    const theme=destinationFor(lane.row);
    if(lane.gate||lane.row===0){
      const level=difficultyFor(lane.row).level;
      // All destination graphics in the playfield are printed on the floor.
      roundRect(37,y-18,232,34,3,theme.ink);
      text(theme.name,53,y-2,15,'#fff7de','left');
      text('GATE A'+String(level).padStart(2,'0')+'  /  LEVEL '+String(level).padStart(2,'0'),54,y+9,7,'#e4dfc8','left');
      for(const x of [342,420,498]){
        polygon([[x-8,y+10],[x-8,y-2],[x-14,y-2],[x,y-16],[x+14,y-2],[x+8,y-2],[x+8,y+10]],shade(theme.ink,.22));
      }
      drawDestinationStamp(694,y-1,theme);
    }else if(mod(lane.row,12)===4){
      roundRect(258,y-12,264,23,3,shade(theme.floor,-.035));
      text('↑  '+theme.name+'  /  NEXT GATE',390,y+3,9,theme.ink);
      drawDestinationStamp(100,y-3,theme);drawDestinationStamp(680,y-3,theme);
    }else if(mod(lane.row,12)===7){
      for(const x of [100,390,680]){line(x-15,y+3,x+15,y+3,shade(theme.accent,.45),2);text('↑',x,y+2,13,theme.accent);}
    }
  }
  function drawScenery(row,y){
    const theme=destinationFor(Math.max(0,row)),part=mod(row,12);
    // Clearly separated scenic strips are outside the playable world.
    ctx.fillStyle=shade(theme.floor,-.09);ctx.fillRect(0,y-32,WORLD_X,ROW);ctx.fillRect(WORLD_X+W,y-32,WORLD_X,ROW);
    line(0,y+31,VIEW_W,y+31,shade(theme.floor,-.18));
    roundRect(4,y-29,46,55,1,shade(theme.ink,-.15));
    roundRect(8,y-26,38,47,0,theme.sky);
    // Window panes frame tiny destination silhouettes beyond the terminal.
    ctx.save();ctx.beginPath();ctx.rect(8,y-26,38,47);ctx.clip();
    for(let i=0;i<4;i++){
      const h=7+mod(row*7+i*11,17);roundRect(8+i*11,y+13-h,10,h,0,shade(theme.sky,-.12));
      if(theme.motif==='castle')roundRect(9+i*11,y+9-h,8,5,0,shade(theme.sky,-.2));
      if(theme.motif==='mountain')polygon([[5+i*13,y+20],[17+i*13,y-6],[31+i*13,y+20]],shade(theme.sky,-.17));
    }
    if(part===2||part===9){line(8,y-16,27,y-16,'#fff7e0',3);line(20,y-20,24,y-11,'#fff7e0',2);}
    ctx.restore();
    line(27,y-27,27,y+22,shade(theme.ink,.2),2);block(27,y+27,49,8,5,'#b6c8c8');
    const right=WORLD_X+W+29;
    if(part===0){
      block(right,y+15,32,15,47,theme.ink);roundRect(right-10,y-22,24,17,1,'#172e3f');
      text('GATE',right+2,y-14,6,'#e6d59a');text(String(difficultyFor(Math.max(0,row)).level).padStart(2,'0'),right+2,y-4,8,'#f6cb68');
      line(right-8,y+4,right+10,y+4,shade(theme.accent,.3),2);
    }else if(part===4){
      block(right,y+19,32,23,47,'#dc9a68');block(right,y-25,34,24,5,'#f4d3a0');
      roundRect(right-10,y-18,21,22,2,'#254859');text('☕',right,y-2,16,'#f6dec1');
      roundRect(right+8,y+5,4,4,1,'#e5c36a');
    }else if(part===7||part===11){
      plant(right-1,y+9,theme);
    }else if(part===1||part===8){
      block(right,y+13,32,21,10,'#d0b28a');block(right,y-1,32,7,20,'#b79063');
      for(let i=-10;i<13;i+=7)line(right+i,y-14,right+i,y-2,'#eed7b4');
      block(right-12,y+17,4,16,6,'#4f6670');block(right+11,y+17,4,16,6,'#4f6670');
    }else{roundRect(right-11,y-19,25,33,1,shade(theme.floor,.07));text('✈',right+1,y-1,17,theme.accent);}
    // Narrow brass curbs make the playable boundaries unambiguous.
    ctx.fillStyle='#d4c89c';ctx.fillRect(WORLD_X-5,y-32,5,ROW);ctx.fillRect(WORLD_X+W,y-32,5,ROW);
    line(WORLD_X-6,y-32,WORLD_X-6,y+32,'#fff1ce');line(WORLD_X+W+5,y-32,WORLD_X+W+5,y+32,'#fff1ce');
  }
  function draw(){
    ctx.clearRect(0,0,VIEW_W,H);
    const min=Math.max(-3,Math.floor(run.camera)-4),max=Math.ceil(run.camera)+Math.ceil(H/ROW)+2;
    ctx.fillStyle='#c3d4ce';ctx.fillRect(0,0,VIEW_W,H);
    // Background/scenery and actors use independent passes for proper depth.
    for(let row=max;row>=min;row--)drawScenery(row,laneY(row));
    ctx.save();ctx.translate(WORLD_X,0);ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
    for(let row=max;row>=min;row--){
      if(row<0){ctx.fillStyle='#c4d3c8';ctx.fillRect(0,laneY(row)-32,W,ROW);for(let x=0;x<W;x+=60)line(x,laneY(row)-32,x,laneY(row)+32,'#b1c3b5');}
      else drawLaneFloor(laneAt(row),laneY(row));
    }
    for(let row=max;row>=min;row--){
      if(row>=0){
        const lane=laneAt(row),y=laneY(row);drawLaneDetail(lane,y);
        if(lane.type==='cart')obstacles(lane).forEach(item=>drawCart(item.x,y,Math.sign(lane.speed),item.id+row));
        if(lane.type==='people')obstacles(lane).forEach(item=>drawPerson(item.x,y,row,item.id));
      }
      if(row===traveller.row)drawSuitcase(traveller.x,laneY(row));
    }
    ctx.restore();
    const light=ctx.createLinearGradient(0,0,VIEW_W,H);light.addColorStop(0,'#fff4cf0d');light.addColorStop(.55,'#fff4cf00');light.addColorStop(1,'#142a3810');
    ctx.fillStyle=light;ctx.fillRect(0,0,VIEW_W,H);
  }
  function frame(now) {
    const dt = Math.min((now - previousTime) / 1000 || 0, .04); previousTime = now;
    refreshDay();
    if (run.state === 'playing') {
      run.time += dt;
      syncTraveller();
      const beforeBeltX = traveller.x;
      rideConveyor(dt);
      if (traveller.onConveyor && traveller.x !== beforeBeltX) runEvidence.conveyorRow = traveller.row;
      checkCollision();
      // Keep the traveller low enough to see approaching lanes on short screens.
      const lookAhead = Math.max(0, (H * .34 - 120) / ROW);
      const target = Math.max(0, traveller.row - lookAhead);
      run.camera = reducedMotion ? target : run.camera + (target - run.camera) * Math.min(1, dt * 12);
      if (pendingScore && now > highlightUntil) { pendingScore = false; signal('awardDistance'); }
    }
    if (highlightUntil && now > highlightUntil && !pendingScore) {
      document.querySelectorAll('.code-line.lit').forEach(line => line.classList.remove('lit')); highlightUntil = 0;
    }
    draw(); requestAnimationFrame(frame);
  }
  $('sound-toggle').addEventListener('click', toggleSound);
  $('start').addEventListener('click', startRun); $('retry').addEventListener('click', startRun);
  $('resume').addEventListener('click', resumeRun);
  $('pause').addEventListener('click', () => run.state === 'paused' ? resumeRun() : pauseRun());
  document.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('pointerdown', e => { e.preventDefault(); tryHop(button.dataset.direction); }));
  document.querySelectorAll('[data-code]').forEach(button => button.addEventListener('click', () => { pendingScore = false; if (run.state === 'finished') showRunRecap(button.dataset.code); else { showCode(button.dataset.code); $('event-caption').textContent = notes[button.dataset.code]; } }));
  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target.isContentEditable) return;
    const key = e.key.toLowerCase();
    const direction = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' }[key];
    if (direction) { e.preventDefault(); tryHop(direction); }
    if (key === 'm' && !e.repeat) { e.preventDefault(); toggleSound(); }
    if (key === 'escape' && !e.repeat) run.state === 'paused' ? resumeRun() : pauseRun();
    if (key === ' ' && !e.repeat && e.target.tagName !== 'BUTTON') {
      e.preventDefault(); if (run.state === 'ready') startRun(); else if (run.state === 'paused') resumeRun();
    }
  });
  window.addEventListener('blur', pauseRun);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRun(); });
  $('score-form').addEventListener('submit', e => {
    e.preventDefault();
    if (run.state !== 'finished' || run.saved || run.score < 1) return;
    refreshDay();
    const tag = $('nickname').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'YOU';
    leaderboard.push({ tag, score: run.score }); leaderboard.sort((a, b) => b.score - a.score); leaderboard = leaderboard.slice(0, 5);
    try { localStorage.setItem('gate-dash-board-v3', JSON.stringify({ day: boardDay, entries: leaderboard })); } catch { storageAvailable = false; }
    run.saved = true; renderBoard(); $('score-form').classList.add('hidden');
    $('save-status').textContent = leaderboard.some(e => e.tag === tag && e.score === run.score) ? `${tag}, you’re on the board!` : `Thanks, ${tag}! You need ${leaderboard[4].score + 1} rows for the top five.`;
  });
  window.addEventListener('storage', e => { if (e.key === 'gate-dash-board-v3') loadBoard(); });
  loadBoard(); updateScore(); syncTraveller(); showCode('hop'); requestAnimationFrame(frame);
})();
