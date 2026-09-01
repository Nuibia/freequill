import { defineSequentialWorkflow, resultOutput } from '../../runtime/lib/workflow-kit.mjs';
import { selectionOverall } from '../lib/selection-scoring.mjs';

function selected(packageValue) { return packageValue.selection; }

export const workflow = defineSequentialWorkflow({
  id: 'selection', version: 2, title: '完整选题决策', outputArtifactType: 'topic-package',
  steps: [
    { id: 'topic-direction', kind: 'subworkflow', workflow: 'topic-direction@2', input: ({ input, mode }) => ({ ...input, mode: mode === 'classic' ? 'assisted' : mode }) },
    { id: 'premise-selection', kind: 'subworkflow', workflow: 'premise-selection@2', input: ({ input, results, mode }) => ({ ...input, mode: mode === 'classic' ? 'assisted' : mode, topic_direction_artifact_ref: results['topic-direction'].artifact_ref }) },
    { id: 'title-selection', kind: 'subworkflow', workflow: 'title-selection@2', input: ({ input, results, mode }) => ({ ...input, mode: mode === 'classic' ? 'assisted' : mode, premise_artifact_ref: results['premise-selection'].artifact_ref }) },
    {
      id: 'platform-fit', kind: 'capability', capability: 'evaluate-selection-fit@1',
      outputArtifactType: 'selection-fit-evaluation',
      policyRefs: ['policies/selection/overall-scoring.v2.json'],
      isolation: ({ mode }) => ({ required: mode === 'fast', reason: 'Fast 综合适配 Eval 必须隔离' }),
      input: ({ input, results }) => ({ request: input, topic: selected(resultOutput(results, 'topic-direction')), premise: selected(resultOutput(results, 'premise-selection')), title: selected(resultOutput(results, 'title-selection')) }),
    },
    {
      id: 'overall', kind: 'deterministic', outputArtifactType: 'selection-ranking',
      input: ({ results }) => ({ theme: selected(resultOutput(results, 'topic-direction')), premise: selected(resultOutput(results, 'premise-selection')), title: selected(resultOutput(results, 'title-selection')), fit: resultOutput(results, 'platform-fit') }),
      run: ({ input }) => selectionOverall(input),
    },
    {
      id: 'human-decision', kind: 'human_input', when: ({ mode }) => mode === 'classic',
      required: ['approved'], prompt: '请对完整选题包拍板。approved=false 会作为 human_override 记录并阻止签出。',
      input: ({ results }) => ({ overall: resultOutput(results, 'overall'), topic: selected(resultOutput(results, 'topic-direction')), premise: selected(resultOutput(results, 'premise-selection')), title: selected(resultOutput(results, 'title-selection')) }),
    },
    {
      id: 'approval', kind: 'deterministic',
      input: ({ mode, results }) => ({ mode, overall: resultOutput(results, 'overall'), decision: results['human-decision']?.output ?? null }),
      run: ({ input }) => {
        if (input.overall.status !== 'qualified') return { status: 'blocked', reason: input.overall.reason ?? '完整选题未达到签出标准', details: input.overall };
        if (input.mode === 'classic' && input.decision?.approved !== true) return { status: 'blocked', reason: '用户未批准完整选题包', details: { human_override: true, decision: input.decision } };
        return { approved: true, human_override: input.decision?.human_override === true, rationale: input.decision?.rationale ?? null };
      },
    },
  ],
  complete: ({ input, results }) => ({
    request: input,
    topic_direction: resultOutput(results, 'topic-direction'),
    premise: resultOutput(results, 'premise-selection'),
    title: resultOutput(results, 'title-selection'),
    platform_execution_fit: resultOutput(results, 'platform-fit'),
    overall: resultOutput(results, 'overall'),
    approval: resultOutput(results, 'approval'),
  }),
});
