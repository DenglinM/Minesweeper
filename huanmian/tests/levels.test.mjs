import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../levels.js';
import { validateLevel } from '../tools/public-solver.mjs';

test('所有关依公开信息完整可解，概率目录遍历全部合法真值分支', async t => {
  assert.equal(levels.length, 24, '18正式二维关 + 3向量 + 3空间');
  assert.equal(new Set(levels.map(level => level.id)).size, levels.length, '关卡 ID 唯一');
  for (const level of levels) await t.test(level.id, () => {
    const report = validateLevel(level);
    assert.equal(report.solvable, true);
    assert.ok(report.layoutsTested > 0);
    if (level.publicCandidates) assert.equal(report.layoutsTested, level.publicCandidates.length);
    else assert.equal(report.layoutsTested, 1, '固定手工关只验证已发布的实际布局');
  });
});
