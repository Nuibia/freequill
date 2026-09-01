import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { chooseCandidate, qualifyEvaluations } from '../lib/selection-scoring.mjs';

export const workflow = defineSequentialWorkflow({
  id: 'topic-direction',
  version: 2,
  title: '选题方向与立意',
  outputArtifactType: 'topic-direction-package',
  steps: [
    {
      id: 'generate', kind: 'capability', capability: 'generate-topic-directions@1',
      outputArtifactType: 'topic-direction-candidates',
      policyRefs: ['policies/selection/topic-scoring.v2.json'],
      input: ({ input }) => input,
    },
    {
      id: 'evaluate', kind: 'capability', capability: 'evaluate-topic-directions@1',
      outputArtifactType: 'topic-direction-evaluation',
      policyRefs: ['policies/selection/topic-scoring.v2.json'],
      isolation: ({ mode }) => ({ required: mode === 'fast', reason: 'Fast 关键 Eval 必须隔离' }),
      input: ({ input, results }) => ({ request: input, candidates: resultOutput(results, 'generate').candidates }),
    },
    {
      id: 'qualify', kind: 'deterministic', outputArtifactType: 'topic-direction-ranking',
      input: ({ results }) => ({ candidates: resultOutput(results, 'generate').candidates, evaluations: resultOutput(results, 'evaluate').evaluations }),
      run: ({ input }) => qualifyEvaluations({ kind: 'theme', ...input }),
    },
    {
      id: 'human-decision', kind: 'human_input',
      when: ({ mode }) => mode === 'classic',
      required: ['selected_candidate_id'],
      prompt: '请选择一个已通过硬闸的立意候选；否决推荐项时提交 human_override=true 与理由。',
      input: ({ results }) => ({ ranking: resultOutput(results, 'qualify') }),
    },
    {
      id: 'choose', kind: 'deterministic',
      input: ({ results }) => ({
        candidates: resultOutput(results, 'generate').candidates,
        qualification: resultOutput(results, 'qualify'),
        decision: results['human-decision']?.output ?? null,
      }),
      run: ({ input }) => chooseCandidate(input),
    },
  ],
  complete: ({ input, results }) => ({
    request: input,
    candidates: resultOutput(results, 'generate').candidates,
    evaluations: resultOutput(results, 'evaluate').evaluations,
    ranking: resultOutput(results, 'qualify'),
    selection: resultOutput(results, 'choose'),
  }),
});
