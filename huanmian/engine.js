/* Rules and evidence are independent of presentation. Hidden truth is used only
 * when a player receives an observation, never to construct the posterior. */
const baseCache = new WeakMap();
const DIRECTIONS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const isProbability = level => level.mode === 'probability' || (level.mode === 'mixed' && !!level.publicCandidates);
const nodeIds = level => level.nodes.map(node => node.id);
const knownId = (game, id) => game.level.nodes.some(node => node.id === id);
const truthCount = (level, cells) => cells.reduce((sum, id) => sum + Number(level.mines.includes(id)), 0);

export function buildRadiusNeighbors(nodes, radius) {
  const neighbors = Object.fromEntries(nodes.map(node => [node.id, []]));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const distance2 = (a.x-b.x)**2 + (a.y-b.y)**2 + ((a.z || 0)-(b.z || 0))**2;
    if (distance2 <= radius**2 + 1e-9) { neighbors[a.id].push(b.id); neighbors[b.id].push(a.id); }
  }
  return neighbors;
}

function orientations(template) {
  const variants = [], seen = new Set();
  for (const degrees of template.rotations || [0, 90, 180, 270]) {
    let cells = template.cells.map(([x,y]) => [x,y]);
    for (let turn = 0; turn < ((degrees / 90) % 4 + 4) % 4; turn++) cells = cells.map(([x,y]) => [-y,x]);
    const minX = Math.min(...cells.map(c => c[0])), minY = Math.min(...cells.map(c => c[1]));
    cells = cells.map(([x,y]) => [x-minX,y-minY]).sort((a,b) => a[1]-b[1] || a[0]-b[0]);
    const key = JSON.stringify(cells);
    if (!seen.has(key)) { seen.add(key); variants.push(cells); }
  }
  return variants;
}

function templateCandidates(level, templates) {
  const at = new Map(level.nodes.map(node => [`${node.x},${node.y}`, node.id]));
  const pieces = [];
  for (const template of templates) {
    const placements = [], seen = new Set();
    for (const cells of orientations(template)) for (const anchor of level.nodes) {
      const ids = cells.map(([x,y]) => at.get(`${anchor.x+x},${anchor.y+y}`));
      if (ids.some(id => id === undefined)) continue;
      const key = [...ids].sort().join('|');
      if (!seen.has(key)) { seen.add(key); placements.push(ids); }
    }
    for (let n = 0; n < (template.count ?? 1); n++) pieces.push(placements);
  }
  const unique = new Map();
  function place(index, occupied) {
    if (index === pieces.length) {
      if (occupied.size === level.totalMines) {
        const ids = [...occupied].sort(); unique.set(ids.join('|'), ids);
      }
      return;
    }
    for (const placement of pieces[index]) {
      if (placement.some(id => occupied.has(id))) continue;
      place(index + 1, new Set([...occupied, ...placement]));
    }
  }
  place(0, new Set());
  return [...unique.values()];
}

function allCombinations(ids, count) {
  const result = [];
  function visit(start, selected) {
    if (selected.length === count) { result.push([...selected]); return; }
    const needed = count - selected.length;
    for (let i = start; i <= ids.length - needed; i++) { selected.push(ids[i]); visit(i+1, selected); selected.pop(); }
  }
  if (count >= 0 && count <= ids.length) visit(0, []);
  return result;
}

function baseCandidates(level) {
  if (baseCache.has(level)) return baseCache.get(level);
  let candidates;
  if (level.publicCandidates) {
    const legal = new Set(nodeIds(level));
    const unique = new Map();
    for (const input of level.publicCandidates) {
      const ids = [...new Set(input)].sort();
      if (ids.length !== level.totalMines || ids.some(id => !legal.has(id))) throw new Error(`Invalid public candidate: ${level.id}`);
      unique.set(ids.join('|'), ids);
    }
    candidates = [...unique.values()];
  } else if (level.mode === 'vector') {
    candidates = templateCandidates(level, [{cells:[[0,0],[1,0],[0,1],[1,1]],count:level.meta?.clusterCount || level.totalMines / 4}]);
  } else if (level.templates?.length) candidates = templateCandidates(level, level.templates);
  else candidates = allCombinations(nodeIds(level), level.totalMines);
  const records = candidates.map(ids => ({ids, set:new Set(ids)}));
  baseCache.set(level, records);
  return records;
}

/* A union of disjoint axis-aligned 2x2 squares has an unambiguous greedy
 * decomposition: the first occupied cell in the highest row starts a square. */
function clusterCenters(level, mines) {
  const nodes = new Map(level.nodes.map(node => [node.id,node]));
  const at = new Map(level.nodes.map(node => [`${node.x},${node.y}`,node.id]));
  const remaining = new Set(mines), centers = [];
  while (remaining.size) {
    const first = [...remaining].map(id => nodes.get(id)).sort((a,b) => a.y-b.y || a.x-b.x)[0];
    const square = [[0,0],[1,0],[0,1],[1,1]].map(([x,y]) => at.get(`${first.x+x},${first.y+y}`));
    if (square.some(id => !remaining.has(id))) return [];
    square.forEach(id => remaining.delete(id));
    centers.push({x:first.x+0.5,y:first.y+0.5});
  }
  return centers;
}

export function vectorDirections(level, mines, id) {
  const node = level.nodes.find(item => item.id === id);
  const centers = clusterCenters(level, mines);
  if (!node || !centers.length) return [];
  const distances = centers.map(center => (center.x-node.x)**2+(center.y-node.y)**2);
  const nearest = Math.min(...distances);
  return centers.filter((_, index) => Math.abs(distances[index]-nearest) <= 1e-9).map(center => {
    const angle = (Math.atan2(center.x-node.x, -(center.y-node.y))*180/Math.PI+360)%360;
    return DIRECTIONS[Math.floor((angle+22.5)/45)%8];
  }).sort((a,b) => DIRECTIONS.indexOf(a)-DIRECTIONS.indexOf(b));
}

function candidateMatches(game, candidate) {
  const level = game.level, set = candidate.set;
  for (const evidence of game.evidence) {
    if (evidence.type === 'safe' && set.has(evidence.id)) return false;
    if (evidence.type === 'mine' && !set.has(evidence.id)) return false;
    if (evidence.type === 'number') {
      if ((level.neighbors[evidence.id] || []).reduce((n,id) => n+Number(set.has(id)),0) !== evidence.count) return false;
    }
    if (evidence.type === 'scan') {
      if (evidence.cells.reduce((n,id) => n+Number(set.has(id)),0) !== evidence.count) return false;
    }
    if (evidence.type === 'vector' && JSON.stringify(vectorDirections(level,candidate.ids,evidence.id)) !== JSON.stringify(evidence.directions)) return false;
  }
  return true;
}

export function getCandidates(game) {
  return baseCandidates(game.level).filter(candidate => candidateMatches(game,candidate)).map(candidate => [...candidate.ids]);
}

export function getProbabilities(game) {
  const candidates = getCandidates(game), result = new Map(nodeIds(game.level).map(id => [id,0]));
  if (!candidates.length) return new Map(nodeIds(game.level).map(id => [id,NaN]));
  for (const candidate of candidates) for (const id of candidate) result.set(id,result.get(id)+1);
  for (const [id,number] of result) result.set(id,number/candidates.length);
  return result;
}

function updateWon(game) { game.won = game.revealed.size === game.level.nodes.length-game.level.totalMines; return game.won; }

function recordSafe(game, id) {
  if (game.revealed.has(id)) return;
  game.revealed.add(id); game.marks.delete(id);
  game.evidence.push({type:'safe',id});
  if (isProbability(game.level)) return;
  if (game.level.mode === 'vector') {
    game.evidence.push({type:'vector',id,directions:vectorDirections(game.level,game.level.mines,id)});
    if (!game.level.meta?.numberAnchors?.includes(id)) return;
  }
  game.evidence.push({type:'number',id,count:truthCount(game.level,game.level.neighbors[id] || [])});
}

function recordMine(game,id) {
  if (game.confirmedMines.has(id)) return;
  game.confirmedMines.add(id); game.marks.delete(id); game.evidence.push({type:'mine',id});
}

export function createGame(level, saved) {
  const game = {level,revealed:new Set(),confirmedMines:new Set(),marks:new Map(),evidence:[],scans:0,mistakes:0,hintsUsed:0,history:[],won:false,assisted:false};
  for (const id of level.initial || []) {
    if (!knownId(game,id) || level.mines.includes(id)) throw new Error(`Initial cell must be safe: ${level.id}/${id}`);
    recordSafe(game,id);
  }
  if (saved && saved.levelId === level.id && saved.version === 1 && Array.isArray(saved.evidence)) {
    const allowed = new Set(nodeIds(level));
    const valid = saved.evidence.every(item => {
      if (!item || !['safe','mine','number','vector','scan'].includes(item.type)) return false;
      if (item.type === 'scan') return Array.isArray(item.cells) && item.cells.every(id=>allowed.has(id)) && Number.isInteger(item.count) && item.count >= 0 && item.count <= item.cells.length;
      if (!allowed.has(item.id)) return false;
      if (item.type === 'number') return Number.isInteger(item.count) && item.count >= 0 && item.count <= (level.neighbors[item.id] || []).length;
      if (item.type === 'vector') return Array.isArray(item.directions) && item.directions.every(direction=>DIRECTIONS.includes(direction));
      return true;
    });
    if (valid) {
      const initialEvidence = game.evidence;
      game.evidence = [...initialEvidence];
      for (const item of saved.evidence) if (!game.evidence.some(existing => JSON.stringify(existing) === JSON.stringify(item))) game.evidence.push(JSON.parse(JSON.stringify(item)));
      game.revealed = new Set(game.evidence.filter(item=>item.type==='safe').map(item=>item.id));
      game.confirmedMines = new Set(game.evidence.filter(item=>item.type==='mine').map(item=>item.id));
      if (getCandidates(game).length && ![...game.revealed].some(id=>game.confirmedMines.has(id))) {
        game.marks = new Map((saved.marks || []).filter(([id,kind])=>allowed.has(id) && ['mine','safe'].includes(kind) && !game.revealed.has(id) && !game.confirmedMines.has(id)));
        game.history = (saved.history || []).filter(Array.isArray).slice(-40);
        for (const key of ['scans','mistakes','hintsUsed']) game[key] = Math.max(0,Number.isFinite(saved[key]) ? Math.floor(saved[key]) : 0);
        game.assisted = !!saved.assisted;
      } else {
        game.evidence = initialEvidence; game.revealed = new Set(level.initial || []); game.confirmedMines = new Set();
      }
    }
  }
  updateWon(game);
  return game;
}

export function reveal(game,id) {
  if (!knownId(game,id)) return {ok:false,reason:'没有这个格子。'};
  if (game.revealed.has(id) || game.confirmedMines.has(id)) return {ok:false,reason:'这是已经确认的事实。',won:game.won};
  if (game.level.mines.includes(id)) {
    recordMine(game,id); game.mistakes++; updateWon(game);
    return {ok:true,mistake:true,won:game.won};
  }
  const queue = [id];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (game.revealed.has(current) || game.confirmedMines.has(current)) continue;
    recordSafe(game,current);
    const clue = game.evidence.find(item=>item.type==='number' && item.id===current);
    if (clue?.count === 0 && game.level.mode !== 'vector') {
      for (const neighbor of game.level.neighbors[current] || []) if (!game.revealed.has(neighbor) && !queue.includes(neighbor)) queue.push(neighbor);
    }
  }
  updateWon(game); return {ok:true,mistake:false,won:game.won};
}

export function toggleMark(game,id,kind) {
  if (!knownId(game,id) || game.revealed.has(id) || game.confirmedMines.has(id)) return {ok:false,reason:'已确认的格子不需要笔记。'};
  const selected = kind || (game.level.mode==='negative' ? 'safe' : 'mine');
  if (!['mine','safe'].includes(selected)) return {ok:false,reason:'未知笔记工具。'};
  game.history.push([...game.marks]); if (game.history.length>40) game.history.shift();
  if (game.marks.get(id) === selected) game.marks.delete(id); else game.marks.set(id,selected);
  return {ok:true,won:game.won};
}

export function undo(game) {
  if (!game.history.length) return {ok:false,reason:'没有可撤销的笔记。已公开事实会一直保留。'};
  game.marks = new Map(game.history.pop().filter(([id,kind])=>knownId(game,id) && ['mine','safe'].includes(kind) && !game.revealed.has(id) && !game.confirmedMines.has(id)));
  return {ok:true,won:game.won};
}

export function scan(game,regionId) {
  const region = game.level.scanRegions?.find(item=>item.id===regionId);
  if (!region) return {ok:false,reason:'本关没有这个公开采样区域。'};
  if (game.evidence.some(item=>item.type==='scan' && item.regionId===regionId)) return {ok:false,reason:'这个区域的结果已记录。'};
  const count = truthCount(game.level,region.cells);
  game.evidence.push({type:'scan',regionId,cells:[...region.cells],count}); game.scans++;
  if (game.scans>2) game.assisted = true;
  if (count===0) region.cells.forEach(id=>recordSafe(game,id));
  if (count===region.cells.length) region.cells.forEach(id=>recordMine(game,id));
  updateWon(game);
  return {ok:true,count,won:game.won,assisted:game.assisted};
}

export function getClue(game,id,view) {
  const degree = (game.level.neighbors[id] || []).length;
  if (!game.revealed.has(id)) return {kind:isProbability(game.level) ? 'probability' : game.level.mode==='vector' ? 'vector' : 'number',degree,label:'线索尚未公开'};
  if (isProbability(game.level)) {
    const probabilities = getProbabilities(game);
    const unknown = (game.level.neighbors[id] || []).filter(other=>!game.revealed.has(other) && !game.confirmedMines.has(other));
    const expectation = unknown.reduce((sum,other)=>sum+probabilities.get(other),0);
    return {kind:'probability',degree,density:unknown.length ? expectation/unknown.length : null,unknownCount:unknown.length,expectation,label:unknown.length ? '未知邻域平均雷密度' : '邻域已确认'};
  }
  const number = game.evidence.find(item=>item.type==='number' && item.id===id)?.count;
  if (game.level.mode==='vector') {
    const directions = game.evidence.find(item=>item.type==='vector' && item.id===id)?.directions || [];
    return {kind:'vector',directions:[...directions],value:number,degree,label:'最近的固定雷簇中心'};
  }
  const selected = view || (game.level.mode==='negative' ? 'negative' : 'normal');
  return {kind:'number',value:selected==='negative' ? degree-number : number,degree,label:selected==='negative' ? '安全邻格' : '邻格雷数'};
}

export function getSafeIds(game) {
  return [...getProbabilities(game)].filter(([id,p])=>p===0 && !game.revealed.has(id) && !game.confirmedMines.has(id)).map(([id])=>id);
}

export function getProgress(game) {
  const total = game.level.nodes.length-game.level.totalMines;
  return {opened:game.revealed.size,total,remaining:total-game.revealed.size,won:game.won};
}

export function getHint(game) {
  game.hintsUsed++;
  const candidates = getCandidates(game), safe = getSafeIds(game), tier = Math.min(game.hintsUsed,3);
  if (tier===1) return {text:game.level.hints?.[0] || '先读规则卡：线索描述的是邻格关系，笔记只是待验证的想法。',cells:[...(game.level.initial || []).slice(0,2)]};
  if (tier===2 && safe.length) return {text:`当前 ${candidates.length} 个布局都符合已公开事实。寻找在每个候选中都安全的格子；自己的标记不参与排除。`,cells:[...(game.level.initial || []).slice(0,3)]};
  if (safe.length) return {text:`${safe[0]} 在所有 ${candidates.length} 个符合公开事实的候选中都没有雷，因此可以安全打开。`,cells:[safe[0]]};
  const regions = (game.level.scanRegions || []).filter(region=>!game.evidence.some(item=>item.type==='scan' && item.regionId===region.id));
  let best = null;
  for (const region of regions) {
    const branches = new Map();
    for (const candidate of candidates) {
      const count = region.cells.filter(id=>candidate.includes(id)).length;
      branches.set(count,(branches.get(count)||0)+1);
    }
    if (branches.size<2) continue;
    const score = Math.max(...branches.values());
    if (!best || score<best.score) best = {region,branches,score};
  }
  if (best) return {text:`可以采样“${best.region.label}”：根据当前候选，不同计数结果会留下 ${[...best.branches.values()].sort((a,b)=>a-b).join('／')} 个布局。采样无伤，新增结果才会更新概率。`,cells:[...best.region.cells]};
  return {text:game.won ? '所有安全格已经打开，可以进入下一关。' : '请重新检查公开规则和线索。当前没有能根据公开证据演示的安全步骤。',cells:[]};
}

export function serializeGame(game) {
  return {version:1,levelId:game.level.id,revealed:[...game.revealed],confirmedMines:[...game.confirmedMines],marks:[...game.marks],evidence:JSON.parse(JSON.stringify(game.evidence)),scans:game.scans,mistakes:game.mistakes,hintsUsed:game.hintsUsed,history:game.history.map(snapshot=>snapshot.map(entry=>[...entry])),assisted:game.assisted};
}
