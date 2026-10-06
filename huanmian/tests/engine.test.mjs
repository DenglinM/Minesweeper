import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, reveal, toggleMark, undo, scan, getCandidates, getProbabilities,
  getClue, getSafeIds, getProgress, serializeGame, buildRadiusNeighbors, vectorDirections,
} from '../engine.js';
import { catalogueKey } from '../tools/public-solver.mjs';

function grid(size, overrides = {}) {
  const nodes = Array.from({ length: size * size }, (_, index) => ({ id: `${String.fromCharCode(65 + index % size)}${Math.floor(index / size) + 1}`, x: index % size, y: Math.floor(index / size) }));
  const neighbors = Object.fromEntries(nodes.map(node => [node.id, nodes.filter(other => other.id !== node.id && Math.abs(other.x - node.x) <= 1 && Math.abs(other.y - node.y) <= 1).map(other => other.id)]));
  const mines = overrides.mines || ['C3'];
  return { id: 'fixture', title: '测试盘', chapter: 0, mode: 'normal', size, nodes, neighbors,
    mines, initial: [], totalMines: mines.length, description: '', rule: '', insight: '', ...overrides };
}

function probabilityFixture(mines = ['C1', 'C3']) {
  return grid(3, {
    mode: 'probability', mines, totalMines: 2,
    initial: ['B1', 'A2', 'B2', 'C2', 'B3'],
    publicCandidates: [['A1', 'C1'], ['A1', 'A3'], ['C1', 'C3'], ['A3', 'C3']],
    scanRegions: [
      { id: 'A', label: 'A角', cells: ['A1'] },
      { id: 'B', label: 'B角', cells: ['C1'] },
      { id: 'top', label: '上方两角', cells: ['A1', 'C1'] },
    ],
  });
}

const sorted = values => [...values].sort();

test('补数使用实际邻域：角3、边5、内8；不把自身计入邻域', () => {
  const game = createGame(grid(3, { mines: ['A1'], initial: ['B1', 'B2', 'C3'] }));
  assert.equal(getClue(game, 'B1', 'normal').value, 1);
  assert.equal(getClue(game, 'B1', 'negative').degree, 5);
  assert.equal(getClue(game, 'B1', 'negative').value, 4);
  assert.equal(getClue(game, 'B2', 'negative').degree, 8);
  assert.equal(getClue(game, 'B2', 'negative').value, 7);
  assert.equal(getClue(game, 'C3', 'negative').degree, 3);
  assert.equal(getClue(game, 'C3', 'negative').value, 3);
});

test('负形满度数自动展开安全邻域；0安全数不会沿用传统0展开', () => {
  const safeField = createGame(grid(3, { mode: 'negative', mines: ['C3'] }));
  assert.equal(reveal(safeField, 'A1').ok, true);
  assert.equal(safeField.revealed.size, 8);
  assert.ok(!safeField.revealed.has('C3'));
  assert.equal(getProgress(safeField).won, true);
  const surrounded = createGame(grid(3, { mode: 'negative', mines: ['B1', 'A2', 'B2'] }));
  assert.equal(reveal(surrounded, 'A1').ok, true);
  assert.equal(getClue(surrounded, 'A1').value, 0);
  assert.deepEqual([...surrounded.revealed], ['A1']);
  assert.equal(surrounded.mistakes, 0);
});

test('旗帜、安全笔记及撤销不成为概率证据', () => {
  const game = createGame(probabilityFixture());
  const beforeCandidates = catalogueKey(getCandidates(game));
  const beforeProbabilities = [...getProbabilities(game)];
  const evidence = JSON.stringify(game.evidence);
  toggleMark(game, 'A1', 'mine');
  toggleMark(game, 'A3', 'safe');
  assert.equal(catalogueKey(getCandidates(game)), beforeCandidates);
  assert.deepEqual([...getProbabilities(game)], beforeProbabilities);
  assert.equal(JSON.stringify(game.evidence), evidence);
  undo(game);
  undo(game);
  assert.equal(catalogueKey(getCandidates(game)), beforeCandidates);
  assert.deepEqual([...getProbabilities(game)], beforeProbabilities);
});

test('公开扫描按真实区域返回证据，条件更新产生精确0与1，密度分母同步变化', () => {
  const game = createGame(probabilityFixture());
  for (const id of ['A1', 'C1', 'A3', 'C3']) assert.equal(getProbabilities(game).get(id), 0.5);
  assert.equal(getClue(game, 'B2').density, 0.5);
  assert.equal(getClue(game, 'B2').unknownCount, 4);
  const result = scan(game, 'A');
  assert.equal(result.ok, true);
  assert.equal(game.scans, 1);
  assert.equal(getCandidates(game).length, 2);
  assert.equal(getProbabilities(game).get('A1'), 0);
  assert.equal(getProbabilities(game).get('C3'), 1);
  assert.equal(getProbabilities(game).get('C1'), 0.5);
  assert.equal(getProbabilities(game).get('A3'), 0.5);
  assert.equal(getClue(game, 'B2').unknownCount, 3);
  assert.equal(getClue(game, 'B2').density, 2 / 3);
  assert.ok(game.evidence.some(item => item.type === 'scan' && item.regionId === 'A' && item.count === 0));
  scan(game, 'B');
  assert.equal(getCandidates(game).length, 1);
  assert.equal(getProbabilities(game).get('A3'), 0);
  assert.equal(getProbabilities(game).get('C1'), 1);
  const regionGame = createGame(probabilityFixture());
  scan(regionGame, 'top');
  assert.ok(regionGame.evidence.some(item => item.type === 'scan' && item.regionId === 'top' && item.count === 1));
  assert.equal(getCandidates(regionGame).length, 2);
});

test('概率关打开只公开安全事实，不泄露尚未采样的传统邻雷数', () => {
  const game = createGame(probabilityFixture());
  assert.equal(getCandidates(game).length, 4, '五个初始安全点不能额外泄露邻雷数');
  assert.ok(!game.evidence.some(item => item.type === 'number'));
  scan(game, 'A');
  assert.equal(getCandidates(game).length, 2);
  assert.ok(!game.evidence.some(item => item.type === 'number'));
});

test('相同公开证据在不同隐藏真值下给出相同候选、概率和安全建议', () => {
  const possibleTruths = probabilityFixture().publicCandidates;
  const games = possibleTruths.map(mines => createGame(probabilityFixture(mines)));
  for (const game of games) {
    assert.equal(catalogueKey(getCandidates(game)), catalogueKey(getCandidates(games[0])));
    assert.deepEqual([...getProbabilities(game)], [...getProbabilities(games[0])]);
    assert.deepEqual(sorted(getSafeIds(game)), sorted(getSafeIds(games[0])));
    assert.ok(!getSafeIds(game).some(id => ['A1', 'C1', 'A3', 'C3'].includes(id)));
  }
  const one = createGame(probabilityFixture(['C1', 'C3']));
  const two = createGame(probabilityFixture(['A3', 'C3']));
  scan(one, 'A');
  scan(two, 'A');
  assert.equal(catalogueKey(getCandidates(one)), catalogueKey(getCandidates(two)));
  assert.deepEqual([...getProbabilities(one)], [...getProbabilities(two)]);
});

test('误开仅公开该格雷事实；撤销笔记不抹掉事实或换雷', () => {
  const game = createGame(probabilityFixture());
  const result = reveal(game, 'C1');
  assert.equal(result.mistake, true);
  assert.equal(game.mistakes, 1);
  assert.deepEqual([...game.confirmedMines], ['C1']);
  assert.equal(getCandidates(game).length, 2);
  toggleMark(game, 'A1', 'safe');
  undo(game);
  assert.deepEqual([...game.confirmedMines], ['C1']);
  assert.equal(getCandidates(game).length, 2);
  assert.equal(game.mistakes, 1);
});

test('存档往返保留已知事实、采样、笔记和后验，刷新不重置信息', () => {
  const level = probabilityFixture();
  const game = createGame(level);
  toggleMark(game, 'C1', 'mine');
  scan(game, 'A');
  const saved = JSON.parse(JSON.stringify(serializeGame(game)));
  const restored = createGame(level, saved);
  assert.deepEqual(sorted(restored.revealed), sorted(game.revealed));
  assert.deepEqual(sorted(restored.confirmedMines), sorted(game.confirmedMines));
  assert.deepEqual([...restored.marks], [...game.marks]);
  assert.deepEqual(restored.evidence, game.evidence);
  assert.equal(restored.scans, game.scans);
  assert.equal(restored.mistakes, game.mistakes);
  assert.equal(catalogueKey(getCandidates(restored)), catalogueKey(getCandidates(game)));
  assert.deepEqual([...getProbabilities(restored)], [...getProbabilities(game)]);
  assert.equal(scan(restored, 'B').ok, true);
  assert.equal(getCandidates(restored).length, 1);
});

test('固定半径邻接包含边界、排除自身、对称且不依赖投影视角', () => {
  const nodes = [
    { id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1, y: 0, z: 0 },
    { id: 'c', x: 1.000001, y: 0, z: 0 }, { id: 'd', x: 0, y: 0, z: 1 },
  ];
  const neighbors = buildRadiusNeighbors(nodes, 1);
  assert.deepEqual(sorted(neighbors.a), ['b', 'd']);
  assert.ok(neighbors.b.includes('a'));
  assert.ok(!neighbors.b.includes('d'));
  assert.ok(!neighbors.a.includes('a'));
  const rotated = nodes.map(node => ({ ...node, x: -(node.z || 0), z: node.x }));
  assert.deepEqual(buildRadiusNeighbors(rotated, 1), neighbors);
});

test('向量最近簇等距保留所有方向；线索生成采用相同规则', () => {
  const level = grid(5, {
    mode: 'vector', mines: ['A1', 'B1', 'A2', 'B2', 'D1', 'E1', 'D2', 'E2'], totalMines: 8,
    initial: ['C2'], meta: { numberAnchors: [] },
  });
  const directions = vectorDirections(level, level.mines, 'C2');
  assert.equal(directions.length, 2, '两个等距最近簇不能只保留一个');
  assert.notEqual(directions[0], directions[1]);
  assert.deepEqual(sorted(getClue(createGame(level), 'C2').directions), sorted(directions));
});

