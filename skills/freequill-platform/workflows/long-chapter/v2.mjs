import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { writeWorkBatch } from '../../runtime/workspace.mjs';

function reviewVerdict(results, key) { return resultOutput(results, key).adjudication.verdict; }
function finalDraftResult(results) { return results['revision-2'] ?? results['revision-1'] ?? results.draft; }
function finalReviewResult(results) { return results['review-3'] ?? results['review-2'] ?? results['review-1']; }
function finalContinuityResult(results) { return results['continuity-3'] ?? results['continuity-2'] ?? results['continuity-1']; }
function continuityGate(input) {
  if (!input || typeof input !== 'object') return { status: 'blocked', reason: '长篇连续性候选缺失' };
  if (!Array.isArray(input.conflicts)) return { status: 'blocked', reason: '长篇连续性候选缺 conflicts 数组' };
  if (input.conflicts.length) return { status: 'blocked', reason: '长篇候选与冻结正史或状态冲突', details: { conflicts: input.conflicts } };
  for (const key of ['canon_ledger', 'current_state', 'chapter_snapshot']) if (!input[key] || typeof input[key] !== 'object' || Array.isArray(input[key])) return { status: 'blocked', reason: `长篇连续性候选缺 ${key}` };
  return { passed: true };
}
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function materializeLong(input) {
  const number = String(input.chapter_number).padStart(4, '0');
  const title = input.draft.title ? `# ${input.draft.title}\n\n` : '';
  const bodyBytes = Buffer.from(`${title}${input.draft.content.trim()}\n`);
  const canonFile = path.join(input.book_path, '设定/正史账.json');
  const stateFile = path.join(input.book_path, '设定/state/current_state.json');
  const progressFile = path.join(input.book_path, '连载进度.md');
  const currentCanonBytes = fs.readFileSync(canonFile);
  const currentStateBytes = fs.readFileSync(stateFile);
  const currentProgressBytes = fs.readFileSync(progressFile);
  const currentCanon = JSON.parse(currentCanonBytes.toString('utf8'));
  const currentState = JSON.parse(currentStateBytes.toString('utf8'));
  const canon = structuredClone(input.continuity.canon_ledger);
  const state = structuredClone(input.continuity.current_state);
  const snapshot = structuredClone(input.continuity.chapter_snapshot);
  if (canon.revision !== currentCanon.revision + 1) throw new Error('候选正史 revision 必须递增 1');
  if (state.revision !== currentState.revision + 1 || state.canon_revision !== canon.revision) throw new Error('候选状态 revision/canon_revision 不一致');
  if (snapshot.chapter !== input.chapter_number || snapshot.before_state_revision !== currentState.revision || snapshot.after_state_revision !== state.revision) throw new Error('章节快照章号或 before/after revision 不一致');
  const canonBytes = jsonBytes(canon);
  const stateBytes = jsonBytes(state);
  snapshot.integrity = { body_sha256: sha256(bodyBytes), canon_sha256: sha256(canonBytes), state_sha256: sha256(stateBytes) };
  const snapshotBytes = jsonBytes(snapshot);
  const batchSha256 = sha256(Buffer.concat([bodyBytes, canonBytes, stateBytes, snapshotBytes]));
  const result = writeWorkBatch(input.book_path, [
    { relative: `正文/${number}.md`, content: bodyBytes, expected_exists: false },
    { relative: '设定/正史账.json', content: canonBytes, allowReplace: true, expected_exists: true, expected_sha256: sha256(currentCanonBytes) },
    { relative: '设定/state/current_state.json', content: stateBytes, allowReplace: true, expected_exists: true, expected_sha256: sha256(currentStateBytes) },
    { relative: `设定/state/chapter-snapshots/${number}.json`, content: snapshotBytes, expected_exists: false },
    { relative: '连载进度.md', content: `# 创作进度\n\n- 状态：第 ${input.chapter_number} 章已通过隔离验稿并闭合连续性账\n- 当前正史 revision：${canon.revision}\n- 当前状态 revision：${state.revision}\n`, allowReplace: true, expected_exists: true, expected_sha256: sha256(currentProgressBytes) },
  ]);
  return { ...result, book_path: input.book_path, chapter_number: input.chapter_number, integrity: { ...snapshot.integrity, snapshot_sha256: sha256(snapshotBytes), batch_sha256: batchSha256 } };
}

export const workflow = defineSequentialWorkflow({
  id: 'long-chapter', version: 2, title: '长篇章节创作与验稿', outputArtifactType: 'long-chapter-delivery',
  steps: [
    {
      id: 'input-gate', kind: 'deterministic', outputArtifactType: 'long-chapter-input', input: ({ input }) => input,
      run: ({ input }) => typeof input.book_path === 'string' && typeof input.genre === 'string' && Number.isInteger(input.chapter_number) && input.chapter_number > 0
        ? { passed: true, ...input, previous_chapter: String(input.chapter_number - 1).padStart(4, '0') }
        : { status: 'needs_input', required: ['book_path', 'genre', 'chapter_number'], reason: '长篇章节需要作品路径、品类和正整数章号' },
    },
    { id: 'plan', kind: 'capability', capability: 'build-long-chapter-plan@1', outputArtifactType: 'long-chapter-plan', policyRefs: ['policies/creation/long.v2.json'], input: ({ results }) => resultOutput(results, 'input-gate') },
    { id: 'human-plan-approval', kind: 'human_input', when: ({ mode }) => mode !== 'fast', required: ['approved'], prompt: '请确认本章计划。approved=true 后才进入起草。', input: ({ results }) => resultOutput(results, 'plan') },
    {
      id: 'approval-gate', kind: 'deterministic', input: ({ mode, results }) => ({ mode, decision: results['human-plan-approval']?.output ?? null }),
      run: ({ input }) => input.mode === 'fast' || input.decision?.approved === true ? { passed: true } : { status: 'blocked', reason: '用户尚未批准章计划' },
    },
    { id: 'draft', kind: 'capability', capability: 'draft-long-chapter@1', outputArtifactType: 'long-chapter-draft', policyRefs: ['policies/creation/long.v2.json'], input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), chapter_plan: resultOutput(results, 'plan').chapter_plan }) },
    { id: 'continuity-1', kind: 'capability', capability: 'derive-long-continuity@1', outputArtifactType: 'long-continuity-candidate', policyRefs: ['policies/creation/long.v2.json'], input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), chapter: resultOutput(results, 'draft') }) },
    { id: 'continuity-gate-1', kind: 'deterministic', input: ({ results }) => resultOutput(results, 'continuity-1'), run: ({ input }) => continuityGate(input) },
    { id: 'review-1', kind: 'subworkflow', workflow: 'review-long@2', input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), chapter: resultOutput(results, 'draft'), continuity: resultOutput(results, 'continuity-1'), attempt: 1 }) },
    { id: 'revision-1', kind: 'capability', capability: 'revise-long-chapter@1', outputArtifactType: 'long-chapter-revision', policyRefs: ['policies/creation/long.v2.json'], when: ({ results }) => reviewVerdict(results, 'review-1') === 'FIX_BODY', input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), draft: resultOutput(results, 'draft'), review: resultOutput(results, 'review-1'), attempt: 1 }) },
    { id: 'continuity-2', kind: 'capability', capability: 'derive-long-continuity@1', outputArtifactType: 'long-continuity-candidate', policyRefs: ['policies/creation/long.v2.json'], when: ({ results }) => Boolean(results['revision-1']), input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), chapter: resultOutput(results, 'revision-1') }) },
    { id: 'continuity-gate-2', kind: 'deterministic', when: ({ results }) => Boolean(results['continuity-2']), input: ({ results }) => resultOutput(results, 'continuity-2'), run: ({ input }) => continuityGate(input) },
    { id: 'review-2', kind: 'subworkflow', workflow: 'review-long@2', when: ({ results }) => Boolean(results['revision-1']), input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), chapter: resultOutput(results, 'revision-1'), continuity: resultOutput(results, 'continuity-2'), attempt: 2 }) },
    { id: 'revision-2', kind: 'capability', capability: 'revise-long-chapter@1', outputArtifactType: 'long-chapter-revision', policyRefs: ['policies/creation/long.v2.json'], when: ({ results }) => Boolean(results['review-2']) && reviewVerdict(results, 'review-2') === 'FIX_BODY', input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), draft: resultOutput(results, 'revision-1'), review: resultOutput(results, 'review-2'), attempt: 2 }) },
    { id: 'continuity-3', kind: 'capability', capability: 'derive-long-continuity@1', outputArtifactType: 'long-continuity-candidate', policyRefs: ['policies/creation/long.v2.json'], when: ({ results }) => Boolean(results['revision-2']), input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), chapter: resultOutput(results, 'revision-2') }) },
    { id: 'continuity-gate-3', kind: 'deterministic', when: ({ results }) => Boolean(results['continuity-3']), input: ({ results }) => resultOutput(results, 'continuity-3'), run: ({ input }) => continuityGate(input) },
    { id: 'review-3', kind: 'subworkflow', workflow: 'review-long@2', when: ({ results }) => Boolean(results['revision-2']), input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), chapter: resultOutput(results, 'revision-2'), continuity: resultOutput(results, 'continuity-3'), attempt: 3 }) },
    {
      id: 'review-gate', kind: 'deterministic', input: ({ results }) => finalReviewResult(results).output.adjudication,
      run: ({ input }) => input.verdict === 'PASS' ? { passed: true } : { status: 'blocked', reason: '长篇章节三轮隔离验稿后仍未通过', details: input },
    },
    {
      id: 'materialize', kind: 'deterministic', outputArtifactType: 'long-chapter-materialization', allowedSideEffects: ['workspace_write'],
      input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), draft: finalDraftResult(results).output, continuity: finalContinuityResult(results).output }),
      run: ({ input }) => {
        try {
          if (typeof input.draft?.content !== 'string' || !input.draft.content.trim()) return { status: 'blocked', reason: '长篇起草结果缺少正文 content' };
          return materializeLong(input);
        } catch (error) { return { status: 'blocked', reason: '长篇章节落盘失败', details: { message: error.message } }; }
      },
    },
  ],
  complete: ({ results }) => ({ request: resultOutput(results, 'input-gate'), plan: resultOutput(results, 'plan'), draft: finalDraftResult(results).output, continuity: finalContinuityResult(results).output, review: finalReviewResult(results).output, materialization: resultOutput(results, 'materialize') }),
});
