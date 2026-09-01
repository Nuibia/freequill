import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { writeWorkFile } from '../../runtime/workspace.mjs';

function reviewVerdict(results, key) { return resultOutput(results, key).adjudication.verdict; }
function finalDraftResult(results) { return results['revision-2'] ?? results['revision-1'] ?? results.draft; }
function finalReviewResult(results) { return results['review-3'] ?? results['review-2'] ?? results['review-1']; }

export const workflow = defineSequentialWorkflow({
  id: 'long-chapter', version: 2, title: '长篇章节创作与验稿', outputArtifactType: 'long-chapter-delivery',
  steps: [
    {
      id: 'input-gate', kind: 'deterministic', outputArtifactType: 'long-chapter-input', input: ({ input }) => input,
      run: ({ input }) => typeof input.book_path === 'string' && Number.isInteger(input.chapter_number) && input.chapter_number > 0
        ? { passed: true, ...input }
        : { status: 'needs_input', required: ['book_path', 'chapter_number'], reason: '长篇章节需要作品路径和正整数章号' },
    },
    { id: 'plan', kind: 'capability', capability: 'build-long-chapter-plan@1', outputArtifactType: 'long-chapter-plan', policyRefs: ['policies/creation/long.v2.json'], input: ({ results }) => resultOutput(results, 'input-gate') },
    { id: 'human-plan-approval', kind: 'human_input', when: ({ mode }) => mode !== 'fast', required: ['approved'], prompt: '请确认本章计划。approved=true 后才进入起草。', input: ({ results }) => resultOutput(results, 'plan') },
    {
      id: 'approval-gate', kind: 'deterministic', input: ({ mode, results }) => ({ mode, decision: results['human-plan-approval']?.output ?? null }),
      run: ({ input }) => input.mode === 'fast' || input.decision?.approved === true ? { passed: true } : { status: 'blocked', reason: '用户尚未批准章计划' },
    },
    { id: 'draft', kind: 'capability', capability: 'draft-long-chapter@1', outputArtifactType: 'long-chapter-draft', policyRefs: ['policies/creation/long.v2.json'], input: ({ results }) => ({ request: resultOutput(results, 'input-gate'), chapter_plan: resultOutput(results, 'plan').chapter_plan }) },
    { id: 'review-1', kind: 'subworkflow', workflow: 'review-long@2', input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), chapter: resultOutput(results, 'draft'), attempt: 1 }) },
    { id: 'revision-1', kind: 'capability', capability: 'revise-long-chapter@1', outputArtifactType: 'long-chapter-revision', policyRefs: ['policies/creation/long.v2.json'], when: ({ results }) => reviewVerdict(results, 'review-1') === 'FIX_BODY', input: ({ results }) => ({ draft: resultOutput(results, 'draft'), review: resultOutput(results, 'review-1'), attempt: 1 }) },
    { id: 'review-2', kind: 'subworkflow', workflow: 'review-long@2', when: ({ results }) => Boolean(results['revision-1']), input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), chapter: resultOutput(results, 'revision-1'), attempt: 2 }) },
    { id: 'revision-2', kind: 'capability', capability: 'revise-long-chapter@1', outputArtifactType: 'long-chapter-revision', policyRefs: ['policies/creation/long.v2.json'], when: ({ results }) => Boolean(results['review-2']) && reviewVerdict(results, 'review-2') === 'FIX_BODY', input: ({ results }) => ({ draft: resultOutput(results, 'revision-1'), review: resultOutput(results, 'review-2'), attempt: 2 }) },
    { id: 'review-3', kind: 'subworkflow', workflow: 'review-long@2', when: ({ results }) => Boolean(results['revision-2']), input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), chapter: resultOutput(results, 'revision-2'), attempt: 3 }) },
    {
      id: 'review-gate', kind: 'deterministic', input: ({ results }) => finalReviewResult(results).output.adjudication,
      run: ({ input }) => input.verdict === 'PASS' ? { passed: true } : { status: 'blocked', reason: '长篇章节三轮隔离验稿后仍未通过', details: input },
    },
    {
      id: 'materialize', kind: 'deterministic', outputArtifactType: 'long-chapter-materialization', allowedSideEffects: ['workspace_write'],
      input: ({ results }) => ({ ...resultOutput(results, 'input-gate'), draft: finalDraftResult(results).output }),
      run: ({ input }) => {
        try {
          if (typeof input.draft?.content !== 'string' || !input.draft.content.trim()) return { status: 'blocked', reason: '长篇起草结果缺少正文 content' };
          const number = String(input.chapter_number).padStart(4, '0');
          const title = input.draft.title ? `# ${input.draft.title}\n\n` : '';
          const file = writeWorkFile(input.book_path, `正文/${number}.md`, `${title}${input.draft.content.trim()}\n`);
          return { written: true, book_path: input.book_path, chapter_number: input.chapter_number, file };
        } catch (error) { return { status: 'blocked', reason: '长篇章节落盘失败', details: { message: error.message } }; }
      },
    },
  ],
  complete: ({ results }) => ({ request: resultOutput(results, 'input-gate'), plan: resultOutput(results, 'plan'), draft: finalDraftResult(results).output, review: finalReviewResult(results).output, materialization: resultOutput(results, 'materialize') }),
});
