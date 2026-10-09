import { createGame, reveal, toggleMark, undo, scan, getCandidates, getProbabilities, getClue, getProgress, getHint, serializeGame } from './engine.js';
import { chapters, levels } from './levels.js?v=20261010-web2';
import { createWebBoard } from './web-board.js?v=20261010-web2';

const $ = id => document.getElementById(id);
const STORAGE = 'huanmian-progress-v1';
const chapterNames = ['数字', '负形', '图形', '概率', '综合', '方向', '空间', '网页'];
const chapterQuestions = ['如果数字统计的，是安全格呢？', '如果你看到的轮廓，也是证据呢？', '如果数字描述的，是你目前知道多少呢？', '你会为低风险，还是新证据做出选择？', '如果箭头指向的，是一个整体呢？', '如果邻居不再由方格决定呢？', '如果棋盘就是你正在看的网页呢？', '你开始重新理解的，是整个页面。'];
const ruleTitles = ['数字是可靠的关系', '安全，也能被计数', '轮廓提供新的证据', '概率是当前的知识', '选择合适的视角', '箭头指向一个整体', '重新定义你的邻居', '网页元素，也可以是格子'];
const ruleIcons = { normal: '邻雷数', negative: '安全数', shape: '图形约束 · 邻雷数', probability: '未知邻域平均雷密度', mixed: '两种计数 · 同一事实', vector: '最近雷簇的方向', spatial: '半径邻接 · 邻雷数', web: '整页探索 · 固定元素关系' };
const arrowNames = { N:'↑', NE:'↗', E:'→', SE:'↘', S:'↓', SW:'↙', W:'←', NW:'↖' };
const isRiskLevel = () => currentLevel.mode === 'probability' || (currentLevel.mode === 'mixed' && !!currentLevel.publicCandidates);
const isWebLevel = () => currentLevel.mode === 'web';
let storageAvailable = true;
let saved = { version: 1, current: levels[0].id, completed: [], sessions: {}, sound: false };
try {
  const raw = JSON.parse(localStorage.getItem(STORAGE) || 'null');
  if (raw?.version === 1 && Array.isArray(raw.completed) && raw.sessions && typeof raw.sessions === 'object') {
    saved = { ...saved, ...raw, completed: raw.completed.filter(id => levels.some(l => l.id === id)) };
  }
} catch { storageAvailable = false; }
const requestedLevel = new URLSearchParams(location.search).get('level');
let currentLevel = levels.find(l => l.id === requestedLevel) || levels.find(l => l.id === saved.current) || levels[0];
let lastNonWebLevel = currentLevel.mode === 'web' ? 'S03' : currentLevel.id;
let game;
let tool = 'open';
let view = currentLevel.mode === 'negative' ? 'negative' : 'normal';
let selected = null;
let showCandidates = false;
let rotation = -.28;
let showLayers = false;
let lastHintCells = [];
let audioContext;
const pageBoard = createWebBoard({ onAct: act, onInspect: observe, onKey: keyOnCell });

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function chapterIndex(level = currentLevel) {
  if (typeof level.chapter === 'number') return level.chapter;
  const found = chapters.findIndex(c => c.id === level.chapter);
  return found < 0 ? 0 : found;
}
function loadGame() {
  pageBoard.hide();
  try { game = createGame(currentLevel, saved.sessions[currentLevel.id]); }
  catch { game = createGame(currentLevel); }
  tool = 'open';
  view = currentLevel.id === '04' ? 'normal' : currentLevel.mode === 'negative' ? 'negative' : 'normal';
  selected = null;
  lastHintCells = [];
  rotation = -.28;
  showLayers = false;
  $('spatial-layers').checked = false;
  $('neighbor-caption').textContent = '选中一格，看看它真正的邻居。';
}
function persist() {
  saved.current = currentLevel.id;
  saved.sessions[currentLevel.id] = serializeGame(game);
  try { localStorage.setItem(STORAGE, JSON.stringify(saved)); }
  catch { storageAvailable = false; }
  $('saved-indicator').textContent = storageAvailable ? '进度保存在此浏览器' : '本次可游玩；浏览器未允许保存进度';
}
function say(text, type = '') {
  $('message').textContent = text;
  $('message').className = `message ${type}`;
  pageBoard.status(text);
}
function playTone(type = 'open') {
  if (!saved.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(type === 'win' ? 660 : type === 'mistake' ? 160 : 430, now);
    if (type === 'win') oscillator.frequency.exponentialRampToValueAtTime(990, now + .18);
    gain.gain.setValueAtTime(.035, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .23);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(now); oscillator.stop(now + .25);
  } catch { saved.sound = false; updateSound(); }
}
function updateSound() {
  $('sound-toggle').setAttribute('aria-pressed', String(saved.sound));
  $('sound-toggle').setAttribute('aria-label', saved.sound ? '关闭音效' : '开启音效');
}
function percent(value) {
  if (value === 0) return '0%';
  if (value === 1) return '100%';
  if (!Number.isFinite(value)) return '—';
  if (value < .01) return '<1%';
  if (value > .99) return '>99%';
  return `${Math.round(value * 100)}%`;
}
function positions3D() {
  const nodes = currentLevel.nodes;
  if (showLayers) {
    const layers = [...new Set(nodes.map(n => n.z || 0))].sort((a,b) => a-b);
    const maxX = Math.max(...nodes.map(n => n.x));
    const maxY = Math.max(...nodes.map(n => n.y));
    return new Map(nodes.map(n => {
      const layer = layers.indexOf(n.z || 0);
      const yStart = 8 + layer / layers.length * 88;
      return [n.id, { id:n.id, x:12 + n.x / Math.max(maxX,1) * 76, y:yStart + (1 - n.y / Math.max(maxY,1)) * (42 / layers.length), depth:layer, layer:n.z || 0 }];
    }));
  }
  const rotated = nodes.map(n => {
    const x = n.x * Math.cos(rotation) + (n.z || 0) * Math.sin(rotation);
    const z = (n.z || 0) * Math.cos(rotation) - n.x * Math.sin(rotation);
    return { id: n.id, x, y: -n.y + z * .32, depth: z, layer: n.z || 0 };
  });
  const xs = rotated.map(n => n.x), ys = rotated.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return new Map(rotated.map(n => [n.id, { ...n, x: 12 + (n.x - minX) / Math.max(maxX - minX, .1) * 76, y: 12 + (n.y - minY) / Math.max(maxY - minY, .1) * 76 }]));
}
function renderSpatialEdges(positions) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('spatial-svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  const neighborIds = new Set(currentLevel.neighbors[selected] || []);
  for (const n of currentLevel.nodes) for (const other of currentLevel.neighbors[n.id] || []) {
    if (String(n.id) >= String(other)) continue;
    const a = positions.get(n.id), b = positions.get(other);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    if ((n.id === selected && neighborIds.has(other)) || (other === selected && neighborIds.has(n.id))) line.classList.add('highlight');
    svg.append(line);
  }
  $('board').append(svg);
}
function renderBoard() {
  const board = $('board');
  board.hidden = isWebLevel();
  $('web-guide').hidden = !isWebLevel();
  if (isWebLevel()) {
    board.replaceChildren();
    $('spatial-controls').hidden = true;
    return;
  }
  const spatial = currentLevel.mode === 'spatial';
  board.replaceChildren();
  board.className = `board${spatial ? ' spatial' : ''}`;
  const cols = typeof currentLevel.size === 'number' ? currentLevel.size : Math.max(...currentLevel.nodes.map(n => n.x)) + 1;
  board.style.setProperty('--cols', cols);
  const neighbors = new Set(currentLevel.neighbors[selected] || []);
  const probabilities = isRiskLevel() ? getProbabilities(game) : null;
  const positions = spatial ? positions3D() : null;
  if (spatial) renderSpatialEdges(positions);
  for (const n of currentLevel.nodes) {
    const opened = game.revealed.has(n.id);
    const mine = game.confirmedMines.has(n.id);
    const mark = game.marks.get(n.id);
    const el = node('button', '', 'cell');
    el.type = 'button';
    el.dataset.node = n.id;
    el.setAttribute('aria-label', `${n.id}，${mine ? '已确认有雷' : opened ? '已打开安全格' : mark === 'safe' ? '笔记：待验证安全' : mark === 'mine' ? '笔记：可能有雷' : '未知格'}`);
    if (spatial) {
      const p = positions.get(n.id);
      el.style.left = `${p.x}%`; el.style.top = `${p.y}%`;
      el.style.zIndex = Math.round(p.depth * 10 + 50);
      if (showLayers) el.title = `${n.id} · 层 ${n.z || 0}`;
    } else {
      el.style.gridColumn = n.x + 1; el.style.gridRow = n.y + 1;
    }
    if (mine) { el.textContent = '✳'; el.classList.add('mine-confirmed'); }
    else if (opened) {
      const clue = getClue(game, n.id, view);
      el.classList.add('opened');
      if (clue.kind === 'probability') {
        el.classList.add('probability');
        el.textContent = clue.unknownCount === 0 ? '—' : percent(clue.density ?? clue.value);
        el.setAttribute('aria-label', `${n.id}，安全格，未知邻域平均雷密度${el.textContent}，未知邻格${clue.unknownCount}个`);
      } else if (clue.kind === 'vector') {
        el.classList.add('vector');
        el.textContent = (clue.directions || []).map(a => arrowNames[a] || a).join('');
        if (el.textContent.length > 2) el.style.fontSize = '14px';
        if (Number.isInteger(clue.value)) el.append(node('span', clue.value, 'number-anchor'));
        el.setAttribute('aria-label', `${n.id}，安全格，方向${el.textContent}；${clue.label || ''}`);
      } else {
        el.textContent = clue.value === 0 ? '·' : String(clue.value);
        if (clue.value === 0) el.classList.add('zero');
        if (view === 'negative') el.classList.add('negative');
        el.setAttribute('aria-label', `${n.id}，安全格，${view === 'negative' ? '安全邻数' : '邻雷数'}${clue.value}，有效邻格${clue.degree}`);
      }
    } else if (mark) { el.textContent = mark === 'safe' ? '✓' : '⚑'; el.classList.add(mark === 'safe' ? 'marked-safe' : 'marked-mine'); }
    if (spatial) {
      el.title = `${n.id} · 世界坐标 (${n.x}, ${n.y}, ${n.z || 0})`;
      if (!opened && !mine && !mark) { el.textContent = n.id; el.classList.add('spatial-unknown'); }
      else { const label=node('span',n.id,'spatial-id'); label.setAttribute('aria-hidden','true'); el.append(label); }
    }
    if (neighbors.has(n.id)) el.classList.add('neighbor');
    if (selected === n.id) el.classList.add('selected');
    if (lastHintCells.includes(n.id)) el.classList.add('hint-cell');
    if (probabilities && !opened && !mine) {
      const probability = probabilities.get(n.id);
      if (probability === 0) el.classList.add('known-safe');
      el.title = `${n.id} · 本格有雷概率 ${percent(probability)}`;
    }
    el.addEventListener('mouseenter', () => observe(n.id));
    el.addEventListener('focus', () => observe(n.id));
    el.addEventListener('click', () => act(n.id, tool === 'mark' ? 'mark' : 'reveal'));
    el.addEventListener('contextmenu', e => { e.preventDefault(); act(n.id, 'mark'); });
    el.addEventListener('keydown', e => keyOnCell(e, n.id));
    board.append(el);
  }
  $('spatial-controls').hidden = !spatial;
  if (showLayers && spatial) {
    const zs = [...new Set(currentLevel.nodes.map(n => n.z || 0))].sort((a,b) => a-b);
    zs.forEach((z,i) => {
      const line = node('span', `深度层 ${z}`, 'spatial-layer');
      line.style.top = `${3 + i / zs.length * 88}%`;
      board.append(line);
    });
  }
}
function observe(id) {
  if (isWebLevel()) {
    selected = id;
    const item = currentLevel.nodes.find(n => n.id === id);
    $('neighbor-caption').textContent = `${item?.label || id} · 公开邻居 ${(currentLevel.neighbors[id] || []).length} 个 · 在网页上高亮或定位`;
    return;
  }
  const neighbors = currentLevel.neighbors[id] || [];
  $('board').querySelectorAll('.cell').forEach(el => {
    el.classList.toggle('neighbor', neighbors.includes(el.dataset.node));
    el.classList.toggle('selected', el.dataset.node === id);
  });
  const knownSafe = neighbors.filter(n => game.revealed.has(n)).length;
  const knownMine = neighbors.filter(n => game.confirmedMines.has(n)).length;
  const unknown = neighbors.length - knownSafe - knownMine;
  $('neighbor-caption').textContent = `${id} · 有效邻格 ${neighbors.length} · 已知安全 ${knownSafe} · 未知 ${unknown}`;
  if (isRiskLevel() && !game.revealed.has(id) && !game.confirmedMines.has(id)) {
    const p = getProbabilities(game).get(id);
    $('context-text').textContent = `${id} 的本格有雷概率是 ${percent(p)}。这是合法候选中的比例；笔记不会改变它。${p === 0 ? '所有候选都认为它安全，可以打开。' : p === 1 ? '所有候选都认为这里有雷。' : '获取新证据，可能让它变得确定。'}`;
  } else if (isRiskLevel() && game.revealed.has(id)) {
    const clue = getClue(game, id);
    $('context-text').textContent = clue.unknownCount === 0 ? `${id} 的邻域已经全部确认，没有未知邻格。` : `${id} 已经安全。这里的 ${percent(clue.density)} 是未知邻域平均雷密度：期望雷数 ${Number(clue.expectation.toFixed(2))} ÷ 未知邻格 ${clue.unknownCount}，不是这格的有雷概率。`;
  } else if (currentLevel.mode === 'negative' || view === 'negative') {
    $('context-text').textContent = `这格有 ${neighbors.length} 个有效邻格。安全数统计其中所有安全格，包括已经打开的格子。安全数等于 ${neighbors.length} 时，邻域全部安全。`;
  } else if (currentLevel.mode === 'spatial') {
    $('context-text').textContent = `${id} 的 ${neighbors.length} 个邻居由三维距离定义；半径 R = ${currentLevel.meta?.radius ?? '规则卡所示'}。镜头旋转不改变连线。`;
    if (selected !== id) { selected = id; updateSpatialLines(); }
  } else if (currentLevel.mode === 'vector') {
    $('context-text').textContent = '箭头指向最近 2×2 雷簇的中心。八方向区间各 45°；等距显示所有方向，穿过的格子未必有雷。小数字是额外邻雷锚点。';
  } else {
    $('context-text').textContent = `${id} 的邻域共有 ${neighbors.length} 格，已确认 ${knownSafe} 格安全。${currentLevel.mode === 'shape' ? '把局部数字与合法雷形一起考虑。' : '已满足雷数时，其余未知邻格可确定安全。'}`;
  }
}
function updateSpatialLines() {
  const old = $('board').querySelector('.spatial-svg');
  if (old) old.remove();
  renderSpatialEdges(positions3D());
}
function keyOnCell(e, id) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(id, 'reveal'); return; }
  if (e.key.toLowerCase() === 'f') { e.preventDefault(); act(id, 'mark'); return; }
  const delta = { ArrowLeft: [-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] }[e.key];
  if (!delta) return;
  e.preventDefault();
  const list = currentLevel.nodes;
  if (isWebLevel()) {
    const index = list.findIndex(n => n.id === id);
    pageBoard.locate(list[(index + (delta[0] || delta[1]) + list.length) % list.length].id);
    return;
  }
  const from = list.find(n => n.id === id);
  let to = list.find(n => n.x === from.x + delta[0] && n.y === from.y + delta[1] && (n.z || 0) === (from.z || 0));
  if (!to) {
    const index = list.indexOf(from);
    to = list[(index + (delta[0] || delta[1]) + list.length) % list.length];
  }
  $('board').querySelector(`[data-node="${CSS.escape(to.id)}"]`)?.focus();
}
function act(id, action) {
  if (game.won) { say('本关已经完成。可以继续下一个实验，或重新开始。', 'success'); return; }
  if (currentLevel.id === '04' && view === 'normal' && action === 'reveal') { say('先点击下方“安全数”，观察同一张盘怎样翻面，再完成最后一步。雷位与已确认事实都不变。'); return; }
  selected = id;
  const beforeWon = game.won;
  const result = action === 'mark' ? toggleMark(game, id, currentLevel.mode === 'negative' || view === 'negative' ? 'safe' : 'mine') : reveal(game, id);
  if (!result?.ok && !result?.mistake) say(result?.reason || '这格的状态已经确认，无需重复操作。');
  else if (result.mistake) { say('这格确实有雷。已确认并记录一次误判，其余进度保留；继续观察公开线索。', 'error'); playTone('mistake'); }
  else if (action === 'mark') say('笔记只是一个假设。打开与采样确认的结果，才会成为证据。');
  else { say(isRiskLevel() ? '安全事实已确认。候选已经按公开证据更新；没有新信息时，数值也可能保持不变。' : '安全格已打开。试着把这条新线索与周围的关系连起来。'); playTone(); }
  render(); persist();
  if (!beforeWon && game.won) finish();
  if (isWebLevel()) pageBoard.focus(id);
  else $('board').querySelector(`[data-node="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
}
function renderTemplates() {
  const templates = currentLevel.templates || [];
  $('template-box').hidden = !templates.length;
  $('templates').replaceChildren();
  for (const template of templates) {
    const card = node('div', undefined, 'template-item');
    const grid = node('div', undefined, 'mini-shape');
    for (const [x,y] of template.cells || []) {
      const tile = node('i'); tile.style.gridColumn = x + 1; tile.style.gridRow = y + 1; grid.append(tile);
    }
    card.append(grid, node('span', `${template.label || template.id} ×${template.count || 1}`));
    $('templates').append(card);
  }
}
function renderCandidates() {
  const enabled = ['probability','shape','mixed'].includes(currentLevel.mode);
  $('candidate-box').hidden = !enabled;
  if (!enabled) return;
  const candidates = getCandidates(game);
  $('candidate-count').textContent = `${candidates.length} 种`;
  $('candidate-toggle').setAttribute('aria-expanded', String(showCandidates));
  $('candidate-gallery').hidden = !showCandidates;
  if (!showCandidates) return;
  $('candidate-gallery').replaceChildren();
  for (const [i, candidate] of candidates.slice(0,12).entries()) {
    const mini = node('div', undefined, 'mini-board');
    mini.style.setProperty('--mini-cols', currentLevel.size || 5);
    mini.setAttribute('aria-label', `合法候选 ${i+1}`);
    const mines = new Set(candidate);
    for (const n of currentLevel.nodes) {
      const tile = node('i', undefined, mines.has(n.id) ? 'mine' : '');
      tile.style.gridColumn = n.x + 1; tile.style.gridRow = n.y + 1;
      mini.append(tile);
    }
    $('candidate-gallery').append(mini);
  }
  $('candidate-gallery').append(node('p', candidates.length > 12 ? `展示前 12 种，共 ${candidates.length} 种。橙色为该假设中的雷，全部候选都符合公开证据。` : '橙色为该假设中的雷。这里展示的是所有合法候选，不代表真实答案。', 'gallery-note'));
}
function renderChapters() {
  $('chapter-strip').replaceChildren();
  chapters.forEach((chapter,i) => {
    const button = node('button', undefined, `chapter-pill${i === chapterIndex() ? ' active' : ''}`);
    button.append(node('span', String(i+1).padStart(2,'0'), 'chapter-id'), node('span', chapterNames[i] || chapter.label || chapter.title));
    const chapterLevels = levels.filter(l => chapterIndex(l) === i);
    if (chapterLevels.length && chapterLevels.every(l => saved.completed.includes(l.id))) button.append(node('span','✓','chapter-done'));
    if (i === chapterIndex()) button.setAttribute('aria-current','step');
    button.addEventListener('click', () => { renderMap(); openDialog('map-dialog'); $('level-map').querySelector(`[data-chapter="${i}"]`)?.scrollIntoView({ block: 'nearest' }); });
    $('chapter-strip').append(button);
  });
}
function render() {
  if (!isWebLevel()) pageBoard.hide();
  const index = levels.indexOf(currentLevel);
  const chapter = chapterIndex();
  const progress = getProgress(game);
  $('level-index').textContent = `EXPERIMENT ${String(index+1).padStart(2,'0')} / ${levels.length}${index >= 18 ? ' · 扩展实验' : ''}`;
  $('level-title').textContent = currentLevel.title;
  $('level-description').textContent = currentLevel.description;
  $('board-rule-label').textContent = isRiskLevel() ? ruleIcons.probability : currentLevel.mode === 'mixed' || currentLevel.id === '04' ? (view === 'negative' ? '安全数 · 同一事实' : '邻雷数 · 同一事实') : ruleIcons[currentLevel.mode];
  $('board-total').textContent = `固定雷数 ${currentLevel.totalMines ?? currentLevel.mines.length}`;
  $('chapter-number').textContent = String(chapter+1).padStart(2,'0');
  $('rule-title').textContent = ruleTitles[chapter] || currentLevel.title;
  $('rule-text').textContent = currentLevel.id === '04' && view === 'normal' ? '你认识这张盘：数字统计邻雷数。点击下方“安全数”，同一格会统计安全邻格。中心的 1 将变成 7，雷与已打开格都不变。' : currentLevel.rule;
  $('opened-count').textContent = `${progress.opened} / ${progress.total}`;
  $('progress-fill').style.width = `${progress.total ? progress.opened / progress.total * 100 : 100}%`;
  $('mistake-count').textContent = game.mistakes;
  $('scan-count').textContent = `${game.scans} 次`;
  $('mark-label').textContent = currentLevel.mode === 'negative' || view === 'negative' ? '标安全' : '标雷';
  $('tool-open').classList.toggle('active',tool === 'open');
  $('tool-mark').classList.toggle('active',tool === 'mark');
  $('tool-open').setAttribute('aria-pressed',String(tool === 'open'));
  $('tool-mark').setAttribute('aria-pressed',String(tool === 'mark'));
  const regions = currentLevel.scanRegions || [];
  const selectedScan = $('scan-region').value;
  $('scan-controls').hidden = !regions.length;
  $('scan-stat').hidden = !regions.length;
  $('scan-region').replaceChildren();
  regions.forEach(region => { const option = node('option',region.label || region.id); option.value = region.id; $('scan-region').append(option); });
  if (regions.some(r => r.id === selectedScan)) $('scan-region').value = selectedScan;
  $('scan').disabled = game.won;
  $('batch-safe').disabled = game.won;
  $('view-controls').hidden = !(currentLevel.views?.length) || isRiskLevel();
  $('view-controls').querySelectorAll('button').forEach(button => { button.classList.toggle('active',button.dataset.view === view); button.setAttribute('aria-pressed',String(button.dataset.view === view)); });
  $('next-question').textContent = chapterQuestions[chapter] || chapterQuestions[0];
  renderBoard(); renderTemplates(); renderCandidates(); renderChapters();
  if (isWebLevel()) {
    $('context-text').textContent = '你一直在阅读这些标题、文案和链接。现在它们也是格子：保留内容，调查关系。';
    pageBoard.show({
      cells: currentLevel.nodes.map((n,index) => ({ id:n.id, domId:n.domId, label:n.label, index,
        opened:game.revealed.has(n.id), mine:game.confirmedMines.has(n.id), mark:game.marks.get(n.id),
        clue:game.revealed.has(n.id) ? getClue(game,n.id).value : null })),
      neighbors:currentLevel.neighbors, tool, hintCells:lastHintCells, selected,
      opened:progress.opened, total:progress.total, mistakes:game.mistakes
    });
  }
}
function renderMap() {
  $('level-map').replaceChildren();
  chapters.forEach((chapter,i) => {
    const section = node('section',undefined,'map-chapter'); section.dataset.chapter=i;
    const heading = node('h3');
    heading.append(node('span',String(i+1).padStart(2,'0')),node('span',chapter.title || chapter.label || chapterNames[i]));
    section.append(heading);
    const row = node('div',undefined,'map-levels');
    levels.filter(l => chapterIndex(l) === i).forEach(level => {
      const complete = saved.completed.includes(level.id);
      const button = node('button',undefined,`level-choice${complete ? ' completed' : ''}${level.id === currentLevel.id ? ' current' : ''}`);
      button.dataset.level=level.id;
      button.append(node('span',String(levels.indexOf(level)+1).padStart(2,'0'),'choice-index'),node('span',level.title));
      button.setAttribute('aria-label',`${level.title}${complete ? '，已完成' : ''}`);
      button.addEventListener('click',() => { $('map-dialog').close(); selectLevel(level.id); });
      row.append(button);
    });
    section.append(row); $('level-map').append(section);
  });
}
function selectLevel(id) {
  const level = levels.find(l => l.id === id);
  if (!level) return;
  persist(); currentLevel=level; if (level.mode !== 'web') lastNonWebLevel=level.id; loadGame(); render(); persist();
  say(game.won ? '这枚实验印记已经获得。可以重新开始，也可以在章节地图中选择下一关。' : isRiskLevel() ? '先观察候选，再选择一次能带来新证据的采样。雷位始终固定。' : '开局格已经确认安全。观察线索，从一个确定的判断开始。');
  if (!isWebLevel()) $('context-text').textContent = currentLevel.mode === 'vector' ? '最近雷簇按欧氏距离定义。方向边界归属见本关规则，小数字为额外计数锚点。' : currentLevel.mode === 'spatial' ? '选择一个节点，查看其完整邻接。旋转只改变观看方向。' : '把当前规则与已确认事实联系起来。你不需要靠运气完成本关。';
  if (isWebLevel()) {
    say(game.won ? '已恢复完成的网页探索。可重开，或退出探索恢复页面导航。' : '网页探索已开启。先调查带数字的主标题与引导编号，查看下方列出的真实邻居。');
    $('web-guide').scrollIntoView({ behavior:'auto',block:'center' });
  } else $('level-title').scrollIntoView({ behavior:'smooth',block:'nearest' });
}
function finish() {
  if (!saved.completed.includes(currentLevel.id)) saved.completed.push(currentLevel.id);
  persist(); renderChapters(); playTone('win');
  const index = levels.indexOf(currentLevel);
  $('win-title').textContent = isWebLevel() ? '原来，页面就是棋盘。' : index === levels.length-1 ? '熟悉的数字，新的理解。' : '原来如此。';
  $('win-insight').textContent = currentLevel.insight;
  $('win-stats').replaceChildren(node('span',game.mistakes === 0 ? '✓ 零误判' : `${game.mistakes} 次误判`),node('span',`${game.hintsUsed} 次提示`));
  if (currentLevel.scanRegions?.length) $('win-stats').append(node('span',`${game.scans} 次采样`));
  $('next-level').textContent = index === levels.length-1 ? '回顾全部实验 →' : index === 23 ? '进入网页探索 →' : index === 17 ? '探索方向扩展 →' : '继续下一个实验 →';
  say('所有安全格都已打开。你获得了一种新的理解。','success');
  openDialog('win-dialog');
}
function openDialog(id) { const dialog=$(id); if (!dialog.open) dialog.showModal(); }
$('tool-open').addEventListener('click',() => { tool='open'; render(); });
$('tool-mark').addEventListener('click',() => { tool='mark'; render(); say('笔记不会透露真值。可以再次标记取消，或用“撤销笔记”返回。'); });
$('web-open').addEventListener('click',() => $('tool-open').click());
$('web-mark').addEventListener('click',() => $('tool-mark').click());
$('web-undo').addEventListener('click',() => $('undo').click());
$('web-hint').addEventListener('click',() => { $('hint').click(); if (lastHintCells.length) pageBoard.locate(lastHintCells[0]); });
$('web-focus').addEventListener('click',() => pageBoard.locate(currentLevel.initial[0]));
$('web-exit').addEventListener('click',() => { selectLevel(lastNonWebLevel); renderMap(); openDialog('map-dialog'); });
$('restart').addEventListener('click',() => { delete saved.sessions[currentLevel.id]; loadGame(); render(); persist(); say('棋盘已重开，布局保持固定。之前的误判与采样计数清零。'); });
$('undo').addEventListener('click',() => { const result=undo(game); render(); persist(); say(result?.ok ? '已撤销一次笔记。已经观察到的事实继续保留。' : result?.reason || '目前没有可以撤销的笔记。'); });
$('hint').addEventListener('click',() => {
  if (game.won) { say('本关已经完成。下一关会带来新的问题。'); return; }
  const before=game.hintsUsed;
  const hint=getHint(game);
  if (game.hintsUsed === before) game.hintsUsed++;
  lastHintCells=hint.cells || [];
  render(); persist(); say(hint.text || '观察相邻的线索，寻找所有合法候选都同意的安全格。');
});
$('scan').addEventListener('click',() => {
  const wasWon=game.won;
  const regionId=$('scan-region').value;
  const result=scan(game,regionId);
  render(); persist();
  if (!result?.ok) say(result?.reason || '这个区域已经采样，换一个区域获取新证据。');
  else { say(result.message || `采样已记录。${result.count !== undefined ? `区域有 ${result.count} 个雷。` : ''}重新比较候选，看看哪些位置已经确定。`); playTone(); }
  if (!wasWon && game.won) finish();
});
$('batch-safe').addEventListener('click',() => {
  let opened=0;
  const wasWon=game.won;
  while (!game.won) {
    const safe=[...getProbabilities(game)].filter(([id,p]) => p === 0 && !game.revealed.has(id) && !game.confirmedMines.has(id)).map(([id]) => id);
    if (!safe.length) break;
    for (const id of safe) { if (reveal(game,id).ok) opened++; }
    if (opened > currentLevel.nodes.length) break;
  }
  render(); persist(); say(opened ? `已整理 ${opened} 个确定安全格。所有候选都同意它们安全。` : '还没有确定安全的未知格。选一次能区分候选的采样。');
  if (!wasWon && game.won) finish();
});
$('candidate-toggle').addEventListener('click',() => { showCandidates=!showCandidates; renderCandidates(); });
$('view-controls').querySelectorAll('button').forEach(button => button.addEventListener('click',() => { view=button.dataset.view; render(); say('事实与雷位保持固定，只改变计数的表达。'); }));
document.querySelectorAll('[data-rotate]').forEach(button => button.addEventListener('click',() => { rotation += Number(button.dataset.rotate) * Math.PI/8; renderBoard(); }));
$('spatial-reset').addEventListener('click',() => { rotation=-.28; renderBoard(); });
$('spatial-layers').addEventListener('change',e => { showLayers=e.target.checked; renderBoard(); });
$('sound-toggle').addEventListener('click',() => { saved.sound=!saved.sound; updateSound(); persist(); playTone(); });
for (const id of ['map-open','explore-open']) $(id).addEventListener('click',() => { renderMap(); openDialog('map-dialog'); });
$('help-open').addEventListener('click',() => openDialog('help-dialog'));
document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click',() => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click',e => {
  const r=dialog.getBoundingClientRect();
  if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
}));
$('next-level').addEventListener('click',() => {
  $('win-dialog').close(); const next=levels[levels.indexOf(currentLevel)+1];
  if (next) selectLevel(next.id); else { renderMap(); openDialog('map-dialog'); }
});
$('win-map').addEventListener('click',() => { $('win-dialog').close(); renderMap(); openDialog('map-dialog'); });
window.addEventListener('pagehide',persist);
loadGame(); render(); persist(); updateSound();
say(game.won ? '已恢复完成的实验。打开章节地图继续，或重新开始。' : isWebLevel() ? '网页探索已开启。带编号的真实页面元素就是格子；先选中已安全的主标题，查看它的邻居。' : '开局格已经确认安全。观察数字与邻域，从一个确定的判断开始。');
