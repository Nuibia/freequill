import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { adjudicate } from '../lib/quality.mjs';

const ROLES = [
  ['logic', 'review-short-logic@1'],
  ['platform', 'review-short-platform@1'],
  ['reader', 'review-short-reader@1'],
  ['technique', 'review-short-technique@1'],
  ['commonsense', 'review-short-commonsense@1'],
];

export const workflow = defineSequentialWorkflow({
  id: 'review-short', version: 2, title: '短篇五路隔离验稿', outputArtifactType: 'short-review-package',
  steps: [
    ...ROLES.map(([role, capability]) => ({
      id: `review-${role}`, kind: 'capability', capability, outputArtifactType: 'short-role-review',
      policyRefs: ['policies/review/short.v2.json'], isolation: { required: true, reason: '生产验稿必须与起草执行者隔离', cold_read: role === 'reader', phases: role === 'reader' ? ['body-only', 'freeze-cold-read', 'context-review'] : ['context-review'] },
      input: ({ input }) => ({ role, body: input.body, book_path: input.book_path ?? null, genre: input.genre ?? null, attempt: input.attempt ?? 1 }),
    })),
    {
      id: 'adjudicate', kind: 'deterministic', outputArtifactType: 'short-review-adjudication', input: ({ results }) => results,
      run: ({ input }) => adjudicate(input, ROLES.map(([role]) => `review-${role}`)),
    },
  ],
  complete: ({ input, results }) => ({ request: input, adjudication: resultOutput(results, 'adjudicate') }),
});
