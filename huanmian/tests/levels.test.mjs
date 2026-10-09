import test from 'node:test';
import assert from 'node:assert/strict';
import { chapters, levels } from '../levels.js';
import { validateLevel } from '../tools/public-solver.mjs';

test('所有关依公开信息完整可解，概率目录遍历全部合法真值分支', async t => {
  assert.ok(levels.length > 0, '关卡目录不能为空');
  assert.equal(new Set(chapters.map(chapter => chapter.id)).size, chapters.length, '章节 ID 唯一');
  assert.equal(new Set(levels.map(level => level.id)).size, levels.length, '关卡 ID 唯一');
  const chapterIds = new Set(chapters.map(chapter => chapter.id));
  for (const level of levels) assert.ok(chapterIds.has(level.chapter), `${level.id}: 引用的章节存在`);
  for (const level of levels) await t.test(level.id, () => {
    const report = validateLevel(level);
    assert.equal(report.solvable, true);
    assert.ok(report.layoutsTested > 0);
    if (level.publicCandidates) assert.equal(report.layoutsTested, level.publicCandidates.length);
    else assert.equal(report.layoutsTested, 1, '固定手工关只验证已发布的实际布局');
  });
});
