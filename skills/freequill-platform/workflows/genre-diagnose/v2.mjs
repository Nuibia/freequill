import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';

const GENRES = new Set(['dushi-naodong', 'xuanhuan', 'guyan', 'xianyan']);

export const workflow = defineSequentialWorkflow({
  id: 'genre-diagnose', version: 2, title: '品类写法诊断', outputArtifactType: 'genre-diagnosis-package',
  steps: [
    {
      id: 'genre-gate', kind: 'deterministic', outputArtifactType: 'genre-input', input: ({ input }) => input,
      run: ({ input }) => GENRES.has(input.genre)
        ? { passed: true, ...input }
        : { status: 'needs_input', required: ['genre'], reason: 'genre 只支持 dushi-naodong、xuanhuan、guyan、xianyan' },
    },
    {
      id: 'diagnose', kind: 'capability', capability: 'diagnose-genre@1', outputArtifactType: 'genre-diagnosis',
      policyRefs: ({ results }) => [`policies/genre/${resultOutput(results, 'genre-gate').genre}.v2.json`],
      input: ({ results }) => resultOutput(results, 'genre-gate'),
    },
  ],
  complete: ({ results }) => resultOutput(results, 'diagnose'),
});
