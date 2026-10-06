import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { levels } from '../levels.js';
import { validateLevel } from './public-solver.mjs';

export function verifyLevels(catalogue = levels) {
  const reports = [];
  const errors = [];
  for (const level of catalogue) {
    try { reports.push(validateLevel(level)); }
    catch (error) { errors.push({ id: level.id, error: error.message }); }
  }
  return { passed: errors.length === 0 && reports.length === catalogue.length, levels: reports, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyLevels();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.table(result.levels.map(row => ({
      关卡: row.id, 模式: row.mode, 节点: row.nodes, 验算: row.validation === 'all-branches' ? '全部分支' : '固定关卡', 验算布局: row.layoutsTested,
      最坏候选: row.worstCandidates, 最坏采样: row.worstScans,
      最坏操作: row.worstSteps, 公开信息可解: row.solvable ? '通过' : '失败',
    })));
    for (const error of result.errors) console.error(`${error.id}: ${error.error}`);
    console.log(result.passed
      ? `通过：${result.levels.length} 关；固定手工盘验证实际关卡，概率目录遍历全部合法分支。动作只由公开候选与采样区域决定。`
      : `未通过：${result.errors.length} 关。请修复后再发布。`);
    console.log('最坏采样为本验算器公开决策策略的实际最坏分支，并非最优采样深度证明。');
  }
  if (!result.passed) process.exitCode = 1;
}
