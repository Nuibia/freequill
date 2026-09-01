import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { adjudicate } from '../lib/quality.mjs';

const ROLES = [
  ['logic', 'review-long-logic@1'],
  ['editorial', 'review-long-editorial@1'],
  ['reader', 'review-long-reader@1'],
  ['technique', 'review-long-technique@1'],
  ['commonsense', 'review-long-commonsense@1'],
];

export const workflow = defineSequentialWorkflow({
  id: 'review-long', version: 2, title: '长篇章节五路隔离验稿', outputArtifactType: 'long-review-package',
  steps: [
    ...ROLES.map(([role, capability]) => ({
      id: `review-${role}`, kind: 'capability', capability, outputArtifactType: 'long-role-review',
      policyRefs: ['policies/review/long.v2.json'], isolation: { required: true, reason: '生产验稿必须与起草执行者隔离' },
      input: ({ input }) => ({ role, chapter: input.chapter, book_path: input.book_path ?? null, chapter_number: input.chapter_number, attempt: input.attempt ?? 1 }),
    })),
    {
      id: 'adjudicate', kind: 'deterministic', outputArtifactType: 'long-review-adjudication', input: ({ results }) => results,
      run: ({ input }) => adjudicate(input, ROLES.map(([role]) => `review-${role}`)),
    },
  ],
  complete: ({ input, results }) => ({ request: input, adjudication: resultOutput(results, 'adjudicate') }),
});
