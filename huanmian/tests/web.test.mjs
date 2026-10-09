import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chapters, levels } from '../levels.js';
import { createGame, reveal, toggleMark, getCandidates, getProbabilities, getClue, getProgress, serializeGame } from '../engine.js';
import { catalogueKey, choosePublicAction, solveByPublicEvidence, validateLevel } from '../tools/public-solver.mjs';

const protectedDomIds = [
  'map-open', 'help-open', 'sound-toggle', 'restart', 'hint', 'undo', 'tool-open', 'tool-mark',
  'web-exit', 'web-focus', 'web-neighbors',
];
const sorted = values => [...values].sort();
function webLevel() {
  const level = levels.find(item => item.id === 'W01');
  assert.ok(level, '网页元素章必须有 W01 可玩关卡');
  assert.equal(level.mode, 'web');
  assert.ok(chapters.some(chapter => chapter.id === level.chapter && chapter.modes?.includes('web')));
  assert.ok(!level.publicCandidates, 'W01 使用固定语义关系图，不属于概率候选目录');
  return level;
}

test('W01 绑定真实页面唯一元素，标题、按钮、说明可调查且核心控件不被雷化', async () => {
  const level = webLevel();
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const declaredIds = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match => match[1]);
  const targets = level.nodes.map(node => node.domId);
  assert.equal(new Set(targets).size, targets.length, '一个实际元素只绑定一个调查节点');
  for (const node of level.nodes) {
    assert.equal(typeof node.domId, 'string');
    assert.ok(node.domId.length > 0);
    assert.equal(typeof node.label, 'string');
    assert.ok(node.label.trim().length > 0, `${node.id}: 公开调查名称不能为空`);
    assert.equal(declaredIds.filter(id => id === node.domId).length, 1, `${node.id}: DOM 目标应真实存在且唯一`);
    assert.ok(!protectedDomIds.includes(node.domId), `${node.id}: 核心离开、提示或操作控件不能成为调查目标`);
  }
  for (const id of ['intro-title', 'explore-open', 'rule-text', 'source-link']) assert.ok(targets.includes(id), `${id}: 页面标题、按钮、规则与来源元素均有实际绑定`);
  for (const id of protectedDomIds) assert.ok(declaredIds.includes(id), `${id}: 受保护控件仍应真实存在`);
  assert.equal(createGame(level).won, false, '开始时尚有需要调查的安全元素');
});

test('W01 计数只使用公开的固定语义邻接，改变屏幕布局坐标不改变事实或解法', () => {
  const level = webLevel();
  assert.ok(Array.isArray(level.meta?.graphEdges), '必须公开实际用于推理的关系图');
  const edgeKeys = level.meta.graphEdges.map(edge => {
    assert.equal(edge.length, 2);
    assert.notEqual(edge[0], edge[1]);
    return [...edge].sort().join('|');
  });
  assert.equal(new Set(edgeKeys).size, edgeKeys.length, '公开关系图边不能重复');
  for (const node of level.nodes) {
    const declaredNeighbors = level.meta.graphEdges.filter(edge => edge.includes(node.id)).map(edge => edge.find(id => id !== node.id));
    assert.deepEqual(sorted(level.neighbors[node.id]), sorted(declaredNeighbors), `${node.id}: 公开连线必须等于实际计数邻接`);
  }
  const changedLayout = { ...level, nodes: level.nodes.map((node, index) => ({ ...node, x: 1700 - index * 137, y: index % 2 ? -400 : 950, z: index * 90 })) };
  const first = createGame(level);
  const second = createGame(changedLayout);
  assert.deepEqual(changedLayout.neighbors, level.neighbors);
  assert.deepEqual(second.evidence, first.evidence);
  assert.equal(catalogueKey(getCandidates(second)), catalogueKey(getCandidates(first)));
  assert.deepEqual([...getProbabilities(second)], [...getProbabilities(first)]);
  for (const id of level.initial) {
    const clue = getClue(first, id);
    assert.equal(clue.degree, level.neighbors[id].length);
    assert.deepEqual(getClue(second, id), clue);
  }
  for (const node of level.nodes) if (!first.revealed.has(node.id)) {
    assert.equal(getClue(first, node.id).value, undefined, '尚未调查的元素不能提前公开真实邻雷数');
  }
  const one = solveByPublicEvidence(first);
  const two = solveByPublicEvidence(second);
  assert.deepEqual(two.trace, one.trace);
  assert.equal(first.mistakes, 0);
  assert.equal(second.mistakes, 0);
});

test('W01 中途调查和笔记可存档恢复，后验不变且仍能按公开证据完整通关', () => {
  const level = webLevel();
  const game = createGame(level);
  const action = choosePublicAction({ nodes: level.nodes, candidates: getCandidates(game), revealed: game.revealed, confirmedMines: game.confirmedMines });
  assert.equal(action?.kind, 'reveal', '网页关应有无需采样或猜测的安全调查步');
  assert.equal(reveal(game, action.id).mistake, false);
  const unknown = level.nodes.find(node => !game.revealed.has(node.id) && !game.confirmedMines.has(node.id));
  assert.ok(unknown, '调查一部分后仍有未知目标可记笔记');
  const beforeNotes = catalogueKey(getCandidates(game));
  assert.equal(toggleMark(game, unknown.id, 'mine').ok, true);
  assert.equal(catalogueKey(getCandidates(game)), beforeNotes);
  const saved = JSON.parse(JSON.stringify(serializeGame(game)));
  assert.ok(!Object.hasOwn(saved, 'mines'), '存档仅保存公开事实，不额外保存隐藏答案');
  const restored = createGame(level, saved);
  assert.deepEqual(sorted(restored.revealed), sorted(game.revealed));
  assert.deepEqual(sorted(restored.confirmedMines), sorted(game.confirmedMines));
  assert.deepEqual([...restored.marks], [...game.marks]);
  assert.deepEqual(restored.evidence, game.evidence);
  assert.equal(catalogueKey(getCandidates(restored)), beforeNotes);
  assert.deepEqual([...getProbabilities(restored)], [...getProbabilities(game)]);
  solveByPublicEvidence(restored);
  assert.equal(getProgress(restored).won, true);
  assert.equal(restored.mistakes, 0);
});

test('W01 作为固定图关验实际布局，仅公开候选决定动作，不被算作全部目录分支', () => {
  const report = validateLevel(webLevel());
  assert.equal(report.validation, 'fixed-level');
  assert.equal(report.layoutsTested, 1);
  assert.equal(report.worstScans, 0);
  assert.equal(report.solvable, true);
});

test('网页模式在相同公开线索下不借隐藏真值改变候选或安全建议', () => {
  // Two independently chosen truths give the same public count at title.
  const fixture = {
    id: 'web-evidence-fixture', mode: 'web', chapter: 0, totalMines: 1, initial: ['title'],
    nodes: ['title', 'copy', 'card', 'action'].map(id => ({ id })),
    neighbors: { title: ['copy', 'action'], copy: ['title', 'card'], card: ['copy', 'action'], action: ['title', 'card'] },
  };
  const one = createGame({ ...fixture, mines: ['copy'] });
  const two = createGame({ ...fixture, mines: ['action'] });
  assert.deepEqual(one.evidence, two.evidence);
  assert.equal(catalogueKey(getCandidates(one)), catalogueKey(getCandidates(two)));
  assert.equal(getCandidates(one).length, 2, '两种符合公开线索的世界都必须保留');
  assert.deepEqual([...getProbabilities(one)], [...getProbabilities(two)]);
  assert.equal(getProbabilities(one).get('card'), 0);
  assert.equal(getProbabilities(one).get('copy'), 0.5);
  assert.equal(getClue(one, 'copy').value, undefined);
  assert.equal(getClue(two, 'copy').value, undefined);
  assert.equal(reveal(one, 'card').mistake, false);
  assert.equal(reveal(two, 'card').mistake, false);
  assert.deepEqual(one.evidence, two.evidence);
  assert.equal(catalogueKey(getCandidates(one)), catalogueKey(getCandidates(two)));
});
