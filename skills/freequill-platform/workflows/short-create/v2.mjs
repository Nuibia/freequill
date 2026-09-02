import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { writeWorkFile, writeWorkJson } from '../../runtime/workspace.mjs';

function passed(results, key) { return resultOutput(results, key).verdict === 'PASS'; }
function revisedPlan(results) { return results['plan-revision'] ? resultOutput(results, 'plan-revision') : null; }
function storyEngine(results) { return revisedPlan(results)?.story_engine ?? resultOutput(results, 'story-engine').story_engine; }
function outline(results) { return revisedPlan(results)?.outline ?? resultOutput(results, 'outline').outline; }
function reviewVerdict(results, key) { return resultOutput(results, key).adjudication.verdict; }
function finalDraftResult(results) { return results['revision-2'] ?? results['revision-1'] ?? results.draft; }
function finalReviewResult(results) { return results['review-3'] ?? results['review-2'] ?? results['review-1']; }

function materialize(input) {
  const chapters = input.draft?.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) return { status: 'blocked', reason: '短篇起草结果缺少 chapters' };
  try {
    writeWorkJson(input.book_path, '设定/故事引擎.json', input.story_engine);
    writeWorkJson(input.book_path, '设定/细纲.json', input.outline);
    chapters.forEach((chapter, index) => {
      if (typeof chapter?.content !== 'string' || !chapter.content.trim()) throw new Error(`第 ${index + 1} 章正文为空`);
      const number = String(chapter.number ?? index + 1).padStart(2, '0');
      const heading = chapter.title ? `# ${chapter.title}\n\n` : '';
      writeWorkFile(input.book_path, `正文/${number}.md`, `${heading}${chapter.content.trim()}\n`);
    });
    writeWorkFile(input.book_path, '连载进度.md', `# 创作进度\n\n- 状态：短篇正文已完成并通过隔离验稿\n- 章节数：${chapters.length}\n`, { allowReplace: true });
    return { written: true, book_path: input.book_path, chapter_count: chapters.length };
  } catch (error) {
    return { status: 'blocked', reason: '短篇正文落盘失败', details: { message: error.message } };
  }
}

export const workflow = defineSequentialWorkflow({
  id: 'short-create', version: 2, title: '短篇创作与验稿', outputArtifactType: 'short-delivery',
  steps: [
    { id: 'story-engine', kind: 'capability', capability: 'build-story-engine@1', outputArtifactType: 'story-engine-package', policyRefs: ['policies/creation/short.v2.json'], input: ({ input }) => input },
    { id: 'outline', kind: 'capability', capability: 'build-short-outline@1', outputArtifactType: 'short-outline-package', policyRefs: ['policies/creation/short.v2.json'], input: ({ input, results }) => ({ ...input, story_engine: resultOutput(results, 'story-engine').story_engine }) },
    { id: 'story-engine-eval', kind: 'capability', capability: 'evaluate-story-engine@1', outputArtifactType: 'story-engine-evaluation', policyRefs: ['policies/creation/short.v2.json'], isolation: { required: true, reason: '故事引擎必须由隔离执行者评审' }, input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, story_engine: resultOutput(results, 'story-engine').story_engine, outline: resultOutput(results, 'outline').outline }) },
    { id: 'outline-eval', kind: 'capability', capability: 'evaluate-short-outline@1', outputArtifactType: 'outline-evaluation', policyRefs: ['policies/creation/short.v2.json'], isolation: { required: true, reason: '细纲必须由隔离执行者评审' }, input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, story_engine: resultOutput(results, 'story-engine').story_engine, outline: resultOutput(results, 'outline').outline }) },
    {
      id: 'plan-revision', kind: 'capability', capability: 'revise-short-plan@1', outputArtifactType: 'short-plan-revision', policyRefs: ['policies/creation/short.v2.json'],
      when: ({ results }) => !passed(results, 'story-engine-eval') || !passed(results, 'outline-eval'),
      input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, story_engine: resultOutput(results, 'story-engine').story_engine, outline: resultOutput(results, 'outline').outline, evaluations: { story_engine: resultOutput(results, 'story-engine-eval'), outline: resultOutput(results, 'outline-eval') } }),
    },
    { id: 'story-engine-eval-2', kind: 'capability', capability: 'evaluate-story-engine@1', outputArtifactType: 'story-engine-evaluation', policyRefs: ['policies/creation/short.v2.json'], isolation: { required: true, reason: '返修故事引擎必须重新隔离评审' }, when: ({ results }) => Boolean(results['plan-revision']), input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, story_engine: storyEngine(results), outline: outline(results) }) },
    { id: 'outline-eval-2', kind: 'capability', capability: 'evaluate-short-outline@1', outputArtifactType: 'outline-evaluation', policyRefs: ['policies/creation/short.v2.json'], isolation: { required: true, reason: '返修细纲必须重新隔离评审' }, when: ({ results }) => Boolean(results['plan-revision']), input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, story_engine: storyEngine(results), outline: outline(results) }) },
    {
      id: 'plan-gate', kind: 'deterministic', outputArtifactType: 'short-plan-gate', input: ({ results }) => ({ story: resultOutput(results, results['story-engine-eval-2'] ? 'story-engine-eval-2' : 'story-engine-eval'), outline: resultOutput(results, results['outline-eval-2'] ? 'outline-eval-2' : 'outline-eval') }),
      run: ({ input }) => input.story.verdict === 'PASS' && input.outline.verdict === 'PASS' ? { passed: true } : { status: 'blocked', reason: '故事引擎或细纲返修后仍未通过', details: input },
    },
    { id: 'human-outline-approval', kind: 'human_input', when: ({ mode }) => mode !== 'fast', required: ['approved'], prompt: '请确认细纲。approved=true 后才进入正文起草。', input: ({ results }) => ({ story_engine: storyEngine(results), outline: outline(results) }) },
    {
      id: 'approval-gate', kind: 'deterministic', input: ({ mode, results }) => ({ mode, decision: results['human-outline-approval']?.output ?? null }),
      run: ({ input }) => input.mode === 'fast' || input.decision?.approved === true ? { passed: true } : { status: 'blocked', reason: '用户尚未批准细纲' },
    },
    { id: 'draft', kind: 'capability', capability: 'draft-short-story@1', outputArtifactType: 'short-draft-package', policyRefs: ['policies/creation/short.v2.json'], input: ({ input, results }) => ({ request: input, story_engine: storyEngine(results), outline: outline(results) }) },
    { id: 'review-1', kind: 'subworkflow', workflow: 'review-short@2', input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, body: resultOutput(results, 'draft'), attempt: 1 }) },
    { id: 'revision-1', kind: 'capability', capability: 'revise-short-story@1', outputArtifactType: 'short-revision-package', policyRefs: ['policies/creation/short.v2.json'], when: ({ results }) => reviewVerdict(results, 'review-1') === 'FIX_BODY', input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, draft: resultOutput(results, 'draft'), review: resultOutput(results, 'review-1'), attempt: 1 }) },
    { id: 'review-2', kind: 'subworkflow', workflow: 'review-short@2', when: ({ results }) => Boolean(results['revision-1']), input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, body: resultOutput(results, 'revision-1'), attempt: 2 }) },
    { id: 'revision-2', kind: 'capability', capability: 'revise-short-story@1', outputArtifactType: 'short-revision-package', policyRefs: ['policies/creation/short.v2.json'], when: ({ results }) => Boolean(results['review-2']) && reviewVerdict(results, 'review-2') === 'FIX_BODY', input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, draft: resultOutput(results, 'revision-1'), review: resultOutput(results, 'review-2'), attempt: 2 }) },
    { id: 'review-3', kind: 'subworkflow', workflow: 'review-short@2', when: ({ results }) => Boolean(results['revision-2']), input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, body: resultOutput(results, 'revision-2'), attempt: 3 }) },
    {
      id: 'review-gate', kind: 'deterministic', input: ({ results }) => finalReviewResult(results).output.adjudication,
      run: ({ input }) => input.verdict === 'PASS' ? { passed: true } : { status: 'blocked', reason: '短篇三轮隔离验稿后仍未通过', details: input },
    },
    {
      id: 'materialize', kind: 'deterministic', outputArtifactType: 'short-materialization', allowedSideEffects: ['workspace_write'],
      input: ({ input, results }) => ({ book_path: input.book_path, story_engine: storyEngine(results), outline: outline(results), draft: finalDraftResult(results).output }),
      run: ({ input }) => materialize(input),
    },
  ],
  complete: ({ input, results }) => ({ book_path: input.book_path, story_engine: storyEngine(results), outline: outline(results), draft: finalDraftResult(results).output, review: finalReviewResult(results).output, materialization: resultOutput(results, 'materialize') }),
});
