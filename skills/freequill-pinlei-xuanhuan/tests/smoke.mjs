#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRun } from '../runtime/lib/engine.mjs';
import { runHostLoop } from '../runtime/lib/host-loop.mjs';
import { createWork, materializeBookContext, withBookWriteLock, writeWorkBatch } from '../runtime/workspace.mjs';
import { ensureUserSpace } from '../runtime/user-space.mjs';
const root = path.resolve(process.env.FREEQUILL_SKILL_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const home = path.resolve(process.env.FREEQUILL_HOME ?? path.join(process.cwd(), 'FreeQuill-test-home'));
process.env.FREEQUILL_HOME = home;
const userSpace = ensureUserSpace({ home });
const preserved = path.join(userSpace.worksDir, '用户已有作品.md');
const preservedBytes = fs.existsSync(preserved) ? fs.readFileSync(preserved) : Buffer.from('升级不得改写这篇作品\n');
if (!fs.existsSync(preserved)) fs.writeFileSync(preserved, preservedBytes, { flag: 'wx' });
function treeSha256(directory) {
  const entries = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) entries.push(`${path.relative(directory, file).split(path.sep).join("/")}\0${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`);
      else throw new Error(`已有作品含非普通文件：${file}`);
    }
  }
  walk(directory);
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');
}
const preservedBook = path.join(userSpace.worksDir, '用户既有长篇');
const preservedArtifacts = {
  'book-policy.json': '{"sentinel":"book-policy"}\n',
  '设定/故事圣经.json': '{"sentinel":"story-bible"}\n',
  '设定/人物与对白卡.json': '{"sentinel":"dialogue"}\n',
  '设定/创作决策.json': '{"sentinel":"decisions"}\n',
  '设定/正史账.json': '{"sentinel":"canon"}\n',
  '设定/state/current-state.json': '{"sentinel":"state"}\n',
  '设定/state/chapter-snapshots/0007.json': '{"sentinel":"snapshot"}\n',
  '正文/0007.md': '# 用户正文\n',
  '连载进度.md': '# 用户进度\n',
};
for (const [relative, content] of Object.entries(preservedArtifacts)) {
  const file = path.join(preservedBook, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, content, { flag: 'wx' });
}
const preservedBookTree = treeSha256(preservedBook);
const outputs = {
  'generate-topic-directions@1': { candidates: [{ id: 'direction-a', theme: '普通维修员必须在保住工作与公开阻止事故之间承担不可逆代价' }] },
  'evaluate-topic-directions@1': { evaluations: [{ candidate_id: 'direction-a', scores: { relevance: 22, specificity: 18, dilemma_cost: 18, ending_payoff: 18, non_preachy: 14 }, hard_gates: { evidence_valid: true, craft_supported: true, not_generic_moral: true } }] },
  'generate-premises@1': { candidates: [{ id: 'premise-a', premise: '维修员提前看见事故记录，为阻止伤亡必须公开一份会让自己失业的检修证据' }] },
  'evaluate-premises@1': { evaluations: [{ candidate_id: 'premise-a', scores: { clarity: 14, desire_stakes: 18, character_mechanism: 14, differentiation: 18, emotional_payoff: 14, engine_durability: 14 }, hard_gates: { theme_consistent: true, protagonist_can_act: true, ending_can_pay_off: true } }] },
  'generate-titles@1': { candidates: [{ id: 'title-a', title: '事故记录里，我明天会被开除' }] },
  'evaluate-titles@1': { evaluations: [{ candidate_id: 'title-a', scores: { genre_clarity: 18, conflict_payoff: 23, emotion: 18, curiosity: 14, naturalness: 9, consistency: 9 }, hard_gates: { premise_consistent: true, no_false_promise: true, platform_safe: true } }] },
  'evaluate-selection-fit@1': { score: 90, hard_gates: { platform_fit: true, execution_ready: true } },
  'configure-book-context@2': {
    book_policy: { schema_version: 1, artifact_type: 'book-policy', revision: 1, status: 'configured', inherits: { l1_version: '1.0.0', l2_genre: 'dushi-naodong', l2_version: '1.0.0' }, core_emotion: '期待经过具体压制后，转化为快速、清晰并带现实反馈的爽快感。', style_constraints: ['用行动与现场承载信息'], red_lines_additions: ['未来记录只提供线索，不替主角完成判断'], forbidden_redefinitions: ['core_emotion', 'l2_red_lines'] },
    story_bible: { schema_version: 1, artifact_type: 'story-bible', revision: 1, status: 'configured', premise: '维修员提前看见事故记录，为阻止伤亡必须公开会令自己失业的检修证据', protagonist: { identity: '维修员', desire: '阻止事故', fear: '失去工作并被栽赃', agency: '验证并公开证据', cost_boundary: '承担失业与调查风险' }, central_conflict: '阻止事故与自保冲突', story_engine: '记录只给线索，主角必须在现实权限内验证', world_rules: ['记录可能被篡改'], ability_rules: { inputs: ['事故记录'], outputs: ['未来风险线索'], limits: ['不显示完整责任链'], costs: ['查证会暴露行动'] }, relationship_axes: [], ending_promise: '主角主动公开证据并承担代价' },
    character_dialogue: { schema_version: 1, artifact_type: 'character-dialogue-card', revision: 1, characters: [{ id: 'protagonist', goal: '停工复检', hidden_thought: '担心自己成为替罪羊', voice: '短句、先报事实后判断', forbidden_lines: ['我早就知道一切'] }], scene_anchors: ['检修屏冷光', '扳手上的机油'], dialogue_tests: { speaker_attribution_without_names: true, character_distinction_without_labels: true } },
    creation_decisions: { schema_version: 1, artifact_type: 'creation-decisions', revision: 1, decisions: [{ decision_id: 'D1', original_risk: '设定只给答案', operator_id: 'OP-HOOK-001', alternatives: ['直接显示真凶', '只显示风险记录'], selected_action: '只显示风险记录', observable_result: '主角必须查证并选择公开', status: 'ADOPTED' }], required_decision_fields: ['decision_id','original_risk','operator_id','alternatives','selected_action','observable_result','status'] },
    canon_ledger: { schema_version: 1, artifact_type: 'canon-ledger', revision: 0, frozen_facts: [], characters: {}, relationships: {}, objects: {}, events: [], hooks: [], unresolved_conflicts: [] },
    current_state: { schema_version: 1, artifact_type: 'current-state', revision: 0, story_position: { chapter: 0, scene: 0 }, character_knowledge: {}, relationships: {}, object_ownership: {}, events: {}, flags: {}, invariants: [], canon_revision: 0 },
    chapter_snapshot: { schema_version: 1, artifact_type: 'chapter-snapshot', chapter: 0, before_state_revision: 0, after_state_revision: 0, facts_added: [], facts_changed: [], knowledge_changes: [], relationship_changes: [], object_changes: [], hooks_opened: [], hooks_closed: [], integrity: { body_sha256: null, canon_sha256: null, state_sha256: null } },
  },
  'diagnose-genre@1': { diagnosis: '核心设定直接驱动行动与代价', violations: [], recommendations: ['保持证据边界清晰'] },
  'build-story-engine@1': { story_engine: { promise: '提前看见事故记录', choice: '公开证据并承担失业代价', payoff: '事故被阻止且栽赃链曝光' } },
  'build-short-outline@1': { outline: [{ chapter: 1, goal: '发现记录并验证' }, { chapter: 2, goal: '公开证据阻止事故' }, { chapter: 3, goal: '承担代价并兑现真相' }] },
  'evaluate-story-engine@1': { verdict: 'PASS', findings: [] },
  'evaluate-short-outline@1': { verdict: 'PASS', findings: [] },
  'draft-short-story@1': { chapters: [{ number: 1, title: '记录', content: '检修屏上多出一条明天的事故记录。维修员没有关掉它，而是开始核对每一枚螺栓。' }, { number: 2, title: '代价', content: '他把证据投到全员屏幕，停工警报响起时，解雇通知也到了。' }, { number: 3, title: '明天', content: '事故没有发生。调查员沿着被改写的记录，找到了真正动手的人。' }] },
  'build-long-chapter-plan@1': { chapter_plan: { goal: '拿到第一条可验证线索', obstacle: '线索会暴露主角', hook: '对手已经知道他在查' } },
  'draft-long-chapter@1': { title: '第一章 线索', content: '雨停时，他在门缝里发现一张只写着自己名字的车票。' },
  'derive-long-continuity@1': {
    canon_ledger: { schema_version: 1, artifact_type: 'canon-ledger', revision: 1, frozen_facts: [{ id: 'F1', chapter: 1, fact: '主角在门缝发现写有自己名字的车票' }], characters: {}, relationships: {}, objects: { ticket: { owner: 'protagonist', location: 'hand' } }, events: [{ chapter: 1, event: '发现车票' }], hooks: [{ id: 'H1', opened_chapter: 1, anchor: '只写着自己名字的车票', status: 'open' }], unresolved_conflicts: [] },
    current_state: { schema_version: 1, artifact_type: 'current-state', revision: 1, story_position: { chapter: 1, scene: 1 }, character_knowledge: { protagonist: ['车票写着自己的名字'] }, relationships: {}, object_ownership: { ticket: 'protagonist' }, events: { ticket_found: true }, flags: { ticket_mystery_open: true }, invariants: [], canon_revision: 1 },
    chapter_snapshot: { schema_version: 1, artifact_type: 'chapter-snapshot', chapter: 1, before_state_revision: 0, after_state_revision: 1, facts_added: ['F1'], facts_changed: [], knowledge_changes: ['protagonist:ticket'], relationship_changes: [], object_changes: ['ticket:none->protagonist'], hooks_opened: ['H1'], hooks_closed: [], integrity: { body_sha256: null, canon_sha256: null, state_sha256: null } },
    conflicts: [],
  },
  'build-submission-materials@1': { markdown: '# 投稿物料\n\n## 一句话卖点\n他看见明天的事故记录，却必须先证明自己不是事故制造者。', profile: { category: '都市脑洞', declarations: ['待用户按目标平台确认'] } },
};
for (const id of ['review-short-logic@1','review-short-platform@1','review-short-technique@1','review-short-commonsense@1','review-long-logic@1','review-long-editorial@1','review-long-reader@1','review-long-technique@1','review-long-commonsense@1']) outputs[id] = { verdict: 'PASS', findings: [] };
outputs['review-short-reader@1'] = { verdict: 'PASS', findings: [], cold_read: { summary: '主角为阻止事故承担失业代价' } };
async function execute(action) { if (action.action_type === 'human_input') { const selected = { 'topic-direction@2': 'direction-a', 'premise-selection@2': 'premise-a', 'title-selection@2': 'title-a' }[action.workflow]; const output = selected ? { selected_candidate_id: selected } : { approved: true }; return { status: 'completed', output, side_effects: [], executor: { isolated: false, agent_id: 'fixture-human' } }; } const output = outputs[action.capability]; if (!output) throw new Error(`fixture 缺少 ${action.capability}`); return { status: 'completed', output, side_effects: [], executor: action.isolation?.required ? { isolated: true, agent_id: `isolated-${action.capability}`, ...(action.isolation?.cold_read ? { cold_read_frozen_before_context: true } : {}) } : { isolated: false, agent_id: 'host-agent' } }; }
const fast = await runHostLoop({ root, stateDir: userSpace.stateDir, start: { workflow: 'fast-short@2', runId: 'portable-fast-smoke', input: { mode: 'fast', brief: '写一篇短故事', genre: 'dushi-naodong', platform: 'generic', selection: { mode: 'fast' } }, accessGrant: { allowed_side_effects: ['workspace_write'] }, requestedBy: { agent_id: 'host-agent' } }, execute });
assert.equal(fast.status, 'completed');
assert.equal(checkRun({ root, stateDir: userSpace.stateDir, runId: fast.run_id, completable: true }).ok, true);
const fastWork = path.join(userSpace.worksDir, '事故记录里，我明天会被开除');
assert.equal(fs.existsSync(path.join(fastWork, '正文/01.md')), true);
assert.equal(fs.existsSync(path.join(fastWork, '投稿物料.md')), true);
const classicSelection = await runHostLoop({ root, stateDir: userSpace.stateDir, start: { workflow: 'selection@2', runId: 'portable-classic-selection-smoke', input: { mode: 'classic', genre: 'dushi-naodong', brief: '人工拍板选题' }, requestedBy: { agent_id: 'host-agent' } }, execute });
assert.equal(classicSelection.status, 'completed');
const classicWork = createWork({ title: 'Classic 短篇隔离测试', form: 'short', genre: 'dushi-naodong' }).book_path;
materializeBookContext({ root, bookPath: classicWork, genre: 'dushi-naodong', context: outputs['configure-book-context@2'], sourceBundleSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
const classicShort = await runHostLoop({ root, stateDir: userSpace.stateDir, start: { workflow: 'short-create@2', runId: 'portable-classic-short-smoke', input: { mode: 'classic', book_path: classicWork, genre: 'dushi-naodong', brief: '人工确认细纲后写短篇' }, accessGrant: { allowed_side_effects: ['workspace_write'] }, requestedBy: { agent_id: 'host-agent' } }, execute });
assert.equal(classicShort.status, 'completed');
assert.equal(fs.existsSync(path.join(classicWork, '正文/01.md')), true);
const longWork = createWork({ title: '长篇隔离测试', form: 'long', genre: 'dushi-naodong' }).book_path;
materializeBookContext({ root, bookPath: longWork, genre: 'dushi-naodong', context: outputs['configure-book-context@2'], sourceBundleSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
const preLongCanonBytes = fs.readFileSync(path.join(longWork, '设定/正史账.json'));
const long = await runHostLoop({ root, stateDir: userSpace.stateDir, start: { workflow: 'long-chapter@2', runId: 'portable-long-smoke', input: { mode: 'fast', book_path: longWork, genre: 'dushi-naodong', chapter_number: 1 }, accessGrant: { allowed_side_effects: ['workspace_write'] }, requestedBy: { agent_id: 'host-agent' } }, execute });
assert.equal(long.status, 'completed');
assert.equal(fs.existsSync(path.join(longWork, '正文/0001.md')), true);
assert.equal(fs.existsSync(path.join(longWork, '设定/state/chapter-snapshots/0001.json')), true);
assert.equal(JSON.parse(fs.readFileSync(path.join(longWork, '设定/正史账.json'), 'utf8')).revision, 1);
const longSnapshot = JSON.parse(fs.readFileSync(path.join(longWork, '设定/state/chapter-snapshots/0001.json'), 'utf8'));
assert.match(longSnapshot.integrity.body_sha256, /^[a-f0-9]{64}$/u);
assert.match(longSnapshot.integrity.canon_sha256, /^[a-f0-9]{64}$/u);
assert.match(longSnapshot.integrity.state_sha256, /^[a-f0-9]{64}$/u);
const committedCanonBytes = fs.readFileSync(path.join(longWork, '设定/正史账.json'));
assert.throws(() => writeWorkBatch(longWork, [{ relative: '设定/正史账.json', content: committedCanonBytes, allowReplace: true, expected_exists: true, expected_sha256: crypto.createHash('sha256').update(preLongCanonBytes).digest('hex') }]), /preimage 哈希已漂移/u);
assert.deepEqual(fs.readFileSync(path.join(longWork, '设定/正史账.json')), committedCanonBytes);
withBookWriteLock(longWork, () => assert.throws(() => writeWorkBatch(longWork, [{ relative: '并发探针.txt', content: '不得写入' }]), /已有写入事务/u));
assert.equal(fs.existsSync(path.join(longWork, '并发探针.txt')), false);
ensureUserSpace({ home });
assert.deepEqual(fs.readFileSync(preserved), preservedBytes);
assert.equal(treeSha256(preservedBook), preservedBookTree);
process.stdout.write('FreeQuill portable full-suite smoke pass; upgrade L3 tree preserved; L3 concurrency guard verified\n');
