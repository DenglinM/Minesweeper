import assert from 'node:assert/strict';
import { createGame, reveal, scan, getCandidates, getProbabilities, getProgress } from '../engine.js';

export const layoutKey = layout => [...layout].sort().join('|');
export const catalogueKey = candidates => candidates.map(layoutKey).sort().join('\n');

/** This selector receives only information a player is allowed to see. */
export function choosePublicAction({ nodes, candidates, revealed, confirmedMines, scanRegions = [], usedRegions = new Set() }) {
  assert.ok(candidates.length > 0, '公开证据不能排除所有合法布局');
  const possibleMines = new Set(candidates.flat());
  const safe = nodes.map(node => node.id).find(id => !revealed.has(id) && !confirmedMines.has(id) && !possibleMines.has(id));
  if (safe !== undefined) return { kind: 'reveal', id: safe, candidateCount: candidates.length };
  const choices = [];
  for (const region of scanRegions) {
    if (usedRegions.has(region.id)) continue;
    const cells = new Set(region.cells);
    const branches = new Map();
    for (const mines of candidates) {
      const count = mines.reduce((sum, id) => sum + Number(cells.has(id)), 0);
      branches.set(count, (branches.get(count) || 0) + 1);
    }
    if (branches.size > 1) choices.push({ region, worst: Math.max(...branches.values()), branches: branches.size });
  }
  choices.sort((a, b) => a.worst - b.worst || b.branches - a.branches || a.region.id.localeCompare(b.region.id));
  if (choices.length) return { kind: 'scan', id: choices[0].region.id, candidateCount: candidates.length };
  return null;
}

export function solveByPublicEvidence(game) {
  const usedRegions = new Set();
  const trace = [];
  let peakCandidates = 0;
  let previousCount = Infinity;
  const maxTurns = game.level.nodes.length * 4 + (game.level.scanRegions?.length || 0) * 3 + 16;
  for (let turn = 0; turn < maxTurns; turn++) {
    const candidates = getCandidates(game);
    assert.ok(candidates.length > 0, `${game.level.id}: 候选目录为空`);
    assert.ok(candidates.length <= previousCount, `${game.level.id}: 获得证据后候选数量不应增加`);
    previousCount = candidates.length;
    peakCandidates = Math.max(peakCandidates, candidates.length);
    const probabilities = getProbabilities(game);
    for (const node of game.level.nodes) {
      const count = candidates.reduce((sum, mines) => sum + Number(mines.includes(node.id)), 0);
      assert.equal(probabilities.get(node.id), count / candidates.length, `${game.level.id}/${node.id}: 概率必须等于公开候选频率`);
    }
    if (getProgress(game).won || game.won) return { scans: usedRegions.size, steps: trace.length, peakCandidates, trace };
    const action = choosePublicAction({
      nodes: game.level.nodes, candidates, revealed: game.revealed,
      confirmedMines: game.confirmedMines, scanRegions: game.level.scanRegions,
      usedRegions,
    });
    assert.ok(action, `${game.level.id}: 无确定安全步且没有能区分候选的公开采样区域`);
    const result = action.kind === 'reveal' ? reveal(game, action.id) : scan(game, action.id);
    assert.equal(result.ok, true, `${game.level.id}: 公开动作 ${action.kind}/${action.id} 被拒绝：${result.reason || ''}`);
    assert.ok(!result.mistake, `${game.level.id}: 依据公开候选选出的安全步发生误判`);
    if (action.kind === 'scan') usedRegions.add(action.id);
    trace.push(action);
  }
  assert.fail(`${game.level.id}: 公开决策未在有限步骤内完成`);
}

export function validateLevel(level, { maxLayouts = 4096 } = {}) {
  const ids = new Set(level.nodes.map(node => node.id));
  assert.equal(ids.size, level.nodes.length, `${level.id}: 节点 ID 重复`);
  assert.equal(new Set(level.mines).size, level.mines.length, `${level.id}: 雷列表重复`);
  assert.equal(level.mines.length, level.totalMines, `${level.id}: 总雷数不一致`);
  for (const id of [...level.mines, ...level.initial]) assert.ok(ids.has(id), `${level.id}: 未知节点 ${id}`);
  for (const id of level.initial) assert.ok(!level.mines.includes(id), `${level.id}: 初始安全点实际含雷`);
  for (const node of level.nodes) {
    const neighbors = level.neighbors[node.id];
    assert.ok(Array.isArray(neighbors), `${level.id}: 缺少邻接表 ${node.id}`);
    assert.equal(new Set(neighbors).size, neighbors.length, `${level.id}: 邻接重复`);
    assert.ok(!neighbors.includes(node.id), `${level.id}: 存在自环`);
    for (const other of neighbors) {
      assert.ok(ids.has(other), `${level.id}: 邻接包含未知节点`);
      assert.ok(level.neighbors[other]?.includes(node.id), `${level.id}: 邻接不对称`);
    }
  }
  const baseline = getCandidates(createGame(level));
  assert.ok(baseline.some(mines => layoutKey(mines) === layoutKey(level.mines)), `${level.id}: 实际布局不满足公开证据`);
  assert.ok(baseline.length <= maxLayouts, `${level.id}: ${baseline.length} 个布局超出穷举验算预算 ${maxLayouts}，不能声称完整验证`);
  assert.equal(new Set(baseline.map(layoutKey)).size, baseline.length, `${level.id}: 候选布局未去重`);
  const baselineKey = catalogueKey(baseline);
  const exhaustive = level.mode === 'probability' || !!level.publicCandidates;
  const truths = exhaustive ? baseline : [level.mines];
  let worstScans = 0;
  let worstSteps = 0;
  let worstCandidates = 0;
  for (const possibleTruth of truths) {
    const game = createGame({ ...level, mines: [...possibleTruth] });
    assert.equal(catalogueKey(getCandidates(game)), baselineKey, `${level.id}: 相同初始公开证据下，隐藏真值改变了候选`);
    const result = solveByPublicEvidence(game);
    worstScans = Math.max(worstScans, result.scans);
    worstSteps = Math.max(worstSteps, result.steps);
    worstCandidates = Math.max(worstCandidates, result.peakCandidates);
    assert.equal(game.mistakes, 0, `${level.id}: 完整通关依赖试错`);
  }
  return { id: level.id, mode: level.mode, nodes: level.nodes.length, validation: exhaustive ? 'all-branches' : 'fixed-level', layoutsTested: truths.length, worstCandidates, worstScans, worstSteps, solvable: true };
}
