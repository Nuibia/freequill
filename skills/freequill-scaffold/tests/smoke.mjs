#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRun } from '../runtime/lib/engine.mjs';
import { runHostLoop } from '../runtime/lib/host-loop.mjs';
import { createWork } from '../runtime/workspace.mjs';
import { ensureUserSpace } from '../runtime/user-space.mjs';
const root = path.resolve(process.env.FREEQUILL_SKILL_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const home = path.resolve(process.env.FREEQUILL_HOME ?? path.join(process.cwd(), 'FreeQuill-test-home'));
process.env.FREEQUILL_HOME = home;
const userSpace = ensureUserSpace({ home });
const preserved = path.join(userSpace.worksDir, '用户已有作品.md');
const preservedBytes = fs.existsSync(preserved) ? fs.readFileSync(preserved) : Buffer.from('升级不得改写这篇作品\n');
if (!fs.existsSync(preserved)) fs.writeFileSync(preserved, preservedBytes, { flag: 'wx' });
const outputs = {
  'generate-topic-directions@1': { candidates: [{ id: 'direction-a', theme: '普通维修员必须在保住工作与公开阻止事故之间承担不可逆代价' }] },
  'evaluate-topic-directions@1': { evaluations: [{ candidate_id: 'direction-a', scores: { relevance: 22, specificity: 18, dilemma_cost: 18, ending_payoff: 18, non_preachy: 14 }, hard_gates: { evidence_valid: true, craft_supported: true, not_generic_moral: true } }] },
  'generate-premises@1': { candidates: [{ id: 'premise-a', premise: '维修员提前看见事故记录，为阻止伤亡必须公开一份会让自己失业的检修证据' }] },
  'evaluate-premises@1': { evaluations: [{ candidate_id: 'premise-a', scores: { clarity: 14, desire_stakes: 18, character_mechanism: 14, differentiation: 18, emotional_payoff: 14, engine_durability: 14 }, hard_gates: { theme_consistent: true, protagonist_can_act: true, ending_can_pay_off: true } }] },
  'generate-titles@1': { candidates: [{ id: 'title-a', title: '事故记录里，我明天会被开除' }] },
  'evaluate-titles@1': { evaluations: [{ candidate_id: 'title-a', scores: { genre_clarity: 18, conflict_payoff: 23, emotion: 18, curiosity: 14, naturalness: 9, consistency: 9 }, hard_gates: { premise_consistent: true, no_false_promise: true, platform_safe: true } }] },
  'evaluate-selection-fit@1': { score: 90, hard_gates: { platform_fit: true, execution_ready: true } },
  'diagnose-genre@1': { diagnosis: '核心设定直接驱动行动与代价', violations: [], recommendations: ['保持证据边界清晰'] },
  'build-story-engine@1': { story_engine: { promise: '提前看见事故记录', choice: '公开证据并承担失业代价', payoff: '事故被阻止且栽赃链曝光' } },
  'build-short-outline@1': { outline: [{ chapter: 1, goal: '发现记录并验证' }, { chapter: 2, goal: '公开证据阻止事故' }, { chapter: 3, goal: '承担代价并兑现真相' }] },
  'evaluate-story-engine@1': { verdict: 'PASS', findings: [] },
  'evaluate-short-outline@1': { verdict: 'PASS', findings: [] },
  'draft-short-story@1': { chapters: [{ number: 1, title: '记录', content: '检修屏上多出一条明天的事故记录。维修员没有关掉它，而是开始核对每一枚螺栓。' }, { number: 2, title: '代价', content: '他把证据投到全员屏幕，停工警报响起时，解雇通知也到了。' }, { number: 3, title: '明天', content: '事故没有发生。调查员沿着被改写的记录，找到了真正动手的人。' }] },
  'build-long-chapter-plan@1': { chapter_plan: { goal: '拿到第一条可验证线索', obstacle: '线索会暴露主角', hook: '对手已经知道他在查' } },
  'draft-long-chapter@1': { title: '第一章 线索', content: '雨停时，他在门缝里发现一张只写着自己名字的车票。' },
  'build-submission-materials@1': { markdown: '# 投稿物料\n\n## 一句话卖点\n他看见明天的事故记录，却必须先证明自己不是事故制造者。', profile: { category: '都市脑洞', declarations: ['待用户按目标平台确认'] } },
};
for (const id of ['review-short-logic@1','review-short-platform@1','review-short-technique@1','review-short-commonsense@1','review-long-logic@1','review-long-editorial@1','review-long-reader@1','review-long-technique@1','review-long-commonsense@1']) outputs[id] = { verdict: 'PASS', findings: [] };
outputs['review-short-reader@1'] = { verdict: 'PASS', findings: [], cold_read: { summary: '主角为阻止事故承担失业代价' } };
async function execute(action) { if (action.action_type === 'human_input') { const selected = { 'topic-direction@2': 'direction-a', 'premise-selection@2': 'premise-a', 'title-selection@2': 'title-a' }[action.workflow]; const output = selected ? { selected_candidate_id: selected } : { approved: true }; return { status: 'completed', output, side_effects: [], executor: { isolated: false, agent_id: 'fixture-human' } }; } const output = outputs[action.capability]; if (!output) throw new Error(`fixture 缺少 ${action.capability}`); return { status: 'completed', output, side_effects: [], executor: action.isolation?.required ? { isolated: true, agent_id: `isolated-${action.capability}` } : { isolated: false, agent_id: 'host-agent' } }; }
const fast = await runHostLoop({ root, stateDir: userSpace.stateDir, start: { workflow: 'fast-short@2', runId: 'portable-fast-smoke', input: { mode: 'fast', brief: '写一篇短故事', genre: 'dushi-naodong', platform: 'generic', selection: { mode: 'fast' } }, accessGrant: { allowed_side_effects: ['workspace_write'] }, requestedBy: { agent_id: 'host-agent' } }, execute });
assert.equal(fast.status, 'completed');
assert.equal(checkRun({ root, stateDir: userSpace.stateDir, runId: fast.run_id, completable: true }).ok, true);
const fastWork = path.join(userSpace.worksDir, '事故记录里，我明天会被开除');
assert.equal(fs.existsSync(path.join(fastWork, '正文/01.md')), true);
assert.equal(fs.existsSync(path.join(fastWork, '投稿物料.md')), true);
const classicSelection = await runHostLoop({ root, stateDir: userSpace.stateDir, start: { workflow: 'selection@2', runId: 'portable-classic-selection-smoke', input: { mode: 'classic', brief: '人工拍板选题' }, requestedBy: { agent_id: 'host-agent' } }, execute });
assert.equal(classicSelection.status, 'completed');
const classicWork = createWork({ title: 'Classic 短篇隔离测试', form: 'short' }).book_path;
const classicShort = await runHostLoop({ root, stateDir: userSpace.stateDir, start: { workflow: 'short-create@2', runId: 'portable-classic-short-smoke', input: { mode: 'classic', book_path: classicWork, brief: '人工确认细纲后写短篇' }, accessGrant: { allowed_side_effects: ['workspace_write'] }, requestedBy: { agent_id: 'host-agent' } }, execute });
assert.equal(classicShort.status, 'completed');
assert.equal(fs.existsSync(path.join(classicWork, '正文/01.md')), true);
const longWork = createWork({ title: '长篇隔离测试', form: 'long' }).book_path;
const long = await runHostLoop({ root, stateDir: userSpace.stateDir, start: { workflow: 'long-chapter@2', runId: 'portable-long-smoke', input: { mode: 'fast', book_path: longWork, chapter_number: 1 }, accessGrant: { allowed_side_effects: ['workspace_write'] }, requestedBy: { agent_id: 'host-agent' } }, execute });
assert.equal(long.status, 'completed');
assert.equal(fs.existsSync(path.join(longWork, '正文/0001.md')), true);
ensureUserSpace({ home });
assert.deepEqual(fs.readFileSync(preserved), preservedBytes);
process.stdout.write('FreeQuill portable full-suite smoke pass\n');
