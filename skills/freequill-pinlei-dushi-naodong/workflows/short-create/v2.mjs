import fs from 'node:fs';
import path from 'node:path';
import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { writeWorkFile, writeWorkJson } from '../../runtime/workspace.mjs';

function passed(results, key) { return resultOutput(results, key).verdict === 'PASS'; }
function revisedPlan(results) { return results['plan-revision'] ? resultOutput(results, 'plan-revision') : null; }
function storyEngine(results) { return revisedPlan(results)?.story_engine ?? resultOutput(results, 'story-engine').story_engine; }
function outline(results) { return revisedPlan(results)?.outline ?? resultOutput(results, 'outline').outline; }
function reviewVerdict(results, key) { return resultOutput(results, key).adjudication.verdict; }
function resolutionRequirements(review) {
  const findings = review?.adjudication?.findings ?? [];
  return findings.map((finding, index) => ({
    finding_id: `finding-${String(index + 1).padStart(2, '0')}`,
    finding,
  }));
}
function preservationConstraints(results, priorReviewKeys = []) {
  return {
    rule_id: 'CRAFT-L1-REVISION-001',
    frozen_story_engine: storyEngine(results),
    frozen_outline: outline(results),
    prior_review_findings: priorReviewKeys.flatMap((key) => resultOutput(results, key).adjudication.findings ?? []),
    prior_resolution_reports: ['revision-1'].filter((key) => results[key]).flatMap((key) => resultOutput(results, key).resolution_report ?? []),
    requirements: [
      '只修改当前 findings 要求的最小范围',
      '不得改变冻结故事引擎、能力规则、核心选择和结局承诺',
      '不得重新引入前轮已关闭 finding',
      '输出逐项回归检查报告',
    ],
  };
}
function finalDraftResult(results) { return results['revision-2'] ?? results['revision-1'] ?? results.draft; }
function finalReviewResult(results) { return results['review-3'] ?? results['review-2'] ?? results['review-1']; }
function normalizeDraftPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const chapters = Array.isArray(payload.chapters) ? payload.chapters.map((chapter, index) => ({
    ...chapter,
    number: chapter?.number ?? chapter?.chapter ?? index + 1,
    content: chapter?.content ?? chapter?.body,
  })) : payload.chapters;
  return { ...payload, chapters };
}
function finalDraftPayload(results) { return normalizeDraftPayload(finalDraftResult(results).output); }

function readBookJson(bookPath, relative) {
  const target = path.resolve(bookPath, relative);
  const inside = path.relative(path.resolve(bookPath), target);
  if (inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) throw new Error(`冻结约束路径越界：${relative}`);
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`冻结约束文件缺失或不安全：${relative}`);
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function frozenPlanConstraints(bookPath) {
  const policy = readBookJson(bookPath, '设定/book-policy.json');
  const bible = readBookJson(bookPath, '设定/故事圣经.json');
  const entries = [
    ['book-policy.core-emotion', policy.core_emotion],
    ['story-bible.premise', bible.premise],
    ['story-bible.central-conflict', bible.central_conflict],
    ['story-bible.story-engine', bible.story_engine],
    ['story-bible.ending-promise', bible.ending_promise],
    ...((bible.world_rules ?? []).map((value, index) => [`story-bible.world-rules.${index + 1}`, value])),
    ...Object.entries(bible.ability_rules ?? {}).flatMap(([group, values]) => (values ?? []).map((value, index) => [`story-bible.ability-rules.${group}.${index + 1}`, value])),
  ];
  return entries.map(([constraint_id, statement]) => ({ constraint_id, statement }));
}

function planEvalInput(input, results, revised = false) {
  return {
    book_path: input.book_path,
    genre: input.genre,
    story_engine: revised ? storyEngine(results) : resultOutput(results, 'story-engine').story_engine,
    outline: revised ? outline(results) : resultOutput(results, 'outline').outline,
    frozen_constraints: frozenPlanConstraints(input.book_path),
  };
}

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
    { id: 'story-engine-eval', kind: 'capability', capability: 'evaluate-story-engine@1', outputArtifactType: 'story-engine-evaluation', policyRefs: ['policies/creation/short.v2.json'], isolation: { required: true, reason: '故事引擎必须由隔离执行者评审' }, input: ({ input, results }) => planEvalInput(input, results) },
    { id: 'outline-eval', kind: 'capability', capability: 'evaluate-short-outline@1', outputArtifactType: 'outline-evaluation', policyRefs: ['policies/creation/short.v2.json'], isolation: { required: true, reason: '细纲必须由隔离执行者评审' }, input: ({ input, results }) => planEvalInput(input, results) },
    {
      id: 'plan-revision', kind: 'capability', capability: 'revise-short-plan@1', outputArtifactType: 'short-plan-revision', policyRefs: ['policies/creation/short.v2.json'],
      when: ({ results }) => !passed(results, 'story-engine-eval') || !passed(results, 'outline-eval'),
      input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, story_engine: resultOutput(results, 'story-engine').story_engine, outline: resultOutput(results, 'outline').outline, frozen_constraints: frozenPlanConstraints(input.book_path), evaluations: { story_engine: resultOutput(results, 'story-engine-eval'), outline: resultOutput(results, 'outline-eval') } }),
    },
    { id: 'story-engine-eval-2', kind: 'capability', capability: 'evaluate-story-engine@1', outputArtifactType: 'story-engine-evaluation', policyRefs: ['policies/creation/short.v2.json'], isolation: { required: true, reason: '返修故事引擎必须重新隔离评审' }, when: ({ results }) => Boolean(results['plan-revision']), input: ({ input, results }) => planEvalInput(input, results, true) },
    { id: 'outline-eval-2', kind: 'capability', capability: 'evaluate-short-outline@1', outputArtifactType: 'outline-evaluation', policyRefs: ['policies/creation/short.v2.json'], isolation: { required: true, reason: '返修细纲必须重新隔离评审' }, when: ({ results }) => Boolean(results['plan-revision']), input: ({ input, results }) => planEvalInput(input, results, true) },
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
    { id: 'revision-1', kind: 'capability', capability: 'revise-short-story@1', outputArtifactType: 'short-revision-package', policyRefs: ['policies/creation/short.v2.json'], when: ({ results }) => reviewVerdict(results, 'review-1') === 'FIX_BODY', input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, draft: resultOutput(results, 'draft'), review: resultOutput(results, 'review-1'), required_resolutions: resolutionRequirements(resultOutput(results, 'review-1')), preservation_constraints: preservationConstraints(results), attempt: 1 }) },
    { id: 'review-2', kind: 'subworkflow', workflow: 'review-short@2', when: ({ results }) => Boolean(results['revision-1']), input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, body: resultOutput(results, 'revision-1'), attempt: 2 }) },
    { id: 'revision-2', kind: 'capability', capability: 'revise-short-story@1', outputArtifactType: 'short-revision-package', policyRefs: ['policies/creation/short.v2.json'], when: ({ results }) => Boolean(results['review-2']) && reviewVerdict(results, 'review-2') === 'FIX_BODY', input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, draft: resultOutput(results, 'revision-1'), review: resultOutput(results, 'review-2'), required_resolutions: resolutionRequirements(resultOutput(results, 'review-2')), preservation_constraints: preservationConstraints(results, ['review-1']), attempt: 2 }) },
    { id: 'review-3', kind: 'subworkflow', workflow: 'review-short@2', when: ({ results }) => Boolean(results['revision-2']), input: ({ input, results }) => ({ book_path: input.book_path, genre: input.genre, body: resultOutput(results, 'revision-2'), attempt: 3 }) },
    {
      id: 'review-gate', kind: 'deterministic', input: ({ results }) => finalReviewResult(results).output.adjudication,
      run: ({ input }) => input.verdict === 'PASS' ? { passed: true } : { status: 'blocked', reason: '短篇三轮隔离验稿后仍未通过', details: input },
    },
    {
      id: 'materialize', kind: 'deterministic', outputArtifactType: 'short-materialization', allowedSideEffects: ['workspace_write'],
      input: ({ input, results }) => ({ book_path: input.book_path, story_engine: storyEngine(results), outline: outline(results), draft: finalDraftPayload(results) }),
      run: ({ input }) => materialize(input),
    },
  ],
  complete: ({ input, results }) => ({ book_path: input.book_path, story_engine: storyEngine(results), outline: outline(results), draft: finalDraftPayload(results), review: finalReviewResult(results).output, materialization: resultOutput(results, 'materialize') }),
});
