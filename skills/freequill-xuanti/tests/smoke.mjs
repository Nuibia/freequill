#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRun } from '../runtime/lib/engine.mjs';
import { runHostLoop } from '../runtime/lib/host-loop.mjs';
import { ensureUserSpace } from '../runtime/user-space.mjs';

const root = path.resolve(process.env.FREEQUILL_SKILL_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const home = path.resolve(process.env.FREEQUILL_HOME ?? path.join(process.cwd(), 'FreeQuill-test-home'));
const userSpace = ensureUserSpace({ home });
const stateDir = userSpace.stateDir;
const preservedWork = path.join(userSpace.worksDir, '用户已有作品.md');
const preservedBytes = fs.existsSync(preservedWork) ? fs.readFileSync(preservedWork) : Buffer.from('升级不得改写这篇作品\n');
if (!fs.existsSync(preservedWork)) fs.writeFileSync(preservedWork, preservedBytes, { flag: 'wx' });
const outputs = {
  'generate-topic-directions@1': { candidates: [{ id: 'direction-a', theme: '一个普通人必须在保住退路与公开承担责任之间作出不可逆选择' }] },
  'evaluate-topic-directions@1': { evaluations: [{ candidate_id: 'direction-a', scores: { relevance: 22, specificity: 18, dilemma_cost: 18, ending_payoff: 18, non_preachy: 14 }, hard_gates: { evidence_valid: true, craft_supported: true, not_generic_moral: true }, rationale: '具体困境、代价和兑现都可执行' }] },
  'generate-premises@1': { candidates: [{ id: 'premise-a', premise: '失去退路的维修员必须在事故发生前公开承担停工代价，才能阻止他被栽赃的未来成为现实' }] },
  'evaluate-premises@1': { evaluations: [{ candidate_id: 'premise-a', scores: { clarity: 14, desire_stakes: 18, character_mechanism: 14, differentiation: 18, emotional_payoff: 14, engine_durability: 14 }, hard_gates: { theme_consistent: true, protagonist_can_act: true, ending_can_pay_off: true }, rationale: '欲望、赌注、人物行动与结局兑现闭合' }] },
  'generate-titles@1': { candidates: [{ id: 'title-a', title: '明天的事故认定书上，是我的名字' }] },
  'evaluate-titles@1': { evaluations: [{ candidate_id: 'title-a', scores: { genre_clarity: 18, conflict_payoff: 23, emotion: 18, curiosity: 14, naturalness: 9, consistency: 9 }, hard_gates: { premise_consistent: true, no_false_promise: true, platform_safe: true }, rationale: '标题准确承诺身份危机与未来事故冲突' }] },
  'evaluate-selection-fit@1': { score: 90, hard_gates: { platform_fit: true, execution_ready: true }, rationale: '体量、冲突密度和执行条件匹配' },
};
const result = await runHostLoop({ root, stateDir, start: { workflow: 'selection@2', runId: 'portable-selection-smoke', input: { mode: 'fast' }, requestedBy: { agent_id: 'host-agent' } }, execute: async (action) => ({ status: 'completed', output: outputs[action.capability], executor: { isolated: action.isolation?.required === true, agent_id: action.isolation?.required === true ? 'isolated-evaluator' : 'host-agent' } }) });
assert.equal(result.status, 'completed');
assert.equal(result.action_count, 7);
assert.equal(checkRun({ root, stateDir, runId: result.run_id, completable: true }).ok, true);
ensureUserSpace({ home });
assert.deepEqual(fs.readFileSync(preservedWork), preservedBytes);
assert.equal(fs.existsSync(path.join(userSpace.stateDir, 'runs', result.run_id, 'manifest.json')), true);
process.stdout.write('freequill-xuanti full selection smoke pass\n');
